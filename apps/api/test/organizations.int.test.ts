import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from '@radd/config/testing';
import { createDb, type DbHandle } from '@radd/db';
import { createTestDatabase, type TestDatabase } from '@radd/db/testing';
import { MemoryMailer } from '@radd/mail';
import { type MemberRole, uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { latestCode, randomIp, TestBrowser, uniqueEmail } from './support/auth-client';
import { testEnv } from './support/env';
import { QueueProducer } from '../src/queues/queue-producer';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';
const PASSWORD = 'correct horse battery';

interface Account {
  email: string;
  userId: string;
  client: TestBrowser;
}

describe.skipIf(!runtime.ready)('organisations, members and invitations', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let sql: DbHandle;
  let app: NestFastifyApplication;
  const mailer = new MemoryMailer();

  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await sql.pool.query(text, values)).rows as T[];

  const key = () => ({ 'idempotency-key': uuidv7() });

  async function signUp(label: string, locale?: string): Promise<Account> {
    const email = uniqueEmail(label);
    const client = new TestBrowser(app, {
      origin: CONSOLE,
      ip: randomIp(),
      ...(locale ? { locale } : {}),
    });
    const res = await client.post('/v1/auth/sign-up/email', {
      name: label,
      email,
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    const otp = await latestCode(app, mailer, email);
    const verify = await client.post('/v1/auth/email-otp/verify-email', { email, otp });
    expect(verify.statusCode).toBe(200);
    const [row] = await query<{ id: string }>('select id from "user" where email = $1', [email]);
    if (!row) throw new Error('no user row');
    return { email, userId: row.id, client };
  }

  async function createOrg(account: Account, name: string) {
    const res = await account.client.post('/v1/organizations', { name }, key());
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string; slug: string; name: string }>();
  }

  /** Adds an existing user to the organisation with a role and makes it their active one. */
  async function join(account: Account, organizationId: string, role: MemberRole) {
    await query('insert into member (id, user_id, organization_id, role) values ($1, $2, $3, $4)', [
      uuidv7(),
      account.userId,
      organizationId,
      role,
    ]);
    const res = await account.client.post('/v1/auth/organization/set-active', { organizationId });
    expect(res.statusCode).toBe(200);
  }

  /** An owner with an organisation, and a manager, staff, kitchen member and an outsider. */
  async function team(label: string) {
    const owner = await signUp(`${label}-owner`);
    const org = await createOrg(owner, `${label} House`);
    const manager = await signUp(`${label}-manager`);
    const staff = await signUp(`${label}-staff`);
    const kitchen = await signUp(`${label}-kitchen`);
    const outsider = await signUp(`${label}-outsider`);
    await join(manager, org.id, 'manager');
    await join(staff, org.id, 'staff');
    await join(kitchen, org.id, 'kitchen');
    // Pointed at the organisation without belonging to it, e.g. after being removed.
    await query('update session set active_organization_id = $1 where user_id = $2', [
      org.id,
      outsider.userId,
    ]);
    return { org, owner, manager, staff, kitchen, outsider };
  }

  async function invitationJob(id: string) {
    const job = await app.get(QueueProducer).queue('notify.email').getJob(`invitation-${id}`);
    return job?.data as Record<string, unknown> | undefined;
  }

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);
    database = await createTestDatabase(postgres.url);
    sql = createDb({ url: database.urls.superuser, max: 2 });
    app = await createApp(
      testEnv({
        DATABASE_URL: database.urls.runtime,
        DATABASE_URL_ADMIN: database.urls.admin,
        REDIS_URL: valkey.url,
        CONSOLE_PUBLIC_URL: CONSOLE,
      }),
      { mailer, auth: { rateLimit: false, codeRequestLimit: false } },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await sql.close();
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  describe('POST /v1/organizations', () => {
    it('makes the creator owner and the organisation active, without a subscription', async () => {
      const owner = await signUp('creator');
      const res = await owner.client.post('/v1/organizations', { name: ' Beit Tayta ' }, key());
      expect(res.statusCode).toBe(201);
      const org = res.json<{ id: string; slug: string }>();
      expect(org).toMatchObject({
        name: 'Beit Tayta',
        slug: expect.stringMatching(/^beit-tayta/) as unknown,
        plan: 'free',
        status: 'active',
        country: 'LB',
      });

      const me = (await owner.client.get('/v1/me')).json<Record<string, unknown>>();
      expect(me).toMatchObject({
        session: { activeOrganizationId: org.id },
        memberships: [{ organizationId: org.id, role: 'owner', name: 'Beit Tayta' }],
      });
      const subscriptions = await query('select 1 from subscriptions where organization_id = $1', [
        org.id,
      ]);
      expect(subscriptions).toHaveLength(0);
    });

    it('gives two organisations with the same name different slugs', async () => {
      const first = await createOrg(await signUp('slug-a'), 'Same Name');
      const second = await createOrg(await signUp('slug-b'), 'Same Name');
      expect(first.slug).not.toBe(second.slug);
      expect(second.slug).toMatch(/^same-name/);
      const arabic = await createOrg(await signUp('slug-c'), 'بيت تيتا');
      expect(arabic.slug).toMatch(/^org/);
    });

    it('returns the same organisation when the same Idempotency-Key is replayed', async () => {
      const owner = await signUp('replay');
      const headers = key();
      const first = await owner.client.post('/v1/organizations', { name: 'Replay' }, headers);
      const again = await owner.client.post('/v1/organizations', { name: 'Replay' }, headers);
      expect(again.statusCode).toBe(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.json()).toEqual(first.json());
      const owned = await query('select 1 from member where user_id = $1', [owner.userId]);
      expect(owned).toHaveLength(1);

      const missing = await owner.client.post('/v1/organizations', { name: 'No key' });
      expect(missing.statusCode).toBe(400);
      expect(missing.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    });

    it('refuses a fourth owned organisation', async () => {
      const owner = await signUp('limit');
      for (const name of ['One', 'Two', 'Three']) await createOrg(owner, name);
      const fourth = await owner.client.post('/v1/organizations', { name: 'Four' }, key());
      expect(fourth.statusCode).toBe(409);
      expect(fourth.headers['content-type']).toContain('application/problem+json');
      expect(fourth.json()).toMatchObject({ code: 'ORG_LIMIT_REACHED' });
    });

    it('refuses an unverified user, a signed-out caller and server-only fields', async () => {
      const user = await signUp('unverified');
      await query('update "user" set email_verified = false where id = $1', [user.userId]);
      const unverified = await user.client.post('/v1/organizations', { name: 'Nope' }, key());
      expect(unverified.statusCode).toBe(403);
      expect(unverified.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

      const anonymous = await app.inject({
        method: 'POST',
        url: '/v1/organizations',
        payload: { name: 'Nope' },
        headers: { origin: CONSOLE, ...key() },
      });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toMatchObject({ code: 'UNAUTHENTICATED' });

      const owner = await signUp('fields');
      const withPlan = await owner.client.post(
        '/v1/organizations',
        { name: 'Pro please', plan: 'pro', status: 'active' },
        key(),
      );
      expect(withPlan.statusCode).toBe(400);
      expect(withPlan.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await query('select 1 from member where user_id = $1', [owner.userId])).toHaveLength(
        0,
      );
    });
  });

  describe('current organisation', () => {
    it('answers 404 when the session has no active organisation', async () => {
      const user = await signUp('noorg');
      const res = await user.client.get('/v1/organizations/current');
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
      expect((await user.client.patch('/v1/organizations/current', { name: 'x' })).statusCode).toBe(
        404,
      );
    });

    it('is readable by every member and renamed only by owner or manager', async () => {
      const t = await team('matrix');
      for (const member of [t.owner, t.manager, t.staff, t.kitchen]) {
        const res = await member.client.get('/v1/organizations/current');
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ id: t.org.id });
      }
      const outsider = await t.outsider.client.get('/v1/organizations/current');
      expect(outsider.statusCode).toBe(403);
      expect(outsider.json()).toMatchObject({ code: 'NOT_A_MEMBER' });

      const cases: [Account, number, string | undefined][] = [
        [t.owner, 200, undefined],
        [t.manager, 200, undefined],
        [t.staff, 403, 'FORBIDDEN'],
        [t.kitchen, 403, 'FORBIDDEN'],
        [t.outsider, 403, 'NOT_A_MEMBER'],
      ];
      for (const [account, status, code] of cases) {
        const name = `Renamed by ${account.email.slice(0, 12)}`;
        const res = await account.client.patch('/v1/organizations/current', { name });
        expect(res.statusCode, account.email).toBe(status);
        if (code) expect(res.json()).toMatchObject({ code });
        else expect(res.json()).toMatchObject({ id: t.org.id, name });
      }
    });

    it('never lets a client change plan, status, country, slug or terms', async () => {
      const t = await team('protect');
      for (const extra of [
        { plan: 'pro' },
        { status: 'suspended' },
        { country: 'AE' },
        { slug: 'taken' },
        { termsVersionAccepted: 'v9' },
      ]) {
        const res = await t.owner.client.patch('/v1/organizations/current', {
          name: 'Still free',
          ...extra,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
      const [row] = await query<Record<string, unknown>>(
        'select name, plan, status, country, terms_version_accepted from organization where id = $1',
        [t.org.id],
      );
      expect(row).toEqual({
        name: 'protect House',
        plan: 'free',
        status: 'active',
        country: 'LB',
        terms_version_accepted: null,
      });
    });
  });

  describe('GET /v1/organizations/current/members', () => {
    it('lists members with their roles, pages, and never returns the PIN hash', async () => {
      const t = await team('members');
      await query('update member set pin_hash = $1, display_name = $2 where user_id = $3', [
        '$argon2id$secret-pin-hash',
        'Sami',
        t.staff.userId,
      ]);

      const res = await t.kitchen.client.get('/v1/organizations/current/members');
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: Record<string, unknown>[]; nextCursor: string | null }>();
      expect(body.nextCursor).toBeNull();
      expect(body.items.map((item) => item.role)).toEqual(['owner', 'manager', 'staff', 'kitchen']);
      expect(body.items[2]).toEqual({
        id: expect.any(String) as unknown,
        userId: t.staff.userId,
        name: 'members-staff',
        email: t.staff.email,
        role: 'staff',
        displayName: 'Sami',
        createdAt: expect.any(String) as unknown,
      });
      expect(res.body).not.toContain('secret-pin-hash');
      expect(res.body).not.toContain('pinHash');

      // Better Auth's own organisation read must not leak it either.
      const full = await t.staff.client.get('/v1/auth/organization/get-full-organization');
      expect(full.statusCode).toBe(200);
      expect(full.body).not.toContain('secret-pin-hash');

      const page1 = (await t.owner.client.get('/v1/organizations/current/members?limit=3')).json<{
        items: { id: string }[];
        nextCursor: string | null;
      }>();
      expect(page1.items).toHaveLength(3);
      expect(page1.nextCursor).toBe(page1.items[2]?.id);
      const page2 = (
        await t.owner.client.get(
          `/v1/organizations/current/members?limit=3&cursor=${page1.nextCursor ?? ''}`,
        )
      ).json<{ items: { role: string }[]; nextCursor: string | null }>();
      expect(page2).toMatchObject({ items: [{ role: 'kitchen' }], nextCursor: null });

      const outsider = await t.outsider.client.get('/v1/organizations/current/members');
      expect(outsider.statusCode).toBe(403);
      expect(outsider.json()).toMatchObject({ code: 'NOT_A_MEMBER' });
    });
  });

  describe('POST /v1/invitations', () => {
    it('lets owners invite manager, staff and kitchen, and managers only staff and kitchen', async () => {
      const t = await team('invite');
      const cases: [Account, string, number, string][] = [
        [t.owner, 'manager', 201, ''],
        [t.owner, 'staff', 201, ''],
        [t.owner, 'kitchen', 201, ''],
        [t.owner, 'owner', 400, 'VALIDATION_FAILED'],
        [t.owner, 'member', 400, 'VALIDATION_FAILED'],
        [t.manager, 'manager', 403, 'FORBIDDEN'],
        [t.manager, 'owner', 400, 'VALIDATION_FAILED'],
        [t.manager, 'staff', 201, ''],
        [t.manager, 'kitchen', 201, ''],
        [t.staff, 'staff', 403, 'FORBIDDEN'],
        [t.staff, 'kitchen', 403, 'FORBIDDEN'],
        [t.kitchen, 'kitchen', 403, 'FORBIDDEN'],
        [t.outsider, 'staff', 403, 'NOT_A_MEMBER'],
      ];
      for (const [inviter, role, status, code] of cases) {
        const res = await inviter.client.post(
          '/v1/invitations',
          { email: uniqueEmail(`invitee-${role}`), role },
          key(),
        );
        expect(res.statusCode, `${inviter.email} → ${role}`).toBe(status);
        if (code) expect(res.json()).toMatchObject({ code });
        else
          expect(res.json()).toMatchObject({ role, status: 'pending', organizationId: t.org.id });
      }
      const missingKey = await t.owner.client.post('/v1/invitations', {
        email: uniqueEmail('nokey'),
        role: 'staff',
      });
      expect(missingKey.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });

      const member = await t.owner.client.post(
        '/v1/invitations',
        { email: t.staff.email, role: 'kitchen' },
        key(),
      );
      expect(member.statusCode).toBe(409);
      expect(member.json()).toMatchObject({ code: 'ALREADY_A_MEMBER' });
    });

    it('runs invite → queued email → sign up → accept → member with that role', async () => {
      const owner = await signUp('flow-owner', 'ar');
      const org = await createOrg(owner, 'Flow House');
      const inviteeEmail = uniqueEmail('flow-invitee');

      const invite = await owner.client.post(
        '/v1/invitations',
        { email: inviteeEmail.toUpperCase(), role: 'kitchen' },
        key(),
      );
      expect(invite.statusCode).toBe(201);
      const invitation = invite.json<{ id: string; email: string }>();
      expect(invitation.email).toBe(inviteeEmail);

      // The email is a queued job in the inviter's language, carrying the link and no code.
      const job = await invitationJob(invitation.id);
      expect(job).toEqual({
        template: 'invitation',
        to: inviteeEmail,
        locale: 'ar',
        params: {
          organizationName: 'Flow House',
          inviterName: 'flow-owner',
          role: 'kitchen',
          url: `${CONSOLE}/accept-invitation/${invitation.id}`,
          days: 7,
        },
      });
      expect(mailer.latestTo(inviteeEmail)).toBeUndefined();

      // A different, verified account can neither read nor accept it.
      const other = await signUp('flow-other');
      const peek = await other.client.get(
        `/v1/auth/organization/get-invitation?id=${invitation.id}`,
      );
      expect(peek.statusCode).toBe(403);
      const steal = await other.client.post('/v1/auth/organization/accept-invitation', {
        invitationId: invitation.id,
      });
      expect(steal.statusCode).toBe(403);
      expect(await query('select 1 from member where user_id = $1', [other.userId])).toHaveLength(
        0,
      );

      const invitee = await signUpAs(inviteeEmail);
      const read = await invitee.client.get(
        `/v1/auth/organization/get-invitation?id=${invitation.id}`,
      );
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({ organizationName: 'Flow House', role: 'kitchen' });

      const accept = await invitee.client.post('/v1/auth/organization/accept-invitation', {
        invitationId: invitation.id,
      });
      expect(accept.statusCode).toBe(200);
      const [row] = await query<{ role: string }>(
        'select role from member where user_id = $1 and organization_id = $2',
        [invitee.userId, org.id],
      );
      expect(row?.role).toBe('kitchen');

      const members = (await owner.client.get('/v1/organizations/current/members')).json<{
        items: { email: string; role: string }[];
      }>();
      expect(members.items).toContainEqual(
        expect.objectContaining({ email: inviteeEmail, role: 'kitchen' }),
      );
    });

    it('refuses acceptance by the invited address while it is unverified', async () => {
      const owner = await signUp('unv-owner');
      await createOrg(owner, 'Unverified House');
      const invitee = await signUp('unv-invitee');
      const invite = await owner.client.post(
        '/v1/invitations',
        { email: invitee.email, role: 'staff' },
        key(),
      );
      await query('update "user" set email_verified = false where id = $1', [invitee.userId]);
      const accept = await invitee.client.post('/v1/auth/organization/accept-invitation', {
        invitationId: invite.json<{ id: string }>().id,
      });
      expect(accept.statusCode).toBe(403);
      expect(await query('select 1 from member where user_id = $1', [invitee.userId])).toHaveLength(
        0,
      );
    });

    it('cancels the earlier pending invitation when the address is invited again', async () => {
      const owner = await signUp('reinvite');
      await createOrg(owner, 'Reinvite House');
      const email = uniqueEmail('twice');
      const first = await owner.client.post('/v1/invitations', { email, role: 'staff' }, key());
      const second = await owner.client.post('/v1/invitations', { email, role: 'kitchen' }, key());
      expect(second.statusCode).toBe(201);
      const firstId = first.json<{ id: string }>().id;
      const secondId = second.json<{ id: string }>().id;
      expect(secondId).not.toBe(firstId);
      const rows = await query<{ id: string; status: string; role: string }>(
        'select id, status, role from invitation where email = $1 order by id',
        [email],
      );
      expect(rows).toEqual([
        { id: firstId, status: 'canceled', role: 'staff' },
        { id: secondId, status: 'pending', role: 'kitchen' },
      ]);
      expect(await invitationJob(secondId)).toMatchObject({
        locale: 'en',
        params: { role: 'kitchen' },
      });
    });
  });

  describe('a suspended organisation', () => {
    it('can be read but refuses renames, invitations and new members', async () => {
      const t = await team('suspended');
      const invitee = await signUp('suspended-invitee');
      const pending = await t.owner.client.post(
        '/v1/invitations',
        { email: invitee.email, role: 'staff' },
        key(),
      );
      expect(pending.statusCode).toBe(201);
      await query(`update organization set status = 'suspended' where id = $1`, [t.org.id]);

      const read = await t.manager.client.get('/v1/organizations/current');
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({ status: 'suspended' });
      expect((await t.staff.client.get('/v1/organizations/current/members')).statusCode).toBe(200);

      const rename = await t.owner.client.patch('/v1/organizations/current', { name: 'Back' });
      expect(rename.statusCode).toBe(403);
      expect(rename.json()).toMatchObject({ code: 'ORG_SUSPENDED' });

      const invite = await t.owner.client.post(
        '/v1/invitations',
        { email: uniqueEmail('late'), role: 'staff' },
        key(),
      );
      expect(invite.statusCode).toBe(403);
      expect(invite.json()).toMatchObject({ code: 'ORG_SUSPENDED' });

      const accept = await invitee.client.post('/v1/auth/organization/accept-invitation', {
        invitationId: pending.json<{ id: string }>().id,
      });
      expect(accept.statusCode).toBe(403);
      expect(accept.json()).toMatchObject({ code: 'ORG_SUSPENDED' });
      expect(await query('select 1 from member where user_id = $1', [invitee.userId])).toHaveLength(
        0,
      );
    });
  });

  /** Signs up and verifies with a given address (the invited one). */
  async function signUpAs(email: string): Promise<Account> {
    const client = new TestBrowser(app, { origin: CONSOLE, ip: randomIp() });
    const res = await client.post('/v1/auth/sign-up/email', {
      name: 'Invitee',
      email,
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    const otp = await latestCode(app, mailer, email);
    expect((await client.post('/v1/auth/email-otp/verify-email', { email, otp })).statusCode).toBe(
      200,
    );
    const [row] = await query<{ id: string }>('select id from "user" where email = $1', [email]);
    if (!row) throw new Error('no user row');
    return { email, userId: row.id, client };
  }
});
