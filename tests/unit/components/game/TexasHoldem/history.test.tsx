import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { decideCpuAction } from '@/components/game/TexasHoldem/ai';
import {
  advanceRunout,
  applyPlayerAction,
  createGame,
  startNextHand,
  type Card,
  type GameState,
} from '@/components/game/TexasHoldem/engine';
import { formatLog, signedChips } from '@/components/game/TexasHoldem/format';
import {
  appendRecord,
  cardsDealtOn,
  recordHand,
  summarizeSession,
  type HandRecord,
} from '@/components/game/TexasHoldem/history';
import { HISTORY_VISIBLE_HANDS, HistoryPanel } from '@/components/game/TexasHoldem/HistoryPanel';
import { getHoldemStrings } from '@/components/game/TexasHoldem/i18n';

const cards = (input: string): Card[] => {
  const suitMap: Record<string, Card['suit']> = { s: '♠', h: '♥', d: '♦', c: '♣' };
  return input.split(' ').map((token) => ({ rank: token[0] as Card['rank'], suit: suitMap[token[1]] }));
};

const seededRng = (start: number) => {
  let seed = start;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
};

/** Heads-up hand where both players shove preflop and the board is fixed. */
function allInHand(heroHole: string, villainHole: string, board: string): GameState {
  const game = createGame(2, { rng: () => 0.27 });
  const [flop1, flop2, flop3, turn, river] = cards(board);
  const burn = cards('2c')[0];
  const rigged: GameState = {
    ...game,
    players: game.players.map((player, index) => ({ ...player, hole: cards(index === 0 ? heroHole : villainHole) })),
    deck: [burn, flop1, flop2, flop3, burn, turn, burn, river],
  };
  const first = rigged.currentActor!;
  let state = applyPlayerAction(rigged, first, { type: 'raise', raiseTo: 200 });
  state = applyPlayerAction(state, state.currentActor!, { type: 'call' });
  while (state.runout) state = advanceRunout(state);
  return state;
}

const record = (overrides: Partial<HandRecord>): HandRecord => ({
  handNumber: 1,
  players: [{ name: 'You', isHuman: true }, { name: 'Solver 01', isHuman: false }],
  heroHole: cards('As Kd'),
  board: [],
  pot: 3,
  heroNet: 0,
  outcome: 'folded',
  vpip: false,
  showdown: false,
  shownHands: [],
  log: [],
  ...overrides,
});

describe('Texas Hold’em hand history', () => {
  it('records nothing while a hand is still being played', () => {
    expect(recordHand(createGame(6, { rng: () => 0.27 }))).toBeNull();
  });

  it('records a won showdown with the tabled hands, the board and the hero net', () => {
    const state = allInHand('As Ah', 'Kd Kc', '7s 8d 2h 3s 9c');
    const hand = recordHand(state)!;
    expect(hand.outcome).toBe('won');
    expect(hand.heroNet).toBe(200);
    expect(hand.pot).toBe(400);
    expect(hand.vpip).toBe(true);
    expect(hand.showdown).toBe(true);
    expect(hand.board).toHaveLength(5);
    expect(hand.shownHands.map((shown) => [shown.seatIndex, shown.rank, shown.won])).toEqual([
      [0, 'one-pair', true],
      [1, 'one-pair', false],
    ]);
    expect(hand.log).toEqual(state.log);
  });

  it('records a lost showdown as a negative net and a chopped board as a split', () => {
    const lost = recordHand(allInHand('Kd Kc', 'As Ah', '7s 8d 2h 3s 9c'))!;
    expect(lost.outcome).toBe('lost');
    expect(lost.heroNet).toBe(-200);

    const chopped = recordHand(allInHand('2d 3c', '2h 3d', 'As Ks Qs Js Ts'))!;
    expect(chopped.outcome).toBe('split');
    expect(chopped.heroNet).toBe(0);
  });

  it('keeps folded opponents’ cards out of an uncontested hand', () => {
    const game = createGame(2, { rng: () => 0.27 });
    // Heads-up the dealer posts the small blind and acts first.
    const dealer = game.currentActor!;
    const folded = recordHand(applyPlayerAction(game, dealer, { type: 'fold' }))!;
    expect(folded.showdown).toBe(false);
    expect(folded.shownHands).toEqual([]);
    expect(folded.board).toEqual([]);
    expect(folded.vpip).toBe(false);
    expect(folded.pot).toBe(3);
    if (dealer === 0) {
      expect(folded.outcome).toBe('folded');
      expect(folded.heroNet).toBe(-1);
    } else {
      expect(folded.outcome).toBe('won');
      expect(folded.heroNet).toBe(1);
    }
  });

  it('does not count a blind or a free check as voluntary, but counts a call', () => {
    const game = createGame(2, { rng: () => 0.27 });
    const dealer = game.currentActor!;
    const bigBlind = 1 - dealer;
    let limped = applyPlayerAction(game, dealer, { type: 'call' });
    limped = applyPlayerAction(limped, bigBlind, { type: 'check' });
    // The big blind acts first after the flop and gives up to a bet.
    limped = applyPlayerAction(limped, bigBlind, { type: 'check' });
    limped = applyPlayerAction(limped, dealer, { type: 'raise', raiseTo: 4 });
    limped = applyPlayerAction(limped, bigBlind, { type: 'fold' });
    const hand = recordHand(limped)!;
    expect(hand.vpip).toBe(dealer === 0);
    expect(hand.board).toHaveLength(3);
    expect(hand.heroNet).toBe(dealer === 0 ? 2 : -2);
  });

  it('adds each finished hand to the history exactly once', () => {
    const first = record({ handNumber: 1 });
    const second = record({ handNumber: 2 });
    expect(appendRecord([], null)).toEqual([]);
    expect(appendRecord([first], first)).toEqual([first]);
    expect(appendRecord([first], second)).toEqual([first, second]);
  });

  it('summarises a session', () => {
    expect(summarizeSession([], 2)).toEqual({
      hands: 0, net: 0, bbPer100: 0, handsWon: 0, wonRate: 0, vpipRate: 0, biggestPotWon: 0,
    });
    const stats = summarizeSession([
      record({ handNumber: 1, heroNet: 40, outcome: 'won', vpip: true, pot: 90 }),
      record({ handNumber: 2, heroNet: -1, outcome: 'folded' }),
      record({ handNumber: 3, heroNet: -30, outcome: 'lost', vpip: true, pot: 300 }),
      record({ handNumber: 4, heroNet: 0, outcome: 'split', vpip: true, pot: 12 }),
    ], 2);
    expect(stats.hands).toBe(4);
    expect(stats.net).toBe(9);
    expect(stats.bbPer100).toBeCloseTo(112.5);
    expect(stats.handsWon).toBe(2);
    expect(stats.wonRate).toBe(0.5);
    expect(stats.vpipRate).toBe(0.75);
    expect(stats.biggestPotWon).toBe(90);
  });

  it('splits the final board back into the streets that dealt it', () => {
    const board = cards('7s 8d 2h 3s 9c');
    expect(cardsDealtOn(board, 'flop')).toEqual(board.slice(0, 3));
    expect(cardsDealtOn(board, 'turn')).toEqual([board[3]]);
    expect(cardsDealtOn(board, 'river')).toEqual([board[4]]);
    expect(cardsDealtOn(board.slice(0, 3), 'turn')).toEqual([]);
    expect(cardsDealtOn(board, 'preflop')).toEqual([]);
  });

  it('keeps the recorded nets equal to the hero’s real stack change over a CPU-only session', () => {
    const rng = seededRng(0x51f15e);
    let game = createGame(6, { rng });
    let history: HandRecord[] = [];
    let expectedNet = 0;
    for (let hand = 0; hand < 25; hand += 1) {
      const stackBeforeBlinds = game.players[0].stack + game.players[0].totalContribution;
      let guard = 0;
      while (game.street !== 'complete') {
        game = game.runout ? advanceRunout(game) : applyPlayerAction(game, game.currentActor!, decideCpuAction(game, game.currentActor!, rng));
        guard += 1;
        expect(guard).toBeLessThan(400);
      }
      history = appendRecord(history, recordHand(game));
      expectedNet += game.players[0].stack - stackBeforeBlinds;
      expect(summarizeSession(history, game.bigBlind).net).toBe(expectedNet);
      game = startNextHand(game, rng);
    }
    expect(history.map((entry) => entry.handNumber)).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
  });
});

describe('Texas Hold’em history panel', () => {
  const en = getHoldemStrings('en');
  const ja = getHoldemStrings('ja');

  it('shows an empty state with blank statistics before the first hand ends', () => {
    const markup = renderToStaticMarkup(<HistoryPanel records={[]} bigBlind={2} strings={en} />);
    expect(markup).toContain(en.history.title);
    expect(markup).toContain(en.history.empty);
    expect(markup).not.toContain('<details');
  });

  it('lists hands newest first with the result, shown hands and the full action log', () => {
    const won = recordHand(allInHand('As Ah', 'Kd Kc', '7s 8d 2h 3s 9c'))!;
    const lost = { ...recordHand(allInHand('Kd Kc', 'As Ah', '7s 8d 2h 3s 9c'))!, handNumber: 2 };
    const markup = renderToStaticMarkup(<HistoryPanel records={[won, lost]} bigBlind={2} strings={en} />);
    expect(markup.indexOf('#2')).toBeLessThan(markup.indexOf('#1'));
    expect(markup).toContain('+200');
    expect(markup).toContain('−200');
    expect(markup).toContain(en.history.outcomes.won);
    expect(markup).toContain(en.history.outcomes.lost);
    expect(markup).toContain(en.history.shownHands);
    expect(markup).toContain('Solver 01');
    expect(markup).toContain(en.hands['one-pair']);
    for (const entry of won.log) expect(markup).toContain(formatLog(entry, won.players, en));
    expect(markup).not.toContain(en.history.empty);
  });

  it('is fully translated into Japanese', () => {
    const won = recordHand(allInHand('As Ah', 'Kd Kc', '7s 8d 2h 3s 9c'))!;
    const markup = renderToStaticMarkup(<HistoryPanel records={[won]} bigBlind={2} strings={ja} />);
    for (const text of [ja.history.title, ja.history.outcomes.won, ja.history.shownHands, ja.history.stats.net, ja.table.you]) {
      expect(markup).toContain(text);
    }
    for (const text of [en.history.title, en.history.outcomes.won, en.history.shownHands, en.history.stats.net, 'You']) {
      expect(markup).not.toContain(`>${text}<`);
    }
  });

  it('renders only the latest hands of a long session but counts all of them', () => {
    const many = Array.from({ length: HISTORY_VISIBLE_HANDS + 5 }, (_, index) => record({ handNumber: index + 1, heroNet: -1 }));
    const markup = renderToStaticMarkup(<HistoryPanel records={many} bigBlind={2} strings={en} />);
    expect(markup.match(/<details/g)).toHaveLength(HISTORY_VISIBLE_HANDS);
    expect(markup).toContain(`Latest ${HISTORY_VISIBLE_HANDS} hands`);
    expect(markup).toContain(`<dd>${HISTORY_VISIBLE_HANDS + 5}</dd>`);
    expect(markup).toContain(signedChips(-(HISTORY_VISIBLE_HANDS + 5)));
    expect(markup).not.toContain('>#5<');
  });
});
