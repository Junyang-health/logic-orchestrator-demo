from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class TavilyResult:
    title: str
    url: str
    content: str


def _api_key() -> str:
    return (os.getenv("TAVILY_API_KEY") or "").strip()


def tavily_search(*, query: str, max_results: int = 5) -> list[TavilyResult]:
    q = " ".join((query or "").split()).strip()
    if not q:
        return []
    key = _api_key()
    if not key:
        raise RuntimeError("Missing TAVILY_API_KEY env var")

    n = max(1, min(10, int(max_results or 5)))
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": key,
        "query": q,
        "max_results": n,
        "include_answer": False,
        "include_raw_content": False,
    }

    with httpx.Client(timeout=httpx.Timeout(25.0, connect=10.0)) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        return []

    out: list[TavilyResult] = []
    for it in results:
        if not isinstance(it, dict):
            continue
        title = str(it.get("title") or "").strip()
        u = str(it.get("url") or "").strip()
        content = str(it.get("content") or "").strip()
        if not u:
            continue
        out.append(TavilyResult(title=title[:180], url=u[:500], content=content[:420]))
        if len(out) >= n:
            break
    return out


def format_results_for_prompt(results: list[TavilyResult]) -> str:
    if not results:
        return "(no results)"
    lines: list[str] = []
    for i, r in enumerate(results, start=1):
        title = r.title or "(no title)"
        snippet = r.content or ""
        lines.append(f"{i}. {title}\n   {r.url}\n   {snippet}".rstrip())
    return "\n".join(lines)

