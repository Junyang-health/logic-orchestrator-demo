# AntV X6 + FastAPI (Vite + React + TS)

## Structure

- `frontend/`: Vite + React + TypeScript + TailwindCSS + AntV X6 + Zustand
- `backend/`: FastAPI with CORS enabled

## Prerequisites

- Python 3.9+ (virtual environment recommended)
- Node.js 18+ and npm

## Configuration

1. Copy `backend/.env.example` to `backend/.env`.
2. Add API keys for the providers you use (see comments in `.env.example`).
3. Optional: in `frontend/`, create `.env.local` if the API is not on the default host:

```bash
# frontend/.env.local
VITE_BACKEND_URL=http://localhost:8000
```

## Run (local dev)

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
python3 -m venv .venv
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
git remote add origin <your-remote-url>
git push -u origin main
```

Use a **private** remote for trials if the repo might ever contain notes or keys. Never commit `.env` or real API keys.

