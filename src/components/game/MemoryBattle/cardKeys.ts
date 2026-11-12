/**
 * Keyboard keys for the cards, by board position: 1–9 for the first nine, 0
 * for the tenth, then A, B, C… (the largest board has 24 cards, so A–N).
 */

const DIGIT_KEYS = '1234567890';
const LETTER_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** How many board positions have a key. */
export const MAX_KEYED_CARDS = DIGIT_KEYS.length + LETTER_KEYS.length;

/** The key shown on (and pressed for) the card at `index`, or null past the last key. */
export function cardKeyLabel(index: number): string | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (index < DIGIT_KEYS.length) return DIGIT_KEYS[index];
  return LETTER_KEYS[index - DIGIT_KEYS.length] ?? null;
}

/** The board position a pressed key (`KeyboardEvent.key`) stands for, or null. */
export function cardIndexForKey(key: string): number | null {
  if (key.length !== 1) return null;
  const digit = DIGIT_KEYS.indexOf(key);
  if (digit >= 0) return digit;
  const letter = LETTER_KEYS.indexOf(key.toUpperCase());
  return letter >= 0 ? DIGIT_KEYS.length + letter : null;
}
