# DEPLOYMENT — Radd Menu

## 1. Topology (Stage 1: pilot, ≤ 50 restaurants)

- **Hetzner Cloud.** One server in the EU (Falkenstein or Nuremberg).
  - Size: 8 vCPU / 16–32 GB RAM (dedicated-vCPU class preferred for steady latency).
  - Ubuntu 24.04 LTS.
  - Enable Hetzner backups (snapshots).
- **Coolify v4** (self-hosted, open source) installed on the server. It manages Docker, the Traefik proxy, TLS, deployments, logs, and database backups to S3.
- **Resources in Coolify** (one *project*, two *environments*: staging and production):

| Resource | Image | Notes |
|---|---|---|
| postgres | `pgvector/pgvector:pg17` | Persistent volume. Scheduled backups: daily 03:00 Asia/Beirut → R2 `radd-backups`, keep 30. Separate DBs for staging and prod. |
| valkey | `valkey/valkey:8` | AOF on. Password. Not exposed publicly. |
| api | `ghcr.io/<org>/radd-menu-api:<tag>` | Port 4000. Health `/v1/health/ready`. 1 replica at Stage 1. |
| worker | `ghcr.io/<org>/radd-menu-worker:<tag>` | No port. Health via BullMQ heartbeat key + a tiny HTTP probe on 4100. |
| diner | `ghcr.io/<org>/radd-menu-diner:<tag>` | Port 3000. Next.js standalone output. |
| console | `ghcr.io/<org>/radd-menu-console:<tag>` | Port 3001. Next.js standalone output. |
| migrate (one-off) | api image, command `node dist/migrate.js` | Run before each deploy (Coolify pre-deployment command, or a CI step via SSH). |

- **Domains** (production):
  - `m.<domain>` → diner
  - `app.<domain>` → console
  - `api.<domain>` → api, with the WebSocket upgrade enabled
  - `cdn.<domain>` → R2 public bucket (Cloudflare custom domain)
- **Staging domains:** `m.staging.<domain>`, `app.staging.<domain>`, `api.staging.<domain>`.

## 2. Dockerfiles (`infra/docker/*.Dockerfile`)

- **Multi-stage build** (one Dockerfile per app, built from the repo root):
  1. `prune`: `turbo prune @radd/<app> --docker` keeps only the app and the workspace packages it uses.
  2. `build`: `pnpm install --frozen-lockfile --ignore-scripts` on the pruned manifests (cached pnpm store), then the pruned sources, then `turbo run build --filter=@radd/<app>`.
     - Nest apps (api, worker): `pnpm deploy --prod --legacy --ignore-scripts` writes a self-contained folder: `dist` plus production dependencies, workspace packages included. Third-party source maps and type declarations are then deleted (unused at runtime, ~55 MB), and `@sentry/node`'s build-time bundler plugins are left out through a pnpm override.
     - Next apps (diner, console): `output: 'standalone'`; the build script copies `.next/static` and `public` into the standalone folder.
  3. `runtime`: `node:24-alpine`, pinned by digest. Only the deployed folder is copied in.
- **Runtime hardening:**
  - non-root user (`node`)
  - `NODE_ENV=production`
  - `--enable-source-maps` for the Nest apps
  - `HEALTHCHECK` with a Node one-liner (no curl in the image)
- **No app config at build time.** Every image reads its env at start-up and exits with a readable list if something is missing (P0-T02). The Next apps hand their public config to the browser at request time, so one image serves staging and production (ADR-012).
- **Build args:** `GIT_SHA` and `APP_VERSION`, exposed to Sentry as the release.
- **Sentry source maps** (ADR-019): diner and console images built on the default branch upload browser source maps when the `SENTRY_AUTH_TOKEN` secret exists. The token reaches the build as a BuildKit secret, never a build arg, and the maps are deleted after upload. The Nest apps upload none: `--enable-source-maps` maps their stack traces before Sentry sees them.
- **Images:** keep under 250 MB. CI fails above it and checks that each image runs as `node` and reports healthy (`docker.yml`).

## 3. Cloudflare

- **DNS:** all records proxied (orange cloud), except mail records.
- **SSL/TLS:** Full (strict). Use a Cloudflare Origin Certificate on the server (Coolify custom certificate), or Let's Encrypt via DNS-01. Always use HTTPS. Minimum TLS 1.2.
- **Network:** WebSockets on. HTTP/3 on.
- **Cache rules:**
  - `m.<domain>/_next/static/*` → cache everything, edge TTL 1 year
  - `api.<domain>/v1/public/menus/*/versions/*` → cache everything, respect origin (immutable)
  - `api.<domain>/v1/public/restaurants/*` and `/v1/public/tables/*` → respect origin (15 s)
  - Everything else → bypass
- **WAF:** managed ruleset on. Rate-limit rule of 600 req/min per IP on `/v1/public/*` (restaurants share Wi-Fi IPs) and 60 req/min per IP on `/v1/auth/*`.
- **R2:**
  - `radd-assets` (public via `cdn.<domain>`)
  - `radd-private` (imports, exports)
  - `radd-backups` (Coolify target, lifecycle 30 days)
  - Create scoped API tokens per bucket.
- **Zero Trust (Access):** protect the Coolify dashboard at `coolify.<domain>`.

## 4. Environment variables

See `.env.example`. Set them per environment in Coolify. Secrets are never stored in Git.

- Staging and production must set `CLIENT_IP_HEADER=cf-connecting-ip` on the API. Without it every diner appears to come from the proxy's address and shares one rate-limit bucket (ADR-016).
- Every `*_SECRET` must be a random value of at least 32 characters (`openssl rand -base64 48`); the apps refuse to start in staging or production with the `change-me` placeholders.

## 5. CI/CD (GitHub Actions)

- **PR:** lint, typecheck, unit, integration, build, e2e-smoke, lighthouse, eval-ai (conditional).
- **Merge to the default branch (`master`, ADR-010):**
  1. Build and push images tagged `sha-<short>` and `staging`.
  2. Run migrations against staging. Coolify's pre-deploy command runs `node dist/migrate.js` with `DATABASE_URL_MIGRATOR`.
  3. Trigger the Coolify staging deploy webhook.
  4. Smoke-test the staging URLs.
- **Release tag `v*`:**
  1. Retag the images as `prod` and `v*`.
  2. Manual approval (GitHub environment protection).
  3. Production migrations, then the Coolify production deploy webhook.
  4. Post-deploy smoke test.
  5. Create a Sentry release.

## 6. Migrations policy

- Write migrations with drizzle-kit (SQL committed). RLS policies and roles live in hand-written SQL migration files.
- **Expand / contract.** Never drop or rename a column in the same release that stops using it. Do it in two releases.
- **Destructive migrations** require a `-- DESTRUCTIVE` header and owner approval in the PR.
- **Roles:**
  - `app_migrator` — owner of the schema
  - `app_runtime` — CRUD on tables, subject to RLS
  - `app_admin` — for the admin module; `BYPASSRLS`; used only by admin services

## 7. Backups and disaster recovery

| What | How | Frequency | Retention |
|---|---|---|---|
| Postgres (logical) | Coolify scheduled `pg_dump` → R2 `radd-backups` | Daily | 30 days |
| Postgres (point-in-time) | WAL-G to R2 *(Stage 2, once more than 10 paying restaurants)* | Continuous | 14 days |
| Server snapshot | Hetzner backups | Daily | 7 |
| R2 assets | Bucket versioning on `radd-assets` | Continuous | 30 days |

- **Restore drill.** `infra/scripts/restore-drill.sh` restores the latest dump into a temporary container, runs sanity queries (row counts, latest `menu_versions`) and reports. Run it weekly via a GitHub Actions scheduled workflow, or manually.
- **Targets.** Stage 1: RPO 24 h / RTO 4 h. Stage 2 with PITR: RPO 5 min / RTO 1 h.

## 8. Monitoring

- **Uptime monitor** (Better Stack free tier or self-hosted Uptime Kuma) on:
  - `https://api.<domain>/v1/health/ready`
  - `https://m.<domain>/healthz`
  - `https://app.<domain>/healthz`

  Alerts go to the founder's email and WhatsApp/Telegram.
- **Sentry** alerts: new issue, error spike, p95 transaction above threshold.
- **Coolify** alerts: container restarts, disk above 80%.
- **Langfuse / Anthropic Console:**
  - Anthropic Console monthly spend limit set.
  - Langfuse daily cost dashboard.
  - App-level `AI_MONTHLY_BUDGET_USD` kill switch.

## 9. Scaling playbook

1. **CPU-bound on the API.** Raise to 2 API replicas and put a Hetzner Load Balancer in front with sticky cookies. Socket.IO already uses the Valkey adapter.
2. **DB contention.** Move Postgres to its own server (or managed Postgres), tune `shared_buffers` and `work_mem`, and add PgBouncer in transaction mode. The RLS `SET LOCAL` pattern is compatible with transaction pooling because it is set per transaction.
3. **Insights queries slow.** Add a read replica and route the insights module to it.
4. **More than 50k sockets, or multiple regions.** Introduce a dedicated realtime tier (Centrifugo or Socket.IO cluster) and/or a Gulf region.
5. **Kubernetes.** The same images apply; write Helm charts (`infra/helm`) at Stage 3.
