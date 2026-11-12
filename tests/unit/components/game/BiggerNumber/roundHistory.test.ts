import { describe, it, expect } from 'vitest';
import {
  historyFromLog,
  summarizeMatch,
  trackTiles,
  type RoundRecord,
} from '@/components/game/BiggerNumber/roundHistory';
import { ALL_CARDS } from '@/components/game/BiggerNumber/types';
import { freshHand, removeCard } from '@/components/game/BiggerNumber/gameLogic';
import { getStrings } from '@/components/game/BiggerNumber/i18n';

function rec(partial: Partial<RoundRecord>): RoundRecord {
  return {
    round: 1,
    yourCard: 1,
    opponentCard: 2,
    winner: 'opponent',
    cardsReturnedToHand: false,
    ...partial,
  };
}

describe('trackTiles', () => {
  it('lists the full tile set in order, all in hand for a fresh hand', () => {
    const tiles = trackTiles(freshHand());
    expect(tiles.map((t) => t.card)).toEqual(ALL_CARDS);
    expect(tiles.every((t) => t.inHand)).toBe(true);
  });

  it('flags exactly the tiles that left the hand', () => {
    const hand = removeCard(removeCard(freshHand(), 9), 'dragon');
    const played = trackTiles(hand)
      .filter((t) => !t.inHand)
      .map((t) => t.card);
    expect(played).toEqual([9, 'dragon']);
  });

  it('marks everything played for an empty hand', () => {
    expect(trackTiles([]).some((t) => t.inHand)).toBe(false);
  });

  it('counts a tile that was just played as gone, even while the hand still lists it', () => {
    const played = trackTiles(freshHand(), 7)
      .filter((t) => !t.inHand)
      .map((t) => t.card);
    expect(played).toEqual([7]);
    expect(trackTiles(freshHand(), null).every((t) => t.inHand)).toBe(true);
  });
});

describe('summarizeMatch', () => {
  it('returns zeros and null margins for an empty history', () => {
    expect(summarizeMatch([])).toEqual({
      yourWins: 0,
      opponentWins: 0,
      ties: 0,
      yourAvgMargin: null,
      opponentAvgMargin: null,
    });
  });

  it('counts wins, losses and ties', () => {
    const s = summarizeMatch([
      rec({ yourCard: 9, opponentCard: 3, winner: 'you' }),
      rec({ yourCard: 2, opponentCard: 5, winner: 'opponent' }),
      rec({ yourCard: 4, opponentCard: 4, winner: 'tie' }),
      rec({ yourCard: 4, opponentCard: 4, winner: 'tie', cardsReturnedToHand: true }),
    ]);
    expect(s.yourWins).toBe(1);
    expect(s.opponentWins).toBe(1);
    expect(s.ties).toBe(2);
  });

  it('averages the number gap over each side’s own wins', () => {
    const s = summarizeMatch([
      rec({ yourCard: 9, opponentCard: 3, winner: 'you' }), // 6
      rec({ yourCard: 5, opponentCard: 4, winner: 'you' }), // 1
      rec({ yourCard: 2, opponentCard: 7, winner: 'opponent' }), // 5
    ]);
    expect(s.yourAvgMargin).toBeCloseTo(3.5);
    expect(s.opponentAvgMargin).toBeCloseTo(5);
  });

  it('leaves dragon rounds out of the margin but still counts the win', () => {
    const s = summarizeMatch([
      rec({ yourCard: 'dragon', opponentCard: 8, winner: 'you' }),
      rec({ yourCard: 1, opponentCard: 'dragon', winner: 'you' }),
      rec({ yourCard: 6, opponentCard: 4, winner: 'you' }),
    ]);
    expect(s.yourWins).toBe(3);
    expect(s.yourAvgMargin).toBeCloseTo(2);
    expect(s.opponentAvgMargin).toBeNull();
  });
});

describe('historyFromLog', () => {
  const entry = {
    round: 1,
    p1Id: 'a',
    p2Id: 'b',
    p1Card: 7,
    p2Card: 'dragon',
    winnerId: 'b',
    involvedDragon: true,
    cardsReturnedToHand: false,
    timestamp: 1,
  };

  it('returns an empty history for a missing or non-object log', () => {
    expect(historyFromLog(undefined, 'a', 'b')).toEqual([]);
    expect(historyFromLog(null, 'a', 'b')).toEqual([]);
    expect(historyFromLog('nope', 'a', 'b')).toEqual([]);
  });

  it('maps an entry from the first player’s point of view', () => {
    expect(historyFromLog([entry], 'a', 'b')).toEqual([
      {
        round: 1,
        yourCard: 7,
        opponentCard: 'dragon',
        winner: 'opponent',
        cardsReturnedToHand: false,
      },
    ]);
  });

  it('swaps the cards and the winner for the second player', () => {
    expect(historyFromLog([entry], 'b', 'a')).toEqual([
      {
        round: 1,
        yourCard: 'dragon',
        opponentCard: 7,
        winner: 'you',
        cardsReturnedToHand: false,
      },
    ]);
  });

  it('keeps replayed ties and reads a keyed-object log in order', () => {
    const tie = {
      ...entry,
      p1Card: 4,
      p2Card: 4,
      winnerId: null,
      cardsReturnedToHand: true,
    };
    const history = historyFromLog({ 0: tie, 1: { ...entry, round: 1 } }, 'a', 'b');
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ winner: 'tie', cardsReturnedToHand: true });
    expect(history[1]).toMatchObject({ winner: 'opponent' });
  });

  it('reads a tie whose null winner was dropped by the database', () => {
    const { winnerId: _dropped, ...tie } = { ...entry, p1Card: 4, p2Card: 4 };
    expect(historyFromLog([tie], 'a', 'b')).toEqual([
      { round: 1, yourCard: 4, opponentCard: 4, winner: 'tie', cardsReturnedToHand: false },
    ]);
  });

  it('skips malformed entries and entries between other players', () => {
    const history = historyFromLog(
      [
        null,
        'junk',
        { ...entry, p1Card: 42 },
        { ...entry, round: 'x' },
        { ...entry, p1Id: 'someone-else' },
        { ...entry, winnerId: 'someone-else' },
        { ...entry, winnerId: 42 },
        entry,
      ],
      'a',
      'b',
    );
    expect(history).toHaveLength(1);
  });
});

describe('round log strings', () => {
  it.each(['ja', 'en'] as const)('are complete and distinct per outcome (%s)', (language) => {
    const t = getStrings(language);
    const lines = [
      t.roundLogEntry(3, '7', '5', 'you', false),
      t.roundLogEntry(3, '7', '5', 'opponent', false),
      t.roundLogEntry(3, '7', '7', 'tie', false),
      t.roundLogEntry(3, '7', '7', 'tie', true),
    ];
    expect(new Set(lines).size).toBe(4);
    for (const line of lines) expect(line).toContain('3');
    expect(new Set(Object.values(t.resultMark)).size).toBe(3);
    expect(t.summaryRecord(5, 3, 1)).toMatch(/5.*3.*1/);
    expect(t.tilePlayed('x')).not.toBe(t.tileInHand('x'));
  });
});
