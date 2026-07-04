#!/usr/bin/env python3
"""Morning ntfy digest: last 24h of homelab facts, summarized by the LLM.
Falls back to a plain templated digest on any LLM failure - a digest must always arrive."""
import json
import os

import requests

import ops_agent as oa

DIGEST_TIMEOUT = 120  # model may be cold/evicted at 08:00

DIGEST_PROMPT = (
    "Write a short (max 6 lines) morning summary of this homelab's last 24 hours for a phone "
    "notification, in English. Use ONLY the numbers in the JSON below; do not invent anything; "
    "omit sections with no data. Lead with problems if there are any, otherwise start by saying "
    "all is well. No markdown headers, plain lines only.\n\nFACTS: "
)


def gather_facts():
    facts = {}

    def grab(key, fn, *args):
        try:
            facts[key] = fn(*args)
        except Exception as e:
            facts[key] = {"error": str(e)[:100]}

    grab("cpu_mem_trend_24h", oa.get_metric_trend, 24)
    grab("state_changes_24h", oa.get_health_history, 24)
    grab("active_alerts", oa.get_active_alerts)
    grab("gpu", oa.get_gpu_status)
    try:
        pools = oa.get_storage_status()
        facts["storage_pools_over_75pct"] = [p for p in pools if (p.get("percent_used") or 0) >= 75] or "none"
    except Exception as e:
        facts["storage_pools_over_75pct"] = {"error": str(e)[:100]}
    try:
        containers = oa.get_docker_containers()
        if isinstance(containers, list):
            running = [c for c in containers if c["state"] == "running"]
            unhealthy = [c["name"] for c in containers if c.get("health") == "unhealthy"]
            facts["containers"] = {"running": len(running), "total": len(containers), "unhealthy": unhealthy or "none"}
        else:
            facts["containers"] = containers
    except Exception as e:
        facts["containers"] = {"error": str(e)[:100]}
    return facts


def llm_digest(facts):
    resp = requests.post(
        oa.OLLAMA_URL,
        json={
            "model": oa.MODEL,
            "messages": [{"role": "user", "content": DIGEST_PROMPT + json.dumps(facts)}],
            "stream": False,
            "options": {"temperature": 0.1},
        },
        timeout=DIGEST_TIMEOUT,
    )
    resp.raise_for_status()
    text = resp.json()["message"]["content"].strip()
    if not text:
        raise ValueError("empty LLM reply")
    return text


def template_digest(facts):
    lines = []
    alerts = facts.get("active_alerts")
    if isinstance(alerts, list) and alerts:
        lines.append(f"{len(alerts)} active alert(s): " + "; ".join(a.get("summary") or a.get("alertname") or "?" for a in alerts[:3]))
    changes = facts.get("state_changes_24h")
    if isinstance(changes, list) and changes:
        lines.append(f"{len(changes)} state change(s) in 24h, latest: {changes[-1]['entity']} {changes[-1]['change']}")
    trend = facts.get("cpu_mem_trend_24h", {})
    cpu, mem = trend.get("cpu_percent"), trend.get("mem_percent")
    if cpu and mem:
        lines.append(f"CPU avg {cpu['avg']}% max {cpu['max']}% - RAM avg {mem['avg']}% max {mem['max']}%")
    cont = facts.get("containers", {})
    if isinstance(cont, dict) and "running" in cont:
        unh = cont["unhealthy"]
        lines.append(f"Containers: {cont['running']}/{cont['total']} running" + (f", unhealthy: {', '.join(unh)}" if isinstance(unh, list) else ""))
    pools = facts.get("storage_pools_over_75pct")
    if isinstance(pools, list) and pools:
        lines.append("Storage over 75%: " + ", ".join(f"{p['storage']} {p['percent_used']}%" for p in pools))
    return "\n".join(lines) or "No data available for the last 24 hours."


def main():
    facts = gather_facts()
    try:
        text = llm_digest(facts)
    except Exception:
        text = template_digest(facts)
    if len(text) > 800:
        text = text[:800] + "…"
    problems = (isinstance(facts.get("active_alerts"), list) and facts["active_alerts"]) or (
        isinstance(facts.get("containers"), dict) and isinstance(facts["containers"].get("unhealthy"), list)
    )
    # ASCII-only title: ntfy titles travel as HTTP headers (latin-1), non-ASCII gets mangled
    oa.notify_ntfy("Homelab - dnevni pregled", text, "default", "newspaper" if not problems else "warning")
    print(text)


if __name__ == "__main__":
    main()
