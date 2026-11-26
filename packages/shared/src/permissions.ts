import { type InvitableRole } from './dto/invitations.js';
import { type MemberRole } from './enums.js';
import { DomainError } from './errors.js';

/**
 * Who may do what in the console (ADR-025): the single source for the API's guard, the services'
 * `assertCan` checks and, later, the console's navigation. GROUP_ORDERING §6 and API §4 are the
 * specs; where they disagree GROUP_ORDERING wins (CLAUDE §1 precedence).
 *
 * Action names are stable: they appear in audit logs and tests. Append, never rename.
 */
export const ACTIONS = [
  // Organisation
  'org.read',
  'org.update',
  'org.delete',
  /** Plan, subscription and usage (owner view). */
  'org.billing',
  'org.ownership.transfer',

  // Team (`PATCH|DELETE /members/{id}`, invitations, PINs)
  'team.read',
  'team.invite.manager',
  /** Inviting staff or kitchen members. */
  'team.invite.staff',
  /** Display name of another member. Conditional on the target's role. */
  'team.member.update',
  /** Conditional on the target's role. */
  'team.remove',
  /** Conditional on the target's current and new role. */
  'team.role.change',
  /** Setting or resetting a member's quick-switch PIN. Conditional on the target's role. */
  'team.pin.set',

  // Shared staff devices (ADR-026)
  'devices.manage',

  // The member's own notification opt-ins (`/me/notification-optins`)
  'account.notifications',

  // Restaurants: settings, exchange rate
  'restaurant.create',
  'restaurant.read',
  'restaurant.update',
  /** AI settings, FAQ, glossary and the owner test chat. */
  'ai.settings',

  // Assets, menu, allergens, imports
  'assets.manage',
  'menu.read',
  /** Categories, items, variants, options, ingredients, translations, AI suggestions. */
  'menu.edit',
  /** The "86" switch (`PATCH /items/{id}/availability`); GROUP_ORDERING §5.4 gives it to staff. */
  'menu.availability',
  'menu.publish',
  /** Setting owner allergen statuses without confirming them. */
  'allergens.edit',
  /** Confirming all 14 statuses of a dish or an option's added allergens (ALLERGEN_SAFETY §3). */
  'allergens.confirm',
  'import.run',

  // Floor plan and QR codes
  'tables.manage',

  // Insights and reports
  'insights.read',
  /** Anonymous chat transcripts (PRD R12). */
  'conversations.read',
  /** Daily sales and payments report (PRD R13). */
  'reports.read',

  // Live floor and sessions (GROUP_ORDERING §6, staff side)
  /** Live floor, staff session view, bill view and receipts. */
  'session.read',
  /** Adding items for a participant, editing anyone's drafts and shares, moving items. */
  'session.item.manage',
  'session.guest.create',
  'session.participant.remove',
  /** Merging two participants of one person (GROUP_ORDERING E4). */
  'session.participant.merge',
  /** Locking and unlocking the table, approving joiners. */
  'session.lock',
  /** Accepting or rejecting a round and editing its pending lines. */
  'round.decide',
  /** Voiding an item that the kitchen has not started (`accepted` or earlier). */
  'item.void.before_preparing',
  /** Voiding an item in any state, including `preparing`, `ready` and `served`. */
  'item.void.any',
  /** Switching the bill's split mode, including custom amounts. */
  'bill.split',
  /** Applying and removing discounts. */
  'discount.apply',
  'payment.record',
  'payment.void',
  'bill.request',
  /** Closing a session whose balance is zero. */
  'session.close',
  /** Closing with a balance left (reason required, audited). */
  'session.force_close',
  'session.reopen.bill_requested',
  /** Reopening a closed session (GROUP_ORDERING E10: manager only). */
  'session.reopen.closed',
  'session.transfer',
  /** Merging two sessions (GROUP_ORDERING E14: manager). */
  'session.merge',
  'waiter_call.handle',

  // Kitchen display
  'kitchen.read',
  /** Cycling an item through preparing → ready → served. */
  'kitchen.bump',
] as const;

export type Action = (typeof ACTIONS)[number];

const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);

export function isAction(value: unknown): value is Action {
  return typeof value === 'string' && ACTION_SET.has(value);
}

// ── Actors ──────────────────────────────────────────────────────────────────────────────────

/** A signed-in member acting inside one organisation. */
export interface MemberActor {
  kind: 'member';
  userId: string;
  organizationId: string;
  role: MemberRole;
  /** A shared-tablet PIN session (ADR-026): capped to floor and kitchen work. */
  pinSession: boolean;
}

/**
 * A super admin on `/v1/admin/*` (ADR-027). Admin routes have their own guard and actions
 * (P1-T06); in the console a super admin holds no permission by that title alone.
 */
export interface SuperAdminActor {
  kind: 'super_admin';
  userId: string;
}

/**
 * Background jobs and maintenance. Jobs are not user requests and do not pass through this layer;
 * the actor exists so audit rows can say "system". It holds no console permission.
 */
export interface SystemActor {
  kind: 'system';
}

/**
 * Everyone who can act. Diners join in P4 with sessions: a `participant` actor
 * (`{ kind: 'participant', sessionId, participantId, restaurantId, organizationId }`) and the
 * `host` role on it, with the "Self" and "Host" columns of GROUP_ORDERING §6. Their rules are
 * added to this file then; until that, no diner actor exists and nothing here grants them anything.
 */
export type Actor = MemberActor | SuperAdminActor | SystemActor;

// ── Conditional rules ───────────────────────────────────────────────────────────────────────

/** What a conditional action needs to know about its target. */
export interface PermissionResources {
  'team.member.update': { targetRole: MemberRole };
  'team.remove': { targetRole: MemberRole };
  'team.role.change': { targetRole: MemberRole; newRole: MemberRole };
  'team.pin.set': { targetRole: MemberRole };
}

export type ConditionalAction = keyof PermissionResources;

export type ResourceFor<A extends Action> = A extends ConditionalAction
  ? PermissionResources[A]
  : undefined;

/** Roles a manager may manage. Managing managers and owners is the owner's (ADR-025). */
const MANAGED_BY: Record<MemberRole, readonly MemberRole[]> = {
  owner: ['manager', 'staff', 'kitchen'],
  manager: ['staff', 'kitchen'],
  staff: [],
  kitchen: [],
};

const manages = (actorRole: MemberRole, targetRole: MemberRole): boolean =>
  MANAGED_BY[actorRole].includes(targetRole);

/**
 * Checks on the target once the role holds the action. Nobody changes an owner through these;
 * ownership moves only through `org.ownership.transfer`.
 */
const CONDITIONS: {
  [A in ConditionalAction]: (role: MemberRole, r: PermissionResources[A]) => boolean;
} = {
  'team.member.update': (role, r) => manages(role, r.targetRole),
  'team.remove': (role, r) => manages(role, r.targetRole),
  'team.role.change': (role, r) => manages(role, r.targetRole) && manages(role, r.newRole),
  // Only staff and kitchen members use a PIN on a shared device (ADR-026).
  'team.pin.set': (role, r) =>
    manages(role, r.targetRole) && (r.targetRole === 'staff' || r.targetRole === 'kitchen'),
};

function isConditional(action: Action): action is ConditionalAction {
  return Object.hasOwn(CONDITIONS, action);
}

// ── The matrix ──────────────────────────────────────────────────────────────────────────────

const OWNER_ONLY: readonly Action[] = [
  'org.delete',
  'org.billing',
  'org.ownership.transfer',
  'team.invite.manager',
];

const STAFF: readonly Action[] = [
  'org.read',
  'team.read',
  'restaurant.read',
  'menu.read',
  'menu.availability',
  'session.read',
  'session.item.manage',
  'session.guest.create',
  'session.participant.remove',
  'session.participant.merge',
  'session.lock',
  'round.decide',
  'item.void.before_preparing',
  'bill.split',
  'payment.record',
  'bill.request',
  'session.close',
  'session.reopen.bill_requested',
  'session.transfer',
  'waiter_call.handle',
  'kitchen.read',
  'kitchen.bump',
];

const KITCHEN: readonly Action[] = [
  'org.read',
  'team.read',
  'restaurant.read',
  'kitchen.read',
  'kitchen.bump',
];

/**
 * Role → actions (ADR-025). Conditional actions (`PermissionResources`) also need their target
 * check, which `can` applies.
 */
export const PERMISSIONS: Readonly<Record<MemberRole, ReadonlySet<Action>>> = {
  owner: new Set(ACTIONS),
  manager: new Set(ACTIONS.filter((action) => !OWNER_ONLY.includes(action))),
  staff: new Set(STAFF),
  kitchen: new Set(KITCHEN),
};

/** Namespaces a PIN session never reaches, whatever the member's role (ADR-026). */
export const PIN_SESSION_EXCLUDED_NAMESPACES = ['org', 'team', 'devices', 'account'] as const;

/** Roles that may use a PIN session at all; anyone else's PIN session holds nothing. */
const PIN_SESSION_ROLES: ReadonlySet<MemberRole> = new Set(['staff', 'kitchen']);

function excludedFromPinSession(action: Action): boolean {
  const namespace = action.slice(0, action.indexOf('.'));
  return (PIN_SESSION_EXCLUDED_NAMESPACES as readonly string[]).includes(namespace);
}

/**
 * Whether the actor's role holds the action at all, before any target check. The API's guard
 * uses this for `@RequirePermission`; services call `can`/`assertCan` with the resource.
 */
export function holdsPermission(actor: Actor, action: Action): boolean {
  if (actor.kind !== 'member') return false;
  if (!PERMISSIONS[actor.role].has(action)) return false;
  if (actor.pinSession) {
    return PIN_SESSION_ROLES.has(actor.role) && !excludedFromPinSession(action);
  }
  return true;
}

type ResourceArgs<A extends Action> = A extends ConditionalAction
  ? [resource: PermissionResources[A]]
  : [resource?: undefined];

/**
 * Whether the actor may perform the action on the resource. A conditional action without its
 * resource is refused: a missing target must never widen access.
 */
export function can<A extends Action>(
  actor: Actor,
  action: A,
  ...[resource]: ResourceArgs<A>
): boolean {
  if (!isAction(action) || !holdsPermission(actor, action)) return false;
  if (!isConditional(action)) return true;
  if (resource === undefined || actor.kind !== 'member') return false;
  const check = CONDITIONS[action] as (role: MemberRole, r: ResourceFor<A>) => boolean;
  return check(actor.role, resource as ResourceFor<A>);
}

/** `can`, throwing `403 FORBIDDEN` when it says no. */
export function assertCan<A extends Action>(
  actor: Actor,
  action: A,
  ...resource: ResourceArgs<A>
): void {
  if (!can(actor, action, ...resource)) {
    throw new DomainError('FORBIDDEN', { detail: `Not allowed: ${action}` });
  }
}

/** The action that inviting someone with this role needs. */
export function inviteActionFor(role: InvitableRole): 'team.invite.manager' | 'team.invite.staff' {
  return role === 'manager' ? 'team.invite.manager' : 'team.invite.staff';
}
