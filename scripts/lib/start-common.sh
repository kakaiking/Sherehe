#!/usr/bin/env bash
# Shared helpers for ./start.sh — sourceable (see BATS tests).
shopt -s nullglob

readonly START_REPO_ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
)"
readonly START_CLIENT_PORT="${START_CLIENT_PORT:-5173}"
readonly START_API_PORT="${START_API_PORT:-8787}"
readonly START_DEFAULT_CLIENT_URL="${START_CLIENT_URL:-http://localhost:${START_CLIENT_PORT}}"
readonly START_DEFAULT_API_HEALTH_URL="${START_API_HEALTH_URL:-http://127.0.0.1:${START_API_PORT}/health}"
readonly START_LOG_DIR="${START_LOG_DIR:-${START_REPO_ROOT}/.local/state/sherehe-dev}"

start_die() {
  printf '%s\n' "$*" >&2
  exit 1
}

start_require_cmd() {
  local name=$1
  command -v "$name" >/dev/null 2>&1 || start_die "Required command not found: $name"
}

start_ensure_env_file() {
  local env_file=$1
  if [[ -f "$env_file" ]]; then
    return 0
  fi
  local example="${env_file}.example"
  [[ -f "$example" ]] || start_die "Missing $env_file and no $example to copy."
  cp "$example" "$env_file"
  printf 'Created %s from %s — review secrets before sharing this machine.\n' "$env_file" "$example" >&2
}

start_url_ready() {
  local url=$1
  curl -fsS --max-time 3 "$url" >/dev/null 2>&1
}

start_wait_for_url() {
  local url=$1
  local label=$2
  local max_seconds=${3:-120}
  local elapsed=0
  while ((elapsed < max_seconds)); do
    if start_url_ready "$url"; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  start_die "${label} did not respond at ${url} within ${max_seconds}s (see logs in ${START_LOG_DIR})"
}

start_open_browser() {
  local url=$1
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
    return 0
  fi
  if command -v gnome-open >/dev/null 2>&1; then
    gnome-open "$url" >/dev/null 2>&1 &
    return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
    return 0
  fi
  printf 'Dev app ready: %s (open this URL in your browser)\n' "$url" >&2
}

start_ensure_node_modules() {
  local root=$1
  if [[ -d "${root}/node_modules" ]]; then
    return 0
  fi
  printf 'Installing npm dependencies…\n' >&2
  (cd "$root" && npm install)
}

start_begin_dev_logs() {
  mkdir -p "$START_LOG_DIR"
  chmod 700 "$START_LOG_DIR" 2>/dev/null || true
}

start_validate_port() {
  local port=$1
  [[ "$port" =~ ^[0-9]+$ ]] || start_die "Invalid port: ${port}"
  ((port >= 1 && port <= 65535)) || start_die "Port out of range: ${port}"
}

# Prints listening PIDs for a TCP port (space-separated, may be empty).
start_pids_on_port() {
  local port=$1
  local pids=""

  start_validate_port "$port"

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | sort -u | tr '\n' ' ' || true)"
  fi

  if [[ -z "${pids// /}" ]] && command -v ss >/dev/null 2>&1; then
    pids="$(
      ss -ltnp "sport = :${port}" 2>/dev/null \
        | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
        | sort -u \
        | tr '\n' ' '
    )"
  fi

  if [[ -z "${pids// /}" ]] && command -v fuser >/dev/null 2>&1; then
    pids="$(
      fuser -n tcp "${port}" 2>/dev/null \
        | tr -s ' ' '\n' \
        | sed -n 's/^\([0-9][0-9]*\)$/\1/p' \
        | sort -u \
        | tr '\n' ' '
    )"
  fi

  printf '%s' "${pids// /}"
}

start_port_listening() {
  local port=$1
  [[ -n "$(start_pids_on_port "$port")" ]]
}

start_stop_pid() {
  local pid=$1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  ((pid > 1)) || return 0
  kill -TERM "$pid" 2>/dev/null || true
}

start_free_port() {
  local port=$1
  local label=$2
  local pids pid still

  start_validate_port "$port"
  pids="$(start_pids_on_port "$port")"
  if [[ -z "${pids// /}" ]]; then
    return 0
  fi

  printf 'Port %s (%s) in use — stopping listener(s): %s\n' "$port" "$label" "$pids" >&2
  for pid in $pids; do
    start_stop_pid "$pid"
  done
  sleep 1
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  sleep 0.5
  still="$(start_pids_on_port "$port")"
  if [[ -n "${still// /}" ]]; then
    start_die "Could not free port ${port} (${label}); still held by: ${still}"
  fi
}

start_free_dev_ports() {
  start_free_port "$START_CLIENT_PORT" "Vite"
  start_free_port "$START_API_PORT" "API"
}
