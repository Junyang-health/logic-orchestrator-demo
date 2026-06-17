"""
Slide-build sessions & async jobs (queue consumed by ``python -m worker``).
"""

from __future__ import annotations

import base64
from typing import Any, Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from app.services.slide_build_artifacts import (
    export_pdf_path,
    export_pptx_path,
    export_dir,
    ensure_session_dirs,
    read_slide_document,
    write_slide_document,
)
from app.services.slide_build_export import build_pptx_from_png_paths
from app.services.slide_export_review import export_review_path
from app.services.slide_build_slide_edit import apply_slide_instruction, extract_slide_inner_fragment
from app.services.slide_build_session_prefs import (
    list_reference_basenames,
    load_build_preferences,
    save_build_preferences,
    save_reference_upload,
)
from app.services.slide_job_handlers import read_slide_preview_html

from app.services.slide_job_store import (
    JobKind,
    SlideJobRow,
    create_session,
    enqueue_job,
    get_job,
    get_session,
    list_jobs_for_session,
    update_session_framework,
)

router = APIRouter(prefix="/slide-build", tags=["slide-build"])


def _normalize_framework_engine(framework: dict[str, Any] | None) -> dict[str, Any]:
    fw = dict(framework or {})
    fw["build_engine"] = "ppt_master"
    return fw


class CreateSessionIn(BaseModel):
    title: str = Field(default="Deck", min_length=1, max_length=500)
    framework: dict[str, Any] = Field(
        default_factory=dict,
        description="Confirmed PPT framework snapshot (e.g. slides[] from the app).",
    )


class CreateSessionOut(BaseModel):
    session_id: str


class EnqueueJobIn(BaseModel):
    kind: JobKind
    slide_id: str | None = Field(default=None, description="Required for slide_generate when targeting one slide.")
    payload: dict[str, Any] = Field(default_factory=dict)


class JobOut(BaseModel):
    id: str
    session_id: str
    kind: str
    slide_id: str | None
    status: str
    payload: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at_ms: int
    started_at_ms: int | None = None
    finished_at_ms: int | None = None


class SessionOut(BaseModel):
    id: str
    title: str
    framework: dict[str, Any]
    created_at_ms: int
    updated_at_ms: int
    jobs: list[JobOut]


class PatchFrameworkIn(BaseModel):
    framework: dict[str, Any]


class PatchSlideInnerIn(BaseModel):
    inner_html: str = Field(default="", max_length=500_000, description="HTML fragment inside the slide frame.")


class SlideChatIn(BaseModel):
    message: str = Field(default="", min_length=1, max_length=16000)


class SlideBuildPrefsIn(BaseModel):
    style_notes_full: str = Field(default="", max_length=200_000)
    design: dict[str, Any] = Field(default_factory=dict)
    reference_stored_names: list[str] = Field(default_factory=list)


class ReferenceStoredOut(BaseModel):
    stored_names: list[str]


class PptxPreviewImagesIn(BaseModel):
    images: list[str] = Field(
        default_factory=list,
        description="Ordered PNG images as base64 strings or data:image/png;base64 URLs.",
    )


def _prefs_merge(session_id: str, body: SlideBuildPrefsIn) -> dict[str, Any]:
    prev = load_build_preferences(session_id)
    nxt = dict(prev)
    dumped = body.model_dump()
    for k, v in dumped.items():
        nxt[k] = v
    return nxt
def _framework_slide(fw: dict[str, Any], slide_id: str) -> dict[str, Any] | None:
    slides = fw.get("slides") if isinstance(fw, dict) else None
    if not isinstance(slides, list):
        return None
    for s in slides:
        if isinstance(s, dict) and str(s.get("id") or "") == slide_id:
            return s
    return None


def _job_to_out(row: SlideJobRow) -> JobOut:
    import json

    payload = json.loads(row.payload_json) if row.payload_json else {}
    result = json.loads(row.result_json) if row.result_json else None
    return JobOut(
        id=row.id,
        session_id=row.session_id,
        kind=row.kind,
        slide_id=row.slide_id,
        status=row.status,
        payload=payload,
        result=result,
        error=row.error_text,
        created_at_ms=row.created_at_ms,
        started_at_ms=row.started_at_ms,
        finished_at_ms=row.finished_at_ms,
    )


@router.post("/sessions", response_model=CreateSessionOut)
def create_build_session(body: CreateSessionIn) -> CreateSessionOut:
    base_fw = body.framework if body.framework else {"slides": []}
    row = create_session(title=body.title, framework=_normalize_framework_engine(base_fw))
    ensure_session_dirs(row.id)
    return CreateSessionOut(session_id=row.id)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_build_session(session_id: str) -> SessionOut:
    import json

    s = get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    jobs = [_job_to_out(j) for j in list_jobs_for_session(session_id)]
    try:
        fw = json.loads(s.framework_json) if s.framework_json else {}
    except json.JSONDecodeError:
        fw = {}
    fw = _normalize_framework_engine(fw if isinstance(fw, dict) else {})
    return SessionOut(
        id=s.id,
        title=s.title,
        framework=fw,
        created_at_ms=s.created_at_ms,
        updated_at_ms=s.updated_at_ms,
        jobs=jobs,
    )


@router.patch("/sessions/{session_id}/framework")
def patch_framework(session_id: str, body: PatchFrameworkIn) -> dict[str, Literal[True]]:
    s = get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    update_session_framework(session_id, _normalize_framework_engine(body.framework))
    return {"ok": True}


@router.post("/sessions/{session_id}/jobs", response_model=JobOut)
def enqueue(session_id: str, body: EnqueueJobIn) -> JobOut:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    if body.kind == "slide_generate" and not (body.slide_id or "").strip():
        raise HTTPException(
            status_code=400,
            detail="slide_generate requires slide_id (stable id from your framework).",
        )
    row = enqueue_job(
        session_id=session_id,
        kind=body.kind,
        slide_id=(body.slide_id or "").strip() or None,
        payload=body.payload,
    )
    return _job_to_out(row)


@router.get("/jobs/{job_id}", response_model=JobOut)
def job_status(job_id: str) -> JobOut:
    row = get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_out(row)


@router.get("/sessions/{session_id}/slides/{slide_id}/inner")
def get_slide_inner_fragment(session_id: str, slide_id: str) -> dict[str, str]:
    """Return editable inner HTML fragment (inside `.slide`). Empty when not generated yet."""
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    full = read_slide_document(session_id, slide_id)
    if not full:
        return {"inner_html": ""}
    return {"inner_html": extract_slide_inner_fragment(full)}


@router.patch("/sessions/{session_id}/slides/{slide_id}/inner")
def patch_slide_inner(session_id: str, slide_id: str, body: PatchSlideInnerIn) -> dict[str, Literal[True]]:
    sess = get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    import json as _json

    try:
        fw_from_db = _json.loads(sess.framework_json) if sess.framework_json else {}
    except _json.JSONDecodeError:
        fw_from_db = {}

    hit = _framework_slide(fw_from_db if isinstance(fw_from_db, dict) else {}, slide_id)
    if not hit:
        raise HTTPException(status_code=404, detail="Slide not in session framework")

    inner = body.inner_html.strip()
    write_slide_document(session_id, slide_id, inner if inner else "<p></p>")
    return {"ok": True}


@router.post("/sessions/{session_id}/slides/{slide_id}/chat")
def slide_instruction_chat(session_id: str, slide_id: str, body: SlideChatIn) -> dict[str, Any]:
    sess = get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    import json as _json

    try:
        fw = _json.loads(sess.framework_json) if sess.framework_json else {}
    except _json.JSONDecodeError:
        fw = {}

    slide = _framework_slide(fw if isinstance(fw, dict) else {}, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not in session framework")

    try:
        return apply_slide_instruction(session_id, slide_id, slide, body.message.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/sessions/{session_id}/reference-assets", response_model=ReferenceStoredOut)
def list_reference_assets_endpoint(session_id: str) -> ReferenceStoredOut:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return ReferenceStoredOut(stored_names=list_reference_basenames(session_id))


@router.post("/sessions/{session_id}/reference-assets", response_model=ReferenceStoredOut)
async def upload_reference_assets_endpoint(
    session_id: str,
    files: list[UploadFile] | None = File(default=None),
) -> ReferenceStoredOut:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    names: list[str] = []
    for f in files or []:
        body = await f.read()
        if not body:
            continue
        fname = f.filename or "reference"
        names.append(save_reference_upload(session_id, original_filename=fname, body=body))
    return ReferenceStoredOut(stored_names=names)


@router.put("/sessions/{session_id}/preferences")
def put_slide_build_preferences(session_id: str, body: SlideBuildPrefsIn) -> dict[str, Literal[True]]:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    save_build_preferences(session_id, _prefs_merge(session_id, body))
    return {"ok": True}


@router.get("/sessions/{session_id}/slides/{slide_id}/preview", response_class=HTMLResponse)
def preview_slide_html(session_id: str, slide_id: str) -> HTMLResponse:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    html = read_slide_preview_html(session_id, slide_id)
    if not html:
        raise HTTPException(status_code=404, detail="Slide HTML not generated yet")
    return HTMLResponse(content=html)


@router.get("/sessions/{session_id}/files/pptx")
def download_deck_pptx(session_id: str) -> FileResponse:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    path = export_pptx_path(session_id)
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="PPTX not found — enqueue an export_pptx job and wait for the worker.",
        )
    return FileResponse(
        path,
        filename="deck.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@router.post("/sessions/{session_id}/files/pptx-from-preview-images")
def write_deck_pptx_from_preview_images(session_id: str, body: PptxPreviewImagesIn) -> dict[str, Literal[True]]:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    if not body.images:
        raise HTTPException(status_code=400, detail="No preview images supplied")

    ensure_session_dirs(session_id)
    img_dir = export_dir(session_id) / "client_preview_renders"
    img_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for idx, raw in enumerate(body.images, start=1):
        s = (raw or "").strip()
        if "," in s and s.lower().startswith("data:"):
            s = s.split(",", 1)[1]
        try:
            data = base64.b64decode(s, validate=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid PNG data for slide {idx}") from e
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(status_code=400, detail=f"Slide {idx} is not a PNG image")
        p = img_dir / f"slide_{idx:03d}.png"
        p.write_bytes(data)
        paths.append(p)

    build_pptx_from_png_paths(paths, export_pptx_path(session_id))
    return {"ok": True}


@router.get("/sessions/{session_id}/files/pdf")
def download_deck_pdf(session_id: str) -> FileResponse:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    path = export_pdf_path(session_id)
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="PDF not found — enqueue an export_pdf job and wait for the worker.",
        )
    return FileResponse(path, filename="deck.pdf", media_type="application/pdf")


@router.get("/sessions/{session_id}/files/review")
def download_export_review(session_id: str) -> FileResponse:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    path = export_review_path(session_id)
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Export review not found — enqueue an export job and wait for the worker.",
        )
    return FileResponse(path, filename="export_review.json", media_type="application/json")
