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

  it('three card poker: a straight flush against a dealer who qualifies', () => {
    const most = 2 * TCP_SPOT_MAX + 2 * TCP_SPOT_MAX + TCP_SPOT_MAX * ANTE_BONUS_PAYS.straightFlush + TCP_SPOT_MAX * (PAIR_PLUS_PAYS.straightFlush + 1);
    expect(FLOOR_RULES['three-card-poker'].most).toBe(most);
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
  });
});
