"""
Per-process session setup: API keys supplied once per backend start via POST (not persisted).
Optionally skip the wizard when .env already has an LLM key (developer convenience).
"""

from __future__ import annotations

import os

from app.services.llm_provider_keys import (
    anthropic_key_present,
    deepseek_key_present,
    gemini_key_present,
    moonshot_key_present,
)


def any_llm_key_in_environ() -> bool:
    return bool(
        gemini_key_present()
        or deepseek_key_present()
        or moonshot_key_present()
        or anthropic_key_present()
    )


def _require_session_post() -> bool:
    return os.getenv("UNBOX_REQUIRE_SESSION_SETUP", "").strip().lower() in ("1", "true", "yes")


_wizard_completed: bool = False


def is_session_ready() -> bool:
    return _wizard_completed


def mark_session_ready() -> None:
    global _wizard_completed
    _wizard_completed = True


def maybe_autocomplete_wizard_from_dotenv() -> None:
    """If .env (or shell) already provided an LLM key, treat setup as done — unless strict mode."""
    global _wizard_completed
    if _wizard_completed:
        return
    if _require_session_post():
        return
    if any_llm_key_in_environ():
        _wizard_completed = True


def apply_session_credentials(
    *,
    primary_llm: str,
    api_key: str,
    tavily_api_key: str,
    model_id: str,
) -> str:
    """
    Set os.environ for this process only. Clears other provider keys to avoid ambiguous routing.
    Returns resolved registry model id.
    """
    key = (api_key or "").strip()
    if not key:
        raise ValueError("API key is required")

    prov = (primary_llm or "").strip().lower()
    if prov not in ("gemini", "deepseek", "kimi"):
        raise ValueError("primary_llm must be gemini, deepseek, or kimi")

    for k in (
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "ANTHROPIC_API_KEY",
        "DEEPSEEK_API_KEY",
        "MOONSHOT_API_KEY",
        "KIMI_API_KEY",
    ):
        os.environ.pop(k, None)

    os.environ["PRIMARY_LLM"] = prov

    if prov == "gemini":
        os.environ["GEMINI_API_KEY"] = key
    elif prov == "deepseek":
        os.environ["DEEPSEEK_API_KEY"] = key
    else:
        os.environ["MOONSHOT_API_KEY"] = key

    tv = (tavily_api_key or "").strip()
    if tv:
        os.environ["TAVILY_API_KEY"] = tv
    else:
        os.environ.pop("TAVILY_API_KEY", None)

    mid = (model_id or "").strip()
    if not mid:
        if prov == "gemini":
            mid = "gemini-2.5-flash"
        elif prov == "deepseek":
            mid = "deepseek:deepseek-chat"
        else:
            mid = "kimi:" + (os.getenv("MOONSHOT_DEFAULT_MODEL") or "kimi-k2.5").strip()

    os.environ["BASE_MODEL"] = mid
    if prov == "gemini":
        os.environ["GEMINI_MODEL"] = mid.replace("gemini:", "", 1) if mid.lower().startswith("gemini:") else mid

    mark_session_ready()
    return mid
