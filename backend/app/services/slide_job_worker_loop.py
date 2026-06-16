"""
Shared slide-job queue processing: used by ``python -m worker`` and the optional embedded API thread.
"""

from __future__ import annotations

import os
import time
import traceback

from app.services.slide_job_handlers import run_slide_job
from app.services.slide_job_store import claim_next_pending_job, complete_job, fail_job


def process_next_slide_job() -> bool:
    """
    Claim and run at most one pending job. Returns True if a job was processed (completed or failed).
    """
    job = claim_next_pending_job()
    if not job:
        return False
    try:
        out = run_slide_job(job)
        complete_job(job.id, out)
    except Exception as e:  # noqa: BLE001
        err = f"{e}\n{traceback.format_exc()}"
        fail_job(job.id, err)
    return True


def run_forever(*, poll_sec: float | None = None, log: bool = False) -> None:
    """Poll until interrupted (SIGINT / process exit). Used by standalone worker."""
    ps = poll_sec if poll_sec is not None else float(os.getenv("SLIDE_JOB_POLL_SEC", "2"))
    while True:
        if process_next_slide_job():
            if log:
                print("slide job processed", flush=True)
            continue
        time.sleep(ps)
