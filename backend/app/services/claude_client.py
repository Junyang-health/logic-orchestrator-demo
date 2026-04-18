from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from typing import Any, Optional

from anthropic import Anthropic

from app.services.model_registry import get_active_model


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        # remove first fence line
        t = t.split("\n", 1)[1] if "\n" in t else ""
        # remove trailing fence
        if t.rstrip().endswith("```"):
            t = t.rstrip()[: -3]
    return t.strip()


@dataclass(frozen=True)
class ClaudeConfig:
    api_key: str
    model: str
    max_tokens: int = 1400


class ClaudeClient:
    """
    Thin wrapper around the Anthropic SDK.

    - Uses env vars by default.
    - Provides helpers for text and vision prompts.
    """

    def __init__(self, config: Optional[ClaudeConfig] = None):
        api_key = (config.api_key if config else None) or os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise RuntimeError("Missing ANTHROPIC_API_KEY env var")

        if config and config.model:
            model = config.model
        else:
            model = get_active_model()
        max_tokens = (config.max_tokens if config else None) or int(os.getenv("CLAUDE_MAX_TOKENS", "1400"))

        self._cfg = ClaudeConfig(api_key=api_key, model=model, max_tokens=max_tokens)
        self._client = Anthropic(api_key=self._cfg.api_key)

    def describe_image(self, *, image_bytes: bytes, mime_type: str, prompt: str) -> str:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        msg = self._client.messages.create(
            model=self._cfg.model,
            max_tokens=self._cfg.max_tokens,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": mime_type, "data": b64},
                        },
                    ],
                }
            ],
        )
        # Anthropic returns a list of content blocks; we prefer concatenated text.
        parts: list[str] = []
        for c in msg.content:
            if getattr(c, "type", None) == "text":
                parts.append(getattr(c, "text", "") or "")
        return "\n".join(p for p in parts if p).strip()

    def generate_json(self, *, system: str, user: str) -> dict[str, Any]:
        msg = self._client.messages.create(
            model=self._cfg.model,
            max_tokens=self._cfg.max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        parts: list[str] = []
        for c in msg.content:
            if getattr(c, "type", None) == "text":
                parts.append(getattr(c, "text", "") or "")
        raw = _strip_code_fences("\n".join(parts))
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Last resort: attempt to extract the first JSON object/array.
            start = min([i for i in [raw.find("{"), raw.find("[")] if i != -1], default=-1)
            if start == -1:
                raise
            tail = raw[start:]
            return json.loads(tail)

