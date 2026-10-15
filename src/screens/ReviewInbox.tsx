import { useCallback, useEffect, useState } from 'react';

import { reviewVersion, submitVersion } from '../api/governance';
import {
  type PolicySummary,
  type VersionDetail,
  type VersionSummary,
  listPolicies,
  listVersions,
  readVersion,
} from '../api/runs';
import { useSession } from '../app/SessionContext';
import { usingFixtures } from '../api/fixtures';
import { Empty, Loading } from '../components/ScreenState';
import { StatusPill } from '../components/StatusPill';

import './screens.css';

interface Pending {
  readonly policyCode: string;
  readonly summary: VersionSummary;
  readonly detail: VersionDetail;
}

/**
 * The review inbox (TRD §13.5 U12, M5-06).
 *
 * **The evidence comes before the decision controls, deliberately.** A checker who has not seen
 * whether the tests passed and what the coverage was is not reviewing; they are clicking. So each
 * submission shows its change note, its committee reference, its test results and its coverage
 * above the Approve button, and the author list — all of it — beside them.
 *
 * **Approve is absent when you are one of the authors, not disabled.** Segregation of duties is
 * against <em>every</em> editor, not just the creator: a draft handed between two people must not
 * become reviewable by either. The server refuses it regardless and says who saved the draft.
 *
 * **What this screen does not do is pretend.** It replaced one driven by a hard-coded array of
 * three reviews with names and badge counts, which was honest scaffolding while there was no
 * backend and is the worst thing to leave once there is one — a reviewer who approves a fixture
 * learns that approving is a formality.
 */
export function ReviewInbox(): React.JSX.Element {
  const { session } = useSession();
  const [pending, setPending] = useState<readonly Pending[] | null>(null);
  const [selected, setSelected] = useState<Pending | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (usingFixtures) {
      setPending([]);
      return;
    }
    const policies: readonly PolicySummary[] = await listPolicies();
    const found: Pending[] = [];
    for (const policy of policies) {
      const versions = await listVersions(policy.policyCode);
      for (const summary of versions.filter((candidate) => candidate.status === 'IN_REVIEW')) {
        found.push({
          policyCode: policy.policyCode,
          summary,
          detail: await readVersion(policy.policyCode, summary.version),
        });
      }
    }
    setPending(found);
    setSelected(found[0] ?? null);
  }, []);

  useEffect(() => {
    setPending(null);
    refresh().catch((caught: unknown) => {
      setError(messageOf(caught));
      setPending([]);
    });
  }, [refresh]);

  async function decide(approve: boolean): Promise<void> {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await reviewVersion(selected.policyCode, selected.summary.version, approve, comment);
      setNote(
        approve
          ? `Approved ${selected.policyCode} v${selected.summary.version}. The bundle is built and signed.`
          : `Changes requested on ${selected.policyCode} v${selected.summary.version}; it is back in DRAFT.`,
      );
      setComment('');
      await refresh();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  // Every editor, not just the creator: a draft handed between two people has two authors and
  // neither may review it.
  const isOwnWork =
    selected != null && session != null && selected.summary.editors.includes(session.subject);

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Governance</p>
          <h1 className="page__title">Review inbox</h1>
        </div>
        <div className="page__actions">
          <span className="run__meta">
            {pending === null ? '' : `${pending.length} awaiting review`}
          </span>
        </div>
      </header>

      {usingFixtures ? (
        <p className="run__note" role="status">
          No registry is connected, so there is nothing awaiting review. Start one with{' '}
          <code>./devstack/up.sh --registry</code>.
        </p>
      ) : null}

      {error ? (
        <div className="run__error" role="alert">
          {error}
        </div>
      ) : null}
      {note ? (
        <div className="notice notice--quiet" role="status">
          {note}
        </div>
      ) : null}

      {pending === null ? <Loading label="Reading submissions" /> : null}

      {pending !== null && pending.length === 0 && !usingFixtures ? (
        <Empty title="Nothing is awaiting your review." />
      ) : null}

      {pending !== null && pending.length > 0 ? (
        <div className="queue">
          <ul className="queue__list">
            {pending.map((item) => (
              <li key={`${item.policyCode}-${item.summary.version}`}>
                <button
                  type="button"
                  className={
                    selected?.policyCode === item.policyCode &&
                    selected?.summary.version === item.summary.version
                      ? 'queue__item queue__item--on'
                      : 'queue__item'
                  }
                  onClick={() => setSelected(item)}
                >
                  <strong>{item.policyCode}</strong> v{item.summary.version}
                  <span className="queue__badges">
                    <StatusPill status={item.summary.status} />
                    {item.detail.coverage ? (
                      <span className="chip">{item.detail.coverage.overallPercent}% covered</span>
                    ) : null}
                  </span>
                  <span className="meta">
                    {item.summary.editors.join(', ')} &middot; round{' '}
                    {item.summary.submissionRound}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="queue__detail">
              <h2 className="diff__heading">
                {selected.policyCode} v{selected.summary.version}
              </h2>

              {/* Evidence first. A checker who has not seen whether the tests passed is clicking,
                  not reviewing. */}
              <div className="evidence">
                <p>
                  <strong>Why:</strong> {selected.summary.changeNote ?? '—'}
                </p>
                <p>
                  <strong>Mandate:</strong>{' '}
                  <code>{selected.summary.committeeReference ?? '—'}</code>
                </p>
                <p>
                  <strong>Tests:</strong> {selected.detail.tests.passed} of{' '}
                  {selected.detail.tests.total} pass
                  {selected.detail.coverage
                    ? `, covering ${selected.detail.coverage.overallPercent}% against this tenant's ${selected.detail.minCoveragePercent}% minimum`
                    : ''}
                </p>
                <p>
                  <strong>Static checks:</strong>{' '}
                  {selected.detail.findings.length === 0
                    ? 'clean'
                    : `${selected.detail.findings.length} finding(s), none an error — submission would have been refused otherwise`}
                </p>
                <p>
                  <strong>Authored by:</strong> {selected.summary.editors.join(', ')}
                </p>
              </div>

              {selected.detail.coverage &&
              selected.detail.coverage.uncoveredRuleStatuses.length > 0 ? (
                <p className="cov__uncovered">
                  Never reached by any test case:{' '}
                  {[
                    ...selected.detail.coverage.uncoveredRuleStatuses,
                    ...selected.detail.coverage.uncoveredRows,
                    ...selected.detail.coverage.uncoveredBins,
                  ]
                    .slice(0, 20)
                    .map((item) => (
                      <code key={item}>{item}</code>
                    ))}
                </p>
              ) : null}

              {selected.detail.findings.length > 0 ? (
                <ul className="run__list">
                  {selected.detail.findings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              ) : null}

              {isOwnWork ? (
                <p className="run__warn">
                  You saved this draft, so you cannot review it (00 &sect;3.3). Segregation of
                  duties is against every editor, not only the creator &mdash; a draft handed
                  between two people must not become reviewable by either.
                </p>
              ) : (
                <>
                  <label className="field field--wide">
                    <span className="field__label">Comment</span>
                    <input
                      className="field__input"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="What you checked, and what you are relying on"
                    />
                  </label>
                  <div className="page__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy}
                      onClick={() => void decide(true)}
                    >
                      Approve &mdash; builds and signs the bundle
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => void decide(false)}
                    >
                      Request changes
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Exposed so the editor screen can submit without a second copy of the request shape. */
export { submitVersion };

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}
