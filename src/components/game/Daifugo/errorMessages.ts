/**
 * Daifugo (大富豪) - Error code -> localized message mapping and
 * play-log formatting helpers.
 *
 * gameLogic validators return structured `DaifugoPlayError` codes so the
 * engine stays locale-independent; display components resolve them here
 * against the games.daifugo.ui.errors.* keys in src/locales.
 */

import type { DaifugoPlayError } from './gameLogic';
import type { DaifugoLogEntry } from './multiplayerTypes';
import type { CardSuit } from './types';
import { JOKER_RANK, SUIT_SYMBOL, rankToLabel } from './types';

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

const ERROR_KEY_PREFIX = 'games.daifugo.ui.errors';

/** Resolve a structured validator error to a localized user-facing message. */
export function daifugoErrorMessage(translate: TranslateFn, error: DaifugoPlayError): string {
  switch (error.code) {
    case 'needCount':
      return translate(`${ERROR_KEY_PREFIX}.needCount`, { count: error.count });
    case 'selectGiveCount':
      return translate(`${ERROR_KEY_PREFIX}.selectGiveCount`, { count: error.count });
    case 'gekishibaRankOnly':
      return translate(`${ERROR_KEY_PREFIX}.gekishibaRankOnly`, { rank: rankToLabel(error.rank) });
    default:
      return translate(`${ERROR_KEY_PREFIX}.${error.code}`);
  }
}

/**
 * Render the cards of a play-log entry, e.g. "♠4♦4" for a pair of 4s or
 * "♠3-♠5" for a straight. Log entries only carry count/rankKey/signature,
 * so the card list is reconstructed from the suit signature.
 */
export function formatDaifugoLogCards(entry: DaifugoLogEntry): string {
  const { cardCount, rankKey, signature } = entry;
  if (!cardCount || !rankKey) return '';

  if (entry.playKind === 'straight') {
    const suitChar = signature?.[0] as CardSuit | undefined;
    const symbol = suitChar ? SUIT_SYMBOL[suitChar] ?? '' : '';
    const startRank = rankKey - cardCount + 1;
    return `${symbol}${rankToLabel(startRank)}-${symbol}${rankToLabel(rankKey)}`;
  }

  if (rankKey === JOKER_RANK) return SUIT_SYMBOL.J;

  if (signature) {
    return signature
      .split('')
      .map((suitChar) => `${SUIT_SYMBOL[suitChar as CardSuit] ?? ''}${rankToLabel(rankKey)}`)
      .join('');
  }

  return rankToLabel(rankKey);
}
