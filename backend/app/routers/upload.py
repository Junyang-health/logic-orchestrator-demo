from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.llm_client import LlmClient
from app.services import project_storage
from app.services.markitdown_extract import TRUNCATE_API_CHARS, extract_bytes_to_markdown
from app.services.mindmap_builder import InputFile, build_mindmap_from_files, build_mindmap_from_intent_only
from app.services.mindmap_survey_clarify import build_clarification_survey

router = APIRouter()


class SurveyClarifyBody(BaseModel):
    """Context for LLM-generated multiple-choice clarifications before mindmap build."""

    intent: str = ""
    has_queued_files: bool = False
    queued_filenames: list[str] = Field(default_factory=list)
    has_stored_selection: bool = False
    stored_filenames: list[str] = Field(default_factory=list)


@router.post("/mindmap/survey-clarifications")
def mindmap_survey_clarifications(body: SurveyClarifyBody):
    """Return tailored multi-choice (mostly) follow-up questions for level-2 branch alignment."""
    return build_clarification_survey(
        intent=body.intent,
        has_queued_files=body.has_queued_files,
        queued_filenames=[str(x) for x in body.queued_filenames if str(x).strip()][:40],
        has_stored_selection=body.has_stored_selection,
        stored_filenames=[str(x) for x in body.stored_filenames if str(x).strip()][:40],
    )


class IntentOnlyMindmapBody(BaseModel):
    intent: str = Field(..., min_length=1)


@router.post("/mindmap/from-intent")
def mindmap_from_intent(body: IntentOnlyMindmapBody):
    """Generate a starter mindmap from goal text only (no uploads or project files)."""
    txt = body.intent.strip()
    if len(txt) < 12:
        raise HTTPException(status_code=400, detail="intent must be at least 12 characters")
    llm = LlmClient()
    try:
        mindmap = build_mindmap_from_intent_only(llm=llm, intent=txt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate mindmap JSON: {e}")
    return {"mindmap": mindmap}


@router.post("/upload")
async def upload(
    files: List[UploadFile] = File(...),
    project_id: Optional[str] = Form(default=None),
    intent: Optional[str] = Form(default=None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    llm = LlmClient()
    stored_project_id: str | None = None
    if project_id:
        # Ensure project exists (and create a folder if needed).
        proj = project_storage.ensure_project(name=project_id, project_id=project_id)
        stored_project_id = proj.id

    inputs: list[InputFile] = []

    for f in files:
        name = f.filename or "uploaded"
        content_type = f.content_type
        data = await f.read()
        if stored_project_id:
            project_storage.store_file(
                project_id=stored_project_id,
                filename=name,
                content_type=content_type,
                content=data,
            )
        inputs.append(InputFile(filename=name, content_type=content_type, content=data))

    try:
        mindmap = build_mindmap_from_files(llm=llm, files=inputs, intent=intent)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate mindmap JSON: {e}")

    if stored_project_id:
        return {"project_id": stored_project_id, "mindmap": mindmap}
    return mindmap


@router.post("/mindmap")
async def mindmap(files: List[UploadFile] = File(...)):
    # Alias for frontend compatibility: same behavior as POST /upload
    return await upload(files=files)


@router.post("/source/extract-text")
async def source_extract_text(files: List[UploadFile] = File(...)):
    """
    Convert uploaded files to Markdown (MarkItDown) for PPT / client-side consumers.
    Does not persist; use project file storage + GET .../extracted for saved text.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    snippets: list[dict[str, str | None]] = []
    for f in files:
        name = f.filename or "uploaded"
        data = await f.read()
        md, err = extract_bytes_to_markdown(name, data, truncate=TRUNCATE_API_CHARS)
        snippets.append({"filename": name, "markdown": md, "error": err})
    return {"snippets": snippets}


@router.get("/mindmap")
def mindmap_help():
    return {
        "detail": "Use POST /mindmap (or POST /upload) with multipart/form-data field 'files' to generate a mindmap.",
        "intent_only": "POST /mindmap/from-intent with JSON {\"intent\": \"...\"} (min 12 chars) for a starter map without files.",
    }

