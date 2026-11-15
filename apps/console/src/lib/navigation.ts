import { type components } from '@radd/api-client';
import { type MemberRole } from '@radd/shared';

/**
 * Where people go in the console. Pure, so the server layouts, the sign-in forms and the tests
 * share one answer to "which shell, which home, which links".
 */
export type Me = components['schemas']['MeDto'];
export type Membership = Me['memberships'][number];

/** The signed-in route groups (ARCHITECTURE §apps/console). Owners and managers share one shell. */
export type Shell = 'owner' | 'staff' | 'kitchen' | 'admin';

export const SIGN_IN_PATH = '/sign-in';
export const ONBOARDING_PATH = '/onboarding/organization';

const SHELL_BY_ROLE: Readonly<Record<MemberRole, Exclude<Shell, 'admin'>>> = {
  owner: 'owner',
  manager: 'owner',
  staff: 'staff',
  kitchen: 'kitchen',
};

export function shellForRole(role: MemberRole): Exclude<Shell, 'admin'> {
  return SHELL_BY_ROLE[role];
}

/** Message keys under `nav`. */
export type NavKey =
  | 'menu'
  | 'allergens'
  | 'tables'
  | 'team'
  | 'insights'
  | 'settings'
  | 'floor'
  | 'bills'
  | 'kitchen'
  | 'organizations'
  | 'queues';

export interface NavItem {
  key: NavKey;
  href: string;
}

/**
 * Navigation per shell. The first item is the shell's home. The admin shell is reachable by URL
 * only until the API tells the console who is a super admin (P1-T06); no shell links to it.
 */
export const NAV_ITEMS: Readonly<Record<Shell, readonly NavItem[]>> = {
  owner: [
    { key: 'menu', href: '/menu' },
    { key: 'allergens', href: '/allergens' },
    { key: 'tables', href: '/tables' },
    { key: 'team', href: '/team' },
    { key: 'insights', href: '/insights' },
    { key: 'settings', href: '/settings' },
  ],
  staff: [
    { key: 'floor', href: '/floor' },
    { key: 'bills', href: '/bills' },
  ],
  kitchen: [{ key: 'kitchen', href: '/kitchen' }],
  admin: [
    { key: 'organizations', href: '/admin/organizations' },
    { key: 'queues', href: '/admin/queues' },
  ],
};

export function homeForShell(shell: Shell): string {
  const [first] = NAV_ITEMS[shell];
  // Every shell has at least one item; the fallback only satisfies the type checker.
  return first?.href ?? '/';
}

export function homeForRole(role: MemberRole): string {
  return homeForShell(shellForRole(role));
}

/** Whether `pathname` is `href` or below it, for `aria-current`. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The organisation the console works in: the session's active one, else the first membership.
 * Better Auth only picks an active organisation by itself for people with exactly one.
 */
export function activeMembership(me: Me): Membership | null {
  const active = me.memberships.find(
    (membership) => membership.organizationId === me.session.activeOrganizationId,
  );
  return active ?? me.memberships[0] ?? null;
}

const MAX_NEXT_LENGTH = 2048;
const PROBE_ORIGIN = 'https://console.invalid';

/**
 * `next` from a query string, if it is a path on this site; otherwise null. Rejects absolute and
 * protocol-relative URLs (`//evil.example`), backslashes (browsers read `/\evil.example` as
 * protocol-relative), control characters and anything that resolves to another origin, so a
 * crafted sign-in link cannot send someone elsewhere after they sign in.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  // Dot segments can collapse into a protocol-relative path: `/..//evil.example` → `//evil.example`.
  if (url.pathname.startsWith('//')) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The first value of a search parameter as Next.js hands it to a page. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A link to `path` that keeps a valid `next`, e.g. from sign-in to sign-up and back. */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}

/** The code entry after sign-up (or a sign-in refused for an unconfirmed address). */
export function verifyEmailHref(email: string, next: string | null | undefined): string {
  const params = new URLSearchParams({ email });
  const safe = safeNextPath(next);
  if (safe) params.set('next', safe);
  return `/verify-email?${params.toString()}`;
}

/** Sign-in that returns to `path` afterwards. The bare root needs no `next`. */
export function signInHref(path: string | null | undefined): string {
  return withNext(SIGN_IN_PATH, path === '/' ? null : path);
}

/**
 * Where a signed-in person goes: the page they asked for (an invitation, typically; a shell page
 * still sends someone without an organisation to onboarding), else onboarding while they belong
 * to no organisation, else their role's home.
 */
export function destinationFor(me: Me, next?: string | null): string {
  const asked = safeNextPath(next);
  if (asked && asked !== '/') return asked;
  const membership = activeMembership(me);
  return membership ? homeForRole(membership.role) : ONBOARDING_PATH;
}
