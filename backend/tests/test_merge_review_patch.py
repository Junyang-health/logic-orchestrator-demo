"""Verify assistant-style graph merges: no duplicate node ids, safe add_nodes."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.review_apply import collect_branch_node_ids, merge_review_patch


def _ids(nodes: list) -> set[str]:
    return {str(n["id"]) for n in nodes if isinstance(n, dict) and n.get("id")}


def test_add_nodes_skip_duplicate_id():
    full_nodes = [
        {"id": "root", "label": "R", "type": "Inferred", "metadata": {}},
        {"id": "rev_dup", "label": "Existing", "type": "Inferred", "metadata": {}},
    ]
    full_edges = [{"source": "root", "target": "rev_dup", "label": "x"}]
    all_ids = _ids(full_nodes)
    branch_ids = collect_branch_node_ids(root_id="root", edges=full_edges, all_ids=all_ids)
    patch = {
        "add_nodes": [
            {"id": "rev_dup", "label": "LLM tried duplicate", "type": "Inferred", "metadata": {}},
            {"id": "rev_new_ok", "label": "New", "type": "Inferred", "metadata": {}},
        ],
        "add_edges": [{"source": "root", "target": "rev_new_ok", "label": "includes"}],
    }
    out = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id="root",
        branch_ids=branch_ids,
        patch=patch,
    )
    ids = _ids(out["nodes"])
    assert "rev_dup" in ids
    assert "rev_new_ok" in ids
    assert len(ids) == len(out["nodes"])
    by_id = {n["id"]: n for n in out["nodes"]}
    assert by_id["rev_dup"]["label"] == "Existing"


def test_add_nodes_renames_invalid_id_to_rev():
    full_nodes = [{"id": "root", "label": "R", "type": "Inferred", "metadata": {}}]
    full_edges: list = []
    all_ids = _ids(full_nodes)
    branch_ids = collect_branch_node_ids(root_id="root", edges=full_edges, all_ids=all_ids)
    patch = {
        "add_nodes": [{"id": "badid", "label": "X", "type": "Inferred", "metadata": {}}],
        "add_edges": [],
    }
    out = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id="root",
        branch_ids=branch_ids,
        patch=patch,
    )
    ids = _ids(out["nodes"])
    assert "root" in ids
    assert "badid" not in ids
    rev_ids = [i for i in ids if i.startswith("rev_")]
    assert len(rev_ids) == 1


def test_duplicate_ids_in_input_last_wins():
    full_nodes = [
        {"id": "a", "label": "1", "type": "Inferred", "metadata": {}},
        {"id": "a", "label": "2", "type": "Inferred", "metadata": {}},
    ]
    full_edges: list = []
    all_ids = _ids(full_nodes)
    branch_ids = collect_branch_node_ids(root_id="a", edges=full_edges, all_ids=all_ids)
    out = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id="a",
        branch_ids=branch_ids,
        patch={},
    )
    assert len(out["nodes"]) == 1
    assert out["nodes"][0]["label"] == "2"


if __name__ == "__main__":
    test_add_nodes_skip_duplicate_id()
    test_add_nodes_renames_invalid_id_to_rev()
    test_duplicate_ids_in_input_last_wins()
    print("merge_review_patch verification: OK")
