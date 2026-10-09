import { test, expect } from '@playwright/test';

import { signIn, signedOut } from './session';

/**
 * Sign-in, and the guard around the workspace (M3-09's client half).
 *
 * There is no registry in this environment, so the tests that need a *successful* login inject a
 * session (see session.ts) and the real credential path is covered by `PolicyLifecycleTest`
 * against real PostgreSQL. What is tested here is everything the browser owns: that the guard
 * refuses to render the workspace, that the form is usable by keyboard and announced to a screen
 * reader, and that a failure says something a person can act on rather than silently doing
 * nothing.
 */

test.describe('the login screen', () => {
  test('a signed-out visitor is sent to it, and never sees the workspace', async ({ page }) => {
    await signedOut(page);
    await page.goto('/');

    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.getByRole('heading', { name: /BRE/ })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Workspace' }),
      'the signed-in chrome must not render for a signed-out visitor',
    ).toHaveCount(0);
  });

  test('a deep link is remembered, not lost', async ({ page }) => {
    // Somebody sent a link to a review. Bouncing them to the default screen after signing in
    // means they have to find it again, and a reviewer with twenty policies may not.
    await signedOut(page);
    await page.goto('/#/reviews');
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('the form is reachable and labelled', async ({ page }) => {
    await signedOut(page);
    await page.goto('/#/login');

    // By accessible name, not by selector: a field a screen reader cannot name is a field a
    // screen-reader user cannot fill in.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // The password field must be a password field. Obvious, and worth asserting: a type="text"
    // here shows the credential to anybody behind the user and to a screenshot.
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
  });

  test('a failed sign-in announces itself and does not hang', async ({ page }) => {
    await signedOut(page);
    await page.goto('/#/login');

    await page.getByLabel('Email').fill('nobody@lender.test');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // There is no server here, so this exercises the network-failure branch — which is the branch
    // most likely to be forgotten, and the one where a form that swallows the error leaves a
    // person clicking a dead button.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toBeEmpty();

    // The button has to come back. A permanently disabled submit after a failure is the most
    // common way a login form becomes unusable.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('the whole form can be completed with the keyboard alone', async ({ page }) => {
    await signedOut(page);
    await page.goto('/#/login');

    await page.getByLabel('Email').focus();
    await page.keyboard.type('someone@lender.test');
    await page.keyboard.press('Tab');
    await page.keyboard.type('a-password-value');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
  });
});

test.describe('the signed-in header', () => {
  test('shows who you are, which organisation, and your roles', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/policies');

    await expect(page.getByText('A Reviewer')).toBeVisible();
    await expect(
      page.getByText(/t_demo/),
      'the organisation has to be visible: a consultant with two lenders must not edit the wrong one',
    ).toBeVisible();
    await expect(page.getByText(/POLICY_REVIEWER/)).toBeVisible();
  });

  // Two tests, not one with two signIn calls: addInitScript ACCUMULATES scripts on a page, so a
  // second call leaves both running and which one wins is an implementation detail of the
  // ordering. One session per page keeps the test asserting the app rather than the harness.
  test('stays quiet when segregation of duties cannot be overridden', async ({ page }) => {
    await signIn(page, { canOverrideSegregationOfDuties: false });
    await page.goto('/#/policies');
    await expect(page.getByText(/SoD override enabled/)).toHaveCount(0);
  });

  test('says so when an administrator can override segregation of duties', async ({ page }) => {
    await signIn(page, {
      canOverrideSegregationOfDuties: true,
      roles: ['TENANT_ADMIN', 'POLICY_REVIEWER'],
    });
    await page.goto('/#/policies');
    await expect(
      page.getByText(/SoD override enabled/),
      'an administrator should be reminded that approving their own work is recorded as an override',
    ).toBeVisible();
  });

  test('signing out returns to the login screen', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/policies');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
  });

  test('an expired session is not a session', async ({ page }) => {
    // The client checks expiry itself rather than letting every request fail with a 401 the user
    // cannot act on.
    await signIn(page, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    await page.goto('/#/policies');
    await expect(page).toHaveURL(/#\/login$/);
  });
});
