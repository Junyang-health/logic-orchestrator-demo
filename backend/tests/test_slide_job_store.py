import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services import slide_job_store as sjs
from app.services.slide_job_handlers import run_slide_job


@pytest.fixture()
def isolated_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)

    def _path():
        import pathlib

        return pathlib.Path(path)

    monkeypatch.setattr(sjs, "_DB_PATH", _path())
    sjs.init_db()
    yield path
    try:
        os.unlink(path)
    except OSError:
        pass


def test_enqueue_claim_complete(isolated_db, monkeypatch):
    class _FakeLlm:
        def __init__(self, *a, **k):
            pass

        def generate_json(self, **kwargs):
            return {"slide_inner_html": "<section><h1>T</h1></section>", "speaker_notes": ""}

    monkeypatch.setattr("app.services.slide_job_handlers.LlmClient", _FakeLlm)

    session = sjs.create_session(title="T", framework={"slides": [{"id": "a", "title": "x"}]})
    j = sjs.enqueue_job(session_id=session.id, kind="slide_generate", slide_id="a", payload={})
    claimed = sjs.claim_next_pending_job()
    assert claimed is not None
    assert claimed.id == j.id
    assert claimed.status == "running"
    out = run_slide_job(claimed)
    sjs.complete_job(claimed.id, out)
    row = sjs.get_job(claimed.id)
    assert row is not None
    assert row.status == "completed"
    assert row.result_json is not None


def test_second_claim_empty_queue(isolated_db):
    session = sjs.create_session(title="T", framework={"slides": []})
    sjs.enqueue_job(session_id=session.id, kind="export_pdf", payload={})
    a = sjs.claim_next_pending_job()
    b = sjs.claim_next_pending_job()
    assert a is not None
    assert b is None
