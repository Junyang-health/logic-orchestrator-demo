from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.markitdown_extract import TRUNCATE_STORE_CHARS, extract_bytes_to_markdown


_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_PROJECTS_DIR = _DATA_DIR / "projects"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _safe_project_id(raw: str) -> str:
    s = (raw or "").strip().lower()
    s = re.sub(r"[^a-z0-9_-]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or f"project-{uuid.uuid4().hex[:8]}"


def _safe_filename(raw: str) -> str:
    # Preserve extension when possible; strip path separators.
    name = (raw or "uploaded").split("/")[-1].split("\\")[-1]
    name = re.sub(r"[\x00-\x1f]+", "", name).strip()
    return name or "uploaded"


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    created_at_ms: int


@dataclass(frozen=True)
class StoredFile:
    id: str
    filename: str
    content_type: str | None
    size: int
    stored_relpath: str
    uploaded_at_ms: int
    # MarkItDown (or future) text sidecar: files/extracted/{id}.md
    extracted_relpath: str | None = None
    extracted_at_ms: int | None = None
    extract_error: str | None = None


def _project_dir(project_id: str) -> Path:
    return _PROJECTS_DIR / project_id


def _project_manifest(project_id: str) -> Path:
    return _project_dir(project_id) / "project.json"


def _files_manifest(project_id: str) -> Path:
    return _project_dir(project_id) / "files.json"


def _mindmap_canvas_path(project_id: str) -> Path:
    return _project_dir(project_id) / "mindmap_canvas.json"


def project_exists(project_id: str) -> bool:
    return _project_manifest(project_id).exists()


def read_saved_mindmap(project_id: str) -> dict[str, Any] | None:
    """Return on-disk canvas mindmap {nodes, edges, updated_at_ms} or None if missing/invalid."""
    path = _mindmap_canvas_path(project_id)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        nodes = raw.get("nodes")
        edges = raw.get("edges")
        if not isinstance(nodes, list) or not isinstance(edges, list):
            return None
        return {
            "nodes": nodes,
            "edges": edges,
            "updated_at_ms": int(raw.get("updated_at_ms") or 0),
        }
    except Exception:
        return None


def write_saved_mindmap(project_id: str, mindmap: dict[str, Any]) -> int:
    """Persist canvas mindmap {nodes, edges}; returns updated_at_ms. Caller must ensure project exists."""
    pdir = _project_dir(project_id)
    pdir.mkdir(parents=True, exist_ok=True)
    ts = _now_ms()
    nodes = mindmap.get("nodes") if isinstance(mindmap.get("nodes"), list) else []
    edges = mindmap.get("edges") if isinstance(mindmap.get("edges"), list) else []
    payload = {"updated_at_ms": ts, "nodes": nodes, "edges": edges}
    _mindmap_canvas_path(project_id).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return ts


def ensure_project(*, name: str, project_id: str | None = None) -> Project:
    pid = _safe_project_id(project_id or name)
    pdir = _project_dir(pid)
    pdir.mkdir(parents=True, exist_ok=True)
    mf = _project_manifest(pid)
    if mf.exists():
        try:
            raw = json.loads(mf.read_text(encoding="utf-8"))
            return Project(id=pid, name=str(raw.get("name") or name), created_at_ms=int(raw.get("created_at_ms") or 0))
        except Exception:
            pass
    proj = Project(id=pid, name=(name or pid), created_at_ms=_now_ms())
    mf.write_text(json.dumps({"id": proj.id, "name": proj.name, "created_at_ms": proj.created_at_ms}, indent=2), encoding="utf-8")
    if not _files_manifest(pid).exists():
        _files_manifest(pid).write_text("[]", encoding="utf-8")
    return proj


def list_projects() -> list[Project]:
    if not _PROJECTS_DIR.exists():
        return []
    out: list[Project] = []
    for p in sorted(_PROJECTS_DIR.iterdir()):
        if not p.is_dir():
            continue
        pid = p.name
        mf = _project_manifest(pid)
        if not mf.exists():
            continue
        try:
            raw = json.loads(mf.read_text(encoding="utf-8"))
            out.append(
                Project(
                    id=str(raw.get("id") or pid),
                    name=str(raw.get("name") or pid),
                    created_at_ms=int(raw.get("created_at_ms") or 0),
                )
            )
        except Exception:
            continue
    return out


def _stored_file_from_row(r: dict[str, Any]) -> StoredFile:
    ex_at = r.get("extracted_at_ms")
    return StoredFile(
        id=str(r.get("id") or ""),
        filename=str(r.get("filename") or ""),
        content_type=(str(r.get("content_type")) if r.get("content_type") is not None else None),
        size=int(r.get("size") or 0),
        stored_relpath=str(r.get("stored_relpath") or ""),
        uploaded_at_ms=int(r.get("uploaded_at_ms") or 0),
        extracted_relpath=(str(r.get("extracted_relpath")) if r.get("extracted_relpath") else None) or None,
        extracted_at_ms=(int(ex_at) if ex_at is not None and str(ex_at) != "" else None),
        extract_error=(str(r.get("extract_error")) if r.get("extract_error") is not None else None) or None,
    )


def _stored_file_to_row(f: StoredFile) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": f.id,
        "filename": f.filename,
        "content_type": f.content_type,
        "size": f.size,
        "stored_relpath": f.stored_relpath,
        "uploaded_at_ms": f.uploaded_at_ms,
    }
    if f.extracted_relpath is not None:
        d["extracted_relpath"] = f.extracted_relpath
    if f.extracted_at_ms is not None:
        d["extracted_at_ms"] = f.extracted_at_ms
    if f.extract_error is not None:
        d["extract_error"] = f.extract_error
    return d


def list_files(project_id: str) -> list[StoredFile]:
    mf = _files_manifest(project_id)
    if not mf.exists():
        return []
    try:
        raw = json.loads(mf.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        out: list[StoredFile] = []
        for r in raw:
            if not isinstance(r, dict):
                continue
            sf = _stored_file_from_row(r)
            out.append(sf)
        return [f for f in out if f.id and f.stored_relpath]
    except Exception:
        return []


def read_file_extracted_markdown(project_id: str, file_id: str) -> str | None:
    """Read persisted Markdown for a file, if extraction succeeded and sidecar exists."""
    files = list_files(project_id)
    for f in files:
        if f.id != file_id or not f.extracted_relpath:
            continue
        p = _project_dir(project_id) / f.extracted_relpath
        if not p.exists():
            return None
        try:
            return p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
    return None


def store_file(*, project_id: str, filename: str, content_type: str | None, content: bytes) -> StoredFile:
    pdir = _project_dir(project_id)
    pdir.mkdir(parents=True, exist_ok=True)
    files_dir = pdir / "files"
    files_dir.mkdir(parents=True, exist_ok=True)

    fid = uuid.uuid4().hex[:12]
    safe_name = _safe_filename(filename)
    stored_name = f"{fid}__{safe_name}"
    stored_path = files_dir / stored_name
    stored_path.write_bytes(content)

    ex_at = _now_ms()
    ex_rel: str | None = None
    ex_err: str | None = None
    text, err = extract_bytes_to_markdown(safe_name, content, truncate=TRUNCATE_STORE_CHARS)
    if text and not err:
        ex_dir = pdir / "files" / "extracted"
        ex_dir.mkdir(parents=True, exist_ok=True)
        ex_name = f"{fid}.md"
        ex_path = ex_dir / ex_name
        ex_path.write_text(text, encoding="utf-8")
        ex_rel = str(Path("files") / "extracted" / ex_name)
    else:
        ex_err = err or "empty extract"

    meta = StoredFile(
        id=fid,
        filename=safe_name,
        content_type=content_type,
        size=len(content),
        stored_relpath=str(Path("files") / stored_name),
        uploaded_at_ms=ex_at,
        extracted_relpath=ex_rel,
        extracted_at_ms=ex_at,
        extract_error=None if ex_rel else (ex_err[:2000] if ex_err else "unknown"),
    )

    mf = _files_manifest(project_id)
    existing = list_files(project_id)
    mf.write_text(
        json.dumps([*[_stored_file_to_row(f) for f in existing], _stored_file_to_row(meta)], indent=2),
        encoding="utf-8",
    )
    return meta


def refresh_file_extraction(*, project_id: str, file_id: str) -> StoredFile | None:
    """Re-run MarkItDown on the stored binary and update sidecar + manifest."""
    try:
        meta, path = resolve_file_path(project_id=project_id, file_id=file_id)
    except FileNotFoundError:
        return None
    if not path.exists():
        return None
    content = path.read_bytes()
    text, err = extract_bytes_to_markdown(meta.filename, content, truncate=TRUNCATE_STORE_CHARS)
    ts = _now_ms()
    pdir = _project_dir(project_id)
    ex_rel: str | None = None
    if text and not err:
        ex_dir = pdir / "files" / "extracted"
        ex_dir.mkdir(parents=True, exist_ok=True)
        ex_name = f"{file_id}.md"
        ex_path = ex_dir / ex_name
        ex_path.write_text(text, encoding="utf-8")
        ex_rel = str(Path("files") / "extracted" / ex_name)
    else:
        if meta.extracted_relpath:
            old = pdir / meta.extracted_relpath
            if old.exists():
                try:
                    old.unlink()
                except OSError:
                    pass
    new = StoredFile(
        id=meta.id,
        filename=meta.filename,
        content_type=meta.content_type,
        size=meta.size,
        stored_relpath=meta.stored_relpath,
        uploaded_at_ms=meta.uploaded_at_ms,
        extracted_relpath=ex_rel,
        extracted_at_ms=ts,
        extract_error=None if ex_rel else ((err or "empty extract")[:2000]),
    )
    files = list_files(project_id)
    merged = [new if f.id == file_id else f for f in files]
    _files_manifest(project_id).write_text(
        json.dumps([_stored_file_to_row(f) for f in merged], indent=2), encoding="utf-8"
    )
    return new


def resolve_file_path(*, project_id: str, file_id: str) -> tuple[StoredFile, Path]:
    files = list_files(project_id)
    for f in files:
        if f.id == file_id:
            p = _project_dir(project_id) / f.stored_relpath
            return f, p
    raise FileNotFoundError(file_id)


def delete_file(*, project_id: str, file_id: str) -> None:
    mf = _files_manifest(project_id)
    files = list_files(project_id)
    kept: list[StoredFile] = []
    deleted: StoredFile | None = None
    deleted_path: Path | None = None
    for f in files:
        if f.id == file_id:
            deleted = f
            deleted_path = _project_dir(project_id) / f.stored_relpath
        else:
            kept.append(f)
    if deleted is None:
        raise FileNotFoundError(file_id)
    if deleted_path and deleted_path.exists():
        deleted_path.unlink()
    if deleted.extracted_relpath:
        ex = _project_dir(project_id) / deleted.extracted_relpath
        if ex.exists():
            try:
                ex.unlink()
            except OSError:
                pass
    mf.write_text(json.dumps([_stored_file_to_row(f) for f in kept], indent=2), encoding="utf-8")

