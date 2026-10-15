import { describe, expect, it } from 'vitest';

import { untestedSteps } from './FlowGraph';

/**
 * Why this is tested at all: a flow with no "untested" marks is indistinguishable from a fully
 * tested flow. If this parse returns a code that matches no step, the graph says every step is
 * covered — which is the most misleading thing a coverage overlay can do, and nothing else in the
 * UI would contradict it.
 */
describe('untestedSteps', () => {
  it('takes the rule code out of a CODE:STATUS pair', () => {
    expect(untestedSteps(['SCR_SCREENING:FAIL'])).toEqual(new Set(['SCR_SCREENING']));
  });

  it('collapses several statuses of one rule to one code', () => {
    // A rule with both FAIL and REFER unreached is still one untested step on the graph.
    expect(untestedSteps(['POL_MIN_AGE:FAIL', 'POL_MIN_AGE:REFER'])).toEqual(
      new Set(['POL_MIN_AGE']),
    );
  });

  it('splits on the LAST colon, so a code containing one survives', () => {
    expect(untestedSteps(['NS:RULE:FAIL'])).toEqual(new Set(['NS:RULE']));
  });

  it('keeps an entry with no colon rather than dropping it', () => {
    // Dropping it would under-report: a step that IS untested would show as covered.
    expect(untestedSteps(['BARE_CODE'])).toEqual(new Set(['BARE_CODE']));
  });

  it('is empty for no input, not undefined', () => {
    expect(untestedSteps([])).toEqual(new Set());
  });
});
