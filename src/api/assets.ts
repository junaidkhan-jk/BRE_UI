/**
 * Shared assets: parameter sets, reference lists, reason codes and authority matrices (M3-03).
 *
 * <p>Content crosses the wire as plain objects, never as a typed node — the registry's own
 * controllers do the same, because Spring Boot 4 serialises HTTP with Jackson 3 while the rest of
 * that build parses with Jackson 2, and a Jackson 2 node comes out as every bean accessor and none
 * of the data. Nothing on this side depends on that; it is simply the shape the API gives.
 */

import { currentSession } from './auth';
import { RunError } from './runs';

/** The four kinds of shared asset a policy can pin. */
export type AssetKind =
  | 'PARAMETER_SET'
  | 'REFERENCE_LIST'
  | 'REASON_CODE_CATALOGUE'
  | 'AUTHORITY_MATRIX';

/** How each kind reads in a heading. */
export const KIND_LABELS: Readonly<Record<AssetKind, string>> = {
  PARAMETER_SET: 'Parameter sets',
  REFERENCE_LIST: 'Reference lists',
  REASON_CODE_CATALOGUE: 'Reason codes',
  AUTHORITY_MATRIX: 'Authority matrices',
};

/** One asset version's header, as the list returns it. */
export interface AssetHeader {
  readonly kind: AssetKind;
  readonly code: string;
  readonly version: number;
  readonly status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED' | 'DISCARDED';
  readonly contentHash?: string;
  readonly author: string;
  readonly submissionRound: number;
  readonly approvedAt?: string;
  readonly rowVersion: number;
}

/** One effective window of a parameter's value. `effectiveTo` is EXCLUSIVE; null is open-ended. */
export interface EffectiveWindow {
  effectiveFrom: string;
  effectiveTo: string | null;
  value: string;
}

/** One typed, named constant with its effective-dated values. */
export interface Parameter {
  name: string;
  type: 'Decimal' | 'Integer' | 'Boolean' | 'Text' | 'Date';
  regulatory: boolean;
  sourceRef?: string | undefined;
  nextReviewOn?: string | undefined;
  description?: string | undefined;
  values: EffectiveWindow[];
}

/** One authority level. A higher rank is more senior. */
export interface Level {
  levelCode: string;
  rank: number;
}

/** One row of an authority matrix. */
export interface AuthorityEntry {
  deviationType: string;
  productLine: string;
  segment: string;
  // Explicitly `| undefined`: exactOptionalPropertyTypes distinguishes an absent property from one
  // set to undefined, and an unbounded band is expressed by clearing the field.
  amountAbove?: string | undefined;
  amountUpTo?: string | undefined;
  levelCode: string;
}

/** One reason code. */
export interface ReasonCode {
  code: string;
  category:
    | 'KNOCKOUT'
    | 'CREDIT'
    | 'KYC'
    | 'FRAUD'
    | 'AFFORDABILITY'
    | 'COLLATERAL'
    | 'POLICY';
  adverse: boolean;
  internalText: string;
  customerText: Record<string, string>;
}

/** An asset version's content. Which fields are present depends on the kind. */
export interface AssetContent {
  readonly code?: string;
  readonly version?: number;
  parameters?: Parameter[] | undefined;
  itemType?: string | undefined;
  description?: string | undefined;
  items?: string[] | undefined;
  codes?: ReasonCode[] | undefined;
  routingMode?: 'HIGHEST_ONLY' | 'EACH' | undefined;
  levels?: Level[] | undefined;
  entries?: AuthorityEntry[] | undefined;
}

/** An asset version with its content. */
export interface AssetVersion extends AssetHeader {
  readonly content: AssetContent;
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
    // The registry's problem+json `detail` is written to be read by a person: a refusal says which
    // rule blocked it and why that rule exists. Preferring it over `title` is what makes a
    // refusal useful instead of just red — "a reference list may hold at most 100000 items …
    // send the result as a fact" is guidance, and "Not allowed in this state" is not.
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

/** Every asset version, newest version first, optionally of one kind. */
export function listAssets(kind?: AssetKind): Promise<AssetHeader[]> {
  return call<AssetHeader[]>(`/v1/assets${kind ? `?kind=${kind}` : ''}`);
}

/** One version with its content. */
export function readAsset(
  kind: AssetKind,
  code: string,
  version: number,
): Promise<AssetVersion> {
  return call<AssetVersion>(
    `/v1/assets/${kind}/${encodeURIComponent(code)}/versions/${version}`,
  );
}

/** One policy version that pins an asset, and where it is live. */
export interface AssetUsage {
  readonly policyCode: string;
  readonly policyVersion: number;
  /** The asset version THAT policy version pinned — not necessarily the latest. */
  readonly assetVersion: number;
  readonly policyStatus: string;
  /** Comma-separated environments where it is ACTIVE or SCHEDULED; empty when deployed nowhere. */
  readonly liveEnvironments: string;
}

/**
 * Which policy versions pin this asset.
 *
 * Not version-scoped, because the question before an edit is "who depends on this asset", not "who
 * depends on version 3". Each row carries the version it pinned, so a policy still on an earlier
 * version shows as exactly that.
 */
export function assetUsage(kind: AssetKind, code: string): Promise<AssetUsage[]> {
  return call<AssetUsage[]>(`/v1/assets/${kind}/${encodeURIComponent(code)}/usage`);
}

/**
 * Opens a DRAFT, cloning the latest approved version by default.
 *
 * Cloning is the default because a parameter set has twenty parameters and a change usually
 * touches one — and a retyped parameter set is where a wrong threshold comes from.
 */
export function createAssetDraft(
  kind: AssetKind,
  code: string,
  clone = true,
): Promise<AssetVersion> {
  return call<AssetVersion>(
    `/v1/assets/${kind}/${encodeURIComponent(code)}/versions?clone=${clone}`,
    { method: 'POST' },
  );
}

/** Replaces a DRAFT's content. */
export function saveAsset(
  kind: AssetKind,
  code: string,
  version: number,
  content: AssetContent,
): Promise<AssetVersion> {
  return call<AssetVersion>(
    `/v1/assets/${kind}/${encodeURIComponent(code)}/versions/${version}`,
    { method: 'PUT', body: JSON.stringify(content) },
  );
}

/** Submits a DRAFT for review. */
export function submitAsset(
  kind: AssetKind,
  code: string,
  version: number,
): Promise<AssetVersion> {
  return call<AssetVersion>(
    `/v1/assets/${kind}/${encodeURIComponent(code)}/versions/${version}/submit`,
    { method: 'POST' },
  );
}

/** Approves an asset version, or requests changes. The reviewer cannot be the author. */
export function reviewAsset(
  kind: AssetKind,
  code: string,
  version: number,
  approve: boolean,
  comment: string,
): Promise<AssetVersion> {
  return call<AssetVersion>(
    `/v1/assets/${kind}/${encodeURIComponent(code)}/versions/${version}/reviews`,
    { method: 'POST', body: JSON.stringify({ approve, comment }) },
  );
}

/** Discards a DRAFT. A version is never deleted. */
export function discardAsset(
  kind: AssetKind,
  code: string,
  version: number,
): Promise<AssetVersion> {
  return call<AssetVersion>(
    `/v1/assets/${kind}/${encodeURIComponent(code)}/versions/${version}`,
    { method: 'DELETE' },
  );
}
