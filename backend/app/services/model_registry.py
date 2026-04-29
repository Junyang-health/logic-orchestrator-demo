"""
Runtime registry for LLM model IDs (Gemini, DeepSeek, Kimi/Moonshot, etc.).
Persisted to disk so choices survive server restarts.
"""

from __future__ import annotations

import json
from pathlib import Path
from threading import RLock

from app.services.llm_provider_keys import default_model_from_env, safe_resolve_chat_model_id

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_SETTINGS_FILE = _DATA_DIR / "model_settings.json"

_lock = RLock()
_state: dict | None = None
_session_active_model: str | None = None


def _default_model() -> str:
    """First boot / empty list default: follows keys in env (Gemini, DeepSeek, or Kimi)."""
    return default_model_from_env()


def _load() -> dict:
    global _state
    if _state is not None:
        return _state
    with _lock:
        if _state is not None:
            return _state
        default = _default_model()
        if _SETTINGS_FILE.exists():
            try:
                raw = json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
                models = raw.get("models")
                current = raw.get("current")
                if not isinstance(models, list):
                    models = []
                models = [str(m).strip() for m in models if str(m).strip()]
                if not models:
                    models = [default]
                current = (str(current).strip() if current else "") or default
                if current not in models:
                    current = models[0]
                fixed = safe_resolve_chat_model_id(current)
                models2 = list(models)
                if fixed not in models2:
                    models2 = [fixed, *models2]
                changed = fixed != current or models2 != models
                _state = {"models": models2, "current": fixed}
                if changed:
                    _save()
            except (OSError, json.JSONDecodeError, TypeError):
                _state = {"models": [default], "current": default}
        else:
            _state = {"models": [default], "current": default}
        return _state


def _save() -> None:
    st = _load()
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _SETTINGS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(st, indent=2), encoding="utf-8")
    tmp.replace(_SETTINGS_FILE)


def get_active_model() -> str:
    global _session_active_model
    with _lock:
        if _session_active_model is not None:
            return _session_active_model
        st = _load()
        return str(st["current"])


def list_models() -> list[str]:
    st = _load()
    return list(st["models"])


def add_model(model_id: str) -> list[str]:
    m = model_id.strip()
    if not m:
        raise ValueError("Model id cannot be empty")
    with _lock:
        st = _load()
        if m not in st["models"]:
            st["models"] = [*st["models"], m]
        _save()
        return list(st["models"])


def remove_model(model_id: str) -> tuple[list[str], str]:
    m = model_id.strip()
    with _lock:
        st = _load()
        models = [x for x in st["models"] if x != m]
        if not models:
            default = _default_model()
            models = [default]
        st["models"] = models
        if st["current"] == m or st["current"] not in models:
            st["current"] = models[0]
        cur = st["current"]
        _save()
        return list(st["models"]), cur


def select_model(model_id: str) -> str:
    global _session_active_model
    m = model_id.strip()
    if not m:
        raise ValueError("Model id cannot be empty")
    with _lock:
        _session_active_model = None
        st = _load()
        if m not in st["models"]:
            raise ValueError(f"Unknown model: {m}")
        st["current"] = m
        _save()
        return m


def override_active_model_for_session(model_id: str) -> str:
    """
    In-memory active model for this process only (does not write model_settings.json).
    Cleared when the user selects a model via /models/select.
    """
    global _session_active_model
    m = safe_resolve_chat_model_id((model_id or "").strip())
    with _lock:
        _session_active_model = m
    return m
