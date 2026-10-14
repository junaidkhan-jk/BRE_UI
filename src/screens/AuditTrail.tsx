import { useEffect, useState } from 'react';

import {
  type AuditEntry,
  type AuditFilter,
  type Verification,
  listAudit,
  verifyAudit,
} from '../api/audit';
import { usingFixtures } from '../api/fixtures';
import { Empty, Loading } from '../components/ScreenState';

import './screens.css';

/**
 * The audit trail (TRD §13.5 U16, FR-AUD-005, M3-10).
 *
 * **Why the verification is at the top and not buried in a tools menu.** An audit log's value is
 * entirely in whether it can be shown to be untampered. The registry recomputes every entry's hash
 * from the one before it on each call — it does not read a stored "valid" flag, because a flag is
 * what somebody tampering would set — so this banner is a live answer rather than a reassurance.
 * A broken link or a missing sequence number is named with its position.
 *
 * **The head hash is displayed in full.** It is the value to record somewhere outside this
 * database — a ticket, a signed email, a notary — if the chain is ever to be shown untampered to
 * someone who does not trust the database it lives in. Truncating it would make that impossible
 * while looking tidier.
 *
 * **Details are rendered as data, not prose.** Each entry's detail is a JSON object written by the
 * service that made the change, and §9.6 forbids it from containing fact values. Showing it raw
 * means a reader sees exactly what was recorded, including a field this screen has never heard of.
 */
export function AuditTrail(): React.JSX.Element {
  const [entries, setEntries] = useState<readonly AuditEntry[] | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (usingFixtures) {
      setEntries([]);
      return;
    }
    verifyAudit()
      .then(setVerification)
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, []);

  useEffect(() => {
    if (usingFixtures) {
      return;
    }
    setEntries(null);
    // Built by assignment rather than with `|| undefined`, because exactOptionalPropertyTypes
    // distinguishes an absent property from one set to undefined, and the filter means "no
    // filter" by absence.
    const filter: AuditFilter = { limit: 200 };
    if (action) {
      filter.action = action;
    }
    if (actor) {
      filter.actor = actor;
    }
    listAudit(filter)
      .then(setEntries)
      .catch((caught: unknown) => {
        setError(messageOf(caught));
        setEntries([]);
      });
  }, [action, actor]);

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Governance</p>
          <h1 className="page__title">Audit trail</h1>
        </div>
      </header>

      {usingFixtures ? (
        <p className="run__note" role="status">
          No registry is connected, so there is no trail to read. Start one with{' '}
          <code>./devstack/up.sh --registry</code>.
        </p>
      ) : null}

      {verification ? (
        <div
          className={verification.intact ? 'audit__chain audit__chain--ok' : 'audit__chain audit__chain--broken'}
          role="status"
        >
          {verification.intact ? (
            <>
              <strong>Chain intact.</strong> {verification.entries} entries, every hash recomputed
              from the one before it, no gaps in the sequence.
            </>
          ) : (
            <>
              <strong>Chain broken.</strong>{' '}
              {verification.firstBrokenSeq !== undefined
                ? `Entry ${verification.firstBrokenSeq} does not follow from its predecessor.`
                : null}{' '}
              {verification.firstGapAfterSeq !== undefined
                ? `A sequence number is missing after entry ${verification.firstGapAfterSeq}.`
                : null}{' '}
              This is a finding to escalate, not a display problem.
            </>
          )}
          {verification.headHash ? (
            <p className="audit__head">
              Head hash <code>{verification.headHash}</code> — record this outside the database if
              the chain must later be shown untampered.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid--3">
        <label className="field">
          <span className="field__label">Action</span>
          <select
            className="field__input"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="">Everything</option>
            <option value="POLICY_VERSION">Policy versions</option>
            <option value="DEPLOYMENT">Deployments</option>
            <option value="USER">User administration</option>
            <option value="TENANT">Tenant settings</option>
            <option value="AUTH">Sign-in</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">Actor</span>
          <input
            className="field__input"
            value={actor}
            placeholder="Anyone"
            onChange={(event) => setActor(event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="run__error" role="alert">
          {error}
        </div>
      ) : null}

      {entries === null ? <Loading label="Reading the audit trail" /> : null}

      {entries !== null && entries.length === 0 && !error ? (
        <Empty title="No entries match." />
      ) : null}

      {entries !== null && entries.length > 0 ? (
        <div className="table__scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">Subject</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.seq}>
                  <td className="audit__seq">{entry.seq}</td>
                  <td>{entry.occurredAt.replace('T', ' ').slice(0, 19)}</td>
                  <td>
                    {entry.actor}
                    {entry.actorType !== 'USER' ? (
                      <span className="audit__kind"> {entry.actorType.toLowerCase()}</span>
                    ) : null}
                  </td>
                  <td>
                    <code>{entry.action}</code>
                  </td>
                  <td>
                    {entry.subjectKind} <code>{entry.subjectKey}</code>
                  </td>
                  <td>
                    <code className="audit__detail">{JSON.stringify(entry.detail)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}
