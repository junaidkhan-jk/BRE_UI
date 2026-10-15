import { describe, expect, it } from 'vitest';

import { grouped, rupees } from './format';

/**
 * The reason this is tested at all: 'en-US' and 'en-IN' group the same number differently, and
 * 200000 rendered as "200,000" instead of "2,00,000" reads as a different amount to anybody who
 * works in lakhs. These are deviation-approval bands — whether a branch manager or a regional head
 * signs a loan — so a band misread by a factor of ten is an approval given by the wrong person.
 *
 * A locale regression is silent: the page still renders, the number is still right, and only a
 * reader notices. That is exactly what a test is for.
 */
describe('rupees', () => {
  it('groups in lakhs, not thousands', () => {
    // The assertion that matters. 'en-US' would give ₹200,000.00 here.
    expect(rupees('200000')).toContain('2,00,000');
    expect(rupees('10000000')).toContain('1,00,00,000');
    expect(rupees('5000')).toContain('5,000');
  });

  it('shows an em dash for an absent bound rather than ₹0', () => {
    // An unbounded band is unbounded, and ₹0.00 would read as a band that approves nothing.
    expect(rupees(null)).toBe('—');
    expect(rupees(undefined)).toBe('—');
    expect(rupees('  ')).toBe('—');
  });

  it('passes a non-number through rather than printing ₹NaN', () => {
    expect(rupees('unbounded')).toBe('unbounded');
  });

  it('takes a string, because every amount in this system is a decimal string', () => {
    // §5.2 stores amounts as strings and the engine parses them as BigDecimal, so that no float
    // ever rounds a rupee. Two decimal places survive the round trip.
    expect(rupees('30000.50')).toContain('30,000.5');
  });
});

describe('grouped', () => {
  it('groups without a currency symbol', () => {
    expect(grouped(200000)).toBe('2,00,000');
  });
});
