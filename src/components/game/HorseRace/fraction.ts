/**
 * Exact fractions, in whole numbers of any size (BigInt), for the race card's
 * chances: every chance and every return the machine publishes is worked out
 * with these, so that "every win ticket brings back 89.6%" is true to the last
 * digit, and the tests can check it by adding up every way a race can end.
 */

export interface Fraction {
  /** Numerator and denominator, in lowest terms, the denominator above nothing. */
  n: bigint;
  d: bigint;
}

// Written as BigInt(…), not as 0n: the site's TypeScript targets ES2017, which has no BigInt literals.
const B0 = BigInt(0);
const B1 = BigInt(1);

const abs = (x: bigint): bigint => (x < B0 ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== B0) [x, y] = [y, x % y];
  return x;
}

/** The fraction n / d, in lowest terms. */
export function frac(n: bigint | number, d: bigint | number = B1): Fraction {
  let num = BigInt(n);
  let den = BigInt(d);
  if (den === B0) throw new RangeError('A fraction over nothing');
  if (den < B0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return g > B1 ? { n: num / g, d: den / g } : { n: num, d: den };
}

export const ZERO = frac(0);
export const ONE = frac(1);

export const add = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.n, a.d * b.d);
export const div = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d, a.d * b.n);
export const sum = (values: readonly Fraction[]): Fraction => values.reduce(add, ZERO);
/** Negative when a < b, 0 when equal, positive when a > b. */
export const compare = (a: Fraction, b: Fraction): number => {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
};
export const same = (a: Fraction, b: Fraction): boolean => a.n === b.n && a.d === b.d;

const bits = (x: bigint): number => abs(x).toString(2).length;

/** The fraction as the nearest ordinary number, however many digits it has. */
export function toNumber(f: Fraction): number {
  // Both parts are cut down to about 60 bits first, so that neither overflows on its way to a double.
  const over = Math.max(bits(f.n), bits(f.d)) - 60;
  if (over <= 0) return Number(f.n) / Number(f.d);
  const shift = BigInt(over);
  const d = f.d >> shift;
  if (d === B0) return 0;
  return Number(f.n >> shift) / Number(d);
}
