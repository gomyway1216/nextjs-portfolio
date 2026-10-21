import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { CORKS, STAKE, finishedShots, playOf, type Draw, type Shot } from '@/components/game/ShootingGallery/engine';
import { PLAY_KEY, SHOOTING_GALLERY_GAME, createTable, parsePlay, playId, playKey, serializePlay, type PlayRecord, type Staked } from '@/components/game/ShootingGallery/medalTable';
import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger, take } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { drawFor } from './draws';

// Onsen Shooting Gallery plays with the medal center's medals: a play's six medals are taken once, what the figures it
// knocks off pay comes back once, and none of it is lost or doubled by a reload, another tab, a reset or a browser that
// dies between two writes. A play left unfinished is finished by the next page that holds the card: its corks as
// written down, the rest blind at the figures and bands drawn with it. The bank here is the real one
// (MedalCenter/bank.ts) in a fake browser (bankFakes.ts); nothing is fetched and no account is real.

const TOP = 1;
/** The player's aim in these plays: six corks at six small figures' top edges (the boxes, the daruma, a kokeshi). */
const AIMS: Shot[] = [
  [6, TOP],
  [7, TOP],
  [8, TOP],
  [3, TOP],
  [5, TOP],
  [0, TOP],
];
/** The same corks fired over the top: every one a miss, whatever the draw. */
const HIGH: Shot[] = AIMS.map(([t]) => [t, 0] as const);
/** One box off the shelf: 2 medals. The blind corks drawn are the player's own aims. */
const LINE_PLAY = drawFor(AIMS, ['fall', 'miss', 'rock', 'miss', 'rock', 'miss']);
const LINE_WON = 2;
/** Every cork knocks its figure off: 2 + 2 + 2 + 3 + 3 + 4 = 16. */
const TRIPLE_PLAY = drawFor(AIMS, ['fall', 'fall', 'fall', 'fall', 'fall', 'fall']);
const TRIPLE_WON = 16;
/** Every cork misses. */
const NOTHING = drawFor(AIMS, ['miss', 'miss', 'miss', 'miss', 'miss', 'miss']);

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): PlayRecord | null => parsePlay(browser.storage.get(playKey(owner)) ?? null);
const out = (browser: FakeBrowser) => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);
/** The first `n` of the player's aims (over the top, `high`). */
const shotsAll = (n: number, high = false): Shot[] => (high ? HIGH : AIMS).slice(0, n);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a play under way is finished as the card goes. */
function machineOn(page: FakePage) {
  let running: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('play') });
  seat.current = page.bank.sit(SHOOTING_GALLERY_GAME, {
    granted: () => undefined,
    yielding: (why) => {
      yielded.push(why);
      if (running && !running.paid && !running.void) table.settle(running);
    },
  });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    if (running) running.void = true;
    table.clear();
    page.bank.restarted(SHOOTING_GALLERY_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** START: the play is drawn (here: given) and the medals taken. */
    start(d: Draw = LINE_PLAY): Staked | null {
      const outcome = table.stake(d);
      running = outcome.kind === 'staked' ? outcome.staked : null;
      return running;
    },
    /** FIRE, for the cork in the gun: at the player's aim for it (over the top, `high`). */
    shoot(high = false) {
      if (!running) return 'gone';
      const c = running.record.shots.length;
      return table.shoot(running, c, (high ? HIGH : AIMS)[Math.min(c, CORKS - 1)]);
    },
    /** Fires `n` corks. */
    shootMany(n: number, high = false) {
      for (let i = 0; i < n; i++) this.shoot(high);
    },
    /** The last cork's figure comes to rest on this page (or Skip is pressed). */
    stop() {
      const ran = running;
      running = null;
      return ran ? table.settle(ran) : null;
    },
    running: () => running,
  };
}

/** A page that is killed without a word: no `pagehide`, the card let go by the browser. */
function crash(browser: FakeBrowser, page: FakePage): void {
  page.closed = true;
  page.watchers = null;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
  const next = browser.queue.shift();
  if (next) browser.tasks.push(() => browser.give2(next));
}

const finishLeft = (machine: ReturnType<typeof machineOn>) => {
  const left = machine.table.leftover();
  return left ? { left, settled: machine.table.settle({ record: left, stored: true, paid: false, void: false }) } : null;
};

describe('the draws used here', () => {
  it('play as they say: one box, every figure aimed at, nothing, and nothing over the top', () => {
    expect(playOf(LINE_PLAY, shotsAll(CORKS)).won).toBe(LINE_WON);
    expect(playOf(TRIPLE_PLAY, shotsAll(CORKS)).won).toBe(TRIPLE_WON);
    expect(playOf(NOTHING, shotsAll(CORKS)).won).toBe(0);
    expect(playOf(LINE_PLAY, shotsAll(CORKS, true)).won).toBe(0);
    expect(playOf(LINE_PLAY, [HIGH[0], ...shotsAll(CORKS).slice(1)]).won).toBe(0);
  });
});

describe('a play, once', () => {
  it('names a play so that no two share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => playId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });

  it('takes six medals at START, writes each cork down, and pays the figures off the shelf once as the last one comes to rest', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    const staked = machine.start(LINE_PLAY);
    expect(staked?.record).toMatchObject({ owner: null, era: 0, shots: [], paid: false });
    expect(stored(browser)).toBe(WELCOME - STAKE);
    expect(out(browser)).toEqual([SHOOTING_GALLERY_GAME]);
    for (let m = 0; m < CORKS; m++) {
      expect(machine.shoot()).toBe('kept');
      expect(record(browser)?.shots).toHaveLength(m + 1);
    }
    // No seventh cork.
    expect(machine.shoot()).toBe('gone');
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - STAKE + LINE_WON);
    expect(record(browser)).toMatchObject({ shots: shotsAll(CORKS), paid: true });
    expect(out(browser)).toEqual([]);
    expect(machine.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - STAKE + LINE_WON);
    // The next play knocks every figure aimed at off, and lets go of the last one's receipts.
    machine.start(TRIPLE_PLAY);
    machine.shootMany(CORKS);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 2 * STAKE + LINE_WON + TRIPLE_WON);
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids.every((id) => id.startsWith(`${SHOOTING_GALLERY_GAME}:${record(browser)!.id}:`))).toBe(true);
  });

  it('pays nothing for a play that knocks nothing off, and lets its medals out no longer', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.start(NOTHING);
    machine.shootMany(CORKS);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - STAKE);
    expect(out(browser)).toEqual([]);
    // The aim is the player's: the same draw fired over the top knocks nothing off.
    machine.start(LINE_PLAY);
    machine.shootMany(CORKS, true);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 2 * STAKE);
  });

  it('finishes a play left mid-way with the corks fired and the rest blind, at the figures and bands drawn with it', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    // Blind over the top from the third cork on: the two boxes the player knocked off, and nothing else.
    const drawn = drawFor(AIMS, ['fall', 'fall', 'fall', 'fall', 'fall', 'fall']);
    machine.start({ ...drawn, bands: drawn.bands.map((band, c) => (c < 2 ? band : 0)) });
    machine.shootMany(2);
    expect(machine.stop()).toBe('paid');
    // Two of the corks were the player's: the record says so, for the page that shows the play next.
    const shots = record(browser)!.shots;
    expect(record(browser)).toMatchObject({ paid: true, own: 2 });
    expect(shots.slice(0, 2)).toEqual(shotsAll(2));
    expect(shots.slice(2).map(([, band]) => band)).toEqual([0, 0, 0, 0]);
    expect(stored(browser)).toBe(WELCOME - STAKE + 2 + 2);
  });

  it('marks no shot blind on a play the player shot to its end', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.start(LINE_PLAY);
    machine.shootMany(CORKS);
    expect(machine.stop()).toBe('paid');
    expect(record(browser)).toMatchObject({ shots: shotsAll(CORKS), paid: true });
    expect(record(browser)).not.toHaveProperty('own');
  });

  it('takes nothing it should not: a draw it could not make, too few medals, a page without the card', async () => {
    const browser = new FakeBrowser();
    const one = machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake({ ...LINE_PLAY, slots: [64, ...LINE_PLAY.slots.slice(1)] }).kind).toBe('short');
    expect(one.table.stake({ ...LINE_PLAY, bands: [1] }).kind).toBe('short');
    expect(stored(browser)).toBe(WELCOME);
    machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake(LINE_PLAY).kind).toBe('away');
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
  });

  it('takes no play from fewer than five medals', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(BANK_KEY, serializeLedger(take(createLedger('fewmedals01'), WELCOME - 3)!));
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    expect(stored(browser)).toBe(3);
    expect(machine.table.stake(NOTHING).kind).toBe('short');
    expect(stored(browser)).toBe(3);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
  });

  it('plays no second play while one of these medals is unfinished: it is finished first', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    first.start(LINE_PLAY);
    crash(browser, killed);
    const next = machineOn(browser.open());
    await quiet(browser);
    expect(next.table.stake(LINE_PLAY).kind).toBe('unfinished');
    expect(finishLeft(next)?.settled).toBe('paid');
    expect(next.table.stake(LINE_PLAY).kind).toBe('staked');
  });
});

describe('the re-entrancy of the bank', () => {
  it('never takes the play being staked for one left unfinished: the bank tells its listeners inside START', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const found: (string | null)[] = [];
    let inside = false;
    page.bank.subscribe(() => {
      if (inside) found.push(machine.table.leftover()?.id ?? null);
    });
    inside = true;
    const staked = machine.start(LINE_PLAY);
    inside = false;
    // The bank told its listeners as the medals went in and as the last play's receipts were let go of: none found a play to finish.
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((id) => id === null)).toBe(true);
    // And the medals are still out on the play: a look from inside the press settled nothing.
    expect(out(browser)).toEqual([SHOOTING_GALLERY_GAME]);
    expect(staked?.record.shots).toEqual([]);
    expect(machine.shoot()).toBe('kept');
  });
});

describe('a reload, another tab, a page killed mid-play', () => {
  it('finishes a play as the page is left, so the reloaded page finds it paid, once', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    machine.start(TRIPLE_PLAY);
    machine.shootMany(3);
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    expect(stored(browser)).toBe(WELCOME - STAKE + TRIPLE_WON);
    expect(record(browser)).toMatchObject({ shots: shotsAll(CORKS), paid: true });
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.table.last()?.paid).toBe(true);
    expect(machine.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - STAKE + TRIPLE_WON);
  });

  it('finds the same play after a page killed mid-play, finishes it with the shots written down, and pays it once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    const staked = first.start(TRIPLE_PLAY);
    first.shootMany(4);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - STAKE);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ id: staked?.record.id, shots: shotsAll(4), paid: false });
    expect(out(browser)).toEqual([SHOOTING_GALLERY_GAME]);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - STAKE + TRIPLE_WON);
    expect(record(browser)).toMatchObject({ shots: shotsAll(CORKS), paid: true });
    expect(out(browser)).toEqual([]);
    // A page that finds it again finds it paid.
    expect(reopened.table.leftover()).toBeNull();
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('already');
    expect(stored(browser)).toBe(WELCOME - STAKE + TRIPLE_WON);
  });

  it('is no free retry: a cork fired over the top stands, though the blind cork drawn would have knocked the box off', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    first.start(LINE_PLAY);
    first.shoot(true);
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(finishLeft(reopened)).toMatchObject({ settled: 'paid', left: { shots: [HIGH[0]] } });
    // The first box, the only one the draw knocks off, was missed over the top: nothing.
    expect(stored(browser)).toBe(WELCOME - STAKE);
  });

  it('finishes the play as another tab takes the medals; that tab finds nothing left to finish', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machineOn(first);
    await quiet(browser);
    one.start(LINE_PLAY);
    one.shoot();
    const two = machineOn(browser.open());
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(stored(browser)).toBe(WELCOME - STAKE + LINE_WON);
    expect(two.table.leftover()).toBeNull();
    // The first page's plunger does nothing more.
    expect(one.shoot()).toBe('gone');
    expect(one.stop()).toBe('already');
    expect(two.start(LINE_PLAY)).not.toBeNull();
  });
});

describe('the medal center’s reset', () => {
  it('voids a play under way: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start(TRIPLE_PLAY);
    machine.shoot();
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(SHOOTING_GALLERY_GAME)).toBe(false);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    expect(machine.stop()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('throws away a play left unfinished before a reset', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    before.start(TRIPLE_PLAY);
    crash(browser, killed);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s unfinished play along when the first sign-in moves the medals into the account, and pays it there once', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    const staked = before.start(TRIPLE_PLAY)!;
    before.shoot();
    crash(browser, killed);
    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - STAKE });
    const left = after.table.leftover();
    expect(left).toMatchObject({ owner: UID, id: staked.record.id, shots: [AIMS[0]], paid: false });
    expect(record(browser, UID)?.id).toBe(staked.record.id);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    expect(after.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser, UID)).toBe(WELCOME - STAKE + TRIPLE_WON);
    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(after.table.leftover()).toBeNull();
  });

  it('never moves a guest’s play onto an account that has medals of its own: it waits for the guest', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start(LINE_PLAY);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.stop()).toBe('later');
    expect(machine.table.leftover()).toBeNull();
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(finishLeft(machine)?.settled).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - STAKE + LINE_WON);
    expect(stored(browser, UID)).toBe(500);
  });
});

describe('when storage will not keep things', () => {
  it('plays no play it cannot write down, where storage can be read: nothing is taken', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === PLAY_KEY) throw new Error('quota');
      write(key, text);
    };
    expect(machine.table.stake(LINE_PLAY).kind).toBe('unsaved');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('plays on from memory when storage stops taking the shots: the play leaves storage, and is paid once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const staked = machine.start(LINE_PLAY)!;
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === PLAY_KEY) throw new Error('quota');
      write(key, text);
    };
    expect(machine.shoot()).toBe('kept');
    expect(staked.stored).toBe(false);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    for (let m = 1; m < CORKS; m++) expect(machine.shoot()).toBe('kept');
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - STAKE + LINE_WON);
    expect(machine.table.settle(staked)).toBe('already');
  });

  it('plays from memory where storage is blocked: the medals taken and the winnings given once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    browser.blocked = true;
    const staked = machine.start(TRIPLE_PLAY);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - STAKE);
    for (let m = 0; m < CORKS; m++) expect(machine.shoot()).toBe('kept');
    expect(machine.stop()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME - STAKE + TRIPLE_WON);
    expect(machine.table.settle(staked!)).toBe('already');
  });
});

describe('reading a play back', () => {
  it('reads back only a play it could have written: every field checked, every cork at a figure still up, no more than six, paid only when all are fired', () => {
    const good: PlayRecord = { v: 1, id: 'play1', owner: null, ledger: 'device00001', era: 0, draw: LINE_PLAY, shots: [AIMS[0], HIGH[1]], paid: false };
    expect(parsePlay(serializePlay(good))).toEqual(good);
    const ended: PlayRecord = { ...good, shots: shotsAll(CORKS), paid: true };
    expect(parsePlay(serializePlay(ended))).toEqual(ended);
    // Finished blind after two of the player's corks: the corks after them are the blind ones drawn.
    const two = [HIGH[0], HIGH[1]];
    const blind: PlayRecord = { ...good, shots: finishedShots(LINE_PLAY, two), paid: true, own: 2 };
    expect(blind.shots[2]).not.toEqual(HIGH[2]);
    expect(parsePlay(serializePlay(blind))).toEqual(blind);
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      JSON.stringify({ ...good, draw: { ...LINE_PLAY, bands: [5, ...LINE_PLAY.bands.slice(1)] } }),
      JSON.stringify({ ...good, shots: [[9, 1]] }),
      JSON.stringify({ ...good, shots: [[6, 1, 0]] }),
      JSON.stringify({ ...good, shots: [6] }),
      // A cork at a figure already off the shelf: LINE_PLAY's first cork knocks the box it is fired at off.
      JSON.stringify({ ...good, shots: [AIMS[0], AIMS[0]] }),
      JSON.stringify({ ...good, shots: [...shotsAll(CORKS), AIMS[1]] }),
      // Paid before every cork was fired.
      JSON.stringify({ ...good, shots: [AIMS[0]], paid: true }),
      JSON.stringify({ ...good, paid: 'yes' }),
      // Fired blind on a play not finished, past the last cork, not a count, or a cork after them not the blind one drawn.
      JSON.stringify({ ...ended, paid: false, shots: [AIMS[0]], own: 0 }),
      JSON.stringify({ ...ended, own: CORKS }),
      JSON.stringify({ ...ended, own: 1.5 }),
      JSON.stringify({ ...ended, own: '2' }),
      JSON.stringify({ ...blind, shots: [...two, HIGH[2], ...blind.shots.slice(3)] }),
      'x'.repeat(3_000),
    ];
    for (const text of bad) expect(parsePlay(text)).toBeNull();
  });

  it('clears anything at the play’s place that is not a play', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(PLAY_KEY, '{"v":0,"cork":99}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.leftover()).toBeNull();
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
  });
});

describe('a browser that dies between two writes', () => {
  // The play's record and the medals are separate writes: the browser is killed at every moment between them and
  // started again, and the machine finishes whatever it left. Every play is paid exactly once, or, if its medals never
  // went in, never happened at all. The blind corks drawn are at the player's own aims, so that a play finished
  // blind ends as the one the player was firing.
  const machines = new Map<FakeBrowser, ReturnType<typeof machineOn>>();
  /** A browser with one play already played (one box off the shelf). */
  const setUp = async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.start(LINE_PLAY);
    machine.shootMany(CORKS);
    machine.stop();
    machines.set(browser, machine);
    return browser;
  };
  const AFTER_SET_UP = WELCOME - STAKE + LINE_WON;
  const reopened = async (after: FakeBrowser) => {
    const machine = machineOn(after.open());
    await quiet(after);
    finishLeft(machine);
    return machine;
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  for (const [what, d, shots, won] of [
    ['six figures off the shelf, all six corks fired', TRIPLE_PLAY, CORKS, TRIPLE_WON],
    ['a play left after two corks, the rest blind', LINE_PLAY, 2, LINE_WON],
    ['a play that knocks nothing off', NOTHING, CORKS, 0],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies from START to the end`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const machine = machines.get(browser)!;
          machine.start(d);
          machine.shootMany(shots);
          machine.stop();
        },
        async (after, reached) => {
          const staked = spentIn(after) === 2 * STAKE;
          const machine = await reopened(after);
          expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - STAKE + won : AFTER_SET_UP);
          expect(machine.table.leftover(), `died after ${reached} writes`).toBeNull();
          // The next play takes and pays as ever, and the plays before it let go of their receipts.
          const next = machine.start(LINE_PLAY);
          machine.shootMany(CORKS);
          expect(machine.stop(), `died after ${reached} writes`).toBe('paid');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          const id = next!.record.id;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${SHOOTING_GALLERY_GAME}:${id}:pay`, `${SHOOTING_GALLERY_GAME}:${id}:stake`]);
          expect(medalsOutAt(ledger)).toEqual([]);
        },
      );
      // The play's record, its medals, each cork, the record marked paid, and its winnings (when it won).
      expect(writes).toBeGreaterThanOrEqual(2 + shots + (won > 0 ? 2 : 1));
    });
  }

  it('pays a play exactly once wherever the browser dies while the page going away finishes it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.start(TRIPLE_PLAY);
        machine.shoot();
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const staked = spentIn(after) === 2 * STAKE;
        await reopened(after);
        expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - STAKE + TRIPLE_WON : AFTER_SET_UP);
      },
    );
  });

  it('is marked paid before its winnings go in, so a page that looks for a play to finish as the medals move never finds it', async () => {
    const browser = await setUp();
    const machine = machines.get(browser)!;
    const found: string[] = [];
    let finishing = false;
    browser.pages[0].bank.subscribe(() => {
      const left = finishing ? machine.table.leftover() : null;
      if (left) found.push(left.id);
    });
    machine.start(TRIPLE_PLAY);
    machine.shootMany(CORKS);
    finishing = true;
    expect(machine.stop()).toBe('paid');
    expect(found).toEqual([]);
    expect(stored(browser)).toBe(AFTER_SET_UP - STAKE + TRIPLE_WON);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts', 'published.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/ShootingGallery', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
