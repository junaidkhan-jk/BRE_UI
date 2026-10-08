import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from './AppShell';
import { ApprovalQueue } from '../screens/ApprovalQueue';
import { DecisionTrace } from '../screens/DecisionTrace';
import { RuleEditor } from '../screens/RuleEditor';
import { RuleRepository } from '../screens/RuleRepository';
import { Simulator } from '../screens/Simulator';
import { Empty } from '../components/ScreenState';

/**
 * Routes.
 *
 * Paths follow TRD §13.4 where the wireframes' five screens correspond to it, so that adding the
 * remaining twelve (U1, U5-U9, U11, U13, U15-U17) later does not move these.
 *
 * An unknown route lands on the no-such-page state rather than a blank screen — §13.4 requires the
 * same of a forbidden deep link, and a blank page is indistinguishable from a broken app.
 *
 * <b>Hash routing, not browser history.</b> A hash route needs no server rewrite, so the built
 * bundle works opened from a file, served from any static host and published as a shareable
 * preview — which is how this gets in front of reviewers before a BFF exists. Browser history
 * would 404 on every deep link in all three of those cases. Swap to {@code createBrowserRouter}
 * when the studio is served by something that can rewrite to index.html.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/policies" replace /> },
      { path: 'policies', element: <RuleRepository /> },
      { path: 'policies/:code/edit', element: <RuleEditor /> },
      { path: 'simulate', element: <Simulator /> },
      { path: 'reviews', element: <ApprovalQueue /> },
      { path: 'decisions', element: <DecisionTrace /> },
      {
        path: '*',
        element: <Empty title="That page does not exist." />,
      },
    ],
  },
]);
