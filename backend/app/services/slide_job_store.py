"""
SQLite-backed queue for slide-build jobs.

- API process and worker process must not share a connection; open per operation.
- Serialize writes with a lock so concurrent FastAPI threads do not corrupt SQLite.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

JobKind = Literal["slide_generate", "export_pptx", "export_pdf"]
JobStatus = Literal["pending", "running", "completed", "failed"]

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_DB_PATH = _DATA_DIR / "slide_jobs.sqlite"

_lock = threading.Lock()


def db_path() -> Path:
    return _DB_PATH


def _now_ms() -> int:
    return int(time.time() * 1000)


def _connect() -> sqlite3.Connection:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS slide_build_session (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL DEFAULT '',
              framework_json TEXT NOT NULL DEFAULT '{}',
              created_at_ms INTEGER NOT NULL,
              updated_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS slide_job (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              slide_id TEXT,
              status TEXT NOT NULL DEFAULT 'pending',
              payload_json TEXT NOT NULL DEFAULT '{}',
              result_json TEXT,
              error_text TEXT,
              created_at_ms INTEGER NOT NULL,
              started_at_ms INTEGER,
              finished_at_ms INTEGER,
              FOREIGN KEY (session_id) REFERENCES slide_build_session(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_slide_job_session ON slide_job(session_id);
            CREATE INDEX IF NOT EXISTS idx_slide_job_pending ON slide_job(created_at_ms)
              WHERE status = 'pending';
            """
        )
        conn.commit()


@dataclass(frozen=True)
class SlideBuildSessionRow:
    id: str
    title: str
    framework_json: str
    created_at_ms: int
    updated_at_ms: int


@dataclass(frozen=True)
class SlideJobRow:
    id: str
    session_id: str
    kind: str
    slide_id: str | None
    status: str
    payload_json: str
    result_json: str | None
    error_text: str | None
    created_at_ms: int
    started_at_ms: int | None
    finished_at_ms: int | None


def create_session(*, title: str, framework: dict[str, Any]) -> SlideBuildSessionRow:
    init_db()
    sid = f"sbs_{uuid.uuid4().hex[:16]}"
    t = _now_ms()
    blob = json.dumps(framework, ensure_ascii=False)
    with _lock, _connect() as conn:
        conn.execute(
            """
            INSERT INTO slide_build_session (id, title, framework_json, created_at_ms, updated_at_ms)
            VALUES (?, ?, ?, ?, ?)
            """,
            (sid, (title or "").strip() or "Deck", blob, t, t),
        )
        conn.commit()
    row = get_session(sid)
    assert row is not None
    return row


def update_session_framework(session_id: str, framework: dict[str, Any]) -> None:
    init_db()
    t = _now_ms()
    blob = json.dumps(framework, ensure_ascii=False)
    with _lock, _connect() as conn:
        conn.execute(
            """
            UPDATE slide_build_session
            SET framework_json = ?, updated_at_ms = ?
            WHERE id = ?
            """,
            (blob, t, session_id),
        )
        conn.commit()


def get_session(session_id: str) -> SlideBuildSessionRow | None:
    init_db()
    with _lock, _connect() as conn:
        cur = conn.execute(
            "SELECT id, title, framework_json, created_at_ms, updated_at_ms FROM slide_build_session WHERE id = ?",
            (session_id,),
        )
        r = cur.fetchone()
        if not r:
            return None
        return SlideBuildSessionRow(
            id=r["id"],
            title=r["title"],
            framework_json=r["framework_json"],
            created_at_ms=r["created_at_ms"],
            updated_at_ms=r["updated_at_ms"],
        )


def enqueue_job(
    *,
    session_id: str,
    kind: JobKind,
    slide_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> SlideJobRow:
    init_db()
    job_id = f"sj_{uuid.uuid4().hex[:16]}"
    t = _now_ms()
    pl = json.dumps(payload or {}, ensure_ascii=False)
    with _lock, _connect() as conn:
        conn.execute(
            """
            INSERT INTO slide_job (
              id, session_id, kind, slide_id, status, payload_json, created_at_ms
            ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
            """,
            (job_id, session_id, kind, slide_id, pl, t),
        )
        conn.execute(
            "UPDATE slide_build_session SET updated_at_ms = ? WHERE id = ?",
            (t, session_id),
        )
        conn.commit()
    row = get_job(job_id)
    assert row is not None
    return row


def get_job(job_id: str) -> SlideJobRow | None:
    init_db()
    with _lock, _connect() as conn:
        cur = conn.execute(
            """
            SELECT id, session_id, kind, slide_id, status, payload_json, result_json, error_text,
                   created_at_ms, started_at_ms, finished_at_ms
            FROM slide_job WHERE id = ?
            """,
            (job_id,),
        )
        r = cur.fetchone()
        if not r:
            return None
        return _row_to_job(r)


def list_jobs_for_session(session_id: str) -> list[SlideJobRow]:
    init_db()
    with _lock, _connect() as conn:
        cur = conn.execute(
            """
            SELECT id, session_id, kind, slide_id, status, payload_json, result_json, error_text,
                   created_at_ms, started_at_ms, finished_at_ms
            FROM slide_job WHERE session_id = ? ORDER BY created_at_ms ASC
            """,
            (session_id,),
        )
        return [_row_to_job(r) for r in cur.fetchall()]


def _row_to_job(r: sqlite3.Row) -> SlideJobRow:
    return SlideJobRow(
        id=r["id"],
        session_id=r["session_id"],
        kind=r["kind"],
        slide_id=r["slide_id"],
        status=r["status"],
        payload_json=r["payload_json"],
        result_json=r["result_json"],
        error_text=r["error_text"],
        created_at_ms=r["created_at_ms"],
        started_at_ms=r["started_at_ms"],
        finished_at_ms=r["finished_at_ms"],
    )


def claim_next_pending_job() -> SlideJobRow | None:
    """
    Atomically set one pending job to running. Returns None if queue empty.
    Safe for multiple worker processes (second UPDATE affects 0 rows).
    """
    init_db()
    with _lock, _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.execute(
            """
            SELECT id FROM slide_job
            WHERE status = 'pending'
            ORDER BY created_at_ms ASC
            LIMIT 1
            """
        )
        one = cur.fetchone()
        if not one:
            conn.rollback()
            return None
        jid = str(one["id"])
        start = _now_ms()
        upd = conn.execute(
            """
            UPDATE slide_job
            SET status = 'running', started_at_ms = ?
            WHERE id = ? AND status = 'pending'
            """,
            (start, jid),
        )
        if upd.rowcount != 1:
            conn.rollback()
            return None
        conn.commit()
        row = conn.execute(
            """
            SELECT id, session_id, kind, slide_id, status, payload_json, result_json, error_text,
                   created_at_ms, started_at_ms, finished_at_ms
            FROM slide_job WHERE id = ?
            """,
            (jid,),
        ).fetchone()
        return _row_to_job(row) if row else None


def complete_job(job_id: str, result: dict[str, Any] | None = None) -> None:
    init_db()
    t = _now_ms()
    blob = json.dumps(result or {}, ensure_ascii=False)
    with _lock, _connect() as conn:
        conn.execute(
            """
            UPDATE slide_job
            SET status = 'completed', result_json = ?, error_text = NULL, finished_at_ms = ?
            WHERE id = ?
            """,
            (blob, t, job_id),
        )
        conn.commit()


def fail_job(job_id: str, error: str) -> None:
    init_db()
    t = _now_ms()
    with _lock, _connect() as conn:
        conn.execute(
            """
            UPDATE slide_job
            SET status = 'failed', error_text = ?, finished_at_ms = ?
            WHERE id = ?
            """,
            ((error or "")[:8000], t, job_id),
        )
        conn.commit()
