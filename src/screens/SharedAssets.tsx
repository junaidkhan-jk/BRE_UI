import { useCallback, useEffect, useState } from 'react';

import {
  type AssetContent,
  type AssetHeader,
  type AssetKind,
  type AssetVersion,
  type AuthorityEntry,
  type Level,
  type EffectiveWindow,
  type Parameter,
  type ReasonCode,
  KIND_LABELS,
  createAssetDraft,
  discardAsset,
  listAssets,
  readAsset,
  reviewAsset,
  saveAsset,
  submitAsset,
} from '../api/assets';
import { assetUsage, type AssetUsage } from '../api/assets';
import { useSession } from '../app/SessionContext';
import { usingFixtures } from '../api/fixtures';
import { Empty, Loading } from '../components/ScreenState';
import { StatusPill } from '../components/StatusPill';

import './screens.css';

const KINDS: readonly AssetKind[] = [
  'PARAMETER_SET',
  'REFERENCE_LIST',
  'REASON_CODE_CATALOGUE',
  'AUTHORITY_MATRIX',
];

/**
 * Shared assets (TRD §13.5 U8, M5-07).
 *
 * **These are the thresholds, not the rules.** A parameter set holds the indebtedness cap; changing
 * one number in it changes what every policy pinning it decides, without any policy being edited.
 * So this screen is a maker-checker screen before it is an editor: it shows who authored a version
 * and who approved it, it hides Approve from the author rather than disabling it, and it says in
 * plain words that nothing here affects a policy until a second person has approved it.
 *
 * **Effective dating is shown as what it is — a table of dates.** A cap of ₹200,000 until 1 April
 * and ₹300,000 after it is two rows, both true, and which one applies depends on the date the
 * application is decided. Rendering only "the current value" would hide the row that keeps last
 * month's decisions correct, which is the row an auditor asks about.
 *
 * **Approve is absent for the author, not disabled.** A disabled button invites somebody to find
 * the way around it; an absent one says the control is not negotiable. The server refuses it
 * either way.
 *
 * **Not built:** the fact-schema browser (U8's fifth tab — schemas are versioned outside this
 * lifecycle), and multi-language customer text beyond `en`. Both are named rather than faked.
 */
export function SharedAssets(): React.JSX.Element {
  const { session } = useSession();
  const [kind, setKind] = useState<AssetKind>('PARAMETER_SET');
  const [headers, setHeaders] = useState<readonly AssetHeader[] | null>(null);
  const [selected, setSelected] = useState<AssetVersion | null>(null);
  const [draft, setDraft] = useState<AssetContent | null>(null);
  const [newCode, setNewCode] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<readonly AssetUsage[] | null>(null);

  const refresh = useCallback(
    async (keep?: AssetVersion | null) => {
      if (usingFixtures) {
        setHeaders([]);
        return;
      }
      const found = await listAssets(kind);
      setHeaders(found);
      if (keep) {
        setSelected(keep);
        setDraft(structuredClone(keep.content));
      }
    },
    [kind],
  );

  useEffect(() => {
    setHeaders(null);
    setSelected(null);
    setDraft(null);
    refresh().catch((caught: unknown) => {
      setError(messageOf(caught));
      setHeaders([]);
    });
  }, [kind, refresh]);

  async function act(what: string, run: () => Promise<AssetVersion>): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const updated = await run();
      await refresh(updated);
      setNote(`${what}: ${updated.code}@${updated.version} is now ${updated.status}.`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function open(header: AssetHeader): Promise<void> {
    setError(null);
    try {
      const full = await readAsset(header.kind, header.code, header.version);
      setSelected(full);
      setDraft(structuredClone(full.content));
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  // Loaded on selection rather than with the list: it is a three-table join per asset, and the
  // list screen shows forty of them.
  useEffect(() => {
    if (!selected || usingFixtures) {
      setUsage(null);
      return;
    }
    let live = true;
    assetUsage(selected.kind, selected.code)
      .then((found) => {
        if (live) setUsage(found);
      })
      .catch(() => {
        if (live) setUsage([]);
      });
    return () => {
      live = false;
    };
  }, [selected]);

  const editable = selected?.status === 'DRAFT';
  // Maker-checker, visible: the author of a version is the one person who must not approve it.
  const isAuthor = selected != null && selected.author === session?.subject;

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Governance</p>
          <h1 className="page__title">Shared assets</h1>
        </div>
        <div className="page__actions">
          <input
            className="field__input"
            placeholder="NEW_ASSET_CODE"
            value={newCode}
            onChange={(event) => setNewCode(event.target.value.toUpperCase())}
            aria-label="New asset code"
          />
          <button
            type="button"
            className="btn"
            disabled={busy || !newCode}
            onClick={() =>
              void act('Draft opened', async () => {
                const created = await createAssetDraft(kind, newCode, true);
                setNewCode('');
                return created;
              })
            }
          >
            New version
          </button>
        </div>
      </header>

      <p className="run__note">
        These are the <strong>thresholds, lists and authority bands</strong> your policies decide
        by &mdash; not the rules themselves. Nothing here affects a policy until a{' '}
        <strong>second person</strong> has approved it, and an approved asset is never edited in
        place: a change is a new version, so a policy signed against version 7 keeps deciding by
        version 7.
      </p>

      {usingFixtures ? (
        <p className="run__note" role="status">
          No registry is connected, so there are no assets to show. Start one with{' '}
          <code>./devstack/up.sh --registry</code>.
        </p>
      ) : null}

      <div className="tabs">
        {KINDS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={candidate === kind ? 'tab tab--on' : 'tab'}
            onClick={() => setKind(candidate)}
          >
            {KIND_LABELS[candidate]}
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

      {headers === null ? <Loading label="Reading shared assets" /> : null}

      {headers !== null && headers.length === 0 && !usingFixtures ? (
        <Empty
          title={`No ${KIND_LABELS[kind].toLowerCase()} yet.`}
          action={
            <p className="run__note">
              Type a code above and open a version. Until one is approved, a policy naming it
              resolves every reference to nothing and refers every applicant.
            </p>
          }
        />
      ) : null}

      {headers !== null && headers.length > 0 ? (
        <div className="table__scroll">
          <table className="table table--tight">
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Version</th>
                <th scope="col">Status</th>
                <th scope="col">Authored by</th>
                <th scope="col">Approved</th>
                <th scope="col">Content hash</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {headers.map((header) => (
                <tr key={`${header.code}-${header.version}`}>
                  <td>
                    <code>{header.code}</code>
                  </td>
                  <td>v{header.version}</td>
                  <td>
                    <StatusPill status={header.status} />
                  </td>
                  <td>{header.author}</td>
                  <td>{header.approvedAt ? header.approvedAt.slice(0, 10) : '—'}</td>
                  <td>
                    <code className="hash">
                      {header.contentHash ? header.contentHash.slice(7, 19) : '—'}
                    </code>
                  </td>
                  <td>
                    <button type="button" className="btn" onClick={() => void open(header)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected && draft ? (
        <div className="panel">
          <div className="panel__head">
            <div>
              <p className="panel__title">
                <code>{selected.code}</code> v{selected.version}
              </p>
              <p className="panel__subtitle">
                {KIND_LABELS[selected.kind]} &middot; {selected.status} &middot; authored by{' '}
                {selected.author}
                {selected.contentHash ? ` · ${selected.contentHash}` : ''}
              </p>
            </div>
            <div className="page__actions">
              {editable ? (
                <>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void act('Saved', () =>
                        saveAsset(selected.kind, selected.code, selected.version, draft),
                      )
                    }
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void act('Submitted', () =>
                        submitAsset(selected.kind, selected.code, selected.version),
                      )
                    }
                  >
                    Submit for review
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void act('Discarded', () =>
                        discardAsset(selected.kind, selected.code, selected.version),
                      )
                    }
                  >
                    Discard
                  </button>
                </>
              ) : null}

              {selected.status === 'IN_REVIEW' && !isAuthor ? (
                <>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void act('Approved', () =>
                        reviewAsset(
                          selected.kind,
                          selected.code,
                          selected.version,
                          true,
                          comment,
                        ),
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
                      void act('Changes requested', () =>
                        reviewAsset(
                          selected.kind,
                          selected.code,
                          selected.version,
                          false,
                          comment,
                        ),
                      )
                    }
                  >
                    Request changes
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {selected.status === 'IN_REVIEW' && isAuthor ? (
            // Absent rather than disabled, and said out loud: a parameter set holds the thresholds
            // every policy pinning it decides by, so one person changing and approving a figure is
            // the control this exists to prevent.
            <p className="run__warn">
              You authored this version, so you cannot approve it (00 &sect;3.3). Somebody else has
              to.
            </p>
          ) : null}

          {selected.status === 'IN_REVIEW' && !isAuthor ? (
            <label className="field field--wide">
              <span className="field__label">Review comment</span>
              <input
                className="field__input"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Figures confirmed against the circular"
              />
            </label>
          ) : null}

          {selected.status === 'APPROVED' ? (
            <p className="run__note">
              Approved and immutable. To change a figure, open a new version &mdash; this one stays
              exactly as the policies pinning it were signed against.
            </p>
          ) : null}

          <UsagePanel usage={usage} />

          {selected.kind === 'PARAMETER_SET' ? (
            <ParameterEditor
              parameters={draft.parameters ?? []}
              editable={editable}
              onChange={(parameters) => setDraft({ ...draft, parameters })}
            />
          ) : null}

          {selected.kind === 'REFERENCE_LIST' ? (
            <ListEditor
              content={draft}
              editable={editable}
              onChange={(next) => setDraft({ ...draft, ...next })}
            />
          ) : null}

          {selected.kind === 'REASON_CODE_CATALOGUE' ? (
            <ReasonCodeEditor
              codes={draft.codes ?? []}
              editable={editable}
              onChange={(codes) => setDraft({ ...draft, codes })}
            />
          ) : null}

          {selected.kind === 'AUTHORITY_MATRIX' ? (
            <MatrixEditor
              content={draft}
              editable={editable}
              onChange={(next) => setDraft({ ...draft, ...next })}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Parameters with their effective windows.
 *
 * `effectiveTo` is exclusive and blank means open-ended, which the column header says — the one
 * off-by-one that matters here is whether a value ending 1 April still applies on 1 April, and it
 * does not.
 */
function ParameterEditor({
  parameters,
  editable,
  onChange,
}: {
  parameters: readonly Parameter[];
  editable: boolean;
  onChange: (parameters: Parameter[]) => void;
}): React.JSX.Element {
  function edit(index: number, change: Partial<Parameter>): void {
    const next = parameters.map((parameter, at) =>
      at === index ? { ...parameter, ...change } : parameter,
    );
    onChange(next);
  }

  function editWindow(index: number, at: number, change: Partial<EffectiveWindow>): void {
    const parameter = parameters[index];
    if (!parameter) {
      return;
    }
    edit(index, {
      values: parameter.values.map((window, position) =>
        position === at ? { ...window, ...change } : window,
      ),
    });
  }

  return (
    <>
      <h2 className="diff__heading">Parameters</h2>
      <div className="table__scroll">
        <table className="table table--tight">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Effective from</th>
              <th scope="col">Until (exclusive)</th>
              <th scope="col">Value</th>
              <th scope="col">Regulatory</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {parameters.map((parameter, index) => (
              <ParameterRows
                key={parameter.name || index}
                parameter={parameter}
                editable={editable}
                onEdit={(change) => edit(index, change)}
                onEditWindow={(at, change) => editWindow(index, at, change)}
                onRemove={() => onChange(parameters.filter((_, at) => at !== index))}
              />
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange([
              ...parameters,
              {
                name: '',
                type: 'Decimal',
                regulatory: false,
                values: [{ effectiveFrom: today(), effectiveTo: null, value: '' }],
              },
            ])
          }
        >
          Add a parameter
        </button>
      ) : null}

      <p className="run__note">
        A value is <strong>effective-dated</strong>, not current: &ldquo;until&rdquo; is exclusive
        and blank means open-ended, so ₹200,000 until 1 April and ₹300,000 from 1 April meet
        without overlapping. An application decided in March is decided by March&rsquo;s figure
        forever, which is what makes a replay honest. A{' '}
        <strong>regulatory</strong> parameter must carry where the figure comes from and when it is
        next reviewed.
      </p>
    </>
  );
}

function ParameterRows({
  parameter,
  editable,
  onEdit,
  onEditWindow,
  onRemove,
}: {
  parameter: Parameter;
  editable: boolean;
  onEdit: (change: Partial<Parameter>) => void;
  onEditWindow: (at: number, change: Partial<EffectiveWindow>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <>
      {parameter.values.map((window, at) => (
        <tr key={at} className={at > 0 ? 'row--sub' : undefined}>
          <td>
            {at === 0 ? (
              editable ? (
                <input
                  className="field__input"
                  value={parameter.name}
                  placeholder="PARAMETER_NAME"
                  onChange={(event) => onEdit({ name: event.target.value.toUpperCase() })}
                  aria-label="Parameter name"
                />
              ) : (
                <code>{parameter.name}</code>
              )
            ) : null}
          </td>
          <td>
            {at === 0 ? (
              editable ? (
                <select
                  className="field__input"
                  value={parameter.type}
                  onChange={(event) =>
                    onEdit({ type: event.target.value as Parameter['type'] })
                  }
                  aria-label="Parameter type"
                >
                  {['Decimal', 'Integer', 'Boolean', 'Text', 'Date'].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              ) : (
                parameter.type
              )
            ) : null}
          </td>
          <td>
            {editable ? (
              <input
                className="field__input"
                type="date"
                value={window.effectiveFrom}
                onChange={(event) => onEditWindow(at, { effectiveFrom: event.target.value })}
                aria-label="Effective from"
              />
            ) : (
              window.effectiveFrom
            )}
          </td>
          <td>
            {editable ? (
              <input
                className="field__input"
                type="date"
                value={window.effectiveTo ?? ''}
                onChange={(event) =>
                  onEditWindow(at, { effectiveTo: event.target.value || null })
                }
                aria-label="Effective until, exclusive"
              />
            ) : (
              (window.effectiveTo ?? 'open-ended')
            )}
          </td>
          <td>
            {editable ? (
              <input
                className="field__input"
                value={window.value}
                onChange={(event) => onEditWindow(at, { value: event.target.value })}
                aria-label="Value"
              />
            ) : (
              <code>{window.value}</code>
            )}
          </td>
          <td>
            {at === 0 ? (
              editable ? (
                <input
                  type="checkbox"
                  checked={parameter.regulatory}
                  onChange={(event) => onEdit({ regulatory: event.target.checked })}
                  aria-label="Regulatory"
                />
              ) : parameter.regulatory ? (
                <span className="chip">REGULATORY</span>
              ) : (
                '—'
              )
            ) : null}
          </td>
          <td>
            {editable ? (
              <>
                {at === 0 ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      onEdit({
                        values: [
                          ...parameter.values,
                          { effectiveFrom: today(), effectiveTo: null, value: '' },
                        ],
                      })
                    }
                  >
                    + window
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      onEdit({ values: parameter.values.filter((_, p) => p !== at) })
                    }
                  >
                    remove window
                  </button>
                )}
                {at === 0 ? (
                  <button type="button" className="btn" onClick={onRemove}>
                    remove
                  </button>
                ) : null}
              </>
            ) : null}
          </td>
        </tr>
      ))}
      {parameter.regulatory ? (
        <tr className="row--sub">
          <td />
          <td colSpan={6}>
            {editable ? (
              <div className="grid grid--3">
                <label className="field">
                  <span className="field__label">Source reference</span>
                  <input
                    className="field__input"
                    value={parameter.sourceRef ?? ''}
                    placeholder="SRO-GUARDRAIL-2025-03"
                    onChange={(event) => onEdit({ sourceRef: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Next review</span>
                  <input
                    className="field__input"
                    type="date"
                    value={parameter.nextReviewOn ?? ''}
                    onChange={(event) => onEdit({ nextReviewOn: event.target.value })}
                  />
                </label>
              </div>
            ) : (
              <span className="meta">
                {parameter.sourceRef ?? 'no source reference'} &middot; next review{' '}
                {parameter.nextReviewOn ?? 'not set'}
              </span>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** A reference list: a type and its items, one per line. */
function ListEditor({
  content,
  editable,
  onChange,
}: {
  content: AssetContent;
  editable: boolean;
  onChange: (change: Partial<AssetContent>) => void;
}): React.JSX.Element {
  const items = content.items ?? [];
  return (
    <>
      <h2 className="diff__heading">Items</h2>
      <div className="grid grid--3">
        <label className="field">
          <span className="field__label">Item type</span>
          <select
            className="field__input"
            value={content.itemType ?? 'Text'}
            disabled={!editable}
            onChange={(event) => onChange({ itemType: event.target.value })}
          >
            {['Text', 'Integer', 'Decimal', 'Date'].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Description</span>
          <input
            className="field__input"
            value={content.description ?? ''}
            disabled={!editable}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
      </div>

      <label className="field field--wide">
        <span className="field__label">Items, one per line &mdash; {items.length} of 100,000</span>
        <textarea
          className="run__facts"
          rows={10}
          spellCheck={false}
          readOnly={!editable}
          value={items.join('\n')}
          onChange={(event) =>
            onChange({
              items: event.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter((item) => item.length > 0),
            })
          }
        />
      </label>
      <p className="run__note">
        Bulk import is a paste: one item per line, blanks and duplicates dropped. The cap is on what
        a <strong>bundle</strong> carries, because every decision pod verifies and holds it in
        memory &mdash; a list larger than that is a dataset, and the answer is to compute the
        membership check in your own system and send the result as a fact.
      </p>
    </>
  );
}

/** Reason codes: what an officer reads, and what an applicant is told. */
function ReasonCodeEditor({
  codes,
  editable,
  onChange,
}: {
  codes: readonly ReasonCode[];
  editable: boolean;
  onChange: (codes: ReasonCode[]) => void;
}): React.JSX.Element {
  function edit(index: number, change: Partial<ReasonCode>): void {
    onChange(codes.map((code, at) => (at === index ? { ...code, ...change } : code)));
  }

  return (
    <>
      <h2 className="diff__heading">Reason codes</h2>
      <div className="table__scroll">
        <table className="table table--tight">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Category</th>
              <th scope="col">Adverse</th>
              <th scope="col">Internal text</th>
              <th scope="col">Customer text (en)</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {codes.map((code, index) => (
              <tr key={code.code || index}>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={code.code}
                      placeholder="KYC_UNDER_MIN_AGE"
                      onChange={(event) => edit(index, { code: event.target.value.toUpperCase() })}
                      aria-label="Reason code"
                    />
                  ) : (
                    <code>{code.code}</code>
                  )}
                </td>
                <td>
                  {editable ? (
                    <select
                      className="field__input"
                      value={code.category}
                      onChange={(event) =>
                        edit(index, { category: event.target.value as ReasonCode['category'] })
                      }
                      aria-label="Category"
                    >
                      {[
                        'KNOCKOUT',
                        'CREDIT',
                        'KYC',
                        'FRAUD',
                        'AFFORDABILITY',
                        'COLLATERAL',
                        'POLICY',
                      ].map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  ) : (
                    code.category
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={code.adverse}
                      onChange={(event) => edit(index, { adverse: event.target.checked })}
                      aria-label="Adverse"
                    />
                  ) : code.adverse ? (
                    'yes'
                  ) : (
                    'no'
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={code.internalText}
                      onChange={(event) => edit(index, { internalText: event.target.value })}
                      aria-label="Internal text"
                    />
                  ) : (
                    code.internalText
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={code.customerText?.en ?? ''}
                      onChange={(event) =>
                        edit(index, {
                          customerText: { ...code.customerText, en: event.target.value },
                        })
                      }
                      aria-label="Customer text in English"
                    />
                  ) : (
                    (code.customerText?.en ?? '—')
                  )}
                </td>
                <td>
                  {editable ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onChange(codes.filter((_, at) => at !== index))}
                    >
                      remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange([
              ...codes,
              {
                code: '',
                category: 'CREDIT',
                adverse: true,
                internalText: '',
                customerText: { en: '' },
              },
            ])
          }
        >
          Add a reason code
        </button>
      ) : null}

      <p className="run__note">
        The <strong>internal</strong> text is what a credit officer reads; the{' '}
        <strong>customer</strong> text is what an applicant is told, and an adverse one is what a
        regulator expects to be comprehensible. English only for now &mdash; the schema holds a map
        per language and this screen edits one of them.
      </p>
    </>
  );
}

/** An authority matrix: ordered levels, and the bands that route to them. */
function MatrixEditor({
  content,
  editable,
  onChange,
}: {
  content: AssetContent;
  editable: boolean;
  onChange: (change: Partial<AssetContent>) => void;
}): React.JSX.Element {
  const levels = content.levels ?? [];
  const entries = content.entries ?? [];

  function editLevel(index: number, change: Partial<Level>): void {
    onChange({ levels: levels.map((level, at) => (at === index ? { ...level, ...change } : level)) });
  }

  function editEntry(index: number, change: Partial<AuthorityEntry>): void {
    onChange({
      entries: entries.map((entry, at) => (at === index ? { ...entry, ...change } : entry)),
    });
  }

  return (
    <>
      <h2 className="diff__heading">Authority levels</h2>
      <p className="run__note">
        Nothing about this hierarchy is in the engine, which is why inserting a level is a
        configuration change and not a release: add <code>ZONAL_HEAD</code> with a rank between two
        others and routing follows it. A higher rank is more senior.
      </p>
      <div className="table__scroll">
        <table className="table table--tight">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Rank</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {[...levels]
              .sort((left, right) => left.rank - right.rank)
              .map((level) => {
                const index = levels.indexOf(level);
                return (
                  <tr key={level.levelCode || index}>
                    <td>
                      {editable ? (
                        <input
                          className="field__input"
                          value={level.levelCode}
                          placeholder="AREA_MANAGER"
                          onChange={(event) =>
                            editLevel(index, { levelCode: event.target.value.toUpperCase() })
                          }
                          aria-label="Level code"
                        />
                      ) : (
                        <code>{level.levelCode}</code>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <input
                          className="field__input"
                          type="number"
                          min={1}
                          value={level.rank}
                          onChange={(event) =>
                            editLevel(index, { rank: Number(event.target.value) })
                          }
                          aria-label="Rank"
                        />
                      ) : (
                        level.rank
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            onChange({ levels: levels.filter((_, at) => at !== index) })
                          }
                        >
                          remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {editable ? (
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              levels: [...levels, { levelCode: '', rank: levels.length + 1 }],
            })
          }
        >
          Add a level
        </button>
      ) : null}

      <h2 className="diff__heading">Bands</h2>
      <div className="table__scroll">
        <table className="table table--tight">
          <thead>
            <tr>
              <th scope="col">Deviation type</th>
              <th scope="col">Product line</th>
              <th scope="col">Segment</th>
              <th scope="col">Above</th>
              <th scope="col">Up to</th>
              <th scope="col">Authority</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={index}>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={entry.deviationType}
                      placeholder="INDEBTEDNESS"
                      onChange={(event) =>
                        editEntry(index, { deviationType: event.target.value.toUpperCase() })
                      }
                      aria-label="Deviation type"
                    />
                  ) : (
                    <code>{entry.deviationType}</code>
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={entry.productLine}
                      onChange={(event) => editEntry(index, { productLine: event.target.value })}
                      aria-label="Product line"
                    />
                  ) : (
                    entry.productLine
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={entry.segment}
                      onChange={(event) => editEntry(index, { segment: event.target.value })}
                      aria-label="Segment"
                    />
                  ) : (
                    entry.segment
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={entry.amountAbove ?? ''}
                      placeholder="unbounded"
                      onChange={(event) =>
                        editEntry(index, { amountAbove: event.target.value || undefined })
                      }
                      aria-label="Amount above"
                    />
                  ) : (
                    (entry.amountAbove ?? '—')
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="field__input"
                      value={entry.amountUpTo ?? ''}
                      placeholder="unbounded"
                      onChange={(event) =>
                        editEntry(index, { amountUpTo: event.target.value || undefined })
                      }
                      aria-label="Amount up to"
                    />
                  ) : (
                    (entry.amountUpTo ?? '—')
                  )}
                </td>
                <td>
                  {editable ? (
                    <select
                      className="field__input"
                      value={entry.levelCode}
                      onChange={(event) => editEntry(index, { levelCode: event.target.value })}
                      aria-label="Authority level"
                    >
                      <option value="">—</option>
                      {levels.map((level) => (
                        <option key={level.levelCode} value={level.levelCode}>
                          {level.levelCode}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <code>{entry.levelCode}</code>
                  )}
                </td>
                <td>
                  {editable ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        onChange({ entries: entries.filter((_, at) => at !== index) })
                      }
                    >
                      remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              entries: [
                ...entries,
                {
                  deviationType: '',
                  productLine: '*',
                  segment: '*',
                  levelCode: levels[0]?.levelCode ?? '',
                },
              ],
            })
          }
        >
          Add a band
        </button>
      ) : null}
      <p className="run__note">
        Bands must not overlap within one deviation type, product line and segment: a ₹150,000
        deviation matching two bands would have two authority levels, and which one applied would
        depend on row order. The database refuses that, so the refusal holds however the row was
        written.
      </p>
    </>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}

/**
 * Which policy versions pin this asset, and which of them are live.
 *
 * Shown on every asset, not only a draft, because the question it answers arrives before the edit:
 * raising a cap here reaches no borrower until each dependent policy gets a new version of its own
 * and its own two approvals. An asset screen that shows the asset and not its dependents invites
 * the opposite assumption — that editing the asset edits the decision.
 */
function UsagePanel({ usage }: { usage: readonly AssetUsage[] | null }): React.JSX.Element | null {
  if (usage === null) return null;

  const live = usage.filter((row) => row.liveEnvironments !== '');

  return (
    <div className="usage">
      <h3 className="usage__title">Pinned by</h3>
      {usage.length === 0 ? (
        <p className="run__note">
          No policy version pins this asset yet. A change here reaches nothing until one does.
        </p>
      ) : (
        <>
          <p className="run__note">
            {usage.length} policy {usage.length === 1 ? 'version' : 'versions'} pin this asset
            {live.length > 0 ? (
              <>
                , <strong>{live.length}</strong> of them currently serving
              </>
            ) : null}
            . Each pinned an exact version, so none of them changes when this one does &mdash; every
            one needs a new policy version, and its own approvals, to pick a change up.
          </p>
          <table className="table table--tight">
            <thead>
              <tr>
                <th scope="col">Policy</th>
                <th scope="col">Version</th>
                <th scope="col">Pinned</th>
                <th scope="col">Status</th>
                <th scope="col">Live in</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((row) => (
                <tr key={`${row.policyCode}:${row.policyVersion}`}>
                  <td>
                    <code>{row.policyCode}</code>
                  </td>
                  <td>v{row.policyVersion}</td>
                  <td>@{row.assetVersion}</td>
                  <td>
                    <StatusPill status={row.policyStatus} />
                  </td>
                  <td>{row.liveEnvironments === '' ? '\u2014' : row.liveEnvironments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
