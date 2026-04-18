from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.llm_client import LlmClient
from app.services.review_apply import apply_review_comments_to_graph

router = APIRouter()


class ReviewNode(BaseModel):
    id: str
    label: Optional[str] = None
    type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ReviewEdge(BaseModel):
    source: str
    target: str
    label: Optional[str] = None


class ReviewBranchRequest(BaseModel):
    persona: str
    nodes: List[ReviewNode]
    edges: List[ReviewEdge]


class CommentItem(BaseModel):
    node_id: str
    text: str


class ReviewBranchResponse(BaseModel):
    comments: List[CommentItem]


class ReviewCommentIn(BaseModel):
    node_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)


class ApplyReviewRequest(BaseModel):
    persona: str = ""
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    comments: List[ReviewCommentIn] = Field(default_factory=list)


class ApplyReviewResponse(BaseModel):
    mindmap: Dict[str, Any]


SYSTEM_PROMPT = """You are a critical reviewer adopting a specific persona.

Return JSON only. No markdown.

Schema:
{
  "comments": [
    { "node_id": "string", "text": "string" }
  ]
}

Rules:
- Review ONLY the subgraph provided (nodes and directed edges).
- For EACH node that deserves feedback, add one comment object with that node's id as node_id.
- Comments should be short (1-4 sentences), actionable, and in the voice of the persona.
- If the subgraph is sound, return an empty comments array or at most one high-level comment on the root node.
- Do not invent node ids; node_id MUST match one of the provided node ids.
"""


@router.post("/review/branch", response_model=ReviewBranchResponse)
def review_branch(req: ReviewBranchRequest) -> ReviewBranchResponse:
    if not req.nodes:
        return ReviewBranchResponse(comments=[])

    node_lines = []
    for n in req.nodes:
        node_lines.append(
            f"- id={n.id} type={n.type or ''} label={n.label or ''} metadata={n.metadata!r}"
        )
    edge_lines = []
    for e in req.edges:
        edge_lines.append(f"- {e.source} -> {e.target} label={e.label or ''}")

    user_prompt = "\n".join(
        [
            f"Persona: {req.persona.strip() or 'Reviewer'}",
            "",
            "Nodes:",
            *node_lines,
            "",
            "Edges (parent -> child):",
            *edge_lines,
            "",
            "Task: Scan this branch and return comments keyed by node_id.",
        ]
    ).strip()

    try:
        llm = LlmClient()
        data = llm.generate_json(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM review failed: {e}")

    try:
        raw_comments = []
        if isinstance(data, dict) and isinstance(data.get("comments"), list):
            raw_comments = data["comments"]
        out: list[CommentItem] = []
        valid_ids = {n.id for n in req.nodes}
        for c in raw_comments:
            if not isinstance(c, dict):
                continue
            nid = c.get("node_id") or c.get("nodeId")
            txt = c.get("text")
            if isinstance(nid, str) and isinstance(txt, str) and nid in valid_ids:
                out.append(CommentItem(node_id=nid, text=txt))
        return ReviewBranchResponse(comments=out)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid review response: {e}")


@router.post("/review/apply", response_model=ApplyReviewResponse)
def apply_review(req: ApplyReviewRequest) -> ApplyReviewResponse:
    if not req.comments:
        raise HTTPException(status_code=400, detail="No comments to apply")
    if not req.full_nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")

    ids = {str(n.get("id")) for n in req.full_nodes if isinstance(n, dict) and n.get("id")}
    if req.branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")

    comment_dicts = [{"node_id": c.node_id, "text": c.text} for c in req.comments]
    try:
        llm = LlmClient()
        merged = apply_review_comments_to_graph(
            llm=llm,
            persona=req.persona,
            branch_root_id=req.branch_root_id,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
            comments=comment_dicts,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apply review failed: {e}")

    return ApplyReviewResponse(mindmap=merged)
