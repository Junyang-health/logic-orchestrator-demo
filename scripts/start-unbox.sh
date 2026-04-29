#!/usr/bin/env bash
# One-command startup: creates venv / installs deps on first run, then starts API + UI (browser opens).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing: $1 — install it and try again."
    exit 1
  fi
}

need_cmd python3
need_cmd npm

# Pick Python 3.10+ (Microsoft MarkItDown and other deps are not published for 3.9).
pick_python310() {
  local c
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1; then
      if "$c" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >/dev/null 2>&1; then
        echo "$c"
        return 0
      fi
    fi
  done
  echo "No Python 3.10+ found (need e.g. brew install python@3.11). python3 --version:" >&2
  python3 --version >&2 || true
  exit 1
}

PY="$(pick_python310)"

if [[ -x backend/.venv/bin/python ]] && ! backend/.venv/bin/python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >/dev/null 2>&1; then
  echo "Removing backend/.venv (it was created with Python < 3.10)…"
  rm -rf backend/.venv
fi

if [[ ! -f backend/.env ]]; then
  echo "Creating backend/.env from backend/.env.example"
  cp backend/.env.example backend/.env
  echo ""
  echo "Add your LLM and Tavily keys to backend/.env, save the file, then run this script again."
  if [[ "$(uname -s)" == "Darwin" ]]; then
    open -e backend/.env 2>/dev/null || true
  fi
  exit 1
fi

if [[ ! -x backend/.venv/bin/python ]]; then
  echo "Creating Python venv with ${PY} (first run only)…"
  "$PY" -m venv backend/.venv
  backend/.venv/bin/pip install -U pip
  backend/.venv/bin/pip install -r backend/requirements.txt
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend packages (first run only)…"
  (cd frontend && npm install)
fi

if [[ ! -d node_modules ]]; then
  echo "Installing workspace runner (first run only)…"
  npm install
fi

exec npm start
