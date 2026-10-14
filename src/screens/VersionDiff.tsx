import { useEffect, useState } from 'react';

import {
  type Diff,
  type PolicySummary,
  type VersionSummary,
  diffVersions,
  listPolicies,
  listVersions,
} from '../api/runs';
import { usingFixtures } from '../api/fixtures';
import { Empty, Loading } from '../components/ScreenState';

import './screens.css';

/**
 * Compare two versions of a policy (TRD §13.5 U12's diff, M3-02, M5-04).
 *
 * **Two diffs, shown in this order, because a reviewer needs both and they answer different
 * questions.** The semantic diff is over the compiled policy, keyed by component code: it says
 * "rule MIN_AGE's check changed" regardless of where in the file that rule moved to. Reordering
 * rules, renaming an anchor or reflowing a block produces no semantic change at all — which is the
 * point, because a reviewer asked to approve a 400-line text diff that changes nothing will
 * approve the next one without reading it.
 *
 * The text diff is second and is over the PSF source, because the IR is a compilation target: a
 * comment an author wrote to explain a threshold does not survive into it, and that comment is
 * sometimes the most review-worthy part of the change.
 *
 * **"No semantic changes" is stated explicitly**, never left as an empty area. An empty panel and
 * a panel that failed to load look identical, and the difference matters when the question is
 * whether it is safe to approve.
 */
export function VersionDiff(): React.JSX.Element {
  const [policies, setPolicies] = useState<readonly PolicySummary[]>([]);
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [policyCode, setPolicyCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [diff, setDiff] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (usingFixtures) {
      return;
    }
    listPolicies()
      .then((found) => {
        setPolicies(found);
        if (found[0]) {
          setPolicyCode(found[0].policyCode);
        }
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, []);

  useEffect(() => {
    if (!policyCode || usingFixtures) {
      return;
    }
    listVersions(policyCode)
      .then((found) => {
        setVersions(found);
        // Newest against the one before it: the comparison a reviewer opens this screen for.
        setTo(found[0]?.version ?? '');
        setFrom(found[1]?.version ?? found[0]?.version ?? '');
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, [policyCode]);

  async function compare(): Promise<void> {
    setBusy(true);
    setError(null);
    setDiff(null);
    try {
      setDiff(await diffVersions(policyCode, Number(from), Number(to)));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const canCompare = Boolean(policyCode && from && to) && from !== to && !busy;

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Compare versions</h1>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void compare()}
            disabled={!canCompare}
          >
            {busy ? 'Comparing…' : 'Compare'}
          </button>
        </div>
      </header>

      {usingFixtures ? (
        <p className="run__note" role="status">
          No registry is connected, so there are no versions to compare. Start one with{' '}
          <code>./devstack/up.sh --registry</code>.
        </p>
      ) : null}

      <div className="grid grid--3">
        <label className="field">
          <span className="field__label">Policy</span>
          <select
            className="field__input"
            value={policyCode}
            onChange={(event) => setPolicyCode(event.target.value)}
          >
            {policies.length === 0 ? <option value="">No policies yet</option> : null}
            {policies.map((policy) => (
              <option key={policy.policyCode} value={policy.policyCode}>
                {policy.policyCode} — {policy.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">From version</span>
          <select className="field__input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {versions.length === 0 ? <option value="">None</option> : null}
            {versions.map((candidate) => (
              <option key={candidate.version} value={candidate.version}>
                v{candidate.version} · {candidate.status}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">To version</span>
          <select className="field__input" value={to} onChange={(e) => setTo(e.target.value)}>
            {versions.length === 0 ? <option value="">None</option> : null}
            {versions.map((candidate) => (
              <option key={candidate.version} value={candidate.version}>
                v{candidate.version} · {candidate.status}
              </option>
            ))}
          </select>
        </label>
      </div>

      {from === to && from !== '' ? (
        <p className="run__note">Pick two different versions.</p>
      ) : null}

      {error ? (
        <div className="run__error" role="alert">
          {error}
        </div>
      ) : null}

      {busy ? <Loading label="Comparing" rows={3} /> : null}

      {diff ? (
        <>
          <h2 className="diff__heading">
            What changed in the policy — v{diff.fromVersion} to v{diff.toVersion}
          </h2>
          {diff.semantic.length === 0 ? (
            <Empty
              title="No semantic changes — the two versions compile to the same policy."
              action={
                <p className="run__note">
                  Anything in the source diff below is formatting, comments or ordering, and
                  changes no decision.
                </p>
              }
            />
          ) : (
            <ul className="diff__list">
              {diff.semantic.map((change, index) => (
                <li key={`${change.subject}-${index}`} className="diff__change">
                  <span className={`diff__kind diff__kind--${change.kind.toLowerCase()}`}>
                    {change.kind}
                  </span>
                  <strong className="diff__subject">{change.subject}</strong>
                  {change.detail ? <span className="diff__detail">{change.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}

          <h2 className="diff__heading">Source</h2>
          {diff.textDiffSkipped ? (
            <p className="run__note">
              One of these versions has no saved source, or is too large to diff as text. The
              semantic diff above is complete either way.
            </p>
          ) : (
            <pre className="diff__text" aria-label="Source diff">
              {diff.unified.map((line, index) => (
                <span key={index} className={lineClass(line)}>
                  {line}
                  {'\n'}
                </span>
              ))}
            </pre>
          )}
        </>
      ) : null}
    </section>
  );
}

function lineClass(line: string): string {
  if (line.startsWith('+ ')) {
    return 'diff__line diff__line--added';
  }
  if (line.startsWith('- ')) {
    return 'diff__line diff__line--removed';
  }
  return 'diff__line';
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}
