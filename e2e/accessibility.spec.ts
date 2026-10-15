import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

import { signIn } from './session';

/**
 * The axe accessibility audit (M5-09).
 *
 * <p>Not a box to tick. This is a tool credit analysts use all day, and the one that decides
 * whether a borrower is approved — so a screen reader that cannot announce a rule's status, or a
 * keyboard user who cannot reach the approve button, is a person who cannot do the job.
 *
 * <p>Scoped to WCAG 2.1 A and AA, which is what "accessible" means in procurement and in most
 * regulators' guidance. Violations fail the build; an audit that only reports is an audit nobody
 * reads.
 */

const SCREENS = [
  ['Rule Repository', '#/policies'],
  ['Simulator', '#/simulate'],
  ['Review Inbox', '#/reviews'],
  ['Deployment Console', '#/deployments'],
  ['Decision Trace', '#/decisions'],
  ['Compare Versions', '#/diff'],
  ['Audit Trail', '#/audit'],
  ['Shared Assets', '#/assets'],
  ['Policy Structure', '#/structure'],
  ['Policy Source', '#/edit'],
] as const;

for (const [name, route] of SCREENS) {
  test(`${name} has no WCAG A or AA violations`, async ({ page }) => {
    await page.goto('/' + route);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Printed before the assertion so a failure names what to fix rather than just a count.
    if (results.violations.length > 0) {
      console.log(
        results.violations
          .map(
            (v) =>
              `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
                .map((n) => n.target.join(' '))
                .join('\n  ')}`,
          )
          .join('\n\n'),
      );
    }
    expect(results.violations, `${name} must be usable by everyone who has to use it`).toEqual([]);
  });
}

// Every screen is behind the session now, so each test starts signed in. The login screen's own
// behaviour — the form, the announced error, the guard that redirects — is tested in login.spec.ts
// without one.
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('status is never conveyed by colour alone', async ({ page }) => {
  await page.goto('/#/decisions');

  // Roughly one man in twelve cannot reliably separate the green from the amber, and "was this
  // application approved" is not a question to answer with a hue. Every pill carries its word.
  for (const word of ['APPROVE', 'DECLINE', 'REFER']) {
    await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
  }
});

test('the workspace is reachable by keyboard', async ({ page }) => {
  await page.goto('/#/policies');

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? { tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 40) } : null;
  });

  expect(focused, 'something must take focus on the first Tab').not.toBeNull();
  expect(
    ['A', 'BUTTON', 'INPUT', 'SELECT'],
    'the first tab stop must be an interactive element',
  ).toContain(focused!.tag);
});
