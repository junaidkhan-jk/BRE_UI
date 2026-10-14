/**
 * Running a policy version against facts, and reading the policies you can run.
 *
 * Talks to the registry directly for the same reason {@link ./auth} does: the BFF does not exist
 * yet, and a Run button that cannot run is not worth shipping. When the BFF arrives these move
 * behind it unchanged — the shapes are the registry's own.
 */

import { currentSession } from './auth';

/** A policy, as the registry lists them. */
export interface PolicySummary {
  readonly policyCode: string;
  readonly name: string;
  readonly stage: string;
  readonly status: string;
}

/** One version of a policy. */
export interface VersionSummary {
  readonly version: string;
  readonly status: string;
  readonly bundleHash: string;
  readonly approvedAt: string;
  readonly createdBy: string;
}

/** What one component did for one entity. */
export interface EntityOutcome {
  readonly component: string;
  readonly entity: string | null;
  readonly status: string;
  readonly effectiveStatus: string;
  readonly reasonCode: string | null;
  readonly measure: string | null;
  readonly outputs: Readonly<Record<string, string>>;
  readonly error: string | null;
}

/** One flow step. */
export interface StepOutcome {
  readonly component: string;
  readonly status: string;
  readonly entities: readonly EntityOutcome[];
}

/** What a run established. */
export interface RunResult {
  readonly policyCode: string;
  readonly version: number;
  readonly status: string;
  readonly asOf: string;
  readonly decision: string;
  readonly stpEligible: boolean;
  readonly steps: readonly StepOutcome[];
  readonly customerReasons: readonly string[];
  readonly internalReasons: readonly string[];
  readonly approvals: readonly string[];
  readonly factWarnings: readonly string[];
  readonly assetsResolved: boolean;
}

/** What a test suite exercised, as the registry measures it (FR-TEST-003). */
export interface Coverage {
  readonly overallPercent: number;
  readonly ruleStatusPercent: number;
  readonly rowPercent: number;
  readonly binPercent: number;
  readonly ruleStatusesTotal: number;
  readonly ruleStatusesCovered: number;
  readonly rowsTotal: number;
  readonly rowsCovered: number;
  readonly binsTotal: number;
  readonly binsCovered: number;
  readonly uncoveredRuleStatuses: readonly string[];
  readonly uncoveredRows: readonly string[];
  readonly uncoveredBins: readonly string[];
}

/** A version as the registry returns it, with its latest compile report. */
export interface VersionDetail {
  readonly policyCode: string;
  readonly version: number;
  readonly status: string;
  readonly submissionRound: number;
  readonly compileOk: boolean;
  readonly findings: readonly string[];
  readonly tests: { readonly total: number; readonly passed: number; readonly failures: readonly string[] };
  /** Absent when nothing has been measured — which is not the same as measured at zero. */
  readonly coverage?: Coverage;
  readonly minCoveragePercent: number;
  readonly changeNote?: string;
  readonly committeeReference?: string;
  readonly rowVersion: number;
}

/** One semantic change between two versions. */
export interface DiffChange {
  readonly kind: 'ADDED' | 'REMOVED' | 'CHANGED';
  readonly subject: string;
  readonly detail: string;
}

/** A comparison of two versions. */
export interface Diff {
  readonly policyCode: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly semantic: readonly DiffChange[];
  readonly unified: readonly string[];
  readonly textDiffSkipped: boolean;
}

/** A failed registry call. */
export class RunError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RunError';
    this.status = status;
  }
}

const REGISTRY: string = (import.meta.env.VITE_REGISTRY_URL as string | undefined) ?? '';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = currentSession();
  if (!session?.token) {
    throw new RunError(401, 'Your session has expired. Sign in again.');
  }
  const response = await fetch(`${REGISTRY}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.token}`,
      ...init.headers,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    // The registry's problem+json `detail` is written to be read by a person — a lifecycle refusal
    // says which state blocked it, a 403 says which role is missing. Preferring it over `title` is
    // what makes the screen useful instead of just red.
    let message = `Request failed with ${response.status}`;
    try {
      const problem = JSON.parse(text) as { detail?: string; title?: string };
      message = problem.detail ?? problem.title ?? message;
    } catch {
      if (text) {
        message = text.slice(0, 400);
      }
    }
    throw new RunError(response.status, message);
  }
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}

/** This tenant's policies. */
export function listPolicies(): Promise<PolicySummary[]> {
  return call<PolicySummary[]>('/v1/policies');
}

/** A policy's versions, newest first. */
export function listVersions(policyCode: string): Promise<VersionSummary[]> {
  return call<VersionSummary[]>(`/v1/policies/${encodeURIComponent(policyCode)}/versions`);
}

/** A version's PSF source, so a run can be read beside the rules that produced it. */
export async function readSource(policyCode: string, version: number): Promise<string> {
  const session = currentSession();
  const response = await fetch(
    `${REGISTRY}/v1/policies/${encodeURIComponent(policyCode)}/versions/${version}/source`,
    { headers: { Authorization: `Bearer ${session?.token ?? ''}` } },
  );
  if (!response.ok) {
    throw new RunError(response.status, 'This version has no saved source yet.');
  }
  return response.text();
}

/** One version with its compile report, coverage and submit evidence. */
export function readVersion(policyCode: string, version: number): Promise<VersionDetail> {
  return call<VersionDetail>(
    `/v1/policies/${encodeURIComponent(policyCode)}/versions/${version}`,
  );
}

/**
 * Compares two versions.
 *
 * Either order works and either may be a draft: reviewing a change means reading what it does to
 * the version it replaces, and that has to be possible before the change is submitted.
 */
export function diffVersions(policyCode: string, from: number, to: number): Promise<Diff> {
  return call<Diff>(
    `/v1/policies/${encodeURIComponent(policyCode)}/versions/${from}/diff/${to}`,
  );
}

/**
 * Runs a version against facts.
 *
 * @param policyCode the policy
 * @param version the version — any state, including a draft
 * @param facts the fact snapshot
 * @param asOf the business date, which the server requires rather than defaulting
 */
export function runPolicy(
  policyCode: string,
  version: number,
  facts: unknown,
  asOf: string,
): Promise<RunResult> {
  return call<RunResult>(
    `/v1/policies/${encodeURIComponent(policyCode)}/versions/${version}/run`,
    { method: 'POST', body: JSON.stringify({ facts, asOf }) },
  );
}
