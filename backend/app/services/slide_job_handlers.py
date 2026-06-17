"""
Slide-build job execution (shared by API tests and the worker process).

Uses ``LlmClient`` for per-slide HTML (JSON), and ``slide_build_export`` for deck files.
"""

from __future__ import annotations

import json
from typing import Any

from app.services.llm_client import LlmClient
from app.services.ppt_master_bridge import (
    build_engine_from_framework,
    build_ppt_master_meta,
    build_ppt_master_prompt_annex,
)
from app.services.slide_build_artifacts import (
    ensure_session_dirs,
    extract_slide_inner_from_document,
    read_slide_document,
    render_slide_document,
    write_manifest_note,
    write_slide_document,
)
from app.services.slide_build_export import export_deck_files
from app.services.slide_build_session_prefs import load_build_preferences
from app.services.slide_job_store import SlideJobRow, get_session

def run_slide_job(job: SlideJobRow) -> dict[str, Any]:
    sess = get_session(job.session_id)
    if not sess:
        raise ValueError(f"Unknown session {job.session_id}")

    framework = json.loads(sess.framework_json) if sess.framework_json else {}
    payload = json.loads(job.payload_json) if job.payload_json else {}

    if job.kind == "slide_generate":
        return _run_slide_generate(job, framework, payload)
    if job.kind == "export_pptx":
        return _run_export(job, framework, payload, kinds=("pptx",))
    if job.kind == "export_pdf":
        return _run_export(job, framework, payload, kinds=("pdf",))
    raise ValueError(f"Unknown job kind: {job.kind}")


def _find_slide(framework: dict[str, Any], slide_id: str | None) -> dict[str, Any] | None:
    if not slide_id:
        return None
    slides = framework.get("slides")
    if not isinstance(slides, list):
        return None
    for s in slides:
        if isinstance(s, dict) and str(s.get("id") or "") == slide_id:
            return s
    return None


_PPTX_SPEC_DOC = """Parallel object `pptx_spec` drives editable exports (Python-pptx) and must align with slide_inner_html storyline:
- deck_style: one of: consulting_mbb | government | academic | creative (match Deck preset; omit to inherit session outline).
- layout: title_body | title_only | title_subtitle_body | two_column | content_table | kpi_strip | comparison_board | process_flow | timeline | matrix_2x2 | status_board
    • title_body — title + body bullets only.
    • title_only — large title / section divider slides.
    • title_subtitle_body — subtitle line (bold tone) then body bullets.
    • two_column — bullets in left placeholder; optional column_right_bullets or duplicate key insight in subtitle on right.
    • content_table — body narrative plus visual.kind=="table" with headers[] and rows[][]. 
    • kpi_strip — use metrics[{label,value}] rendered as KPI line; bullets optional backup.
    • comparison_board — use visual.kind=="comparison_cards" and visual.columns[{title,subtitle?,items[]}].
    • process_flow — use visual.kind=="process_flow" and visual.steps[{title,detail,outcome?}].
    • timeline — use visual.kind=="timeline" and visual.events[{label|date,title|detail,detail?}].
    • matrix_2x2 — use visual.kind=="matrix" and visual.matrix{x_axis,y_axis,quadrants[{title,detail}]}.
    • status_board — use visual.kind=="status_cards" and visual.cards[{title,status?,detail}].
- title, subtitle, takeaway (one-line punchline / so-what), footer_source (data source / survey line).
- body_bullets: array of { "text": "...", "level": 0-3 } (or plain strings treated as level 0). Mirror Slide JSON main storyline; keep succinct.
- column_right_bullets: same shape — only when layout is two_column.
- visual (optional) richer editable structure:
    • table: { "kind": "table", "headers": ["..."], "rows": [["cell", ...], ...] }
    • comparison_cards: { "kind": "comparison_cards", "columns": [ { "title": "...", "subtitle": "...", "items": ["...", "..."] } ] }
    • process_flow: { "kind": "process_flow", "steps": [ { "title": "...", "detail": "...", "outcome": "..." } ] }
    • timeline: { "kind": "timeline", "events": [ { "label": "...", "detail": "..." } ] }
    • matrix: { "kind": "matrix", "matrix": { "x_axis": "...", "y_axis": "...", "quadrants": [ { "title": "...", "detail": "..." } ] } }
    • status_cards: { "kind": "status_cards", "cards": [ { "title": "...", "status": "...", "detail": "..." } ] }
- metrics: [ { "label": "...", "value": "..." }, ... ]

Do not contradict slide_inner_html messaging; pptx_export focuses on typography + structure patrons edit in PowerPoint."""

_PPTX_SCENE_DOC = """Optional object `pptx_scene` is the high-fidelity editable export contract. Use it when the slide has cards, SVG-like diagrams, image slots, precise shapes, or layout-sensitive text:
- canvas: { "width": 1600, "height": 900 }
- background: "#0f172a"
- elements: ordered array. Every object uses absolute 1600x900 coordinates.
  • text: { "type":"text", "x":120, "y":90, "w":900, "h":70, "text":"...", "fontSize":42, "color":"#f8fafc", "bold":true, "align":"left" }
  • rect / round_rect / ellipse: { "type":"round_rect", "x":120, "y":260, "w":360, "h":420, "fill":"#1e293b", "stroke":"#475569", "strokeWidth":1.5, "radius":24 }
  • line: { "type":"line", "x1":100, "y1":500, "x2":1500, "y2":500, "stroke":"#94a3b8", "strokeWidth":2 }
  • table: { "type":"table", "x":80, "y":180, "w":1440, "h":520, "headers":["..."], "rows":[["..."]], "fontSize":16 }
  • image: { "type":"image", "x":900, "y":180, "w":520, "h":360, "src":"local file path or data:image/png;base64,...", "fit":"cover" }
  • svg: { "type":"svg", "x":900, "y":180, "w":520, "h":360, "svg":"<svg width='520' height='360'>...</svg>" }
- For SVG, prefer simple primitives: rect, circle, ellipse, line, text, and simple M/L/Z paths. Avoid filters, masks, CSS animations, foreignObject, and complex cubic paths if editability matters.
- Keep scene text concise and match the visible HTML wording. Scene coordinates are the source of truth for PPTX sizing and alignment."""

_SLIDE_HTML_SYSTEM = """You are building ONE slide for a PPT-master-based editable slide preview.

Return JSON only (no markdown). Escape quotes and newlines inside strings.

Target schema:
{
  "slide_inner_html": "string — semantic HTML fragment only, no <html> wrapper. Prefer: <h1> action title</h1>, <p class='sub'> subtitle</p>, <div class='body'> key narrative (short bullets <ul><li>…)</div>, <div class='visual'> schematic charts/tables/layout as REAL HTML/CSS (no bitmaps).</div>",
  "speaker_notes": "string — optional one short paragraph for the presenter",
  "pptx_spec": { OBJECT — see parallel PowerPoint brief above },
  "pptx_scene": { OBJECT — see scene contract below; include for layout-sensitive slides }
}

""" + _PPTX_SPEC_DOC + """

""" + _PPTX_SCENE_DOC + """

Image placeholders vs rendered diagrams:
- If the storyline or slide JSON \"visual\"/\"main\" calls for illustrative/photographic/brand imagery OR an infographic that clearly should be raster/vector artwork (photos, cinematic scenes, illustrative hero art), emit a deterministic placeholder wrapper:
  <figure class=\"slide-ai-image-slot\" data-image-prompt=\"CONCISE_ENGLISH_PROMPT_FOR_THE_IMAGE_MODEL\">
    <div class=\"ai-image-placeholder\" style=\"min-height:120px;display:flex;align-items:center;justify-content:center;border:2px dashed #64748b;border-radius:14px;color:#cbd5f5;font-weight:600;letter-spacing:.04em\">
      IMAGE PLACEHOLDER<br/><span style=\"font-size:13px;color:#94a3b8;font-weight:500;display:block;margin-top:6px;text-align:center;max-width:90%\"><!-- short human label echoed from caption --></span>
    </div>
  </figure>
  The data-image-prompt must contain composition, palette mood, symbolism, typography overlay hints, banned elements (unless explicit in slide facts). Never embed external URLs unless the slide explicitly provides them verbatim.
- If the visual requirement is analytic (waterfall / bridge / comparison table / quadrant / KPI strip), IMPLEMENT IT with semantic HTML/CSS + ASCII mini labels inside `.visual`; use placeholders ONLY when wording clearly asks for illustrative/photo/marketing visuals.

Overall constraints:
- Adhere strictly to a 16:9 layout. The preview HTML, `pptx_spec`, and `pptx_scene` must all fit the same 1600×900 / 16:9 canvas without relying on scroll, clipping, or off-canvas content.
- Fill the full 16:9 slide frame. Do not create a small centered card inside the slide; the root content should use the available page.
- Fit mentally in a 1280×720 slide; concise, high signal.
- Stick to the PPT-master color system implied by deck_style / visual_style / design notes. Use the proposed palette consistently for background, card fills, accents, positive/negative states, and muted text; do not introduce random one-off colors.
- Anchor the eye and show information structure with a clear exhibit: hero metric, process infographic, bar vs. line chart choice, 2×2, before/after table, heatmap, waterfall, comparison board, or similar. Use graphics to create contrast and hierarchy; do not produce a wall of text.
- Every normal content slide should include a meaningful visual region. Prefer HTML/CSS charts, comparison tables, KPI strips, matrices, process diagrams, waterfalls, quadrants, or heatmaps. Avoid text-only slides unless the slide is explicitly a title/section divider.
- When the visual region is structured, encode the same structure in `pptx_spec` so editable PPTX export can rebuild it. Prefer comparison boards, process flows, timelines, status boards, and 2x2 matrices over falling back to plain bullets.
- Before returning the JSON, mentally render the slide and check every element for alignment, spacing, and overlap. If any element unnecessarily overlaps, obstructs viewing, falls outside the 16:9 frame, or creates cramped/unreadable text, regenerate that portion of the layout before answering.
- If exact numeric data is unavailable, create a qualitative graph/diagram with clearly labeled axes, categories, relative bars, or flow steps; do not invent exact figures.
- Align with the slide JSON (title, subtitle, main, visual, beat). Do not invent numbers not implied by the text.
- Honour global style questionnaires / palettes when echoed in augmenting notes unless they contradict factual accuracy.

Dark-on-light or light-on-dark styling is fine via inline style on wrapper <div style='…'> rooted inside the slide.
"""


def _extras_from_prefs_and_payload(job: SlideJobRow, payload: dict[str, Any]) -> tuple[str, str]:
    """Return (preference_blob, refs_blob) appended to slide instructions."""
    pref = load_build_preferences(job.session_id)
    blobs: list[str] = []

    sns = str(pref.get("style_notes_full") or "").strip()
    if sns:
        blobs.append("[Build questionnaire bundle]\n" + sns)

    design = pref.get("design") if isinstance(pref.get("design"), dict) else {}
    if design:
        blobs.append("[Design knobs JSON]\n" + json.dumps(design, ensure_ascii=False, indent=2))

    pnotes = payload.get("style_notes")
    if isinstance(pnotes, str) and pnotes.strip():
        blobs.append("[Per-job style notes]\n" + pnotes.strip())

    refs = pref.get("reference_stored_names")
    ref_lines = ""
    if isinstance(refs, list) and refs:
        clean = [str(r) for r in refs if str(r)]
        ref_lines = (
            "[Uploaded reference filenames — mimic hierarchy, whitespace, typography tone; never clone proprietary marks]\n"
            + "\n".join(f"- {r}" for r in clean)
        )

    pref_blob = "\n\n".join([b for b in blobs if b]).strip()
    ref_blob = ref_lines.strip() if ref_lines else ""
    return pref_blob, ref_blob


def _run_slide_generate(
    job: SlideJobRow, framework: dict[str, Any], payload: dict[str, Any]
) -> dict[str, Any]:
    sid = job.slide_id or ""
    slide = _find_slide(framework, sid)
    if not slide:
        raise ValueError(f"No slide with id={sid!r} in session framework")

    client = LlmClient()
    pref = load_build_preferences(job.session_id)
    pref_blob, ref_blob = _extras_from_prefs_and_payload(job, payload)
    build_engine = build_engine_from_framework(framework, pref)
    annex: list[str] = []
    if pref_blob:
        annex.append(pref_blob)
    if ref_blob:
        annex.append(ref_blob)
    annex.append(build_ppt_master_prompt_annex(framework, slide))
    ppt_master_meta: dict[str, Any] | None = build_ppt_master_meta(framework, slide)
    augment = ("\n\n" + "\n\n".join(annex)).rstrip() if annex else ""
    fw_deck = str(framework.get("deck_style") or "consulting_mbb").strip()

    user = (
        "Session deck_style from outline (use in pptx_spec.deck_style when aligning with preset): "
        + fw_deck
        + "\n\nSlide JSON (single slide):\n"
        + json.dumps(slide, ensure_ascii=False, indent=2)
        + ("\n\n" + augment if augment else "")
    )
    data = client.generate_json(
        system=_SLIDE_HTML_SYSTEM,
        user=user,
        max_output_tokens=8192,
    )
    if not isinstance(data, dict):
        raise ValueError("LLM returned non-object JSON")
    inner = (data.get("slide_inner_html") or data.get("html") or "").strip()
    if not inner:
        raise ValueError("LLM returned empty slide_inner_html")

    ensure_session_dirs(job.session_id)
    rel = write_slide_document(job.session_id, sid, inner)
    notes = str(data.get("speaker_notes") or "")[:8000]
    pptx_raw = data.get("pptx_spec")
    pptx_spec: dict[str, Any] = pptx_raw if isinstance(pptx_raw, dict) else {}
    scene_raw = data.get("pptx_scene")
    pptx_scene: dict[str, Any] = scene_raw if isinstance(scene_raw, dict) else {}
    write_manifest_note(
        job.session_id,
        sid,
        {
            "speaker_notes": notes,
            "slide_id": sid,
            "build_engine": build_engine,
            "payload_echo": payload,
            "pptx_spec": pptx_spec,
            "pptx_scene": pptx_scene,
            "ppt_master": ppt_master_meta,
        },
    )
    return {
        "ok": True,
        "kind": "slide_generate",
        "slide_id": sid,
        "html_relative_path": rel,
        "preview_url": f"/slide-build/sessions/{job.session_id}/slides/{sid}/preview",
        "speaker_notes": notes,
    }


def _run_export(
    job: SlideJobRow,
    framework: dict[str, Any],
    payload: dict[str, Any],
    *,
    kinds: tuple[str, ...],
) -> dict[str, Any]:
    ensure_session_dirs(job.session_id)
    # Always refresh both files from current framework (small decks; keeps PDF/PPT in sync)
    paths = export_deck_files(job.session_id, framework)
    out: dict[str, Any] = {
        "ok": True,
        "kind": job.kind,
        "paths": paths,
        "download": {
            "pptx": f"/slide-build/sessions/{job.session_id}/files/pptx",
            "pdf": f"/slide-build/sessions/{job.session_id}/files/pdf",
            "review": f"/slide-build/sessions/{job.session_id}/files/review",
        },
    }
    if kinds == ("pdf",):
        out["primary"] = "pdf"
    elif kinds == ("pptx",):
        out["primary"] = "pptx"
    return out


def read_slide_preview_html(session_id: str, slide_id: str) -> str | None:
    full = read_slide_document(session_id, slide_id)
    if not full:
        return None
    inner = extract_slide_inner_from_document(full)
    return render_slide_document(inner) if inner else full
