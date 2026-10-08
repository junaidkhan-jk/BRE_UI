import { useState } from 'react';

import { REVIEWS } from '../api/fixtures';
import { StatusPill } from '../components/StatusPill';
import { Empty } from '../components/ScreenState';

import './screens.css';

type Verdict = 'approved' | 'rejected';

/**
 * Approval Queue (wireframe 04, TRD §13.5 U12).
 *
 * Checkers review submitted rule changes with evidence, then approve or reject.
 *
 * Two rules here are maker-checker, not UI preference:
 *
 *  - <b>Approve is hidden for anyone who edited the version</b> (§13.5 U12). Self-approval is the
 *    whole thing maker-checker exists to prevent, so the button is absent rather than disabled —
 *    a disabled button invites someone to find the way around it.
 *  - <b>The evidence badges are shown before the decision controls</b>, because a checker who has
 *    not seen whether the tests passed is not reviewing, they are clicking.
 */
export function ApprovalQueue(): React.JSX.Element {
  const [selected, setSelected] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [comment, setComment] = useState('');

  // Stands in for the signed-in user; the BFF supplies this from the session.
  const currentUser = 'Priya N.';

  const item = REVIEWS[selected];
  if (!item) {
    return <Empty title="Nothing is awaiting your review." />;
  }

  const verdict = verdicts[item.code];
  const isOwnWork = item.author === currentUser;
  const testsAllPassed = item.testsPassed === item.testsTotal;

  const decide = (next: Verdict): void => {
    setVerdicts((previous) => ({ ...previous, [item.code]: next }));
    setComment('');
  };

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Approval Queue</h1>
        </div>
      </header>

      <div className="queue">
        <ul className="queue__list">
          {REVIEWS.map((review, index) => (
            <li key={review.code}>
              <button
                type="button"
                className={index === selected ? 'queue__item queue__item--on' : 'queue__item'}
                onClick={() => setSelected(index)}
                aria-current={index === selected}
              >
                <span className="cell__code">{review.code}</span>
                <span className="cell__name">{review.name}</span>
                <span className="panel__meta">
                  {review.author} · {review.submittedAt}
                </span>
                <span className="queue__badges">
                  <StatusPill
                    outcome={review.testsPassed === review.testsTotal ? 'PASS' : 'DEVIATION'}
                    label={`${review.testsPassed}/${review.testsTotal} tests`}
                  />
                  {verdicts[review.code] ? (
                    <StatusPill
                      outcome={verdicts[review.code] === 'approved' ? 'PASS' : 'FAIL'}
                      label={verdicts[review.code] === 'approved' ? 'Approved' : 'Rejected'}
                    />
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="queue__detail">
          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">
                {item.code} · {item.name}
              </span>
              <span className="panel__meta">
                v{item.fromVersion || '—'} → v{item.toVersion} · {item.category}
              </span>
            </div>

            {/* Evidence first, decision second. */}
            <div className="evidence">
              <StatusPill
                outcome={testsAllPassed ? 'PASS' : 'DEVIATION'}
                label={`Tests ${item.testsPassed}/${item.testsTotal}`}
              />
              <StatusPill
                outcome={item.simulated ? 'PASS' : 'DATA_MISSING'}
                label={item.simulated ? 'Simulated' : 'Not simulated'}
              />
            </div>

            {!item.simulated ? (
              <p className="notice">
                This change has not been simulated. Approving without a simulation means its effect
                on the book is unknown.
              </p>
            ) : null}

            <h2 className="panel__subtitle">Change summary</h2>
            <p className="intent">{item.changeSummary}</p>

            <h2 className="panel__subtitle">Rule diff</h2>
            <pre className="code code--diff">
              <span className="diff diff--out">- check  foirRatio &lt;= 0.40</span>
              {'\n'}
              <span className="diff diff--in">+ check  foirRatio &lt;= 0.45</span>
              {'\n'}
              <span className="diff diff--in">
                + when   member.mfiCycleNumber &gt;= 2
              </span>
            </pre>
          </div>

          <div className="panel">
            <h2 className="panel__subtitle">Decision</h2>
            {verdict ? (
              <p className="notice notice--quiet">
                You {verdict === 'approved' ? 'approved' : 'rejected'} this change.{' '}
                {verdict === 'approved'
                  ? 'It is queued for release.'
                  : 'The author has been notified.'}
              </p>
            ) : (
              <>
                <label className="field field--wide">
                  <span className="field__label">Comment for the author</span>
                  <textarea
                    className="input input--area"
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
                <div className="page__actions">
                  {isOwnWork ? (
                    <p className="notice">
                      You submitted this change, so you cannot approve it. Another checker must
                      review it.
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => decide('approved')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => decide('rejected')}
                        disabled={comment.trim().length === 0}
                        title={
                          comment.trim().length === 0
                            ? 'A rejection needs a comment, so the author knows what to change'
                            : undefined
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
