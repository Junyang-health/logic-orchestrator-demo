"""Convert office/binary documents to Markdown via Microsoft MarkItDown (for LLM pipelines)."""

from __future__ import annotations

import os
import tempfile
from typing import Any, Optional

# Hard limits (aligned with PPT / browser paths)
MAX_CONTENT_BYTES = 12 * 1024 * 1024
TRUNCATE_MINDMAP_CHARS = 200_000
TRUNCATE_STORE_CHARS = 500_000
TRUNCATE_API_CHARS = 80_000

_markitdown_instance = None  # lazy singleton


def _get_md() -> Any:
    global _markitdown_instance
    if _markitdown_instance is not None:
        return _markitdown_instance
    from markitdown import MarkItDown

    _markitdown_instance = MarkItDown(enable_plugins=False)
    return _markitdown_instance


def extract_bytes_to_markdown(
    filename: str,
    content: bytes,
    *,
    truncate: Optional[int] = None,
) -> tuple[Optional[str], Optional[str]]:
    """
    Return (markdown_text, error_message).
    error_message is set when conversion fails or text is empty.
    """
    if not content:
        return None, "empty file"
    if len(content) > MAX_CONTENT_BYTES:
        return None, f"file too large (max {MAX_CONTENT_BYTES} bytes for extraction)"

    ext = os.path.splitext((filename or "uploaded").split("/")[-1])[1].lower() or ".bin"
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            path = tmp.name
        md = _get_md()
        result = md.convert_local(path)
        text = (result.text_content or "").strip()
        if not text:
            return None, "no extractable text (or empty conversion)"
        if truncate and len(text) > truncate:
            text = text[: truncate - 1] + "…(truncated)"
        return text, None
    except Exception as e:  # noqa: BLE001 — surface conversion issues to caller
        msg = str(e)[:500]
        if "UnsupportedFormat" in e.__class__.__name__ or "unsupported" in msg.lower():
            return None, f"unsupported format: {msg}"
        return None, msg
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass
