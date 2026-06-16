"""
Poll SQLite for pending slide-build jobs and execute them.

Usage (from ``backend/``)::

    python -m worker

Use this when ``UNBOX_EMBEDDED_SLIDE_WORKER=0`` and you want a dedicated worker process.

Environment:

- ``SLIDE_JOB_POLL_SEC`` — seconds to sleep when the queue is empty (default ``2``).
"""

from __future__ import annotations

import os
import sys

# Allow ``python -m worker`` from ``backend/`` without installing the package.
_backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

from app.services.slide_job_worker_loop import run_forever  # noqa: E402


def main() -> None:
    poll = float(os.getenv("SLIDE_JOB_POLL_SEC", "2"))
    print("slide-build worker started — poll interval", poll, "s", flush=True)
    run_forever(poll_sec=poll, log=True)


if __name__ == "__main__":
    main()
