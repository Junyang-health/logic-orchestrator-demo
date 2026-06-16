"""Helpers to read/patch slide HTML and apply conversational edits."""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.llm_client import LlmClient
from app.services.slide_build_artifacts import read_slide_document, write_slide_document


def extract_slide_inner_fragment(full_html: str) -> str:
    """Recover inner markup inside `.slide` from the stored preview document."""
    t = full_html or ""
    m = re.search(r"<div\s+class=\"slide\"[^>]*>\s*(.*?)\s*</div>\s*</body>", t, flags=re.DOTALL | re.IGNORECASE)
    if not m:
        m = re.search(r"<body[^>]*>.*?<div[^>]*>\s*(.*?)\s*</div>\s*</body>", t, flags=re.DOTALL | re.IGNORECASE)
    return (m.group(1) or "").strip() if m else ""


_DECK_CHAT_SYSTEM = """You revise ONE slide HTML fragment for a PPT-master slide preview.

Return JSON only (no markdown). Escape quotes and newlines inside strings.

Schema:
{
  "slide_inner_html": "string — semantic HTML fragment only (contents that go inside the slide div). No <html> wrapper.",
  "reply_text": "string — brief friendly note to the user about what changed"
}

Rules:
- Keep the narrative aligned with slide JSON facts; obey the user's instruction unless it contradicts correctness.
- Prefer small targeted edits unless a full rework is explicitly requested.
- Fit mentally in a 1280×720 slide; concise.
- Preserve a strong full-slide visual anchor and presentation structure rather than drifting into a generic text block.
"""


def apply_slide_instruction(
    session_id: str,
    slide_id: str,
    slide_json: dict[str, Any],
    user_message: str,
    *,
    existing_inner: str | None = None,
) -> dict[str, Any]:
    full = read_slide_document(session_id, slide_id)
    inner = existing_inner.strip() if existing_inner else ""
    if not inner and full:
        inner = extract_slide_inner_fragment(full)
    user = json.dumps(slide_json, ensure_ascii=False, indent=2) + "\n\nCurrent inner HTML fragment:\n" + inner
    user += "\n\nUser instruction:\n" + (user_message or "").strip()

    client = LlmClient()
    data = client.generate_json(system=_DECK_CHAT_SYSTEM, user=user, max_output_tokens=8192)
    if not isinstance(data, dict):
        raise ValueError("LLM returned non-object JSON")
    out_inner = (data.get("slide_inner_html") or data.get("html") or "").strip()
    if not out_inner:
        raise ValueError("LLM returned empty slide_inner_html")
    reply = str(data.get("reply_text") or data.get("reply") or "Updated the slide.")
    write_slide_document(session_id, slide_id, out_inner)
    return {"ok": True, "reply": reply.strip()[:4000], "preview_url": f"/slide-build/sessions/{session_id}/slides/{slide_id}/preview"}
