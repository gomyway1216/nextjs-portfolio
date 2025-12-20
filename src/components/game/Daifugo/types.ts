/**
 * Daifugo (大富豪) - Card Types
 */

export type CardSuit = 'S' | 'H' | 'D' | 'C' | 'J';

export type CardRank = number;

export interface Card {
  id: string;
  suit: CardSuit;
  rank: CardRank;
}

export const JOKER_RANK = 16;
export const TWO_RANK = 15;

export const SUITS: Exclude<CardSuit, 'J'>[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL: Record<CardSuit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
  J: '🃏',
};

export function isJoker(card: Card): boolean {
  return card.suit === 'J' || card.rank === JOKER_RANK;
}

export function rankToLabel(rank: CardRank): string {
  if (rank === JOKER_RANK) return 'JOKER';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  if (rank === TWO_RANK) return '2';
  return String(rank);
}

export function cardToShortLabel(card: Card): string {
  if (isJoker(card)) return SUIT_SYMBOL.J;
  return `${rankToLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

