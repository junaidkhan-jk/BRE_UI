import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  type Capability,
  type Session,
  can,
  currentSession,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
} from '../api/auth';

/** What the app can do with the session. */
interface SessionState {
  readonly session: Session | null;
  /** True until the first server check finishes, so the app does not flash the login screen. */
  readonly loading: boolean;
  readonly signIn: (email: string, password: string, organisation?: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly can: (capability: Capability) => boolean;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * Holds the signed-in session for the whole app.
 *
 * **Why it re-checks with the server on load rather than trusting what is stored.** The stored
 * session carries the roles as they were at login, and a session here lasts twelve hours — so a
 * role revoked at 10:00 would keep showing its screens until the tab was closed. The server is the
 * authority on roles, and asking it once per page load costs one request.
 *
 * It does *not* sign the user out when that request fails for any reason other than a 401. A
 * network blip is not a revoked session, and signing everybody out of a half-written policy
 * because a proxy hiccuped is a worse outcome than briefly showing a stale role.
 */
export function SessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(() => currentSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((fresh) => {
      if (!cancelled) {
        setSession(fresh);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, organisation?: string) => {
      setSession(await apiLogin(email, password, organisation));
    },
    [],
  );

  const signOut = useCallback(async () => {
    await apiLogout();
    setSession(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      session,
      loading,
      signIn,
      signOut,
      can: (capability: Capability) => can(session, capability),
    }),
    [session, loading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * The session state.
 *
 * @throws when called outside {@link SessionProvider}, which is a wiring mistake rather than a
 *     runtime condition — returning a null session instead would render the login screen inside
 *     the app and look like an authentication bug.
 */
export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) {
    throw new Error('useSession must be used inside a SessionProvider');
  }
  return state;
}
