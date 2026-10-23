#!/usr/bin/env bash
# Starts the whole project: API (8000), field app (5173), dashboard (3000).
# Usage: ./start.sh      Stop everything with Ctrl+C.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

cleanup() {
  echo; echo "Stopping..."
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  # npm/uvicorn spawn children; on Windows (Git Bash) clean those up too
  command -v taskkill >/dev/null 2>&1 && for p in "${PIDS[@]}"; do taskkill //PID "$p" //T //F >/dev/null 2>&1 || true; done
  exit 0
}
trap cleanup INT TERM EXIT

# ---- backend ----
cd "$ROOT/backend"
if [ -f .venv/Scripts/activate ]; then source .venv/Scripts/activate
elif [ -f .venv/bin/activate ]; then source .venv/bin/activate
else
  echo "Creating Python venv..."
  PY=$(command -v python3.12 || command -v python3 || command -v python)
  "$PY" -m venv .venv
  if [ -f .venv/Scripts/activate ]; then source .venv/Scripts/activate; else source .venv/bin/activate; fi
  pip install -q -r requirements.txt
fi
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env && echo "Created backend/.env from .env.example (add your GROQ_API_KEY)."; }
python -m uvicorn app.main:app --port 8000 &
PIDS+=($!)

# ---- frontends ----
for dir in local-ui dashboard; do
  cd "$ROOT/$dir"
  [ -d node_modules ] || { echo "Installing $dir dependencies..."; npm install --silent; }
  npm run dev &
  PIDS+=($!)
done

cat <<EOF

  Sanjeevani Lekh is starting:
    Field app   http://localhost:5173
    Dashboard   http://localhost:3000
    API docs    http://localhost:8000/api/docs

  Ctrl+C to stop everything.
EOF
wait
