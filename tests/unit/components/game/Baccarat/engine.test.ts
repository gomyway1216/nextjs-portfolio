import { describe, expect, it } from 'vitest';

import {
  RANKS,
  bankerDraws,
  beadPosition,
  bigRoad,
  burnCount,
  createShoe,
  dealHand,
  dealOrder,
  handTotal,
  isDragon7,
  isPanda8,
  playRound,
  settleBet,
  settleBets,
  shoeFinished,
  unseenCounts,
  type Card,
  type Hand,
  type Rank,
  type RoadEntry,
} from '@/components/game/Baccarat/engine';

const c = (rank: Rank, suit: Card['suit'] = '♠'): Card => ({ rank, suit });

/** Plays a hand from cards listed in dealing order (P, B, P, B, then third cards). */
function play(...ranks: Rank[]): Hand {
  const cards = ranks.map((r) => c(r));
  let i = 0;
  const hand = playRound(() => cards[i++]);
  expect(i, 'every listed card is used').toBe(cards.length);
  return hand;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('card values and the drawing rules', () => {
  it('counts only the last digit, with tens and faces worth 0', () => {
    expect(handTotal([c('7'), c('8')])).toBe(5);
    expect(handTotal([c('K'), c('Q')])).toBe(0);
    expect(handTotal([c('A'), c('T'), c('9')])).toBe(0);
    expect(handTotal([c('4'), c('5')])).toBe(9);
    expect(burnCount(c('K'))).toBe(10);
    expect(burnCount(c('T'))).toBe(10);
    expect(burnCount(c('A'))).toBe(1);
    expect(burnCount(c('7'))).toBe(7);
  });

  it('follows the standard banker tableau', () => {
    // Rows: banker total 0–7. Columns: player stood, then player third card 0–9.
    const tableau = [
      'D DDDDDDDDDD',
      'D DDDDDDDDDD',
      'D DDDDDDDDDD',
      'D DDDDDDDDSD',
      'D SSDDDDDDSS',
      'D SSSSDDDDSS',
      'S SSSSSSDDSS',
      'S SSSSSSSSSS',
    ];
    tableau.forEach((row, total) => {
      const [stood, thirds] = row.split(' ');
      expect(bankerDraws(total, null) ? 'D' : 'S', `banker ${total}, player stood`).toBe(stood);
      thirds.split('').forEach((cell, third) => {
        expect(bankerDraws(total, third) ? 'D' : 'S', `banker ${total} vs third card ${third}`).toBe(cell);
      });
    });
  });

  it('ends the hand on a natural', () => {
    const h = play('9', '5', 'K', '2');
    expect(h).toMatchObject({ playerTotal: 9, bankerTotal: 7, winner: 'player', natural: true });
    expect(h.player).toHaveLength(2);
    expect(h.banker).toHaveLength(2);
  });

  it('has the player draw on 0–5 and the banker react to the third card', () => {
    // Player 5 draws an 8 (→ 3); banker 3 stands against an 8.
    const h = play('2', 'A', '3', '2', '8');
    expect(h).toMatchObject({ playerTotal: 3, bankerTotal: 3, winner: 'tie', natural: false });
    expect(h.banker).toHaveLength(2);
    // Player 4 draws a 2 (→ 6); banker 6 stands against a 2.
    expect(play('2', '3', '2', '3', '2')).toMatchObject({ playerTotal: 6, bankerTotal: 6, winner: 'tie' });
    // … but draws against a 7: player 0 + 7 = 7, banker 6 + 1 = 7.
    expect(play('K', '3', 'Q', '3', '7', 'A')).toMatchObject({ playerTotal: 7, bankerTotal: 7, winner: 'tie' });
  });

  it('has the banker draw on 0–5 when the player stands', () => {
    const h = play('6', '4', 'K', 'A', '2'); // player 6 stands, banker 5 draws 2 → 7
    expect(h).toMatchObject({ playerTotal: 6, bankerTotal: 7, winner: 'banker' });
    expect(h.player).toHaveLength(2);
    expect(dealOrder(h)).toEqual({ player: [0, 2], banker: [1, 3, 4] });
    expect(dealOrder(play('2', 'A', '3', '2', '9', '5'))).toEqual({ player: [0, 2, 4], banker: [1, 3, 5] });
  });
});

describe('the shoe', () => {
  it('holds eight decks, burns by the first card and keeps a cut card back', () => {
    const shoe = createShoe(8, seeded(1));
    expect(shoe.cards).toHaveLength(416);
    for (const rank of RANKS) expect(shoe.cards.filter((x) => x.rank === rank)).toHaveLength(32);
    expect(shoe.burnCard).toBe(shoe.cards[0]);
    expect(shoe.next).toBe(1 + burnCount(shoe.burnCard));
    expect(shoe.cutIndex).toBe(400);
    expect(() => createShoe(0)).toThrow();
    expect(() => createShoe(9)).toThrow();
  });

  it('deals without mutating the shoe and tracks what is still unseen', () => {
    const shoe = createShoe(8, seeded(2));
    const { hand, shoe: after } = dealHand(shoe);
    const used = hand.player.length + hand.banker.length;
    expect(after.next).toBe(shoe.next + used);
    expect(shoe.next).toBe(1 + shoe.burned);
    expect(hand.player[0]).toBe(shoe.cards[shoe.next]);
    expect(hand.banker[0]).toBe(shoe.cards[shoe.next + 1]);
    const unseen = unseenCounts(after);
    // The exposed burn card and the dealt cards are seen; the burned ones are not.
    expect(unseen.reduce((a, b) => a + b, 0)).toBe(416 - 1 - used);
    expect(unseenCounts(shoe).reduce((a, b) => a + b, 0)).toBe(415);
  });

  it('plays a whole shoe out to the cut card', () => {
    let shoe = createShoe(8, seeded(3));
    let hands = 0;
    while (!shoeFinished(shoe)) {
      shoe = dealHand(shoe).shoe;
      hands++;
    }
    expect(shoe.next).toBeGreaterThanOrEqual(shoe.cutIndex);
    expect(shoe.next).toBeLessThanOrEqual(shoe.cards.length);
    expect(hands).toBeGreaterThan(70);
    expect(hands).toBeLessThan(90);
  });
});

describe('settling bets', () => {
  it('pays Player 1:1 and Banker 0.95:1, pushing both on a tie', () => {
    const banker = play('6', '4', 'K', 'A', '2'); // banker 7 beats 6 (two-card player, three-card banker)
    expect(settleBet('banker', 5, banker, 'commission')).toMatchObject({ outcome: 'win', profit: 4.75, returned: 9.75 });
    expect(settleBet('player', 5, banker, 'commission')).toMatchObject({ outcome: 'lose', returned: 0 });
    const tie = play('2', '3', '2', '3', '2');
    expect(settleBet('player', 10, tie, 'commission')).toMatchObject({ outcome: 'push', returned: 10 });
    expect(settleBet('banker', 10, tie, 'ez')).toMatchObject({ outcome: 'push', returned: 10 });
    expect(settleBet('tie', 10, tie, 'commission')).toMatchObject({ outcome: 'win', profit: 80, returned: 90 });
  });

  it('pushes an EZ banker win with a three-card 7 and pays the Dragon 7', () => {
    const dragon = play('6', '4', 'K', 'A', '2'); // player 6 stands; banker 5 draws a 2 → three-card 7 beats 6
    expect(isDragon7(dragon)).toBe(true);
    expect(settleBet('banker', 20, dragon, 'ez')).toMatchObject({ outcome: 'push', returned: 20 });
    expect(settleBet('dragon7', 5, dragon, 'ez')).toMatchObject({ outcome: 'win', profit: 200, returned: 205 });
    // A two-card banker win is paid in full on the EZ table.
    const twoCard = play('K', '4', '6', '3'); // player 6 stands, banker 7 stands
    expect(twoCard.winner).toBe('banker');
    expect(settleBet('banker', 20, twoCard, 'ez')).toMatchObject({ outcome: 'win', profit: 20 });
    expect(settleBet('dragon7', 5, twoCard, 'ez').outcome).toBe('lose');
  });

  it('pays the Panda 8 and the pairs', () => {
    const panda = play('2', '3', '3', '4', '3'); // player 5 draws a 3 → three-card 8; banker 7 stands
    expect(panda).toMatchObject({ playerTotal: 8, bankerTotal: 7, winner: 'player' });
    expect(isPanda8(panda)).toBe(true);
    expect(isDragon7(panda)).toBe(false);
    expect(settleBet('panda8', 4, panda, 'ez')).toMatchObject({ outcome: 'win', profit: 100 });
    expect(settleBet('player', 4, panda, 'ez')).toMatchObject({ outcome: 'win', profit: 4 });
    const pairs = play('9', '7', '9', '7'); // player natural 8 with a pair of nines, banker pair of sevens
    expect(settleBet('playerPair', 5, pairs, 'commission')).toMatchObject({ outcome: 'win', profit: 55 });
    expect(settleBet('bankerPair', 5, pairs, 'commission')).toMatchObject({ outcome: 'win', profit: 55 });
    // K and Q are both worth 0 but are not a pair.
    const noPair = play('K', '9', 'Q', 'K'); // banker natural 9
    expect(settleBet('playerPair', 5, noPair, 'commission').outcome).toBe('lose');
  });

  it('settles a whole layout at once', () => {
    const hand = play('9', '5', 'K', '2'); // player natural 9 beats 7
    const { results, returned } = settleBets({ player: 10, banker: 5, tie: 1, bankerPair: 0 }, hand, 'commission');
    expect(results.map((r) => r.id)).toEqual(['player', 'banker', 'tie']);
    expect(returned).toBe(20);
  });
});

describe('scoreboards', () => {
  const e = (winner: RoadEntry['winner']): RoadEntry => ({ winner, playerPair: false, bankerPair: false, natural: false });
  const seq = (s: string) => s.split('').map((ch) => e(ch === 'B' ? 'banker' : ch === 'P' ? 'player' : 'tie'));

  it('fills the bead plate six to a column', () => {
    expect(beadPosition(0)).toEqual({ col: 0, row: 0 });
    expect(beadPosition(5)).toEqual({ col: 0, row: 5 });
    expect(beadPosition(6)).toEqual({ col: 1, row: 0 });
  });

  it('starts a new big-road column on every change and marks ties on the previous hand', () => {
    const { cells, leadingTies } = bigRoad(seq('TTBBPTTPB'));
    expect(leadingTies).toBe(2);
    expect(cells.map(({ col, row, winner, ties }) => [col, row, winner[0], ties])).toEqual([
      [0, 0, 'b', 0],
      [0, 1, 'b', 0],
      [1, 0, 'p', 2],
      [1, 1, 'p', 0],
      [2, 0, 'b', 0],
    ]);
  });

  it('turns a long streak into a dragon tail, and the next streak turns early under it', () => {
    const { cells } = bigRoad(seq('BBBBBBBBPPPPPPPB'));
    const pos = cells.map(({ col, row }) => [col, row]);
    // Eight bankers: down to row 5, then right along the bottom.
    expect(pos.slice(0, 8)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5]]);
    // Seven players in column 1: row 5 is taken by the tail, so it turns at row 4.
    expect(pos.slice(8, 15)).toEqual([[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4]]);
    expect(pos[15]).toEqual([2, 0]);
    expect(new Set(pos.map(String)).size).toBe(pos.length);
  });
});
