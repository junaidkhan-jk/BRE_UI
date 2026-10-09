import { useState } from 'react';

import { AuthError } from '../api/auth';
import { useSession } from '../app/SessionContext';

import './Login.css';

/**
 * The sign-in screen.
 *
 * Four things here are accessibility and usability requirements rather than preferences, and each
 * is the kind of thing that is cheap now and expensive to retrofit:
 *
 *   - **the error is announced**, in a `role="alert"` region, so a screen-reader user learns the
 *     password was wrong without having to go looking for why nothing happened;
 *   - **the error is tied to the fields** with `aria-describedby`, so it is read as part of them;
 *   - **the submit button says what it is doing** while the request is in flight — a login takes a
 *     visible moment because the password hash is deliberately expensive (600,000 PBKDF2
 *     iterations), and a button that looks idle invites a second click;
 *   - **the organisation field appears only when it is needed.** Asking everybody for a tenant
 *     identifier they have never seen is the kind of form field that generates support calls, so
 *     it stays hidden until the server says the email exists in more than one organisation.
 */
export function Login(): React.JSX.Element {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [needsOrganisation, setNeedsOrganisation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password, organisation);
    } catch (caught) {
      const message =
        caught instanceof AuthError ? caught.message : 'Could not reach the server.';
      // The server returns one message for every credential failure, on purpose — see AuthService.
      // The one case it distinguishes is an email that exists in two organisations, because that
      // is the only one the person can actually do something about.
      if (message.includes('more than one organisation')) {
        setNeedsOrganisation(true);
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit} noValidate>
        <h1 className="login__brand">
          BRE <span className="login__brand-dim">Studio</span>
        </h1>
        <p className="login__sub">Sign in to author, review and deploy credit policy.</p>

        {error ? (
          <div className="login__error" role="alert" id="login-error">
            {error}
          </div>
        ) : null}

        <label className="login__label" htmlFor="login-email">
          Email
        </label>
        <input
          className="login__input"
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby={error ? 'login-error' : undefined}
        />

        <label className="login__label" htmlFor="login-password">
          Password
        </label>
        <input
          className="login__input"
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={error ? 'login-error' : undefined}
        />

        {needsOrganisation ? (
          <>
            <label className="login__label" htmlFor="login-organisation">
              Organisation
            </label>
            <input
              className="login__input"
              id="login-organisation"
              name="organisation"
              type="text"
              autoComplete="organization"
              value={organisation}
              onChange={(event) => setOrganisation(event.target.value)}
              aria-describedby="login-organisation-help"
            />
            <p className="login__help" id="login-organisation-help">
              That email exists in more than one organisation. Your administrator can tell you
              which identifier to use.
            </p>
          </>
        ) : null}

        <button className="login__submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="login__note">
          There is no self-service password reset and no sign-up: accounts are created by your
          organisation&rsquo;s administrator, who can also reset a password.
        </p>
      </form>
    </main>
  );
}
