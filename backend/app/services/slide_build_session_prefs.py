"""Slide-build session preferences and reference uploads (stored under session folder)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from app.services.slide_build_artifacts import ensure_session_dirs, session_dir

PREFS_FILENAME = "build_preferences.json"


def references_dir(session_id: str) -> Path:
    d = session_dir(session_id) / "references"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _prefs_path(session_id: str) -> Path:
    return session_dir(session_id) / PREFS_FILENAME


def load_build_preferences(session_id: str) -> dict[str, Any]:
    fp = _prefs_path(session_id)
    if not fp.is_file():
        return {}
    try:
        out = json.loads(fp.read_text(encoding="utf-8"))
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}


def save_build_preferences(session_id: str, prefs: dict[str, Any]) -> None:
    ensure_session_dirs(session_id)
    blob = json.dumps(prefs, ensure_ascii=False, indent=2)
    _prefs_path(session_id).write_text(blob, encoding="utf-8")


def save_reference_upload(session_id: str, *, original_filename: str, body: bytes) -> str:
    """Write bytes to references/. Returns basename stored."""
    ensure_session_dirs(session_id)
    d = references_dir(session_id)
    safe_base = "".join(c if c.isalnum() or c in ".-_" else "_" for c in (original_filename or "ref")[:96])
    stem = Path(safe_base).stem[:40] or "ref"
    ext = Path(safe_base).suffix[:8] if Path(safe_base).suffix else ""
    nid = uuid.uuid4().hex[:10]
    name = f"{stem}_{nid}{ext}"
    (d / name).write_bytes(body)
    return name


def list_reference_basenames(session_id: str) -> list[str]:
    d = references_dir(session_id)
    if not d.is_dir():
        return []
    return sorted(p.name for p in d.iterdir() if p.is_file())
