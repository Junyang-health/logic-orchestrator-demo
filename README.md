# unbox-demo

AntV X6 + FastAPI (Vite + React + TS)

## Structure

- `frontend/`: Vite + React + TypeScript + TailwindCSS + AntV X6 + Zustand
- `backend/`: FastAPI with CORS enabled

## Prerequisites

- Python **3.10+** (3.11 recommended; virtual environment required — `markitdown` and other deps do not support 3.9)
- Node.js 18+ and npm

## Configuration

1. Copy `backend/.env.example` to `backend/.env`.
2. Add API keys for the providers you use (see comments in `.env.example`).
3. The backend **loads `backend/.env` automatically** — you do not need `export` in the terminal.
4. Optional: in `frontend/`, create `.env.local` if the API is not on the default host:

```bash
# frontend/.env.local
VITE_BACKEND_URL=http://localhost:8000
```

## Easy start (one window, browser opens)

**First time:** Python 3 and Node 18+ must be installed.

- **macOS (simplest):** double-click **`Start Unbox.command`** in the project folder.  
  If `backend/.env` does not exist yet, TextEdit opens so you can paste keys; save, then run again.
- **Terminal:** from the repo root run:

```bash
./scripts/start-unbox.sh
```

The script creates `backend/.venv`, runs `pip install`, `npm install` where needed, then starts the API and the UI. The dev server opens your browser.

**Advanced (after one successful `./scripts/start-unbox.sh`):**

```bash
npm start
```

## Run (local dev, two terminals)

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
python3.11 -m venv .venv   # use 3.10+ (python3.11 / python3.12 are fine)
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Tests (backend)

```bash
cd backend
source .venv/bin/activate
pip install pytest
pytest tests/ -q
```

## CORS

The backend enables CORS for `http://localhost:5173` and `http://127.0.0.1:5173`.

## Git (first push)

From the repository root:

```bash
git init
git add .
git status   # confirm venv/node_modules are not listed
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

Use a **private** remote for trials if the repo might ever contain notes or keys. Never commit `.env` or real API keys.
