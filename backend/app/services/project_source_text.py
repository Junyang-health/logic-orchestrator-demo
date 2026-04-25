"""Load extracted / readable text from project files for LLM prompts (MECE, assistant chat, apply)."""

from __future__ import annotations

import io
from typing import Sequence

from app.services import project_storage


def collect_project_source_text(
    project_id: str,
    *,
    max_chars: int = 50_000,
    file_ids: Sequence[str] | None = None,
) -> str:
    """
    Concatenate per-file headers and text chunks up to `max_chars`.
    Prefers MarkItDown sidecars from project_storage; falls back to PDF text / plain files.
    """
    pid = (project_id or "").strip()
    if not pid or not project_storage.project_exists(pid):
        return ""
    parts: list[str] = []
    total = 0
    listed = project_storage.list_files(pid)
    if file_ids is not None and len(file_ids) == 0:
        return "(no file ids selected)"
    if file_ids is not None:
        by_id = {f.id: f for f in listed}
        order = [by_id[i] for i in file_ids if str(i).strip() in by_id]
    else:
        order = listed[:24]

    for sf in order:
        if total >= max_chars:
            break
        try:
            _, path = project_storage.resolve_file_path(project_id=pid, file_id=sf.id)
        except FileNotFoundError:
            continue
        if not path.exists():
            continue
        fn = sf.filename or path.name
        extracted = project_storage.read_file_extracted_markdown(pid, sf.id)
        if extracted and extracted.strip():
            chunk = extracted[: min(8000, max_chars - total)]
            parts.append(f"### FILE: {fn}\n{chunk}")
            total += len(chunk)
            continue
        raw = path.read_bytes()
        low = fn.lower()
        chunk = ""
        try:
            if low.endswith(".pdf") or (sf.content_type or "").lower() == "application/pdf":
                try:
                    from pypdf import PdfReader  # type: ignore
                except Exception:
                    chunk = f"[PDF {fn}: extraction unavailable]\n"
                else:
                    try:
                        reader = PdfReader(io.BytesIO(raw))
                    except Exception:
                        reader = PdfReader(raw)
                    buf: list[str] = []
                    for page in reader.pages[:18]:
                        try:
                            t = (page.extract_text() or "").strip()
                        except Exception:
                            t = ""
                        if t:
                            buf.append(" ".join(t.split())[:700])
                        if sum(len(x) for x in buf) > 10000:
                            break
                    chunk = "\n".join(buf)
            elif low.endswith((".md", ".txt", ".csv", ".json")) or (sf.content_type or "").startswith("text/"):
                chunk = raw.decode("utf-8", errors="ignore")
            else:
                chunk = f"[Binary or unsupported: {fn}]\n"
        except Exception as e:  # noqa: BLE001 — best-effort file read
            chunk = f"[Could not read {fn}: {e}]\n"
        chunk = chunk[: min(8000, max(0, max_chars - total))]
        parts.append(f"### FILE: {fn}\n{chunk}")
        total += len(chunk)
    return "\n\n".join(parts) if parts else "(no readable project files)"


def load_for_assistant_prompt(
    project_id: str | None,
    *,
    include: bool,
    max_chars: int,
    file_ids: Sequence[str] | None = None,
) -> str | None:
    """
    Returns text to append to an assistant user prompt, or None to omit the block entirely
    (disabled, no id, max_chars 0, or empty file selection).

    ``file_ids``:
    - ``None`` — include all project files (up to cap / internal limit in collect_project_source_text).
    - ``[]`` — no files.
    - non-empty — only those file ids, in the given order.
    """
    if not include or max_chars <= 0:
        return None
    pid = (project_id or "").strip()
    if not pid:
        return None
    if not project_storage.project_exists(pid):
        return f"(Project not found: {pid})"
    if file_ids is not None and len(file_ids) == 0:
        return None
    return collect_project_source_text(pid, max_chars=max_chars, file_ids=file_ids)
