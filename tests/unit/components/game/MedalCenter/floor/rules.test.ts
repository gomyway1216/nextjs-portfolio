import { describe, expect, it } from 'vitest';

import { PAYS as BACCARAT_PAYS } from '@/components/game/Baccarat/engine';
import { SPOT_MAX as BACCARAT_SPOT_MAX } from '@/components/game/Baccarat/medals';
import { MAX_HANDS } from '@/components/game/Blackjack/engine';
import { MAX_BET as BLACKJACK_MAX_BET } from '@/components/game/Blackjack/medalTable';
import { ONE_ROLL_PAYS } from '@/components/game/Craps/engine';
import { SPOT_MAX as CRAPS_SPOT_MAX } from '@/components/game/Craps/medalTable';
import { MAX_DOUBLES, VALUES as JANKEN_LAMPS } from '@/components/game/Janken/engine';
import { MOST_MEDALS as JANKEN_MOST } from '@/components/game/Janken/round';
import { FLOOR } from '@/components/game/MedalCenter/MedalCenter';
import { BOWLS, JACKPOT_START } from '@/components/game/MedalPusher/lottery';
import { payoutMultiplier, type Bet } from '@/components/game/Roulette/engine';
import { SPOT_MAX as ROULETTE_SPOT_MAX } from '@/components/game/Roulette/medalTable';
import { PAY_RULES } from '@/components/game/SlotMachine/engine';
import { BET_OPTIONS } from '@/components/game/SlotMachine/medals';
import { ANTE_BONUS_PAYS, PAIR_PLUS_PAYS } from '@/components/game/ThreeCardPoker/engine';
import { SPOT_MAX as TCP_SPOT_MAX } from '@/components/game/ThreeCardPoker/medalTable';
import { MAX_COINS, PAY_TABLES, PAY_TABLE_IDS, ROYAL_SHORT_PAY, payout } from '@/components/game/VideoPoker/engine';
import { games } from '@/components/game/constants/games';
import { FLOOR_GAMES, FLOOR_RULES, PUSHER_JACKPOT_MOST, feedWorthy, labelPays } from '@/lib/medalFloor/games';

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

  it('video poker: a royal flush on five coins, and what each named hand pays on every pay table', () => {
    expect(FLOOR_RULES['video-poker'].most).toBe(Math.max(...PAY_TABLE_IDS.map((id) => payout(9, PAY_TABLES[id], MAX_COINS))));
    const coins = Array.from({ length: MAX_COINS }, (_, index) => index + 1);
    const labels = FLOOR_RULES['video-poker'].labels;
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

  it('craps: aces on the come-out, with Don’t Pass, the Field, Any Craps and Aces', () => {
    const won = ([to, per]: readonly [number, number]) => CRAPS_SPOT_MAX * (to / per + 1);
    expect(FLOOR_RULES.craps.most).toBe(2 * CRAPS_SPOT_MAX + won(ONE_ROLL_PAYS.field[2]) + won(ONE_ROLL_PAYS.anyCraps) + won(ONE_ROLL_PAYS.aces));
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
