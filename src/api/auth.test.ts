import { describe, expect, it } from 'vitest';

import { can, type Capability, type Session } from './auth';

/**
 * The one piece of pure logic in the API layer, and the one that decides what a user is shown.
 *
 * `can` is deliberately not an authorisation check — every endpoint checks its own capability
 * server-side — but it still has a failure mode worth a test. Showing a button that can only
 * produce a 403 is confusing; HIDING one from somebody who holds the capability blocks the
 * workflow and looks like a bug in the lifecycle rather than in the navigation. The absent-session
 * branch is the one that regresses, because `?? false` is easy to turn into `?? true` while making
 * a loading state less flickery.
 */
describe('can', () => {
  const session = (...capabilities: Capability[]): Session => ({
    token: 't',
    expiresAt: null,
    subject: 'reviewer@lender.test',
    displayName: 'Reviewer',
    tenantId: 't_test',
    roles: [],
    capabilities,
    mustChangePassword: false,
    canOverrideSegregationOfDuties: false,
  });

  it('is true only for a capability the session actually holds', () => {
    const reviewer = session('POLICY_READ', 'POLICY_REVIEW');
    expect(can(reviewer, 'POLICY_REVIEW')).toBe(true);
    expect(can(reviewer, 'POLICY_READ')).toBe(true);
    expect(can(reviewer, 'DEPLOY_APPROVE')).toBe(false);
  });

  it('is false with no session, never true', () => {
    expect(can(null, 'POLICY_READ')).toBe(false);
    expect(can(session(), 'POLICY_READ')).toBe(false);
  });
});
