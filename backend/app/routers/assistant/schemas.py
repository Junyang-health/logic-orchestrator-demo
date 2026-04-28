from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class CustomSkillIn(BaseModel):
    name: str = Field(default="", max_length=120)
    instruction: str = Field(..., min_length=1, max_length=8000)
    enabled: bool = True


class AssistantChatRequest(BaseModel):
    messages: List[ChatMessageIn] = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    selected_node_id: Optional[str] = None
    web_search_query: Optional[str] = Field(
        default=None,
        description="When webSearch is on: one Tavily query per non-empty line (max ~12). If empty, the latest user message is used; use multiple lines there for multi-search.",
    )
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = Field(
        default=False,
        description="User is exploring in sandbox; draft nodes may appear in the graph snapshot.",
    )
    project_id: Optional[str] = Field(
        default=None,
        description="When set, server may load extracted project file text and append to the model prompt.",
    )
    include_project_sources: bool = Field(
        default=True,
        description="If true and project_id is set, append MarkItDown / extracted text (truncated).",
    )
    source_max_chars: int = Field(
        default=40_000,
        ge=0,
        le=100_000,
        description="Cap on source text in the prompt; 0 disables attachment.",
    )
    source_file_ids: Optional[List[str]] = Field(
        default=None,
        description="Restrict to these project file ids (order preserved). Empty list = no files. Omitted = all files when sources are enabled.",
        max_length=64,
    )


class AssistantChatResponse(BaseModel):
    reply: str


class FetchSkillUrlRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


class FetchSkillUrlResponse(BaseModel):
    instruction: str = Field(..., max_length=8000)
    suggested_name: str = Field(default="Remote skill", max_length=120)
    fetched_url: str = Field(default="", description="Final URL after redirects (for display).")


class PptSourceSnippetIn(BaseModel):
    name: str = Field(default="file", max_length=500)
    text: str = Field(default="", max_length=150000)


PptDeckStyle = Literal["consulting_mbb", "government", "academic", "creative"]


class PptFrameworkGenerateRequest(BaseModel):
    mindmap_markdown: str = Field(..., min_length=1, max_length=200000)
    intent: str = Field(..., min_length=1, max_length=8000)
    audience: str = Field(default="", max_length=4000)
    page_count: int = Field(default=8, ge=1, le=40)
    deck_style: PptDeckStyle = Field(
        default="consulting_mbb",
        description="Preset: consulting/MBB, government, academic, or creative; drives tone, titles, and visual conventions.",
    )
    style: str = Field(default="", max_length=2000)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    source_snippets: List[PptSourceSnippetIn] = Field(default_factory=list)
    web_search_query: Optional[str] = None


class PptSlideOut(BaseModel):
    id: str
    title: str
    subtitle: str
    beat: str = Field(
        default="",
        description="One-line story beat: how this slide advances the arc (skeleton; optional in exports).",
    )
    main: str
    visual: str = Field(
        default="",
        description="Visual anchor and how content is shown (infographics, charts, tables for highlight/contrast).",
    )


class PptFrameworkGenerateResponse(BaseModel):
    slides: List[PptSlideOut]


class PptChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=60000)


class PptFrameworkChatRequest(BaseModel):
    messages: List[PptChatMessageIn] = Field(..., min_length=1)
    slides: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Current full deck; may be empty before first generation.",
    )
    mindmap_markdown: str = Field(..., min_length=1, max_length=200000)
    intent: str = Field(default="", max_length=8000)
    audience: str = Field(default="", max_length=4000)
    page_count: int = Field(default=8, ge=1, le=40)
    deck_style: PptDeckStyle = Field(
        default="consulting_mbb",
        description="Same presets as generate; keep refinements on-style.",
    )
    style: str = Field(default="", max_length=2000)
    target_slide_index: Optional[int] = Field(
        default=None,
        description="Optional 0-based index to focus edits on that slide; full slides still returned.",
    )
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    source_snippets: List[PptSourceSnippetIn] = Field(default_factory=list)
    web_search_query: Optional[str] = None


class PptFrameworkChatResponse(BaseModel):
    reply: str
    slides: List[PptSlideOut]


class PptEnrichBatchRequest(PptFrameworkGenerateRequest):
    slides: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        description="Full current deck (skeleton+partial detail); only indices are enriched.",
    )
    indices: List[int] = Field(
        ...,
        min_length=1,
        max_length=8,
        description="0-based slide indices to fill with main+visual in this request.",
    )


class PptReconcileRequest(PptFrameworkGenerateRequest):
    slides: List[Dict[str, Any]] = Field(..., min_length=1, description="Full deck after enrichment.")


class PptReconcileResponse(BaseModel):
    reply: str
    slides: List[PptSlideOut]


class AssistantApplyRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    messages: List[ChatMessageIn] = Field(..., min_length=1)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = Field(
        default=False,
        description="Consolidate sandbox chat + draft graph edits into the branch under the root.",
    )
    project_id: Optional[str] = None
    include_project_sources: bool = Field(
        default=True, description="Append extracted file text to apply prompt when project_id is set."
    )
    source_max_chars: int = Field(default=40_000, ge=0, le=100_000)
    source_file_ids: Optional[List[str]] = Field(
        default=None,
        description="Restrict to these project file ids. Empty = none. Omitted = all files.",
        max_length=64,
    )


class AssistantApplyResponse(BaseModel):
    mindmap: Dict[str, Any]


class OptimismAffectedNodeIn(BaseModel):
    node_id: str = Field(..., min_length=1)
    label: str = Field(default="", max_length=500)
    reason: str = Field(default="", max_length=800)


class OptimismSimRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    optimism: int = Field(
        default=50,
        ge=0,
        le=100,
        description="Legacy 0–100 scenario spread; ignored when focus_metric and delta_pct are set.",
    )
    currency: str = Field(default="USD", max_length=8)
    tam_total: Optional[float] = None
    target_segment_pct: Optional[float] = None
    arpa_year: Optional[float] = None
    customers_total: Optional[float] = None
    penetration_pct: Optional[float] = None
    focus_metric: Optional[Literal["TAM", "SOM", "ARR"]] = Field(
        default=None,
        description="Meter mode: which baseline metric to stress (with delta_pct).",
    )
    delta_pct: Optional[int] = Field(
        default=None,
        ge=-100,
        le=100,
        description="Signed percent change vs baseline; server snaps to nearest 10%.",
    )
    baseline_som_override: Optional[float] = Field(
        default=None,
        description="When SOM cannot be derived from TAM × segment %, pass branch-parsed SOM.",
    )
    affected_nodes: List[OptimismAffectedNodeIn] = Field(default_factory=list)


class SimResponse(BaseModel):
    mindmap: Dict[str, Any]
    report: str


class BlackSwanScenarioOut(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    mece_axis: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=240)
    summary: str = Field(..., min_length=1, max_length=2000)
    why_relevant: str = Field(default="", max_length=800)


class BlackSwanScanRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)


class BlackSwanScanResponse(BaseModel):
    scenarios: List[BlackSwanScenarioOut]
    report: str = ""


class BlackSwanRunRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scenarios: List[BlackSwanScenarioOut] = Field(..., min_length=1)


class BlackSwanGapOut(BaseModel):
    id: str
    description: str
    severity: str = "medium"


class BlackSwanMitigationOut(BaseModel):
    id: str
    title: str
    description: str
    addresses_gaps: List[str] = Field(default_factory=list)


class BlackSwanScenarioResultOut(BaseModel):
    scenario_id: str
    potential_impacts: List[str]
    gaps_to_address: List[BlackSwanGapOut]
    mitigations: List[BlackSwanMitigationOut]


class BlackSwanRunResponse(BaseModel):
    results: List[BlackSwanScenarioResultOut]
    executive_summary: str = ""
    report: str = ""


class BlackSwanMitigationPickIn(BaseModel):
    scenario_id: str = Field(..., min_length=1)
    mitigation_id: str = Field(..., min_length=1)


class BlackSwanApplyRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scenarios: List[BlackSwanScenarioOut] = Field(..., min_length=1)
    run: Dict[str, Any] = Field(..., description="Payload from /black-swan/run (results + executive_summary).")
    selections: List[BlackSwanMitigationPickIn] = Field(..., min_length=1)


class MeceScanRequest(BaseModel):
    mece_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)


class MeceScanResponse(BaseModel):
    mece_assessment: Dict[str, Any]
    level1_node_ids: List[str]
    level2_node_ids: List[str]
    gaps: List[Dict[str, Any]]
    proposed_modifications: List[Dict[str, Any]]


class MeceEvidenceRequest(BaseModel):
    mece_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scan: Dict[str, Any] = Field(..., description="Full JSON from /assistant/mece/scan")
    modification_ids: List[str] = Field(..., min_length=1)
    project_id: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Optional project id to read stored source files for evidence.",
    )


class MeceEvidenceResponse(BaseModel):
    results: List[Dict[str, Any]]
    corpus_stats: Dict[str, Any] = Field(default_factory=dict)


class MeceApplyRequest(BaseModel):
    mece_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scan: Dict[str, Any] = Field(..., description="Full JSON from /assistant/mece/scan")
    evidence: Dict[str, Any] = Field(..., description="Full JSON from /assistant/mece/evidence")
    modification_ids: List[str] = Field(..., min_length=1)
    web_hints: Dict[str, str] = Field(
        default_factory=dict,
        description="Optional map modification_id -> pasted web research text from user.",
    )


class MeceWebSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)


class MeceWebSearchResponse(BaseModel):
    query: str
    results: List[Dict[str, str]]


class RoundtablePersonaIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    instruction: str = Field(..., min_length=1, max_length=4000)


class RoundtableTranscriptRowIn(BaseModel):
    role: Literal["user", "persona"]
    persona_name: Optional[str] = Field(default=None, max_length=120)
    content: str = Field(..., min_length=1, max_length=32000)


class RoundtableRoundRequest(BaseModel):
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    selected_node_id: str = Field(..., min_length=1)
    personas: List[RoundtablePersonaIn] = Field(..., min_length=1, max_length=12)
    transcript: List[RoundtableTranscriptRowIn] = Field(default_factory=list)
    user_steering: Optional[str] = Field(default=None, max_length=8000)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = False


class RoundtableSpeechOut(BaseModel):
    persona: str
    content: str


class RoundtableRoundResponse(BaseModel):
    speeches: List[RoundtableSpeechOut]
    round_title: str = ""


class RoundtableProposeRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    selected_node_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    transcript: List[RoundtableTranscriptRowIn] = Field(..., min_length=1)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = False


class RoundtableProposeResponse(BaseModel):
    discussion_summary: str
    recommended_mindmap_changes: str
    patch: Dict[str, Any]


class RoundtableApplyRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    patch: Dict[str, Any] = Field(default_factory=dict)
