from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services import project_storage
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


class StoredFileDto(BaseModel):
    id: str
    filename: str
    content_type: Optional[str] = None
    size: int
    uploaded_at_ms: int


class BuildMindmapFromProjectBody(BaseModel):
    """Optional JSON body for POST /projects/{id}/mindmap."""

    intent: Optional[str] = None
    file_ids: Optional[list[str]] = None
    bootstrap_without_sources: bool = False


class SavedMindmapCanvasBody(BaseModel):
    """Body for PUT /projects/{id}/mindmap/canvas — persists the working mindmap."""

    mindmap: dict[str, Any]


@router.get("", response_model=list[ProjectDto])
def list_projects():
    return [ProjectDto(id=p.id, name=p.name, created_at_ms=p.created_at_ms) for p in project_storage.list_projects()]


@router.post("", response_model=ProjectDto)
def create_project(body: CreateProjectBody):
    p = project_storage.ensure_project(name=body.name, project_id=body.project_id)
    return ProjectDto(id=p.id, name=p.name, created_at_ms=p.created_at_ms)


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
        )
        for f in files
    ]


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
        inputs.append(InputFile(filename=meta.filename, content_type=meta.content_type, content=path.read_bytes()))
    if not inputs:
        raise HTTPException(status_code=400, detail="No readable files found for the chosen selection")

    llm = LlmClient()
    try:
        mindmap = build_mindmap_from_files(llm=llm, files=inputs, intent=eff_intent)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate mindmap JSON: {e}")
    return {"project_id": project_id, "mindmap": mindmap}

