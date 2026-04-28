from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from app.services.project_source_text import load_for_assistant_prompt


def assistant_load_source_context(
    *,
    project_id: Optional[str],
    include_project_sources: bool,
    source_max_chars: int,
    source_file_ids: Optional[List[str]],
) -> Optional[str]:
    if not include_project_sources or source_max_chars <= 0:
        return None
    if source_file_ids is not None and len(source_file_ids) == 0:
        return None
    fids: Optional[List[str]]
    if source_file_ids is None:
        fids = None
    else:
        fids = [str(x).strip() for x in source_file_ids[:64] if str(x).strip()]
        if not fids:
            return None
    return load_for_assistant_prompt(
        project_id,
        include=True,
        max_chars=source_max_chars,
        file_ids=fids,
    )


def branch_guard(nodes: List[Dict[str, Any]], branch_root_id: str) -> None:
    if not nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")
    ids = {str(n.get("id")) for n in nodes if isinstance(n, dict) and n.get("id")}
    if branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")
