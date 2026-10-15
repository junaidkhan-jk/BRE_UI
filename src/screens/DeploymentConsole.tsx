import { useCallback, useEffect, useState } from 'react';

import {
  type Deployment,
  approveDeployment,
  cancelDeployment,
  deploymentSchedule,
  listDeployments,
  requestDeployment,
  rollbackDeployment,
} from '../api/governance';
import { type PolicySummary, type VersionSummary, listPolicies, listVersions } from '../api/runs';
import { usingFixtures } from '../api/fixtures';
import { Empty, Loading } from '../components/ScreenState';
import { StatusPill } from '../components/StatusPill';

import './screens.css';

const ENVIRONMENTS = ['DEV', 'UAT', 'PROD'] as const;

/**
 * The deployment console (TRD §13.5 U13, M5-06).
 *
 * **Every endpoint behind this screen already existed.** Requesting, approving, scheduling,
 * cancelling and rolling back were all possible, and all only possible with `curl` — which means
 * the four-eyes control over what reaches production existed and nobody could exercise it. A
 * control a person cannot reach is a control in name.
 *
 * **Three things the screen is built to make obvious, because each is a decision a lender is held
 * to:**
 *
 * - **How many approvals an environment needs**, shown as a count against its requirement rather
 *   than as a status word. DEV needs none and PROD needs two, and the difference is the whole
 *   shape of the control.
 * - **That a future effective date means SCHEDULED, not ACTIVE.** A policy scheduled for Monday
 *   that went live on Friday decided every application in between under the wrong rules, so the
 *   date field says what it does.
 * - **That a rollback is a new deployment.** Nothing is edited in place; the rolled-back
 *   deployment stays on the list with its own status, because "what was serving at 14:30 last
 *   Tuesday" is a question that arrives from a regulator.
 *
 * **Not built:** the live pod-convergence view U13 also asks for — pods grouped by the bundle hash
 * they are serving. That needs pods to report what they adopted, which is M4's telemetry.
 */
export function DeploymentConsole(): React.JSX.Element {
  const [envCode, setEnvCode] = useState<string>('DEV');
  const [deployments, setDeployments] = useState<readonly Deployment[] | null>(null);
  const [policies, setPolicies] = useState<readonly PolicySummary[]>([]);
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [policyCode, setPolicyCode] = useState('');
  const [version, setVersion] = useState('');
  const [reason, setReason] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [expedited, setExpedited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState<readonly Deployment[] | null>(null);

  const refresh = useCallback(async () => {
    if (usingFixtures) {
      setDeployments([]);
      return;
    }
    setDeployments(await listDeployments(envCode));
  }, [envCode]);

  useEffect(() => {
    setDeployments(null);
    refresh().catch((caught: unknown) => {
      setError(messageOf(caught));
      setDeployments([]);
    });
  }, [envCode, refresh]);

  // Not scoped to envCode, and reloaded whenever the environment list is: the schedule is the one
  // view on this screen that is about every environment at once.
  useEffect(() => {
    if (usingFixtures) {
      setSchedule([]);
      return;
    }
    let live = true;
    deploymentSchedule()
      .then((due) => {
        if (live) setSchedule(due);
      })
      .catch(() => {
        if (live) setSchedule([]);
      });
    return () => {
      live = false;
    };
  }, [deployments]);

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
        // Only an APPROVED version has a signed bundle, and a pod will not serve anything else.
        const approved = found.filter((candidate) => candidate.status === 'APPROVED');
        setVersions(approved);
        setVersion(approved[0] ? String(approved[0].version) : '');
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, [policyCode]);

  async function act(what: string, run: () => Promise<Deployment>): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const deployment = await run();
      await refresh();
      setNote(`${what}: ${deployment.policyCode} is ${deployment.status}.`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const canRequest = Boolean(policyCode && version && reason) && !busy;

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Operations</p>
          <h1 className="page__title">Deployment console</h1>
        </div>
      </header>

      {usingFixtures ? (
        <p className="run__note" role="status">
          No registry is connected, so there is nothing to deploy. Start one with{' '}
          <code>./devstack/up.sh --registry</code>.
        </p>
      ) : null}

      <div className="tabs">
        {ENVIRONMENTS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={candidate === envCode ? 'tab tab--on' : 'tab'}
            onClick={() => setEnvCode(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>

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

      <h2 className="diff__heading">Request a deployment to {envCode}</h2>
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
                {policy.policyCode}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Approved version</span>
          <select
            className="field__input"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          >
            {versions.length === 0 ? <option value="">None approved</option> : null}
            {versions.map((candidate) => (
              <option key={candidate.version} value={candidate.version}>
                v{candidate.version}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Effective from (optional)</span>
          <input
            className="field__input"
            type="datetime-local"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            aria-describedby="effective-help"
          />
        </label>
      </div>

      <p className="run__note" id="effective-help">
        Leave the date blank to take effect as soon as it is approved. A{' '}
        <strong>future</strong> date means the deployment waits in SCHEDULED until then, even once
        fully approved &mdash; a policy scheduled for Monday that went live on Friday decided every
        application in between under the wrong rules.
      </p>

      <label className="field field--wide">
        <span className="field__label">Reason &mdash; recorded, and required</span>
        <input
          className="field__input"
          value={reason}
          placeholder="Quarterly threshold review, CRMC-2026-41"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <label className="field field--wide">
        <input
          type="checkbox"
          checked={expedited}
          onChange={(event) => setExpedited(event.target.checked)}
        />{' '}
        <span className="field__label">
          Expedited &mdash; an emergency change. Still two approvers, plus a mandatory
          post-implementation review.
        </span>
      </label>

      <button
        type="button"
        className="btn btn--primary"
        disabled={!canRequest}
        onClick={() =>
          void act('Requested', () =>
            requestDeployment({
              envCode,
              policyCode,
              version: Number(version),
              mode: 'CHAMPION',
              reason,
              expedited,
              ...(effectiveFrom
                ? { effectiveFrom: new Date(effectiveFrom).toISOString() }
                : {}),
            }),
          )
        }
      >
        Request
      </button>

      <Schedule schedule={schedule} />

      <h2 className="diff__heading">Deployments in {envCode}</h2>

      {deployments === null ? <Loading label="Reading deployments" /> : null}

      {deployments !== null && deployments.length === 0 && !usingFixtures ? (
        <Empty title={`Nothing has been deployed to ${envCode}.`} />
      ) : null}

      {deployments !== null && deployments.length > 0 ? (
        <div className="table__scroll">
          <table className="table table--tight">
            <thead>
              <tr>
                <th scope="col">Policy</th>
                <th scope="col">Mode</th>
                <th scope="col">Status</th>
                <th scope="col">Approvals</th>
                <th scope="col">Bundle</th>
                <th scope="col">Manifest</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {deployments.map((deployment) => (
                <tr key={deployment.deploymentId}>
                  <td>
                    <code>{deployment.policyCode}</code>
                  </td>
                  <td>{deployment.mode}</td>
                  <td>
                    <StatusPill status={deployment.status} />
                  </td>
                  <td>
                    {/* A count against its requirement, not a word: DEV needs none and PROD needs
                        two, and that difference is the shape of the control. */}
                    {deployment.approvals} of {deployment.approvalsRequired}
                  </td>
                  <td>
                    <code className="hash">{deployment.bundleHash.slice(7, 19)}</code>
                  </td>
                  <td>{deployment.manifestVersion ?? '—'}</td>
                  <td>
                    {deployment.status === 'PENDING_APPROVAL' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={busy}
                          onClick={() =>
                            void act('Approved', () =>
                              approveDeployment(deployment.deploymentId, reason || 'approved'),
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() =>
                            void act('Cancelled', () =>
                              cancelDeployment(deployment.deploymentId),
                            )
                          }
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}

                    {deployment.status === 'SCHEDULED' ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void act('Cancelled', () => cancelDeployment(deployment.deploymentId))
                        }
                      >
                        Cancel
                      </button>
                    ) : null}

                    {deployment.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void act('Rolled back', () =>
                            rollbackDeployment(
                              deployment.deploymentId,
                              reason || 'rolled back from the console',
                            ),
                          )
                        }
                      >
                        Roll back
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="run__note">
        An approver can be neither the version&rsquo;s author nor its reviewer nor the person who
        requested the deployment &mdash; three distinct people for a PROD change. A{' '}
        <strong>rollback is a new deployment</strong> pointing at the previous bundle, never an edit
        in place, so the deployment it replaced stays on this list with its own status. That is what
        makes &ldquo;what was serving at 14:30 last Tuesday&rdquo; answerable.
      </p>
    </section>
  );
}

/**
 * What is due to take effect, across every environment, grouped by day.
 *
 * **Why this is not a month grid.** A calendar's twenty-eight empty cells are twenty-eight cells of
 * nothing, and the thing a release manager needs to see is a collision: two credit-policy changes
 * landing the same morning in the same environment. Grouped by day, a collision is two rows under
 * one heading and is visible without counting. A month grid hides it in a cell.
 *
 * PENDING_APPROVAL rows sit here beside SCHEDULED ones, because a change dated for Monday that
 * still needs a second approver on Friday afternoon is the row that needs somebody to act — and it
 * is invisible on a list of what is already scheduled.
 */
function Schedule({
  schedule,
}: {
  schedule: readonly Deployment[] | null;
}): React.JSX.Element | null {
  if (schedule === null || schedule.length === 0) return null;

  const days = new Map<string, Deployment[]>();
  for (const deployment of schedule) {
    const day = deployment.effectiveFrom.slice(0, 10);
    const existing = days.get(day);
    if (existing) existing.push(deployment);
    else days.set(day, [deployment]);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="schedule">
      <h2 className="diff__heading">Due to take effect</h2>
      <p className="run__note">
        Every environment, soonest first &mdash; a view no single environment&rsquo;s list can give.
        Two changes under one heading and one environment is a collision: they will both be serving
        that morning, and the second supersedes the first.
      </p>
      {[...days].map(([day, due]) => {
        const collisions = new Set(
          due
            .map((deployment) => deployment.envCode)
            .filter((env, index, all) => all.indexOf(env) !== index),
        );
        return (
          <div className="schedule__day" key={day}>
            <h3 className="schedule__date">
              {day}
              {day < today ? (
                <span className="schedule__overdue"> &mdash; past due, not yet active</span>
              ) : null}
              {day === today ? <span className="schedule__today"> &mdash; today</span> : null}
            </h3>
            <ul className="schedule__list">
              {due.map((deployment) => (
                <li key={deployment.deploymentId}>
                  <strong>{deployment.envCode}</strong> <code>{deployment.policyCode}</code>{' '}
                  <StatusPill status={deployment.status} />
                  {deployment.status === 'PENDING_APPROVAL' ? (
                    <span className="schedule__warn">
                      {' '}
                      needs {deployment.approvalsRequired - deployment.approvals} more approval
                      {deployment.approvalsRequired - deployment.approvals === 1 ? '' : 's'} before
                      it can take effect
                    </span>
                  ) : null}
                  {collisions.has(deployment.envCode) ? (
                    <span className="schedule__warn"> &mdash; collides in {deployment.envCode}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}
