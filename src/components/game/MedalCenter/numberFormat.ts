/**
 * Numbers as the medal center's front writes them while it wakes up: the medals on the counter and the return on each
 * machine's plate.
 *
 * The first number a page formats with `Intl` (or `toLocaleString`) loads its locale's ICU data: about 22 ms on a
 * phone slowed four times, against a few hundredths of a millisecond for every number after it. On the medal
 * center's front that first number was a plate's return, in the middle of hydration's long task, and the counter's
 * medals came right after it in the same task. In both of the site's languages these numbers are written the same
 * plain way (ASCII digits, a comma between each three, a point before the decimal), so they are written here without
 * asking ICU, exactly as `toLocaleString` writes them (tests/unit/components/game/MedalCenter/numberFormat.test.ts
 * holds the two to the same string). Anything else goes to a kept `Intl.NumberFormat`.
 */

const kept = new Map<string, Intl.NumberFormat>();

/**
 * The formatter for a locale and options, made the first time it is asked for and kept: `toLocaleString` with options
 * makes a new one on every call. It writes what `toLocaleString` writes with the same locale and options.
 */
export function numberFormat(locale: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${locale}\u0000${JSON.stringify(options)}`;
  let format = kept.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    kept.set(key, format);
  }
  return format;
}

/** The site's two languages, which write these numbers the same plain way. */
const PLAIN = new Set(['en-US', 'ja-JP']);

/** Digits with a comma between each three, from the right: "1234567" is "1,234,567". */
const grouped = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Not negative, and not minus zero, which `Intl` writes as "-0". */
const plainSign = (value: number): boolean => value > 0 || Object.is(value, 0);

/** A count, as `value.toLocaleString(locale)` writes it: "1,234". */
export function formatCount(value: number, locale: string): string {
  if (PLAIN.has(locale) && Number.isSafeInteger(value) && plainSign(value)) return grouped(String(value));
  return numberFormat(locale).format(value);
}

const TENTHS: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

/**
 * A percentage to one decimal place, as a plate shows a return: "99.5%". Rounded as ICU rounds it: the shortest
 * decimal that reads back as the number ("0.15", not the 0.1499… the double holds), to the nearer tenth, a half up.
 */
export function percentToTenth(value: number, locale: string): string {
  const text = String(value);
  if (PLAIN.has(locale) && Number.isFinite(value) && plainSign(value) && value < 1e9 && !text.includes('e')) {
    const [whole, fraction = ''] = text.split('.');
    const tenths = Number(whole) * 10 + Number(fraction[0] ?? '0') + (fraction.length > 1 && fraction[1] >= '5' ? 1 : 0);
    return `${grouped(String(Math.floor(tenths / 10)))}.${tenths % 10}%`;
  }
  return `${numberFormat(locale, TENTHS).format(value)}%`;
}
