#!/usr/bin/env python3
"""5-minute job: compare current (10-min-smoothed) values against learned baselines; sustained deviations
become anomaly events (anomalies.jsonl) + one batched ntfy push. Pure statistics, no LLM.

Trigger: value > bucket_median + max(K * 1.4826 * MAD, floor) AND value > abs_min, for M consecutive runs.
K=5 deliberately high - a homelab tolerates missed soft anomalies far better than nightly false pings.
GPU util is never alerted (ComfyUI/Ollama legitimately peg it); GPU temp is."""
import json
import os
import time

import requests

import ops_agent as oa

BASELINES_PATH = "/root/webapp/baselines.json"
STATE_PATH = "/root/webapp/anomaly_state.json"
ANOMALIES_PATH = "/root/webapp/anomalies.jsonl"

K = float(os.environ.get("ANOM_K", "5"))
M = int(os.environ.get("ANOM_M", "3"))
RENOTIFY_SECONDS = 6 * 3600
BASELINE_MAX_AGE = 48 * 3600
MIN_BUCKET_N = 12

# metric suffix -> (floor for the MAD band, absolute minimum below which we never alert, unit label)
THRESHOLDS = {
    "container:cpu": (15.0, 25.0, "% jedra"),
    "container:mem": (100.0, 300.0, "MB"),   # floor also scaled by 0.2*median below
    "guest:cpu": (10.0, 20.0, "%"),
    "guest:mem": (8.0, 50.0, "%"),
    "gpu:temp": (8.0, None, "°C"),
    "storage:pct": (2.0, 40.0, "%"),
}
NEVER_ALERT = {"gpu:gpu:util"}

# family -> (instant query with 10-min smoothing, label key)
QUERIES = {
    "container:cpu": ('sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[10m])) * 100', "name"),
    "container:mem": ('sum by (name) (avg_over_time(container_memory_working_set_bytes{name!=""}[10m])) / 1048576', "name"),
    "guest:cpu": ('avg_over_time(pve_cpu_usage_ratio{id=~"(qemu|lxc)/.*"}[10m]) * 100', "id"),
    "guest:mem": ('100 * avg_over_time(pve_memory_usage_bytes{id=~"(qemu|lxc)/.*"}[10m]) / avg_over_time(pve_memory_size_bytes{id=~"(qemu|lxc)/.*"}[10m])', "id"),
    "gpu:temp": ("avg_over_time(nvidia_smi_temperature_gpu[10m])", None),
    "storage:pct": ('100 * pve_disk_usage_bytes{id=~"storage/.*"} / pve_disk_size_bytes{id=~"storage/.*"}', "id"),
}


def prom_instant_all(query, label_key):
    """{entity_name_or_None: value}"""
    r = requests.get(f"{oa.PROMETHEUS_URL}/api/v1/query", params={"query": query}, timeout=30)
    r.raise_for_status()
    out = {}
    for row in r.json()["data"]["result"]:
        val = float(row["value"][1])
        out[row["metric"].get(label_key) if label_key else None] = val
    return out


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def main():
    baselines = load_json(BASELINES_PATH, None)
    if not baselines or time.time() - baselines.get("computed_at", 0) > BASELINE_MAX_AGE:
        return  # no (fresh) baselines yet - silence is correct
    series = baselines["series"]
    state = load_json(STATE_PATH, {})
    id_names = {}
    hour = str(time.gmtime().tm_hour)
    new_events = []

    for fam, (query, label_key) in QUERIES.items():
        etype, metric = fam.split(":")
        try:
            current = prom_instant_all(query, label_key)
        except Exception:
            continue
        for raw_name, value in current.items():
            if label_key == "id":
                if not id_names:
                    try:
                        id_names = {f"{'qemu' if v['type'] == 'vm' else 'lxc'}/{v['vmid']}": v["name"] for v in oa.list_vms()}
                    except Exception:
                        id_names = {}
                name = id_names.get(raw_name) or (raw_name or "").rsplit("/", 1)[-1]
            else:
                name = raw_name or "gpu"
            key = f"{etype}:{name}:{metric}"
            if key in NEVER_ALERT:
                continue
            base = series.get(key)
            if not base or base.get("insufficient"):
                continue
            bucket = base["hours"].get(hour)
            if not bucket or bucket["n"] < MIN_BUCKET_N:
                bucket = base["overall"]
            floor, abs_min, unit = THRESHOLDS[fam]
            if fam == "container:mem":
                floor = max(floor, 0.2 * bucket["median"])
            threshold = bucket["median"] + max(K * 1.4826 * bucket["mad"], floor)
            anomalous = value > threshold and (abs_min is None or value > abs_min)

            st = state.get(key, {"streak": 0, "last_notified_unix": 0})
            st["streak"] = st["streak"] + 1 if anomalous else 0
            state[key] = st
            if st["streak"] == M and time.time() - st["last_notified_unix"] > RENOTIFY_SECONDS:
                st["last_notified_unix"] = time.time()
                new_events.append({
                    "ts_unix": time.time(),
                    "time": time.strftime("%Y-%m-%d %H:%M"),
                    "entity": name,
                    "entity_type": etype,
                    "metric": metric,
                    "unit": unit,
                    "value": round(value, 1),
                    "baseline_median": bucket["median"],
                    "threshold": round(threshold, 1),
                })

    if new_events:
        with open(ANOMALIES_PATH, "a") as f:
            for e in new_events:
                f.write(json.dumps(e) + "\n")
        body = "\n".join(
            f"{e['entity']} {e['metric']}: {e['value']}{e['unit'].replace('°C', 'C')} (usually ~{e['baseline_median']})" for e in new_events
        )
        oa.notify_ntfy("Homelab anomalija", body, "default", "chart_with_upwards_trend")

    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_PATH)
    if new_events:
        print(f"{len(new_events)} anomaly event(s) recorded")


if __name__ == "__main__":
    main()
