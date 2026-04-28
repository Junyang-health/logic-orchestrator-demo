from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.upload import router as upload_router
from app.routers.validate import router as validate_router
from app.routers.review import router as review_router
from app.routers.models import router as models_router
from app.routers.projects import router as projects_router
from app.routers.assistant import router as assistant_router
from app.routers.word_export import router as word_export_router

app = FastAPI(title="backend")

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Dev-friendly: allow any localhost / LAN IP with any port (Vite may pick 5174+ if 5173 is busy).
_DEV_ORIGIN_REGEX = r"https?://(\[::1\]|localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=_DEV_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(upload_router)
app.include_router(validate_router)
app.include_router(review_router)
app.include_router(models_router)
app.include_router(projects_router)
app.include_router(assistant_router)
app.include_router(word_export_router)

