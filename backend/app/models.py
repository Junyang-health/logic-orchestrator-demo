from __future__ import annotations

from typing import Any, Literal, TypedDict


class MindmapNode(TypedDict, total=False):
    id: str
    type: str
    label: str
    metadata: dict[str, Any]


class MindmapEdge(TypedDict, total=False):
    source: str
    target: str
    label: str


class MindmapJson(TypedDict):
    nodes: list[MindmapNode]
    edges: list[MindmapEdge]


PanelKey = Literal["source", "review"]

