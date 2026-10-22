import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { usingFixtures } from '../api/fixtures';
import { SCREENS } from './screens';
import { useSession } from './SessionContext';
import { applyTheme, storedChoice, watchSystem, type ThemeChoice } from './theme';

import './AppShell.css';

/**
 * The workspace chrome: a left nav of the five screens and a header strip.
 *
 * The environment label in the header is not decoration. An author who cannot tell at a glance
 * whether they are editing LOCAL or PROD will eventually submit a change in the wrong one, and a
 * rule change is not a thing to discover you made in production.
 *
 * The same reasoning puts the signed-in person, their organisation and their roles beside it. Who
 * you are determines what your next click is allowed to do — and in a multi-tenant system, which
 * lender's policy you are about to change.
 */
export function AppShell(): React.JSX.Element {
  const environment = import.meta.env.VITE_ENV_LABEL ?? 'LOCAL';
  const isProduction = environment === 'PROD';
  const { session, signOut } = useSession();

  return (
    <div className="shell">
      <nav className="shell__nav" aria-label="Workspace">
        <div className="shell__brand">
          JUNAID <span className="shell__brand-dim">portal</span>
        </div>
        <ul className="shell__links">
          {SCREENS.map((screen) => (
            <li key={screen.id}>
              <NavLink
                to={screen.path.replace('/:code/edit', '')}
                className={({ isActive }) =>
                  isActive ? 'shell__link shell__link--on' : 'shell__link'
                }
                end={screen.path === '/policies'}
              >
                <span>{screen.label}</span>
                {screen.badge ? <span className="shell__badge">{screen.badge}</span> : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="shell__body">
        {usingFixtures ? (
          // Loud, and on every screen. Sample data that looks real is how a demo gets mistaken
          // for a working system — and in a credit engine, how someone comes to believe a rule is
          // live when it is a row in a hard-coded array.
          <div className="fixtures" role="status">
            Sample data — the BFF is not connected. Nothing here reflects a real rule or decision.
          </div>
        ) : null}
        <header className="shell__header">
          <span
            className={isProduction ? 'shell__env shell__env--prod' : 'shell__env'}
            title="The environment you are authoring in"
          >
            {environment}
          </span>

          {session ? (
            <div className="shell__who">
              {/* The organisation, not only the person. A consultant with accounts at two lenders
                  is the case this exists for: every policy they can see belongs to exactly one of
                  them, and getting that wrong means editing the wrong lender's credit policy. */}
              <span className="shell__who-name">{session.displayName}</span>
              <span className="shell__who-meta">
                {session.tenantId} · {session.roles.join(', ') || 'no roles'}
              </span>
              {session.canOverrideSegregationOfDuties ? (
                // Shown because it is a standing exception to a control, not a feature. An
                // administrator should be reminded that their approvals are recorded as overrides.
                <span className="shell__who-sod" title="Approvals you make on your own work are recorded as segregation-of-duties overrides (00 §3.3)">
                  SoD override enabled
                </span>
              ) : null}
              {/* An anchor to a STATIC page, not a route. junaid.html is a complete document
                  with its own <head>, styles and script; serving it from public/ renders it
                  exactly as written, where porting it into a component would mean rewriting
                  every rule to avoid colliding with the studio's own CSS. A plain link also
                  survives popup blockers, which window.open from a handler does not. */}
              <a
                className="shell__signout"
                href="junaid.html"
                target="_blank"
                rel="noreferrer"
              >
                Junaid&rsquo;s life
              </a>
              <ThemeToggle />
              <button className="shell__signout" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : null}
        </header>
        <main className="shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Light, dark, or whatever the system says.
 *
 * A select rather than a two-state button, because "follow my system" is a real third answer and
 * a toggle cannot express it — a button that flips light/dark silently discards the preference
 * somebody set once for every application on their machine.
 */
function ThemeToggle(): React.JSX.Element {
  const [choice, setChoice] = useState<ThemeChoice>(storedChoice);

  useEffect(() => {
    applyTheme(choice);
    // Keeps following the system after sunset. Without this, somebody whose machine switches at
    // dusk keeps the morning's theme until they reload, which on a tool left open all day is most
    // of the evening.
    return watchSystem(choice, () => applyTheme(choice));
  }, [choice]);

  return (
    <label className="shell__theme">
      <span className="shell__theme-label">Theme</span>
      <select
        className="shell__theme-select"
        value={choice}
        onChange={(event) => setChoice(event.target.value as ThemeChoice)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
