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


def format_multi_queries_for_prompt(sections: list[tuple[str, list[TavilyResult]]]) -> str:
    """Group Tavily results by search query; deduplicate URLs across the whole run (mark repeats)."""
    if not sections:
        return "(no results)"
    seen: set[str] = set()
    blocks: list[str] = []
    for q, results in sections:
        sub: list[str] = [f"**Query:** {q.strip() or '(empty)'}"]
        if not results:
            sub.append("  (no hits for this query)")
        for r in results:
            u = (r.url or "").strip()
            if not u:
                continue
            if u in seen:
                sub.append(f"  (same URL as earlier) {u[:500]}")
                continue
            seen.add(u)
            title = (r.title or "(no title)")[:200]
            snip = (r.content or "")[:420]
            sub.append(f"  - {title}\n    {u}\n    {snip}")
        blocks.append("\n".join(sub))
    return "\n\n".join(blocks)


def resolve_assistant_search_queries(
    web_search_query: str | None,
    messages: list[dict[str, str]],
    *,
    max_queries: int = 12,
) -> list[str]:
    """
    - If the explicit web search box is non-empty: one query per non-empty line (up to max_queries, each max 240 chars).
    - If empty: use the latest user message. If that message has multiple non-empty lines, use each as a query;
      otherwise a single query from the full message (max 240 chars).
    """
    ex = (web_search_query or "").strip()
    if ex:
        lines = [p.strip() for p in ex.splitlines() if p.strip()]
        if not lines:
            return []
        if len(lines) == 1:
            return [lines[0][:240]]
        return [p[:240] for p in lines[:max_queries]]

    for m in reversed(messages):
        if (m.get("role") or "").strip().lower() != "user":
            continue
        last = (m.get("content") or "").strip()
        if not last:
            continue
        lines = [p.strip() for p in last.splitlines() if p.strip()]
        if len(lines) > 1:
            return [p[:240] for p in lines[:max_queries]]
        return [last[:240]]
    return []

