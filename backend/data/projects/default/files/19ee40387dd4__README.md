# AntV X6 + FastAPI (Vite + React + TS)

## Structure

- `frontend/`: Vite + React + TypeScript + TailwindCSS + AntV X6 + Zustand
- `backend/`: FastAPI with CORS enabled

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
python3 -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## CORS

The backend enables CORS for `http://localhost:5173` and `http://127.0.0.1:5173`.

