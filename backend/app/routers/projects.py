from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services import project_storage, web_ingest
from app.services.llm_client import LlmClient
from app.services.mindmap_builder import InputFile, build_mindmap_from_files, build_mindmap_from_intent_only


router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectBody(BaseModel):
    name: str = Field(..., min_length=1)
    project_id: Optional[str] = None


class ProjectDto(BaseModel):
    id: str
    name: str
    created_at_ms: int
    archived: bool = False
    last_active_ms: int = 0


class ProjectArchiveBody(BaseModel):
    archived: bool


class StoredFileDto(BaseModel):
    id: str
    filename: str
    content_type: Optional[str] = None
    size: int
    uploaded_at_ms: int
    """user_upload | llm_ingest (web/assistant pipeline)."""
    origin: str = "user_upload"
    has_extracted_text: bool = False
    extracted_at_ms: Optional[int] = None
    extract_error: Optional[str] = None


class BuildMindmapFromProjectBody(BaseModel):
    """Optional JSON body for POST /projects/{id}/mindmap."""

    intent: Optional[str] = None
    file_ids: Optional[list[str]] = None
    bootstrap_without_sources: bool = False


class SavedMindmapCanvasBody(BaseModel):
    """Body for PUT /projects/{id}/mindmap/canvas — persists the working mindmap."""

    mindmap: dict[str, Any]


class IngestWebBody(BaseModel):
    """Tavily search (one or more query strings) and store fetched page bodies as project files."""

    queries: list[str] = Field(..., min_length=1, max_length=20, description="Each item is a separate Tavily query.")
    max_results_per_query: int = Field(default=3, ge=1, le=10)
    max_pages_ingest: int = Field(default=15, ge=1, le=30)


@router.get("", response_model=list[ProjectDto])
def list_projects():
    return [
        ProjectDto(
            id=p.id,
            name=p.name,
            created_at_ms=p.created_at_ms,
            archived=p.archived,
            last_active_ms=p.last_active_ms,
        )
        for p in project_storage.list_projects()
    ]


@router.post("", response_model=ProjectDto)
def create_project(body: CreateProjectBody):
    p = project_storage.ensure_project(name=body.name, project_id=body.project_id)
    return ProjectDto(
        id=p.id,
        name=p.name,
        created_at_ms=p.created_at_ms,
        archived=p.archived,
        last_active_ms=p.last_active_ms,
    )


@router.patch("/{project_id}", response_model=ProjectDto)
def update_project(project_id: str, body: ProjectArchiveBody):
    try:
        p = project_storage.set_project_archived(project_id=project_id, archived=body.archived)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectDto(
        id=p.id,
        name=p.name,
        created_at_ms=p.created_at_ms,
        archived=p.archived,
        last_active_ms=p.last_active_ms,
    )


@router.delete("/{project_id}")
def delete_project(project_id: str):
    try:
        project_storage.delete_project(project_id=project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@router.get("/{project_id}/files", response_model=list[StoredFileDto])
def list_project_files(project_id: str):
    files = project_storage.list_files(project_id)
    return [
        StoredFileDto(
            id=f.id,
            filename=f.filename,
            content_type=f.content_type,
            size=f.size,
            uploaded_at_ms=f.uploaded_at_ms,
            origin=f.origin,
            has_extracted_text=bool(f.extracted_relpath),
            extracted_at_ms=f.extracted_at_ms,
            extract_error=f.extract_error,
        )
        for f in files
    ]


class CounselMinutesBody(BaseModel):
    slug_keywords: str = Field(..., min_length=1, max_length=200)
    markdown: str = Field(..., min_length=1, max_length=500_000)


@router.post("/{project_id}/counsel-minutes", response_model=StoredFileDto)
def store_counsel_minutes(project_id: str, body: CounselMinutesBody):
    try:
        meta = project_storage.store_counsel_minutes(
            project_id=project_id,
            slug_keywords=body.slug_keywords.strip(),
            markdown=body.markdown,
        )
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return StoredFileDto(
        id=meta.id,
        filename=meta.filename,
        content_type=meta.content_type,
        size=meta.size,
        uploaded_at_ms=meta.uploaded_at_ms,
        origin=meta.origin,
        has_extracted_text=bool(meta.extracted_relpath),
        extracted_at_ms=meta.extracted_at_ms,
        extract_error=meta.extract_error,
    )


@router.get("/{project_id}/files/{file_id}")
def download_project_file(project_id: str, file_id: str):
    try:
        meta, path = project_storage.resolve_file_path(project_id=project_id, file_id=file_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(
        path=str(path),
        media_type=meta.content_type or "application/octet-stream",
        filename=meta.filename,
    )


@router.delete("/{project_id}/files/{file_id}")
def delete_project_file(project_id: str, file_id: str):
    try:
        project_storage.delete_file(project_id=project_id, file_id=file_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


@router.post("/{project_id}/files/ingest-web")
def project_ingest_web(project_id: str, body: IngestWebBody = Body(...)) -> dict[str, Any]:
    """Run one Tavily search per `queries` item, then fetch and store up to `max_pages_ingest` unique URLs as project files."""
    if not project_storage.project_exists(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    out = web_ingest.ingest_tavily_urls_to_project(
        project_id=project_id,
        queries=body.queries,
        max_results_per_query=body.max_results_per_query,
        max_pages_ingest=body.max_pages_ingest,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error") or "Ingest failed")
    return {
        "stored": out.get("stored") or [],
        "notices": out.get("notices") or [],
        "queries_run": out.get("queries_run") or [],
        "urls_considered": int(out.get("urls_considered") or 0),
    }


@router.get("/{project_id}/files/{file_id}/extracted")
def get_project_file_extracted(project_id: str, file_id: str):
    """Return persisted MarkItDown text for a project file (for assistants, UI, exports)."""
    if not project_storage.project_exists(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    files = project_storage.list_files(project_id)
    meta = next((f for f in files if f.id == file_id), None)
    if meta is None:
        raise HTTPException(status_code=404, detail="File not found")
    md = project_storage.read_file_extracted_markdown(project_id, file_id)
    return {
        "filename": meta.filename,
        "markdown": md,
        "extracted_at_ms": meta.extracted_at_ms,
        "extract_error": meta.extract_error,
    }


@router.post("/{project_id}/files/{file_id}/refresh-extraction")
def refresh_project_file_extraction(project_id: str, file_id: str):
    """Re-run MarkItDown on the stored file and update the sidecar."""
    if not project_storage.project_exists(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    updated = project_storage.refresh_file_extraction(project_id=project_id, file_id=file_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="File not found")
    return {
        "ok": True,
        "has_extracted_text": bool(updated.extracted_relpath),
        "extracted_at_ms": updated.extracted_at_ms,
        "extract_error": updated.extract_error,
    }


def _strip_opt(s: Optional[str]) -> Optional[str]:
    t = (s or "").strip()
    return t or None


@router.get("/{project_id}/mindmap/canvas")
def get_saved_mindmap_canvas(project_id: str):
    """Return last saved canvas mindmap for this project, or null if none."""
    if not project_storage.project_exists(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    data = project_storage.read_saved_mindmap(project_id)
    if data is None:
        return {"mindmap": None, "updated_at_ms": None}
    return {
        "mindmap": {"nodes": data["nodes"], "edges": data["edges"]},
        "updated_at_ms": data.get("updated_at_ms") or None,
    }


@router.put("/{project_id}/mindmap/canvas")
def put_saved_mindmap_canvas(project_id: str, body: SavedMindmapCanvasBody):
    """Save the current mindmap JSON to the project (overwrites previous save)."""
    if not project_storage.project_exists(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    mm = body.mindmap
    if not isinstance(mm, dict):
        raise HTTPException(status_code=400, detail="mindmap must be an object")
    nodes = mm.get("nodes")
    edges = mm.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise HTTPException(status_code=400, detail="mindmap must contain nodes and edges arrays")
    ts = project_storage.write_saved_mindmap(project_id, mm)
    return {"ok": True, "updated_at_ms": ts}


@router.post("/{project_id}/mindmap")
def build_mindmap_from_project(
    project_id: str,
    intent: Optional[str] = None,
    body: Optional[BuildMindmapFromProjectBody] = Body(default=None),
):
    # Generate mindmap from stored files; body.file_ids (when provided) restricts which files are used.
    eff_intent = _strip_opt(body.intent if body else None) or _strip_opt(intent)
    bootstrap = bool(body and body.bootstrap_without_sources)

    if not project_storage.project_exists(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    if bootstrap:
        if not eff_intent or len(eff_intent) < 12:
            raise HTTPException(
                status_code=400,
                detail="intent must be at least 12 characters to generate a starter mindmap without sources",
            )
        llm = LlmClient()
        try:
            mindmap = build_mindmap_from_intent_only(llm=llm, intent=eff_intent)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate mindmap JSON: {e}")
        return {"project_id": project_id, "mindmap": mindmap}

    all_meta = project_storage.list_files(project_id)
    if not all_meta:
        raise HTTPException(status_code=400, detail="Project has no stored files")

    if body is not None and body.file_ids is not None:
        if len(body.file_ids) == 0:
            raise HTTPException(status_code=400, detail="No files selected (file_ids is empty)")
        allowed = {f.id for f in all_meta}
        unknown = set(body.file_ids) - allowed
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown file id(s): {', '.join(sorted(unknown)[:10])}",
            )
        pick = {fid for fid in body.file_ids}
        files = [f for f in all_meta if f.id in pick]
    else:
        files = list(all_meta)

    inputs: list[InputFile] = []
    for f in files:
        meta, path = project_storage.resolve_file_path(project_id=project_id, file_id=f.id)
        if not path.exists():
            continue
        pre = project_storage.read_file_extracted_markdown(project_id, f.id)
        inputs.append(
            InputFile(
                filename=meta.filename,
                content_type=meta.content_type,
                content=path.read_bytes(),
                preextracted_markdown=pre,
            )
        )
    if not inputs:
        raise HTTPException(status_code=400, detail="No readable files found for the chosen selection")

    llm = LlmClient()
    try:
        mindmap = build_mindmap_from_files(llm=llm, files=inputs, intent=eff_intent)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate mindmap JSON: {e}")
    return {"project_id": project_id, "mindmap": mindmap}
