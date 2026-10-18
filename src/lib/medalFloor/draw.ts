/**
 * The floor jackpot's draw, on the server only: a number in [0, 1) from
 * `node:crypto`, 48 bits of it, far finer than the 1 in 40,000 it is compared
 * with. Never the browser's: nothing a player's browser says can choose it.
 * Kept on its own so that the routes' tests can put a known number in.
 */

import { randomBytes } from 'node:crypto';

export function drawUniform(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

/** Eight hex digits, for a win's name. */
export function drawName(): string {
  return randomBytes(4).toString('hex');
}
