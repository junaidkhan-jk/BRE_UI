import { Navigate, useLocation } from 'react-router-dom';

import { useSession } from './SessionContext';

/**
 * Renders its children only for a signed-in user.
 *
 * **It waits for the first server check before deciding.** The stored session is read
 * synchronously, but the roles on it may be stale, so {@link SessionProvider} re-reads them from
 * the server on load. Redirecting to the login screen before that finishes would bounce a
 * perfectly valid session out — and then straight back in — which looks like a broken app and, on
 * a slow connection, loses whatever the user was doing.
 *
 * **It is not a security control.** Every endpoint authorises its own request; this stops a signed
 * -out browser rendering an empty workspace whose every call would 401. Hiding a screen in the
 * client is presentation, not protection.
 */
export function RequireSession({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) {
    // Deliberately a status region rather than a spinner: a screen reader should be told the app
    // is checking rather than left on a silent page.
    return (
      <main className="login">
        <p role="status" className="login__sub">
          Checking your session…
        </p>
      </main>
    );
  }

  if (!session) {
    // `state` carries where they were going, so signing in returns them there instead of to the
    // default screen — which matters for a deep link somebody was sent.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
