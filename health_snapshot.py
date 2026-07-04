#!/usr/bin/env python3
"""Runs periodically (systemd timer) to detect and log VM/container state changes."""
import json
import os
import time
from datetime import datetime

from ops_agent import list_vms, get_docker_containers, notify_ntfy

STATE_PATH = "/root/webapp/health_state.json"
HISTORY_PATH = "/root/webapp/health_history.jsonl"
CRITICAL_VALUES = {"unhealthy", "stopped"}


def load_prev_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {}


def current_state():
    state = {}
    for v in list_vms():
        state[f"vm:{v['name']}"] = v["status"]
    containers = get_docker_containers()
    if isinstance(containers, list):
        for c in containers:
            state[f"container:{c['name']}"] = c["health"] if c["health"] != "none" else c["state"]
    return state


def main():
    prev = load_prev_state()
    curr = current_state()
    now = time.time()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    events = []
    for entity, new_val in curr.items():
        old_val = prev.get(entity)
        if old_val is not None and old_val != new_val:
            events.append({"ts_unix": now, "time": now_str, "entity": entity, "change": f"{old_val} -> {new_val}"})

    if events:
        any_critical = any(e["change"].split(" -> ")[-1] in CRITICAL_VALUES for e in events)
        notify_ntfy(
            title="Homelab: something went down" if any_critical else "Homelab state change",
            body="\n".join(f"{e['entity']}: {e['change']}" for e in events),
            priority="urgent" if any_critical else "default",
            tags="rotating_light" if any_critical else "bell",
        )
        with open(HISTORY_PATH, "a") as f:
            for e in events:
                f.write(json.dumps(e) + "\n")

    with open(STATE_PATH, "w") as f:
        json.dump(curr, f)


if __name__ == "__main__":
    main()
