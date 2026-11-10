# SECURITY — Radd Menu

Baseline is OWASP ASVS L1 for the whole system, with L2 for authentication, sessions and payments recording.

## 1. Threat model (top risks)

| # | Threat | Impact | Controls |
|---|---|---|---|
| T1 | Cross-tenant data access (bug in a query) | Severe | Tenant repository helpers + **Postgres RLS** + integration tests that try cross-tenant reads/writes for every repository |
| T2 | Prank or remote orders via a leaked or guessed QR | Medium | 12-char random base58 tokens (~70 bits); staff approval mode by default; host lock; join and send rate limits; staff can regenerate a QR; session closes on settle |
| T3 | Participant impersonation / session hijack | Medium | Signed participant JWT (12 h) bound to the device ID; `sid` check on every route; HttpOnly cookies; token revoked when the participant is removed or the session closes (deny-list in Valkey until expiry) |
| T4 | IDOR on session items, payments, receipts | High | Every handler loads the entity scoped by `session_id` + `restaurant_id` from the token or membership; receipts use signed, expiring tokens |
| T5 | Prompt injection / jailbreak of the assistant | Medium | Strict policy, read-only tools, no secrets in context, output guard, allergen templates, logging, evals |
| T6 | Allergen misinformation | Severe | ALLERGEN_SAFETY.md controls |
| T7 | Staff account takeover | High | Better Auth with rate-limited login, email OTP, optional TOTP 2FA (required for owners on paid plans and for super admin), session rotation, device-bound PIN sessions |
| T8 | Payment record tampering / fraud by staff | Medium | Role permissions, manager-only voids and discounts, append-only audit log, daily reconciliation report |
| T9 | Malicious file uploads | Medium | Presigned uploads with size and type limits; magic-byte validation; image re-encoding with sharp (drops payloads); PDFs never rendered in the browser from untrusted origins; files served from a separate domain (`cdn.`) with `Content-Disposition` for non-images |
| T10 | XSS via menu content or names | High | React escaping; no `dangerouslySetInnerHTML` (owner content is plain text; chat renders a markdown subset via a safe renderer with no HTML); strict CSP |
| T11 | Abuse / DoS / AI cost blowout | Medium | Per-device/session/org limits, quotas, global AI budget kill switch, Cloudflare WAF/DDoS, BullMQ concurrency caps |
| T12 | Secrets leakage | High | Env only (Coolify secrets), never in the repo; GitHub secret scanning + gitleaks in CI; least-privilege API keys; quarterly rotation |
| T13 | WhatsApp webhook spoofing | Medium | Verify `X-Hub-Signature-256` with the app secret; verify token on subscribe; process idempotently by message ID |
| T14 | Data loss | High | Daily backups to R2 (encrypted), tested restores, migrations reviewed (expand/contract) |

## 2. Controls checklist (implement and verify in P10-T01)

**Transport and headers**
- HTTPS only. Use Cloudflare Full (strict).
- HSTS: 1 year, includeSubDomains (enable after staging verification).
- Helmet defaults.
- CSP for diner and console:
  - `default-src 'self'`
  - `img-src 'self' cdn.<domain> data: blob:`
  - `connect-src 'self' api.<domain> wss://api.<domain> *.sentry.io`
  - `script-src 'self'` with nonces
  - `frame-ancestors 'none'`
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` minimal; camera only on the console import page.

**AuthN / AuthZ**
- Better Auth configured with trusted origins, secure cookies on the parent domain, and session expiry of 7 days (sliding) for the console. Staff device sessions last 12 h.
- Permission checks happen in services (`assertCan(actor, action, resource)`) using `packages/shared/permissions.ts`. Controllers never decide permissions alone.
- Super admin requires an allowlisted email and TOTP. All admin actions are audited. Impersonation is read-only and time-boxed.

**Data**
- RLS enabled on all tenant tables. The runtime role has no `BYPASSRLS`. Migrations run as the owner role. The admin connection uses a separate role.
- PII minimisation:
  - diners: device ID only;
  - staff: email and name;
  - phone only for WhatsApp opt-in.
- Encryption at rest is provided by the host disk plus R2. Backups are encrypted (age or gpg) before upload.
- Never log: tokens, cookies, OTPs, payment external references, full chat text (info level).

**Input / output**
- zod validation on every endpoint, including socket handshake payloads and webhook bodies.
- Output encoding by React. Chat markdown subset: bold, italics, line breaks only.
- SQL only via Drizzle or parameterised SQL.

**Dependencies and CI**
- Renovate.
- `pnpm audit` in CI (fail on high severity).
- gitleaks.
- CodeQL (GitHub) on JS/TS.
- Docker images: distroless or `node:24-alpine`, non-root user, read-only filesystem where possible, healthchecks.

**Operational**
- SSH key-only access.
- Firewall: 80/443 accept only from Cloudflare IP ranges; 22 only from the admin IP or a VPN (Tailscale recommended).
- Unattended security upgrades. fail2ban.
- Coolify dashboard behind Cloudflare Access (Zero Trust) or limited to the VPN.

## 3. Security tests (required)

- **Tenancy:** for every repository, an integration test with two orgs asserts zero cross-reads and that cross-writes are rejected.
- **AuthZ matrix:** a table-driven test of every console endpoint × role (owner, manager, staff, kitchen, no-membership) → expected status.
- **Diner tokens:** wrong `sid`, removed participant, closed session, expired token, token from another restaurant → all rejected.
- **Upload:** spoofed MIME, oversize file, polyglot file → rejected.
- **Rate limits:** each limit in API.md §8 is enforced.
- **Webhook:** bad signature → 401; replayed message ID → ignored.
