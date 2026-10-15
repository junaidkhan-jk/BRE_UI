import { useEffect, useState } from 'react';

import {
  type PolicyIr,
  type PolicySummary,
  type RuleIr,
  type ScorecardIr,
  type TableIr,
  type VersionDetail,
  type VersionSummary,
  listPolicies,
  listVersions,
  readIr,
  readVersion,
} from '../api/runs';
import { usingFixtures } from '../api/fixtures';
import { Empty, Loading } from '../components/ScreenState';
import { FlowGraph } from '../components/FlowGraph';
import { StatusPill } from '../components/StatusPill';

import './screens.css';

/**
 * The compiled policy: its tables, scorecards and flow, with the diagnostics overlaid
 * (TRD §13.5 U3, U5, U6, U7 — M5-03).
 *
 * **Read, not write, and that is a decision rather than a shortcut.** U5 asks for a
 * spreadsheet-like grid, and the valuable half of that is the gap and overlap highlighting and the
 * row hit counts — not the typing. Editing here would mean generating PSF back from the grid, and
 * PSF is where an author's comments live: the sentence explaining why a threshold is 21 and not 18
 * does not survive a round trip through the IR. Authoring stays in the source; this is where you
 * see what the source compiled to and what the checks found in it.
 *
 * **Every diagnostic shown here is computed by something that already existed.** Gaps and overlaps
 * are CHK-001/002 from the static checks, which report witnesses — concrete input tuples that no
 * row covers. Row hit counts come from the coverage probe, which records which rows actually
 * FIRED rather than which merely matched, so a row that lost to a FIRST hit policy counts as
 * untested. Both are already enforced at submit; this screen is where an author reads them against
 * the grid instead of as a list of codes.
 */
export function PolicyStructure(): React.JSX.Element {
  const [policies, setPolicies] = useState<readonly PolicySummary[]>([]);
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [policyCode, setPolicyCode] = useState('');
  const [version, setVersion] = useState('');
  const [ir, setIr] = useState<PolicyIr | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        setVersion(found[0] ? String(found[0].version) : '');
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, [policyCode]);

  useEffect(() => {
    if (!policyCode || !version || usingFixtures) {
      setIr(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([readIr(policyCode, Number(version)), readVersion(policyCode, Number(version))])
      .then(([compiled, read]) => {
        setIr(compiled);
        setDetail(read);
      })
      .catch((caught: unknown) => {
        setError(messageOf(caught));
        setIr(null);
      })
      .finally(() => setLoading(false));
  }, [policyCode, version]);

  // The uncovered rows arrive as "TABLE#3 (label)". Indexed by table so each grid can mark its
  // own rows without re-parsing per row.
  const uncoveredRows = new Set((detail?.coverage?.uncoveredRows ?? []).map(rowKey));
  const findings = detail?.findings ?? [];

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Policy structure</h1>
        </div>
      </header>

      {usingFixtures ? (
        <p className="run__note" role="status">
          No registry is connected, so there is no compiled policy to show. Start one with{' '}
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
                {policy.policyCode}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Version</span>
          <select
            className="field__input"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          >
            {versions.length === 0 ? <option value="">No versions yet</option> : null}
            {versions.map((candidate) => (
              <option key={candidate.version} value={candidate.version}>
                v{candidate.version} · {candidate.status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="run__note">
        <strong>Read-only.</strong> Authoring is in the policy source, because the comment
        explaining why a threshold is what it is does not survive a round trip through the compiled
        form. What this adds is the half of a grid worth having: which rows no test has ever fired,
        and which gaps the static checks found.
      </p>

      {error ? (
        <div className="run__error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? <Loading label="Reading the compiled policy" rows={4} /> : null}

      {ir && !loading ? (
        <>
          {findings.length > 0 ? (
            <>
              <h2 className="diff__heading">Static checks</h2>
              <ul className="run__list">
                {findings.map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
            </>
          ) : null}

          <h2 className="diff__heading">Flow</h2>
          {(ir.flow?.stages ?? []).length === 0 ? (
            <Empty title="This version declares no flow." />
          ) : (
            <FlowGraph
              flow={ir.flow}
              uncoveredRuleStatuses={detail?.coverage?.uncoveredRuleStatuses ?? []}
            />
          )}

          <h2 className="diff__heading">Decision tables ({(ir.decisionTables ?? []).length})</h2>
          {(ir.decisionTables ?? []).map((table) => (
            <TableGrid key={table.code} table={table} uncovered={uncoveredRows} />
          ))}

          <h2 className="diff__heading">Scorecards ({(ir.scorecards ?? []).length})</h2>
          {(ir.scorecards ?? []).map((scorecard) => (
            <ScorecardView key={scorecard.code} scorecard={scorecard} />
          ))}

          <h2 className="diff__heading">Rules ({(ir.rules ?? []).length})</h2>
          <RuleTable rules={ir.rules ?? []} />
        </>
      ) : null}
    </section>
  );
}

/** One decision table as a grid, with each row marked covered or not. */
function TableGrid({
  table,
  uncovered,
}: {
  table: TableIr;
  uncovered: ReadonlySet<string>;
}): React.JSX.Element {
  const inputs = table.inputs ?? [];
  const outputs = table.outputs ?? [];
  const rows = table.rows ?? [];

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <p className="panel__title">
            <code>{table.code}</code> {table.name ? `— ${table.name}` : ''}
          </p>
          <p className="panel__subtitle">
            {table.scope ?? 'APPLICATION'} &middot; hit policy{' '}
            <strong>{table.hitPolicy?.kind ?? 'FIRST'}</strong>
            {table.hitPolicy?.op ? ` ${table.hitPolicy.op}` : ''} &middot; {rows.length} row
            {rows.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="table__scroll">
        <table className="table table--tight">
          <thead>
            <tr>
              <th scope="col">#</th>
              {inputs.map((input) => (
                <th key={input.name} scope="col">
                  {input.name}
                  <span className="cell__intent">
                    <code>{input.expr}</code>
                  </span>
                </th>
              ))}
              <th scope="col">Status</th>
              <th scope="col">Reason</th>
              {outputs.map((output) => (
                <th key={output.name} scope="col">
                  {output.name}
                </th>
              ))}
              <th scope="col">Tested</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isUncovered = uncovered.has(`${table.code}#${index}`);
              return (
                <tr key={index} className={isUncovered ? 'row--sub' : undefined}>
                  <td>
                    {index}
                    {row.label ? <span className="meta"> {row.label}</span> : null}
                  </td>
                  {(row.when ?? []).map((cell, at) => (
                    <td key={at}>
                      <code>{cell}</code>
                    </td>
                  ))}
                  <td>
                    {row.then?.status ? <StatusPill status={row.then.status} /> : <span>—</span>}
                  </td>
                  <td>{row.then?.reasonCode ? <code>{row.then.reasonCode}</code> : '—'}</td>
                  {outputs.map((output) => (
                    <td key={output.name}>
                      <code>{row.then?.outputs?.[output.name] ?? '—'}</code>
                    </td>
                  ))}
                  <td>
                    {/* Fired, not merely matched: a row that matched and lost to a FIRST hit
                        policy has never had its effect exercised. */}
                    {isUncovered ? (
                      <span className="chip">never fired</span>
                    ) : (
                      <span className="meta">fired</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One scorecard: its characteristics, bins and points. */
function ScorecardView({ scorecard }: { scorecard: ScorecardIr }): React.JSX.Element {
  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <p className="panel__title">
            <code>{scorecard.code}</code> {scorecard.name ? `— ${scorecard.name}` : ''}
          </p>
          <p className="panel__subtitle">
            base {scorecard.baseScore ?? 0} &middot; top {scorecard.adverseReasons ?? 0} adverse
            reasons
          </p>
        </div>
      </div>
      {(scorecard.characteristics ?? []).map((characteristic) => {
        const best = Math.max(...(characteristic.bins ?? []).map((bin) => bin.points), 0);
        return (
          <div key={characteristic.name}>
            <p className="panel__meta">
              <strong>{characteristic.name}</strong> <code>{characteristic.expr}</code>
            </p>
            <div className="table__scroll">
              <table className="table table--tight">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Points</th>
                    <th scope="col">Shortfall</th>
                    <th scope="col">Adverse reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(characteristic.bins ?? []).map((bin, index) => (
                    <tr key={index}>
                      <td>
                        <code>{bin.when}</code>
                      </td>
                      <td>{bin.points}</td>
                      <td>
                        {/* The shortfall against the best bin is what orders the adverse reasons:
                            the largest gap is the reason an applicant is told first. */}
                        {best - bin.points === 0 ? '—' : `−${best - bin.points}`}
                      </td>
                      <td>
                        <code>{bin.reasonCode ?? characteristic.reasonCode ?? '—'}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Every rule, with what it checks and what happens when it fails or cannot be evaluated. */
function RuleTable({ rules }: { rules: readonly RuleIr[] }): React.JSX.Element {
  return (
    <div className="table__scroll">
      <table className="table table--tight">
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Scope</th>
            <th scope="col">Check</th>
            <th scope="col">On fail</th>
            <th scope="col">When a fact is missing</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.code}>
              <td>
                <code>{rule.code}</code>
                {rule.when ? (
                  <span className="cell__intent">
                    only when <code>{rule.when}</code>
                  </span>
                ) : null}
              </td>
              <td>{rule.scope ?? 'APPLICATION'}</td>
              <td>
                <code className="code">{rule.check}</code>
              </td>
              <td>
                {rule.onFail?.status ? <StatusPill status={rule.onFail.status} /> : '—'}{' '}
                <code>{rule.onFail?.reasonCode ?? ''}</code>
              </td>
              <td>
                {/* The branch authors forget and outages exercise. REFER maps to DATA_MISSING at
                    runtime, which is a different status from a policy choosing to refer. */}
                <code>{rule.onMissing?.policy ?? 'REFER'}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "PRICING#3 (tier A)" -> "PRICING#3". */
function rowKey(uncovered: string): string {
  const space = uncovered.indexOf(' ');
  return space < 0 ? uncovered : uncovered.slice(0, space);
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}
