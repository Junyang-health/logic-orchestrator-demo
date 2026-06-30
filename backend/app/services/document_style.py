"""Shared visual tokens for Office-style exports.

The browser preview, PPTX export, PDF export, and Word export should draw from
the same small set of named styles. Keep this module dependency-free so it can
be used by any export path without pulling in Office libraries.
"""

from __future__ import annotations

from dataclasses import dataclass

DECK_STYLES = frozenset({"consulting_mbb", "government", "academic", "creative"})
SURFACE_VARIANTS = frozenset({"light", "dark", "glass", "mono"})

Rgb = tuple[int, int, int]


@dataclass(frozen=True)
class DocumentStyle:
    id: str
    surface: str
    slide_bg: Rgb
    title_rgb: Rgb
    subtitle_rgb: Rgb
    body_rgb: Rgb
    accent_rgb: Rgb
    muted_rgb: Rgb
    card_bg: Rgb
    card_border_rgb: Rgb
    success_rgb: Rgb
    danger_rgb: Rgb
    title_pt: int
    subtitle_pt: int
    body_pt: int
    heading_font: str = "Aptos Display"
    body_font: str = "Aptos"


def normalize_deck_style(value: str | None) -> str:
    v = (value or "consulting_mbb").strip().lower()
    return v if v in DECK_STYLES else "consulting_mbb"


def normalize_surface(value: str | None) -> str:
    v = (value or "light").strip().lower()
    return v if v in SURFACE_VARIANTS else "light"


def rgb_hex(rgb: Rgb) -> str:
    return "".join(f"{max(0, min(255, int(x))):02X}" for x in rgb)


def rgb_float(rgb: Rgb) -> tuple[float, float, float]:
    return (rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)


def get_document_style(style: str | None = None, surface: str | None = None) -> DocumentStyle:
    key = normalize_deck_style(style)
    surf = normalize_surface(surface)
    dark_surface = surf in {"dark", "glass"}

    if dark_surface:
        if key == "government":
            return DocumentStyle(
                id=key,
                surface=surf,
                slide_bg=(11, 18, 32),
                title_rgb=(241, 245, 249),
                subtitle_rgb=(165, 180, 252),
                body_rgb=(226, 232, 240),
                accent_rgb=(59, 130, 246),
                muted_rgb=(148, 163, 184),
                card_bg=(20, 29, 48),
                card_border_rgb=(51, 65, 85),
                success_rgb=(74, 222, 128),
                danger_rgb=(248, 113, 113),
                title_pt=28,
                subtitle_pt=15,
                body_pt=13,
            )
        if key == "academic":
            return DocumentStyle(
                id=key,
                surface=surf,
                slide_bg=(15, 23, 42),
                title_rgb=(248, 250, 252),
                subtitle_rgb=(196, 181, 253),
                body_rgb=(226, 232, 240),
                accent_rgb=(167, 139, 250),
                muted_rgb=(148, 163, 184),
                card_bg=(30, 41, 59),
                card_border_rgb=(71, 85, 105),
                success_rgb=(74, 222, 128),
                danger_rgb=(248, 113, 113),
                title_pt=28,
                subtitle_pt=15,
                body_pt=13,
            )
        return DocumentStyle(
            id=key,
            surface=surf,
            slide_bg=(15, 23, 42),
            title_rgb=(248, 250, 252),
            subtitle_rgb=(148, 163, 184),
            body_rgb=(226, 232, 240),
            accent_rgb=(167, 139, 250),
            muted_rgb=(100, 116, 139),
            card_bg=(30, 41, 59),
            card_border_rgb=(71, 85, 105),
            success_rgb=(74, 222, 128),
            danger_rgb=(248, 113, 113),
            title_pt=30,
            subtitle_pt=15,
            body_pt=14,
        )

    if key == "government":
        return DocumentStyle(
            id=key,
            surface=surf,
            slide_bg=(255, 255, 255),
            title_rgb=(23, 43, 77),
            subtitle_rgb=(66, 82, 105),
            body_rgb=(52, 61, 71),
            accent_rgb=(14, 71, 143),
            muted_rgb=(120, 130, 142),
            card_bg=(247, 249, 252),
            card_border_rgb=(203, 213, 225),
            success_rgb=(22, 163, 74),
            danger_rgb=(220, 38, 38),
            title_pt=28,
            subtitle_pt=15,
            body_pt=13,
        )
    if key == "academic":
        return DocumentStyle(
            id=key,
            surface=surf,
            slide_bg=(252, 252, 250),
            title_rgb=(34, 38, 43),
            subtitle_rgb=(70, 74, 82),
            body_rgb=(54, 54, 54),
            accent_rgb=(118, 54, 148),
            muted_rgb=(112, 118, 126),
            card_bg=(247, 247, 245),
            card_border_rgb=(212, 212, 216),
            success_rgb=(22, 163, 74),
            danger_rgb=(220, 38, 38),
            title_pt=26,
            subtitle_pt=14,
            body_pt=13,
            heading_font="Georgia",
            body_font="Georgia",
        )
    if key == "creative":
        return DocumentStyle(
            id=key,
            surface=surf,
            slide_bg=(15, 23, 42),
            title_rgb=(248, 250, 252),
            subtitle_rgb=(203, 213, 225),
            body_rgb=(226, 232, 240),
            accent_rgb=(167, 139, 250),
            muted_rgb=(148, 163, 184),
            card_bg=(30, 41, 59),
            card_border_rgb=(71, 85, 105),
            success_rgb=(74, 222, 128),
            danger_rgb=(248, 113, 113),
            title_pt=32,
            subtitle_pt=16,
            body_pt=14,
        )
    return DocumentStyle(
        id=key,
        surface=surf,
        slide_bg=(255, 255, 255),
        title_rgb=(31, 41, 55),
        subtitle_rgb=(71, 85, 105),
        body_rgb=(51, 65, 85),
        accent_rgb=(124, 58, 237),
        muted_rgb=(148, 163, 184),
        card_bg=(248, 250, 252),
        card_border_rgb=(226, 232, 240),
        success_rgb=(22, 163, 74),
        danger_rgb=(220, 38, 38),
        title_pt=30,
        subtitle_pt=15,
        body_pt=14,
    )
