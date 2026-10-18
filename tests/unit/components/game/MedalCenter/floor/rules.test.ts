import { describe, expect, it } from 'vitest';

import { PAYS as BACCARAT_PAYS } from '@/components/game/Baccarat/engine';
import { SPOT_MAX as BACCARAT_SPOT_MAX } from '@/components/game/Baccarat/medals';
import { MAX_HANDS } from '@/components/game/Blackjack/engine';
import { MAX_BET as BLACKJACK_MAX_BET } from '@/components/game/Blackjack/medalTable';
import {
  BET_IDS as CRAPS_BET_IDS,
  ONE_ROLL_PAYS,
  POINT_NUMBERS,
  comePoint,
  isOddsBet,
  maxOdds,
  resolveRoll,
  type Bets as CrapsBets,
  type PointNumber,
} from '@/components/game/Craps/engine';
import { SPOT_MAX as CRAPS_SPOT_MAX, spotLimit as crapsSpotLimit, stakeStep as crapsStakeStep } from '@/components/game/Craps/medalTable';
import { MAX_DOUBLES, VALUES as JANKEN_LAMPS } from '@/components/game/Janken/engine';
import { MOST_MEDALS as JANKEN_MOST } from '@/components/game/Janken/round';
import { FLOOR } from '@/components/game/MedalCenter/MedalCenter';
import { BOWLS, JACKPOT_START } from '@/components/game/MedalPusher/lottery';
import { payoutMultiplier, type Bet } from '@/components/game/Roulette/engine';
import { SPOT_MAX as ROULETTE_SPOT_MAX } from '@/components/game/Roulette/medalTable';
import { PAY_RULES } from '@/components/game/SlotMachine/engine';
import { BET_OPTIONS } from '@/components/game/SlotMachine/medals';
import { ANTE_BONUS_PAYS, PAIR_PLUS_PAYS } from '@/components/game/ThreeCardPoker/engine';
import { HAND_MAX as TCP_HAND_MAX, SPOT_MAX as TCP_SPOT_MAX } from '@/components/game/ThreeCardPoker/medalTable';
import { DOUBLE_MAX, DOUBLE_RETURN } from '@/components/game/VideoPoker/doubleUp';
import { HANDS, MAX_COINS, PAY_TABLES, PAY_TABLE_IDS, ROYAL_SHORT_PAY, payout, type HandRank } from '@/components/game/VideoPoker/engine';
import { games } from '@/components/game/constants/games';
import { analyzeMachine as slotOdds } from '@/components/game/SlotMachine/engine';
import { analyzeMachine as jankenOdds, valueOf as jankenValue } from '@/components/game/Janken/engine';
import { HOUSE_EDGE as ROULETTE_EDGE } from '@/components/game/Roulette/engine';
import { gameValue as blackjackValue } from '@/components/game/Blackjack/analysis';
import { PRECOMPUTED as VIDEO_POKER_TABLES } from '@/components/game/VideoPoker/precomputed';
import { ODDS_BETS as BACCARAT_BETS, betOdds as baccaratOdds, shoeOdds as baccaratShoe } from '@/components/game/Baccarat/analysis';
import { DEFAULT_DECKS as BACCARAT_DECKS } from '@/components/game/Baccarat/engine';
import { allBetOdds as crapsOdds, toNumber as crapsNumber } from '@/components/game/Craps/analysis';
import { pairPlusOdds, strategyOdds as tcpStrategy } from '@/components/game/ThreeCardPoker/analysis';
import { PAIR_PLUS_TABLES } from '@/components/game/ThreeCardPoker/engine';
import { ODDS_LIMITS as HORSE_ODDS, RETURN_MOST as HORSE_RETURN_MOST, TICKETS as HORSE_TICKETS, raceCard } from '@/components/game/HorseRace/card';
import { toNumber } from '@/components/game/HorseRace/fraction';
import { RACE_STAKE_MOST as HORSE_STAKE_MOST, TICKET_MAX as HORSE_TICKET_MAX } from '@/components/game/HorseRace/medalTable';
import { EXPECTED_PER_MEDAL, LINKED_GAMES, linked } from '@/lib/medalFloor/jackpot';
import { BET_OPTIONS as FISHING_BETS, CHEST as FISHING_CHEST, FISH, MOST_MEDALS as FISHING_MOST, analyzeMachine as fishingOdds, valueOf as fishingValue } from '@/components/game/Fishing/engine';
import { BET_OPTIONS as BINGO_BETS, FULL_CARD_LINES, MOST_WIN as BINGO_MOST, analyzeMachine as bingoOdds, paysFor as bingoPays } from '@/components/game/BallBingo/engine';
import { LAMPS as WHEEL_LAMPS, SPOTS as WHEEL_SPOTS, TOP_MULTIPLE as WHEEL_TOP, analyzeWheel, valueOf as wheelValue } from '@/components/game/BigWheel/engine';
import { SPIN_STAKE_MOST as WHEEL_STAKE_MOST, SPOT_MAX as WHEEL_SPOT_MAX } from '@/components/game/BigWheel/medalTable';
import { BETS as LADDER_BETS, BET_MOST as LADDER_BET_MOST, TOP as LADDER_TOP, analyzeLadder, payFor as ladderPays, valueOf as ladderValue } from '@/components/game/HighLow/engine';
import { BET_IDS as SIC_BO_AREAS, MOST_BACK_PER_MEDAL as SIC_BO_MOST_BACK, PAYTABLE as SIC_BO_PAYS, analyze as sicBoOdds, resolveRoll as sicBoRoll, valueOf as sicBoValue, type Dice as SicBoDice } from '@/components/game/SicBo/engine';
import { ROLL_STAKE_MOST as SIC_BO_STAKE_MOST, SPOT_MAX as SIC_BO_SPOT_MAX } from '@/components/game/SicBo/medalTable';
import { BETS as SUGOROKU_BETS, BET_MOST as SUGOROKU_BET_MOST, BOARD_SIZE as SUGOROKU_SQUARES, analyzeBoard, labelOf as sugorokuLabel, medalsFor as sugorokuMedals, outcomesFrom as sugorokuOutcomes, valueOf as sugorokuValue } from '@/components/game/Sugoroku/engine';
import { CRAPS_DECIDED_MOST, FLOOR_GAMES, FLOOR_RULES, PUSHER_JACKPOT_MOST, feedWorthy, labelPays } from '@/lib/medalFloor/games';

// What the floor believes each machine can pay is worked out here again from the machines' own tables, so that a
// change to a game's payouts that the floor has not heard of fails this test instead of refusing a real win.

const sorted = (values: Iterable<number>) => [...new Set(values)].sort((a, b) => a - b);

describe('the machines on the floor', () => {
  it('are the machines of the medal center’s floor, every one a game of the site', () => {
    expect([...FLOOR_GAMES]).toEqual(FLOOR.map(({ id }) => id));
    for (const game of FLOOR_GAMES) expect(games.some((entry) => entry.id === game)).toBe(true);
  });

  it('size each allowance to hold the biggest win on top of ten minutes at the fastest', () => {
    for (const game of FLOOR_GAMES) {
      const rule = FLOOR_RULES[game];
      expect(rule.burst).toBe(rule.most + 10 * rule.perMinute);
      expect(rule.feedFrom).toBeLessThanOrEqual(rule.most);
      for (const [label, named] of Object.entries(rule.labels)) {
        for (const amount of named.amounts ?? []) expect(amount, `${game} ${label}`).toBeLessThanOrEqual(rule.most);
        expect(named.max ?? 0, `${game} ${label}`).toBeLessThanOrEqual(rule.most);
      }
    }
  });
});

/** Every spot of the roulette felt, each bet once: 151 of them. */
function rouletteFelt(): Bet[] {
  const felt: Bet[] = [];
  for (let n = 0; n <= 36; n += 1) felt.push({ kind: 'straight', number: n });
  for (let n = 1; n <= 33; n += 1) felt.push({ kind: 'split', numbers: [n, n + 3] });
  for (let n = 1; n <= 35; n += 1) if (n % 3 !== 0) felt.push({ kind: 'split', numbers: [n, n + 1] });
  for (let n = 1; n <= 32; n += 1) if (n % 3 !== 0) felt.push({ kind: 'corner', numbers: [n, n + 1, n + 3, n + 4] });
  for (let n = 1; n <= 34; n += 3) felt.push({ kind: 'street', numbers: [n, n + 1, n + 2] });
  for (let n = 1; n <= 31; n += 3) felt.push({ kind: 'line', numbers: [n, n + 1, n + 2, n + 3, n + 4, n + 5] });
  for (const which of [1, 2, 3] as const) felt.push({ kind: 'dozen', which }, { kind: 'column', which });
  for (const kind of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) felt.push({ kind });
  return felt;
}

/**
 * The fullest craps table there can be with the line's point `point` (or none): every spot each at its most, the odds
 * as far as they go. What a table cannot hold at once is left off (see the craps case below).
 */
function fullestCraps(point: PointNumber | null): CrapsBets {
  const bets: CrapsBets = {};
  for (const id of CRAPS_BET_IDS) {
    if (isOddsBet(id)) continue;
    const come = comePoint(id);
    if (come) {
      if (come.n !== point) bets[id] = crapsSpotLimit(come.kind === 'come' ? 'come' : 'dontCome', point, {});
    } else if (point !== null || (id !== 'come' && id !== 'dontCome')) bets[id] = crapsSpotLimit(id, point, {});
  }
  for (const id of CRAPS_BET_IDS) {
    if (!isOddsBet(id) || ((id === 'passOdds' || id === 'dontPassOdds') && point === null)) continue;
    const most = maxOdds(id, point, bets);
    if (most > 0) bets[id] = most - (most % crapsStakeStep(id, point));
  }
  return bets;
}

describe('the most each machine can take from the player at once, for the medals played', () => {
  it('sizes each allowance of medals played to hold the biggest stake on top of ten minutes at the fastest', () => {
    for (const game of FLOOR_GAMES) expect(FLOOR_RULES[game].playBurst).toBe(FLOOR_RULES[game].stakeMost + 10 * FLOOR_RULES[game].perMinute);
  });

  it('from each machine’s own limits', () => {
    // A medal fed at a time; a slot's biggest bet; a medal a round of janken.
    expect(FLOOR_RULES['medal-pusher'].stakeMost).toBe(1);
    expect(FLOOR_RULES['slot-machine'].stakeMost).toBe(Math.max(...BET_OPTIONS));
    expect(FLOOR_RULES.janken.stakeMost).toBe(1);
    // Every spot of the felt at its most.
    expect(rouletteFelt()).toHaveLength(151);
    expect(FLOOR_RULES.roulette.stakeMost).toBe(rouletteFelt().length * ROULETTE_SPOT_MAX);
    // Four hands of the biggest bet, each doubled, and the insurance on the first.
    expect(FLOOR_RULES.blackjack.stakeMost).toBe(MAX_HANDS * 2 * BLACKJACK_MAX_BET + Math.floor(BLACKJACK_MAX_BET / 2));
    // Five coins a hand (a double-up puts back what was won, and is not counted).
    expect(FLOOR_RULES['video-poker'].stakeMost).toBe(MAX_COINS);
    // Every spot of the baccarat table at its most.
    expect(FLOOR_RULES.baccarat.stakeMost).toBe(Object.values(BACCARAT_SPOT_MAX).reduce((sum, most) => sum + most, 0));
    // An Ante, Pair Plus and a Play bet, each at its most.
    expect(FLOOR_RULES['three-card-poker'].stakeMost).toBe(TCP_HAND_MAX);
    expect(TCP_HAND_MAX).toBe(3 * TCP_SPOT_MAX);
    // One cast at its biggest bet.
    expect(FLOOR_RULES.fishing.stakeMost).toBe(Math.max(...FISHING_BETS));
    // Every ticket of a horse race at its most.
    expect(FLOOR_RULES['horse-race'].stakeMost).toBe(HORSE_STAKE_MOST);
    expect(HORSE_STAKE_MOST).toBe(HORSE_TICKETS.length * HORSE_TICKET_MAX);
    // Ball Bingo: a game's bet at its biggest.
    expect(FLOOR_RULES['ball-bingo'].stakeMost).toBe(Math.max(...BINGO_BETS));
    // The big wheel: every number of the board at its most.
    expect(FLOOR_RULES['big-wheel'].stakeMost).toBe(WHEEL_STAKE_MOST);
    expect(WHEEL_STAKE_MOST).toBe(WHEEL_SPOTS.length * WHEEL_SPOT_MAX);
    // The High & Low Ladder: one game's bet at its biggest, out from START until the game ends.
    expect(FLOOR_RULES['high-low'].stakeMost).toBe(LADDER_BET_MOST);
    expect(LADDER_BET_MOST).toBe(Math.max(...LADDER_BETS));
    // Sic Bo: every area of the layout at its most.
    expect(FLOOR_RULES['sic-bo'].stakeMost).toBe(SIC_BO_STAKE_MOST);
    expect(SIC_BO_STAKE_MOST).toBe(SIC_BO_AREAS.length * SIC_BO_SPOT_MAX);
    expect(SIC_BO_STAKE_MOST).toBe(4_950);
    // Whale Isle Sugoroku: one roll at its biggest bet (a ride and a chance are part of the roll, and take nothing more).
    expect(FLOOR_RULES.sugoroku.stakeMost).toBe(SUGOROKU_BET_MOST);
    expect(SUGOROKU_BET_MOST).toBe(Math.max(...SUGOROKU_BETS));
  });

  it('craps: the medals one roll decides, at most everything the fullest table can hold, and that many it can decide', () => {
    let held = 0;
    let decided = 0;
    for (const point of [null, ...POINT_NUMBERS]) {
      const bets = fullestCraps(point);
      held = Math.max(held, Object.values(bets).reduce<number>((sum, medals) => sum + (medals ?? 0), 0));
      for (let a = 1; a <= 6; a += 1)
        for (let b = 1; b <= 6; b += 1) {
          const { results } = resolveRoll(point, bets, [a, b]);
          decided = Math.max(decided, results.reduce((sum, r) => sum + (r.outcome === 'lose' || (r.outcome === 'win' && !r.staysUp) ? r.stake : 0), 0));
        }
    }
    expect(CRAPS_DECIDED_MOST).toBe(held);
    expect(CRAPS_DECIDED_MOST).toBe(decided);
    expect(FLOOR_RULES.craps.stakeMost).toBe(CRAPS_DECIDED_MOST);
  });
});

describe('which machines are linked to the floor jackpot', () => {
  /** Each machine's best return, from its own exact odds: its best bet, played its best way, per medal played. */
  const exactBest = (): Partial<Record<(typeof FLOOR_GAMES)[number], number>> => {
    const shoe = baccaratShoe(BACCARAT_DECKS);
    const tcp = tcpStrategy('optimal');
    return {
      'slot-machine': slotOdds().rtp,
      janken: jankenValue(jankenOdds().rtp),
      roulette: 1 - ROULETTE_EDGE,
      blackjack: 1 - blackjackValue().houseEdge,
      'video-poker': Math.max(...Object.values(VIDEO_POKER_TABLES).map((table) => table.payback)),
      baccarat: Math.max(...BACCARAT_BETS.map((id) => 1 + baccaratOdds(id, shoe).ev)),
      craps: Math.max(...crapsOdds().map((bet) => 1 - crapsNumber(bet.houseEdge))),
      // The Ante and Play per medal wagered (the element of risk), or Pair Plus on either table.
      'three-card-poker': Math.max(1 - tcp.elementOfRisk, ...Object.values(PAIR_PLUS_TABLES).map((table) => 1 + pairPlusOdds(table).ev)),
      fishing: fishingValue(fishingOdds().rtp),
      // The most any ticket of any race brings back: every card is priced to at most this (card.test.ts checks every
      // ticket of hundreds of cards, and adds a few up exactly over all 720 finishing orders).
      'horse-race': toNumber(HORSE_RETURN_MOST),
      // The same on every bet: worked out over every state a game can be in.
      'ball-bingo': bingoOdds().rtp,
      // The same on every number, exactly (engine.test.ts adds up all 43,200 ways a spin can be drawn).
      'big-wheel': wheelValue(analyzeWheel().rtp),
      // Best play (TAKE or go on, HIGH or LOW, per card and rung), worked out by dynamic programming: the same at every
      // bet, since every rung pays in proportion to the bet.
      'high-low': ladderValue(analyzeLadder().best),
      // Small or Big, the best of the 50 areas, worked out over the 216 rolls (engine.test.ts adds them up again).
      'sic-bo': sicBoValue(sicBoOdds().best),
      // The best square's next roll (the board's Markov chain, exact): the player sees the square before choosing the
      // bet, so the floor is told the best of every square, not the long run of steady play.
      sugoroku: sugorokuValue(analyzeBoard().best),
    };
  };

  it('knows each machine’s best return from its own exact odds, rounded up', () => {
    const exact = exactBest();
    for (const [game, best] of Object.entries(exact)) {
      const rule = FLOOR_RULES[game as (typeof FLOOR_GAMES)[number]];
      expect(rule.bestReturn, game).toBeGreaterThanOrEqual(best!);
      expect(rule.bestReturn - best!, game).toBeLessThan(1e-4);
    }
    // The Medal Pusher's is measured by its simulation, not worked out: the slowest feed down the middle, about 90%.
    expect(FLOOR_RULES['medal-pusher'].bestReturn).toBe(0.902);
  });

  it('links only the machines whose best play, with the floor jackpot added, stays at or under 100%', () => {
    expect([...LINKED_GAMES]).toEqual(['medal-pusher', 'slot-machine', 'janken', 'roulette', 'three-card-poker', 'fishing', 'horse-race', 'ball-bingo', 'big-wheel', 'high-low', 'sic-bo', 'sugoroku']);
    for (const game of FLOOR_GAMES) {
      const withJackpot = FLOOR_RULES[game].bestReturn + EXPECTED_PER_MEDAL;
      expect(linked(game), game).toBe(withJackpot <= 1);
    }
    // The tables that are not: their best play is already near even, and the floor jackpot would take it over.
    for (const game of ['blackjack', 'video-poker', 'baccarat', 'craps'] as const) expect(exactBest()[game]! + EXPECTED_PER_MEDAL, game).toBeGreaterThan(1);
  });
});

describe('the most each machine can pay, from its own tables', () => {
  it('slot machine: 7-7-7 on the biggest bet', () => {
    const top = Math.max(...BET_OPTIONS);
    expect(FLOOR_RULES['slot-machine'].most).toBe(Math.max(...PAY_RULES.map((rule) => rule.pays)) * top);
    const pays = (id: string) => PAY_RULES.find((rule) => rule.id === id)!.pays;
    expect(FLOOR_RULES['slot-machine'].labels.seven3.amounts).toEqual(BET_OPTIONS.map((bet) => pays('seven3') * bet));
    expect(FLOOR_RULES['slot-machine'].labels.bar3.amounts).toEqual(BET_OPTIONS.map((bet) => pays('bar3') * bet));
  });

  it('Calico Janken: the biggest lamp doubled every time it can be, and every double-up there is', () => {
    expect(FLOOR_RULES.janken.most).toBe(JANKEN_MOST);
    const doubled = JANKEN_LAMPS.flatMap((lamp) => Array.from({ length: MAX_DOUBLES }, (_, index) => lamp * 2 ** (index + 1)));
    expect(FLOOR_RULES.janken.labels['double-up'].amounts).toEqual(sorted(doubled));
  });

  it('video poker: a royal flush on five coins doubled up every time it can be, and what each named win pays on every pay table', () => {
    const coins = Array.from({ length: MAX_COINS }, (_, index) => index + 1);
    const ranks = HANDS.map((_, rank) => rank as HandRank);
    // Every win a hand pays, on every table and bet; and those wins doubled up once to as many times as the machine allows.
    const wins = sorted(PAY_TABLE_IDS.flatMap((id) => ranks.flatMap((rank) => coins.map((n) => payout(rank, PAY_TABLES[id], n)))).filter((won) => won > 0));
    const doubled = Array.from({ length: DOUBLE_MAX }, (_, index) => DOUBLE_RETURN.win ** (index + 1));
    expect(doubled).toEqual([2, 4, 8, 16]);
    const royal = Math.max(...PAY_TABLE_IDS.map((id) => payout(9, PAY_TABLES[id], MAX_COINS)));
    expect(FLOOR_RULES['video-poker'].most).toBe(royal * DOUBLE_RETURN.win ** DOUBLE_MAX);
    expect(FLOOR_RULES['video-poker'].most).toBe(64_000);
    const labels = FLOOR_RULES['video-poker'].labels;
    expect(labels['double-up'].amounts).toEqual(sorted(wins.flatMap((won) => doubled.map((by) => won * by))));
    expect(labels['double-up'].feed).toBe(false);
    expect(labels.royal.amounts).toEqual(sorted(PAY_TABLE_IDS.flatMap((id) => coins.map((n) => payout(9, PAY_TABLES[id], n)))));
    expect(labels['straight-flush'].amounts).toEqual(sorted(PAY_TABLE_IDS.flatMap((id) => coins.map((n) => payout(8, PAY_TABLES[id], n)))));
    expect(labels['four-kind'].amounts).toEqual(sorted(PAY_TABLE_IDS.flatMap((id) => coins.map((n) => payout(7, PAY_TABLES[id], n)))));
    expect(ROYAL_SHORT_PAY).toBe(250);
  });

  it('roulette: the most on every spot of the felt that covers one number', () => {
    const felt: Bet[] = [];
    for (let n = 0; n <= 36; n += 1) felt.push({ kind: 'straight', number: n });
    for (let n = 1; n <= 33; n += 1) felt.push({ kind: 'split', numbers: [n, n + 3] });
    for (let n = 1; n <= 35; n += 1) if (n % 3 !== 0) felt.push({ kind: 'split', numbers: [n, n + 1] });
    for (let n = 1; n <= 32; n += 1) if (n % 3 !== 0) felt.push({ kind: 'corner', numbers: [n, n + 1, n + 3, n + 4] });
    for (let n = 1; n <= 34; n += 3) felt.push({ kind: 'street', numbers: [n, n + 1, n + 2] });
    for (let n = 1; n <= 31; n += 3) felt.push({ kind: 'line', numbers: [n, n + 1, n + 2, n + 3, n + 4, n + 5] });
    for (const which of [1, 2, 3] as const) felt.push({ kind: 'dozen', which }, { kind: 'column', which });
    for (const kind of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) felt.push({ kind });
    expect(felt).toHaveLength(151);
    let most = 0;
    for (let result = 0; result <= 36; result += 1) most = Math.max(most, felt.reduce((sum, bet) => sum + payoutMultiplier(bet, result) * ROULETTE_SPOT_MAX, 0));
    expect(FLOOR_RULES.roulette.most).toBe(most);
  });

  it('blackjack: split to every hand, each doubled and won', () => {
    expect(FLOOR_RULES.blackjack.most).toBe(MAX_HANDS * 2 * (2 * BLACKJACK_MAX_BET));
  });

  it('baccarat: a Dragon 7 with both pairs, the Banker pushed, on the EZ table', () => {
    const won = (id: keyof typeof BACCARAT_PAYS) => BACCARAT_SPOT_MAX[id] * (BACCARAT_PAYS[id][0] / BACCARAT_PAYS[id][1] + 1);
    const dragon = BACCARAT_SPOT_MAX.banker + won('dragon7') + won('playerPair') + won('bankerPair');
    const panda = BACCARAT_SPOT_MAX.player + won('panda8') + won('playerPair') + won('bankerPair');
    expect(FLOOR_RULES.baccarat.most).toBe(Math.max(dragon, panda));
  });

  it('craps: every roll of the dice against the fullest table there can be, with the line’s point or none', () => {
    // Every bet is settled on its own, so the most one roll can give back is that roll against every spot the table can
    // hold at once, each at its most. A spot's most is its limit (SPOT_MAX, in whole steps of what it pays); the odds go
    // up to 3-4-5x the bet in front of them, the lay to 6x. A come point is at most the Come or Don't Come bet that moved
    // there: a bet moves onto a number only on a roll of that number, which decides the one already there.
    // What a table cannot hold at once:
    // - Come and Don't Come bets in their boxes on the come-out: the roll after they are made moves or decides them.
    // - The line's odds without a point.
    // - A come point on the line's own point: the roll that would move a bet there makes the point instead, and the
    //   come-out roll that sets the point decides the come points on that number.
    const fullest = (point: PointNumber | null): CrapsBets => {
      const bets: CrapsBets = {};
      for (const id of CRAPS_BET_IDS) {
        if (isOddsBet(id)) continue;
        const come = comePoint(id);
        if (come) {
          if (come.n !== point) bets[id] = crapsSpotLimit(come.kind === 'come' ? 'come' : 'dontCome', point, {});
        } else if (point !== null || (id !== 'come' && id !== 'dontCome')) bets[id] = crapsSpotLimit(id, point, {});
      }
      for (const id of CRAPS_BET_IDS) {
        if (!isOddsBet(id) || ((id === 'passOdds' || id === 'dontPassOdds') && point === null)) continue;
        const most = maxOdds(id, point, bets);
        if (most > 0) bets[id] = most - (most % crapsStakeStep(id, point));
      }
      return bets;
    };
    let most = 0;
    for (const point of [null, ...POINT_NUMBERS]) {
      const bets = fullest(point);
      for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) most = Math.max(most, resolveRoll(point, bets, [a, b]).returned);
    }
    expect(FLOOR_RULES.craps.most).toBe(most);
    // That roll is a seven on the come-out: the Pass Line, Any Seven, a Don't Come bet with its lay on every number, and
    // the odds behind a Come bet on every number, which are off on the come-out and come back.
    expect(resolveRoll(null, fullest(null), [3, 4]).returned).toBe(most);
    // More than the aces on the come-out the floor believed before Come and Don't Come: Don't Pass, the Field, Any
    // Craps and Aces.
    const won = ([to, per]: readonly [number, number]) => CRAPS_SPOT_MAX * (to / per + 1);
    expect(resolveRoll(null, fullest(null), [1, 1]).returned).toBe(2 * CRAPS_SPOT_MAX + won(ONE_ROLL_PAYS.field[2]) + won(ONE_ROLL_PAYS.anyCraps) + won(ONE_ROLL_PAYS.aces));
  });

  it('Mini Turf Racing: a win ticket and a quinella both at their most, each at the longest odds the board can show', () => {
    expect(FLOOR_RULES['horse-race'].most).toBe(HORSE_TICKET_MAX * (HORSE_ODDS.win.most + HORSE_ODDS.quinella.most));
    expect(FLOOR_RULES['horse-race'].most).toBe(108_702);
    // A race pays at most one win ticket and one quinella: no card's odds go past the board's.
    for (let race = 1; race <= 40; race += 1) {
      const card = raceCard('rules-test', race);
      expect(Math.max(...card.winOdds)).toBeLessThanOrEqual(HORSE_ODDS.win.most);
      expect(Math.max(...card.quinellaOdds)).toBeLessThanOrEqual(HORSE_ODDS.quinella.most);
    }
  });

  it('three card poker: a straight flush against a dealer who qualifies', () => {
    const most = 2 * TCP_SPOT_MAX + 2 * TCP_SPOT_MAX + TCP_SPOT_MAX * ANTE_BONUS_PAYS.straightFlush + TCP_SPOT_MAX * (PAIR_PLUS_PAYS.straightFlush + 1);
    expect(FLOOR_RULES['three-card-poker'].most).toBe(most);
  });

  it('Big Catch Harbor: the harbor’s lord on the biggest bet, and every lord and treasure chest there is', () => {
    const top = Math.max(...FISHING_BETS);
    const lord = FISH.find((fish) => fish.id === 'lord')!.pays!;
    expect(FLOOR_RULES.fishing.most).toBe(FISHING_MOST);
    expect(FLOOR_RULES.fishing.most).toBe(Math.max(...FISH.map((fish) => fish.pays ?? 0), ...FISHING_CHEST.map((prize) => prize.pays)) * top);
    expect(FLOOR_RULES.fishing.most).toBe(1_500);
    expect(FLOOR_RULES.fishing.labels['harbor-lord'].amounts).toEqual(FISHING_BETS.map((bet) => lord * bet));
    expect(FLOOR_RULES.fishing.labels.treasure.amounts).toEqual(sorted(FISHING_CHEST.flatMap((prize) => FISHING_BETS.map((bet) => prize.pays * bet))));
    expect(FLOOR_RULES.fishing.bestReturn).toBe(0.9);
  });

  it('Ball Bingo: the full card on the biggest bet, and the full card on every bet', () => {
    expect(FLOOR_RULES['ball-bingo'].most).toBe(BINGO_MOST);
    expect(BINGO_MOST).toBe(bingoPays(FULL_CARD_LINES) * Math.max(...BINGO_BETS));
    expect(FLOOR_RULES['ball-bingo'].labels['full-card'].amounts).toEqual(BINGO_BETS.map((bet) => bingoPays(FULL_CARD_LINES) * bet));
    expect(FLOOR_RULES['ball-bingo'].labels['full-card'].feed).toBe(true);
  });

  it('Star Festival Big Wheel: a second chance’s ×10 on the ×40 with every medal a number holds, and every second-chance win there is', () => {
    const medals = Array.from({ length: WHEEL_SPOT_MAX }, (_, i) => i + 1);
    const lamps = sorted(WHEEL_LAMPS);
    expect(WHEEL_TOP).toBe(Math.max(...WHEEL_SPOTS) * Math.max(...lamps));
    expect(FLOOR_RULES['big-wheel'].most).toBe(WHEEL_TOP * WHEEL_SPOT_MAX);
    expect(FLOOR_RULES['big-wheel'].most).toBe(39_600);
    expect(FLOOR_RULES['big-wheel'].labels['wheel-400'].amounts).toEqual(medals.map((n) => WHEEL_TOP * n));
    expect(FLOOR_RULES['big-wheel'].labels['wheel-400'].feed).toBe(true);
    expect(FLOOR_RULES['big-wheel'].labels['wheel-bonus'].amounts).toEqual(sorted(WHEEL_SPOTS.flatMap((spot) => lamps.flatMap((lamp) => medals.map((n) => spot * lamp * n)))));
    expect(FLOOR_RULES['big-wheel'].bestReturn).toBe(0.9);
  });

  it('High & Low Ladder: the top of the ladder on the biggest bet, and the top named on every bet', () => {
    expect(FLOOR_RULES['high-low'].most).toBe(ladderPays(LADDER_BET_MOST, LADDER_TOP));
    expect(FLOOR_RULES['high-low'].most).toBe(2_000);
    // Nothing pays more than the top: every rung below it pays less.
    for (const bet of LADDER_BETS) for (let rung = 1; rung <= LADDER_TOP; rung++) expect(ladderPays(bet, rung)).toBeLessThanOrEqual(FLOOR_RULES['high-low'].most);
    expect(FLOOR_RULES['high-low'].labels['ladder-top'].amounts).toEqual(LADDER_BETS.map((bet) => ladderPays(bet, LADDER_TOP)));
    expect(FLOOR_RULES['high-low'].labels['ladder-top'].feed).toBe(true);
    expect(FLOOR_RULES['high-low'].bestReturn).toBe(0.8997);
  });

  it('Moonlit Sic Bo: a triple 2 or 5 with 99 medals on every area it wins, and the named triples from their smallest win', () => {
    // Every area at its most, every roll: the most any roll brings back.
    const everything = Object.fromEntries(SIC_BO_AREAS.map((id) => [id, SIC_BO_SPOT_MAX]));
    let most = 0;
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++)
        for (let c = 1; c <= 6; c++) most = Math.max(most, sicBoRoll(everything, [a, b, c] as unknown as SicBoDice).returned);
    expect(most).toBe(SIC_BO_MOST_BACK * SIC_BO_SPOT_MAX);
    expect(FLOOR_RULES['sic-bo'].most).toBe(most);
    expect(FLOOR_RULES['sic-bo'].most).toBe(24_255);
    // A triple bet won brings back at least 181 on one medal; any triple at least 31.
    expect(FLOOR_RULES['sic-bo'].labels['sicbo-triple']).toEqual({ min: SIC_BO_PAYS.triple + 1, max: most, feed: true });
    expect(FLOOR_RULES['sic-bo'].labels['sicbo-any-triple']).toEqual({ min: SIC_BO_PAYS.anyTriple + 1, max: most, feed: false });
    expect(FLOOR_RULES['sic-bo'].bestReturn).toBe(0.9723);
  });

  it('Whale Isle Sugoroku: the whale ride to the jackpot on the biggest bet, and every jackpot and ride there is', () => {
    const jackpots = new Set<number>();
    const rides = new Set<number>();
    let most = 0;
    for (let square = 0; square < SUGOROKU_SQUARES; square++) {
      for (const { play } of sugorokuOutcomes(square)) {
        for (const bet of SUGOROKU_BETS) {
          const won = sugorokuMedals(bet, play.pays);
          most = Math.max(most, won);
          const label = sugorokuLabel(play);
          if (label === 'sugoroku-jp') jackpots.add(won);
          else if (label === 'whale-ride') rides.add(won);
        }
      }
    }
    expect(FLOOR_RULES.sugoroku.most).toBe(most);
    expect(FLOOR_RULES.sugoroku.most).toBe(1_020);
    expect(FLOOR_RULES.sugoroku.labels['sugoroku-jp'].amounts).toEqual(sorted(jackpots));
    expect(FLOOR_RULES.sugoroku.labels['sugoroku-jp'].feed).toBe(true);
    expect(FLOOR_RULES.sugoroku.labels['whale-ride'].amounts).toEqual(sorted(rides));
    expect(FLOOR_RULES.sugoroku.labels['whale-ride'].feed).toBe(false);
    // The rule is the best square's next roll, 67/72, rounded up; steady play and betting by the square bring back less.
    const odds = analyzeBoard();
    expect(`${odds.best.num}/${odds.best.den}`).toBe('67/72');
    expect(FLOOR_RULES.sugoroku.bestReturn).toBe(0.9306);
    expect(sugorokuValue(odds.longRun)).toBeLessThan(FLOOR_RULES.sugoroku.bestReturn);
    expect(sugorokuValue(odds.betting.value)).toBeLessThan(FLOOR_RULES.sugoroku.bestReturn);
  });

  it('Medal Pusher: the bowls’ prizes, and a jackpot that starts where the machine’s does', () => {
    const prizes = BOWLS.flat().filter((hole): hole is number => typeof hole === 'number');
    expect(FLOOR_RULES['medal-pusher'].labels.bowl.amounts).toEqual(sorted(prizes));
    expect(FLOOR_RULES['medal-pusher'].labels.jackpot.min).toBe(JACKPOT_START);
    expect(FLOOR_RULES['medal-pusher'].most).toBe(PUSHER_JACKPOT_MOST);
  });
});

describe('named wins and the feed', () => {
  it('a named win is only ever an amount it pays', () => {
    expect(labelPays('slot-machine', 'seven3', 2_000)).toBe(true);
    expect(labelPays('slot-machine', 'seven3', 2_500)).toBe(false);
    expect(labelPays('medal-pusher', 'jackpot', 523)).toBe(true);
    expect(labelPays('medal-pusher', 'jackpot', PUSHER_JACKPOT_MOST + 1)).toBe(false);
    expect(labelPays('janken', 'double-up', 160)).toBe(true);
    expect(labelPays('janken', 'double-up', 10)).toBe(true);
    expect(labelPays('janken', 'double-up', 7)).toBe(false);
    expect(labelPays('video-poker', 'double-up', 64_000)).toBe(true);
    expect(labelPays('video-poker', 'double-up', 90)).toBe(true);
    expect(labelPays('video-poker', 'double-up', 45)).toBe(false);
    expect(labelPays('slot-machine', 'constructor', 1)).toBe(false);
    expect(labelPays('roulette', 'seven3', 1_000)).toBe(false);
    expect(labelPays('fishing', 'harbor-lord', 900)).toBe(true);
    expect(labelPays('fishing', 'harbor-lord', 600)).toBe(false);
    expect(labelPays('fishing', 'treasure', 1_000)).toBe(true);
    expect(labelPays('fishing', 'treasure', 400)).toBe(false);
    expect(labelPays('ball-bingo', 'full-card', 1_500)).toBe(true);
    expect(labelPays('ball-bingo', 'full-card', 1_499)).toBe(false);
    expect(labelPays('big-wheel', 'wheel-400', 39_600)).toBe(true);
    expect(labelPays('big-wheel', 'wheel-400', 4_000)).toBe(true);
    expect(labelPays('big-wheel', 'wheel-400', 401)).toBe(false);
    expect(labelPays('big-wheel', 'wheel-bonus', 4 * 3 * 7)).toBe(true);
    expect(labelPays('big-wheel', 'wheel-bonus', 7)).toBe(false);
    expect(labelPays('high-low', 'ladder-top', 2_000)).toBe(true);
    expect(labelPays('high-low', 'ladder-top', 200)).toBe(true);
    expect(labelPays('high-low', 'ladder-top', 120)).toBe(false);
    expect(labelPays('sic-bo', 'sicbo-triple', 181)).toBe(true);
    expect(labelPays('sic-bo', 'sicbo-triple', 180)).toBe(false);
    expect(labelPays('sic-bo', 'sicbo-any-triple', 31)).toBe(true);
    expect(labelPays('sic-bo', 'sicbo-any-triple', 24_256)).toBe(false);
    expect(labelPays('sugoroku', 'sugoroku-jp', 1_020)).toBe(true);
    expect(labelPays('sugoroku', 'sugoroku-jp', 200)).toBe(true);
    expect(labelPays('sugoroku', 'sugoroku-jp', 199)).toBe(false);
    expect(labelPays('sugoroku', 'whale-ride', 70)).toBe(true);
    expect(labelPays('sugoroku', 'whale-ride', 71)).toBe(false);
  });

  it('the floor is shown jackpots, three sevens and royal flushes whatever their size, and other wins from a size', () => {
    expect(feedWorthy('medal-pusher', 523, 'jackpot')).toBe(true);
    expect(feedWorthy('slot-machine', 1_000, 'seven3')).toBe(true);
    expect(feedWorthy('video-poker', 250, 'royal')).toBe(true);
    expect(feedWorthy('janken', 160, 'double-up')).toBe(true);
    expect(feedWorthy('janken', 4, 'double-up')).toBe(false);
    expect(feedWorthy('slot-machine', 50)).toBe(false);
    expect(feedWorthy('roulette', 360)).toBe(true);
    expect(feedWorthy('medal-pusher', 50, 'bowl')).toBe(false);
    expect(feedWorthy('fishing', 300, 'harbor-lord')).toBe(true);
    expect(feedWorthy('fishing', 10, 'treasure')).toBe(false);
    expect(feedWorthy('fishing', 150)).toBe(true);
    expect(feedWorthy('ball-bingo', 500, 'full-card')).toBe(true);
    expect(feedWorthy('ball-bingo', 100)).toBe(false);
    expect(feedWorthy('big-wheel', 400, 'wheel-400')).toBe(true);
    expect(feedWorthy('big-wheel', 30, 'wheel-bonus')).toBe(false);
    expect(feedWorthy('big-wheel', 400)).toBe(true);
    expect(feedWorthy('high-low', 200, 'ladder-top')).toBe(true);
    expect(feedWorthy('high-low', 240)).toBe(false);
    expect(feedWorthy('high-low', 400)).toBe(true);
    expect(feedWorthy('sic-bo', 181, 'sicbo-triple')).toBe(true);
    expect(feedWorthy('sic-bo', 62, 'sicbo-any-triple')).toBe(false);
    expect(feedWorthy('sic-bo', 300)).toBe(true);
    expect(feedWorthy('sugoroku', 200, 'sugoroku-jp')).toBe(true);
    expect(feedWorthy('sugoroku', 70, 'whale-ride')).toBe(false);
    expect(feedWorthy('sugoroku', 300)).toBe(true);
  });
});
