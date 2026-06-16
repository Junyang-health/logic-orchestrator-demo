from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_SKILL_ROOT = Path.home() / ".codex" / "skills" / "ppt-master"
_CHARTS_INDEX = _SKILL_ROOT / "templates" / "charts" / "charts_index.json"

_DEFAULT_CANDIDATES = [
    "kpi_cards",
    "vertical_list",
    "icon_grid",
    "bar_chart",
    "comparison_columns",
]

_KEYWORD_CANDIDATES: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("timeline", "milestone", "roadmap"), ("timeline", "roadmap_vertical", "gantt_chart")),
    (("gantt", "schedule", "owner", "deadline"), ("gantt_chart", "project_schedule_table", "timeline")),
    (("process", "workflow", "phase", "step"), ("process_flow", "numbered_steps", "chevron_process")),
    (("funnel", "conversion", "drop-off"), ("funnel_chart", "sankey_chart", "process_flow")),
    (("swot", "bcg", "quadrant", "matrix"), ("quadrant_text_bullets", "matrix_2x2", "quadrant_bubble_scatter")),
    (("compare", "comparison", "vs", "versus"), ("comparison_columns", "comparison_table", "dumbbell_chart")),
    (("table", "grid", "matrix"), ("basic_table", "consulting_table", "feature_matrix_table")),
    (("trend", "growth", "time series", "trajectory"), ("line_chart", "area_chart", "stacked_area_chart")),
    (("share", "mix", "composition", "portion"), ("donut_chart", "stacked_bar_chart", "treemap_chart")),
    (("waterfall", "bridge"), ("waterfall_chart", "bar_chart", "consulting_table")),
    (("kpi", "metric", "dashboard"), ("kpi_cards", "bullet_chart", "gauge_chart")),
    (("hierarchy", "pyramid", "maturity"), ("pyramid_chart", "pyramid_isometric", "top_down_tree")),
    (("customer journey", "journey", "experience"), ("journey_map", "funnel_chart", "timeline")),
)

_STYLE_LAYOUTS = {
    "consulting_mbb": ("ai_ops", "swiss-minimal"),
    "government": ("government_red", "data-journalism"),
    "academic": ("academic_defense", "editorial"),
    "creative": ("psychology_attachment", "soft-rounded"),
}


def build_engine_from_framework(framework: dict[str, Any], prefs: dict[str, Any] | None = None) -> str:
    _ = framework, prefs
    return "ppt_master"


@lru_cache(maxsize=1)
def _chart_summaries() -> dict[str, str]:
    if not _CHARTS_INDEX.is_file():
        return {}
    try:
        data = json.loads(_CHARTS_INDEX.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    charts = data.get("charts")
    if not isinstance(charts, dict):
        return {}
    out: dict[str, str] = {}
    for key, row in charts.items():
        if isinstance(key, str) and isinstance(row, dict):
            summary = row.get("summary")
            if isinstance(summary, str) and summary.strip():
                out[key] = summary.strip()
    return out


def _candidate_templates(slide: dict[str, Any]) -> list[str]:
    haystack = " ".join(
        str(slide.get(k) or "")
        for k in ("title", "subtitle", "beat", "main", "visual")
    ).lower()
    haystack = re.sub(r"\s+", " ", haystack)

    picks: list[str] = []
    for keywords, names in _KEYWORD_CANDIDATES:
        if any(keyword in haystack for keyword in keywords):
            for name in names:
                if name not in picks:
                    picks.append(name)
    for fallback in _DEFAULT_CANDIDATES:
        if fallback not in picks:
            picks.append(fallback)
    return picks[:8]


def build_ppt_master_prompt_annex(framework: dict[str, Any], slide: dict[str, Any]) -> str:
    deck_style = str(framework.get("deck_style") or "consulting_mbb").strip().lower()
    layout_family, visual_style = _STYLE_LAYOUTS.get(deck_style, ("ai_ops", "swiss-minimal"))
    summaries = _chart_summaries()
    candidates = _candidate_templates(slide)
    shortlist = "\n".join(
        f"- {key}: {summaries.get(key, 'Use when the slide content matches this structure.')}"
        for key in candidates
    )
    return (
        "PPT Master build mode is active.\n"
        f"- Preferred layout family: {layout_family}\n"
        f"- Preferred visual style reference: {visual_style}\n"
        "- Use one primary chart / diagram structure from the shortlist below.\n"
        "- Expand the composition to the full 16:9 page. Do not create a small floating card in the middle.\n"
        "- The visual region should carry real information, usually ~45-65% of the slide area.\n"
        "- If the brief asks for illustration or imagery, keep the same placeholder protocol, but still anchor the page with a strong content layout.\n"
        "- Reflect the chosen structure in the slide HTML and keep `pptx_spec` aligned with it.\n"
        "- For editable export parity, prefer explicit structured specs such as comparison_cards, process_flow, timeline, matrix, status_cards, table, and kpi_strip instead of a generic text body.\n\n"
        "PPT Master chart shortlist:\n"
        f"{shortlist}"
    )


def build_ppt_master_meta(framework: dict[str, Any], slide: dict[str, Any]) -> dict[str, Any]:
    deck_style = str(framework.get("deck_style") or "consulting_mbb").strip().lower()
    layout_family, visual_style = _STYLE_LAYOUTS.get(deck_style, ("ai_ops", "swiss-minimal"))
    return {
        "layout_family": layout_family,
        "visual_style": visual_style,
        "candidate_templates": _candidate_templates(slide),
    }


def build_ppt_master_framework_guidance(
    framework: dict[str, Any],
    slides: list[dict[str, Any]],
) -> str:
    deck_style = str(framework.get("deck_style") or "consulting_mbb").strip().lower()
    layout_family, visual_style = _STYLE_LAYOUTS.get(deck_style, ("ai_ops", "swiss-minimal"))
    summaries = _chart_summaries()
    lines = [
        "## PPT_MASTER visual planning (mandatory)",
        f"- Layout family: {layout_family}",
        f"- Visual style: {visual_style}",
        "- For each slide, choose one primary PPT-master chart / diagram family as the visual anchor.",
        "- The visual plan must be full-slide, not a floating card. The anchor should usually occupy about half the page.",
        "- Prefer explicit exhibit structures: chart, table, matrix, process, hierarchy, KPI block, or comparison board.",
        "- Use the shortlist below when writing each slide's `visual` plan.",
        "",
    ]
    for slide in slides:
        title = str(slide.get("title") or "Untitled").strip() or "Untitled"
        slide_id = str(slide.get("id") or "").strip()
        candidates = _candidate_templates(slide)
        pick_lines = []
        for key in candidates[:4]:
            pick_lines.append(f"  - {key}: {summaries.get(key, 'Structured PPT-master visual.')}")
        lines.append(f"Slide {slide_id or '(no id)'} — {title}")
        lines.extend(pick_lines)
        lines.append("")
    return "\n".join(lines).strip()
