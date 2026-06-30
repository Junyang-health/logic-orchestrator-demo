from __future__ import annotations

from zipfile import ZipFile

from app.routers.word_export import WordChapter
from app.services.word_docx_export import build_word_docx_export


def test_word_docx_export_returns_valid_docx(tmp_path):
    export = build_word_docx_export(
        intent="Board memo for APAC launch",
        target_audience="Regional GM",
        framework_selection="| Chapter | Framework |\n| --- | --- |\n| Market | TAM-SAM-SOM |",
        chapters=[
            WordChapter(
                id="ch_1",
                title="Market attractiveness",
                analysis_objective="Assess priority markets.",
                analysis_logic="Use TAM-SAM-SOM and channel readiness.",
                core_hypothesis="APAC is viable if demand and margin clear thresholds.",
                data_requirements="Market size\nCAC\nGross margin",
                visualization_plan="Market attractiveness matrix",
            )
        ],
        include_chapter_writing_prompts=True,
        include_visual_ideas=True,
    )

    out = tmp_path / export.filename
    out.write_bytes(export.body)

    with ZipFile(out) as zf:
        names = set(zf.namelist())
        assert "word/document.xml" in names
        assert "word/styles.xml" in names
        document_xml = zf.read("word/document.xml").decode("utf-8")

    assert export.filename.endswith(".docx")
    assert "Market attractiveness" in document_xml
    assert "TAM-SAM-SOM" in document_xml
