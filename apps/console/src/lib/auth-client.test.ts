// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { authBaseUrl, authClient } from './auth-client';
import { toAuthFailure } from './auth-errors';

function renderPublicEnv(env: Record<string, unknown>) {
  const script = document.createElement('script');
  script.id = 'radd-public-env';
  script.type = 'application/json';
  script.textContent = JSON.stringify(env);
  document.head.append(script);
}

const requests: Request[] = [];
let respond: () => Response = () => Response.json({});

// The client keeps the `fetch` it saw when it was created (once per page), so one stub serves
// every test and each test swaps the answer.
beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Promise.resolve(respond());
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  renderPublicEnv({ NEXT_PUBLIC_API_URL: 'http://api.test' });
  document.documentElement.lang = 'ar';
  requests.length = 0;
});

afterEach(() => {
  document.getElementById('radd-public-env')?.remove();
});

function answer(response: () => Response) {
  respond = response;
}

describe('authBaseUrl', () => {
  it('points at Better Auth on the API from the runtime public env', () => {
    expect(authBaseUrl({ NEXT_PUBLIC_API_URL: 'https://api.radd.test' })).toBe(
      'https://api.radd.test/v1/auth',
    );
    expect(authBaseUrl({ NEXT_PUBLIC_API_URL: 'http://localhost:4000/' })).toBe(
      'http://localhost:4000/v1/auth',
    );
  });

  it('refuses a missing or non-HTTP value', () => {
    expect(() => authBaseUrl({})).toThrow(/NEXT_PUBLIC_API_URL/);
    expect(() => authBaseUrl({ NEXT_PUBLIC_API_URL: 'javascript:alert(1)' })).toThrow();
  });
});

describe('authClient', () => {
  it('sends credentials and the page language to the API', async () => {
    answer(() => Response.json({ token: null, user: {} }));
    await authClient().signUp.email({ name: 'Rana', email: 'rana@example.com', password: 'x' });
    const [request] = requests;
    expect(request?.url).toBe('http://api.test/v1/auth/sign-up/email');
    expect(request?.method).toBe('POST');
    expect(request?.credentials).toBe('include');
    expect(request?.headers.get('x-radd-locale')).toBe('ar');
  });

  it('follows a language switch on the next request', async () => {
    answer(() => Response.json({ success: true }));
    document.documentElement.lang = 'en';
    await authClient().emailOtp.sendVerificationOtp({ email: 'a@b.co', type: 'sign-in' });
    expect(requests[0]?.headers.get('x-radd-locale')).toBe('en');
  });

  it('turns Retry-After on a 429 into a wait time on the error', async () => {
    answer(
      () =>
        new Response(JSON.stringify({ message: 'Too many requests. Please try again later.' }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '8' },
        }),
    );
    const { error } = await authClient().signIn.email({ email: 'a@b.co', password: 'x' });
    expect(toAuthFailure(error)).toEqual({ kind: 'rate-limited', retryAfterSeconds: 8 });
  });
});
