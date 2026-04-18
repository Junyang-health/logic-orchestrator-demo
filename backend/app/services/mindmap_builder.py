from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

from app.services.excel_summary import summarize_excel
from app.services.image_summary import summarize_image_with_claude
from app.services.mindmap_service import EvidenceItem, generate_mindmap_json


@dataclass(frozen=True)
class InputFile:
    filename: str
    content_type: Optional[str]
    content: bytes


def _is_excel(filename: str, content_type: Optional[str]) -> bool:
    fn = (filename or "").lower()
    ct = (content_type or "").lower()
    return fn.endswith((".xlsx", ".xls")) or ct in (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    )


def _is_image(filename: str, content_type: Optional[str]) -> bool:
    fn = (filename or "").lower()
    ct = (content_type or "").lower()
    return fn.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")) or ct.startswith("image/")


def _is_pdf(filename: str, content_type: Optional[str]) -> bool:
    fn = (filename or "").lower()
    ct = (content_type or "").lower()
    return fn.endswith(".pdf") or ct == "application/pdf"


def _pdf_page_snippets(*, filename: str, content: bytes, max_pages: int = 25) -> list[EvidenceItem]:
    # Extract short, page-numbered evidence snippets.
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception as e:  # pragma: no cover
        return [EvidenceItem(filename=filename, snippet=f"PDF: {filename} (text extraction unavailable: {e})")]

    items: list[EvidenceItem] = []
    try:
        reader = PdfReader(content)  # type: ignore[arg-type]
    except Exception:
        # pypdf expects a stream; fall back.
        import io

        reader = PdfReader(io.BytesIO(content))

    for i, page in enumerate(reader.pages[:max_pages], start=1):
        try:
            text = (page.extract_text() or "").strip()
        except Exception:
            text = ""
        if not text:
            continue
        # Take the first couple sentences/lines as a "paragraph-ish" quote.
        compact = " ".join(text.split())
        quote = compact[:380]
        items.append(EvidenceItem(filename=filename, snippet=quote, page_number=i))
        if len(items) >= 24:
            break
    if not items:
        items = [EvidenceItem(filename=filename, snippet=f"PDF: {filename} (no extractable text found)")]
    return items


def build_mindmap_from_files(*, llm, files: Sequence[InputFile], intent: Optional[str] = None):
    summaries: list[str] = []
    evidence: list[EvidenceItem] = []

    intent_txt = (intent or "").strip()
    if intent_txt:
        summaries.append(f"User intent / goal:\n{intent_txt}")

    for f in files:
        name = f.filename or "uploaded"
        ct = f.content_type
        data = f.content

        if _is_excel(name, ct):
            xl = summarize_excel(filename=name, content=data)
            summaries.append(xl.summary_text)
            for snip in xl.evidence_snippets[:12]:
                evidence.append(EvidenceItem(filename=name, snippet=snip))
            continue

        if _is_image(name, ct):
            mime = ct or "image/png"
            img = summarize_image_with_claude(filename=name, mime_type=mime, content=data, claude=llm)
            summaries.append(f"Image file: {name}\n{img.description_text}")
            for snip in img.evidence_snippets[:10]:
                evidence.append(EvidenceItem(filename=name, snippet=snip))
            continue

        if _is_pdf(name, ct):
            summaries.append(f"PDF file: {name}")
            evidence.extend(_pdf_page_snippets(filename=name, content=data))
            continue

        summaries.append(f"File: {name}\nUnsupported file type for summarization (content-type: {ct}).")

    return generate_mindmap_json(claude=llm, summaries=summaries, evidence=evidence)

