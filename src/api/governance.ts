/**
 * The review inbox and the deployment console (M5-06).
 *
 * Both read the registry's existing endpoints — nothing new was added on the server for these
 * screens. That is the point: approve and deploy were already possible and were only possible
 * with `curl`, which means the control existed and nobody could exercise it.
 */

import { currentSession } from './auth';
import { RunError } from './runs';

/** One deployment, as the registry returns it. */
export interface Deployment {
  readonly deploymentId: string;
  readonly envCode: string;
  readonly policyCode: string;
  readonly bundleHash: string;
  readonly mode: 'CHAMPION' | 'CHALLENGER' | 'SHADOW';
  readonly status:
    | 'PENDING_APPROVAL'
    | 'SCHEDULED'
    | 'ACTIVE'
    | 'SUPERSEDED'
    | 'ROLLED_BACK'
    | 'CANCELLED';
  readonly approvals: number;
  readonly approvalsRequired: number;
  /** When it takes effect. In the past for anything already ACTIVE. */
  readonly effectiveFrom: string;
  readonly manifestVersion?: number;
}

/** What a deployment request carries. */
export interface DeployRequest {
  readonly envCode: string;
  readonly policyCode: string;
  readonly version: number;
  readonly mode: 'CHAMPION' | 'CHALLENGER' | 'SHADOW';
  readonly reason: string;
  readonly expedited?: boolean;
  /** Absent means now. A future instant means it waits in SCHEDULED until then (00 §3.4). */
  readonly effectiveFrom?: string;
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
    let message = `Request failed with ${response.status}`;
    try {
      const problem = JSON.parse(text) as { detail?: string; title?: string };
      message = problem.detail ?? problem.title ?? message;
    } catch {
      if (text) {
        message = text.slice(0, 500);
      }
    }
    throw new RunError(response.status, message);
  }
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}

/** Deployments in one environment, newest first. */
export function listDeployments(envCode: string): Promise<Deployment[]> {
  return call<Deployment[]>(`/v1/deployments?envCode=${encodeURIComponent(envCode)}`);
}

/**
 * Everything waiting to take effect, across every environment, soonest first.
 *
 * Deliberately not scoped to an environment: "what lands this week" is the question, and no
 * per-environment list can answer it.
 */
export function deploymentSchedule(): Promise<Deployment[]> {
  return call<Deployment[]>('/v1/deployments/schedule');
}

/** Requests a deployment. Activates at once when the environment needs no approvals. */
export function requestDeployment(body: DeployRequest): Promise<Deployment> {
  return call<Deployment>('/v1/deployments', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * Approves a deployment.
 *
 * The approver can be neither the version's author nor its reviewer nor the requester (00 §3.3) —
 * three distinct people for a PROD change. The server enforces it.
 */
export function approveDeployment(deploymentId: string, comment: string): Promise<Deployment> {
  return call<Deployment>(`/v1/deployments/${deploymentId}/approvals`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
}

/** Cancels a deployment that has not activated. */
export function cancelDeployment(deploymentId: string): Promise<Deployment> {
  return call<Deployment>(`/v1/deployments/${deploymentId}/cancel`, { method: 'POST' });
}

/**
 * Rolls an ACTIVE deployment back.
 *
 * A rollback is a NEW deployment pointing at the previous bundle, never an edit in place — which
 * is the difference between being able to answer "what was serving at 14:30 last Tuesday" and not.
 */
export function rollbackDeployment(deploymentId: string, reason: string): Promise<Deployment> {
  return call<Deployment>(`/v1/deployments/${deploymentId}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/** Submits a policy version for review, with the evidence FR-LIFE-002 requires. */
export function submitVersion(
  policyCode: string,
  version: number,
  changeNote: string,
  committeeReference: string,
): Promise<unknown> {
  return call(`/v1/policies/${encodeURIComponent(policyCode)}/versions/${version}/submit`, {
    method: 'POST',
    body: JSON.stringify({ changeNote, committeeReference }),
  });
}

/** Approves a policy version, or requests changes. The reviewer cannot be an author. */
export function reviewVersion(
  policyCode: string,
  version: number,
  approve: boolean,
  comment: string,
): Promise<unknown> {
  return call(`/v1/policies/${encodeURIComponent(policyCode)}/versions/${version}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ approve, comment }),
  });
}
