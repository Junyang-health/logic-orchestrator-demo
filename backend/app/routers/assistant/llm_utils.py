"""Central place to construct LlmClient for assistant routes (caps + active model)."""

from __future__ import annotations

import os

from app.services.llm_client import LlmClient, LlmConfig
from app.services.model_registry import get_active_model


def llm_assistant_chat() -> LlmClient:
    mt = min(8192, int(os.getenv("LLM_MAX_TOKENS_CHAT", "4096")))
    return LlmClient(LlmConfig(model=get_active_model(), max_tokens=mt))


def llm_assistant_apply() -> LlmClient:
    mt = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
    return LlmClient(LlmConfig(model=get_active_model(), max_tokens=mt))


def llm_assistant_apply_compact() -> LlmClient:
    """Scans / evidence paths that cap output at 8192 while reusing LLM_MAX_TOKENS_APPLY."""
    mt = min(8192, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
    return LlmClient(LlmConfig(model=get_active_model(), max_tokens=mt))


def llm_ppt_skeleton() -> LlmClient:
    mt = min(12288, int(os.getenv("LLM_MAX_TOKENS_PPT_SKELETON", "8192")))
    return LlmClient(LlmConfig(model=get_active_model(), max_tokens=mt))


def llm_ppt_enrich() -> LlmClient:
    mt = min(12288, int(os.getenv("LLM_MAX_TOKENS_PPT_ENRICH", "10240")))
    return LlmClient(LlmConfig(model=get_active_model(), max_tokens=mt))


def llm_ppt_reconcile() -> LlmClient:
    mt = min(12288, int(os.getenv("LLM_MAX_TOKENS_PPT_RECONCILE", "10240")))
    return LlmClient(LlmConfig(model=get_active_model(), max_tokens=mt))


def llm_ppt_chat() -> LlmClient:
    mt = min(16384, int(os.getenv("LLM_MAX_TOKENS_PPT", "12288")))
    return LlmClient(LlmConfig(model=get_active_model(), max_tokens=mt))
