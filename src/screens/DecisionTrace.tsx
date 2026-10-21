import { useState } from 'react';

import { type Explanation, explainDecision } from '../api/decisions';
import { RECENT_DECISIONS, SIMULATION, TRACE, usingFixtures } from '../api/fixtures';
import { RunError } from '../api/runs';
import { Loading } from '../components/ScreenState';
import { StatusPill } from '../components/StatusPill';

import './screens.css';

/**
 * Decision Trace (wireframe 05, TRD §13.5 U14 + U15).
 *
 * Monitors today's decisions and explains any single one, rule by rule.
 *
 * The trace is the product's regulatory spine: a lender asked why an application was declined has
 * to be able to answer, and D7 answers it by <b>replaying the stored facts against the stored
 * bundle</b> rather than by keeping a narrative per rule. That is why the header shows the policy
 * version and the bundle hash — they are what the explanation is pinned to, and without them a
 * trace is an assertion rather than evidence.
 *
 * Facts are shown masked. Unmasking is an auditor action, needs a recorded reason, and is not on
 * this screen.
 *
 * **Two modes, and the difference is deliberate.** With fixtures the screen shows a monitoring
 * view — today's volume, deviation and fail rates, a recent-decision list — because that is the
 * wireframe. Against a real registry (M5-08) it shows **lookup only**: there is no endpoint that
 * lists decisions or aggregates a day's outcomes, so those tiles would have nothing behind them.
 * Rendering a fixture's "Decisions today: 1,284" against a live installation is exactly the
 * mistake the e2e suite has a test for — sample data that looks like real data is how a demo gets
 * mistaken for a working system — so in live mode they are not rendered at all.
 */
export function DecisionTrace(): React.JSX.Element {
  const [traced, setTraced] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [looking, setLooking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const total = SIMULATION.applications;
  const share = (n: number): string => `${((n / total) * 100).toFixed(1)}%`;

  async function lookUp(decisionId: string): Promise<void> {
    setLooking(true);
    setFailure(null);
    setExplanation(null);
    try {
      setExplanation(await explainDecision(decisionId));
    } catch (error) {
      // The message as the service gave it, including its reason code. A 409 here means something
      // specific and actionable — the facts were not stored, or the keys that sealed them are gone
      // — and replacing it with "could not load" would send somebody to the wrong place.
      setFailure(
        error instanceof RunError ? error.message : 'The decision could not be explained.',
      );
    } finally {
      setLooking(false);
    }
  }

  if (!usingFixtures) {
    return (
      <section>
        <header className="page__head">
          <div>
            <p className="page__crumb">Workspace</p>
            <h1 className="page__title">Decision Trace</h1>
          </div>
          <div className="page__actions">
            <input
              className="input"
              type="search"
              placeholder="Decision ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Decision ID"
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void lookUp(query.trim())}
              disabled={looking || query.trim().length === 0}
            >
              Explain
            </button>
          </div>
        </header>

        <p className="lead">
          A decision is explained by <b>replaying its stored facts against its stored bundle</b>
          {' '}
          (D7), then comparing with what was recorded. Facts are masked (§9.4); there is no unmask
          path on this screen.
        </p>

        {looking ? <Loading label="Replaying the decision" /> : null}
        {/* run__error, the style the audit screen and the run panel already use. A new
            panel--warn class would have rendered as an ordinary panel until somebody noticed the
            CSS was never written — and the one alert on this screen that must not look ordinary is
            "this replay does not reproduce the record". */}
        {failure ? (
          <div className="run__error" role="alert">
            {failure}
          </div>
        ) : null}

        {explanation ? (
          <>
            <div className="panel">
              <div className="trace__summary">
                <StatusPill decision={explanation.decision} />
                {/* The load-bearing fact on this screen. A replay that does NOT reproduce the
                    record means one of three serious things, and showing the replayed answer as
                    if it were the decision would leave what a borrower was told and what the
                    audit trail says permanently out of step. */}
                <StatusPill
                  outcome={explanation.matched ? 'PASS' : 'FAIL'}
                  label={
                    explanation.matched
                      ? 'Replay reproduces the record'
                      : 'REPLAY DOES NOT REPRODUCE THE RECORD'
                  }
                />
              </div>
              <dl className="meta">
                <dt>Decision ID</dt>
                <dd>
                  <code className="hash">{explanation.decisionId}</code>
                </dd>
                <dt>Bundle hash</dt>
                <dd>
                  <code className="hash">{explanation.bundleHash}</code>
                </dd>
              </dl>
            </div>

            {explanation.mismatches.length > 0 ? (
              <div className="run__error" role="alert">
                <b>Why the replay differs</b>
                <ul>
                  {explanation.mismatches.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <ol className="timeline">
              {explanation.steps.map((step) => (
                <li key={step} className="timeline__item">
                  <div className="timeline__head">
                    <span className="cell__code">{step}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="panel">
              <h2 className="panel__title">Facts, masked (§9.4)</h2>
              {explanation.facts ? (
                <pre className="code">{JSON.stringify(explanation.facts, null, 2)}</pre>
              ) : (
                <p className="panel__meta">
                  No fact snapshot was stored for this decision, so there is nothing to show.
                  Snapshots are off by default because they are the applicant&rsquo;s personal
                  data.
                </p>
              )}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  if (traced) {
    return (
      <section>
        <header className="page__head">
          <div>
            <p className="page__crumb">Workspace · Decision Trace</p>
            <h1 className="page__title">{TRACE.applicationRef}</h1>
          </div>
          <div className="page__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setTraced(null)}>
              Clear
            </button>
          </div>
        </header>

        <div className="panel">
          <div className="trace__summary">
            <StatusPill decision={TRACE.decision} />
            <StatusPill
              outcome={TRACE.stpEligible ? 'PASS' : 'DEVIATION'}
              label={TRACE.stpEligible ? 'Straight-through' : 'Not straight-through'}
            />
            <span className="panel__meta">asOf {TRACE.asOf}</span>
          </div>
          {/* The anchors a replay pins to. A trace without them cannot be proved. */}
          <dl className="meta">
            <dt>Policy</dt>
            <dd>
              {TRACE.policyCode} v{TRACE.policyVersion}
            </dd>
            <dt>Bundle hash</dt>
            <dd>
              <code className="hash">{TRACE.bundleHash}</code>
            </dd>
            <dt>Engine</dt>
            <dd>{TRACE.engineVersion}</dd>
            <dt>Decision ID</dt>
            <dd>
              <code className="hash">{TRACE.decisionId}</code>
            </dd>
          </dl>
        </div>

        <ol className="timeline">
          {TRACE.steps.map((step) => (
            <li key={step.ref} className="timeline__item">
              <div className="timeline__head">
                <span className="cell__code">{step.ref}</span>
                <StatusPill outcome={step.status} />
                {step.effectiveStatus !== step.status ? (
                  <StatusPill
                    outcome={step.effectiveStatus}
                    label={`Effective ${step.effectiveStatus}`}
                  />
                ) : null}
                {step.annotation ? (
                  <StatusPill outcome="PASS" label={step.annotation.replaceAll('_', ' ')} />
                ) : null}
              </div>
              <p className="cell__name">{step.name}</p>
              {step.firedCondition ? <p className="intent">{step.firedCondition}</p> : null}
              {step.reasonCode ? (
                <p className="panel__meta">Reason {step.reasonCode}</p>
              ) : null}
              {step.requiredLevel ? (
                <p className="panel__meta">Requires approval at {step.requiredLevel}</p>
              ) : null}
              {step.inputs ? (
                <table className="table table--tight">
                  <caption className="sr-only">Inputs to {step.ref}</caption>
                  <tbody>
                    {Object.entries(step.inputs).map(([path, value]) => (
                      <tr key={path}>
                        <td>
                          <code>{path}</code>
                        </td>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Decision Trace</h1>
        </div>
        <div className="page__actions">
          <input
            className="input"
            type="search"
            placeholder="Application ID, borrower or loan ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find a decision"
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setTraced(TRACE.decisionId)}
            disabled={query.trim().length === 0}
          >
            Trace
          </button>
        </div>
      </header>

      <div className="grid grid--3 grid--kpi">
        <div className="kpi">
          <span className="kpi__label">Decisions today</span>
          <span className="kpi__value">{total}</span>
        </div>
        <div className="kpi kpi--dev">
          <span className="kpi__label">Deviation rate</span>
          <span className="kpi__value">{share(SIMULATION.deviation)}</span>
        </div>
        <div className="kpi kpi--fail">
          <span className="kpi__label">Fail rate</span>
          <span className="kpi__value">{share(SIMULATION.fail)}</span>
        </div>
      </div>

      <table className="table">
        <caption className="sr-only">Recent decisions</caption>
        <thead>
          <tr>
            <th scope="col">Application</th>
            <th scope="col">Decision</th>
            <th scope="col">At</th>
            <th scope="col">Latency</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {RECENT_DECISIONS.map((decision) => (
            <tr key={decision.decisionId}>
              <td>
                <div className="cell__name">{decision.applicationRef}</div>
                <div className="cell__intent">
                  <code className="hash">{decision.decisionId}</code>
                </div>
              </td>
              <td>
                <StatusPill decision={decision.decision} />
              </td>
              <td>{decision.decidedAt}</td>
              <td>{decision.latencyMs} ms</td>
              <td>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => setTraced(decision.decisionId)}
                >
                  Trace
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
