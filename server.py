#!/usr/bin/env python3
import hmac
import json
import os
from datetime import datetime, timezone

import time

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from ops_agent import (
    list_vms, get_vm_status, get_storage_status, get_node_status, get_docker_containers,
    get_trend_series, get_gpu_status, get_guest_trend, get_container_trend, get_recent_events,
    read_anomalies, get_storage_forecasts, diagnose, map_alert_to_entity,
    ask, ask_stream, notify_ntfy,
)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CHAT_LOG_PATH = "/root/webapp/chat.log"


def log_chat(message, reply):
    entry = {"ts": datetime.now(timezone.utc).isoformat(), "message": message, "reply": reply}
    with open(CHAT_LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")


@app.get("/api/health")
def health():
    vms = list_vms()
    details = [get_vm_status(v["vmid"]) for v in vms]
    containers = get_docker_containers()
    if isinstance(containers, dict) and "error" in containers:
        containers = []
    trend = get_trend_series()
    gpu = get_gpu_status()
    if isinstance(gpu, dict) and "error" in gpu:
        gpu = None
    return {
        "node": get_node_status(),
        "storage": get_storage_status(),
        "guests": details,
        "containers": containers,
        "cpu_trend": trend["cpu"],
        "mem_trend": trend["mem"],
        "gpu": gpu,
        "events": get_recent_events(24)[:15],
        "anomalies": read_anomalies(48)[:10],
        "forecasts": get_storage_forecasts(),
    }


@app.get("/api/entity")
def entity(type: str, id: str, hours: int = 4):
    if hours not in (4, 24, 168):
        hours = 4
    if type == "guest":
        try:
            vmid = int(id)
        except ValueError:
            raise HTTPException(status_code=404, detail="unknown guest")
        match = next((v for v in list_vms() if v["vmid"] == vmid), None)
        if match is None:
            raise HTTPException(status_code=404, detail="unknown guest")
        trend = get_guest_trend(vmid, match["type"], hours)
        name, mem_unit = match["name"], "%"
    elif type == "container":
        trend = get_container_trend(id, hours)
        if trend is None or (trend["cpu"] is None and trend["mem"] is None):
            raise HTTPException(status_code=404, detail="unknown container")
        name, mem_unit = id, "MB"
    else:
        raise HTTPException(status_code=400, detail="type must be 'guest' or 'container'")
    return {
        "type": type,
        "id": id,
        "name": name,
        "hours": hours,
        "cpu": {"series": trend["cpu"] or [], "unit": "%"},
        "mem": {"series": trend["mem"] or [], "unit": mem_unit},
        "events": get_recent_events(168, entity=name),
    }


class ChatRequest(BaseModel):
    message: str
    history: list = []


@app.post("/api/chat")
def chat(req: ChatRequest):
    reply, new_history = ask(req.message, req.history)
    log_chat(req.message, reply)
    return {"reply": reply, "history": new_history}


@app.post("/api/chat/stream")
def chat_stream(req: ChatRequest):
    def gen():
        for event, data in ask_stream(req.message, req.history):
            yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
            if event == "done":
                log_chat(req.message, data["reply"])
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


SEVERITY_PRIORITY = {"critical": "urgent", "warning": "default"}
SEVERITY_TAGS = {"critical": "rotating_light", "warning": "warning"}


# auto-diagnosis dedup: don't re-diagnose the same (alertname, entity) within 30 min. In-memory is fine:
# single uvicorn worker; a restart merely allows one extra diagnosis.
_LAST_DIAG = {}
DIAG_DEDUP_SECONDS = 30 * 60


def _diagnose_and_push(alert):
    """Background: attach an AI probable-cause to a firing alert as a SECOND ntfy push. The raw alert has
    already been delivered - any failure here must stay silent."""
    try:
        labels = alert.get("labels", {})
        alertname = labels.get("alertname", "Alert")
        mapped = map_alert_to_entity(labels, alertname)
        if not mapped:
            return
        _, entity = mapped
        now = time.time()
        if now - _LAST_DIAG.get((alertname, entity), 0) < DIAG_DEDUP_SECONDS:
            return
        _LAST_DIAG[(alertname, entity)] = now
        result = diagnose(entity, timeout=120)
        text = result.get("diagnosis") if isinstance(result, dict) else None
        if text:
            notify_ntfy(f"AI diagnoza: {alertname}", text[:800], "default", "brain")
    except Exception:
        pass


@app.post("/api/alerts/webhook")
def alerts_webhook(payload: dict, background_tasks: BackgroundTasks, authorization: str = Header(None)):
    expected_token = os.environ.get("ALERT_RELAY_TOKEN", "")
    if not expected_token or not hmac.compare_digest(authorization or "", f"Bearer {expected_token}"):
        raise HTTPException(status_code=401, detail="unauthorized")
    for alert in payload.get("alerts", []):
        labels, ann = alert.get("labels", {}), alert.get("annotations", {})
        resolved = alert.get("status") == "resolved"
        title = f"{'RESOLVED: ' if resolved else ''}{labels.get('alertname', 'Alert')}"
        body = ann.get("summary") or ann.get("description") or "no summary"
        sev = labels.get("severity", "warning")
        notify_ntfy(
            title,
            body,
            "low" if resolved else SEVERITY_PRIORITY.get(sev, "default"),
            "white_check_mark" if resolved else SEVERITY_TAGS.get(sev, "bell"),
        )
        if not resolved:
            background_tasks.add_task(_diagnose_and_push, alert)
    return {"ok": True}


app.mount("/", StaticFiles(directory="/root/webapp/static", html=True), name="static")
