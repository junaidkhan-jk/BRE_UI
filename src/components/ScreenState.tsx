import type { ReactNode } from 'react';

import { BffError } from '../api/bff';

import './ScreenState.css';

/**
 * The five standard screen states TRD §13.5 requires of every screen.
 *
 * Centralised so they cannot drift: a screen that invents its own error panel is a screen whose
 * error does not carry the traceId support needs, and a screen that shows a spinner where the
 * others show a skeleton makes the app feel like several apps.
 */

/** Loading. Skeletons in the final layout, never a spinner over a blank page (§13.5). */
export function Loading(props: { readonly rows?: number; readonly label?: string }): React.JSX.Element {
  const rows = props.rows ?? 5;
  return (
    <div className="state" aria-busy="true" aria-live="polite">
      <span className="sr-only">{props.label ?? 'Loading'}</span>
      {Array.from({ length: rows }, (_, index) => (
        // A skeleton in the shape of the content that is coming, so the layout does not jump when
        // it arrives — which is what makes a spinner feel slower than a skeleton of equal wait.
        <div key={index} className="skeleton" style={{ width: `${100 - index * 7}%` }} />
      ))}
    </div>
  );
}

/** Empty. One line of explanation and the primary action (§13.5). */
export function Empty(props: {
  readonly title: string;
  readonly action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="state state--empty">
      <p className="state__title">{props.title}</p>
      {props.action}
    </div>
  );
}

/**
 * Error. Panel-level, with the problem title, a copyable traceId and a retry — and the rest of
 * the page stays usable (§13.5).
 *
 * A 403 renders as the no-permission state instead, because "you cannot see this" and "something
 * went wrong" are different messages and only one of them is worth retrying.
 */
export function ErrorPanel(props: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}): React.JSX.Element {
  const error = props.error;

  if (error instanceof BffError && error.isForbidden) {
    return (
      <NoPermission
        needed={(error.problem['requiredRole'] as string | undefined) ?? 'a role you do not have'}
      />
    );
  }

  const title =
    error instanceof BffError
      ? (error.problem.title ?? 'The request failed')
      : 'Something went wrong';
  const detail = error instanceof BffError ? error.problem.detail : undefined;
  const traceId = error instanceof BffError ? error.traceId : undefined;

  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{title}</p>
      {detail ? <p className="state__detail">{detail}</p> : null}
      {traceId ? (
        <p className="state__trace">
          Trace ID <code>{traceId}</code>{' '}
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => void navigator.clipboard?.writeText(traceId)}
          >
            Copy
          </button>
        </p>
      ) : null}
      {props.onRetry ? (
        <button type="button" className="btn" onClick={props.onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * No permission. Names the role needed and who administers it — and reveals no data (§13.5).
 *
 * A deep link to a forbidden route lands here rather than on a blank page, so the user learns
 * what to ask for instead of assuming the app is broken.
 */
export function NoPermission(props: { readonly needed: string }): React.JSX.Element {
  return (
    <div className="state state--forbidden" role="alert">
      <p className="state__title">You do not have access to this</p>
      <p className="state__detail">
        This needs the <strong>{props.needed}</strong> role. Your tenant administrator can grant
        it.
      </p>
    </div>
  );
}

/**
 * Conflict. §13.5 requires a three-way merge at component level on a 412.
 *
 * Not implemented: the merge view needs the component-level diff the BFF has yet to expose. Until
 * then this states plainly what happened and refuses to guess, because silently keeping one
 * author's edit and discarding the other's is the one outcome nobody wants.
 */
export function Conflict(props: { readonly onReload: () => void }): React.JSX.Element {
  return (
    <div className="state state--conflict" role="alert">
      <p className="state__title">Someone else changed this while you were editing</p>
      <p className="state__detail">
        Your edits have not been saved. The three-way merge view (TRD §13.5) is not built yet, so
        reload to see their version — copy anything you need to keep first.
      </p>
      <button type="button" className="btn" onClick={props.onReload}>
        Reload
      </button>
    </div>
  );
}
