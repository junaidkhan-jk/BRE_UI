import type { Decision, Outcome, RuleStatus } from '../api/types';

import './StatusPill.css';

/** The three tones the whole workspace shares (wireframe "Status colours"). */
type Tone = 'pass' | 'dev' | 'fail' | 'draft' | 'superseded';

const OUTCOME_TONE: Record<Outcome, Tone> = {
  PASS: 'pass',
  DEVIATION: 'dev',
  REFER: 'dev',
  FAIL: 'fail',
  ERROR: 'fail',
  DATA_MISSING: 'dev',
  NOT_APPLICABLE: 'draft',
};

const DECISION_TONE: Record<Decision, Tone> = {
  APPROVE: 'pass',
  APPROVE_WITH_DEVIATION: 'dev',
  REFER: 'dev',
  DECLINE: 'fail',
};

const RULE_STATUS: Record<RuleStatus, { tone: Tone; label: string }> = {
  live: { tone: 'pass', label: 'Live' },
  in_review: { tone: 'dev', label: 'In Review' },
  draft: { tone: 'draft', label: 'Draft' },
  superseded: { tone: 'superseded', label: 'Superseded' },
};

/**
 * A status badge.
 *
 * Always renders the WORD alongside the colour. Colour alone would make "did this application
 * pass" unanswerable for roughly one man in twelve, and a credit decision is not a thing to
 * communicate by hue.
 *
 * DATA_MISSING and REFER both take the amber tone because both mean the same thing to the person
 * reading the screen: a human has to look at this. They keep their own labels, so the reason is
 * still visible.
 */
export function StatusPill(props: {
  readonly outcome?: Outcome;
  readonly decision?: Decision;
  readonly ruleStatus?: RuleStatus;
  readonly label?: string;
}): React.JSX.Element {
  const { tone, label } = resolve(props);
  return (
    <span className={`pill pill--${tone}`} data-tone={tone}>
      {label}
    </span>
  );
}

function resolve(props: {
  outcome?: Outcome;
  decision?: Decision;
  ruleStatus?: RuleStatus;
  label?: string;
}): { tone: Tone; label: string } {
  if (props.ruleStatus) {
    const mapped = RULE_STATUS[props.ruleStatus];
    return { tone: mapped.tone, label: props.label ?? mapped.label };
  }
  if (props.decision) {
    return {
      tone: DECISION_TONE[props.decision],
      label: props.label ?? props.decision.replaceAll('_', ' '),
    };
  }
  if (props.outcome) {
    return {
      tone: OUTCOME_TONE[props.outcome],
      label: props.label ?? props.outcome.replaceAll('_', ' '),
    };
  }
  return { tone: 'draft', label: props.label ?? 'Unknown' };
}
