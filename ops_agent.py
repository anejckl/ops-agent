#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import time
import requests

PROXMOX_HOST = "192.168.1.77"
PROXMOX_TOKEN = "REDACTED_TOKEN"
PROXMOX_NODE = "pve"
OLLAMA_URL = "http://192.168.1.136:11434/api/chat"
MODEL = "qwen2.5:7b"
DOCKER_VM_HOST = "192.168.1.136"
DOCKER_RO_KEY = "/root/.ssh/docker_ro_key"
PROMETHEUS_URL = "http://192.168.1.136:9090"
HEALTH_HISTORY_PATH = "/root/webapp/health_history.jsonl"

PVE_HEADERS = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}


def notify_ntfy(title: str, body: str, priority: str = "default", tags: str = "bell"):
    """Best-effort push notification via the self-hosted ntfy server. Never raises."""
    url, topic, token = os.environ.get("NTFY_URL"), os.environ.get("NTFY_TOPIC"), os.environ.get("NTFY_TOKEN")
    if not (url and topic and token):
        return
    try:
        requests.post(
            f"{url}/{topic}",
            data=body.encode("utf-8"),
            headers={"Title": title, "Priority": priority, "Tags": tags, "Authorization": f"Bearer {token}"},
            timeout=5,
        )
    except requests.RequestException:
        pass


def pve_get(path):
    r = requests.get(f"https://{PROXMOX_HOST}:8006/api2/json{path}", headers=PVE_HEADERS, verify=False, timeout=10)
    r.raise_for_status()
    return r.json()["data"]


def list_vms():
    """List all VMs and LXC containers with their status, vmid, and type."""
    vms = pve_get(f"/nodes/{PROXMOX_NODE}/qemu")
    cts = pve_get(f"/nodes/{PROXMOX_NODE}/lxc")
    out = []
    for v in vms:
        out.append({"vmid": v["vmid"], "name": v["name"], "type": "vm", "status": v["status"]})
    for c in cts:
        out.append({"vmid": c["vmid"], "name": c["name"], "type": "lxc", "status": c["status"]})
    return out


def get_vm_disk_usage_gb(vmid: int):
    """For a QEMU VM only (not LXC): query the actual guest filesystem usage via qemu-guest-agent, since status/current cannot report this for VMs. Returns None if the guest agent is not installed/running."""
    try:
        fs = pve_get(f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/agent/get-fsinfo")["result"]
    except requests.HTTPError:
        return None
    real_mounts = [d for d in fs if d.get("type") != "squashfs" and not d.get("name", "").startswith("loop")]
    total = sum(d["total-bytes"] for d in real_mounts)
    used = sum(d["used-bytes"] for d in real_mounts)
    return {"disk_total_gb": round(total / 1024**3, 1), "disk_used_gb": round(used / 1024**3, 1), "disk_free_gb": round((total - used) / 1024**3, 1)}


def get_vm_status(vmid: int):
    """Get detailed CPU, memory, and REAL disk usage (via guest agent for VMs) for a specific, NAMED VM or LXC container by its vmid. ALWAYS use this tool (not get_node_status or get_storage_status) whenever the user asks about a specific VM/LXC by name (e.g. 'docker-vm', 'ops-agent', 'vpn-gateway') - if you only know the name, call list_vms first to find its vmid, then call this. get_node_status and get_storage_status are about the Proxmox HOST machine and its shared storage pools as a whole, NOT about any individual VM's own resource usage."""
    try:
        s = pve_get(f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/current")
        kind = "vm"
        real_disk = get_vm_disk_usage_gb(vmid)
    except requests.HTTPError:
        try:
            s = pve_get(f"/nodes/{PROXMOX_NODE}/lxc/{vmid}/status/current")
            kind = "lxc"
            real_disk = None
        except requests.HTTPError:
            return {"error": f"No VM or LXC container with vmid={vmid} exists on this Proxmox node. Note: Docker containers running inside a VM (like Frigate, Ollama, ComfyUI, Jellyfin) are NOT separate Proxmox VMs/containers and cannot be queried this way - they all live inside VM 100 (docker-vm). Use list_vms to see actual Proxmox VM/LXC ids."}
    result = {
        "vmid": vmid,
        "type": kind,
        "name": s.get("name"),
        "status": s.get("status"),
        "cpu_percent": round(s.get("cpu", 0) * 100, 1),
        "cpus": s.get("cpus"),
        "mem_used_mb": round(s.get("mem", 0) / 1024 / 1024, 1),
        "mem_max_mb": round(s.get("maxmem", 0) / 1024 / 1024, 1),
        "disk_used_gb": round(s.get("disk", 0) / 1024 / 1024 / 1024, 2),
        "disk_max_gb": round(s.get("maxdisk", 0) / 1024 / 1024 / 1024, 2),
        "uptime_hours": round(s.get("uptime", 0) / 3600, 1),
    }
    if real_disk:
        result["note"] = "disk_used_gb/disk_max_gb above are unreliable for VMs (Proxmox limitation); use real_disk_free_gb/real_disk_total_gb instead"
        result["real_disk_total_gb"] = real_disk["disk_total_gb"]
        result["real_disk_used_gb"] = real_disk["disk_used_gb"]
        result["real_disk_free_gb"] = real_disk["disk_free_gb"]
    return result


def compare_vms(names: list):
    """Compare CPU, memory, and disk stats for TWO OR MORE named VMs/LXC containers side by side, e.g. names=['docker-vm', 'ops-agent']. ALWAYS use this instead of calling get_vm_status multiple times yourself whenever the user wants to compare named VMs - this tool resolves each name to its correct vmid and returns clearly-labeled results in Python, removing any risk of mixing up which stat belongs to which VM."""
    vms = list_vms()
    name_to_vmid = {v["name"]: v["vmid"] for v in vms}
    results = []
    for name in names:
        vmid = name_to_vmid.get(name)
        if vmid is None:
            results.append({"requested_name": name, "error": f"No VM/LXC named '{name}' found. Available VM/LXC names: {list(name_to_vmid.keys())}"})
        else:
            results.append(get_vm_status(vmid))
    return results


def get_storage_status():
    """Get usage of the shared Proxmox storage POOLS (local, local-lvm, media-storage, etc.) as a whole - these are the underlying disks the Proxmox host manages, not any single VM's own disk usage. If the user asks how much disk space a SPECIFIC named VM/LXC (e.g. 'docker-vm') has or is using, use get_vm_status instead - do not answer a VM-specific question with pool-level numbers."""
    pools = pve_get(f"/nodes/{PROXMOX_NODE}/storage")
    return [
        {
            "storage": p["storage"],
            "type": p["type"],
            "used_gb": round(p.get("used", 0) / 1024 / 1024 / 1024, 1),
            "total_gb": round(p.get("total", 0) / 1024 / 1024 / 1024, 1),
            "percent_used": round(100 * p.get("used", 0) / p["total"], 1) if p.get("total") else None,
        }
        for p in pools
    ]


def get_node_status():
    """Get the physical Proxmox HOST machine's own CPU, memory, and load status (the bare-metal server itself, not any individual VM running on it). Only use this for questions about the host/node overall - if the user names a specific VM/LXC (e.g. 'docker-vm'), use get_vm_status for that VM instead, do not answer with these host-wide numbers."""
    s = pve_get(f"/nodes/{PROXMOX_NODE}/status")
    return {
        "cpu_percent": round(s.get("cpu", 0) * 100, 1),
        "mem_used_gb": round(s["memory"]["used"] / 1024 / 1024 / 1024, 1),
        "mem_total_gb": round(s["memory"]["total"] / 1024 / 1024 / 1024, 1),
        "loadavg": s.get("loadavg"),
        "uptime_hours": round(s.get("uptime", 0) / 3600, 1),
    }


def get_docker_containers():
    """List all Docker containers running inside docker-vm (Proxmox VM 100) with name, image, running state, health, and uptime. Frigate, Ollama, ComfyUI, Jellyfin, Nextcloud, Radarr, Sonarr, etc. are all Docker containers inside this one VM, not separate Proxmox VMs/LXCs - use this tool (not get_vm_status) to check on any of them specifically."""
    try:
        result = subprocess.run(
            ["ssh", "-i", DOCKER_RO_KEY, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=5", f"docker@{DOCKER_VM_HOST}"],
            capture_output=True, text=True, timeout=15,
        )
    except subprocess.TimeoutExpired:
        return {"error": "Timed out connecting to docker-vm"}
    if result.returncode != 0:
        return {"error": f"SSH to docker-vm failed: {result.stderr.strip()}"}
    containers = []
    for line in result.stdout.strip().splitlines():
        if not line:
            continue
        c = json.loads(line)
        containers.append({
            "name": c.get("Names"),
            "image": c.get("Image"),
            "state": c.get("State"),
            "status": c.get("Status"),
            "health": c.get("HealthStatus"),
        })
    return containers


CPU_QUERY = '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
MEM_QUERY = '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))'


def _prom_range_raw(query, hours, step_seconds):
    end = time.time()
    start = end - hours * 3600
    r = requests.get(
        f"{PROMETHEUS_URL}/api/v1/query_range",
        params={"query": query, "start": start, "end": end, "step": step_seconds},
        timeout=15,
    )
    r.raise_for_status()
    result = r.json()["data"]["result"]
    return result[0]["values"] if result else None


def _prom_range(query, hours, step_seconds=300):
    values = _prom_range_raw(query, hours, step_seconds)
    if values is None:
        return None
    nums = [float(v[1]) for v in values]
    return {"min": round(min(nums), 1), "avg": round(sum(nums) / len(nums), 1), "max": round(max(nums), 1), "samples": len(nums)}


def _prom_series(query, hours, step_seconds=300):
    """Raw [timestamp, value] points for a Prometheus range query - for drawing a trend line, unlike _prom_range's min/avg/max summary."""
    values = _prom_range_raw(query, hours, step_seconds)
    if values is None:
        return None
    return [[v[0], round(float(v[1]), 2)] for v in values]


def _prom_instant(query):
    try:
        r = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": query}, timeout=10)
        r.raise_for_status()
        result = r.json()["data"]["result"]
        return float(result[0]["value"][1]) if result else None
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return None


def get_metric_trend(hours: int = 24):
    """Get CPU and memory usage TRENDS (min/avg/max over the period) for docker-vm's host over the last N hours, using Prometheus historical data. Use this for questions like 'how was performance last night/week' rather than get_node_status which is only current/live."""
    cpu = _prom_range(CPU_QUERY, hours)
    mem = _prom_range(MEM_QUERY, hours)
    if cpu is None and mem is None:
        return {"error": f"No Prometheus data available for the last {hours} hours (may be outside retention or Prometheus was down)."}
    return {"period_hours": hours, "cpu_percent": cpu, "mem_percent": mem}


def get_trend_series(hours: int = 4, step_seconds: int = 300):
    """Raw CPU/mem trend series for docker-vm's host, for rendering a sparkline - not a chat tool, used by the dashboard's /api/health."""
    return {"cpu": _prom_series(CPU_QUERY, hours, step_seconds), "mem": _prom_series(MEM_QUERY, hours, step_seconds)}


# step sizes chosen so every range renders as a sane number of sparkline points (~48-96)
TREND_STEPS = {4: 300, 24: 900, 168: 7200}

CONTAINER_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$")


def _clamp_trend_hours(hours):
    return hours if hours in TREND_STEPS else 4


def get_guest_trend(vmid: int, guest_type: str, hours: int = 4):
    """CPU%/mem% history for one VM or LXC from pve-exporter metrics - dashboard drill-down helper, not a chat tool."""
    hours = _clamp_trend_hours(hours)
    step = TREND_STEPS[hours]
    pid = f"{'qemu' if guest_type == 'vm' else 'lxc'}/{int(vmid)}"
    cpu = _prom_series(f'pve_cpu_usage_ratio{{id="{pid}"}} * 100', hours, step)
    mem = _prom_series(f'100 * pve_memory_usage_bytes{{id="{pid}"}} / pve_memory_size_bytes{{id="{pid}"}}', hours, step)
    return {"cpu": cpu, "mem": mem}


def get_container_trend(name: str, hours: int = 4):
    """CPU (% of one core, can exceed 100) / memory (MB - compose sets no limits, so % is meaningless) history for one Docker container from cAdvisor - dashboard drill-down helper, not a chat tool. Returns None for names that fail validation (guards PromQL label injection)."""
    if not CONTAINER_NAME_RE.match(name or ""):
        return None
    hours = _clamp_trend_hours(hours)
    step = TREND_STEPS[hours]
    cpu = _prom_series(f'sum by (name) (rate(container_cpu_usage_seconds_total{{name="{name}"}}[5m])) * 100', hours, step)
    mem = _prom_series(f'container_memory_working_set_bytes{{name="{name}"}} / 1048576', hours, step)
    return {"cpu": cpu, "mem": mem}


def get_recent_events(hours: int = 24, entity: str = None):
    """State-change events as a plain newest-first list (possibly empty) - dashboard helper; get_health_history keeps its chat-oriented dict returns."""
    events = get_health_history(hours)
    if not isinstance(events, list):
        return []
    if entity:
        events = [e for e in events if e["entity"] in (f"vm:{entity}", f"container:{entity}")]
    return list(reversed(events))


def get_gpu_status():
    """Get the RTX 3060 GPU's current utilization %, temperature, and VRAM used/total - the GPU is shared across Frigate, Ollama, and ComfyUI on docker-vm. Use this for any question about GPU load, temperature, or VRAM."""
    util = _prom_instant("nvidia_smi_utilization_gpu_ratio")
    temp = _prom_instant("nvidia_smi_temperature_gpu")
    mem_used = _prom_instant("nvidia_smi_memory_used_bytes")
    mem_total = _prom_instant("nvidia_smi_memory_total_bytes")
    if util is None and temp is None:
        return {"error": "No GPU metrics available (gpu-exporter may be down)."}
    return {
        "utilization_percent": round(util * 100, 1) if util is not None else None,
        "temperature_c": round(temp, 1) if temp is not None else None,
        "mem_used_gb": round(mem_used / 1024**3, 2) if mem_used is not None else None,
        "mem_total_gb": round(mem_total / 1024**3, 2) if mem_total is not None else None,
    }


def get_health_history(hours: int = 24):
    """Get a log of container/VM STATE CHANGES (e.g. became unhealthy, went down, came back) over the last N hours. Use this for questions like 'has anything gone wrong recently' or 'when did X become unhealthy' - this is NOT in Prometheus, it's a separate lightweight recorder for this homelab."""
    if not os.path.exists(HEALTH_HISTORY_PATH):
        return {"error": "No history recorded yet."}
    cutoff = time.time() - hours * 3600
    events = []
    with open(HEALTH_HISTORY_PATH) as f:
        for line in f:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if e.get("ts_unix", 0) >= cutoff:
                events.append({"time": e["time"], "entity": e["entity"], "change": e["change"]})
    return events or {"info": f"No state changes recorded in the last {hours} hours - everything has been stable."}


TOOLS = {
    "list_vms": list_vms,
    "get_vm_status": get_vm_status,
    "compare_vms": compare_vms,
    "get_storage_status": get_storage_status,
    "get_node_status": get_node_status,
    "get_docker_containers": get_docker_containers,
    "get_metric_trend": get_metric_trend,
    "get_health_history": get_health_history,
    "get_gpu_status": get_gpu_status,
}

TOOL_SCHEMAS = [
    {"type": "function", "function": {"name": "list_vms", "description": list_vms.__doc__, "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_vm_status", "description": get_vm_status.__doc__, "parameters": {"type": "object", "properties": {"vmid": {"type": "integer", "description": "The VM or container ID"}}, "required": ["vmid"]}}},
    {"type": "function", "function": {"name": "compare_vms", "description": compare_vms.__doc__, "parameters": {"type": "object", "properties": {"names": {"type": "array", "items": {"type": "string"}, "description": "The VM/LXC names to compare, e.g. ['docker-vm', 'ops-agent']"}}, "required": ["names"]}}},
    {"type": "function", "function": {"name": "get_storage_status", "description": get_storage_status.__doc__, "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_node_status", "description": get_node_status.__doc__, "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_docker_containers", "description": get_docker_containers.__doc__, "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_metric_trend", "description": get_metric_trend.__doc__, "parameters": {"type": "object", "properties": {"hours": {"type": "integer", "description": "How many hours back to look, e.g. 24 for a day, 168 for a week"}}}}},
    {"type": "function", "function": {"name": "get_health_history", "description": get_health_history.__doc__, "parameters": {"type": "object", "properties": {"hours": {"type": "integer", "description": "How many hours back to look"}}}}},
    {"type": "function", "function": {"name": "get_gpu_status", "description": get_gpu_status.__doc__, "parameters": {"type": "object", "properties": {}}}},
]


SYSTEM_PROMPT = (
    "You are a read-only homelab assistant for a Proxmox host running VMs, LXC containers, and Docker containers. "
    "Use the available tools to answer questions about VMs, containers, storage, and node status. "
    "CRITICAL - YOU ARE READ-ONLY, YOU CANNOT TAKE ANY ACTION: you have no ability whatsoever to restart, stop, start, delete, "
    "modify, resize, fix, or change ANYTHING - all of your tools only read/report information. If the user asks you to perform "
    "an action (e.g. 'restart X', 'stop Y', 'fix Z', 'delete W'), you MUST clearly tell them you cannot do this and can only "
    "report information - NEVER claim, imply, describe, or pretend that you performed, are performing, or will perform any "
    "action. Do not output fake command sequences or 'steps I'm taking' - you are not taking any steps, only reporting. "
    "CRITICAL - UNKNOWN ENTITIES: if the user asks about a specific named VM/LXC/container that does not appear in the results "
    "of list_vms or get_docker_containers, you MUST tell them plainly that no such VM/container was found - list the real "
    "names that do exist if helpful. NEVER silently answer about a different, similarly-named entity instead without saying so. "
    "CRITICAL - NEVER FABRICATE DATA: every specific number, container name, image tag, date, or status you state must come "
    "directly from a tool call result. Do not guess or invent a plausible-looking answer. "
    "CRITICAL - ALWAYS CALL TOOLS FRESH: for every single user message, call the relevant tool(s) again to get current, verified "
    "data - do NOT rely on your memory of a tool result from earlier in this conversation, even if it feels redundant. Re-calling "
    "a tool is always safe and always preferred over answering from memory or guessing. If a follow-up question is vague "
    "(e.g. 'more detail', 'tell me more'), call the most relevant tool(s) again rather than padding out an answer with made-up "
    "figures, fake container images, or invented dates/history just to sound thorough. "
    "It is always better to say 'I don't have that information' than to make something up. "
    "CRITICAL - LONG LISTS: when listing MULTIPLE containers or VMs at once (more than 2-3), report ONLY the name, running "
    "state, and health/status for each one. Do NOT restate exact image tags/versions/uptime numbers for a full list - those "
    "long exact strings are easy to misremember when reproducing many at once, which produces wrong information. Only give the "
    "full exact details (image tag, precise uptime, etc.) when the user asks about ONE specific, named container. "
    "CRITICAL - RIGHT SCOPE: if the user names a specific VM/LXC/container (e.g. 'docker-vm', 'ops-agent'), your answer must be "
    "about THAT specific entity, using get_vm_status (resolving the name via list_vms first if needed) or get_docker_containers "
    "- never substitute get_node_status (the physical host) or get_storage_status (shared pools) data when a specific named "
    "VM/container was asked about, even though the numbers from those tools are real - they answer a different question. "
    "CRITICAL - MULTI-ENTITY COMPARISONS: when comparing two or more named VMs/LXCs in one answer, ALWAYS use the compare_vms "
    "tool (pass all the names in one call) instead of calling get_vm_status yourself multiple times or guessing vmids - "
    "compare_vms resolves names correctly and prevents mixing up which stat belongs to which VM. "
    "CRITICAL - NAME MATCHING: users often say a short/partial name instead of the exact one - e.g. 'prometheus' means the "
    "container named 'docker-prometheus-1', 'frigate' means 'docker-frigate-1'. Most services (frigate, jellyfin, ollama, "
    "grafana, prometheus, homarr, etc.) are DOCKER CONTAINERS, not separate Proxmox VMs/LXCs - if a name isn't an exact match "
    "in list_vms/compare_vms, ALWAYS also check get_docker_containers for a partial/substring match before saying you can't "
    "find it or giving a vague non-answer. Never suggest the user go check a web UI, SSH, or run a shell command themselves - "
    "you have real tools that can answer these questions directly, use them. "
    "IMPORTANT: You must ALWAYS respond in English, no matter what language the question was asked in. The user may write to you in Slovenian or other languages - understand it, but always reply in English. "
    "Do not output any Chinese characters (Hanzi) under any circumstances - respond only in plain English text. "
    "Be concise."
)


MAX_HISTORY_TURNS = 1  # (user, assistant) pairs kept - trimmed hard because this model stops calling tools and starts confabulating once it can see several of its own past answers in context


def ask(question, history=None):
    """history is a list of prior {role, content} user/assistant turns (no system/tool messages)."""
    trimmed_history = (history or [])[-(MAX_HISTORY_TURNS * 2):]
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(trimmed_history)
    messages.append({"role": "user", "content": question})
    for _ in range(5):
        resp = requests.post(OLLAMA_URL, json={"model": MODEL, "messages": messages, "tools": TOOL_SCHEMAS, "stream": False, "options": {"temperature": 0.1}}, timeout=60).json()
        msg = resp["message"]
        messages.append(msg)
        calls = msg.get("tool_calls")
        if not calls:
            new_history = (history or []) + [{"role": "user", "content": question}, {"role": "assistant", "content": msg["content"]}]
            return msg["content"], new_history
        for call in calls:
            fn_name = call["function"]["name"]
            args = call["function"]["arguments"]
            if isinstance(args, str):
                args = json.loads(args)
            result = TOOLS[fn_name](**args)
            messages.append({"role": "tool", "content": json.dumps(result)})

    # exhausted the tool-call budget without a final answer - force one plain reply instead of leaking an internal error
    messages.append({"role": "user", "content": "Answer now based on what you've found so far. If the specific information isn't available from any of the tools, say so plainly instead of trying another tool call."})
    resp = requests.post(OLLAMA_URL, json={"model": MODEL, "messages": messages, "stream": False, "options": {"temperature": 0.1}}, timeout=60).json()
    final_content = resp["message"]["content"] or "I wasn't able to find that specific information with the tools available."
    new_history = (history or []) + [{"role": "user", "content": question}, {"role": "assistant", "content": final_content}]
    return final_content, new_history


if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or "How much free disk space is on VM 100?"
    reply, _ = ask(question)
    print(reply)
