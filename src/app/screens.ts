/**
 * The workspace's screens.
 *
 * Taken from the wireframes (BRE_PRD/"BRE 2.0 Workspace · Wireframes (2).html"), which define
 * five: Rule Repository, Rule Editor, Simulator, Approval Queue and Decision Trace.
 *
 * These are a SUBSET of TRD §13.5, which specifies seventeen (U1-U17) over a policy-version
 * information architecture. The two differ in more than count — see ../../README.md "Wireframes
 * versus TRD §13" — so this list is the wireframes' five, deliberately, and the route paths are
 * the TRD's where they correspond, so that adding the rest later does not move these.
 */
export interface Screen {
  readonly id: string;
  readonly label: string;
  /** The route this screen owns. */
  readonly path: string;
  /** TRD §13.5 screens this covers, for traceability. */
  readonly trd: readonly string[];
  /** A count shown on the nav item, when the screen has pending work. */
  readonly badge?: number;
}

export const SCREENS: readonly Screen[] = [
  {
    id: 'repository',
    label: 'Rule Repository',
    path: '/policies',
    trd: ['U2'],
  },
  {
    id: 'editor',
    // Paramless in the nav: the screen has its own policy and version pickers, and a nav item
    // cannot carry a parameter it has no value for. /policies/:code/edit still routes here.
    label: 'Policy Source',
    path: '/edit',
    trd: ['U3', 'U4'],
  },
  {
    id: 'structure',
    label: 'Policy Structure',
    path: '/structure',
    trd: ['U3', 'U5', 'U6', 'U7'],
  },
  {
    id: 'simulator',
    label: 'Simulator',
    path: '/simulate',
    trd: ['U10'],
  },
  {
    id: 'approvals',
    // "Review inbox" rather than "Approval Queue": the screen is where a change is READ, and
    // calling it a queue of approvals describes the outcome somebody is hoping for rather than
    // the job. The badge is gone with it — it was a hard-coded 3.
    label: 'Review Inbox',
    path: '/reviews',
    trd: ['U12'],
  },
  {
    id: 'deployments',
    label: 'Deployments',
    path: '/deployments',
    trd: ['U13'],
  },
  {
    id: 'trace',
    label: 'Decision Trace',
    path: '/decisions',
    trd: ['U14', 'U15'],
  },
  // Beyond the wireframes' five. Both are screens over endpoints that now exist: the registry
  // compares two versions (M3-02) and reads back the hash-chained audit log (M3-10). Added here
  // rather than left as API-only because a governance record nobody can read in the product is a
  // governance record somebody will ask an engineer to query.
  {
    id: 'diff',
    label: 'Compare Versions',
    // Paramless, because the screen has its own policy and version pickers. The parameterised
    // form /policies/:code/diff is also routed, for a link from a policy — but a nav item cannot
    // carry a parameter it does not have a value for.
    path: '/diff',
    trd: ['U12'],
  },
  {
    id: 'assets',
    label: 'Shared Assets',
    path: '/assets',
    trd: ['U8'],
  },
  {
    id: 'audit',
    label: 'Audit Trail',
    path: '/audit',
    trd: ['U16'],
  },
];
