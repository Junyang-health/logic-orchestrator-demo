"""
Best-effort visual/structural review for slide exports.

PDF can be rendered locally and compared against preview PNGs. Editable PPTX
cannot be rendered reliably without a PowerPoint/LibreOffice renderer, so the
review records structural coverage and explains when visual comparison is skipped.
"""

from __future__ import annotations

import json
import math
import os
import zipfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageStat

from app.services.slide_build_artifacts import export_dir, read_slide_manifest

REVIEW_FILENAME = "export_review.json"
REVIEW_W = 800
REVIEW_H = 450
PASS_SIMILARITY = 0.965
WARN_SIMILARITY = 0.92


def export_review_path(session_id: str) -> Path:
    return export_dir(session_id) / REVIEW_FILENAME


def review_export_consistency(
    session_id: str,
    framework: dict[str, Any],
    *,
    preview_pngs: list[Path],
    pptx_path: Path,
    pdf_path: Path,
) -> dict[str, Any]:
    """Review generated files against preview artifacts and persist a JSON report."""
    preview_source = "provided"
    if not preview_pngs:
        cached = _cached_preview_pngs(session_id)
        if cached:
            preview_pngs = cached
            preview_source = "cached"
    report: dict[str, Any] = {
        "ok": True,
        "status": "pass",
        "summary": [],
        "preview": {
            "slide_count": len(preview_pngs),
            "available": bool(preview_pngs),
            "source": preview_source if preview_pngs else "unavailable",
        },
        "pdf": _review_pdf(session_id, preview_pngs=preview_pngs, pdf_path=pdf_path),
        "pptx": _review_pptx(session_id, framework, preview_pngs=preview_pngs, pptx_path=pptx_path),
    }

    statuses = [str(report[k].get("status")) for k in ("pdf", "pptx") if isinstance(report.get(k), dict)]
    if any(s == "fail" for s in statuses):
        report["ok"] = False
        report["status"] = "fail"
    elif any(s == "warn" for s in statuses):
        report["ok"] = False
        report["status"] = "warn"
    elif all(s == "skipped" for s in statuses):
        report["status"] = "skipped"

    for key in ("pdf", "pptx"):
        row = report.get(key)
        if isinstance(row, dict) and row.get("message"):
            report["summary"].append(f"{key.upper()}: {row['message']}")

    path = export_review_path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def _review_pdf(session_id: str, *, preview_pngs: list[Path], pdf_path: Path) -> dict[str, Any]:
    if not preview_pngs:
        return {
            "status": "skipped",
            "message": "Preview screenshots were unavailable, so PDF visual comparison could not run.",
        }
    if not pdf_path.is_file():
        return {"status": "fail", "message": "PDF file was not generated."}

    rendered_dir = export_dir(session_id) / "export_review" / "pdf_pages"
    try:
        pdf_pngs = _render_pdf_pages(pdf_path, rendered_dir)
    except Exception as e:
        return {
            "status": "skipped",
            "message": f"Could not render PDF for visual comparison ({type(e).__name__}: {e}).",
        }

    if not pdf_pngs:
        return {"status": "fail", "message": "PDF rendered to zero pages."}

    pairs = min(len(preview_pngs), len(pdf_pngs))
    comparisons = [
        _compare_images(preview_pngs[idx], pdf_pngs[idx], idx + 1)
        for idx in range(pairs)
    ]
    avg = sum(float(c["similarity"]) for c in comparisons) / max(len(comparisons), 1)
    status = "pass" if avg >= PASS_SIMILARITY and len(preview_pngs) == len(pdf_pngs) else "warn"
    if avg < WARN_SIMILARITY:
        status = "fail"
    return {
        "status": status,
        "message": (
            f"Compared {pairs} PDF page(s) to preview; average similarity {avg:.3f}."
            + ("" if len(preview_pngs) == len(pdf_pngs) else f" Page count differs: preview={len(preview_pngs)}, pdf={len(pdf_pngs)}.")
        ),
        "average_similarity": round(avg, 4),
        "preview_pages": len(preview_pngs),
        "export_pages": len(pdf_pngs),
        "comparisons": comparisons,
    }


def _review_pptx(
    session_id: str,
    framework: dict[str, Any],
    *,
    preview_pngs: list[Path],
    pptx_path: Path,
) -> dict[str, Any]:
    if not pptx_path.is_file():
        return {"status": "fail", "message": "PPTX file was not generated."}

    slide_ids = _framework_slide_ids(framework)
    scene_count = 0
    for sid in slide_ids:
        meta = read_slide_manifest(session_id, sid) or {}
        if isinstance(meta.get("pptx_scene"), dict) and isinstance(meta.get("pptx_scene", {}).get("elements"), list):
            scene_count += 1

    media_count = _pptx_media_count(pptx_path)
    slide_count = _pptx_slide_count(pptx_path)
    mode = (os.getenv("UNBOX_PPTX_EXPORT_MODE") or "editable").strip().lower()
    if mode in {"image", "preview", "raster"}:
        status = "pass" if preview_pngs and media_count >= len(preview_pngs) else "warn"
        return {
            "status": status,
            "message": "PPTX is preview-image mode; visual parity is expected, editability is limited.",
            "slide_count": slide_count,
            "media_count": media_count,
            "scene_coverage": _coverage(scene_count, len(slide_ids)),
        }

    if slide_ids and scene_count < len(slide_ids):
        return {
            "status": "warn",
            "message": (
                "Editable PPTX was generated by the structured fallback for some slides. "
                "Those slides may not visually match HTML preview; regenerate slides to create pptx_scene."
            ),
            "slide_count": slide_count,
            "media_count": media_count,
            "scene_coverage": _coverage(scene_count, len(slide_ids)),
            "visual_comparison": "skipped: no local PPTX renderer is configured",
        }

    return {
        "status": "skipped",
        "message": (
            "Editable PPTX structure was generated, but visual comparison was skipped because no local "
            "PPTX renderer is configured. PDF comparison is the visual parity gate."
        ),
        "slide_count": slide_count,
        "media_count": media_count,
        "scene_coverage": _coverage(scene_count, len(slide_ids)),
        "visual_comparison": "skipped: no local PPTX renderer is configured",
    }


def _render_pdf_pages(pdf_path: Path, out_dir: Path) -> list[Path]:
    import pypdfium2 as pdfium  # type: ignore[import-untyped]

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("page_*.png"):
        old.unlink()

    doc = pdfium.PdfDocument(str(pdf_path))
    out: list[Path] = []
    try:
        for idx in range(len(doc)):
            page = doc[idx]
            bitmap = page.render(scale=2)
            img = bitmap.to_pil().convert("RGB")
            path = out_dir / f"page_{idx + 1:03d}.png"
            img.save(path)
            out.append(path)
    finally:
        doc.close()
    return out


def _compare_images(preview_path: Path, export_path: Path, slide_number: int) -> dict[str, Any]:
    a = Image.open(preview_path).convert("RGB").resize((REVIEW_W, REVIEW_H))
    b = Image.open(export_path).convert("RGB").resize((REVIEW_W, REVIEW_H))
    diff = ImageChops.difference(a, b).convert("L")
    stat = ImageStat.Stat(diff)
    mean = float(stat.mean[0])
    rms = math.sqrt(float(stat.sum2[0]) / (REVIEW_W * REVIEW_H))
    similarity = max(0.0, 1.0 - mean / 255.0)
    return {
        "slide": slide_number,
        "similarity": round(similarity, 4),
        "mean_delta": round(mean, 3),
        "rms_delta": round(rms, 3),
        "preview": str(preview_path),
        "export": str(export_path),
    }


def _framework_slide_ids(framework: dict[str, Any]) -> list[str]:
    slides = framework.get("slides")
    if not isinstance(slides, list):
        return []
    out: list[str] = []
    for idx, slide in enumerate(slides, start=1):
        if isinstance(slide, dict):
            out.append(str(slide.get("id") or f"slide_{idx}"))
    return out


def _cached_preview_pngs(session_id: str) -> list[Path]:
    preview_dir = export_dir(session_id) / "preview_renders"
    paths = sorted(preview_dir.glob("slide_*.png"))
    return [p for p in paths if p.is_file() and p.stat().st_size > 0]


def _pptx_media_count(pptx_path: Path) -> int:
    try:
        with zipfile.ZipFile(pptx_path) as zf:
            return len([n for n in zf.namelist() if n.startswith("ppt/media/")])
    except Exception:
        return 0


def _pptx_slide_count(pptx_path: Path) -> int:
    try:
        with zipfile.ZipFile(pptx_path) as zf:
            return len([n for n in zf.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")])
    except Exception:
        return 0


def _coverage(done: int, total: int) -> dict[str, Any]:
    pct = 1.0 if total <= 0 else done / total
    return {"with_scene": done, "total": total, "ratio": round(pct, 4)}
