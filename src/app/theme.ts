/**
 * Light or dark, chosen by the viewer or by their system (M5-01).
 *
 * **The system preference is resolved here rather than in CSS, deliberately.** A
 * `prefers-color-scheme` media query would need the whole dark palette written a second time —
 * once for the query, once for the explicit toggle — and a token that drifts between the two
 * copies is a bug nobody finds until somebody switches themes. Resolving it in JS means
 * `[data-theme='dark']` is the only place dark values exist.
 *
 * **Why a dark theme at all, in a credit tool.** This is a screen a policy analyst reads all day,
 * and the three status colours are the product's vocabulary. They have to stay legible and keep
 * meaning the same thing in both themes, which is why the dark values are measured against 4.5:1
 * rather than dimmed — see the comment in tokens.css.
 *
 * Stored per browser, not per account: a theme is a property of the screen somebody is sitting at,
 * and syncing it to the server would change it on a colleague's machine.
 */

/** What the viewer asked for. `system` follows the operating system and is the default. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'bre.theme';

/** What was stored, or `system` when nothing was — including when storage is unavailable. */
export function storedChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // A private window, or site data blocked. Following the system is the right default and is
    // better than failing to render.
    return 'system';
  }
}

/** Resolves a choice to an actual theme, consulting the system when asked to. */
export function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Stamps the resolved theme on <html> and remembers the choice.
 *
 * `data-theme` is always set, even for light, so the selector in tokens.css is the only thing that
 * decides and there is no implicit third state.
 */
export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.dataset['theme'] = resolve(choice);
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage refused. The theme still applies for this page, which is the part that matters.
  }
}

/**
 * Follows the system while the choice is `system`.
 *
 * Without this, somebody whose machine switches at sunset keeps the morning's theme until they
 * reload — on a tool that stays open all day, that is most of the evening.
 *
 * @param choice the current choice
 * @param onChange called when the system theme changes and the choice is `system`
 * @returns a function that stops listening
 */
export function watchSystem(choice: ThemeChoice, onChange: () => void): () => void {
  if (choice !== 'system' || typeof matchMedia !== 'function') return () => {};
  const query = matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
