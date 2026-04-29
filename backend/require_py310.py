"""Fail fast if the venv interpreter is too old (deps e.g. markitdown need Python 3.10+)."""

from __future__ import annotations

import sys

_MIN = (3, 10)


def main() -> None:
    if sys.version_info >= _MIN:
        return
    ver = sys.version.split()[0]
    mi, mn = _MIN
    sys.stderr.write(
        f"This backend requires Python {mi}.{mn}+ (this interpreter is {ver}).\n"
        "Recreate the virtualenv, for example:\n"
        "  cd backend && rm -rf .venv\n"
        "  python3.11 -m venv .venv    # or python3.12 / python3.10\n"
        "  .venv/bin/pip install -r requirements.txt\n"
    )
    raise SystemExit(1)


if __name__ == "__main__":
    main()
