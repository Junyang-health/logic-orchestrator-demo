from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ImageSummary:
    filename: str
    mime_type: str
    description_text: str
    evidence_snippets: list[str]


VISION_PROMPT = """Describe the image for building a mindmap.

Focus on: key entities, relationships, any visible labels/titles, axes/units if it's a chart, and the overall message.
Avoid overly fine detail; prefer concise high-level interpretation plus 3-8 concrete observations.
Return plain text (no markdown)."""


def summarize_image_with_claude(*, filename: str, mime_type: str, content: bytes, claude) -> ImageSummary:
    text = claude.describe_image(image_bytes=content, mime_type=mime_type, prompt=VISION_PROMPT)
    # Evidence snippets: keep short chunks the model can cite.
    snippets = []
    for chunk in [c.strip() for c in text.split("\n") if c.strip()]:
        if len(snippets) >= 6:
            break
        snippets.append(f"{filename}: {chunk[:220]}")
    if not snippets:
        snippets = [f"{filename}: (no description produced)"]
    return ImageSummary(filename=filename, mime_type=mime_type, description_text=text, evidence_snippets=snippets)

