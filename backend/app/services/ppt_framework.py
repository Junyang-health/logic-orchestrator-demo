from __future__ import annotations

import json
import uuid
from typing import Any

from app.services.tavily_search import format_results_for_prompt, tavily_search
from app.services.llm_client import LlmClient
from app.services.ppt_master_bridge import build_ppt_master_framework_guidance

# Shown in user prompt so the model aligns titles, phrasing, and the "visual" field.
DECK_STYLE_SPECS: dict[str, str] = {
    "consulting_mbb": (
        "Professional consulting (MBB-style). "
        "Pyramid / answer-first: action titles that state the so-what, not just topics. "
        "Crisp, confident, number-led where possible; 1 key message + supporting proof per slide. "
        "Visually: clean grids, consistent chart grammar (e.g. waterfall, bridge, 2x2, grouped bars), limited color for emphasis, "
        "tight table-driven comparisons; avoid decorative clutter. Executive-ready layout."
    ),
    "government": (
        "Government / formal reporting. "
        "Neutral, precise, policy- and process-oriented; explicit scope, limitations, and stakeholders. "
        "Hierarchical sectioning; clear references to time periods, geographies, and mandates. "
        "Visually: high legibility, accessible contrast, table-heavy and structured data blocks, appendices feel; "
        "charts conservative (line/bar), minimal marketing flair. Avoid hype; emphasize accountability and compliance framing."
    ),
    "academic": (
        "Academic / research presentation. "
        "Explicit methodology, methods, and limitations; citation-framed claims where natural. "
        "Structured argument: question → methods → results → discussion; define terms. "
        "Visually: figures, equations or notation where relevant, data plots with axes explained, table summaries of results; "
        "avoid punchy ad-style titles—prefer precise, information-dense titles."
    ),
    "creative": (
        "Creative / high-impact deck. "
        "Bold, memorable, audience-centric storytelling; can use contrast, surprise, and metaphor (still grounded in the mindmap). "
        "Room for non-linear flow when it helps retention. "
        "Visually: strong focal imagery, custom infographic metaphors, dramatic before/after, annotated photography or illustration concepts; "
        "charts/tables still used for proof but may be more stylized; whitespace and single hero visuals encouraged."
    ),
}


def _normalize_deck_style(value: str | None) -> str:
    v = (value or "consulting_mbb").strip().lower()
    if v in DECK_STYLE_SPECS:
        return v
    return "consulting_mbb"


# Slide information density + default exhibit grammar (consulting-style decks).
# Referenced by skeleton / enrich / chat / reconcile so generation stays aligned with export prompts.
PPT_SLIDE_LAYOUT_AND_EXHIBIT_RULES = """
## Slide density (mandatory taxonomy)
Classify every slide as **Standard** or **Dense**. The **first line** of the `visual` field must be exactly one of:
- `Density: Standard`
- `Density: Dense`

**Standard** — baseline load. The `visual` plan must cover these zones (title/subtitle already map to JSON `title` / `subtitle`):
1. **Title zone** — action / conclusion title (the so-what).
2. **Subtitle** — one supporting line under the title.
3. **Main exhibit** — the single dominant visual that proves the message (hero chart, diagram, or table).
4. **Key highlight** — bottom band or callout: the one-line takeaway the audience must remember.
5. **Footer** — data / source line (survey name, period, database, document, or analyst note).

**Dense** — for **key supporting evidence** (e.g. market statistics, head-to-head comparisons, valuation / bridge logic). Same title, subtitle, key highlight, and footer as Standard, but instead of one main exhibit, specify **up to four exhibits** in **logical sequence** (label **Exhibit 1** … **Exhibit 4** in the `visual` text). Each exhibit should be compact and scannable.

## Exhibit type reference (pick the graphic to match the analysis)
- **Market / trend data** → **Trend graph** (time series). Differentiate key periods or segments with color; include axis labels, units, and the critical numeric labels.
- **Competitive comparison** → **Matrix table** (players or options × criteria; contrasts must be explicit).
- **Value creation / variance** → **Value bridge** (waterfall / bridge from start value to end value).
- **Risk / exposure** → **Heatmap** (two-dimensional intensity grid; legend + axis labels).

Unless the user's brief explicitly overrides, apply these density and exhibit conventions together with **DECK_STYLE**.
""".strip()


def _format_deck_style_block(deck_style: str) -> str:
    key = _normalize_deck_style(deck_style)
    label = {
        "consulting_mbb": "Professional consulting (MBB-style)",
        "government": "Government / formal reporting",
        "academic": "Academic / research",
        "creative": "Creative / high-impact",
    }.get(key, key)
    spec = DECK_STYLE_SPECS.get(key, DECK_STYLE_SPECS["consulting_mbb"])
    return "\n\n".join(
        [
            f"**Preset:** {label}",
            f"**Apply to the whole framework:** {spec}",
            "Shape slide titles, subtitle tone, the `main` narrative, and the `visual` field (formality, chart types, table density) accordingly.",
        ]
    )

PPT_FRAMEWORK_GENERATE_SYSTEM = """You are an expert at structuring business and technical slide decks. Return JSON only. No markdown fences.

JSON rules: every string value must be valid JSON — escape double quotes as \\" and line breaks as \\n inside strings. Do not put raw line breaks inside quoted strings.

Schema:
{
  "slides": [
    {
      "id": "optional_string",
      "title": "string",
      "subtitle": "string",
      "main": "string: narrative and messages — the ideas, story, and what the audience should take away (not the graphic spec; keep that in visual)",
      "visual": "string: REQUIRED — First line MUST be `Density: Standard` or `Density: Dense` (see layout rules in the system prompt). Then: (1) the visual ANCHOR (hero image, big number, key diagram, or focal zone), and (2) how CONTENT is PRESENTED for emphasis and contrast. Prioritize info-dense yet scannable forms: infographics, charts (type + what is compared), and tables (rows/columns and what they contrast). Standard = one main exhibit + key highlight zone + source footer; Dense = up to four sequenced exhibits (Exhibit 1–4) + same highlight + footer. State layout intent (e.g. split 60/40 chart vs. narrative, callout panel, two-column before/after) so a designer or image model can build it. Avoid text-only default — prefer a graphic, chart, or table to carry the proof or structure."
    }
  ]
}

Rules:
- Produce a coherent narrative across slides; align with the user's intent, audience, page budget, and style notes.
- A **DECK_STYLE** block in the user message defines preset tone, formality, and visual conventions. Follow it for every slide: titles, phrasing, and both "main" and "visual" fields.
- Ground claims in the mindmap outline and source material. If data is missing, state assumptions briefly in the "main" or "visual" text for that slide.
- Each "main" should be 2–5 short paragraphs or bullet-style lines (as plain text), focused on content and message.
- "subtitle" is the supporting one-liner under the title (not the same as "main").
- "visual" must be substantive on every slide: always name the primary graphic vehicle and how it creates highlight vs. supporting text.
""" + "\n\n" + PPT_SLIDE_LAYOUT_AND_EXHIBIT_RULES


PPT_FRAMEWORK_CHAT_SYSTEM = """You help refine a PowerPoint *framework* (outline per slide, not final pixel design). Return JSON only. No markdown fences.

JSON rules: escape quotes and newlines inside string values (use \\n, never raw newlines inside strings).

Schema:
{
  "reply": "string — natural language to the user summarizing what you changed or answering their question",
  "slides": [
    {
      "id": "string (preserve stable ids when possible)",
      "title": "string",
      "subtitle": "string",
      "main": "string",
      "visual": "string — same meaning as in generation: visual anchor + how content is presented; prefer infographics, charts, and tables for highlight and contrast"
    }
  ]
}

Rules:
- "slides" must be the full updated list after edits (reordered, added, or removed slides as requested). Every slide must include "main" and "visual".
- The user message may include a **DECK_STYLE** preset and optional extra style text—keep outputs consistent with that style when editing.
- Keep slide count reasonable vs the page budget unless the user clearly wants a different number.
- When only one slide is in focus, still return the full "slides" array.
- If the user reorders slides, return them in the new order with ids preserved from the input where possible.
- Ground changes in the mindmap and source context when relevant.
- When the user asks for "more visual" or "more data", strengthen "visual" with chart/table/infographic specifics.
- Keep PPT-master visual planning discipline: one clear anchor structure per slide, with explicit exhibit grammar and page-filling composition.
- **OUTPUT LANGUAGE** in the user message: `reply` and all slide text must follow it.
""" + "\n\n" + PPT_SLIDE_LAYOUT_AND_EXHIBIT_RULES


def _format_skills_block(
    custom_skills: list[dict[str, Any]], builtin_skills: dict[str, bool]
) -> str:
    parts: list[str] = []
    for s in custom_skills:
        if not isinstance(s, dict):
            continue
        if s.get("enabled") is False:
            continue
        name = str(s.get("name") or "Skill").strip() or "Skill"
        instr = str(s.get("instruction") or "").strip()
        if not instr:
            continue
        parts.append(f"- **{name}**: {instr}")
    if builtin_skills.get("webSearch"):
        parts.append(
            "- **Web search (builtin)**: Use only Tavily results when present; do not invent URLs."
        )
    if builtin_skills.get("financialAnalyst"):
        parts.append(
            "- **Financial analyst (builtin)**: Prefer metrics, risks, and clear quant framing where useful."
        )
    if not parts:
        return "(no extra skills — use your best judgment)"
    return "\n".join(parts)


def _trim(s: str, max_chars: int) -> str:
    t = (s or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 20] + "\n…(truncated)"


def _is_punct_or_digit(ch: str) -> bool:
    o = ord(ch)
    if ch.isspace():
        return True
    if ch in ".,;:!?·…\":/\\-()[]{}%&%#@$*+=_<>«»''\"…":
        return True
    if "0" <= ch <= "9":
        return True
    if o == 0x3000:  # full-width space
        return True
    return False


def _script_scores_weighted(text: str, w: float) -> dict[str, float]:
    """Rough script masses for output-language choice (not linguistic segmentation)."""
    s = {
        "latin": 0.0,
        "cjk": 0.0,
        "kana": 0.0,
        "hangul": 0.0,
        "cyrillic": 0.0,
        "arabic": 0.0,
        "thai": 0.0,
        "hebrew": 0.0,
        "other_letter": 0.0,
    }
    for ch in text:
        if _is_punct_or_digit(ch):
            continue
        o = ord(ch)
        if 0x3040 <= o <= 0x30FF:
            s["kana"] += w
        elif 0x4E00 <= o <= 0x9FFF:
            s["cjk"] += w
        elif 0x3400 <= o <= 0x4DBF:  # CJK ext A
            s["cjk"] += w
        elif 0xAC00 <= o <= 0xD7A3:
            s["hangul"] += w
        elif 0x0400 <= o <= 0x052F or 0x2DE0 <= o <= 0x2DFF or 0xA640 <= o <= 0xA69F:
            s["cyrillic"] += w
        elif 0x0600 <= o <= 0x06FF or 0xFB50 <= o <= 0xFDFF or 0xFE70 <= o <= 0xFEFF:
            s["arabic"] += w
        elif 0x0E00 <= o <= 0x0E7F:
            s["thai"] += w
        elif 0x0590 <= o <= 0x05FF or 0xFB1D <= o <= 0xFB4F:
            s["hebrew"] += w
        elif ch.isalpha():
            if (
                0x0041 <= o <= 0x007A
                or 0x00C0 <= o <= 0x024F
                or 0x1E00 <= o <= 0x1EFF
                or 0x2C60 <= o <= 0x2C7F
            ):
                s["latin"] += w
            else:
                s["other_letter"] += w
    return s


def _merge_script_scores(
    a: dict[str, float], b: dict[str, float], c: dict[str, float]
) -> dict[str, float]:
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    for k, v in c.items():
        out[k] = out.get(k, 0.0) + v
    return out


def _classify_brief_output_language(
    intent: str, audience: str, style: str
) -> str:
    """
    Returns a one-line model-facing label, e.g. "English" or
    "Chinese (Simplified) — use for all user-visible strings in JSON".
    """
    a = _script_scores_weighted(intent, 3.0)
    b = _script_scores_weighted(audience, 2.0)
    c = _script_scores_weighted(style, 1.0)
    t = _merge_script_scores(a, b, c)
    latin = t["latin"]
    cjk = t["cjk"]
    kana = t["kana"]
    hangul = t["hangul"]
    cyr = t["cyrillic"]
    ar = t["arabic"]
    th = t["thai"]
    he = t["hebrew"]
    oth = t["other_letter"]
    total_letters = latin + cjk + kana + hangul + cyr + ar + th + he + oth
    if total_letters < 1.0:
        return "English (default — user brief is empty or non-letter)"

    cjk_ja = cjk + kana
    kana_ratio = kana / (cjk_ja + 0.01)

    if hangul >= max(cjk, latin, cyr) * 0.65 and hangul >= 0.5:
        return "Korean — all titles, subtitles, beat, main, visual, and reply text in natural Korean"
    if cjk_ja > 0 and (kana_ratio >= 0.1 or (kana >= 2.0 and cjk_ja > latin * 0.2)):
        return "Japanese — all titles, subtitles, beat, main, visual, and reply text in natural Japanese (including 横書き / appropriate forms)"
    if cjk > latin * 0.3 and cjk > hangul * 0.4:
        return "Chinese (Simplified) — all titles, subtitles, beat, main, visual, and reply text in Simplified Chinese unless the user clearly writes Traditional in the **Intent**"
    if cyr > max(latin, cjk, hangul) * 0.5 and cyr >= 0.5:
        return "Cyrillic (e.g. Russian) — follow the same language the user used in the **Intent** for all slide text and the reply"
    if ar > max(latin, cjk, hangul) * 0.5 and ar >= 0.5:
        return "Arabic — all slide text and the reply in Arabic (appropriate script direction; numbers can follow user norms)"
    if th > max(latin, cjk) * 0.5 and th >= 0.5:
        return "Thai — all slide text and the reply in Thai"
    if he > max(latin, cjk) * 0.5 and he >= 0.5:
        return "Hebrew — all slide text and the reply in Hebrew"
    if latin >= max(cjk, hangul, cyr, ar, th, he) * 0.7:
        return "English or the same Latin-script language as the **Intent** — if the user wrote in another Latin language (e.g. French, Spanish, Vietnamese with Latin letters), use that language for all fields; if clearly English, use English"
    if oth > 0.3:
        return "The same language as the **Intent** / **Audience** (non-Latin / mixed) — all slide text and the reply in that language, defaulting to English if still unclear"
    return "English — all titles, subtitles, beat, main, visual, and reply text in clear English unless the user clearly used another language in the **Intent** above"


def _output_language_block(intent: str, audience: str, style: str) -> str:
    line = _classify_brief_output_language(
        (intent or "").strip(),
        (audience or "").strip(),
        (style or "").strip(),
    )
    return "\n".join(
        [
            "## OUTPUT LANGUAGE (mandatory)",
            f"- **Inferred from Intent / Audience / style (Intent weighted highest):** {line}.",
            "- **Every** user-facing string you write (`title`, `subtitle`, `beat`, `main`, `visual`, and any `reply`) must be in that single language — not a second “translation layer” in another language.",
            "- The mindmap and source material may be another language: keep deck text aligned with this OUTPUT LANGUAGE, not the mindmap, when the brief clearly chooses a language.",
            "- If the brief is empty or only numbers/punctuation, default to **English**.",
        ]
    )


def _maybe_add_tavily(
    *,
    user_prompt: str,
    builtin_skills: dict[str, bool],
    web_search_query: str | None,
    messages: list[dict[str, str]] | None = None,
) -> str:
    if not builtin_skills.get("webSearch"):
        return user_prompt
    q = (web_search_query or "").strip()
    if not q and messages:
        for m in reversed(messages):
            if (m.get("role") or "").strip().lower() == "user":
                q = (m.get("content") or "").strip()
                if q:
                    break
    if not q:
        return user_prompt
    try:
        results = tavily_search(query=q[:240], max_results=5)
        return "\n\n".join(
            [
                user_prompt,
                "",
                "Tavily web search results (top 5):",
                format_results_for_prompt(results),
            ]
        )
    except Exception as e:  # noqa: BLE001
        return "\n\n".join([user_prompt, "", f"Tavily search failed: {e}"])


def _normalize_slide(obj: Any, fallback_idx: int) -> dict[str, str]:
    if not isinstance(obj, dict):
        return {
            "id": f"s_{fallback_idx}",
            "title": "Untitled",
            "subtitle": "",
            "beat": "",
            "main": str(obj)[:8000] if obj is not None else "",
            "visual": "",
        }
    raw_id = str(obj.get("id") or "").strip()
    title = str(obj.get("title") or "").strip() or "Untitled"
    subtitle = str(obj.get("subtitle") or obj.get("sub_title") or "").strip()
    main = str(
        obj.get("main")
        or obj.get("body")
        or obj.get("content")
        or obj.get("main_area")
        or ""
    ).strip()
    visual = str(
        obj.get("visual")
        or obj.get("visual_anchor")
        or obj.get("graphics")
        or obj.get("visual_presentation")
        or ""
    ).strip()
    beat = str(
        obj.get("beat")
        or obj.get("narrative_beat")
        or obj.get("story_beat")
        or ""
    ).strip()
    sid = raw_id or f"s_{uuid.uuid4().hex[:12]}"
    return {
        "id": sid,
        "title": title,
        "subtitle": subtitle,
        "beat": beat,
        "main": main,
        "visual": visual,
    }


def _normalize_slides_list(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    return [_normalize_slide(s, i) for i, s in enumerate(raw)]


PPT_SKELETON_SYSTEM = """You design the *skeleton* of a slide deck: story order and slide intent only. Return JSON only. No markdown fences.

JSON rules: escape quotes and newlines inside string values (use \\n only inside strings).

Schema:
{ "slides": [ { "id": "optional_string", "title": "string", "subtitle": "string", "beat": "string", "main": "", "visual": "" } ] }

Rules:
- Output about the requested slide count (±1). Each slide must have a clear **beat**: one line on how this slide advances the storyline (not the full content).
- **title** should be action-oriented per DECK_STYLE (e.g. answer-first for consulting).
- **subtitle**: one supporting line under the title.
- Leave **main** and **visual** as empty strings "" — they are filled in a later step. Do not write long body text here.
- Ground the arc in the mindmap and source material. Coherent narrative order.
- Follow DECK_STYLE in the user message.
- **Density planning:** Assume most slides will be **Standard** (one main exhibit when content is filled later). When the storyline needs stacked proof—market/trend data, competitor comparison, valuation walk, or layered risk—signal in **beat** that the slide should be **Dense** (e.g. prefix with `Dense:` or say the slide carries multi-panel evidence) so the enrich step can plan up to four exhibits.
- **OUTPUT LANGUAGE** in the user message is mandatory: all `title`, `subtitle`, and `beat` must follow it.

""" + PPT_SLIDE_LAYOUT_AND_EXHIBIT_RULES


PPT_ENRICH_SYSTEM = """You fill in `main` and `visual` for specific slides of a deck framework. Return JSON only. No markdown fences.

JSON rules: escape quotes and newlines inside string values.

Schema:
{ "slides": [ { "id": "string", "title": "string", "subtitle": "string", "beat": "string", "main": "string", "visual": "string" } ] }

Rules:
- Return **only** the slides requested by index. Each object must include **id** matching the skeleton, full **main** (message, proof, takeaway) and full **visual** (anchor + chart/table/infographic plan as in the main PPT framework spec).
- Preserve **title**, **subtitle**, **beat** unless a small alignment fix is needed vs neighbors.
- Stay consistent with DECK_STYLE and with the full outline you are given.
- Plan `visual` with PPT-master discipline: pick one canonical chart / diagram family that best fits the slide argument, and make the anchor large enough to carry the page.
- Ground in mindmap/source when relevant.
- **OUTPUT LANGUAGE** in the user message: `main` and `visual` must be in the same language as the skeleton and brief.

""" + PPT_SLIDE_LAYOUT_AND_EXHIBIT_RULES


PPT_RECONCILE_SYSTEM = """You polish a completed deck *framework* for narrative consistency. Return JSON only. No markdown fences.

JSON rules: escape quotes and newlines inside string values.

Schema:
{ "reply": "short note on what you adjusted for story flow", "slides": [ { "id", "title", "subtitle", "beat", "main", "visual" } ] }

Rules:
- Return the **full** `slides` array in the same order and count as input. Fix: duplicated ideas, weak transitions, title/body mismatches, redundant slides, or voice drift.
- Do not remove slides unless clearly duplicate; prefer tightening text.
- Keep DECK_STYLE alignment.
- Preserve **Standard / Dense** structure: keep `Density: Standard` or `Density: Dense` as the first line of `visual` unless you are intentionally converting slide type; keep exhibit grammar (single main exhibit vs Exhibit 1–4) consistent with that choice.
- Keep PPT-master visual discipline: every slide should still imply a clear, full-page anchor structure rather than a generic text box layout.
- **OUTPUT LANGUAGE** in the user message: the `reply` and all slide text must stay in that language (do not “translate away” the user’s language).

""" + PPT_SLIDE_LAYOUT_AND_EXHIBIT_RULES


def _ppt_source_block(source_snippets: list[dict[str, str]]) -> str:
    snips: list[str] = []
    for s in source_snippets:
        if not isinstance(s, dict):
            continue
        name = str(s.get("name") or "file").strip() or "file"
        body = _trim(str(s.get("text") or ""), 50000)
        snips.append(f"### {name}\n{body}")
    return "\n\n".join(snips) if snips else "(no source material provided)"


def _ppt_common_brief_block(
    *,
    dstyle: str,
    intent: str,
    audience: str,
    page_count: int,
    style: str,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
) -> str:
    return "\n\n".join(
        [
            "## User — deck intent",
            _output_language_block(intent, audience, style),
            "",
            "## DECK_STYLE (mandatory)",
            _format_deck_style_block(dstyle),
            "",
            f"**Intent / purpose:**\n{intent}",
            f"**Audience:**\n{audience or '(not specified)'}",
            f"**Desired slide count (approx):**\n{page_count}",
            f"**Additional style & look (optional):**\n{style or '(not specified)'}",
            "",
            "## Skills to apply",
            _format_skills_block(custom_skills, builtin_skills),
        ]
    )


def run_ppt_skeleton(
    *,
    llm: LlmClient,
    mindmap_markdown: str,
    intent: str,
    audience: str,
    page_count: int,
    style: str,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    source_snippets: list[dict[str, str]],
    web_search_query: str | None = None,
    deck_style: str = "consulting_mbb",
) -> list[dict[str, str]]:
    mm = _trim(mindmap_markdown, 90000)
    source_block = _ppt_source_block(source_snippets)
    dstyle = _normalize_deck_style(deck_style)
    user = "\n\n".join(
        [
            _ppt_common_brief_block(
                dstyle=dstyle,
                intent=intent,
                audience=audience,
                page_count=page_count,
                style=style,
                custom_skills=custom_skills,
                builtin_skills=builtin_skills,
            ),
            "",
            "## Mindmap outline",
            mm,
            "",
            "## Source material",
            source_block,
            f"\nProduce about {page_count} slides in the skeleton (±1). Leave main and visual empty.",
        ]
    )
    user = _maybe_add_tavily(
        user_prompt=user, builtin_skills=builtin_skills, web_search_query=web_search_query, messages=None
    )
    data = llm.generate_json(system=PPT_SKELETON_SYSTEM, user=user)
    if isinstance(data, list) and all(isinstance(x, dict) for x in data):
        slides = _normalize_slides_list(data)
    elif isinstance(data, dict):
        slides = _normalize_slides_list(data.get("slides"))
    else:
        raise ValueError("LLM did not return slides for skeleton")
    for s in slides:
        s["main"] = ""
        s["visual"] = ""
    if not slides:
        raise ValueError("Skeleton returned no slides")
    return slides


def _outline_compact(slides: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for i, s in enumerate(slides):
        lines.append(
            f"{i}. id={s.get('id')} | title={s.get('title')} | sub={s.get('subtitle')} | beat={s.get('beat')}"
        )
    return "\n".join(lines)


def run_ppt_enrich_batch(
    *,
    llm: LlmClient,
    mindmap_markdown: str,
    intent: str,
    audience: str,
    page_count: int,
    style: str,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    source_snippets: list[dict[str, str]],
    web_search_query: str | None = None,
    deck_style: str = "consulting_mbb",
    slides: list[dict[str, Any]],
    indices: list[int],
) -> list[dict[str, str]]:
    if not indices:
        raise ValueError("indices is empty")
    for i in indices:
        if i < 0 or i >= len(slides):
            raise ValueError(f"Invalid slide index: {i}")
    mm = _trim(mindmap_markdown, 60000)
    source_block = _trim(_ppt_source_block(source_snippets), 80000)
    dstyle = _normalize_deck_style(deck_style)
    idx_str = ", ".join(str(i) for i in indices)
    targets = [slides[i] for i in indices]
    framework_for_guidance = {"deck_style": dstyle}
    user = "\n\n".join(
        [
            _ppt_common_brief_block(
                dstyle=dstyle,
                intent=intent,
                audience=audience,
                page_count=page_count,
                style=style,
                custom_skills=custom_skills,
                builtin_skills=builtin_skills,
            ),
            "",
            "## Full slide outline (all slides — for story context; only fill indices below)",
            _outline_compact(list(slides)),
            "",
            "## Slides to fully detail now (0-based indices: " + idx_str + ")",
            _slides_block(targets),
            "",
            build_ppt_master_framework_guidance(framework_for_guidance, targets),
            "",
            "## Mindmap (reference)",
            mm,
            "",
            "## Source material (reference)",
            source_block,
            "",
            f"Return JSON with key `slides` containing **only** the fully detailed slide objects for indices [{idx_str}], in the same order as listed. "
            "Each must include id, title, subtitle, beat, main, visual.",
        ]
    )
    user = _maybe_add_tavily(
        user_prompt=user, builtin_skills=builtin_skills, web_search_query=web_search_query, messages=None
    )
    data = llm.generate_json(system=PPT_ENRICH_SYSTEM, user=user)
    if not isinstance(data, dict):
        raise ValueError("Enrich batch did not return a JSON object")
    batch = _normalize_slides_list(data.get("slides"))
    if len(batch) != len(indices):
        raise ValueError(
            f"Enrich batch: expected {len(indices)} slides, got {len(batch)}"
        )
    for b, j in zip(batch, indices):
        sid = str((slides[j] or {}).get("id") or "")
        if sid and str(b.get("id")) != sid:
            b["id"] = sid
    return batch


def run_ppt_reconcile(
    *,
    llm: LlmClient,
    mindmap_markdown: str,
    intent: str,
    audience: str,
    page_count: int,
    style: str,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    source_snippets: list[dict[str, str]],
    web_search_query: str | None = None,
    deck_style: str = "consulting_mbb",
    slides: list[dict[str, Any]],
) -> tuple[str, list[dict[str, str]]]:
    mm = _trim(mindmap_markdown, 40000)
    source_block = _trim(_ppt_source_block(source_snippets), 50000)
    dstyle = _normalize_deck_style(deck_style)
    framework_for_guidance = {"deck_style": dstyle}
    user = "\n\n".join(
        [
            _ppt_common_brief_block(
                dstyle=dstyle,
                intent=intent,
                audience=audience,
                page_count=page_count,
                style=style,
                custom_skills=custom_skills,
                builtin_skills=builtin_skills,
            ),
            "",
            "## Full deck to reconcile (fix storyline and consistency only)",
            _slides_block(list(slides)),
            "",
            build_ppt_master_framework_guidance(framework_for_guidance, list(slides)),
            "",
            "## Mindmap (reference, light)",
            mm[:12000] + ("\n" if len(mm) > 12000 else ""),
            "",
            "## Source (reference, light)",
            source_block[:12000] + ("\n" if len(source_block) > 12000 else ""),
        ]
    )
    user = _maybe_add_tavily(
        user_prompt=user, builtin_skills=builtin_skills, web_search_query=web_search_query, messages=None
    )
    data = llm.generate_json(system=PPT_RECONCILE_SYSTEM, user=user)
    if not isinstance(data, dict):
        raise ValueError("Reconcile did not return a JSON object")
    reply = str(data.get("reply") or "").strip() or "Storyline polished."
    out = _normalize_slides_list(data.get("slides"))
    if len(out) != len(slides):
        return reply, _normalize_slides_list(slides)
    return reply, out


def _format_conversation_for_ppt(messages: list[dict[str, str]], *, max_chars: int = 20000) -> str:
    lines: list[str] = []
    for m in messages:
        role = (m.get("role") or "").strip().lower()
        content = (m.get("content") or "").strip()
        if not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content}")
    text = "\n\n".join(lines)
    if len(text) > max_chars:
        text = "…(truncated)\n\n" + text[-max_chars:]
    return text or "(no messages)"


def _slides_block(slides: list[dict[str, Any]]) -> str:
    return json.dumps(slides, ensure_ascii=False, indent=2)


def run_ppt_framework_chat(
    *,
    llm: LlmClient,
    messages: list[dict[str, str]],
    slides: list[dict[str, Any]],
    mindmap_markdown: str,
    audience: str,
    intent: str,
    page_count: int,
    style: str,
    target_slide_index: int | None,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    source_snippets: list[dict[str, str]],
    web_search_query: str | None = None,
    deck_style: str = "consulting_mbb",
) -> tuple[str, list[dict[str, str]]]:
    mm = _trim(mindmap_markdown, 90000)
    snips: list[str] = []
    for s in source_snippets:
        if not isinstance(s, dict):
            continue
        name = str(s.get("name") or "file").strip() or "file"
        body = _trim(str(s.get("text") or ""), 50000)
        snips.append(f"### {name}\n{body}")
    source_block = "\n\n".join(snips) if snips else "(no source material)"

    focus = ""
    if target_slide_index is not None and target_slide_index >= 0 and target_slide_index < len(slides):
        focus = f"\n**User focus (1-based):** edit slide {target_slide_index + 1} first if relevant; still return the full `slides` list.\n"

    dstyle = _normalize_deck_style(deck_style)
    framework_for_guidance = {"deck_style": dstyle}
    user = "\n\n".join(
        [
            "## Current deck framework (edit this)",
            _slides_block(slides),
            "",
            build_ppt_master_framework_guidance(framework_for_guidance, list(slides)),
            "",
            "## Original brief",
            _output_language_block(intent, audience, style),
            "",
            "## DECK_STYLE (keep consistent when editing)",
            _format_deck_style_block(dstyle),
            f"**Intent:** {intent}",
            f"**Audience:** {audience or '—'}",
            f"**Page budget:** ~{page_count}",
            f"**Additional style notes:** {style or '—'}",
            focus,
            "## Mindmap (reference)",
            mm,
            "",
            "## Source material (reference)",
            source_block,
            "",
            "## Skills",
            _format_skills_block(custom_skills, builtin_skills),
            "",
            "## Chat (newest may be at end)",
            _format_conversation_for_ppt(messages),
        ]
    )
    user = _maybe_add_tavily(
        user_prompt=user, builtin_skills=builtin_skills, web_search_query=web_search_query, messages=messages
    )
    # generate_json; chat response must have reply + slides
    try:
        data = llm.generate_json(system=PPT_FRAMEWORK_CHAT_SYSTEM, user=user)
    except Exception:  # noqa: BLE001
        # Some models occasionally return an array; fail soft
        raise
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object for chat")
    reply = str(data.get("reply") or "").strip() or "Updated."
    out_slides = _normalize_slides_list(data.get("slides"))
    if not out_slides:
        return reply, _normalize_slides_list(slides)
    return reply, out_slides
