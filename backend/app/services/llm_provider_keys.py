"""
Detect which LLM API keys are present and resolve a configured model id to a workable provider.

Used by LlmClient (routing) and model_registry (defaults + sanitizing persisted settings).
"""

from __future__ import annotations

import os


def gemini_key_present() -> bool:
    return bool((os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip())


def deepseek_key_present() -> bool:
    return bool((os.getenv("DEEPSEEK_API_KEY") or "").strip())


def moonshot_key_present() -> bool:
    return bool((os.getenv("MOONSHOT_API_KEY") or os.getenv("KIMI_API_KEY") or "").strip())


def anthropic_key_present() -> bool:
    return bool((os.getenv("ANTHROPIC_API_KEY") or "").strip())


def looks_like_gemini_model(model_id: str) -> bool:
    m = (model_id or "").strip().lower()
    return m.startswith("gemini-") or m.startswith("models/gemini-") or m.startswith("gemini:")


def looks_like_deepseek_model(model_id: str) -> bool:
    m = (model_id or "").strip().lower()
    return m.startswith("deepseek:") or m.startswith("deepseek-") or m.startswith("deepseek/")


def looks_like_kimi_model(model_id: str) -> bool:
    m = (model_id or "").strip().lower()
    if not m:
        return False
    if m.startswith("kimi:") or m.startswith("kimi/"):
        return True
    if m.startswith("moonshot-"):
        return True
    if m.startswith("kimi-"):
        return True
    return False


def _primary_llm_preference() -> str:
    return (os.getenv("PRIMARY_LLM") or os.getenv("PRIMARY_LLM_PROVIDER") or "").strip().lower()


def _default_gemini_id() -> str:
    return (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()


def _default_kimi_prefixed() -> str:
    return "kimi:" + (os.getenv("MOONSHOT_DEFAULT_MODEL") or "kimi-k2.5").strip()


def default_model_from_env() -> str:
    """
    Default registry / active model when nothing is persisted.

    Order:
    - BASE_MODEL or GEMINI_MODEL if set (explicit id, may be any family)
    - PRIMARY_LLM / PRIMARY_LLM_PROVIDER picks among keys that exist
    - auto: first available gemini, then deepseek, then kimi/moonshot
    - last resort: gemini-2.5-flash (calls will fail until a key is set)
    """
    explicit = (os.getenv("BASE_MODEL") or os.getenv("GEMINI_MODEL") or "").strip()
    if explicit:
        return explicit

    g, d, m = gemini_key_present(), deepseek_key_present(), moonshot_key_present()
    pref = _primary_llm_preference()

    if pref in ("gemini", "google"):
        if g:
            return _default_gemini_id()
    elif pref in ("deepseek", "ds"):
        if d:
            return "deepseek:deepseek-chat"
    elif pref in ("kimi", "moonshot", "moonshot_ai"):
        if m:
            return _default_kimi_prefixed()

    if g:
        return _default_gemini_id()
    if d:
        return "deepseek:deepseek-chat"
    if m:
        return _default_kimi_prefixed()
    return "gemini-2.5-flash"


def _pick_fallback_when_gemini_missing() -> str:
    """Gemini-shaped id but no Gemini key: use DeepSeek or Kimi based on keys / PRIMARY_LLM."""
    d, m = deepseek_key_present(), moonshot_key_present()
    pref = _primary_llm_preference()
    if pref in ("deepseek", "ds") and d:
        return "deepseek:deepseek-chat"
    if pref in ("kimi", "moonshot", "moonshot_ai") and m:
        return _default_kimi_prefixed()
    if d:
        return "deepseek:deepseek-chat"
    if m:
        return _default_kimi_prefixed()
    raise RuntimeError(
        "Missing GEMINI_API_KEY (or GOOGLE_API_KEY). "
        "Configure DEEPSEEK_API_KEY or MOONSHOT_API_KEY (Kimi), or set PRIMARY_LLM=deepseek|kimi when both are present."
    )


def resolve_chat_model_id(model_id: str) -> str:
    """
    Ensure model_id refers to a provider that has an API key, remapping across families when needed.

    Raises RuntimeError if no provider can satisfy the request.
    """
    mid = (model_id or "").strip()
    if not mid:
        return default_model_from_env()

    g, d, m = gemini_key_present(), deepseek_key_present(), moonshot_key_present()

    if looks_like_gemini_model(mid) and not g:
        return _pick_fallback_when_gemini_missing()

    if looks_like_deepseek_model(mid) and not d:
        if g:
            return _default_gemini_id()
        if m:
            return _default_kimi_prefixed()
        raise RuntimeError(
            "Missing DEEPSEEK_API_KEY. Configure GEMINI_API_KEY, MOONSHOT_API_KEY (Kimi), or switch the active model."
        )

    if looks_like_kimi_model(mid) and not m:
        if g:
            return _default_gemini_id()
        if d:
            return "deepseek:deepseek-chat"
        raise RuntimeError(
            "Missing MOONSHOT_API_KEY (or KIMI_API_KEY). Configure GEMINI_API_KEY, DEEPSEEK_API_KEY, or switch the active model."
        )

    return mid


def safe_resolve_chat_model_id(model_id: str) -> str:
    """Never raises; returns original id if resolution fails (e.g. no keys at dev time)."""
    try:
        return resolve_chat_model_id(model_id)
    except RuntimeError:
        return (model_id or "").strip() or default_model_from_env()
