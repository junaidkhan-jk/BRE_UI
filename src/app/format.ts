/**
 * Locale-correct formatting for an Indian lender (M5-01).
 *
 * **This is not a translation layer, and the difference matters.** The Studio's users are credit
 * policy analysts, and the strings on these screens — DRAFT, IN_REVIEW, PASS, DEVIATION — are the
 * governance vocabulary that 00_Decisions fixes in English and that the API returns verbatim. A
 * translation framework would put every one of them behind a key and buy nothing for anyone,
 * because nobody has asked for a second language and the terms would not be translated anyway.
 *
 * What an Indian product does need, today, is **digit grouping**. `Intl.NumberFormat('en-IN')`
 * renders 200000 as 2,00,000 — lakhs and crores — and the default 'en-US' renders it as 200,000.
 * Those read as different amounts to anybody who works in lakhs, and the amounts on these screens
 * are deviation-approval bands: whether a branch manager or a regional head signs off a loan. A
 * band misread by a factor of ten is an approval given by the wrong person.
 *
 * Stdlib, not a library. Intl is in every browser this app supports.
 */

/** Indian digit grouping: 200000 reads 2,00,000, not 200,000. */
const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const PLAIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/**
 * An amount as rupees, grouped the Indian way.
 *
 * Takes a string because every amount in this system is a decimal string end to end — §5.2 stores
 * them as strings and the engine parses them as BigDecimal, precisely so that no float ever rounds
 * a rupee. Parsing to a JS number here is for display only.
 *
 * Returns the input unchanged when it is not a number, rather than "₹NaN": a half-typed amount in
 * an editor is not an error worth shouting about, and an unparseable one the server sent is
 * something to show rather than hide.
 */
export function rupees(value: string | null | undefined): string {
  if (value == null || value.trim() === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? RUPEES.format(parsed) : value;
}

/** A plain count or ratio, grouped the Indian way. No currency symbol. */
export function grouped(value: number): string {
  return PLAIN.format(value);
}
