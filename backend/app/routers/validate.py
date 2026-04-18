from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.llm_client import LlmClient

router = APIRouter()


class ValidateNode(BaseModel):
    id: str
    label: Optional[str] = None
    type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ValidateRequest(BaseModel):
    nodeA: ValidateNode
    nodeB: ValidateNode
    relationship: Optional[str] = None
    evidence_snippets: List[str] = Field(default_factory=list)


class ValidateResponse(BaseModel):
    contradicts: bool
    confidence: Literal["low", "medium", "high"] = "low"
    rationale: str = ""
    violation_summary: str = ""
    inferred_consequences: str = ""


SYSTEM_PROMPT = """You are a strict contradiction validator.

Return JSON only. No markdown.

Schema:
{
  "contradicts": boolean,
  "confidence": "low" | "medium" | "high",
  "rationale": "string",
  "violation_summary": "string",
  "inferred_consequences": "string"
}

Rules:
- You MUST judge whether the stated relationship between Node A and Node B contradicts the provided evidence snippets.
- If evidence is insufficient/unclear, set contradicts=false and confidence="low", and leave violation_summary and inferred_consequences as empty strings.
- If contradicts=true, you MUST set:
  - violation_summary: one or two short sentences naming the logic conflict or critical violation (for a red UI label).
  - inferred_consequences: what becomes unreliable or risky if this relationship is treated as true (downstream reasoning, compliance, or decisions).
- rationale: fuller explanation (can overlap slightly with the two fields above).
- Do NOT invent facts. Only use provided evidence snippets.
"""


@router.post("/validate", response_model=ValidateResponse)
def validate(req: ValidateRequest) -> ValidateResponse:
    # If there's no evidence context at all, treat as non-contradiction (can't verify).
    evidence = [s.strip() for s in req.evidence_snippets if (s or "").strip()]
    if not evidence:
        return ValidateResponse(contradicts=False, confidence="low", rationale="No evidence snippets provided.")

    rel = (req.relationship or "related_to").strip() or "related_to"
    a_label = (req.nodeA.label or "").strip() or req.nodeA.id
    b_label = (req.nodeB.label or "").strip() or req.nodeB.id

    user_prompt = "\n".join(
        [
            "Node A:",
            f"- id: {req.nodeA.id}",
            f"- label: {a_label}",
            f"- type: {req.nodeA.type or ''}",
            "",
            "Node B:",
            f"- id: {req.nodeB.id}",
            f"- label: {b_label}",
            f"- type: {req.nodeB.type or ''}",
            "",
            "Relationship to validate:",
            f"- {a_label} --[{rel}]--> {b_label}",
            "",
            "Evidence snippets (the only allowed source of truth):",
            *[f"- {s}" for s in evidence[:40]],
            "",
            "Question:",
            "Does the relationship contradict the source material?",
            "Return JSON only.",
        ]
    ).strip()

    try:
        llm = LlmClient()
        data = llm.generate_json(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM validation failed: {e}")

    try:
        resp = ValidateResponse.model_validate(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid validator response: {e}")

    if resp.contradicts:
        vs = (resp.violation_summary or "").strip()
        ic = (resp.inferred_consequences or "").strip()
        if not vs or not ic:
            rationale = (resp.rationale or "").strip()
            sentences = [s.strip() for s in rationale.replace("?", ".").split(".") if s.strip()]
            if not vs:
                vs = (sentences[0] + "." if sentences else rationale[:220]).strip()[:240]
            if not ic:
                ic = (
                    ". ".join(sentences[1:3])
                    if len(sentences) > 1
                    else "Downstream inferences that rely on this link should be treated as uncertain until reconciled with the evidence."
                )
                ic = ic.strip()[:480]
        resp = resp.model_copy(update={"violation_summary": vs, "inferred_consequences": ic})

    return resp

