/**
 * The audit trail (FR-AUD-005, M3-10).
 *
 * Read-only, because the API is read-only: entries are written by the services that make the
 * changes and sealed by a database trigger, and the table forbids UPDATE, DELETE and TRUNCATE. A
 * client function that could append one would be a client that can author history.
 */

import { currentSession } from './auth';
import { RunError } from './runs';

/** One audit entry. */
export interface AuditEntry {
  readonly seq: number;
  readonly occurredAt: string;
  readonly actor: string;
  readonly actorType: 'USER' | 'SERVICE' | 'SYSTEM';
  readonly action: string;
  readonly subjectKind: string;
  readonly subjectKey: string;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly entryHash: string;
}

/** What verifying the chain established. */
export interface Verification {
  readonly entries: number;
  readonly intact: boolean;
  readonly firstBrokenSeq?: number;
  readonly firstGapAfterSeq?: number;
  readonly headHash?: string;
}

/** What to list. Mutable, so a caller can build it up field by field. */
export interface AuditFilter {
  action?: string;
  subjectKind?: string;
  subjectKey?: string;
  actor?: string;
  limit?: number;
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
  return JSON.parse(text) as T;
}

/** Lists entries, newest first. */
export function listAudit(filter: AuditFilter = {}): Promise<AuditEntry[]> {
  const query = new URLSearchParams();
  if (filter.action) {
    query.set('action', filter.action);
  }
  if (filter.subjectKind) {
    query.set('subjectKind', filter.subjectKind);
  }
  if (filter.subjectKey) {
    query.set('subjectKey', filter.subjectKey);
  }
  if (filter.actor) {
    query.set('actor', filter.actor);
  }
  query.set('limit', String(filter.limit ?? 100));
  return call<AuditEntry[]>(`/v1/audit?${query.toString()}`);
}

/**
 * Verifies the hash chain.
 *
 * The server recomputes every entry hash rather than reading a stored flag — a flag is exactly
 * what somebody tampering would set.
 */
export function verifyAudit(): Promise<Verification> {
  return call<Verification>('/v1/audit/verify');
}
