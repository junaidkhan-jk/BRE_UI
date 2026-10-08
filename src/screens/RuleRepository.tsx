import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { RULES, historyOf } from '../api/fixtures';
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
                <>
                  <tr key={rule.code}>
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
                </>
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
