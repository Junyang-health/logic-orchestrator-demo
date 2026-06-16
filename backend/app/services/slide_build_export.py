"""
Build editable PPTX / PDF from framework JSON merged with per-slide ``pptx_spec`` manifests.

HTML slide previews are separate; structured export stays editable in Office.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.slide_build_artifacts import export_pdf_path, export_pptx_path
from app.services.slide_build_pptx_render import build_pptx_with_specs, merged_slide_views


def _pdf_palette(deck_style: str) -> dict[str, tuple[float, float, float]]:
    s = (deck_style or "consulting_mbb").strip().lower()
    if s == "creative":
        return {
            "bg": (0.06, 0.09, 0.16),
            "title": (0.97, 0.98, 1.0),
            "sub": (0.8, 0.84, 0.92),
            "body": (0.88, 0.91, 0.96),
            "muted": (0.58, 0.64, 0.72),
        }
    if s == "academic":
        return {
            "bg": (0.99, 0.99, 0.98),
            "title": (0.13, 0.15, 0.17),
            "sub": (0.28, 0.29, 0.32),
            "body": (0.21, 0.21, 0.21),
            "muted": (0.44, 0.46, 0.5),
        }
    if s == "government":
        return {
            "bg": (1.0, 1.0, 1.0),
            "title": (0.09, 0.17, 0.3),
            "sub": (0.26, 0.32, 0.41),
            "body": (0.2, 0.24, 0.28),
            "muted": (0.47, 0.51, 0.56),
        }
    return {
        "bg": (1.0, 1.0, 1.0),
        "title": (0.12, 0.16, 0.22),
        "sub": (0.28, 0.33, 0.41),
        "body": (0.2, 0.25, 0.33),
        "muted": (0.5, 0.55, 0.62),
    }


def build_pptx_file(session_id: str, framework: dict[str, Any], dest: Path) -> None:
    build_pptx_with_specs(session_id, framework, dest)


def build_pdf_file(session_id: str, framework: dict[str, Any], dest: Path) -> None:
    try:
        from reportlab.lib.pagesizes import landscape  # type: ignore[import-untyped]
        from reportlab.lib.units import inch  # type: ignore[import-untyped]
        from reportlab.pdfgen import canvas  # type: ignore[import-untyped]
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("reportlab is required for PDF export. pip install reportlab") from e

    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h = landscape((13.333 * inch, 7.5 * inch))
    c = canvas.Canvas(str(dest), pagesize=(w, h))

    views = merged_slide_views(session_id, framework)
    if not views:
        views = [{"title": "Empty deck", "subtitle": "", "bullets": [], "takeaway": "", "footer_source": "", "deck_style": "consulting_mbb"}]

    for view in views:
        palette = _pdf_palette(str(view.get("deck_style") or "consulting_mbb"))
        title = str(view.get("title") or "Slide").strip() or "Slide"
        subtitle = str(view.get("subtitle") or "").strip()
        takeaway = str(view.get("takeaway") or "").strip()
        footer = str(view.get("footer_source") or "").strip()

        c.setFillColorRGB(*palette["bg"])
        c.rect(0, 0, w, h, fill=1, stroke=0)

        c.setFillColorRGB(*palette["title"])
        c.setFont("Helvetica-Bold", 22)
        c.drawString(0.55 * inch, h - 0.9 * inch, title[:120])

        y = h - 1.35 * inch
        c.setFont("Helvetica", 12)
        if subtitle:
            c.setFillColorRGB(*palette["sub"])
            c.drawString(0.55 * inch, y, subtitle[:220])
            y -= 0.32 * inch

        c.setFillColorRGB(*palette["body"])
        c.setFont("Helvetica", 11)
        bl = view.get("bullets") if isinstance(view.get("bullets"), list) else []
        for item in bl:
            line = ""
            if isinstance(item, (list, tuple)) and len(item) >= 1:
                line = str(item[0]).strip()
            elif isinstance(item, dict):
                line = str(item.get("text") or "").strip()
            elif isinstance(item, str):
                line = item.strip()
            if not line:
                continue
            rest = line
            while rest:
                chunk, rest = rest[:98], rest[98:]
                c.drawString(0.55 * inch, y, chunk)
                y -= 0.2 * inch
                if y < 0.75 * inch:
                    break
            if y < 0.75 * inch:
                break

        if takeaway:
            c.setFillColorRGB(*palette["muted"])
            c.setFont("Helvetica-Bold", 10)
            yt = takeaway[:400]
            c.drawString(0.55 * inch, max(0.55 * inch, y - 0.15 * inch), yt)
            y = max(0.55 * inch, y - 0.4 * inch)

        if footer:
            c.setFillColorRGB(*palette["muted"])
            c.setFont("Helvetica", 9)
            c.drawString(0.55 * inch, 0.45 * inch, footer[:260])

        c.showPage()

    c.save()


def export_deck_files(session_id: str, framework: dict[str, Any]) -> dict[str, str]:
    """Write deck.pptx + deck.pdf; returns relative paths under data/."""
    from app.services.slide_build_artifacts import DATA_DIR, ensure_session_dirs, export_pdf_path, export_pptx_path

    ensure_session_dirs(session_id)
    pptx_p = export_pptx_path(session_id)
    pdf_p = export_pdf_path(session_id)
    build_pptx_file(session_id, framework, pptx_p)
    build_pdf_file(session_id, framework, pdf_p)

    def rel(p: Path) -> str:
        try:
            return str(p.relative_to(DATA_DIR))
        except ValueError:
            return str(p)

    return {"pptx": rel(pptx_p), "pdf": rel(pdf_p)}
