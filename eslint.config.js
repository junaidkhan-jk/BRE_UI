// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * The flat config `npm run lint` has always needed and never had.
 *
 * The script was in package.json from the first commit and failed every time it ran —
 * "ESLint couldn't find an eslint.config.(js|mjs|cjs) file" — so the Definition of Done's lint
 * step has never actually checked anything. A script that always fails is indistinguishable from
 * one nobody runs, which is how it survived this long.
 *
 * Type-checked rules are ON for src/. They cost a slower lint and they are the half worth having:
 * a floating promise and an unnecessary `await` are both invisible to the non-type-checked set,
 * and both are mistakes this code can make — every screen fires async work from an event handler.
 * `void` in front of a deliberately unawaited call is the convention already used here, so this
 * enforces an existing habit rather than imposing a new one.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '*.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // Two files already carried `eslint-disable-next-line react-hooks/exhaustive-deps`, which
    // errored as an unknown rule — the author expected this plugin and it was never installed.
    // Those two suppressions are deliberate and stay; the rule is what makes them meaningful.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // OFF, deliberately. It fires on every data-fetching effect here — nine of them — for the
      // standard shape: clear the error and the previous result, then fetch. The rule exists to
      // stop cascading renders from state that should have been derived; a null-out before an
      // await is not that, and rewriting nine working effects to satisfy it would be churn with no
      // defect fixed. `exhaustive-deps` and the rules-of-hooks checks, which catch real bugs, stay
      // on.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An unused parameter is often deliberate in a React callback signature; an unused local is
      // not. Leading underscore is the escape hatch.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Playwright specs run under Node with their own tsconfig, and they legitimately await
    // everything. Linted, but without the project-aware rules that would need a third project.
    files: ['e2e/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
