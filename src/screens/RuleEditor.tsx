import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { RULES, historyOf } from '../api/fixtures';
import { StatusPill } from '../components/StatusPill';
import { Empty } from '../components/ScreenState';

import './screens.css';

type EditorTab = 'trl' | 'json' | 'tests';
type PanelTab = 'versions' | 'variables';

/**
 * Rule Editor (wireframe 02, TRD §13.5 U3 + U4).
 *
 * Turns a banker's plain-language intent into a structured rule, then tests it.
 *
 * The version bar is the part that matters most and is easiest to get wrong: editing a LIVE rule
 * creates a new DRAFT, and <b>the live version keeps running until the draft is approved</b>. An
 * editor that silently mutated the running rule would change a lender's decisions the moment
 * someone typed.
 */
export function RuleEditor(): React.JSX.Element {
  const { code } = useParams<{ code: string }>();
  const rule = RULES.find((candidate) => candidate.code === code) ?? RULES[0];
  const [editorTab, setEditorTab] = useState<EditorTab>('trl');
  const [panelTab, setPanelTab] = useState<PanelTab>('versions');

  if (!rule) {
    return <Empty title="That rule does not exist." />;
  }

  const draftVersion = rule.status === 'live' ? rule.version + 1 : rule.version;

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Workspace · Rule Repository</p>
          <h1 className="page__title">
            {rule.code} · {rule.name}
          </h1>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--quiet">
            Save as draft
          </button>
          <button type="button" className="btn btn--primary">
            Submit for Review
          </button>
        </div>
      </header>

      {/* Editing a live rule never touches the live rule. */}
      <div className="versionbar">
        <span>
          Editing <strong>v{draftVersion} draft</strong>
        </span>
        {rule.status === 'live' ? (
          <>
            <span className="versionbar__sep">·</span>
            <span>
              replaces <strong>v{rule.version}</strong>
            </span>
            <StatusPill ruleStatus="live" />
            <span className="versionbar__note">
              v{rule.version} keeps deciding until this draft is approved
            </span>
          </>
        ) : null}
        <div className="page__spacer" />
        <button type="button" className="btn btn--quiet">
          Compare with live
        </button>
      </div>

      <div className="editor">
        <div className="editor__main">
          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Banker intent</span>
              <span className="panel__meta">
                {rule.author} · {rule.lastModified}
              </span>
            </div>
            <p className="intent">{rule.intent}</p>
            <div className="panel__foot">
              {/* The AI accent is deliberately not a status colour: a machine suggestion must
                  never look like something the engine decided. */}
              <button type="button" className="btn btn--ai">
                Compile with AI
              </button>
              <span className="panel__meta">
                Drafts the rule from the intent. Review before submitting.
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="tabs tabs--inset" role="tablist" aria-label="Rule view">
              {(
                [
                  ['trl', 'TRL'],
                  ['json', 'Rule JSON'],
                  ['tests', 'Tests'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={editorTab === id}
                  className={editorTab === id ? 'tab tab--on' : 'tab'}
                  onClick={() => setEditorTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {editorTab === 'trl' ? (
              <pre className="code">{`rule ${rule.code} "${rule.name}"
  when   member.dateOfBirth is present
  check  ageInYears(member.dateOfBirth, asOf) + tenureYears <= 60
  onFail DEVIATION (AGE_AT_MATURITY) measure ageInYears(member.dateOfBirth, asOf)
         worseWhen HIGHER
  onMissing REFER`}</pre>
            ) : null}

            {editorTab === 'json' ? (
              <pre className="code">{JSON.stringify(
                {
                  code: rule.code,
                  name: rule.name,
                  scope: 'MEMBER',
                  when: 'not isMissing(member.dateOfBirth)',
                  check: 'ageInYears(member.dateOfBirth, asOf) + tenureYears <= 60',
                  onFail: {
                    status: 'DEVIATION',
                    reasonCode: 'AGE_AT_MATURITY',
                    deviationType: 'AGE_AT_MATURITY',
                    measure: 'ageInYears(member.dateOfBirth, asOf)',
                    worseWhen: 'HIGHER',
                  },
                  onMissing: { policy: 'REFER' },
                  outputs: {},
                },
                null,
                2,
              )}</pre>
            ) : null}

            {editorTab === 'tests' ? (
              <table className="table table--tight">
                <thead>
                  <tr>
                    <th scope="col">Case</th>
                    <th scope="col">Expected</th>
                    <th scope="col">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Age 44, tenure 2y</td>
                    <td>
                      <StatusPill outcome="PASS" />
                    </td>
                    <td>
                      <StatusPill outcome="PASS" />
                    </td>
                  </tr>
                  <tr>
                    <td>Age 59, tenure 2y</td>
                    <td>
                      <StatusPill outcome="DEVIATION" />
                    </td>
                    <td>
                      <StatusPill outcome="DEVIATION" />
                    </td>
                  </tr>
                  <tr>
                    <td>Date of birth absent</td>
                    <td>
                      <StatusPill outcome="DATA_MISSING" />
                    </td>
                    <td>
                      <StatusPill outcome="DATA_MISSING" />
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : null}
          </div>
        </div>

        <aside className="editor__side">
          <div className="tabs tabs--inset" role="tablist" aria-label="Side panel">
            {(
              [
                ['versions', 'Versions'],
                ['variables', 'Variables'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panelTab === id}
                className={panelTab === id ? 'tab tab--on' : 'tab'}
                onClick={() => setPanelTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {panelTab === 'versions' ? (
            <ol className="history">
              {historyOf(rule).map((version) => (
                <li key={version.version} className="history__item history__item--stacked">
                  <div className="history__row">
                    <span className="history__v">v{version.version}</span>
                    <StatusPill ruleStatus={version.status} />
                  </div>
                  <span className="history__note">{version.note}</span>
                  <span className="history__meta">
                    {version.author} · {version.at}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="catalog">
              {[
                ['member.dateOfBirth', 'Date'],
                ['member.income.monthlyNet', 'Decimal'],
                ['memberUnsecuredOutstanding', 'Decimal (variable)'],
                ['group.memberPartyRefs', 'List<Text>'],
                ['param.INDEBTEDNESS_CAP', 'Decimal (parameter)'],
                ['asOf', 'Date'],
              ].map(([path, type]) => (
                <li key={path} className="catalog__item">
                  <code>{path}</code>
                  <span className="panel__meta">{type}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
