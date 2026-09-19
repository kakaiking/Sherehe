#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run typecheck
npm run lint
npm test
if command -v bats >/dev/null 2>&1; then
  bats scripts/test/start-common.bats
fi
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck start.sh scripts/lib/start-common.sh scripts/ci.sh
fi
