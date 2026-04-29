#!/bin/bash
# Double-click in Finder to start Unbox (macOS). First run may open backend/.env for API keys.
cd "$(dirname "$0")"
exec bash ./scripts/start-unbox.sh
