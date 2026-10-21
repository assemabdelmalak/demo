#!/usr/bin/env bash
# Verifies the local infrastructure from infra/docker-compose.dev.yml (P0-T03 acceptance).
# Run after `pnpm dev:infra`. Exits non-zero on the first failed check.
set -euo pipefail

COMPOSE=(docker compose -f "$(dirname "$0")/../docker-compose.dev.yml")
S3=${S3_ENDPOINT:-http://localhost:9000}
S3_KEY=${S3_ACCESS_KEY_ID:-radd-local}
S3_SECRET=${S3_SECRET_ACCESS_KEY:-radd-local-secret}
S3_ADMIN_UI=${S3_ADMIN_UI:-http://localhost:9001/}

pass() { printf '  ok  %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1" >&2; exit 1; }
expect_status() { # name expected actual
  if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else fail "$1: expected HTTP $2, got $3"; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

check_postgres() {
  echo "postgres"
  local exts roles
  exts=$("${COMPOSE[@]}" exec -T postgres psql -U postgres -d radd -tAc \
    "select string_agg(extname, ',' order by extname) from pg_extension where extname in ('citext','pg_trgm','unaccent','vector')")
  [[ "$exts" == "citext,pg_trgm,unaccent,vector" ]] && pass "extensions: $exts" || fail "extensions: got '$exts'"
  roles=$("${COMPOSE[@]}" exec -T postgres psql -U postgres -d radd -tAc \
    "select string_agg(rolname || ':' || rolbypassrls, ',' order by rolname) from pg_roles where rolname like 'app\_%'")
  [[ "$roles" == "app_admin:true,app_migrator:false,app_runtime:false" ]] && pass "roles: $roles" || fail "roles: got '$roles'"
  "${COMPOSE[@]}" exec -T -e PGPASSWORD=app_runtime postgres psql -h 127.0.0.1 -U app_runtime -d radd -tAc 'select 1' >/dev/null \
    && pass "app_runtime can connect" || fail "app_runtime cannot connect"
}

check_valkey() {
  echo "valkey"
  [[ "$("${COMPOSE[@]}" exec -T valkey valkey-cli -a valkey --no-auth-warning ping)" == "PONG" ]] && pass "ping" || fail "ping"
  [[ "$("${COMPOSE[@]}" exec -T valkey valkey-cli ping 2>&1)" == *NOAUTH* ]] && pass "password required" \
    || fail "valkey accepts unauthenticated clients"
}

check_s3() {
  echo "s3"
  local key="smoke/$(date +%s)-$RANDOM.txt" acao
  local signed=(--aws-sigv4 'aws:amz:auto:s3' --user "$S3_KEY:$S3_SECRET")
  expect_status "signed PUT radd-assets" 200 "$(status "${signed[@]}" -X PUT --data-binary hello -H 'content-type: text/plain' "$S3/radd-assets/$key")"
  expect_status "anonymous GET radd-assets" 200 "$(status "$S3/radd-assets/$key")"
  expect_status "anonymous PUT radd-assets is denied" 403 "$(status -X PUT --data-binary x "$S3/radd-assets/$key")"
  expect_status "signed PUT radd-private" 200 "$(status "${signed[@]}" -X PUT --data-binary secret "$S3/radd-private/$key")"
  expect_status "anonymous GET radd-private is denied" 403 "$(status "$S3/radd-private/$key")"
  acao=$(curl -s -o /dev/null -D - -X OPTIONS -H 'origin: http://localhost:3000' -H 'access-control-request-method: PUT' \
    "$S3/radd-assets/$key" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
  [[ "$acao" == "http://localhost:3000" ]] && pass "CORS allows the diner origin" || fail "CORS preflight: got '$acao'"
  expect_status "CORS rejects other origins" 403 "$(status -X OPTIONS -H 'origin: http://evil.test' -H 'access-control-request-method: PUT' "$S3/radd-assets/$key")"
  expect_status "admin UI" 200 "$(status -L "$S3_ADMIN_UI")"
}

check_mailpit() {
  echo "mailpit"
  expect_status "web UI" 200 "$(status http://localhost:8025/)"
}

checks=("$@")
[[ ${#checks[@]} -gt 0 ]] || checks=(postgres valkey s3 mailpit)
for check in "${checks[@]}"; do "check_$check"; done
echo "infrastructure checks passed: ${checks[*]}"
