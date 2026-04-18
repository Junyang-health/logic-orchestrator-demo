from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.llm_client import LlmClient
from app.services import project_storage
from app.services.mindmap_builder import InputFile, build_mindmap_from_files

router = APIRouter()


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


@router.get("/mindmap")
def mindmap_help():
    return {
        "detail": "Use POST /mindmap (or POST /upload) with multipart/form-data field 'files' to generate a mindmap."
    }

