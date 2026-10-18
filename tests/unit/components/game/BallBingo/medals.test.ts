import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ledgerKey } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, medalsOutAt, parseLedger, receiptsOf } from '@/components/game/MedalCenter/ledger';
import { POCKETS, analyzeMachine, linesOf, playOut, pocketOfNumber } from '@/components/game/BallBingo/engine';
import {
  BINGO_GAME,
  FULL_CARD_LABEL,
  ROUND_KEY,
  createTable,
  marksOf,
  parseRound,
  roundKey,
  serializeRound,
  winOf,
  type Round,
  type TableStorage,
} from '@/components/game/BallBingo/medals';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';

// Ball Bingo at the medal center's bank, run against the real bank in a fake browser (bankFakes.ts): one storage that
// every page shares, the one card, and pages that can be hidden, left, reloaded or lost. Nothing is fetched and no real
// account is named. A game is a round: its balls drawn and its stake taken at START, its win paid once.

const reports = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/components/game/MedalCenter/floor/reporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/game/MedalCenter/floor/reporter')>()),
  floorReport: (...args: unknown[]) => {
    reports.push(args);
  },
}));
beforeEach(() => {
  reports.length = 0;
});

const at = (id: string) => POCKETS.findIndex((p) => p.id === id);
const n = (number: number) => pocketOfNumber(number);
const OUT = at('out-l');

/** The full card: a free ball, CHANCE TIME, and every number. */
const FULL = [at('free-l'), at('chance'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n)];
/** The top row of the card (2, 7, 6), and two balls OUT. */
const ONE_LINE = [n(2), n(7), n(6), OUT, OUT];
/** Every ball OUT. */
const LOSS = [OUT, OUT, OUT, OUT, OUT];

let rounds = 0;
const name = () => `round${String(++rounds).padStart(4, '0')}`;

/** A page with the machine on it, seated at the bank, in a tab of the given name. */
function bingo(page: FakePage, tab = 'taba', storage: TableStorage = page.env) {
  const events: string[] = [];
  const table = createTable({
    bank: page.bank,
    storage,
    tab,
    name,
    events: {
      granted: () => events.push('granted'),
      yielding: (why) => events.push(`yielding ${why}`),
      restart: () => events.push('restart'),
    },
  });
  const getUp = table.sit();
  return { table, events, getUp };
}

const stored = (browser: FakeBrowser, uid: string | null = null) => parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
const storedBalance = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = stored(browser, uid);
  return ledger ? balanceOf(ledger) : null;
};
const storedRound = (browser: FakeBrowser, owner: string | null = null): Round | null => parseRound(browser.storage.get(roundKey(owner)) ?? null);

/** Bets and expects the bet to be taken. */
function bet(table: ReturnType<typeof bingo>['table'], medals: number, draws: number[]): Round {
  const placed = table.bet(medals, draws);
  if (!placed.ok) throw new Error(`the bet was refused: ${placed.why}`);
  return placed.round;
}

/** A page lost without a word, as when a tab crashes: whatever lock it held is let go, and nothing else happens. */
function crash(browser: FakeBrowser, page: FakePage) {
  page.closed = true;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
}

describe('the games the tests play', () => {
  it('are games a machine could have drawn, paying what the card says', () => {
    for (const draws of [FULL, ONE_LINE, LOSS]) expect(playOut(draws)).not.toBeNull();
    expect(linesOf(marksOf({ draws: FULL }))).toBe(8);
    expect(linesOf(marksOf({ draws: ONE_LINE }))).toBe(1);
    for (const medals of [1, 2, 3]) {
      expect(winOf({ bet: medals as 1 | 2 | 3, draws: FULL })).toBe(500 * medals);
      expect(winOf({ bet: medals as 1 | 2 | 3, draws: ONE_LINE })).toBe(2 * medals);
      expect(winOf({ bet: medals as 1 | 2 | 3, draws: LOSS })).toBe(0);
    }
    // The medals change the units, not the machine.
    expect(analyzeMachine().rtp).toBeCloseTo(0.8997431332867973, 13);
  });
});

describe('the medals a game bets and wins', () => {
  it('takes the stake once as START is pressed, and pays the card once as the last ball drops', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table, events } = bingo(page);
    await quiet(browser);
    expect(events).toEqual(['granted']);
    const round = bet(table, 3, FULL);
    expect(storedBalance(browser)).toBe(WELCOME - 3);
    expect(storedRound(browser)).toEqual({ ...round, paid: false });
    expect(round).toMatchObject({ bet: 3, draws: FULL, shown: 0, owner: null, era: 0, tab: 'taba', paid: false });
    expect(reports).toEqual([[BINGO_GAME, { played: 3 }]]);

    // Each ball down is written down, so that a reload carries on from the next.
    table.progress(round, 4);
    expect(storedRound(browser)?.shown).toBe(4);
    table.progress(round, 2);
    expect(storedRound(browser)?.shown).toBe(4);

    expect(table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 1500);
    expect(storedRound(browser)).toBeNull();
    // The full card is told to the medal floor once, by its name.
    expect(reports.at(-1)).toEqual([BINGO_GAME, { won: 1500, prize: { medals: 1500, label: FULL_CARD_LABEL } }]);
    // However often it is said again, it is not paid again.
    expect(table.finish(round)).toBe(true);
    expect(table.payDue()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 1497);

    const lost = bet(table, 2, LOSS);
    expect(table.finish(lost)).toBe(true);
    const line = bet(table, 1, ONE_LINE);
    expect(table.finish(line)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME + 1497 - 2 - 1 + 2);
    expect(reports.at(-1)).toEqual([BINGO_GAME, { won: 2, prize: { medals: 2, label: undefined } }]);
    // Every receipt let go of once nothing needs it.
    const ledger = stored(browser)!;
    expect(receiptsOf(ledger, ledger.device).ids).toEqual([]);
  });

  it('refuses a bet the machine does not take, balls it could not have drawn, a bet the medals do not cover, and a second game while one is unpaid', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = bingo(page);
    await quiet(browser);
    expect(table.bet(4, LOSS)).toEqual({ ok: false, why: 'bet' });
    expect(table.bet(0, LOSS)).toEqual({ ok: false, why: 'bet' });
    expect(table.bet(1, [n(5), n(5), OUT, OUT, OUT])).toEqual({ ok: false, why: 'draws' });
    expect(table.bet(1, [OUT, OUT])).toEqual({ ok: false, why: 'draws' });
    expect(page.bank.take(WELCOME - 2)).toBe(true);
    expect(table.bet(3, LOSS)).toEqual({ ok: false, why: 'medals' });
    expect(storedRound(browser)).toBeNull();
    const round = bet(table, 2, LOSS);
    expect(storedBalance(browser)).toBe(0);
    expect(table.bet(1, LOSS)).toEqual({ ok: false, why: 'medals' });
    table.finish(round);
    expect(storedBalance(browser)).toBe(0);
    page.bank.give(4);
    // A round written down and not paid, which this page cannot pay (another era), blocks the next bet.
    browser.storage.set(ROUND_KEY, serializeRound({ v: 1, id: 'later', tab: 'taba', owner: null, era: 7, bet: 1, draws: FULL, shown: 0, paid: false, receipts: true }));
    expect(table.bet(1, LOSS)).toEqual({ ok: false, why: 'unpaid' });
    expect(storedBalance(browser)).toBe(4);
  });

  it('has the stake out while the balls fall, and none once the game is over, on a loss as on a win', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = bingo(page);
    await quiet(browser);
    const out = () => medalsOutAt(stored(browser)!);
    for (const draws of [LOSS, ONE_LINE]) {
      const round = bet(table, 1, draws);
      expect(out()).toEqual([BINGO_GAME]);
      expect(page.bank.getState().out).toEqual([BINGO_GAME]);
      expect(table.finish(round)).toBe(true);
      expect(out()).toEqual([]);
    }
  });
});

describe('a game in progress when the page goes', () => {
  it('resumes after a reload from the ball it had got to: the page going pays it while it holds the card, and the same tab carries on, paid once', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = bingo(first, 'taba');
    await quiet(browser);
    const round = bet(one.table, 1, FULL);
    one.table.progress(round, 3);
    // The reload: the page is left (pagehide) with balls still to come.
    first.hide('left');
    expect(one.events.at(-1)).toBe('yielding left');
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 500);
    expect(storedRound(browser)).toEqual({ ...round, shown: 3, paid: true });
    first.close();

    // The tab comes back with the same name, and is given its game again where it stood: the same balls, three down.
    const again = browser.open();
    const two = bingo(again, 'taba');
    await quiet(browser);
    expect(two.table.leftover()).toEqual({ ...round, shown: 3, paid: true });
    two.table.progress(round, FULL.length);
    expect(two.table.finish(round)).toBe(true);
    expect(storedRound(browser)).toBeNull();
    expect(two.table.leftover()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 499);

    // Nothing is paid again by anyone, however many pages open after.
    const third = browser.open();
    const three = bingo(third, 'tabc');
    await quiet(browser);
    expect(three.table.payDue()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME + 499);
    // The floor heard of the full card once.
    expect(reports.filter(([, report]) => (report as { won?: number }).won === 500)).toHaveLength(1);
  });

  it('pays a game whose page was lost without a word (a crash) when the next page of the machine holds the card, once, and only its own tab shows it again', async () => {
    const browser = new FakeBrowser();
    const lost = browser.open();
    const one = bingo(lost, 'taba');
    await quiet(browser);
    const round = bet(one.table, 2, ONE_LINE);
    one.table.progress(round, 1);
    crash(browser, lost);
    expect(storedBalance(browser)).toBe(WELCOME - 2);
    expect(storedRound(browser)?.paid).toBe(false);

    const other = browser.open();
    const two = bingo(other, 'tabb');
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 2 + 4);
    expect(storedRound(browser)).toEqual({ ...round, shown: 1, paid: true });
    expect(two.table.leftover()).toBeNull();

    const back = browser.open();
    const three = bingo(back, 'taba');
    await quiet(browser);
    expect(three.table.leftover()).toMatchObject({ id: round.id, shown: 1, paid: true });
    three.table.finish(round);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 2);
    expect(storedRound(browser)).toBeNull();
  });
});

describe('the card', () => {
  it('pays the game as the card goes to a machine in another tab, takes no bet and writes nothing without it, and has it back with Play here', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = bingo(first, 'taba');
    await quiet(browser);
    const round = bet(one.table, 1, ONE_LINE);

    const second = browser.open();
    const two = bingo(second, 'tabb');
    await quiet(browser);
    expect(one.events).toEqual(['granted', 'yielding moment']);
    expect(one.table.holding()).toBe(false);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 2);
    expect(one.table.bet(1, LOSS)).toEqual({ ok: false, why: 'card' });
    // Its balls keep dropping in front of the player: nothing is written for them without the card, and nothing paid.
    one.table.progress(round, 4);
    expect(storedRound(browser)?.shown).toBe(0);
    expect(one.table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME + 1);

    const there = bet(two.table, 3, LOSS);
    two.table.finish(there);
    expect(storedBalance(browser)).toBe(WELCOME - 2);

    one.table.play();
    await quiet(browser);
    expect(one.table.holding()).toBe(true);
    expect(two.table.holding()).toBe(false);
    const here = bet(one.table, 1, ONE_LINE);
    one.table.finish(here);
    expect(storedBalance(browser)).toBe(WELCOME - 1);
  });

  it('pays the game under way when the machine is put away mid-game, as when the player goes to another page of the site', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const one = bingo(page, 'taba');
    await quiet(browser);
    const round = bet(one.table, 2, FULL);
    one.getUp();
    expect(storedBalance(browser)).toBe(WELCOME - 2 + 1000);
    await quiet(browser);
    expect(hub.bank.getState().balance).toBe(WELCOME + 998);
    const back = bingo(page, 'taba');
    await quiet(browser);
    expect(back.table.leftover()?.id).toBe(round.id);
    back.table.finish(round);
    expect(storedRound(browser)).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME + 998);
  });

  it('lends the card to the medal center’s front for a moment mid-game: the game is paid once, around the day’s bonus', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { table, events } = bingo(page);
    await quiet(browser);
    const round = bet(table, 2, ONE_LINE);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(events).toEqual(['granted', 'yielding moment', 'granted']);
    const bonus = storedBalance(browser)! - (WELCOME - 2 + 4);
    expect(bonus).toBeGreaterThan(0);
    expect(table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 2 + 4 + bonus);
  });
});

describe('the reset at the medal center', () => {
  it('voids the game under way, starts the machine over, and plays on in the new era', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { table, events } = bingo(page);
    await quiet(browser);
    page.bank.give(500);
    const round = bet(table, 3, FULL);
    hub.bank.reset();
    await quiet(browser);
    expect(events).toContain('restart');
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(storedRound(browser)).toBeNull();
    expect(table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(BINGO_GAME)).toBe(false);
    const next = bet(table, 1, ONE_LINE);
    expect(next.era).toBe(1);
    table.finish(next);
    expect(storedBalance(browser)).toBe(WELCOME + 1);
  });
});

describe('what was kept before', () => {
  it('reads back only a whole round, as written, whose balls are a game a machine could have drawn', () => {
    const round: Round = { v: 1, id: 'abc123', tab: 'taba', owner: null, era: 2, bet: 3, draws: ONE_LINE, shown: 2, paid: false, receipts: true };
    expect(parseRound(serializeRound(round))).toEqual(round);
    expect(parseRound(serializeRound({ ...round, owner: 'test-player-1' }))?.owner).toBe('test-player-1');
    const broken = [
      null,
      42,
      '',
      'not json',
      '[]',
      JSON.stringify({ credits: 500 }),
      JSON.stringify({ ...round, v: 2 }),
      JSON.stringify({ ...round, bet: 10 }),
      JSON.stringify({ ...round, draws: [n(5), n(5), OUT, OUT, OUT] }),
      JSON.stringify({ ...round, draws: [OUT, OUT, OUT] }),
      JSON.stringify({ ...round, draws: 'out' }),
      JSON.stringify({ ...round, shown: 6 }),
      JSON.stringify({ ...round, shown: -1 }),
      JSON.stringify({ ...round, receipts: undefined }),
      JSON.stringify({ ...round, era: 1.5 }),
      JSON.stringify({ ...round, paid: 'yes' }),
      JSON.stringify({ ...round, id: 'Not A Name!' }),
      JSON.stringify({ ...round, owner: 7 }),
      'x'.repeat(5_000),
    ];
    for (const text of broken) expect(parseRound(text)).toBeNull();
  });

  it('ignores anything under the round’s name that is not a round, and adds no medals for it', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(ROUND_KEY, JSON.stringify({ win: 1500 }));
    const page = browser.open();
    const { table } = bingo(page);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(table.current()).toBeNull();
    expect(table.leftover()).toBeNull();
  });
});

describe('storage that keeps nothing', () => {
  it('holds the round on the page instead, and still takes the stake once and pays the card once', async () => {
    const browser = new FakeBrowser();
    browser.blocked = true;
    const page = browser.open();
    const { table } = bingo(page);
    await quiet(browser);
    const round = bet(table, 1, FULL);
    expect(page.bank.balance()).toBe(WELCOME - 1);
    table.progress(round, 5);
    expect(table.current()?.shown).toBe(5);
    expect(table.finish(round)).toBe(true);
    expect(table.finish(round)).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 1 + 500);
    expect(table.current()).toBeNull();
  });
});

describe('a browser that dies between two writes', () => {
  // The round and the medals are separate writes (medals.ts): the browser is killed at every moment of a game, started
  // again, and the machine opened again in the same tab. Every game is paid exactly once, or, if its stake never went
  // in, never happened at all.

  const machines = new Map<FakeBrowser, ReturnType<typeof bingo>>();
  const setUp = async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = bingo(page, 'taba');
    await quiet(browser);
    machines.set(browser, machine);
    return browser;
  };

  for (const [what, draws] of [
    ['a full card', FULL],
    ['a game that wins nothing', LOSS],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies in a game`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const { table } = machines.get(browser)!;
          const round = bet(table, 3, [...draws]);
          for (let ball = 1; ball <= draws.length; ball++) table.progress(round, ball);
          table.finish(round);
        },
        async (after, reached) => {
          const before = stored(after)!;
          const staked = before.rows[before.device]?.spent === 3;
          const page = after.open();
          const { table } = bingo(page, 'taba');
          await quiet(after);
          const shown = table.leftover();
          if (shown) table.finish(shown);
          await quiet(after);
          const expected = staked ? WELCOME - 3 + winOf({ bet: 3, draws: [...draws] }) : WELCOME;
          expect(storedBalance(after), `died after ${reached} writes`).toBe(expected);
          const left = storedRound(after);
          expect(left === null || left.paid, `died after ${reached} writes`).toBe(true);
          // Another game, played through: every receipt is let go of once nothing needs it.
          const next = bet(table, 1, [...LOSS]);
          table.finish(next);
          const ledger = stored(after)!;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([]);
          expect(balanceOf(ledger)).toBe(expected - 1);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(4);
    });
  }

  it('pays a game exactly once wherever the browser dies while the page going pays it, and the tab carries on with it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const { table } = machines.get(browser)!;
        const round = bet(table, 2, [...FULL]);
        table.progress(round, 2);
        // A reload: the page going pays the game before the card goes.
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const before = stored(after)!;
        const staked = before.rows[before.device]?.spent === 2;
        const page = after.open();
        const { table } = bingo(page, 'taba');
        await quiet(after);
        const shown = table.leftover();
        expect(shown !== null, `died after ${reached} writes`).toBe(staked);
        if (shown) {
          expect(shown.draws).toEqual(FULL);
          expect(table.finish(shown)).toBe(true);
        }
        expect(storedBalance(after), `died after ${reached} writes`).toBe(staked ? WELCOME - 2 + 1000 : WELCOME);
      },
    );
  });
});
