/**
 * Doubt (ダウト) - Card Types
 */

export type CardSuit = 'S' | 'H' | 'D' | 'C';

export type CardRank = number; // 1(A) ... 13(K)

export interface Card {
  id: string;
  suit: CardSuit;
  rank: CardRank;
}

export const SUITS: CardSuit[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL: Record<CardSuit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const MIN_RANK = 1;
export const MAX_RANK = 13;

export function rankToLabel(rank: CardRank): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function cardToShortLabel(card: Card): string {
  return `${rankToLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

