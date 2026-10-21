/**
 * The error type the screens render, and the RFC 9457 problem shape behind it.
 *
 * **This module used to hold an HTTP client for the BFF of TRD §13.1–13.3, and the client is
 * gone.** `services/studio-service` is still an empty module, so there is no BFF to call: every
 * client in this directory talks to the policy registry's `/v1/…` directly, proxied same-origin by
 * the dev server.
 *
 * The dead client was not harmless. It was the only thing that referenced `/bff`, which is the
 * path `vite.config.ts` proxied — so the proxy served a client nobody used while the clients
 * everybody used were not proxied at all. A browser could therefore never reach a live backend:
 * with `VITE_REGISTRY_URL` set the call went cross-origin and CORS blocked it, and without it the
 * call hit the dev server's own 404. Nothing caught it because fixtures are the default and the
 * Playwright suite runs on them.
 *
 * What survives is what is used: {@link BffError}, which the screens show, and {@link Problem},
 * which is the wire shape. Both keep their names — a rename across every screen buys nothing — and
 * both are what a real BFF would return too.
 *
 * Three things the deleted client got right, kept here for whoever writes the BFF client:
 *
 *   - problem+json becomes a typed error carrying the traceId a user can quote to support;
 *   - 401 is distinguishable from 403, because "log in again" and "you lack the role" are
 *     different things to tell someone;
 *   - a non-JSON body (a gateway error page) does not become a confusing parse failure.
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
