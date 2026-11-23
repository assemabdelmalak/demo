/**
 * The super-admin database handle (ADR-027): its own small pool connecting as `app_admin`
 * (`DATABASE_URL_ADMIN`, `BYPASSRLS`). Provided by `AdminModule` only and used through
 * `withAdmin`; no other module can inject it, so nothing outside `/v1/admin/*` bypasses RLS.
 */
export const ADMIN_DB = Symbol('ADMIN_DB');

/** Admin traffic is a handful of people; a small pool keeps it from crowding the runtime pool. */
export const ADMIN_POOL_MAX = 4;
