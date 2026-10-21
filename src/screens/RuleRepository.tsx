import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { RULES, historyOf, usingFixtures } from '../api/fixtures';
import { type PolicySummary, listPolicies } from '../api/runs';
import type { RuleStatus } from '../api/types';
import { StatusPill } from '../components/StatusPill';
import { Empty } from '../components/ScreenState';

import './screens.css';

type Filter = 'All' | 'Live' | 'In Review' | 'Draft';

const FILTER_STATUS: Record<Exclude<Filter, 'All'>, RuleStatus> = {
  Live: 'live',
  'In Review': 'in_review',
  Draft: 'draft',
};

/**
 * Rule Repository (wireframe 01, TRD §13.5 U2).
 *
 * Browse every rule, filter by status, open one for editing.
 *
 * The plain-language intent sits under each rule's name, not behind a hover: a reviewer should be
 * able to read a repository and understand the policy without reading a single BEL expression.
 * Retired rules are hidden from the counts, as the wireframe specifies — a count that includes
 * retired rules answers a question nobody asked.
 */
export function RuleRepository(): React.JSX.Element {
  // LIVE MODE RENDERS LIVE POLICIES, and until now this screen was the one that did not.
  //
  // Every other screen guards its fixture import on `usingFixtures`; this one imported RULES and
  // rendered them unconditionally. The sample-data banner is shown only WHEN usingFixtures is
  // true — so against a real backend the landing screen showed eight invented rules
  // ("JLG-001 Minimum Borrower Age", owned by "Priya N.") with the banner hidden, which is
  // precisely the thing the banner exists to prevent and the thing studio.spec.ts tests for. That
  // test runs in fixtures mode, where the banner IS shown, so it never looked at the live case.
  //
  // The registry's policy list carries policyCode, name, stage and status — and not the category,
  // product lines, owner or version history this table shows. Those columns are therefore absent
  // rather than filled with something plausible: a screen that invents an owner is worse than one
  // that admits it does not know yet.
  if (!usingFixtures) {
    return <LivePolicies />;
  }
  return <FixtureRules />;
}

function FixtureRules(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      All: RULES.length,
      Live: RULES.filter((r) => r.status === 'live').length,
      'In Review': RULES.filter((r) => r.status === 'in_review').length,
      Draft: RULES.filter((r) => r.status === 'draft').length,
    }),
    [],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return RULES.filter((rule) => {
      if (filter !== 'All' && rule.status !== FILTER_STATUS[filter]) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        rule.code.toLowerCase().includes(term) ||
        rule.name.toLowerCase().includes(term) ||
        rule.intent.toLowerCase().includes(term)
      );
    });
  }, [filter, query]);

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Rule Repository</h1>
        </div>
        <div className="page__actions">
          <input
            type="search"
            className="input"
            placeholder="Search by name or ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search rules by name or ID"
          />
          <button type="button" className="btn btn--quiet">
            Export
          </button>
          <button type="button" className="btn btn--primary">
            + New Rule
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Filter by status">
        {(['All', 'Live', 'In Review', 'Draft'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={filter === name}
            className={filter === name ? 'tab tab--on' : 'tab'}
            onClick={() => setFilter(name)}
          >
            {name} <span className="tab__count">{counts[name]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Empty
          title={
            query ? `No rules match “${query}”.` : 'No rules with that status yet.'
          }
          action={
            <button type="button" className="btn btn--primary">
              + New Rule
            </button>
          }
        />
      ) : (
        <table className="table">
          <caption className="sr-only">
            Rules, with status, owner and version history
          </caption>
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Category</th>
              <th scope="col">Products</th>
              <th scope="col">Status</th>
              <th scope="col">Version</th>
              <th scope="col">Last modified</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((rule) => {
              const isOpen = expanded === rule.code;
              return (
                // Fragment, keyed. The key was on the inner <tr> while map returned a bare <>,
                // so React never saw one — "Each child in a list should have a unique key prop",
                // twice, on the landing screen. A keyless list re-creates rows instead of moving
                // them, which loses the expanded-row state the moment the filter changes.
                <React.Fragment key={rule.code}>
                  <tr>
                    <td>
                      <div className="cell__code">{rule.code}</div>
                      <div className="cell__name">{rule.name}</div>
                      <div className="cell__intent">{rule.intent}</div>
                    </td>
                    <td>{rule.category}</td>
                    <td>
                      {rule.productLines.map((line) => (
                        <span key={line} className="chip">
                          {line}
                        </span>
                      ))}
                    </td>
                    <td>
                      <StatusPill ruleStatus={rule.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--quiet"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : rule.code)}
                      >
                        v{rule.version} {isOpen ? '▴' : '▾'}
                      </button>
                      {rule.earlierVersions > 0 ? (
                        <div className="cell__intent">
                          {rule.earlierVersions} earlier
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div>{rule.lastModified}</div>
                      <div className="cell__intent">{rule.author}</div>
                    </td>
                    <td>
                      <Link className="btn btn--quiet" to={`/policies/${rule.code}/edit`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr key={`${rule.code}-history`} className="row--sub">
                      <td colSpan={7}>
                        <ol className="history">
                          {historyOf(rule).map((version) => (
                            <li key={version.version} className="history__item">
                              <span className="history__v">v{version.version}</span>
                              <StatusPill ruleStatus={version.status} />
                              <span className="history__note">{version.note}</span>
                              <span className="history__meta">
                                {version.author} · {version.at}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="page__foot">
        {visible.length} of {RULES.length} rules
      </p>
    </section>
  );
}

/**
 * The policies this installation actually has.
 *
 * Four columns, because four is what the registry's list returns. The fixture table shows category,
 * product lines, an owner and a version history; none of those are in {@code GET /v1/policies}, and
 * filling them with plausible values is how a reader comes to trust a screen that is guessing.
 */
function LivePolicies(): React.JSX.Element {
  const [policies, setPolicies] = useState<readonly PolicySummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    listPolicies()
      .then(setPolicies)
      .catch((caught: unknown) =>
        setFailure(caught instanceof Error ? caught.message : 'Could not list policies.'),
      );
  }, []);

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace</p>
          <h1 className="page__title">Rule Repository</h1>
        </div>
      </header>

      {failure ? (
        <div className="run__error" role="alert">
          {failure}
        </div>
      ) : null}

      {policies === null && !failure ? <p className="lead">Reading policies…</p> : null}

      {policies !== null && policies.length === 0 ? (
        <p className="lead">
          This tenant has no policies yet. <code>devstack/e2e.sh</code> creates the reference MFI
          JLG policy and deploys it.
        </p>
      ) : null}

      {policies !== null && policies.length > 0 ? (
        <>
          <table className="table">
            <caption className="sr-only">Policies in this tenant</caption>
            <thead>
              <tr>
                <th scope="col">Policy</th>
                <th scope="col">Stage</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.policyCode}>
                  <td>
                    <div className="cell__code">{policy.policyCode}</div>
                    <div className="cell__name">{policy.name}</div>
                  </td>
                  <td>{policy.stage}</td>
                  <td>{policy.status}</td>
                  <td>
                    <a className="btn btn--quiet" href={`#/policies/${policy.policyCode}/edit`}>
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="panel__meta">
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'}. Category, product
            lines, owner and version history are not in this endpoint and are deliberately not shown
            rather than guessed.
          </p>
        </>
      ) : null}
    </section>
  );
}
