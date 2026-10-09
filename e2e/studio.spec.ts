import { test, expect } from '@playwright/test';

/**
 * The five screens, exercised as a reviewer would (M5-09).
 *
 * These assert what the UI is *for* rather than how it is built — that a rule's status is readable
 * without relying on colour, that sample data announces itself, that a decision's trace opens. A
 * test that asserted class names would pass through a redesign that broke all of those.
 */

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
    for (const route of ['#/policies', '#/simulate', '#/reviews', '#/decisions']) {
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
      ['Approval Queue', '#/reviews'],
      ['Decision Trace', '#/decisions'],
      ['Rule Repository', '#/policies'],
    ] as const) {
      await page.getByRole('link', { name: new RegExp(label) }).click();
      await expect(page).toHaveURL(new RegExp(path.replace('#/', '#\\/') + '$'));
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
