import type {
  DecisionSummary,
  DecisionTrace,
  RuleSummary,
  RuleVersion,
  SimulationResult,
} from './types';

/**
 * Sample data, taken from the wireframes' own `RULES`, `PEOPLE` and `NOTE_BY` arrays.
 *
 * <b>Why this exists.</b> The BFF (TRD §13.1–13.3) is not built. Without fixtures every screen
 * would render its error state, and a UI nobody can look at cannot be reviewed. With them the
 * workspace is navigable and the layouts can be judged.
 *
 * <b>Why it is loud about itself.</b> The app shows a banner whenever fixtures are serving, and
 * {@link usingFixtures} is false unless explicitly enabled. Sample data that looks like real data
 * is how a demo gets mistaken for a working system — and in a credit engine, how someone comes to
 * believe a rule is live when it is a row in a hard-coded array.
 *
 * Delete this file once the BFF answers. It is scaffolding, not a layer.
 */

/** Whether fixtures are serving instead of the BFF. */
export const usingFixtures = import.meta.env.VITE_USE_FIXTURES !== 'false';

export const RULES: readonly RuleSummary[] = [
  {
    code: 'JLG-001',
    name: 'Minimum Borrower Age',
    intent: 'Age + tenure must not exceed 60 years',
    category: 'Eligibility',
    productLines: ['LOS', 'DL'],
    status: 'live',
    author: 'Priya N.',
    lastModified: '14 Sep 2026',
    version: 4,
    earlierVersions: 3,
  },
  {
    code: 'JLG-028',
    name: 'Borrower Age + Tenure',
    intent: 'Age-at-maturity check with CU_L3 deviation',
    category: 'Eligibility',
    productLines: ['LOS'],
    status: 'live',
    author: 'Priya N.',
    lastModified: '10 Sep 2026',
    version: 2,
    earlierVersions: 1,
  },
  {
    code: 'JLG-049',
    name: 'Household FOIR',
    intent: 'Fixed obligation to income ratio check across flags',
    category: 'Affordability',
    productLines: ['LOS', 'DDP'],
    status: 'in_review',
    author: 'Rahul M.',
    lastModified: '15 Sep 2026',
    version: 3,
    earlierVersions: 2,
  },
  {
    code: 'IND-012',
    name: 'Bureau Score Cut-off',
    intent: 'CIBIL >= 650 required; delinquency flag must be false',
    category: 'Credit',
    productLines: ['LOS', 'DI'],
    status: 'in_review',
    author: 'Priya N.',
    lastModified: '15 Sep 2026',
    version: 5,
    earlierVersions: 4,
  },
  {
    code: 'IND-031',
    name: 'Exposure Limit',
    intent: 'Total outstanding must not exceed Rs 3 lakh',
    category: 'Credit',
    productLines: ['LOS'],
    status: 'draft',
    author: 'Anita S.',
    lastModified: '13 Sep 2026',
    version: 1,
    earlierVersions: 0,
  },
  {
    code: 'LCS-001',
    name: 'DPD Bucket Assignment',
    intent: 'Assign collection bucket based on days-past-due',
    category: 'Collections',
    productLines: ['LCS'],
    status: 'live',
    author: 'Karan P.',
    lastModified: '8 Sep 2026',
    version: 6,
    earlierVersions: 5,
  },
  {
    code: 'LCS-008',
    name: 'OTS Eligibility',
    intent: 'One-time settlement offer: DPD > 180 and balance < Rs 50k',
    category: 'Collections',
    productLines: ['LCS'],
    status: 'live',
    author: 'Karan P.',
    lastModified: '5 Sep 2026',
    version: 3,
    earlierVersions: 2,
  },
  {
    code: 'GRP-002',
    name: 'JLG Group Formation',
    intent: 'Min 5, max 10 members from same village',
    category: 'Group Policy',
    productLines: ['LOS'],
    status: 'draft',
    author: 'Priya N.',
    lastModified: '12 Sep 2026',
    version: 1,
    earlierVersions: 0,
  },
];

const CHANGE_NOTES: Record<string, Record<number, string>> = {
  'JLG-049': { 3: 'FOIR threshold 40% -> 45% for MFI-cycle borrowers; RTR sub-rule added' },
  'IND-012': { 5: 'Minimum CIBIL 675 -> 650 for micro-enterprise segment' },
  'JLG-001': { 4: 'Deviation band above 58 years routed to CU_L3' },
  'GRP-002': { 1: 'New rule: 5-10 members from same village' },
};

const PEOPLE = ['Priya N.', 'Rahul M.', 'Anita S.', 'Karan P.'];
const DATES = ['14 Sep 2026', '22 Aug 2026', '30 Jul 2026', '2 Jul 2026', '11 Jun 2026'];

/** A rule's version history, newest first — the wireframe's `history()`. */
export function historyOf(rule: RuleSummary): readonly RuleVersion[] {
  const versions: RuleVersion[] = [];
  for (let v = rule.version; v >= 1; v--) {
    const status =
      v === rule.version
        ? rule.status
        : v === rule.version - 1 && rule.status !== 'live'
          ? 'live'
          : 'superseded';
    versions.push({
      version: v,
      status,
      author: v === rule.version ? rule.author : (PEOPLE[(v + rule.code.length) % 4] ?? 'Unknown'),
      at:
        v === rule.version
          ? rule.lastModified
          : (DATES[Math.min(rule.version - v, DATES.length - 1)] ?? 'Unknown'),
      note: CHANGE_NOTES[rule.code]?.[v] ?? (v === 1 ? 'Initial version' : 'Policy update'),
    });
  }
  return versions;
}

export const SIMULATION: SimulationResult = {
  applications: 2500,
  pass: 1942,
  deviation: 371,
  fail: 187,
  perRule: [
    { code: 'JLG-001', pass: 2411, deviation: 72, fail: 17 },
    { code: 'JLG-049', pass: 2065, deviation: 298, fail: 137 },
    { code: 'IND-012', pass: 2238, deviation: 129, fail: 133 },
    { code: 'GRP-002', pass: 2470, deviation: 0, fail: 30 },
  ],
};

export const RECENT_DECISIONS: readonly DecisionSummary[] = [
  {
    decisionId: '01a11b0b-df03-76a2-a30c-255a7934d513',
    applicationRef: 'APP-2026-000123',
    decision: 'APPROVE_WITH_DEVIATION',
    decidedAt: '15:42:11',
    latencyMs: 34,
  },
  {
    decisionId: '01a11b0b-c1a2-7f10-9c22-81aa1b2c3d4e',
    applicationRef: 'APP-2026-000122',
    decision: 'APPROVE',
    decidedAt: '15:41:58',
    latencyMs: 28,
  },
  {
    decisionId: '01a11b0b-aa31-7001-b4d1-77ffee112233',
    applicationRef: 'APP-2026-000121',
    decision: 'DECLINE',
    decidedAt: '15:41:30',
    latencyMs: 31,
  },
  {
    decisionId: '01a11b0b-9912-7aa0-8e55-001122334455',
    applicationRef: 'APP-2026-000120',
    decision: 'REFER',
    decidedAt: '15:40:02',
    latencyMs: 41,
  },
];

export const TRACE: DecisionTrace = {
  decisionId: '01a11b0b-df03-76a2-a30c-255a7934d513',
  applicationRef: 'APP-2026-000123',
  decision: 'APPROVE_WITH_DEVIATION',
  stpEligible: false,
  asOf: '2026-10-01',
  policyCode: 'MFI_JLG_CREDIT_UW',
  policyVersion: 3,
  bundleHash: 'sha256:9b3f7a3b92430c81d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b',
  engineVersion: '0.1.0-SNAPSHOT',
  steps: [
    {
      ref: 'SCREENING_HIT',
      name: 'No sanctions, PEP or negative-list hit',
      status: 'PASS',
      effectiveStatus: 'PASS',
      firedCondition: 'No screening hit on any member',
    },
    {
      ref: 'GRP_VRM_CATEGORY',
      name: 'Village risk category within appetite',
      status: 'PASS',
      effectiveStatus: 'PASS',
      firedCondition: 'Village risk category is A',
      inputs: { 'group.villageRiskCategory': 'A' },
    },
    {
      ref: 'MFI_INDEBTEDNESS_CAP',
      name: 'Member indebtedness within cap',
      status: 'DEVIATION',
      effectiveStatus: 'DEVIATION',
      reasonCode: 'AFF_INDEBTEDNESS_CAP',
      firedCondition:
        "Member unsecured outstanding plus the member's share of the proposed amount exceeds the Indebtedness Cap of Rs 2,00,000",
      inputs: {
        memberUnsecuredOutstanding: '185000',
        'member share of proposed amount': '30000',
        'param.INDEBTEDNESS_CAP': '200000.00',
      },
      requiredLevel: 'L2',
    },
    {
      ref: 'MFI_APP_SCORE_V1',
      name: 'Application scorecard',
      status: 'PASS',
      effectiveStatus: 'PASS',
      inputs: { score: '712' },
    },
  ],
};
