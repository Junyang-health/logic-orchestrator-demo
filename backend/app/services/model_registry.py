"""
Runtime registry for LLM model IDs (Gemini, DeepSeek, Kimi/Moonshot, etc.).
Persisted to disk so choices survive server restarts.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_SETTINGS_FILE = _DATA_DIR / "model_settings.json"

_lock = Lock()
_state: dict | None = None


def _default_model() -> str:
    # Provider-agnostic default. If you want Gemini by default, set GEMINI_MODEL
    # (and GEMINI_API_KEY) in the environment.
    return (os.getenv("BASE_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()


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
                _state = {"models": models, "current": current}
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
    m = model_id.strip()
    if not m:
        raise ValueError("Model id cannot be empty")
    with _lock:
        st = _load()
        if m not in st["models"]:
            raise ValueError(f"Unknown model: {m}")
        st["current"] = m
        _save()
        return m
