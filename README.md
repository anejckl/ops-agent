# ops-agent

AI-powered homelab ops assistant running in LXC container 300 on Proxmox.

Mobile-first dashboard + chat interface that can answer questions about your homelab in real time using tool calls to Proxmox, Docker, Prometheus, and Alertmanager.

## Features

- Live dashboard: Proxmox host health, GPU metrics, VM/container status, storage forecasts, disk health, active alerts
- AI chat (Slovenian UI) with 14+ tool calls — ask things like "which container uses the most RAM" or "are there active Prometheus alerts"
- Prometheus alert webhook receiver — auto-diagnoses alerts, forwards to ntfy push notifications
- Anomaly watchdog with baseline learning
- Daily digest report (08:00 Ljubljana time)
- SSE streaming chat responses

## Access

Dashboard: `http://192.168.1.142:8000` (mobile-first — resize browser to 390px wide for desktop)

## Tech stack

- FastAPI + uvicorn on port 8000
- LLM: `qwen2.5:7b` via Ollama (configurable via `OPS_MODEL` env var)
- Metrics via Prometheus API
- Container management via SSH + Docker socket
- Push notifications via ntfy

## Configuration

All credentials are passed via `/etc/homelab-app.env` (not committed):

```env
PROXMOX_TOKEN=ops-agent@pve!<token-id>=<secret>
PROXMOX_HOST=192.168.1.77          # optional, defaults to 192.168.1.77
PROXMOX_NODE=pve                   # optional
OLLAMA_URL=http://...:11434/api/chat   # optional
DOCKER_VM_HOST=192.168.1.136       # optional
PROMETHEUS_URL=http://...:9090     # optional
ALERTMANAGER_URL=http://...:9093   # optional
NTFY_URL=http://...:8090
NTFY_TOPIC=homelab-alerts
NTFY_TOKEN=<ntfy-token>
ALERT_RELAY_TOKEN=<webhook-auth-token>
OPS_MODEL=qwen2.5:7b               # optional LLM model override
```

## Running

```bash
systemctl start homelab-app
```

Service file: `/etc/systemd/system/homelab-app.service`
Code: `/root/webapp/`

## Files

| File | Description |
|------|-------------|
| `server.py` | FastAPI app, routes, SSE streaming |
| `ops_agent.py` | Tool definitions, LLM orchestration, Proxmox/Docker/Prometheus clients |
| `daily_digest.py` | Daily summary generator |
| `anomaly_watchdog.py` | Metric anomaly detection |
| `baseline_learn.py` | Baseline metric learning |
| `health_snapshot.py` | Periodic health state snapshots |
| `frontend/` | Angular + ECharts mission-control UI |
