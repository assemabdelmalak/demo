import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Me } from './navigation';
import { requireShell } from './session.server';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock('@radd/config/env', () => ({ loadEnv: () => ({ API_PUBLIC_URL: 'http://api.test' }) }));

const ORG = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';

function me(role: Me['memberships'][number]['role'] | null): Me {
  return {
    user: { id: ORG, name: 'R', email: 'r@x.co', emailVerified: true, twoFactorEnabled: false },
    session: {
      id: ORG,
      activeOrganizationId: role ? ORG : null,
      pinSession: false,
      staffDeviceId: null,
      twoFactorVerifiedAt: null,
      createdAt: '2026-11-15T00:00:00.000Z',
    },
    memberships: role ? [{ organizationId: ORG, name: 'Beit Tayta', slug: 'bt', role }] : [],
  };
}

function apiAnswers(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  );
}

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-radd-path': '/team?x=1' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(redirect).mockClear();
});

describe('requireShell', () => {
  it('sends a signed-out visitor to sign-in and back to the page afterwards', async () => {
    apiAnswers(Response.json({ code: 'UNAUTHENTICATED' }, { status: 401 }));
    await expect(requireShell('owner')).rejects.toThrow('redirect:/sign-in?next=%2Fteam%3Fx%3D1');
  });

  it('sends someone without an organisation to onboarding', async () => {
    apiAnswers(Response.json(me(null)));
    await expect(requireShell('staff')).rejects.toThrow('redirect:/onboarding/organization');
  });

  it("sends a member to their own role's home from another shell", async () => {
    apiAnswers(Response.json(me('kitchen')));
    await expect(requireShell('owner')).rejects.toThrow('redirect:/kitchen');
    apiAnswers(Response.json(me('manager')));
    await expect(requireShell('staff')).rejects.toThrow('redirect:/menu');
  });

  it('lets owners and managers into the owner shell', async () => {
    for (const role of ['owner', 'manager'] as const) {
      apiAnswers(Response.json(me(role)));
      const context = await requireShell('owner');
      expect(context.membership?.role).toBe(role);
    }
  });

  it('fails loudly, not as signed out, when the API is down', async () => {
    apiAnswers(Response.json({ code: 'INTERNAL' }, { status: 500 }));
    await expect(requireShell('owner')).rejects.toThrow('GET /v1/me answered 500');
  });
});
