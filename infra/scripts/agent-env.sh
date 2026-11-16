#!/usr/bin/env bash
# Source this at the start of every agent (Claude Code cloud) session:  source infra/scripts/agent-env.sh
# The container ships Node 22 and no Docker; the repo needs Node 24 (.nvmrc) and a database.
# Installs Node into ~/.cache once (checksum-verified), then only sets environment variables.
# Then start the local services with:  infra/scripts/agent-services.sh
_radd_node_version="$(tr -d 'v[:space:]' < "$(dirname "${BASH_SOURCE[0]}")/../../.nvmrc")"
_radd_cache="${RADD_AGENT_CACHE:-$HOME/.cache/radd-agent}"
_radd_node_dir="$_radd_cache/node-v$_radd_node_version"
if [ ! -x "$_radd_node_dir/bin/node" ]; then
  mkdir -p "$_radd_cache" && (
    cd "$_radd_cache" || exit 1
    tarball="node-v$_radd_node_version-linux-x64.tar.xz"
    base="https://nodejs.org/dist/v$_radd_node_version"
    curl -fsSLO "$base/$tarball" && curl -fsSLO "$base/SHASUMS256.txt" &&
      grep " $tarball\$" SHASUMS256.txt | sha256sum -c - >/dev/null &&
      mkdir -p "$_radd_node_dir" && tar -xJf "$tarball" -C "$_radd_node_dir" --strip-components=1 &&
      rm -f "$tarball" SHASUMS256.txt
  ) || echo "agent-env: could not install Node $_radd_node_version" >&2
fi
export PATH="$_radd_node_dir/bin:$PATH"
export COREPACK_HOME="$_radd_cache/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export TURBO_TELEMETRY_DISABLED=1
export NEXT_TELEMETRY_DISABLED=1
# Playwright uses the browser preinstalled in the container instead of downloading one.
_radd_chromium="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)"
[ -n "$_radd_chromium" ] && export PW_CHROMIUM_PATH="$_radd_chromium"
# Integration tests use these instead of Testcontainers (no Docker here). See agent-services.sh.
export TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
export TEST_VALKEY_URL=redis://:valkey@127.0.0.1:6398/0
corepack enable >/dev/null 2>&1 || true
unset _radd_node_version _radd_cache _radd_node_dir _radd_chromium
