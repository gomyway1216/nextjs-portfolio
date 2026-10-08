/** Number formatting shared by the three tabs. */

export const money = (amount: number) => `$${amount.toFixed(2)}`;

/** A fraction as a percentage with no trailing zeros: 20%, 6.25%. */
export const percent = (fraction: number, digits = 2) => `${Number((fraction * 100).toFixed(digits))}%`;

/** A rate with its sign, to a fixed number of digits: +2.01%, −0.25%, −∞. */
export function signedPercent(rate: number, digits = 2): string {
  if (rate === -Infinity) return '−∞';
  const sign = rate > 0 ? '+' : rate < 0 ? '−' : '';
  return `${sign}${(Math.abs(rate) * 100).toFixed(digits)}%`;
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (n: number) =>
  (n < 0 ? '⁻' : '') +
  String(Math.abs(n))
    .split('')
    .map((digit) => SUPERSCRIPT[Number(digit)])
    .join('');

/**
 * A bankroll as a multiple of where it started. The range runs from nothing to
 * more money than exists, so the notation changes with the size: ×0.48, ×420,
 * ×123K, ×1/296K for small fractions, and a power of ten beyond that.
 */
export function formatMultiple(multiple: number, locale: string): string {
  if (multiple === 0) return '×0';
  if (!Number.isFinite(multiple)) return '×∞';
  const exponent = Math.log10(multiple);
  if (exponent >= 15 || exponent <= -15) return `×10${superscript(Math.round(exponent))}`;
  const compact = (value: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumSignificantDigits: 3 }).format(value);
  if (multiple >= 1000) return `×${compact(multiple)}`;
  if (multiple >= 0.01) return `×${Number(multiple.toPrecision(3)).toLocaleString(locale, { maximumSignificantDigits: 3 })}`;
  return `×1/${compact(1 / multiple)}`;
}
