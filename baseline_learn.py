#!/usr/bin/env python3
"""Daily job: learn per-entity baselines (median/MAD per hour-of-day) from Prometheus history and fit
storage-growth forecasts. Pure statistics, no LLM. Writes /root/webapp/baselines.json atomically.

Cold-start behavior (Prometheus data only exists since 2026-07-04): window = min(30d, available);
hour buckets are used by the watchdog only when n >= 12, series spanning < 24h are marked insufficient
and never alerted on; forecasts are suppressed entirely below 7 days of samples."""
import json
import os
import time

import requests

import ops_agent as oa

BASELINES_PATH = "/root/webapp/baselines.json"
MAX_WINDOW_DAYS = 30
FORECAST_MIN_DAYS = 7
FORECAST_ALERT_DAYS = 21

# family -> (query, step_seconds, label_key, key_template)
FAMILIES = {
    "container_cpu": ('sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m])) * 100', 300, "name", "container:{}:cpu"),
    "container_mem": ('sum by (name) (container_memory_working_set_bytes{name!=""}) / 1048576', 300, "name", "container:{}:mem"),
    "guest_cpu": ('pve_cpu_usage_ratio{id=~"(qemu|lxc)/.*"} * 100', 300, "id", "guest:{}:cpu"),
    "guest_mem": ('100 * pve_memory_usage_bytes{id=~"(qemu|lxc)/.*"} / pve_memory_size_bytes{id=~"(qemu|lxc)/.*"}', 300, "id", "guest:{}:mem"),
    "gpu_temp": ("nvidia_smi_temperature_gpu", 300, None, "gpu:gpu:temp"),
    "gpu_util": ("nvidia_smi_utilization_gpu_ratio * 100", 300, None, "gpu:gpu:util"),
    "storage_pct": ('100 * pve_disk_usage_bytes{id=~"storage/.*"} / pve_disk_size_bytes{id=~"storage/.*"}', 3600, "id", "storage:{}:pct"),
}


def prom_range_all(query, days, step):
    """query_range returning ALL series: [(labels, [[ts, float], ...]), ...]"""
    end = time.time()
    r = requests.get(
        f"{oa.PROMETHEUS_URL}/api/v1/query_range",
        params={"query": query, "start": end - days * 86400, "end": end, "step": step},
        timeout=60,
    )
    r.raise_for_status()
    out = []
    for series in r.json()["data"]["result"]:
        pts = [[float(ts), float(v)] for ts, v in series["values"] if v not in ("NaN", "+Inf", "-Inf")]
        if pts:
            out.append((series["metric"], pts))
    return out


def available_window_days():
    """How much history Prometheus actually has, capped at MAX_WINDOW_DAYS."""
    series = prom_range_all('up{job="pve"}', MAX_WINDOW_DAYS, 3600)
    if not series:
        return 1
    first_ts = min(pts[0][0] for _, pts in series)
    return max(1, min(MAX_WINDOW_DAYS, (time.time() - first_ts) / 86400))


def _median(vals):
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def robust_baseline(points):
    """{hours: {"0".."23": {median, mad, n}}, overall: {...}, insufficient: bool} - UTC hours (watchdog must match)."""
    vals = [v for _, v in points]
    span_hours = (points[-1][0] - points[0][0]) / 3600 if len(points) > 1 else 0
    med = _median(vals)
    mad = _median([abs(v - med) for v in vals])
    out = {
        "overall": {"median": round(med, 2), "mad": round(mad, 3), "n": len(vals)},
        "hours": {},
        "insufficient": span_hours < 24,
    }
    buckets = {}
    for ts, v in points:
        buckets.setdefault(time.gmtime(ts).tm_hour, []).append(v)
    for hour, hvals in buckets.items():
        hmed = _median(hvals)
        out["hours"][str(hour)] = {"median": round(hmed, 2), "mad": round(_median([abs(v - hmed) for v in hvals]), 3), "n": len(hvals)}
    return out


def fit_forecast(usage_points, size_bytes):
    """Least-squares slope over pool usage bytes -> gb/day + days until full. None if <7d of data or not growing."""
    if not usage_points or size_bytes is None:
        return None
    span_days = (usage_points[-1][0] - usage_points[0][0]) / 86400
    if span_days < FORECAST_MIN_DAYS:
        return None
    n = len(usage_points)
    t0 = usage_points[0][0]
    xs = [ts - t0 for ts, _ in usage_points]
    ys = [v for _, v in usage_points]
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom  # bytes/sec
    usage_now = ys[-1]
    gb_per_day = slope * 86400 / 1024**3
    if slope <= 0:
        return {"gb_per_day": round(gb_per_day, 2), "days_left": None, "pct_now": round(100 * usage_now / size_bytes, 1)}
    days_left = (size_bytes - usage_now) / (slope * 86400)
    return {"gb_per_day": round(gb_per_day, 2), "days_left": round(days_left, 1), "pct_now": round(100 * usage_now / size_bytes, 1)}


def guest_id_to_name():
    try:
        return {f"{'qemu' if v['type'] == 'vm' else 'lxc'}/{v['vmid']}": v["name"] for v in oa.list_vms()}
    except Exception:
        return {}


def main():
    days = available_window_days()
    id_names = guest_id_to_name()
    series_out = {}
    for fam, (query, step, label_key, key_tpl) in FAMILIES.items():
        try:
            for labels, points in prom_range_all(query, days, step):
                if label_key is None:
                    key = key_tpl
                else:
                    raw = labels.get(label_key, "")
                    if label_key == "id":
                        name = id_names.get(raw) or raw.rsplit("/", 1)[-1]
                    else:
                        name = raw
                    if not name:
                        continue
                    key = key_tpl.format(name)
                series_out[key] = robust_baseline(points)
        except Exception as e:
            print(f"family {fam} failed: {e}")

    forecasts = {}
    try:
        sizes = {}
        r = requests.get(f"{oa.PROMETHEUS_URL}/api/v1/query", params={"query": 'pve_disk_size_bytes{id=~"storage/.*"}'}, timeout=30)
        for row in r.json()["data"]["result"]:
            sizes[row["metric"]["id"].rsplit("/", 1)[-1]] = float(row["value"][1])
        for labels, points in prom_range_all('pve_disk_usage_bytes{id=~"storage/.*"}', days, 3600):
            pool = labels["id"].rsplit("/", 1)[-1]
            fc = fit_forecast(points, sizes.get(pool))
            if fc:
                forecasts[pool] = fc
    except Exception as e:
        print(f"forecast failed: {e}")

    out = {"computed_at": time.time(), "window_days": round(days, 2), "series": series_out, "forecasts": forecasts}
    tmp = BASELINES_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(out, f)
    os.replace(tmp, BASELINES_PATH)
    print(f"baselines: {len(series_out)} series over {days:.1f}d window; forecasts: {list(forecasts.keys()) or 'none (need >=7d data)'}")

    urgent = {p: fc for p, fc in forecasts.items() if fc.get("days_left") is not None and fc["days_left"] < FORECAST_ALERT_DAYS}
    if urgent:
        body = "\n".join(f"{p}: full in ~{fc['days_left']} days ({fc['gb_per_day']} GB/day, now {fc['pct_now']}%)" for p, fc in urgent.items())
        oa.notify_ntfy("Homelab: disk se polni", body, "high", "floppy_disk")


if __name__ == "__main__":
    main()
