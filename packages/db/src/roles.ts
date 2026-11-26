import { type ClientBase } from 'pg';

/** The four database roles (ADR-021). Created by `sql/bootstrap-roles.sql`, never by a migration. */
export const APP_ROLES = {
  /** Owns the schema; used only by the migration process. */
  migrator: 'app_migrator',
  /** The API. Subject to Row Level Security. */
  runtime: 'app_runtime',
  /** The background worker. Subject to Row Level Security. */
  worker: 'app_worker',
  /** The super-admin module only. Bypasses Row Level Security. */
  admin: 'app_admin',
} as const;

export interface RoleFacts {
  name: string;
  superuser: boolean;
  bypassRls: boolean;
  createRole: boolean;
  createDb: boolean;
  /** Roles this role is a member of; membership could lend it another role's rights. */
  memberOf: string[];
  /** Tables, views and sequences the role owns in this database; an owner skips RLS on them. */
  ownedRelations: number;
}

/**
 * Everything that would make tenant isolation unsafe, as readable sentences. An empty list means
 * the roles are as ADR-021 requires. Pure, so every rule is unit-tested without a database.
 */
export function roleProblems(roles: readonly RoleFacts[], currentUser: string): string[] {
  const problems: string[] = [];
  const byName = new Map(roles.map((role) => [role.name, role]));

  for (const name of Object.values(APP_ROLES)) {
    if (!byName.has(name)) {
      problems.push(
        `role ${name} does not exist; run packages/db/sql/bootstrap-roles.sql as a superuser`,
      );
    }
  }
  if (currentUser !== APP_ROLES.migrator) {
    problems.push(
      `migrations must run as ${APP_ROLES.migrator} (connected as ${currentUser}), or the tables would have the wrong owner`,
    );
  }

  for (const name of [APP_ROLES.runtime, APP_ROLES.worker]) {
    const role = byName.get(name);
    if (!role) continue;
    if (role.superuser) problems.push(`${name} is a superuser and would skip Row Level Security`);
    if (role.bypassRls) problems.push(`${name} has BYPASSRLS and would skip Row Level Security`);
    if (role.createRole) problems.push(`${name} has CREATEROLE`);
    if (role.createDb) problems.push(`${name} has CREATEDB`);
    if (role.memberOf.length > 0) {
      problems.push(`${name} is a member of ${role.memberOf.join(', ')} and would gain its rights`);
    }
    if (role.ownedRelations > 0) {
      problems.push(
        `${name} owns ${String(role.ownedRelations)} relation(s); an owner is not subject to Row Level Security`,
      );
    }
  }

  const migrator = byName.get(APP_ROLES.migrator);
  if (migrator?.superuser) problems.push(`${APP_ROLES.migrator} must not be a superuser`);

  const admin = byName.get(APP_ROLES.admin);
  if (admin?.superuser) problems.push(`${APP_ROLES.admin} must not be a superuser`);
  if (admin && !admin.bypassRls) {
    problems.push(`${APP_ROLES.admin} needs BYPASSRLS for the super-admin module`);
  }

  return problems;
}

export class DatabaseRolesError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      [
        'The database roles are not safe to migrate with:',
        ...problems.map((problem) => `  - ${problem}`),
      ].join('\n'),
    );
    this.name = 'DatabaseRolesError';
  }
}

/** Reads the roles from the catalog and throws `DatabaseRolesError` if any rule is broken. */
export async function assertRolesSafe(client: ClientBase): Promise<void> {
  const { rows: roles } = await client.query<RoleFacts>(
    `select r.rolname::text as name,
            r.rolsuper as superuser,
            r.rolbypassrls as "bypassRls",
            r.rolcreaterole as "createRole",
            r.rolcreatedb as "createDb",
            coalesce(
              (select array_agg(parent.rolname::text)
                 from pg_auth_members m join pg_roles parent on parent.oid = m.roleid
                where m.member = r.oid),
              '{}'
            ) as "memberOf",
            (select count(*)::int from pg_class c where c.relowner = r.oid) as "ownedRelations"
       from pg_roles r
      where r.rolname = any($1)`,
    [Object.values(APP_ROLES)],
  );
  const { rows: users } = await client.query<{ name: string }>('select current_user::text as name');
  const problems = roleProblems(roles, users[0]?.name ?? '');
  if (problems.length > 0) throw new DatabaseRolesError(problems);
}
