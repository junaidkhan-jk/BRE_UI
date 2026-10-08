/**
 * The Backend-for-Frontend client (TRD §13.1–13.3).
 *
 * The studio talks only to the BFF. It never calls the Decision API or the studio-service
 * directly, and that is a security boundary rather than a layering preference: the BFF is where
 * fact masking happens, where a screen's data is aggregated into one response, and where the
 * user's roles decide what comes back. A browser that could reach the services directly could ask
 * for unmasked facts.
 *
 * Every response goes through {@link request}, so three things are handled once rather than at
 * every call site:
 *
 *   - RFC 9457 problem+json is turned into a typed {@link BffError} carrying the traceId a user
 *     can quote to support (TRD §13.5's error state requires it on screen);
 *   - a 401 is distinguishable from a 403, because "log in again" and "you lack the role" are
 *     different things to tell someone;
 *   - a non-JSON body (a proxy error page, say) does not become a confusing parse failure.
 */

/** An RFC 9457 problem, as the BFF returns it. */
export interface Problem {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly traceId?: string;
  readonly [key: string]: unknown;
}

/** A failed BFF call. */
export class BffError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.title ?? problem.detail ?? `request failed with ${status}`);
    this.name = 'BffError';
    this.status = status;
    this.problem = problem;
  }

  /** The id a user can quote so support can find this exact request. */
  get traceId(): string | undefined {
    return this.problem.traceId;
  }

  /** Whether the session has expired, as opposed to the user lacking a role. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Whether the user is known but not permitted (TRD §13.5's no-permission state). */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * Whether this is an edit conflict. §13.5 requires a three-way merge view on 412, because two
   * authors editing one draft is normal and losing one of their edits is not.
   */
  get isConflict(): boolean {
    return this.status === 412 || this.status === 409;
  }
}

const BASE = '/bff/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    // Session cookies, not a token in local storage: a token readable by script is a token any
    // injected script can exfiltrate.
    credentials: 'same-origin',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const body: unknown = text ? safeParse(text) : undefined;

  if (!response.ok) {
    throw new BffError(response.status, asProblem(body, response.status));
  }
  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A proxy or gateway error page, not the BFF. Say so rather than reporting a parse error,
    // which would send someone looking in the wrong place.
    return { title: 'The response was not JSON', detail: text.slice(0, 200) };
  }
}

function asProblem(body: unknown, status: number): Problem {
  if (body && typeof body === 'object') {
    return body as Problem;
  }
  return { status, title: `Request failed with ${status}` };
}

export const bff = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
};
