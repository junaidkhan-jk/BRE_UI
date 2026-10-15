import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BelEditor } from '../components/BelEditor';
import {
  type PolicyIr,
  type PolicySummary,
  type VersionDetail,
  type VersionSummary,
  listPolicies,
  listVersions,
  readIr,
  readSource,
  readVersion,
} from '../api/runs';
import { submitVersion } from '../api/governance';
import { currentSession } from '../api/auth';
import { usingFixtures } from '../api/fixtures';
import { StatusPill } from '../components/StatusPill';

import './screens.css';

const REGISTRY: string = (import.meta.env.VITE_REGISTRY_URL as string | undefined) ?? '';

/**
 * The policy source editor, with a BEL workbench (TRD §13.5 U3 and U4 — M5-02).
 *
 * **Two editors, because a policy is two things.** The source is a document: stages, rules, tables,
 * and the comments explaining why a threshold is what it is. The expressions inside it are a
 * language with types. So the source is edited as text — and saved as the exact bytes the author
 * wrote, because translation discards every comment — while the **workbench** below gives one
 * expression at a time the full language service: types as you type, every BEL diagnostic
 * positioned, completion from the published fact schema and from this policy's own parameters,
 * lists and variables.
 *
 * **Why a workbench rather than inline editing of each expression.** Editing expressions in place
 * means a structured editor that writes the source back, and a round trip through the structure
 * loses the comments. An author composes the expression where the compiler can talk to them, then
 * puts it in the document — which is what they do anyway, with the difference that the compiler now
 * answers in under a second instead of at the next save.
 *
 * **Saving compiles.** Every save runs the static checks and re-runs the stored test cases against
 * the tenant's resolved parameters, and the findings come back with it. An author who finds out at
 * submission that their table has a gap has to re-read work they finished an hour ago.
 */
export function SourceEditor(): React.JSX.Element {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<readonly PolicySummary[]>([]);
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [policyCode, setPolicyCode] = useState('');
  const [version, setVersion] = useState('');
  const [source, setSource] = useState('');
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [ir, setIr] = useState<PolicyIr | null>(null);
  const [expression, setExpression] = useState('ageInYears(member.dateOfBirth, asOf) >= 18');
  const [changeNote, setChangeNote] = useState('');
  const [committee, setCommittee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        // The open DRAFT if there is one — that is the only version an edit can land on.
        const draft = found.find((candidate) => candidate.status === 'DRAFT') ?? found[0];
        setVersion(draft ? String(draft.version) : '');
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, [policyCode]);

  useEffect(() => {
    if (!policyCode || !version || usingFixtures) {
      return;
    }
    setError(null);
    Promise.all([
      readSource(policyCode, Number(version)).catch(() => ''),
      readVersion(policyCode, Number(version)),
      readIr(policyCode, Number(version)).catch(() => null),
    ])
      .then(([text, read, compiled]) => {
        setSource(text);
        setDetail(read);
        setIr(compiled);
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, [policyCode, version]);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(
        `${REGISTRY}/v1/policies/${encodeURIComponent(policyCode)}/versions/${version}/source`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/plain',
            Authorization: `Bearer ${currentSession()?.token ?? ''}`,
          },
          body: source,
        },
      );
      const text = await response.text();
      if (!response.ok) {
        const problem = JSON.parse(text) as { detail?: string };
        throw new Error(problem.detail ?? `Save failed with ${response.status}`);
      }
      const saved = JSON.parse(text) as VersionDetail;
      setDetail(saved);
      setNote(
        `Saved and compiled: ${saved.findings.length} finding(s), ${saved.tests.passed} of ${saved.tests.total} test cases pass.`,
      );
      setIr(await readIr(policyCode, Number(version)).catch(() => null));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await submitVersion(policyCode, Number(version), changeNote, committee);
      setNote('Submitted for review. It is frozen now — a reviewer reads the bytes that deploy.');
      setDetail(await readVersion(policyCode, Number(version)));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  // The scope the workbench type-checks against: this policy's own parameters and variables, so
  // `param.MIN_AGE` resolves here exactly as it will in the policy.
  const scope = {
    parameters: parametersOf(ir),
    variables: Object.fromEntries(
      (ir?.variables ?? []).map((variable) => [variable.name, variable.type]),
    ),
  };

  const editable = detail?.status === 'DRAFT';

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Policy source</h1>
        </div>
        <div className="page__actions">
          {detail ? <StatusPill status={detail.status} /> : null}
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !editable}
            onClick={() => void save()}
          >
            Save &mdash; compiles and runs the tests
          </button>
        </div>
      </header>

      {usingFixtures ? (
        <p className="run__note" role="status">
          No registry is connected, so there is nothing to edit and no language service. Start one
          with <code>./devstack/up.sh --registry</code>.
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

      {!editable && detail ? (
        <p className="run__note">
          This version is {detail.status} and cannot be edited &mdash; a reviewer has to be reading
          the bytes that get deployed. Open a new version to change it.
        </p>
      ) : null}

      <label className="field field--wide">
        <span className="field__label">Policy source</span>
        <textarea
          className="run__facts"
          rows={22}
          spellCheck={false}
          readOnly={!editable}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          aria-label="Policy source"
        />
      </label>
      <p className="run__note">
        Saved as the exact bytes you write. The compiled form discards comments, and the comment
        explaining why a threshold is 21 and not 18 is often the only record of a committee&rsquo;s
        reasoning &mdash; so the source is what the registry keeps, and what a reviewer reads.
      </p>

      {detail ? (
        <>
          <h2 className="diff__heading">
            Compile report &mdash; {detail.findings.length} finding(s), {detail.tests.passed} of{' '}
            {detail.tests.total} tests pass
          </h2>
          {detail.findings.length > 0 ? (
            <ul className="run__list">
              {detail.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          ) : (
            <p className="run__note">No static-check findings.</p>
          )}
          {detail.tests.failures.length > 0 ? (
            <ul className="run__list">
              {detail.tests.failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <h2 className="diff__heading">Expression workbench</h2>
      <p className="run__note">
        One expression at a time, with the full language service: the type as you type, every BEL
        diagnostic positioned where the parser found it, and completion from the published fact
        schema and this policy&rsquo;s own parameters and variables. It is the same lexer, parser and
        type checker that run inside a save &mdash; so an expression this accepts is one the submit
        gate accepts.
      </p>
      {/* Imported eagerly, deliberately. A dynamic import would be the obvious way to keep
          Monaco off every other screen — and it does nothing here, because the studio is built as
          a single IIFE so that it loads over file:// with no server, and rollup inlines a dynamic
          import into that one file. Splitting Monaco out needs something serving the chunks,
          which is the BFF. Until then the studio is 851 kB gzipped, and the reason is written
          down rather than discovered. */}
      <BelEditor
        value={expression}
        scope={scope}
        onChange={setExpression}
        // F12 on `param.X` or `list.Y`. The definition is not in this document and not in any
        // document — it is a shared asset with its own approvals — so "go to definition" means
        // open that asset.
        onNavigate={(kind, name) => {
          void navigate(
            `/assets?kind=${kind === 'PARAMETER' ? 'PARAMETER_SET' : 'REFERENCE_LIST'}` +
              `&focus=${encodeURIComponent(name)}`,
          );
        }}
        label="BEL expression workbench"
      />

      {editable ? (
        <>
          <h2 className="diff__heading">Submit for review</h2>
          <div className="grid grid--3">
            <label className="field">
              <span className="field__label">Change note &mdash; at least 10 characters</span>
              <input
                className="field__input"
                value={changeNote}
                placeholder="Raised the minimum age to match the revised KYC circular"
                onChange={(event) => setChangeNote(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Committee reference</span>
              <input
                className="field__input"
                value={committee}
                placeholder="CRMC-2026-41"
                onChange={(event) => setCommittee(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || changeNote.length < 10 || !committee}
            onClick={() => void submit()}
          >
            Submit
          </button>
          <p className="run__note">
            Both are required (FR-LIFE-002). A reviewer approving a diff has to know what the author
            was trying to achieve &mdash; the diff itself only says what changed &mdash; and a policy
            change with no recorded mandate is the finding an audit opens with. Submission is also
            refused if any test fails, if there are no tests, or if coverage is below this
            tenant&rsquo;s minimum.
          </p>
        </>
      ) : null}
    </section>
  );
}

/** The parameter names a policy's IR references, with no types declared for them in the IR. */
function parametersOf(ir: PolicyIr | null): Record<string, string> {
  if (!ir) {
    return {};
  }
  // The IR records which parameter SET a policy pins, not each parameter's type — the types live
  // in the asset. Decimal is the right assumption for a threshold: an Integer compared against a
  // Decimal is legal, so a wrong guess here loosens the check rather than producing a false
  // error. The authoritative types arrive when the asset is resolved at compile time.
  const names = new Set<string>();
  const scan = (text: string | undefined): void => {
    for (const match of (text ?? '').matchAll(/\bparam\.([A-Z][A-Z0-9_]*)/g)) {
      const name = match[1];
      if (name) {
        names.add(name);
      }
    }
  };
  (ir.rules ?? []).forEach((rule) => {
    scan(rule.check);
    scan(rule.when);
  });
  (ir.decisionTables ?? []).forEach((table) =>
    (table.rows ?? []).forEach((row) => (row.when ?? []).forEach(scan)),
  );
  (ir.variables ?? []).forEach((variable) => scan(variable.expr));
  return Object.fromEntries([...names].map((name) => [name, 'Decimal']));
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}
