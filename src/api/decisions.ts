/**
 * Decision lookup and the explanation viewer (M5-08, J7, J8).
 *
 * **Through the registry, never straight to the Decision API.** The Decision API trusts
 * `X-Tenant-Id` — it has no authentication at all, which is deliberate and is the first finding in
 * `docs/THREAT-MODEL.md` — so a browser that called it directly could read any tenant's decisions
 * by editing one header. The registry supplies that header from the session instead, gated on
 * `DECISION_READ_MASKED`, and nothing this module sends can influence which tenant is read.
 *
 * That makes the registry a stand-in for the BFF of TRD §13.1–13.3, whose service module is still
 * empty. When it lands, the only change here is `REGISTRY` becoming the BFF's base URL.
 *
 * **Facts arrive masked and there is no unmask call here.** §9.4 allows an auditor to unmask with a
 * recorded reason; the data plane has no route for it (M3-09), so offering one in the client would
 * be a button that cannot work.
 */

import { currentSession } from './auth';
import { RunError } from './runs';
import type { Decision } from './types';

/** One replayed step of a decision. */
export interface ExplanationStep {
  readonly ref: string;
  readonly status: string;
}

/** A decision's explanation, as the decision service produces it. */
export interface Explanation {
  readonly decisionId: string;
  /**
   * The decision as recorded.
   *
   * Typed as the four outcomes because that is the closed set the engine produces (§4.8), and a
   * widened `string` here would silently lose the pill colouring the moment the service returned
   * something unexpected — which is the case worth showing loudly rather than rendering grey.
   */
  readonly decision: Decision;
  /** Whether the replay agreed with the record. **False is a finding, not a detail.** */
  readonly matched: boolean;
  readonly mismatches: readonly string[];
  readonly bundleHash: string;
  readonly steps: readonly string[];
  /** The fact snapshot, masked per §9.4, or null when facts were not stored. */
  readonly facts: Readonly<Record<string, unknown>> | null;
}

const REGISTRY: string = (import.meta.env.VITE_REGISTRY_URL as string | undefined) ?? '';

async function call<T>(path: string): Promise<T> {
  const session = currentSession();
  if (!session?.token) {
    throw new RunError(401, 'Your session has expired. Sign in again.');
  }
  const response = await fetch(`${REGISTRY}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${session.token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    // The statuses carry meaning a screen has to show differently, and collapsing them into
    // "something went wrong" is what makes a user retry a thing that will never work.
    let message = `Request failed with ${response.status}`;
    try {
      const problem = JSON.parse(text) as { detail?: string; title?: string; reason?: string };
      message = problem.detail ?? problem.title ?? message;
      if (problem.reason) {
        message = `${message} (${problem.reason})`;
      }
    } catch {
      if (text) {
        message = text.slice(0, 400);
      }
    }
    throw new RunError(response.status, message);
  }
  return JSON.parse(text) as T;
}

/**
 * Explains one decision, by replaying it against the bundle it was decided with (D7).
 *
 * @param decisionId the decision
 */
export function explainDecision(decisionId: string): Promise<Explanation> {
  return call<Explanation>(`/v1/decisions/${encodeURIComponent(decisionId)}/explanation`);
}

/**
 * Reads one decision as recorded, without replaying it.
 *
 * @param decisionId the decision
 */
export function getDecision(decisionId: string): Promise<Readonly<Record<string, unknown>>> {
  return call<Readonly<Record<string, unknown>>>(
    `/v1/decisions/${encodeURIComponent(decisionId)}`,
  );
}
