import { NavLink, Outlet } from 'react-router-dom';

import { usingFixtures } from '../api/fixtures';
import { SCREENS } from './screens';
import { useSession } from './SessionContext';

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
          BRE <span className="shell__brand-dim">Studio</span>
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
