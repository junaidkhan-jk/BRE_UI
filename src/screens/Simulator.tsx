import { useEffect, useState } from 'react';

import {
  type PolicySummary,
  type RunResult,
  type VersionDetail,
  type VersionSummary,
  RunError,
  listPolicies,
  listVersions,
  readVersion,
  runPolicy,
} from '../api/runs';
import { usingFixtures } from '../api/fixtures';
import { StatusPill } from '../components/StatusPill';

import './screens.css';

/**
 * Run a policy against a fact snapshot (TRD §13.5 U10, M3-04).
 *
 * **This runs the real engine against the real version.** Pick a policy, pick a version — a draft
 * is fine and is the normal case — paste a facts document, give it a business date, and the
 * registry evaluates it with the tenant's resolved parameters and the same `FlowEvaluator` the
 * decision service uses. Nothing is deployed, approved or persisted.
 *
 * It replaced a screen that showed a hard-coded outcome mix after a 600 ms `setTimeout`. That was
 * honest scaffolding while there was no backend, and it is the worst thing to leave in place once
 * there is one: a simulator that always says the same thing is a simulator somebody will trust.
 *
 * **The business date is a required field, not a default.** The same facts on two dates are two
 * different decisions — an applicant's age moves, a group's tenure moves, a delinquency window
 * slides — so the screen makes the author state which date they mean. The server refuses a run
 * without one.
 *
 * **The coverage panel answers a different question from the run.** A run says what this policy
 * does to this applicant; coverage says how much of the policy the version's stored test cases
 * have ever exercised, and which rule branches, decision-table rows and scorecard bins they have
 * never reached (FR-TEST-003). Both belong here because an author iterating on a rule asks them in
 * the same sitting — and because the uncovered list is the only place the submit gate's refusal is
 * explained before it happens.
 *
 * **What this screen is not:** a portfolio back-test. Running a policy over thousands of historical
 * applications to see an outcome mix shift is a job, not a request, and it needs stored decisions
 * to replay against (M4). One applicant at a time is what an author iterating on a rule actually
 * does, and it is what this does well.
 */
export function Simulator(): React.JSX.Element {
  const [policies, setPolicies] = useState<readonly PolicySummary[]>([]);
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [policyCode, setPolicyCode] = useState('');
  const [version, setVersion] = useState('');
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [facts, setFacts] = useState(SAMPLE_FACTS);
  const [result, setResult] = useState<RunResult | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (usingFixtures) {
      return;
    }
    listPolicies()
      .then((found) => {
        setPolicies(found);
        const first = found[0];
        if (first && !policyCode) {
          setPolicyCode(first.policyCode);
        }
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
    // policyCode is deliberately not a dependency: this loads the list once, and selecting a
    // policy must not re-fetch it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!policyCode || usingFixtures) {
      return;
    }
    listVersions(policyCode)
      .then((found) => {
        setVersions(found);
        setVersion(found[0]?.version ?? '');
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, [policyCode]);

  useEffect(() => {
    if (!policyCode || !version || usingFixtures) {
      setDetail(null);
      return;
    }
    readVersion(policyCode, Number(version))
      // A version whose detail cannot be read is not worth an error banner over the run form: the
      // run itself still works, and the coverage panel simply does not appear.
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [policyCode, version]);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(facts);
      } catch (badJson) {
        // Caught here rather than sent: a malformed body would come back as a 400 from the HTTP
        // layer with a message about parsing, and the author would have to work out that it was
        // their own textarea. Saying which line is wrong is the whole job of this branch.
        throw new RunError(0, `The facts are not valid JSON — ${(badJson as Error).message}`);
      }
      setResult(await runPolicy(policyCode, Number(version), parsed, asOf));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const canRun = Boolean(policyCode && version && asOf) && !busy;

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Run a policy</h1>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={!canRun}>
            {busy ? 'Running…' : 'Run'}
          </button>
        </div>
      </header>

      {usingFixtures ? (
        // Deliberately does not repeat the words the shell's banner already carries. It did, and
        // the end-to-end test that asserts the banner appears on every screen started failing on
        // this one for a strict-mode multiple-match — two elements saying the same thing, which is
        // also the reason not to.
        <p className="run__note" role="status">
          No registry is connected, so there is nothing to run. Start one with{' '}
          <code>./devstack/up.sh --registry</code> and rebuild with{' '}
          <code>VITE_USE_FIXTURES=false VITE_REGISTRY_URL=http://127.0.0.1:8081</code>.
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

        <label className="field">
          <span className="field__label">Business date (asOf)</span>
          <input
            className="field__input"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            aria-describedby="asof-help"
          />
        </label>
      </div>

      <p className="run__note" id="asof-help">
        The business date is part of the decision, not a formality: an applicant&rsquo;s age, a
        group&rsquo;s tenure and a delinquency window all move with it.
      </p>

      <label className="field">
        <span className="field__label">Facts</span>
        <textarea
          className="run__facts"
          rows={14}
          spellCheck={false}
          value={facts}
          onChange={(event) => setFacts(event.target.value)}
          aria-describedby="facts-help"
        />
      </label>
      <p className="run__note" id="facts-help">
        A fact snapshot as the Decision API takes it. Paths are checked against the published fact
        schema and anything unrecognised is reported below — a mistyped path reads as a missing
        fact, which the engine handles correctly and silently, so it is worth being told.
      </p>

      {error ? (
        <div className="run__error" role="alert">
          {error}
        </div>
      ) : null}

      {detail?.coverage ? (
        <CoveragePanel detail={detail} coverage={detail.coverage} />
      ) : null}

      {result ? <RunOutcome result={result} /> : null}
    </section>
  );
}

/**
 * What the version's stored test cases exercise (FR-TEST-003, AC-TEST-003).
 *
 * The uncovered items are listed by name rather than counted, because a count tells an author they
 * have a problem and a name tells them where it is. The three kinds are shown separately as well
 * as pooled: a policy can be at 85% overall while every row of one decision table is untested, and
 * the pooled figure alone would hide that.
 */
function CoveragePanel({
  detail,
  coverage,
}: {
  detail: VersionDetail;
  coverage: NonNullable<VersionDetail['coverage']>;
}): React.JSX.Element {
  const under = coverage.overallPercent < detail.minCoveragePercent;
  const uncovered = [
    ...coverage.uncoveredRuleStatuses,
    ...coverage.uncoveredRows,
    ...coverage.uncoveredBins,
  ];

  return (
    <div className="cov">
      <div className="cov__head">
        <span className={under ? 'cov__figure cov__figure--under' : 'cov__figure'}>
          {coverage.overallPercent}%
        </span>
        <span className="run__meta">
          test coverage of v{detail.version} · this tenant requires {detail.minCoveragePercent}% to
          submit · {detail.tests.passed}/{detail.tests.total} test cases pass
        </span>
      </div>

      <div className={under ? 'cov__bar cov__bar--under' : 'cov__bar'}>
        <span style={{ width: `${Math.min(100, coverage.overallPercent)}%` }} />
      </div>

      <p className="cov__kinds">
        <span>
          Rule statuses {coverage.ruleStatusesCovered}/{coverage.ruleStatusesTotal}
        </span>
        <span>
          Table rows {coverage.rowsCovered}/{coverage.rowsTotal}
        </span>
        <span>
          Scorecard bins {coverage.binsCovered}/{coverage.binsTotal}
        </span>
      </p>

      {under ? (
        <p className="run__warn">
          Below this tenant&rsquo;s threshold, so this version cannot be submitted for review yet.
        </p>
      ) : null}

      {uncovered.length > 0 ? (
        <p className="cov__uncovered">
          Never reached by any test case:{' '}
          {uncovered.map((item) => (
            <code key={item}>{item}</code>
          ))}
        </p>
      ) : (
        <p className="cov__uncovered">
          Every rule branch, table row and scorecard bin is exercised by at least one test case.
        </p>
      )}
    </div>
  );
}

function RunOutcome({ result }: { result: RunResult }): React.JSX.Element {
  // Only the steps that did something. A forty-member group passing every rule would otherwise
  // print four hundred identical rows and bury the one that did not.
  const interesting = result.steps.filter(
    (step) => step.status !== 'PASS' && step.status !== 'NOT_APPLICABLE',
  );

  return (
    <div className="run__result">
      <div className="run__headline">
        <StatusPill status={result.decision} />
        <span className="run__meta">
          {result.policyCode} v{result.version} · {result.status} · asOf {result.asOf} ·{' '}
          {result.stpEligible ? 'straight-through' : 'needs a human'}
        </span>
      </div>

      {!result.assetsResolved ? (
        <div className="run__warn" role="status">
          This tenant has no parameter set or reference lists configured, so every{' '}
          <code>param.</code> and <code>list.</code> reference evaluated as missing. A policy that
          reads them will refer rather than decide — that is the engine failing closed, not a bug in
          your rules.
        </div>
      ) : null}

      {result.factWarnings.length > 0 ? (
        <div className="run__warn" role="status">
          <strong>{result.factWarnings.length} problem(s) in the facts.</strong> Paths only — no
          value from your snapshot is shown.
          <ul className="run__list">
            {result.factWarnings.slice(0, 8).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="run__h2">
        {interesting.length === 0
          ? 'Every step passed or did not apply'
          : `${interesting.length} step(s) drove this decision`}
      </h2>

      {interesting.map((step) => (
        <div className="run__step" key={step.component}>
          <div className="run__step-head">
            <StatusPill status={step.status} />
            <code>{step.component}</code>
          </div>
          <table className="run__table">
            <thead>
              <tr>
                <th scope="col">Entity</th>
                <th scope="col">Status</th>
                <th scope="col">Reason</th>
                <th scope="col">Measure</th>
                <th scope="col">Outputs</th>
              </tr>
            </thead>
            <tbody>
              {step.entities
                .filter((entity) => entity.status !== 'PASS' || entity.reasonCode)
                .map((entity, index) => (
                  <tr key={`${entity.entity ?? 'application'}-${index}`}>
                    <td>{entity.entity ?? '—'}</td>
                    <td>
                      {entity.status}
                      {entity.effectiveStatus !== entity.status
                        ? ` → ${entity.effectiveStatus}`
                        : ''}
                    </td>
                    <td>{entity.reasonCode ?? entity.error ?? '—'}</td>
                    <td>{entity.measure ?? '—'}</td>
                    <td>
                      {Object.entries(entity.outputs)
                        .map(([name, value]) => `${name}=${value}`)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}

      {result.approvals.length > 0 ? (
        <>
          <h2 className="run__h2">Approvals this would need</h2>
          <ul className="run__list">
            {result.approvals.map((approval) => (
              <li key={approval}>{approval}</li>
            ))}
          </ul>
        </>
      ) : null}

      {result.internalReasons.length > 0 ? (
        <>
          <h2 className="run__h2">Internal reasons</h2>
          <ul className="run__list">
            {result.internalReasons.map((reason) => (
              <li key={reason}>
                <code>{reason}</code>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {result.customerReasons.length > 0 ? (
        <>
          <h2 className="run__h2">Reasons the applicant would be given</h2>
          <ul className="run__list">
            {result.customerReasons.map((reason) => (
              <li key={reason}>
                <code>{reason}</code>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function messageOf(caught: unknown): string {
  if (caught instanceof RunError) {
    return caught.message;
  }
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}

/**
 * A starting point in the textarea, so the screen is usable without hunting for the fact schema.
 *
 * One member, enough fields to reach a decision in a typical MFI policy, and obviously synthetic
 * values — §9.7 requires fixtures to be synthetic, and a sample that looked like a real applicant
 * would be the wrong thing to teach people to paste.
 */
const SAMPLE_FACTS = `{
  "application": {
    "applicationRef": "APP-SAMPLE-1",
    "productLine": "MFI_JLG",
    "stage": "CREDIT_UW",
    "requestedAmount": "30000.00",
    "tenureMonths": 24
  },
  "parties": [
    {
      "partyRef": "P-0001",
      "role": "MEMBER",
      "type": "INDIVIDUAL",
      "dateOfBirth": "1992-03-04",
      "gender": "F",
      "householdRef": "H-0001",
      "proposedAmount": "30000.00",
      "income": { "monthlyNet": "14000.00", "verified": true },
      "screening": { "sanctionsHit": false, "pepHit": false, "negativeListHit": false },
      "bureauReports": [
        {
          "bureau": "HIGHMARK",
          "score": 720,
          "noHit": false,
          "tradelines": []
        }
      ]
    }
  ],
  "group": {
    "groupRef": "GRP-SAMPLE",
    "type": "JLG",
    "formedOn": "2024-02-15",
    "cycleNumber": 2,
    "memberPartyRefs": ["P-0001"],
    "villageRiskCategory": "A"
  },
  "households": [
    { "householdRef": "H-0001", "memberPartyRefs": ["P-0001"], "annualIncome": "180000.00" }
  ],
  "consent": { "consentRef": "CNS-SAMPLE", "purposeCode": "CREDIT_UNDERWRITING" }
}`;
