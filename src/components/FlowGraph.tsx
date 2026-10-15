/**
 * The policy flow as a graph, not a list (M5-03).
 *
 * **What a list could not show.** The flow was rendered as a vertical timeline of stages with their
 * steps underneath — accurate, and silent about the one thing that governs the decision: a FAIL in
 * a knockout stage stops evaluation, and every later stage never runs. On the reference policy that
 * is four of five stages, and a reader of the list has no way to see it. Control flow is the thing
 * a diagram is for.
 *
 * **Drawn with CSS and one inline SVG arrow per exit, not a graph library.** A PSF flow is a
 * sequence of stages, not an arbitrary DAG — the only branch in it is the knockout exit. A layout
 * engine for a straight line is a megabyte to compute `left: 240px`, and this bundle is a single
 * IIFE that already carries Monaco.
 *
 * **Coverage is overlaid rather than shown beside.** A step whose statuses no test reached is
 * marked here, because "which part of the flow is untested" is a question about the flow's shape:
 * an untested step in the knockout stage is a different risk from an untested one in the last
 * stage, and a percentage cannot say which you have.
 */

import type { PolicyIr } from '../api/runs';

import './FlowGraph.css';

/**
 * The rule codes with an unreached status, out of the coverage report's `CODE:STATUS` pairs.
 *
 * Exported and tested because the parse is the kind of thing that works on every example and then
 * does not: a rule code containing a colon, or an entry with no colon at all, would silently
 * produce a code that matches no step — and a flow with no "untested" marks looks exactly like a
 * fully tested flow. Which status is unreached matters less than that the step has an unexercised
 * branch, so only the code is kept.
 */
export function untestedSteps(uncoveredRuleStatuses: readonly string[]): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const pair of uncoveredRuleStatuses) {
    const colon = pair.lastIndexOf(':');
    // lastIndexOf, not indexOf: the STATUS is the part after the final colon, so a code that
    // contains one is still read correctly.
    codes.add(colon > 0 ? pair.slice(0, colon) : pair);
  }
  return codes;
}

/** One stage, with what its steps reference. */
type Stage = NonNullable<NonNullable<PolicyIr['flow']>['stages']>[number];

export function FlowGraph({
  flow,
  uncoveredRuleStatuses = [],
}: {
  flow: PolicyIr['flow'];
  /** `CODE:STATUS` pairs no test reached, as the coverage report names them. */
  uncoveredRuleStatuses?: readonly string[];
}): React.JSX.Element | null {
  const stages = flow?.stages ?? [];
  if (stages.length === 0) return null;

  // Indexed by rule code: a step is "untested" when any of its statuses was never reached. Which
  // status matters less than that the step has an unexercised branch.
  const untested = untestedSteps(uncoveredRuleStatuses);

  return (
    <div className="flow">
      <div className="flow__track" role="list" aria-label="Policy flow, in evaluation order">
        {stages.map((stage, index) => (
          <StageCard
            key={stage.name}
            stage={stage}
            position={index + 1}
            of={stages.length}
            untested={untested}
            remaining={stages.length - index - 1}
          />
        ))}

        <div className="flow__terminal" role="listitem">
          <span className="flow__terminal-label">Decision</span>
          <span className="flow__terminal-detail">
            the worst status any step reached, mapped by the decision table
          </span>
        </div>
      </div>

      <p className="run__note">
        Left to right is evaluation order. A <strong>knockout</strong> stage runs in full and then
        stops the flow if anything in it FAILed, so a knockout never hides a second finding
        alongside the first &mdash; but every step after it is reported NOT_APPLICABLE rather than
        passing. A step marked <span className="flow__step-mark">untested</span> has a status no
        test case has reached.
      </p>
    </div>
  );
}

function StageCard({
  stage,
  position,
  of,
  untested,
  remaining,
}: {
  stage: Stage;
  position: number;
  of: number;
  untested: ReadonlySet<string>;
  remaining: number;
}): React.JSX.Element {
  const steps = stage.steps ?? [];
  const knockout = stage.knockout === true;

  return (
    <div className="flow__stage-wrap" role="listitem">
      <div className={knockout ? 'flow__stage flow__stage--knockout' : 'flow__stage'}>
        <p className="flow__stage-head">
          <span className="flow__stage-index">
            {position}/{of}
          </span>
          {stage.name}
          {knockout ? <span className="chip chip--stop">KNOCKOUT</span> : null}
        </p>
        <ul className="flow__steps">
          {steps.map((step) => (
            <li key={step.ref} className="flow__step">
              <code>{step.ref}</code>
              <span className="flow__step-agg">{step.aggregate?.kind ?? 'WORST'}</span>
              {untested.has(step.ref) ? (
                <span className="flow__step-mark">untested</span>
              ) : null}
            </li>
          ))}
          {steps.length === 0 ? <li className="flow__step meta">no steps</li> : null}
        </ul>

        {knockout && remaining > 0 ? (
          // The exit. This is the whole reason the flow is a graph: on a FAIL here, the remaining
          // stages do not run, and a reader of a list cannot see that.
          <p className="flow__exit">
            any FAIL &rarr; stop. {remaining} later stage{remaining === 1 ? '' : 's'} report
            NOT_APPLICABLE
          </p>
        ) : null}
      </div>

      {/* An arrow after every stage, including the last — which points at the Decision terminal. */}
      <svg className="flow__arrow" viewBox="0 0 24 12" aria-hidden="true" focusable="false">
        <path d="M0 6 H17" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M16 2 L22 6 L16 10 Z" fill="currentColor" />
      </svg>
    </div>
  );
}
