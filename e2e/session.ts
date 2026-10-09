import type { Page } from '@playwright/test';

/**
 * Puts a signed-in session into a page before it loads.
 *
 * **Why the tests inject a session rather than logging in.** There is no registry running in the
 * end-to-end environment — the suite serves the built bundle with `vite preview` and nothing else
 * — so a real login would need a database, a migration and a seeded administrator before a single
 * UI assertion ran. Those are tested where they live: `PolicyLifecycleTest` logs in over HTTP
 * against real PostgreSQL and walks the whole process. This suite's job is the screens.
 *
 * The injected shape is the server's own `LoginResponse`, so if that record changes this stops
 * compiling against it in spirit — and the login screen's own tests below still exercise the real
 * form, the real validation and the real failure path, which is the part a fake session cannot
 * cover.
 *
 * `addInitScript` runs before any page script, so the app reads the session on its first render
 * and never shows the login screen. {@link signedOut} is the opposite case, and is tested too.
 */
export async function signIn(
  page: Page,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<void> {
  const session = {
    token: 'e2e-token',
    // Twelve hours out, because the client treats an expired token as no session — a fixed past
    // date here would make every test redirect to the login screen for the right reason and the
    // wrong one.
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    subject: 'a.reviewer',
    displayName: 'A Reviewer',
    tenantId: 't_demo',
    roles: ['POLICY_AUTHOR', 'POLICY_REVIEWER'],
    capabilities: ['POLICY_EDIT', 'POLICY_READ', 'POLICY_REVIEW', 'SIMULATE'],
    mustChangePassword: false,
    canOverrideSegregationOfDuties: false,
    ...overrides,
  };

  await page.addInitScript((value) => {
    sessionStorage.setItem('bre.session', JSON.stringify(value));
  }, session);
}

/** Clears any session, for the tests that assert the app refuses to render without one. */
export async function signedOut(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.removeItem('bre.session');
  });
}
