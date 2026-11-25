#!/usr/bin/env bash
# Local stand-ins for `pnpm dev:infra` in an agent container without Docker. Idempotent: run it at
# the start of a session and again whenever a service is down (the container stops them when idle).
#   PostgreSQL 16 on 5432  (CI and production use 17; two harness tests in @radd/config fail here
#                           by design because they assert version 17 and pgvector)
#   Redis on 6399 (apps, matches REDIS_URL below) and 6398 (integration tests)
# It also bootstraps and migrates the dev database `radd` and creates `.env` if missing.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGB=/usr/lib/postgresql/16/bin
PGD=/var/lib/postgresql/radd-agent
RUN=/var/run/postgresql
REDIS_DIR="${TMPDIR:-/tmp}/radd-agent-redis"
as_pg() { runuser -u postgres -- "$@"; }
psql_su() { as_pg "$PGB/psql" -h "$RUN" -p 5432 -v ON_ERROR_STOP=1 -q "$@"; }

mkdir -p "$RUN" /var/lib/postgresql "$REDIS_DIR"
chown postgres:postgres "$RUN" /var/lib/postgresql
if [ ! -d "$PGD" ]; then
  as_pg "$PGB/initdb" -D "$PGD" -U postgres --auth-local=trust --auth-host=scram-sha-256 -E UTF8 >/dev/null
fi
if ! as_pg "$PGB/pg_isready" -h "$RUN" -p 5432 >/dev/null 2>&1; then
  rm -f "$PGD/postmaster.pid"
  as_pg "$PGB/pg_ctl" -D "$PGD" -l "$PGD/server.log" -w start \
    -o "-p 5432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=$RUN -c max_connections=200" >/dev/null
fi
psql_su -d postgres -c "ALTER ROLE postgres PASSWORD 'postgres'"

for port in 6398 6399; do
  redis-cli -p "$port" -a valkey ping 2>/dev/null | grep -q PONG ||
    redis-server --port "$port" --bind 127.0.0.1 --requirepass valkey --dir "$REDIS_DIR" \
      --save '' --appendonly no --daemonize yes >/dev/null
done

# Dev database, built the production way (ADR-021): superuser bootstrap, then migrate as app_migrator.
if ! psql_su -d postgres -tAc "select 1 from pg_database where datname = 'radd'" | grep -q 1; then
  psql_su -d postgres -c "CREATE DATABASE radd"
fi
psql_su -d radd -f "$ROOT/packages/db/sql/bootstrap-roles.sql"
psql_su -d radd -f "$ROOT/infra/postgres/init/03-local-passwords.sql"

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  # Redis here listens on 6399 with a password; .env.example points at the compose Valkey.
  sed -i 's#^REDIS_URL=.*#REDIS_URL=redis://:valkey@127.0.0.1:6399/0#' "$ROOT/.env"
fi
# Variables .env.example gained after .env was made (e.g. DATABASE_URL_WORKER) are appended.
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z][A-Z0-9_]*)= ]] || continue
  grep -q "^${BASH_REMATCH[1]}=" "$ROOT/.env" || printf '%s\n' "$line" >> "$ROOT/.env"
done < "$ROOT/.env.example"

echo "postgres: $(as_pg "$PGB/pg_isready" -h "$RUN" -p 5432 | sed 's/.* - //')   redis 6398/6399: $(redis-cli -p 6398 -a valkey ping 2>/dev/null)/$(redis-cli -p 6399 -a valkey ping 2>/dev/null)"
echo "next: pnpm install && pnpm db:migrate   (the dev database needs migrating after schema changes)"
