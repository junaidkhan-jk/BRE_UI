import { useState } from 'react';

import { RULES, SIMULATION } from '../api/fixtures';
import { StatusPill } from '../components/StatusPill';
import { Loading } from '../components/ScreenState';

import './screens.css';

type RunState = 'idle' | 'running' | 'done';

/**
 * Simulator (wireframe 03, TRD §13.5 U10).
 *
 * Runs a rule set against sample or historical applications before it goes live.
 *
 * This screen is the reason a lender can change credit policy without finding out what it did
 * from next month's book. The outcome mix is shown per rule as well as in total, because a
 * headline that moves two points can hide one rule declining a whole segment.
 */
export function Simulator(): React.JSX.Element {
  const [state, setState] = useState<RunState>('idle');
  const [sampleSize, setSampleSize] = useState('2500');
  const [dataSource, setDataSource] = useState('synthetic');
  const [challenger, setChallenger] = useState('');

  const run = (): void => {
    setState('running');
    // Stands in for the BFF's streamed progress. A real run is a job, not a request.
    window.setTimeout(() => setState('done'), 600);
  };

  const total = SIMULATION.applications;
  const share = (n: number): string => `${((n / total) * 100).toFixed(1)}%`;

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Simulator</h1>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--primary" onClick={run}>
            {state === 'running' ? 'Running…' : 'Run simulation'}
          </button>
        </div>
      </header>

      <div className="grid grid--3">
        <label className="field">
          <span className="field__label">Policy / rule set</span>
          <select className="input">
            <option>MFI_JLG_CREDIT_UW v3 — 8 rules, released 14 Sep 2026</option>
            <option>MFI_JLG_CREDIT_UW v2 — 8 rules, released 22 Aug 2026</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">Data</span>
          <select
            className="input"
            value={dataSource}
            onChange={(event) => setDataSource(event.target.value)}
          >
            <option value="synthetic">Synthetic</option>
            <option value="historical">Historical applications</option>
            <option value="csv">Uploaded CSV</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">Sample size</span>
          <input
            className="input"
            type="number"
            min={1}
            value={sampleSize}
            onChange={(event) => setSampleSize(event.target.value)}
          />
        </label>
      </div>

      <label className="field field--wide">
        <span className="field__label">Champion / challenger (optional)</span>
        <select
          className="input"
          value={challenger}
          onChange={(event) => setChallenger(event.target.value)}
        >
          <option value="">Compare against nothing</option>
          <option value="v2">MFI_JLG_CREDIT_UW v2</option>
        </select>
      </label>

      {dataSource === 'historical' ? (
        <p className="notice">
          Historical applications carry real personal data. The simulator shows masked facts only;
          unmasking is an auditor action and is recorded.
        </p>
      ) : null}

      {state === 'running' ? <Loading rows={4} label="Running simulation" /> : null}

      {state === 'done' ? (
        <>
          <div className="grid grid--3 grid--kpi">
            <div className="kpi">
              <span className="kpi__label">Pass</span>
              <span className="kpi__value">{SIMULATION.pass}</span>
              <span className="kpi__sub">{share(SIMULATION.pass)}</span>
            </div>
            <div className="kpi kpi--dev">
              <span className="kpi__label">Deviation</span>
              <span className="kpi__value">{SIMULATION.deviation}</span>
              <span className="kpi__sub">{share(SIMULATION.deviation)}</span>
            </div>
            <div className="kpi kpi--fail">
              <span className="kpi__label">Fail</span>
              <span className="kpi__value">{SIMULATION.fail}</span>
              <span className="kpi__sub">{share(SIMULATION.fail)}</span>
            </div>
          </div>

          <table className="table table--tight">
            <caption className="sr-only">Outcome mix per rule</caption>
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Pass</th>
                <th scope="col">Deviation</th>
                <th scope="col">Fail</th>
                <th scope="col">Mix</th>
              </tr>
            </thead>
            <tbody>
              {SIMULATION.perRule.map((row) => {
                const rule = RULES.find((candidate) => candidate.code === row.code);
                return (
                  <tr key={row.code}>
                    <td>
                      <div className="cell__code">{row.code}</div>
                      <div className="cell__intent">{rule?.name}</div>
                    </td>
                    <td>{row.pass}</td>
                    <td>{row.deviation}</td>
                    <td>{row.fail}</td>
                    <td>
                      {/* A stacked bar, so one rule's shape is comparable with the next at a
                          glance — the numbers alone do not show that. */}
                      <div className="bar" role="img" aria-label={`${row.pass} pass, ${row.deviation} deviation, ${row.fail} fail`}>
                        <span className="bar__seg bar__seg--pass" style={{ width: share(row.pass) }} />
                        <span className="bar__seg bar__seg--dev" style={{ width: share(row.deviation) }} />
                        <span className="bar__seg bar__seg--fail" style={{ width: share(row.fail) }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="page__foot">
            <StatusPill outcome="PASS" label={`${SIMULATION.applications} applications evaluated`} />
          </p>
        </>
      ) : null}

      {state === 'idle' ? (
        <p className="notice notice--quiet">
          Choose a rule set and a data source, then run. Nothing is deployed by simulating.
        </p>
      ) : null}
    </section>
  );
}
