"""Build styled Word documents from the Word-report framework."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from app.services.document_style import DocumentStyle, get_document_style, rgb_hex

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@dataclass(frozen=True)
class WordDocxExport:
    body: bytes
    filename: str
    engine: str


def build_word_docx_export(
    *,
    intent: str,
    target_audience: str,
    framework_selection: str,
    chapters: list[Any],
    include_chapter_writing_prompts: bool,
    include_visual_ideas: bool,
    deck_style: str = "consulting_mbb",
    surface: str = "light",
) -> WordDocxExport:
    style = get_document_style(deck_style, surface)
    safe = _safe_slug(intent or "report")
    filename = f"word-export-{safe}.docx"

    officecli = _officecli_path()
    if officecli:
        try:
            body = _build_with_officecli(
                officecli=officecli,
                intent=intent,
                target_audience=target_audience,
                framework_selection=framework_selection,
                chapters=chapters,
                include_chapter_writing_prompts=include_chapter_writing_prompts,
                include_visual_ideas=include_visual_ideas,
                style=style,
            )
            return WordDocxExport(body=body, filename=filename, engine="officecli")
        except Exception:
            pass

    body = _build_with_openxml(
        intent=intent,
        target_audience=target_audience,
        framework_selection=framework_selection,
        chapters=chapters,
        include_chapter_writing_prompts=include_chapter_writing_prompts,
        include_visual_ideas=include_visual_ideas,
        style=style,
    )
    return WordDocxExport(body=body, filename=filename, engine="openxml")


def _officecli_path() -> str | None:
    env = (os.getenv("OFFICECLI_PATH") or "").strip()
    if env and Path(env).is_file():
        return env
    return shutil.which("officecli")


def _safe_slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", value[:40]).strip("-").lower() or "report"


def _chapter_dict(chapter: Any) -> dict[str, str]:
    if hasattr(chapter, "model_dump"):
        raw = chapter.model_dump()
    elif isinstance(chapter, dict):
        raw = chapter
    else:
        raw = {}
    return {
        "id": str(raw.get("id") or ""),
        "title": str(raw.get("title") or ""),
        "analysis_objective": str(raw.get("analysis_objective") or ""),
        "analysis_logic": str(raw.get("analysis_logic") or ""),
        "core_hypothesis": str(raw.get("core_hypothesis") or ""),
        "data_requirements": str(raw.get("data_requirements") or ""),
        "visualization_plan": str(raw.get("visualization_plan") or ""),
    }


def _paragraph_lines(text: str) -> list[str]:
    lines = [ln.strip() for ln in str(text or "").replace("\r\n", "\n").split("\n")]
    return [ln for ln in lines if ln]


def _run_officecli(officecli: str, *args: str, cwd: Path) -> None:
    env = {**os.environ, "OFFICECLI_SKIP_UPDATE": "1"}
    subprocess.run(
        [officecli, *args],
        cwd=str(cwd),
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=20,
    )


def _officecli_add_paragraph(
    officecli: str,
    file_path: Path,
    text: str,
    *,
    style_name: str | None = None,
    list_style: str | None = None,
    cwd: Path,
) -> None:
    props = [f"text={text}"]
    if style_name:
        props.append(f"style={style_name}")
    if list_style:
        props.append(f"listStyle={list_style}")
    args = ["add", str(file_path), "/body", "--type", "paragraph"]
    for prop in props:
        args.extend(["--prop", prop])
    _run_officecli(officecli, *args, cwd=cwd)


def _build_with_officecli(
    *,
    officecli: str,
    intent: str,
    target_audience: str,
    framework_selection: str,
    chapters: list[Any],
    include_chapter_writing_prompts: bool,
    include_visual_ideas: bool,
    style: DocumentStyle,
) -> bytes:
    with tempfile.TemporaryDirectory(prefix="unbox-word-officecli-") as tmp_name:
        tmp_dir = Path(tmp_name)
        docx_path = tmp_dir / "report.docx"
        _run_officecli(officecli, "create", str(docx_path), cwd=tmp_dir)
        _run_officecli(officecli, "open", str(docx_path), cwd=tmp_dir)
        try:
            _run_officecli(
                officecli,
                "set",
                str(docx_path),
                "/",
                "--prop",
                f"docDefaults.font={style.body_font}",
                "--prop",
                f"docDefaults.fontSize={style.body_pt}",
                "--prop",
                f"docDefaults.color={rgb_hex(style.body_rgb)}",
                "--prop",
                f"theme.color.accent1={rgb_hex(style.accent_rgb)}",
                cwd=tmp_dir,
            )
            _officecli_add_paragraph(officecli, docx_path, intent or "Report framework", style_name="Title", cwd=tmp_dir)
            if target_audience:
                _officecli_add_paragraph(officecli, docx_path, f"Audience: {target_audience}", style_name="Subtitle", cwd=tmp_dir)
            if framework_selection:
                _officecli_add_paragraph(officecli, docx_path, "Framework selection", style_name="Heading1", cwd=tmp_dir)
                for line in _paragraph_lines(framework_selection)[:80]:
                    _officecli_add_paragraph(officecli, docx_path, line, cwd=tmp_dir)
            for idx, raw_chapter in enumerate(chapters, start=1):
                ch = _chapter_dict(raw_chapter)
                title = ch["title"] or ch["id"] or f"Chapter {idx}"
                _officecli_add_paragraph(officecli, docx_path, title, style_name="Heading1", cwd=tmp_dir)
                _add_officecli_section(officecli, docx_path, "Analysis Objective", ch["analysis_objective"], tmp_dir)
                _add_officecli_section(officecli, docx_path, "Analysis Logic", ch["analysis_logic"], tmp_dir)
                _add_officecli_section(officecli, docx_path, "Core Hypothesis", ch["core_hypothesis"], tmp_dir)
                _add_officecli_section(officecli, docx_path, "Data Requirements", ch["data_requirements"], tmp_dir)
                _add_officecli_section(officecli, docx_path, "Visualization Plan", ch["visualization_plan"], tmp_dir)
                if include_chapter_writing_prompts:
                    _officecli_add_paragraph(officecli, docx_path, "Writing prompt for report phase", style_name="Heading2", cwd=tmp_dir)
                    _officecli_add_paragraph(
                        officecli,
                        docx_path,
                        "Draft this chapter using sourced evidence only. Preserve the analysis logic, validate the core hypothesis, and flag any missing data instead of inventing figures.",
                        list_style="bullet",
                        cwd=tmp_dir,
                    )
                if include_visual_ideas and ch["visualization_plan"]:
                    _officecli_add_paragraph(officecli, docx_path, "Suggested visuals", style_name="Heading2", cwd=tmp_dir)
                    for line in _paragraph_lines(ch["visualization_plan"])[:8]:
                        _officecli_add_paragraph(officecli, docx_path, line, list_style="bullet", cwd=tmp_dir)
        finally:
            _run_officecli(officecli, "close", str(docx_path), cwd=tmp_dir)
        _run_officecli(officecli, "validate", str(docx_path), cwd=tmp_dir)
        return docx_path.read_bytes()


def _add_officecli_section(officecli: str, docx_path: Path, heading: str, text: str, cwd: Path) -> None:
    if not text.strip():
        return
    _officecli_add_paragraph(officecli, docx_path, heading, style_name="Heading2", cwd=cwd)
    for line in _paragraph_lines(text)[:24]:
        _officecli_add_paragraph(officecli, docx_path, line, cwd=cwd)


def _build_with_openxml(
    *,
    intent: str,
    target_audience: str,
    framework_selection: str,
    chapters: list[Any],
    include_chapter_writing_prompts: bool,
    include_visual_ideas: bool,
    style: DocumentStyle,
) -> bytes:
    with tempfile.TemporaryDirectory(prefix="unbox-word-openxml-") as tmp_name:
        tmp_dir = Path(tmp_name)
        docx_path = tmp_dir / "report.docx"
        document_xml = _document_xml(
            intent=intent,
            target_audience=target_audience,
            framework_selection=framework_selection,
            chapters=chapters,
            include_chapter_writing_prompts=include_chapter_writing_prompts,
            include_visual_ideas=include_visual_ideas,
        )
        styles_xml = _styles_xml(style)
        with zipfile.ZipFile(docx_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", _content_types_xml())
            zf.writestr("_rels/.rels", _rels_xml())
            zf.writestr("docProps/core.xml", _core_props_xml(intent))
            zf.writestr("docProps/app.xml", _app_props_xml())
            zf.writestr("word/document.xml", document_xml)
            zf.writestr("word/styles.xml", styles_xml)
            zf.writestr("word/settings.xml", _settings_xml())
            zf.writestr("word/_rels/document.xml.rels", _empty_document_rels_xml())
        return docx_path.read_bytes()


def _w_text(text: str) -> str:
    return escape(str(text or ""), {'"': "&quot;"})


def _p(text: str, style: str | None = None) -> str:
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    return f"<w:p>{ppr}<w:r><w:t xml:space=\"preserve\">{_w_text(text)}</w:t></w:r></w:p>"


def _label_p(label: str, text: str) -> str:
    return (
        "<w:p>"
        f'<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{_w_text(label)}: </w:t></w:r>'
        f'<w:r><w:t xml:space="preserve">{_w_text(text)}</w:t></w:r>'
        "</w:p>"
    )


def _bullet_p(text: str) -> str:
    return _p(f"• {text}", None)


def _section_xml(label: str, text: str) -> list[str]:
    if not text.strip():
        return []
    out = [_p(label, "Heading2")]
    lines = _paragraph_lines(text)
    if not lines:
        return out
    for line in lines[:24]:
        out.append(_p(line))
    return out


def _document_xml(
    *,
    intent: str,
    target_audience: str,
    framework_selection: str,
    chapters: list[Any],
    include_chapter_writing_prompts: bool,
    include_visual_ideas: bool,
) -> str:
    body: list[str] = [
        _p(intent or "Report framework", "Title"),
    ]
    if target_audience:
        body.append(_label_p("Audience", target_audience))
    body.append(_p("Generated report framework", "Subtitle"))
    if framework_selection:
        body.append(_p("Framework selection", "Heading1"))
        for line in _paragraph_lines(framework_selection)[:80]:
            body.append(_p(line, "Quote"))
    for idx, raw_chapter in enumerate(chapters, start=1):
        ch = _chapter_dict(raw_chapter)
        title = ch["title"] or ch["id"] or f"Chapter {idx}"
        body.append(_p(title, "Heading1"))
        body.extend(_section_xml("Analysis Objective", ch["analysis_objective"]))
        body.extend(_section_xml("Analysis Logic", ch["analysis_logic"]))
        body.extend(_section_xml("Core Hypothesis", ch["core_hypothesis"]))
        body.extend(_section_xml("Data Requirements", ch["data_requirements"]))
        body.extend(_section_xml("Visualization Plan", ch["visualization_plan"]))
        if include_chapter_writing_prompts:
            body.append(_p("Writing prompt for report phase", "Heading2"))
            body.append(
                _bullet_p(
                    "Draft this chapter using sourced evidence only; preserve the analysis logic and flag missing data instead of inventing figures."
                )
            )
        if include_visual_ideas and ch["visualization_plan"]:
            body.append(_p("Suggested visuals", "Heading2"))
            for line in _paragraph_lines(ch["visualization_plan"])[:8]:
                body.append(_bullet_p(line))

    body.append(
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1260" w:bottom="1440" w:left="1260" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(body)}</w:body>"
        "</w:document>"
    )


def _style_def(style_id: str, name: str, *, font: str, size_pt: int, color: str, bold: bool = False) -> str:
    bold_xml = "<w:b/>" if bold else ""
    size = size_pt * 2
    return (
        f'<w:style w:type="paragraph" w:styleId="{style_id}">'
        f'<w:name w:val="{name}"/>'
        '<w:pPr><w:spacing w:after="160"/></w:pPr>'
        f'<w:rPr>{bold_xml}<w:rFonts w:ascii="{_w_text(font)}" w:hAnsi="{_w_text(font)}" w:eastAsia="DengXian"/>'
        f'<w:color w:val="{color}"/><w:sz w:val="{size}"/></w:rPr>'
        "</w:style>"
    )


def _styles_xml(style: DocumentStyle) -> str:
    body_hex = rgb_hex(style.body_rgb)
    title_hex = rgb_hex(style.title_rgb)
    subtitle_hex = rgb_hex(style.subtitle_rgb)
    accent_hex = rgb_hex(style.accent_rgb)
    muted_hex = rgb_hex(style.muted_rgb)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:docDefaults><w:rPrDefault><w:rPr>'
        f'<w:rFonts w:ascii="{_w_text(style.body_font)}" w:hAnsi="{_w_text(style.body_font)}" w:eastAsia="DengXian"/>'
        f'<w:color w:val="{body_hex}"/><w:sz w:val="{style.body_pt * 2}"/>'
        '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault></w:docDefaults>'
        f'{_style_def("Normal", "Normal", font=style.body_font, size_pt=style.body_pt, color=body_hex)}'
        f'{_style_def("Title", "Title", font=style.heading_font, size_pt=max(22, style.title_pt), color=title_hex, bold=True)}'
        f'{_style_def("Subtitle", "Subtitle", font=style.body_font, size_pt=style.subtitle_pt, color=subtitle_hex)}'
        f'{_style_def("Heading1", "Heading 1", font=style.heading_font, size_pt=max(16, style.title_pt - 10), color=accent_hex, bold=True)}'
        f'{_style_def("Heading2", "Heading 2", font=style.heading_font, size_pt=max(12, style.body_pt + 1), color=title_hex, bold=True)}'
        f'{_style_def("Quote", "Quote", font=style.body_font, size_pt=max(10, style.body_pt - 1), color=muted_hex)}'
        "</w:styles>"
    )


def _content_types_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""


def _rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""


def _empty_document_rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>"""


def _core_props_xml(title: str) -> str:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f"<dc:title>{_w_text(title or 'Report framework')}</dc:title>"
        "<dc:creator>Unbox</dc:creator>"
        "<cp:lastModifiedBy>Unbox</cp:lastModifiedBy>"
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>'
        "</cp:coreProperties>"
    )


def _app_props_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Unbox</Application>
</Properties>"""


def _settings_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
</w:settings>"""
