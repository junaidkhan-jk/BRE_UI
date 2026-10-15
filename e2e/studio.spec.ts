import { test, expect } from '@playwright/test';

import { signIn } from './session';

/**
 * The five screens, exercised as a reviewer would (M5-09).
 *
 * These assert what the UI is *for* rather than how it is built — that a rule's status is readable
 * without relying on colour, that sample data announces itself, that a decision's trace opens. A
 * test that asserted class names would pass through a redesign that broke all of those.
 */

// Every screen is behind the session now, so each test starts signed in. The login screen's own
// behaviour — the form, the announced error, the guard that redirects — is tested in login.spec.ts
// without one.
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe('the shell', () => {
  test('renders, routes, and reports no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');

    // The hash router sends an empty path to the repository.
    await expect(page).toHaveURL(/#\/policies$/);
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
    expect(errors, 'the page must load without console errors').toEqual([]);
  });

  /**
   * Sample data that looks real is how a demo gets mistaken for a working system. The banner is
   * the control, so it is tested like one.
   */
  test('says it is showing sample data, on every screen', async ({ page }) => {
    for (const route of [
      '#/policies',
      '#/simulate',
      '#/reviews',
      '#/deployments',
      '#/decisions',
      '#/diff',
      '#/audit',
      '#/assets',
    ]) {
      await page.goto('/' + route);
      await expect(
        page.getByText(/Sample data/i),
        `${route} must say the data is not real`,
      ).toBeVisible();
    }
  });

  test('every nav link reaches its screen', async ({ page }) => {
    await page.goto('/');
    for (const [label, path] of [
      ['Simulator', '#/simulate'],
      ['Review Inbox', '#/reviews'],
      ['Deployments', '#/deployments'],
      ['Decision Trace', '#/decisions'],
      ['Compare Versions', '#/diff'],
      ['Audit Trail', '#/audit'],
      ['Shared Assets', '#/assets'],
      ['Rule Repository', '#/policies'],
    ] as const) {
      await page.getByRole('link', { name: new RegExp(label) }).click();
      await expect(page).toHaveURL(new RegExp(path.replace('#/', '#\\/') + '$'));
    }
  });
});

test.describe('Compare Versions', () => {
  /**
   * With no registry there is nothing to compare, and the screen has to say so rather than render
   * an empty frame. A blank panel and a failed fetch look identical, and the difference matters
   * when the question is whether it is safe to approve a change.
   */
  test('explains that there is nothing to compare without a registry', async ({ page }) => {
    await page.goto('/#/diff');

    await expect(page.getByRole('heading', { name: /Compare versions/i })).toBeVisible();
    await expect(page.getByText(/No registry is connected/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Compare/i })).toBeDisabled();
  });
});

test.describe('Audit Trail', () => {
  test('offers the governance filters and says why the trail is empty', async ({ page }) => {
    await page.goto('/#/audit');

    await expect(page.getByRole('heading', { name: /Audit trail/i })).toBeVisible();
    // The filters are the screen's whole interface, so their absence is a broken screen even when
    // there is nothing to list.
    await expect(page.getByLabel('Action')).toBeVisible();
    await expect(page.getByLabel('Actor')).toBeVisible();
    await expect(page.getByText(/No registry is connected/i)).toBeVisible();
  });

  test('has no write control anywhere on it', async ({ page }) => {
    await page.goto('/#/audit');

    // An audit log with an append button is a log a user can author. There is no such endpoint and
    // there must be no such control; this fails if somebody adds one.
    await expect(page.getByRole('button', { name: /add|new|create|delete|edit/i })).toHaveCount(0);
  });
});

test.describe('Review Inbox', () => {
  test('replaced the fixture queue and says why it is empty', async ({ page }) => {
    await page.goto('/#/reviews');

    await expect(page.getByRole('heading', { name: /Review inbox/i })).toBeVisible();
    // The screen it replaced showed three hard-coded submissions with names and a badge count.
    // A reviewer who approves a fixture learns that approving is a formality.
    await expect(page.getByText(/Priya N\./)).toHaveCount(0);
    await expect(page.getByText(/No registry is connected/i)).toBeVisible();
  });
});

test.describe('Deployment Console', () => {
  test('shows the three environments and requires a reason', async ({ page }) => {
    await page.goto('/#/deployments');

    await expect(page.getByRole('heading', { name: /Deployment console/i })).toBeVisible();
    for (const env of ['DEV', 'UAT', 'PROD']) {
      await expect(page.getByRole('button', { name: env, exact: true })).toBeVisible();
    }
    // Request stays disabled until there is a reason: a deployment with no recorded reason is one
    // nobody can explain later.
    await expect(page.getByRole('button', { name: 'Request' })).toBeDisabled();
  });

  test('explains that a future effective date means SCHEDULED, not ACTIVE', async ({ page }) => {
    await page.goto('/#/deployments');

    await expect(page.getByText(/waits in SCHEDULED/i)).toBeVisible();
    await expect(page.getByText(/rollback is a new deployment/i)).toBeVisible();
  });
});

test.describe('Shared Assets', () => {
  test('says what these are for before it shows any of them', async ({ page }) => {
    await page.goto('/#/assets');

    await expect(page.getByRole('heading', { name: /Shared assets/i })).toBeVisible();
    // The sentence that matters: somebody opening this screen must understand that a number here
    // changes what every policy pinning it decides, and that one person cannot do it alone.
    await expect(page.getByText(/second person/i)).toBeVisible();
    await expect(page.getByText(/No registry is connected/i)).toBeVisible();
  });

  test('offers all four kinds of asset', async ({ page }) => {
    await page.goto('/#/assets');

    for (const kind of [
      'Parameter sets',
      'Reference lists',
      'Reason codes',
      'Authority matrices',
    ]) {
      await expect(page.getByRole('button', { name: kind })).toBeVisible();
    }
  });
});

test.describe('Rule Repository', () => {
  test('lists rules with a readable status', async ({ page }) => {
    await page.goto('/#/policies');

    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ rules/)).toBeVisible();

    // Colour is never the only signal: every status pill carries its word. Roughly one man in
    // twelve cannot reliably separate the green from the amber.
    const firstStatus = page.getByRole('row').nth(1);
    await expect(firstStatus).toContainText(/live|draft|in review/i);
  });
});

test.describe('Decision Trace', () => {
  test('shows decisions with their outcome spelled out', async ({ page }) => {
    await page.goto('/#/decisions');

    await expect(page.getByRole('heading', { name: /Decision Trace/i })).toBeVisible();
    // The four outcome words, not four colours.
    await expect(page.getByText('APPROVE', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('DECLINE', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('REFER', { exact: true }).first()).toBeVisible();
  });
});

test.describe('the production bundle', () => {
  /**
   * The defect this project actually shipped: a `<script type="module">` is fetched under CORS,
   * and a `file://` page has no origin, so the Studio rendered blank when opened by
   * double-clicking. The fix was an IIFE bundle behind a classic script tag. This asserts the
   * mechanism so a future build-config change cannot quietly undo it.
   */
  test('loads from a classic script tag, so it also works over file://', async ({ page }) => {
    await page.goto('/');

    const moduleScripts = await page.locator('script[type="module"]').count();
    expect(
      moduleScripts,
      'a module script would make the offline copy render blank over file://',
    ).toBe(0);

    const stylesheets = await page.locator('link[rel="stylesheet"]').count();
    expect(stylesheets, 'CSS is inlined, so nothing is fetched at load').toBe(0);
  });
});
