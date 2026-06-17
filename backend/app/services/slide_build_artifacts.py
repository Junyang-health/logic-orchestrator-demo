"""
On-disk artifacts for slide-build sessions (HTML previews + export files).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_SESSIONS_ROOT = _DATA_DIR / "slide_sessions"

# Public alias for exporters
DATA_DIR = _DATA_DIR


def sessions_root() -> Path:
    return _SESSIONS_ROOT


def session_dir(session_id: str) -> Path:
    return _SESSIONS_ROOT / session_id


def slides_subdir(session_id: str) -> Path:
    return session_dir(session_id) / "slides"


def export_dir(session_id: str) -> Path:
    return session_dir(session_id) / "export"


def ensure_session_dirs(session_id: str) -> Path:
    root = session_dir(session_id)
    (root / "slides").mkdir(parents=True, exist_ok=True)
    (root / "export").mkdir(parents=True, exist_ok=True)
    return root


def slide_html_path(session_id: str, slide_id: str) -> Path:
    safe = _safe_segment(slide_id)
    return slides_subdir(session_id) / f"{safe}.html"


def _safe_segment(s: str) -> str:
    t = "".join(c if c.isalnum() or c in "-_" else "_" for c in (s or "")[:120])
    return t or "slide"


_SLIDE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Slide</title>
  <style>
    * {{ box-sizing: border-box; }}
    html, body {{ width: 100%; height: 100%; margin: 0; overflow: hidden; background: #1e293b; }}
    body {{ display: block; }}
    .slide {{
      width: 100vw; height: 100vh; min-height: 0; overflow: hidden; background: #0f172a; color: #f8fafc;
      padding: clamp(28px, 6.6vh, 48px) clamp(34px, 4.4vw, 56px); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      box-shadow: none;
    }}
    .slide h1 {{ margin: 0 0 clamp(8px, 1.7vh, 12px); font-size: clamp(28px, 5vw, 44px); font-weight: 700; line-height: 1.12; }}
    .slide .sub {{ font-size: clamp(16px, 2.4vw, 22px); color: #94a3b8; margin-bottom: clamp(16px, 3.6vh, 28px); }}
    .slide .body {{ font-size: clamp(15px, 2.1vw, 20px); line-height: 1.38; max-width: 76%; }}
    .slide .visual {{ margin-top: clamp(16px, 3.6vh, 28px); padding: clamp(14px, 2.8vh, 22px); border-radius: 12px; background: rgba(148,163,184,0.12); border: 1px solid rgba(148,163,184,0.25); }}
    .slide table {{ width: 100%; border-collapse: collapse; }}
    .slide th, .slide td {{ padding: 8px 10px; border-bottom: 1px solid rgba(148,163,184,.28); text-align: left; }}
    .slide .visual {{ min-height: 0; }}
    .slide .visual > table:only-child {{ height: 100%; table-layout: fixed; }}
    .slide .visual > table:only-child th,
    .slide .visual > table:only-child td {{ vertical-align: middle; }}
  </style>
</head>
<body>
  <div class="slide">
___INNER___
  </div>
</body>
</html>
"""


def render_slide_document(inner_html: str) -> str:
    return _SLIDE_TEMPLATE.replace("___INNER___", (inner_html or "").strip())


def extract_slide_inner_from_document(full_html: str) -> str:
    """Recover inner markup from any stored full preview document."""
    t = full_html or ""
    m = re.search(r"<div\s+class=\"slide\"[^>]*>\s*(.*?)\s*</div>\s*</body>", t, flags=re.DOTALL | re.IGNORECASE)
    if not m:
        m = re.search(r"<body[^>]*>.*?<div[^>]*>\s*(.*?)\s*</div>\s*</body>", t, flags=re.DOTALL | re.IGNORECASE)
    return (m.group(1) or "").strip() if m else ""


def write_slide_document(session_id: str, slide_id: str, inner_html: str) -> str:
    """Write full HTML file; returns path relative to backend data root for API responses."""
    ensure_session_dirs(session_id)
    path = slide_html_path(session_id, slide_id)
    doc = render_slide_document(inner_html)
    path.write_text(doc, encoding="utf-8")
    try:
        return str(path.relative_to(_DATA_DIR))
    except ValueError:
        return str(path)


def read_slide_document(session_id: str, slide_id: str) -> str | None:
    path = slide_html_path(session_id, slide_id)
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def export_pptx_path(session_id: str) -> Path:
    return export_dir(session_id) / "deck.pptx"


def export_pdf_path(session_id: str) -> Path:
    return export_dir(session_id) / "deck.pdf"


def write_manifest_note(session_id: str, slide_id: str, meta: dict[str, Any]) -> None:
    ensure_session_dirs(session_id)
    meta_path = slides_subdir(session_id) / f"{_safe_segment(slide_id)}.meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def read_slide_manifest(session_id: str, slide_id: str) -> dict[str, Any] | None:
    path = slides_subdir(session_id) / f"{_safe_segment(slide_id)}.meta.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None
