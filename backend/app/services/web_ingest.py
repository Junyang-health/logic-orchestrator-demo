from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import unquote, urlparse

import httpx

from app.services import project_storage
from app.services.tavily_search import TavilyResult, tavily_search

MAX_FETCH_BYTES = 2_000_000
_FETCH_TIMEOUT = httpx.Timeout(25.0, connect=10.0)


def is_public_http_url(url: str) -> bool:
    u = (url or "").strip()
    if not u:
        return False
    p = urlparse(u)
    if p.scheme not in ("http", "https"):
        return False
    h = (p.hostname or "").lower()
    if h in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        return False
    if h in ("metadata.google.internal",) or h.endswith((".local", ".internal", ".lan")):
        return False
    return True


def _slug_filename(title: str, url: str, index: int) -> str:
    base = (title or "").strip() or unquote(urlparse(url).path.rsplit("/", 1)[-1] or "web_page")
    base = re.sub(r"[\x00-\x1f]+", "", base)
    s = re.sub(r"[^a-zA-Z0-9._\-\u4e00-\u9fff]+", "_", base).strip("._-") or "source"
    if len(s) > 90:
        s = s[:90]
    return f"{s}_{index:02d}"


def _read_response_body(
    content: bytes, content_type: str, url: str, *, title: str, index: int
) -> tuple[bytes, str, str | None]:
    """
    Return (bytes for store_file, filename with extension, error if unusable).
    """
    low = (content_type or "").lower()
    c = content[:MAX_FETCH_BYTES]
    if not c:
        return b"", ".bin", "empty body"
    root = _slug_filename(title, url, index)
    if "pdf" in low or c[:4] == b"%PDF":
        return c, f"{root}.pdf", None
    ls = c.lstrip()[:800]
    looks_html = b"<" in ls[:50] or "html" in low
    if "html" in low or (ls[:1] == b"<"):
        return c, f"{root}.html", None
    if "text/plain" in low and b"<" not in c[:400]:
        return c, f"{root}.txt", None
    if looks_html:
        return c, f"{root}.html", None
    return c, f"{root}.bin", None


def _fallback_markdown_bytes(*, title: str, url: str, tavily_snip: str, fetch_err: str) -> bytes:
    body = [
        f"# {title or '(untitled)'}",
        "",
        f"**Source URL:** {url}",
        "",
        f"**Note:** {fetch_err}",
        "",
        "**Tavily snippet:**",
        "",
        tavily_snip or "_(no snippet)_",
        "",
    ]
    return "\n".join(body).encode("utf-8")


def ingest_tavily_urls_to_project(
    *,
    project_id: str,
    queries: list[str],
    max_results_per_query: int = 3,
    max_pages_ingest: int = 15,
) -> dict[str, Any]:
    if not project_storage.project_exists(project_id):
        return {"ok": False, "error": "Project not found", "stored": [], "notices": []}
    qnorm = [q.strip() for q in queries if q and q.strip()][:20]
    if not qnorm:
        return {"ok": False, "error": "No non-empty queries", "stored": [], "notices": []}

    n_res = max(1, min(10, int(max_results_per_query or 3)))
    cap = max(1, min(30, int(max_pages_ingest or 15)))

    ordered: list[tuple[str, TavilyResult, str]] = []
    tavily_errors: list[str] = []
    for q in qnorm:
        try:
            rows = tavily_search(query=q[:240], max_results=n_res)
        except Exception as e:
            tavily_errors.append(f"{q[:80]}: {e!s}"[:200])
            continue
        for r in rows:
            ordered.append((q, r, r.url))
    if not ordered and tavily_errors:
        return {
            "ok": False,
            "error": "Tavily: " + ("; ".join(tavily_errors)[:500]),
            "stored": [],
            "notices": tavily_errors,
        }

    seen: set[str] = set()
    unique_rows: list[tuple[str, TavilyResult]] = []
    for q, r, u in ordered:
        u0 = (u or "").strip()
        if not u0 or u0 in seen or not is_public_http_url(u0):
            if u0 and not is_public_http_url(u0):
                pass  # skip unsafe
            continue
        seen.add(u0)
        unique_rows.append((q, r))
        if len(unique_rows) >= cap:
            break

    stored: list[dict[str, Any]] = []
    notices: list[str] = []
    user_agent = (
        "Mozilla/5.0 (compatible; UnboxProjectBot/1.0; +https://example.com) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0"
    )
    with httpx.Client(
        timeout=_FETCH_TIMEOUT, follow_redirects=True, headers={"User-Agent": user_agent, "Accept": "*/*"}
    ) as client:
        for i, (q, r) in enumerate(unique_rows, start=1):
            url = (r.url or "").strip()
            snip = (r.content or "").strip()
            base_name = _slug_filename(r.title, url, i)
            time.sleep(0.2)
            if not is_public_http_url(url):
                notices.append(f"Skipped URL: {url}")
                continue
            try:
                resp = client.get(url)
            except Exception as e:
                md_bytes = _fallback_markdown_bytes(
                    title=str(r.title or "Web source"),
                    url=url,
                    tavily_snip=snip,
                    fetch_err=f"Request failed: {e}",
                )
                meta = project_storage.store_file(
                    project_id=project_id,
                    filename=f"{base_name}_link.md",
                    content_type="text/markdown; charset=utf-8",
                    content=md_bytes,
                    origin="llm_ingest",
                )
                stored.append(
                    {
                        "id": meta.id,
                        "filename": meta.filename,
                        "source_url": url,
                        "from_query": q,
                        "fetch_error": str(e)[:300],
                    }
                )
                continue

            if resp.status_code < 200 or resp.status_code >= 400:
                md_bytes = _fallback_markdown_bytes(
                    title=str(r.title or "Web source"),
                    url=url,
                    tavily_snip=snip,
                    fetch_err=f"HTTP {resp.status_code}",
                )
                meta = project_storage.store_file(
                    project_id=project_id,
                    filename=f"{base_name}_http.md",
                    content_type="text/markdown; charset=utf-8",
                    content=md_bytes,
                    origin="llm_ingest",
                )
                stored.append(
                    {
                        "id": meta.id,
                        "filename": meta.filename,
                        "source_url": url,
                        "from_query": q,
                        "fetch_error": f"HTTP {resp.status_code}",
                    }
                )
                continue

            content = bytes(resp.content or b"")[:MAX_FETCH_BYTES]
            ct = (resp.headers.get("content-type") or "").split(";")[0].strip() or "application/octet-stream"
            raw, fname, err = _read_response_body(
                content, ct, url, title=str(r.title or "Web source"), index=i
            )
            if err or not raw:
                md_bytes = _fallback_markdown_bytes(
                    title=str(r.title or "Web source"), url=url, tavily_snip=snip, fetch_err=err or "empty or unsupported"
                )
                meta = project_storage.store_file(
                    project_id=project_id,
                    filename=f"{base_name}_excerpt.md",
                    content_type="text/markdown; charset=utf-8",
                    content=md_bytes,
                    origin="llm_ingest",
                )
                stored.append(
                    {
                        "id": meta.id,
                        "filename": meta.filename,
                        "source_url": url,
                        "from_query": q,
                        "fetch_error": err,
                    }
                )
                continue

            meta = project_storage.store_file(
                project_id=project_id,
                filename=fname,
                content_type=ct,
                content=raw,
                origin="llm_ingest",
            )
            stored.append(
                {
                    "id": meta.id,
                    "filename": meta.filename,
                    "source_url": url,
                    "from_query": q,
                    "fetch_error": None,
                }
            )

    return {
        "ok": True,
        "stored": stored,
        "notices": notices + tavily_errors,
        "queries_run": qnorm,
        "urls_considered": len(unique_rows),
    }
