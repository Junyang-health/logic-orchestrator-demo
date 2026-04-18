"""Fetch remote text (e.g. GitHub raw skill files) for assistant custom skills."""

from __future__ import annotations

import re
from urllib.parse import urlparse, urlunparse

import httpx

# Instruction length must match CustomSkillIn.max_length on the API.
MAX_INSTRUCTION_CHARS = 8000
MAX_DOWNLOAD_BYTES = 400_000

_ALLOWED_HOSTS = frozenset(
    {
        "raw.githubusercontent.com",
        "gist.githubusercontent.com",
    }
)

_GITHUB_BLOB = re.compile(
    r"^https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/blob/(?P<ref>[^/]+)/(?P<path>.+)$",
    re.IGNORECASE,
)


def _strip_url_noise(url: str) -> str:
    p = urlparse(url.strip())
    return urlunparse((p.scheme, p.netloc, p.path, "", "", ""))


def normalize_skill_source_url(url: str) -> str:
    """Turn GitHub blob URLs into raw.githubusercontent.com URLs."""
    u = _strip_url_noise(url)
    m = _GITHUB_BLOB.match(u)
    if m:
        owner, repo, ref, path = m.group("owner"), m.group("repo"), m.group("ref"), m.group("path")
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}"
    return u


def _parsed_allowed(parsed) -> bool:
    if (parsed.scheme or "").lower() != "https":
        return False
    host = (parsed.hostname or "").lower()
    if host in _ALLOWED_HOSTS:
        return True
    # https://github.com/owner/repo/raw/branch/path — GitHub may redirect to raw CDN.
    if host in ("github.com", "www.github.com"):
        parts = [x for x in (parsed.path or "").split("/") if x]
        return len(parts) >= 4 and parts[2].lower() == "raw"
    return False


def _validate_response_chain(resp: httpx.Response) -> None:
    for r in (*resp.history, resp):
        p = urlparse(str(r.url))
        if not _parsed_allowed(p):
            raise ValueError(f"URL chain not allowed (blocked hop): {r.url}")


def _suggested_name_from_url(url: str) -> str:
    path = (urlparse(url).path or "").rstrip("/")
    if not path:
        return "Remote skill"
    seg = path.rsplit("/", 1)[-1]
    return seg[:120] if seg else "Remote skill"


def fetch_skill_text(url: str) -> tuple[str, str, str]:
    """
    Download text from an allowlisted HTTPS URL.

    Returns (instruction_text, suggested_skill_name, final_url_after_redirects).
    """
    normalized = normalize_skill_source_url(url)
    first = urlparse(normalized)
    if not _parsed_allowed(first):
        raise ValueError(
            "Only HTTPS URLs on raw.githubusercontent.com, gist.githubusercontent.com, "
            "or github.com/…/raw/…/… are allowed. For repo files, use the “Raw” link or a blob URL."
        )

    headers = {"User-Agent": "MindmapAssistantSkillFetch/1.0", "Accept": "text/plain,*/*"}
    with httpx.Client(timeout=25.0, follow_redirects=True) as client:
        resp = client.get(normalized, headers=headers)
    resp.raise_for_status()
    _validate_response_chain(resp)

    data = resp.content
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise ValueError(f"File too large (max {MAX_DOWNLOAD_BYTES // 1000}KB)")

    text = data.decode("utf-8", errors="replace").strip()
    if not text:
        raise ValueError("Downloaded file is empty")

    name = _suggested_name_from_url(str(resp.url))
    if len(text) > MAX_INSTRUCTION_CHARS:
        text = text[: MAX_INSTRUCTION_CHARS - 1] + "…"

    final_url = str(resp.url)
    return text, name, final_url
