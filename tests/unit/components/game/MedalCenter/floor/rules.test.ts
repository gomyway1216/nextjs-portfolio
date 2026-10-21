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
import { MOST_WIN as MAZE_MOST, PAYS as MAZE_PAYS, STAGES as MAZE_GATES, STAKE as MAZE_STAKE, analyze as mazeOdds, drawPlay as mazeDraw, labelOf as mazeLabel, playOf as mazePlay, seeded as mazeSeeded, valueOf as mazeValue } from '@/components/game/CoinMaze/engine';
import { ALL_CAUGHT_FROM as KENO_ALL_FROM, BETS as KENO_BETS, BET_MOST as KENO_BET_MOST, LAST_BALL_TIMES as KENO_TIMES, MOST_WIN as KENO_MOST, PAYS as KENO_PAYS, SPOT_COUNTS as KENO_SPOTS, analyze as kenoOdds, drawBalls as kenoDraw, labelOf as kenoLabel, quickPick as kenoPick, seeded as kenoSeeded, valueOf as kenoValue, winOf as kenoWin } from '@/components/game/Keno/engine';
import { MARBLES as SMART_MARBLES, MOST_WIN as SMART_MOST, PAYS as SMART_PAYS, STAKE as SMART_STAKE, drawPlay as smartDraw, labelOf as smartLabel, playOf as smartPlay, seeded as smartSeeded, valueOf as smartValue } from '@/components/game/SmartBall/engine';
import { PUBLISHED_SMART_BALL_ODDS } from '@/components/game/SmartBall/published';
import { valueOf as pachinkoValue } from '@/components/game/Pachinko/analysis';
import { BALLS_PER_MEDAL as PACHINKO_BALLS_PER_MEDAL, COUNT as PACHINKO_COUNT, PAY_ATTACKER as PACHINKO_PAY_ATTACKER, RUSH_MOST as PACHINKO_RUSH_MOST, RUSH_NAMED as PACHINKO_RUSH_NAMED, SPLIT_DENCHU as PACHINKO_SPLIT_DENCHU, SPLIT_HESO as PACHINKO_SPLIT_HESO, SLOT_MS as PACHINKO_SLOT_MS, hitLabel as pachinkoHitLabel, hitMedals as pachinkoHitMedals, rushPrize as pachinkoRushPrize } from '@/components/game/Pachinko/engine';
import { PUBLISHED_PACHINKO_ODDS } from '@/components/game/Pachinko/published';
import { CAROUSEL_STOCK_MOST, CRAPS_DECIDED_MOST, FLOOR_GAMES, FLOOR_RULES, PUSHER_JACKPOT_MOST, feedWorthy, labelPays } from '@/lib/medalFloor/games';
import { STOCK as CAROUSEL_STOCK } from '@/components/game/CarouselPusher/engine';
import { PRIZES as CAROUSEL_PRIZES } from '@/components/game/CarouselPusher/lottery';
import { PUBLISHED_CAROUSEL } from '@/components/game/CarouselPusher/published';
import { CORKS as GALLERY_CORKS, KINDS as GALLERY_KINDS, MOST_WIN as GALLERY_MOST, SHELF as GALLERY_SHELF, STAKE as GALLERY_STAKE, drawPlay as galleryDraw, labelOf as galleryLabel, playOf as galleryPlay, seeded as gallerySeeded, shotAs as galleryShot, valueOf as galleryValue } from '@/components/game/ShootingGallery/engine';
import { PUBLISHED_SHOOTING_GALLERY_ODDS } from '@/components/game/ShootingGallery/published';

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
    for (const game of FLOOR_GAMES) {
      expect(FLOOR_RULES[game].playBurst).toBe(FLOOR_RULES[game].stakeMost + 10 * FLOOR_RULES[game].playPerMinute);
      // Refilled no faster than the medals won are: as fast, unless the machine says its play is slower (the pachinko).
      expect(FLOOR_RULES[game].playPerMinute).toBeLessThanOrEqual(FLOOR_RULES[game].perMinute);
      if (game !== 'pachinko') expect(FLOOR_RULES[game].playPerMinute).toBe(FLOOR_RULES[game].perMinute);
    }
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
    // Candy Shop Medal Maze: one medal a play, the one that rolls.
    expect(FLOOR_RULES['coin-maze'].stakeMost).toBe(MAZE_STAKE);
    expect(MAZE_STAKE).toBe(1);
    // Video Keno: one game at its biggest bet.
    expect(FLOOR_RULES.keno.stakeMost).toBe(KENO_BET_MOST);
    expect(KENO_BET_MOST).toBe(Math.max(...KENO_BETS));
    // Hot Spring Smart Ball: five medals a play, for its ten marbles.
    expect(FLOOR_RULES['smart-ball'].stakeMost).toBe(SMART_STAKE);
    expect(SMART_STAKE).toBe(5);
    // Goldfish Lantern Pachinko: played is the balls fired, ten a medal, and a lend is not play. The most at once: a
    // 10-round hit's rounds played out as the page is left, ten balls a round.
    const roundsMost = Math.max(...[...PACHINKO_SPLIT_HESO, ...PACHINKO_SPLIT_DENCHU].map(({ kind }) => kind.rounds));
    expect(FLOOR_RULES.pachinko.stakeMost).toBe((roundsMost * PACHINKO_COUNT) / PACHINKO_BALLS_PER_MEDAL);
    expect(FLOOR_RULES.pachinko.stakeMost).toBe(10);
    // Cherry Blossom Carousel: a medal fed at a time (the handful put into its slot is played only as it is fed).
    expect(FLOOR_RULES['carousel-pusher'].stakeMost).toBe(1);
    // Onsen Shooting Gallery: six medals a play, for its six corks.
    expect(FLOOR_RULES['shooting-gallery'].stakeMost).toBe(GALLERY_STAKE);
    expect(GALLERY_STAKE).toBe(6);
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
      // Perfect timing at every gate (dynamic programming down the four gates and the pins, exact): no way of playing
      // brings back more.
      'coin-maze': mazeValue(mazeOdds().perfect.back),
      // The best ticket (one spot: 9/10 exactly), the hypergeometric chances of every catch and the last ball's ×5:
      // the player chooses the ticket, so the floor is told the best of the ten.
      keno: kenoValue(kenoOdds().best),
      // Perfect play: the best strength for every marble for the board as it stands (dynamic programming over every set
      // of lit holes and marbles left, exact): no way of pulling the plunger brings back more.
      'smart-ball': smartValue(PUBLISHED_SMART_BALL_ODDS.perfect.back),
      // Perfect play with 止め打ち: the best strength in each mode, no ball fired into full holds or between rounds
      // (the Markov reward process, exact): no way of playing the handle brings back more.
      pachinko: pachinkoValue(PUBLISHED_PACHINKO_ODDS.perfect.back),
      // Perfect play: the best figure and band for every cork for the shelf as it stands (dynamic programming over every
      // state of the shelf and every count of corks left, exact): no way of aiming brings back more.
      'shooting-gallery': galleryValue(PUBLISHED_SHOOTING_GALLERY_ODDS.perfect.back),
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
    // Cherry Blossom Carousel's too: its timed play over six million medals (published.ts), rounded up.
    expect(FLOOR_RULES['carousel-pusher'].bestReturn).toBe(Math.ceil(PUBLISHED_CAROUSEL.ways.timed.return * 10_000) / 10_000);
  });

  it('links only the machines whose best play, with the floor jackpot added, stays at or under 100%', () => {
    expect([...LINKED_GAMES]).toEqual(['medal-pusher', 'slot-machine', 'janken', 'roulette', 'three-card-poker', 'fishing', 'horse-race', 'ball-bingo', 'big-wheel', 'high-low', 'sic-bo', 'sugoroku', 'coin-maze', 'keno', 'smart-ball', 'pachinko', 'carousel-pusher', 'shooting-gallery']);
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

  it('Candy Shop Medal Maze: the BIG WIN at the end pockets, the WIN in the middle, and perfect timing as the best return', () => {
    expect(FLOOR_RULES['coin-maze'].most).toBe(MAZE_MOST);
    expect(FLOOR_RULES['coin-maze'].most).toBe(5);
    expect(FLOOR_RULES['coin-maze'].labels['maze-big']).toEqual({ amounts: [MAZE_PAYS.big], feed: true });
    expect(FLOOR_RULES['coin-maze'].labels['maze-win']).toEqual({ amounts: [MAZE_PAYS.win], feed: false });
    // Every named win a play can make is one the floor believes.
    const random = mazeSeeded(3);
    for (let n = 0; n < 2_000; n++) {
      const play = mazePlay(mazeDraw(random), [1, 1, 1, 1].slice(0, MAZE_GATES), true);
      const label = mazeLabel(play);
      if (label) expect(labelPays('coin-maze', label, play.won)).toBe(true);
      expect(play.won).toBeLessThanOrEqual(FLOOR_RULES['coin-maze'].most);
    }
    // The rule is perfect timing, 121,275/131,072, rounded up; an everyday hand and blind presses bring back less.
    const odds = mazeOdds();
    expect(`${odds.perfect.back.num}/${odds.perfect.back.den}`).toBe('121275/131072');
    expect(FLOOR_RULES['coin-maze'].bestReturn).toBe(0.9253);
    expect(mazeValue(odds.typical.back)).toBeLessThan(FLOOR_RULES['coin-maze'].bestReturn);
    expect(mazeValue(odds.blind.back)).toBeLessThan(mazeValue(odds.typical.back));
  });

  it('Video Keno: the 10-spot top on the last ball on the biggest bet, every spot caught named on every bet, and the best ticket as the best return', () => {
    expect(FLOOR_RULES.keno.most).toBe(KENO_MOST);
    expect(FLOOR_RULES.keno.most).toBe(100_000);
    for (const n of KENO_SPOTS) for (const pay of KENO_PAYS[n]) expect(pay * KENO_TIMES * KENO_BET_MOST).toBeLessThanOrEqual(FLOOR_RULES.keno.most);
    // Every spot caught, on five spots or more: its whole win on every bet, with the last ball's ×5 or without.
    const all = KENO_SPOTS.filter((n) => n >= KENO_ALL_FROM).flatMap((n) => KENO_BETS.flatMap((bet) => [1, KENO_TIMES].map((times) => KENO_PAYS[n][n] * times * bet)));
    expect(FLOOR_RULES.keno.labels['keno-all'].amounts).toEqual(sorted(all));
    expect(FLOOR_RULES.keno.labels['keno-all'].feed).toBe(true);
    // Every named win a game can make is one the floor believes.
    const random = kenoSeeded(4);
    for (let g = 0; g < 2_000; g++) {
      const spots = kenoPick(5 + (g % 6), random);
      const balls = kenoDraw(random);
      // Every spot caught, now and then: the ticket is made of the balls drawn.
      const ticket = g % 3 === 0 ? [...balls.slice(0, spots.length - 1), balls[19]].sort((a, b) => a - b) : spots;
      const bet = KENO_BETS[g % KENO_BETS.length];
      const won = kenoWin(ticket, balls, bet);
      const label = kenoLabel(ticket, balls);
      if (label) expect(labelPays('keno', label, won), `${ticket} ${won}`).toBe(true);
      expect(won).toBeLessThanOrEqual(FLOOR_RULES.keno.most);
    }
    // The rule is the best ticket, one spot, at 9/10 exactly; every other ticket brings back less, and none less than 89.6%.
    const odds = kenoOdds();
    expect(`${odds.best.num}/${odds.best.den}`).toBe('9/10');
    expect(FLOOR_RULES.keno.bestReturn).toBe(0.9);
    for (const ticket of odds.tickets) {
      expect(kenoValue(ticket.back)).toBeLessThanOrEqual(FLOOR_RULES.keno.bestReturn);
      expect(kenoValue(ticket.back)).toBeGreaterThan(0.896);
    }
  });

  it('Hot Spring Smart Ball: one, two and three lines, the most three, and perfect play as the best return', () => {
    expect(FLOOR_RULES['smart-ball'].most).toBe(SMART_MOST);
    expect(FLOOR_RULES['smart-ball'].most).toBe(100);
    expect(FLOOR_RULES['smart-ball'].labels['smart-triple']).toEqual({ amounts: [SMART_PAYS[3]], feed: true });
    expect(FLOOR_RULES['smart-ball'].labels['smart-double']).toEqual({ amounts: [SMART_PAYS[2]], feed: false });
    expect(FLOOR_RULES['smart-ball'].labels['smart-line']).toEqual({ amounts: [SMART_PAYS[1]], feed: false });
    // Every named win a play can make is one the floor believes, whatever strengths the marbles are shot at.
    const random = smartSeeded(3);
    for (let n = 0; n < 2_000; n++) {
      const play = smartPlay(smartDraw(random), Array.from({ length: SMART_MARBLES }, (_, m) => (m + n) % 7));
      const label = smartLabel(play);
      if (label) expect(labelPays('smart-ball', label, play.won)).toBe(true);
      expect(play.won).toBeLessThanOrEqual(FLOOR_RULES['smart-ball'].most);
    }
    // The rule is perfect play, 93.4555...%, rounded up; an everyday hand and blind shots bring back less.
    const odds = PUBLISHED_SMART_BALL_ODDS;
    expect(`${odds.perfect.back.num}/${odds.perfect.back.den}`).toBe('19416340307406796973/20776019874734407680');
    expect(FLOOR_RULES['smart-ball'].bestReturn).toBe(0.9346);
    expect(smartValue(odds.typical.back)).toBeLessThan(FLOOR_RULES['smart-ball'].bestReturn);
    expect(smartValue(odds.blind.back)).toBeLessThan(smartValue(odds.typical.back));
  });

  it('Goldfish Lantern Pachinko: a hit’s rounds by name, a run of five hits or more shown to the floor, and perfect play as the best return', () => {
    const rule = FLOOR_RULES.pachinko;
    // A hit's rounds at the counter: ten balls in a round, ten back for each, ten balls a medal.
    const kinds = [...PACHINKO_SPLIT_HESO, ...PACHINKO_SPLIT_DENCHU].map(({ kind }) => kind);
    for (const kind of kinds) {
      expect(pachinkoHitMedals(kind)).toBe((kind.rounds * PACHINKO_COUNT * PACHINKO_PAY_ATTACKER) / PACHINKO_BALLS_PER_MEDAL);
      expect(labelPays('pachinko', pachinkoHitLabel(kind), pachinkoHitMedals(kind))).toBe(true);
    }
    expect(rule.labels['pachinko-4r']).toEqual({ amounts: [40], feed: false });
    expect(rule.labels['pachinko-10r']).toEqual({ amounts: [100], feed: false });
    // A run: named from five hits, the least five 4-round hits, up to what the floor believes.
    expect(rule.labels['pachinko-rush']).toEqual({ min: PACHINKO_RUSH_NAMED * 40, max: PACHINKO_RUSH_MOST, feed: true });
    expect(rule.most).toBe(PACHINKO_RUSH_MOST);
    expect(pachinkoRushPrize({ hits: PACHINKO_RUSH_NAMED, balls: PACHINKO_RUSH_NAMED * 400 })).toBe(200);
    expect(pachinkoRushPrize({ hits: 500, balls: 500 * 1_000 })).toBe(PACHINKO_RUSH_MOST);
    expect(pachinkoRushPrize({ hits: PACHINKO_RUSH_NAMED - 1, balls: 4_000 })).toBeNull();
    // The fastest medals come in: a ball every slot into the open attacker, ten balls back each.
    expect(rule.perMinute).toBe(((60_000 / PACHINKO_SLOT_MS) * PACHINKO_PAY_ATTACKER) / PACHINKO_BALLS_PER_MEDAL);
    // The fastest medals are played: a ball every slot, ten balls a medal, 10 a minute. Not the medals won's 100, which
    // would let ten times the play the handle can fire into the floor jackpot.
    expect(rule.playPerMinute).toBe(60_000 / PACHINKO_SLOT_MS / PACHINKO_BALLS_PER_MEDAL);
    expect(rule.playPerMinute).toBe(10);
    expect(rule.playBurst).toBe(rule.stakeMost + 10 * 10);
    // The rule is perfect play, rounded up; an everyday hand and the handle left at its start bring back less.
    const odds = PUBLISHED_PACHINKO_ODDS;
    expect(rule.bestReturn).toBe(0.9346);
    expect(pachinkoValue(odds.perfect.back)).toBeGreaterThan(0.9345);
    expect(pachinkoValue(odds.typical.back)).toBeLessThan(rule.bestReturn);
    expect(pachinkoValue(odds.blind.back)).toBeLessThan(pachinkoValue(odds.typical.back));
  });

  it('Onsen Shooting Gallery: the most a play pays is what six corks can knock off, the cat named whatever else falls with it, three figures without it', () => {
    const rule = FLOOR_RULES['shooting-gallery'];
    const tag = (kind: (typeof GALLERY_SHELF)[number]) => GALLERY_KINDS[kind].medals;
    expect(rule.most).toBe(GALLERY_MOST);
    expect(GALLERY_MOST).toBe(41);
    expect(rule.labels['gallery-cat']).toEqual({ min: tag('cat'), max: GALLERY_MOST, feed: true });
    // Without the cat, the six figures worth most: everything six corks can knock off.
    const others = GALLERY_SHELF.filter((kind) => kind !== 'cat')
      .map(tag)
      .sort((a, b) => b - a);
    const smallest = [...others].sort((a, b) => a - b);
    expect(rule.labels['gallery-trio']).toEqual({ min: smallest[0] + smallest[1] + smallest[2], max: others.slice(0, GALLERY_CORKS).reduce((a, b) => a + b, 0), feed: false });
    expect(rule.feedFrom).toBe(tag('cat'));
    // Every play's named win is one its label can pay, and no play pays more than the most.
    const random = gallerySeeded(5);
    let named = 0;
    for (let n = 0; n < 2_000; n++) {
      const draw = galleryDraw(random);
      const shots: ReturnType<typeof galleryShot>[] = [];
      let play = galleryPlay(draw, shots);
      while (!play.complete) {
        shots.push(galleryShot(n % 2 === 0 ? 'perfect' : 'blind', play.positions, GALLERY_CORKS - shots.length, random));
        play = galleryPlay(draw, shots);
      }
      const label = galleryLabel(play);
      if (label) {
        named += 1;
        expect(labelPays('shooting-gallery', label, play.won)).toBe(true);
      }
      expect(play.won).toBeLessThanOrEqual(rule.most);
    }
    expect(named).toBeGreaterThan(0);
    const odds = PUBLISHED_SHOOTING_GALLERY_ODDS;
    expect(rule.bestReturn).toBe(0.9196);
    expect(galleryValue(odds.typical.back)).toBeLessThan(rule.bestReturn);
    expect(galleryValue(odds.blind.back)).toBeLessThan(galleryValue(odds.typical.back));
  });

  it('Cherry Blossom Carousel: the dish’s jackpot from its start to its top, three alike by name, and its measured best play', () => {
    const rule = FLOOR_RULES['carousel-pusher'];
    expect(CAROUSEL_STOCK_MOST).toBe(CAROUSEL_STOCK.most);
    expect(rule.most).toBe(CAROUSEL_STOCK.most);
    expect(rule.labels['carousel-jackpot']).toEqual({ min: CAROUSEL_STOCK.start, max: CAROUSEL_STOCK.most, feed: true });
    expect(rule.labels['carousel-triple']).toEqual({ amounts: [CAROUSEL_PRIZES.triple], feed: false });
    expect(labelPays('carousel-pusher', 'carousel-jackpot', CAROUSEL_STOCK.start)).toBe(true);
    expect(labelPays('carousel-pusher', 'carousel-jackpot', CAROUSEL_STOCK.start - 1)).toBe(false);
    expect(labelPays('carousel-pusher', 'carousel-triple', CAROUSEL_PRIZES.triple)).toBe(true);
    expect(labelPays('carousel-pusher', 'carousel-triple', CAROUSEL_PRIZES.sevens)).toBe(false);
    // Every prize the counter pays straight into the tray is under the most the floor believes.
    for (const medals of Object.values(CAROUSEL_PRIZES)) expect(medals).toBeLessThanOrEqual(rule.most);
    // Best play, about 90%, never over 100% even at the top of its interval, and linked: the floor jackpot keeps it under.
    const { timed, steady, held } = PUBLISHED_CAROUSEL.ways;
    expect(timed.return + timed.half).toBeLessThan(1);
    expect(rule.bestReturn + EXPECTED_PER_MEDAL).toBeLessThanOrEqual(1);
    expect(steady.return).toBeLessThan(rule.bestReturn);
    expect(held.return).toBeLessThan(steady.return);
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
    expect(labelPays('coin-maze', 'maze-big', 5)).toBe(true);
    expect(labelPays('coin-maze', 'maze-big', 2)).toBe(false);
    expect(labelPays('coin-maze', 'maze-win', 2)).toBe(true);
    expect(labelPays('coin-maze', 'maze-win', 5)).toBe(false);
    expect(labelPays('keno', 'keno-all', 250)).toBe(true);
    expect(labelPays('keno', 'keno-all', 100_000)).toBe(true);
    expect(labelPays('keno', 'keno-all', 251)).toBe(false);
    expect(labelPays('smart-ball', 'smart-triple', 100)).toBe(true);
    expect(labelPays('smart-ball', 'smart-double', 20)).toBe(true);
    expect(labelPays('smart-ball', 'smart-line', 7)).toBe(true);
    expect(labelPays('smart-ball', 'smart-line', 20)).toBe(false);
    expect(labelPays('smart-ball', 'smart-triple', 7)).toBe(false);
    expect(labelPays('shooting-gallery', 'gallery-cat', 25)).toBe(true);
    expect(labelPays('shooting-gallery', 'gallery-cat', 41)).toBe(true);
    expect(labelPays('shooting-gallery', 'gallery-cat', 21)).toBe(false);
    expect(labelPays('shooting-gallery', 'gallery-trio', 6)).toBe(true);
    expect(labelPays('shooting-gallery', 'gallery-trio', 25)).toBe(false);
    expect(labelPays('pachinko', 'pachinko-4r', 40)).toBe(true);
    expect(labelPays('pachinko', 'pachinko-4r', 100)).toBe(false);
    expect(labelPays('pachinko', 'pachinko-rush', 199)).toBe(false);
    expect(labelPays('pachinko', 'pachinko-rush', 10_000)).toBe(true);
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
    expect(feedWorthy('coin-maze', 5, 'maze-big')).toBe(true);
    expect(feedWorthy('coin-maze', 2, 'maze-win')).toBe(false);
    expect(feedWorthy('keno', 250, 'keno-all')).toBe(true);
    expect(feedWorthy('keno', 400)).toBe(false);
    expect(feedWorthy('keno', 590)).toBe(true);
    expect(feedWorthy('smart-ball', 100, 'smart-triple')).toBe(true);
    expect(feedWorthy('smart-ball', 20, 'smart-double')).toBe(false);
    expect(feedWorthy('smart-ball', 7, 'smart-line')).toBe(false);
    expect(feedWorthy('shooting-gallery', 31, 'gallery-cat')).toBe(true);
    expect(feedWorthy('shooting-gallery', 9, 'gallery-trio')).toBe(false);
    expect(feedWorthy('pachinko', 200, 'pachinko-rush')).toBe(true);
    expect(feedWorthy('pachinko', 100, 'pachinko-10r')).toBe(false);
    expect(feedWorthy('pachinko', 40, 'pachinko-4r')).toBe(false);
  });
});
