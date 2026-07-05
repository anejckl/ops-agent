#!/usr/bin/env bash
# Build the Angular frontend and deploy to ops-agent by pushing to origin.
# The repo on ops-agent has receive.denyCurrentBranch=updateInstead, so a push
# updates the served working tree (static/) atomically - no service restart needed.
set -euo pipefail
cd "$(dirname "$0")"

(cd frontend && npm run build)

git add -A
if git diff --cached --quiet; then
  echo "nothing to deploy - working tree clean"
  exit 0
fi
git status --short
msg="${1:-deploy: rebuild frontend}"
git commit -m "$msg"
git push origin master

curl -sf --max-time 10 http://100.97.128.54:8000/ >/dev/null && echo "deploy ok - app responding"
