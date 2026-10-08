import { useState } from 'react';

import { RECENT_DECISIONS, SIMULATION, TRACE } from '../api/fixtures';
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
 */
export function DecisionTrace(): React.JSX.Element {
  const [traced, setTraced] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const total = SIMULATION.applications;
  const share = (n: number): string => `${((n / total) * 100).toFixed(1)}%`;

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
