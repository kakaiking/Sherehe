#!/usr/bin/env bats
# Bats tests for scripts/lib/start-common.sh (run: bats scripts/test/start-common.bats)

setup() {
  # shellcheck source=../lib/start-common.sh
  source "${BATS_TEST_DIRNAME}/../lib/start-common.sh"
  TEST_TMPDIR="${BATS_TEST_TMPDIR}/start-common"
  mkdir -p "$TEST_TMPDIR"
}

@test "start_ensure_env_file copies .env.example when .env is missing" {
  local dir="${TEST_TMPDIR}/env-copy"
  mkdir -p "$dir"
  printf 'NODE_ENV=test\n' >"${dir}/.env.example"
  start_ensure_env_file "${dir}/.env"
  [[ -f "${dir}/.env" ]]
  grep -q 'NODE_ENV=test' "${dir}/.env"
}

@test "start_ensure_env_file leaves existing .env unchanged" {
  local dir="${TEST_TMPDIR}/env-keep"
  mkdir -p "$dir"
  printf 'KEEP=1\n' >"${dir}/.env"
  printf 'OTHER=2\n' >"${dir}/.env.example"
  start_ensure_env_file "${dir}/.env"
  grep -q 'KEEP=1' "${dir}/.env"
  ! grep -q 'OTHER=2' "${dir}/.env"
}

@test "start_url_ready returns success for a listening HTTP server" {
  local port http_pid
  port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
  python3 -m "http.server" "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
  http_pid=$!
  sleep 0.5
  start_url_ready "http://127.0.0.1:${port}/"
  kill "$http_pid" 2>/dev/null || true
  wait "$http_pid" 2>/dev/null || true
}

@test "start_url_ready returns failure when nothing listens" {
  ! start_url_ready "http://127.0.0.1:1/"
}

@test "start_free_port stops a listener and releases the port" {
  local port http_pid
  port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
  python3 -m "http.server" "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
  http_pid=$!
  sleep 0.5
  [[ -n "$(start_pids_on_port "$port")" ]]
  start_free_port "$port" "test"
  ! start_port_listening "$port"
  kill "$http_pid" 2>/dev/null || true
  wait "$http_pid" 2>/dev/null || true
}
