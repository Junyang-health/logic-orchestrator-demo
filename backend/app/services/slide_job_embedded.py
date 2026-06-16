"""
Optional background worker inside the FastAPI process so slide jobs are not stuck on "pending"
when only ``uvicorn`` is running (no separate ``python -m worker`` terminal).

Disable with env: ``UNBOX_EMBEDDED_SLIDE_WORKER=0`` (use an external worker only).
"""

from __future__ import annotations

import os
import threading


def start_embedded_slide_worker() -> None:
    raw = os.getenv("UNBOX_EMBEDDED_SLIDE_WORKER", "1").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return

    def _target() -> None:
        from app.services.slide_job_worker_loop import run_forever

        poll = float(os.getenv("SLIDE_JOB_POLL_SEC", "1.5"))
        run_forever(poll_sec=poll, log=False)

    t = threading.Thread(
        target=_target,
        name="embedded-slide-job-worker",
        daemon=True,
    )
    t.start()
