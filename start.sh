#!/usr/bin/env bash
# Local dev: Postgres (Compose), migrate, API + Vite, then open the app in a browser.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/start-common.sh
source "${ROOT}/scripts/lib/start-common.sh"

SERVER_PID=""
CLIENT_PID=""

start_cleanup() {
  local pid=""
  for pid in "$CLIENT_PID" "$SERVER_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}

start_main() {
  cd "$START_REPO_ROOT"

  start_require_cmd docker
  start_require_cmd npm
  start_require_cmd node
  start_require_cmd curl

  start_ensure_env_file "${START_REPO_ROOT}/.env"
  start_ensure_node_modules "$START_REPO_ROOT"
  start_begin_dev_logs

  printf 'Checking dev ports %s (Vite) and %s (API)…\n' "$START_CLIENT_PORT" "$START_API_PORT" >&2
  start_free_dev_ports

  printf 'Starting Postgres (docker compose)…\n' >&2
  docker compose -f "${START_REPO_ROOT}/docker-compose.yml" up -d --wait postgres

  printf 'Running database migrations…\n' >&2
  npm run migrate -w server

  trap start_cleanup EXIT INT TERM

  printf 'Starting API (8787) and Vite (5173)…\n' >&2
  npm run dev -w server >"${START_LOG_DIR}/server.log" 2>&1 &
  SERVER_PID=$!
  npm run dev -w client >"${START_LOG_DIR}/client.log" 2>&1 &
  CLIENT_PID=$!

  start_wait_for_url "$START_DEFAULT_API_HEALTH_URL" "API" 120
  start_wait_for_url "$START_DEFAULT_CLIENT_URL" "Vite dev server" 120

  printf '\nSherehe is running:\n  App:    %s\n  API:    http://127.0.0.1:8787\n  Logs:   %s\n\nPress Ctrl+C to stop the Node dev servers (Postgres stays up).\n' \
    "$START_DEFAULT_CLIENT_URL" "$START_LOG_DIR" >&2

  start_open_browser "$START_DEFAULT_CLIENT_URL"

  wait "$SERVER_PID" "$CLIENT_PID"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  start_main "$@"
fi
