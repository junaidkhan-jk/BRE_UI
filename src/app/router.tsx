import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from './AppShell';
import { RequireSession } from './RequireSession';
import { DeploymentConsole } from '../screens/DeploymentConsole';
import { AuditTrail } from '../screens/AuditTrail';
import { DecisionTrace } from '../screens/DecisionTrace';
import { RuleEditor } from '../screens/RuleEditor';
import { RuleRepository } from '../screens/RuleRepository';
import { ReviewInbox } from '../screens/ReviewInbox';
import { SharedAssets } from '../screens/SharedAssets';
import { Simulator } from '../screens/Simulator';
import { VersionDiff } from '../screens/VersionDiff';
import { Empty } from '../components/ScreenState';
import { Login } from '../screens/Login';

/**
 * Routes.
 *
 * Paths follow TRD §13.4 where the wireframes' five screens correspond to it, so that adding the
 * remaining twelve (U1, U5-U9, U11, U13, U15-U17) later does not move these.
 *
 * An unknown route lands on the no-such-page state rather than a blank screen — §13.4 requires the
 * same of a forbidden deep link, and a blank page is indistinguishable from a broken app.
 *
 * The login screen sits OUTSIDE the shell, because the shell is the signed-in chrome — a nav of
 * screens the user cannot open yet, around a login form, is a worse first impression than a page
 * with one job.
 *
 * <b>Hash routing, not browser history.</b> A hash route needs no server rewrite, so the built
 * bundle works opened from a file, served from any static host and published as a shareable
 * preview — which is how this gets in front of reviewers before a BFF exists. Browser history
 * would 404 on every deep link in all three of those cases. Swap to {@code createBrowserRouter}
 * when the studio is served by something that can rewrite to index.html.
 */
export const router = createHashRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    // Every screen is behind the session. Wrapping the shell rather than each route means a screen
    // added later is protected by default — the alternative, a guard per route, is protected until
    // somebody forgets one, and that one is unauthenticated.
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <Navigate to="/policies" replace /> },
      { path: 'policies', element: <RuleRepository /> },
      { path: 'policies/:code/edit', element: <RuleEditor /> },
      { path: 'simulate', element: <Simulator /> },
      { path: 'reviews', element: <ReviewInbox /> },
      { path: 'deployments', element: <DeploymentConsole /> },
      { path: 'diff', element: <VersionDiff /> },
      // The same screen reachable from a policy, so a link out of the repository can carry which
      // policy was being read. The screen's own pickers still apply.
      { path: 'policies/:code/diff', element: <VersionDiff /> },
      { path: 'decisions', element: <DecisionTrace /> },
      { path: 'assets', element: <SharedAssets /> },
      { path: 'audit', element: <AuditTrail /> },
      {
        path: '*',
        element: <Empty title="That page does not exist." />,
      },
    ],
  },
]);
