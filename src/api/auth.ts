/**
 * The registry's authentication endpoints, and where the session lives in the browser.
 *
 * The studio talks to the BFF for everything else (TRD §13.1); authentication is the one call that
 * goes to the registry directly, because the BFF does not exist yet and a login screen that cannot
 * log in is not worth shipping. The dev server proxies `/v1` to it (see vite.config.ts),
 * so these calls are same-origin and `VITE_REGISTRY_URL` stays EMPTY.
 *
 * **The token is kept in sessionStorage, and that is a deliberate second-best.** The right answer
 * is an HttpOnly, SameSite cookie the browser's script cannot read, so an injected script cannot
 * exfiltrate it — which is what the BFF will issue. That needs the BFF to be the thing issuing it,
 * and today the registry returns a bearer token for a cross-origin caller. Of the options
 * available right now:
 *
 *   - `sessionStorage`: readable by script, cleared when the tab closes.
 *   - `localStorage`: readable by script and survives a reboot, so a shared machine keeps the
 *     session. Worse.
 *   - a variable in memory only: not readable by a persisted script, and lost on every page
 *     reload, which makes the app unusable.
 *
 * sessionStorage, and the risk is written down rather than forgotten. The upgrade is one function.
 */

/** A role, as §3.12 names them. */
export type Role =
  | 'POLICY_AUTHOR'
  | 'POLICY_REVIEWER'
  | 'DEPLOYMENT_APPROVER'
  | 'RISK_ANALYST'
  | 'AUDITOR'
  | 'OPS_VIEWER'
  | 'TENANT_ADMIN'
  | 'PLATFORM_ADMIN';

/** A capability a role confers. The server is the authority; this is for hiding what cannot work. */
export type Capability =
  | 'POLICY_EDIT'
  | 'POLICY_SUBMIT'
  | 'POLICY_REVIEW'
  | 'POLICY_READ'
  | 'TEST_EDIT'
  | 'SIMULATE'
  | 'DEPLOY_REQUEST'
  | 'DEPLOY_APPROVE'
  | 'DEPLOY_ROLLBACK'
  | 'DECISION_READ_MASKED'
  | 'DECISION_UNMASK'
  | 'AUDIT_READ'
  | 'USER_MANAGE'
  | 'ROLE_MANAGE'
  | 'TENANT_SETTINGS'
  | 'PLATFORM_MANAGE'
  | 'SOD_OVERRIDE';

/** Who is signed in. */
export interface Session {
  readonly token: string | null;
  readonly expiresAt: string | null;
  readonly subject: string;
  readonly displayName: string;
  readonly tenantId: string;
  readonly roles: readonly Role[];
  readonly capabilities: readonly Capability[];
  readonly mustChangePassword: boolean;
  readonly canOverrideSegregationOfDuties: boolean;
}

/** A failed call to the registry. */
export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

const REGISTRY: string = (import.meta.env.VITE_REGISTRY_URL as string | undefined) ?? '';
const STORAGE_KEY = 'bre.session';

/**
 * Whether a registry is actually reachable.
 *
 * The studio is also built and served with no backend at all — as a static preview for reviewers,
 * and as the artefact the end-to-end suite exercises. In that mode there is nothing to refresh a
 * session against, and calling anyway produced a 404 on every page load: harmless, but it put a
 * console error on a page the suite asserts loads cleanly, which is exactly the kind of noise that
 * gets a real error ignored later.
 */
const registryConfigured =
  REGISTRY !== '' || import.meta.env.VITE_USE_FIXTURES === 'false';

function store(session: Session): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private browsing, or storage disabled by policy. The session still works for this page view;
    // a reload will ask for the password again. Failing the login over it would be worse.
  }
}

/** The session this tab holds, if any. */
export function currentSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw) as Session;
    // An expired token is not a session. Checked here as well as by the server, so the app shows
    // the login screen rather than letting every request fail with a 401 the user cannot act on.
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** Forgets the session in this tab. */
export function forgetSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: there was nothing stored.
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const session = currentSession();
  const response = await fetch(`${REGISTRY}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!response.ok) {
    // The registry returns RFC 9457 problem+json, whose `detail` is written to be shown to a
    // person — see ProblemHandler. Preferring it over `title` is what makes a 403 say which role
    // is missing instead of just "Not permitted".
    let message = `Request failed with ${response.status}`;
    try {
      const problem = JSON.parse(text) as { detail?: string; title?: string };
      message = problem.detail ?? problem.title ?? message;
    } catch {
      if (text) {
        message = text.slice(0, 300);
      }
    }
    throw new AuthError(response.status, message);
  }
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}

/**
 * Signs in and remembers the session in this tab.
 *
 * @param email the email
 * @param password the password
 * @param organisation the tenant, needed only when one email exists in more than one
 */
export async function login(
  email: string,
  password: string,
  organisation?: string,
): Promise<Session> {
  const session = await call<Session>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, organisation: organisation || undefined }),
  });
  store(session);
  return session;
}

/** Signs out, revoking the session server-side as well as forgetting it here. */
export async function logout(): Promise<void> {
  try {
    await call<void>('/v1/auth/logout', { method: 'POST' });
  } catch {
    // The server may already have revoked or expired it. Forgetting it locally regardless is the
    // point: a logout that leaves the token in storage because the network blipped is not a
    // logout.
  }
  forgetSession();
}

/** Re-reads who the caller is from the server, which is the authority on roles. */
export async function refreshSession(): Promise<Session | null> {
  const held = currentSession();
  if (!held) {
    return null;
  }
  if (!registryConfigured) {
    // Nothing to ask. Returning what is held keeps the fixture-mode preview usable while being
    // honest that the roles on it have not been confirmed by anybody.
    return held;
  }
  try {
    const fresh = await call<Session>('/v1/auth/me', { method: 'GET' });
    // Keep the token: /me does not return one, because it does not issue one.
    const merged: Session = { ...fresh, token: held.token, expiresAt: held.expiresAt };
    store(merged);
    return merged;
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      forgetSession();
      return null;
    }
    // A network failure is not an expired session. Keeping what we hold means a brief outage does
    // not sign everybody out.
    return held;
  }
}

/** Changes the caller's own password. Revokes their other sessions, server-side. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await call<void>('/v1/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/**
 * Whether the session holds a capability.
 *
 * **For hiding controls, never for permitting anything.** Every endpoint checks its own
 * capability server-side; this only stops the studio showing a button whose only possible outcome
 * is a 403. A client that decided what it may do is a client an attacker edits.
 */
export function can(session: Session | null, capability: Capability): boolean {
  return session?.capabilities.includes(capability) ?? false;
}
