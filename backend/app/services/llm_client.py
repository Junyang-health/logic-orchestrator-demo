from __future__ import annotations

import base64
import json
import os
import random
import time
from dataclasses import dataclass
from typing import Any

import httpx
from anthropic import Anthropic

from app.services.model_registry import get_active_model


def _strip_code_fences(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        if t.rstrip().endswith("```"):
            t = t.rstrip()[: -3]
    return t.strip()


def _json_loads_lenient(raw: str) -> Any:
    """
    LLMs often emit invalid JSON (unescaped newlines or quotes in strings, truncation).
    Tries: strict json.loads, slice from first { or [, then json_repair.
    May return a dict or list (callers e.g. PPT may accept a top-level slides array).
    """
    text = (raw or "").strip()
    if not text:
        raise ValueError("LLM returned empty text for JSON")

    variants: list[str] = []
    for t in (text, _strip_code_fences(text)):
        if t and t not in variants:
            variants.append(t)
        cands = [i for i in (t.find("{"), t.find("[")) if i != -1]
        st = min(cands) if cands else -1
        if st > 0 and t[st:] not in variants:
            variants.append(t[st:])

    last_err: Exception | None = None
    for t in variants:
        try:
            return json.loads(t)
        except json.JSONDecodeError as e:
            last_err = e
            continue

    try:
        from json_repair import repair_json
    except ImportError:  # pragma: no cover
        repair_json = None  # type: ignore[assignment, misc]
    if repair_json is not None:
        for t in variants:
            try:
                return repair_json(t, return_objects=True, skip_json_loads=True)
            except Exception as e:  # noqa: BLE001
                last_err = e
        try:
            s2 = repair_json(text, return_objects=False)  # type: ignore[union-attr]
            return json.loads(str(s2))
        except Exception as e:  # noqa: BLE001
            last_err = e

    msg = str(last_err) if last_err else "unknown"
    raise ValueError(f"LLM output was not valid JSON: {msg}") from last_err


def _looks_like_gemini_model(model_id: str) -> bool:
    m = (model_id or "").strip().lower()
    return m.startswith("gemini-") or m.startswith("models/gemini-") or m.startswith("gemini:")


def _looks_like_deepseek_model(model_id: str) -> bool:
    m = (model_id or "").strip().lower()
    return m.startswith("deepseek:") or m.startswith("deepseek-") or m.startswith("deepseek/")


def _normalize_gemini_model(model_id: str) -> str:
    m = (model_id or "").strip()
    if not m:
        return "gemini-2.5-flash"
    if m.lower().startswith("gemini:"):
        return m.split(":", 1)[1].strip() or "gemini-2.5-flash"
    return m


def _normalize_deepseek_model(model_id: str) -> str:
    m = (model_id or "").strip()
    if not m:
        return "deepseek-chat"
    ml = m.lower()
    if ml.startswith("deepseek:"):
        return m.split(":", 1)[1].strip() or "deepseek-chat"
    if ml.startswith("deepseek/"):
        return m.split("/", 1)[1].strip() or "deepseek-chat"
    return m


def _is_transient_gemini_overload(err: Exception) -> bool:
    msg = str(err or "")
    msg_u = msg.upper()
    # The google-genai SDK surfaces API errors in exception strings that commonly include:
    # - "503 UNAVAILABLE"
    # - status="UNAVAILABLE"
    # - "high demand"
    return ("503" in msg_u and "UNAVAILABLE" in msg_u) or ("HIGH DEMAND" in msg_u) or ("STATUS': 'UNAVAILABLE" in msg_u)


def _is_transient_http_error(err: Exception) -> bool:
    msg = str(err or "").upper()
    return any(code in msg for code in ["429", "500", "502", "503", "504", "TIMEOUT", "TIMED OUT"])


@dataclass(frozen=True)
class LlmConfig:
    model: str
    max_tokens: int = 1400


class LlmClient:
    """
    Provider-agnostic LLM client.

    Policy (as configured for this project):
    - Gemini is the preferred provider (default model ids like "gemini-...").
    - DeepSeek is the backup provider (model ids like "deepseek:deepseek-chat").
    - Anthropic is intentionally NOT used unless you explicitly select an Anthropic model id and provide a key.
    """

    def __init__(self, config: LlmConfig | None = None):
        model = (config.model if config else None) or get_active_model()
        max_tokens = (config.max_tokens if config else None) or int(os.getenv("LLM_MAX_TOKENS", "1400"))
        self._cfg = LlmConfig(model=model, max_tokens=max_tokens)

        self._anthropic: Anthropic | None = None
        self._gemini_client = None

    def _get_anthropic(self) -> Anthropic:
        if self._anthropic is not None:
            return self._anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("Missing ANTHROPIC_API_KEY env var")
        self._anthropic = Anthropic(api_key=api_key)
        return self._anthropic

    def _gemini_api_key(self) -> str:
        return (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()

    def _deepseek_api_key(self) -> str:
        return (os.getenv("DEEPSEEK_API_KEY") or "").strip()

    def _deepseek_base_url(self) -> str:
        return (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").strip().rstrip("/")

    def _fallback_to_gemini_if_available(self) -> bool:
        return bool(self._gemini_api_key())

    def _fallback_to_deepseek_if_available(self) -> bool:
        return bool(self._deepseek_api_key())

    def _get_gemini(self):
        if self._gemini_client is not None:
            return self._gemini_client
        # The google-genai SDK can read GEMINI_API_KEY/GOOGLE_API_KEY implicitly,
        # but we still validate to produce a clear error message.
        api_key = self._gemini_api_key()
        if not api_key:
            raise RuntimeError("Missing GEMINI_API_KEY (or GOOGLE_API_KEY) env var")
        try:
            from google import genai  # type: ignore
        except Exception as e:  # pragma: no cover
            raise RuntimeError(
                "Gemini support requires the google-genai package. Install it and restart the backend."
            ) from e
        self._gemini_client = genai.Client(api_key=api_key)
        return self._gemini_client

    def _deepseek_chat_completion(self, *, model: str, system: str, user: str) -> str:
        api_key = self._deepseek_api_key()
        if not api_key:
            raise RuntimeError("Missing DEEPSEEK_API_KEY env var")

        url = f"{self._deepseek_base_url()}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}"}
        # deepseek-chat accepts at most 8192 output tokens; larger values can return HTTP 400.
        # https://api-docs.deepseek.com/api/create-chat-completion
        mt = min(8192, max(256, int(self._cfg.max_tokens)))
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "max_tokens": mt,
        }

        with httpx.Client(timeout=120.0) as client:
            r = client.post(url, headers=headers, json=payload)
            if r.status_code == 400:
                detail = (r.text or "")[:1200]
                raise RuntimeError(
                    "DeepSeek request rejected (400). For deepseek-chat, max output tokens is at most 8192; "
                    "input + output must also fit the model context. "
                    f"API message: {detail}"
                )
            r.raise_for_status()
            data = r.json()
        try:
            return str(data["choices"][0]["message"]["content"] or "")
        except Exception as e:  # pragma: no cover
            raise RuntimeError(f"Unexpected DeepSeek response format: {data!r}") from e

    def describe_image(self, *, image_bytes: bytes, mime_type: str, prompt: str) -> str:
        model_id = self._cfg.model
        if _looks_like_gemini_model(model_id) and self._gemini_api_key():
            client = self._get_gemini()
            model = _normalize_gemini_model(model_id)
            try:
                from google.genai import types  # type: ignore

                contents = [
                    types.Part.from_text(prompt),
                    # Most browsers supply a correct image MIME type; fall back to jpeg if missing.
                    types.Part.from_bytes(data=image_bytes, mime_type=(mime_type or "image/jpeg")),
                ]
            except Exception:
                # Fallback: let the SDK coerce basic types if available.
                b64 = base64.b64encode(image_bytes).decode("ascii")
                contents = [prompt, {"inline_data": {"mime_type": mime_type or "image/jpeg", "data": b64}}]
            last_err: Exception | None = None
            for attempt in range(4):
                try:
                    resp = client.models.generate_content(model=model, contents=contents)
                    return (getattr(resp, "text", None) or "").strip()
                except Exception as e:
                    last_err = e
                    if _is_transient_gemini_overload(e) and attempt < 3:
                        time.sleep((0.6 * (2**attempt)) + random.random() * 0.25)
                        continue
                    break

            # If Gemini is overloaded, DeepSeek can't do vision; surface a clear error.
            raise RuntimeError(str(last_err) if last_err else "Gemini request failed")

        # DeepSeek is text-only. If selected, route vision to Gemini if available.
        if _looks_like_deepseek_model(model_id):
            if self._fallback_to_gemini_if_available():
                client = self._get_gemini()
                model = _normalize_gemini_model(os.getenv("GEMINI_VISION_MODEL") or "gemini-2.5-flash")
                try:
                    from google.genai import types  # type: ignore

                    contents = [
                        types.Part.from_text(prompt),
                        types.Part.from_bytes(data=image_bytes, mime_type=(mime_type or "image/jpeg")),
                    ]
                except Exception:
                    b64 = base64.b64encode(image_bytes).decode("ascii")
                    contents = [prompt, {"inline_data": {"mime_type": mime_type or "image/jpeg", "data": b64}}]
                resp = client.models.generate_content(model=model, contents=contents)
                return (getattr(resp, "text", None) or "").strip()
            raise RuntimeError("DeepSeek does not support image inputs; configure GEMINI_API_KEY")

        # Anthropic is intentionally disabled for this project.
        raise RuntimeError("No vision-capable provider available. Configure GEMINI_API_KEY.")

    def generate_json(self, *, system: str, user: str) -> Any:
        model_id = self._cfg.model

        # Enforce fallback policy: Gemini preferred, DeepSeek backup.
        if _looks_like_gemini_model(model_id) and (not self._gemini_api_key()) and self._fallback_to_deepseek_if_available():
            model_id = "deepseek:deepseek-chat"
        if _looks_like_gemini_model(model_id) and (not self._gemini_api_key()) and (not self._fallback_to_deepseek_if_available()):
            raise RuntimeError("Missing GEMINI_API_KEY (or GOOGLE_API_KEY) and no DEEPSEEK_API_KEY configured")
        if _looks_like_deepseek_model(model_id):
            model = _normalize_deepseek_model(model_id)
            prompt_user = "\n".join([user.strip(), "", "Return JSON only. No markdown."]).strip()

            last_err: Exception | None = None
            for attempt in range(4):
                try:
                    text = self._deepseek_chat_completion(
                        model=model,
                        system=system.strip(),
                        user=prompt_user,
                    )
                    raw = _strip_code_fences(text.strip())
                    return _json_loads_lenient(raw)
                except Exception as e:
                    last_err = e
                    if _is_transient_http_error(e) and attempt < 3:
                        time.sleep((0.8 * (2**attempt)) + random.random() * 0.3)
                        continue
                    break

            # If DeepSeek is temporarily unavailable, fall back to Gemini (preferred).
            if last_err and _is_transient_http_error(last_err) and self._fallback_to_gemini_if_available():
                model_id = _normalize_gemini_model(os.getenv("GEMINI_MODEL") or "gemini-2.5-flash")
            else:
                raise RuntimeError(str(last_err) if last_err else "DeepSeek request failed")

        if _looks_like_gemini_model(model_id) and self._gemini_api_key():
            client = self._get_gemini()
            model = _normalize_gemini_model(model_id)
            prompt = "\n".join(
                [
                    "System:",
                    system.strip(),
                    "",
                    "User:",
                    user.strip(),
                    "",
                    "Return JSON only. No markdown.",
                ]
            ).strip()
            toks = min(16384, max(512, int(self._cfg.max_tokens)))
            last_err: Exception | None = None
            for attempt in range(4):
                try:
                    try:
                        from google.genai import types  # type: ignore
                    except Exception:  # pragma: no cover
                        types = None  # type: ignore[assignment]
                    if types is not None:
                        try:
                            cfg = types.GenerateContentConfig(max_output_tokens=toks)  # type: ignore[call-arg,union-attr]
                            resp = client.models.generate_content(
                                model=model, contents=prompt, config=cfg
                            )
                        except Exception:
                            resp = client.models.generate_content(model=model, contents=prompt)
                    else:
                        resp = client.models.generate_content(model=model, contents=prompt)
                    raw = _strip_code_fences((getattr(resp, "text", None) or "").strip())
                    return _json_loads_lenient(raw)
                except Exception as e:
                    last_err = e
                    if _is_transient_gemini_overload(e) and attempt < 3:
                        time.sleep((0.8 * (2**attempt)) + random.random() * 0.3)
                        continue
                    break

            # If Gemini is overloaded, fall back to DeepSeek if configured.
            if last_err and _is_transient_gemini_overload(last_err) and self._fallback_to_deepseek_if_available():
                # Run once through DeepSeek (do not require changing active model state).
                text = self._deepseek_chat_completion(
                    model=_normalize_deepseek_model("deepseek:deepseek-chat"),
                    system=system.strip(),
                    user="\n".join([user.strip(), "", "Return JSON only. No markdown."]).strip(),
                )
                raw = _strip_code_fences(text.strip())
                return _json_loads_lenient(raw)
            raise RuntimeError(str(last_err) if last_err else "Gemini request failed")

        # Anthropic is intentionally disabled for this project.
        raise RuntimeError("No supported LLM provider available. Configure GEMINI_API_KEY (preferred) or DEEPSEEK_API_KEY.")

