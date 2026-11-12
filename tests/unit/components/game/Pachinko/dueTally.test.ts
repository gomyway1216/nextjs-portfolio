import { describe, expect, it, vi } from 'vitest';

import { EMPTY_COUNTER, counted, landed, type DataCounter } from '@/components/game/Pachinko/dataCounter';
import { EMPTY_STATS, createDueQueue, writeDown, type Due, type SessionStats, type VisitBook } from '@/components/game/Pachinko/dueTally';
import { BEST_LEFT, SLOT_MS, drawBall, newMachine, type BallDraw } from '@/components/game/Pachinko/engine';
import { PACHINKO_GAME, createTable, type SessionRecord, type Slot, type Table } from '@/components/game/Pachinko/medalTable';
import { FLIGHT_MS } from '@/components/game/Pachinko/scene';
import type { Seat } from '@/components/game/MedalCenter/bank';
import { FakeBrowser, quiet, type FakePage } from '../MedalCenter/bankFakes';

// A slot the page has run is shown a ball's flight later, and written down in "This visit" and the data counter as it
// is shown. Slots still waiting when the page gives up the card (hidden, or lent for a moment) are written down all the
// same, once; a reset of the medals drops them. The queue and the writing down are dueTally.ts; here they are driven by
// the real table and the real bank in a fake browser (bankFakes.ts), wired as PlayTab.tsx wires them. PlayTab itself is
// not mounted (the unit tests have no DOM): that it calls these in the places copied below is checked by reading.

vi.mock('@/components/game/MedalCenter/floor/reporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/game/MedalCenter/floor/reporter')>()),
  floorReport: () => undefined,
}));

const ball = (fate: number, lot = 65_535, split = 99, show = 1_023, seed = 7): BallDraw => ({ fate, lot, split, show, seed });
/** A ball into the ヘソ at the best left strength whose hold misses, a plain spin. */
const MISS = ball(0);
/** A ball into the ヘソ whose hold is a hit. */
const HIT = ball(0, 0, 10, 0, 12_345);

/** The page's side of the machine, as PlayTab keeps it: the queue, the figures, and what it does as the card goes and comes. */
function machineOn(page: FakePage) {
  const due = createDueQueue();
  let stats: SessionStats = EMPTY_STATS;
  let counter: DataCounter = EMPTY_COUNTER;
  const book: VisitBook = {
    stats: (change) => {
      stats = change(stats);
    },
    counter: (change) => {
      counter = change(counter);
    },
  };
  const seat: { current: Seat | null } = { current: null };
  const table: Table = createTable({
    bank: page.bank,
    storage: page.env,
    holding: () => seat.current?.holding() ?? false,
    newId: () => page.browser.name('r'),
    random: () => 0.5,
    draw: drawBall,
  });
  let session: SessionRecord | null = null;
  let reopen = true;
  let reread = false;
  let slots = 0;
  const calls: string[] = [];
  /** Every slot run, as the table gave it: what the figures must come to, each slot once. */
  const ran: Slot[] = [];

  // PlayTab `tally`, `showNow`, `open`, `resume`, `startOver` and `yielding`, less what is drawn on the screen.
  const tally = (d: Due) => writeDown(d, book);
  const showNow = () => due.flush(tally);
  const open = () => {
    calls.push('open');
    session = table.open();
    reopen = false;
    reread = false;
    showNow();
  };
  const resume = () => {
    calls.push('resume');
    reread = false;
    session = table.session();
    showNow();
  };
  const startOver = () => {
    calls.push('startOver');
    due.discard();
    table.clear();
    session = null;
    counter = EMPTY_COUNTER;
    stats = EMPTY_STATS;
    showNow();
    page.bank.restarted(PACHINKO_GAME);
    reopen = true;
  };
  seat.current = page.bank.sit(PACHINKO_GAME, {
    granted: () => undefined,
    yielding: (why) => {
      calls.push(why);
      if (why === 'moment') {
        reread = true;
        return;
      }
      const left = table.leaving();
      if (left) session = left;
      reopen = true;
      showNow();
    },
  });
  const placed = seat.current;
  const sync = () => {
    if (!placed.holding() || !page.bank.getState().loaded) return;
    if (page.bank.restartDue(PACHINKO_GAME)) startOver();
    if (reopen) open();
    else if (reread) resume();
  };
  page.bank.subscribe(sync);
  page.bank.listen((event) => {
    if (event.type === 'reset') startOver();
  });
  sync();

  return {
    due,
    calls,
    ran,
    stats: () => stats,
    counter: () => counter,
    lend(draws: BallDraw[]) {
      const outcome = table.lend(draws);
      session = table.session();
      return outcome;
    },
    /** PlayTab `runSlot`: one slot of the machine, queued to be shown a flight later. */
    slot(strength: number | null) {
      if (!session) return null;
      const done = table.step(strength, session);
      if (!done) return null;
      session = done.record;
      if (done.slot.ball) book.stats((st) => ({ ...st, fired: st.fired + 1 }));
      ran.push(done.slot);
      due.push({ at: slots * SLOT_MS + FLIGHT_MS, machine: done.record.machine, ticks: done.slot.ticks, ball: done.slot.ball });
      slots += 1;
      return done;
    },
    /** PlayTab's frame at machine time `now`: every slot whose moment has come is shown, and written down. */
    frame(now: number) {
      let shown = 0;
      for (let d = due.next(now); d; d = due.next(now)) {
        tally(d);
        shown += 1;
      }
      return shown;
    },
  };
}

/** What the slots come to, each written down once: worked out from the slots themselves, not through the queue. */
function once(slots: readonly Slot[]): { counter: DataCounter; paid: number; spins: number; hits: number } {
  let counter = EMPTY_COUNTER;
  let paid = 0;
  let spins = 0;
  let hits = 0;
  for (const slot of slots) {
    counter = counted(counter, slot.ball?.fired ?? null, slot.ticks);
    paid += slot.ball?.fired.paid ?? 0;
    spins += slot.ticks.filter((t) => t.type === 'start').length;
    hits += slot.ticks.filter((t) => t.type === 'stop' && t.kind !== null).length;
  }
  return { counter, paid, spins, hits };
}

/** A page with the machine on it, three balls fired into the ヘソ, and none of them shown yet. */
async function threeInFlight(draws: BallDraw[] = [MISS, MISS, MISS]) {
  const browser = new FakeBrowser();
  const hub = browser.open();
  hub.bank.subscribe(() => undefined);
  const page = browser.open();
  const machine = machineOn(page);
  await quiet(browser);
  expect(machine.calls).toEqual(['open']);
  expect(machine.lend(draws)).toBe('lent');
  for (let i = 0; i < 3; i++) expect(machine.slot(BEST_LEFT)?.slot.ball?.fired.pocket).toBe('heso');
  expect(machine.due.length).toBe(3);
  expect(machine.counter()).toEqual(EMPTY_COUNTER);
  expect(machine.stats()).toEqual({ ...EMPTY_STATS, fired: 3 });
  return { browser, hub, page, machine };
}

describe('slots still on their way to the screen', () => {
  it('are written down once as the page is hidden, the ones already shown not again', async () => {
    const { browser, page, machine } = await threeInFlight();
    // The first ball's flight is over: it is shown, and written down.
    expect(machine.frame(FLIGHT_MS)).toBe(1);
    expect(machine.counter().pockets.heso).toBe(1);
    expect(machine.due.length).toBe(2);
    page.hide('hidden');
    await quiet(browser);
    expect(machine.calls).toEqual(['open', 'hidden']);
    expect(machine.due.length).toBe(0);
    const whole = once(machine.ran);
    expect(machine.counter()).toEqual(whole.counter);
    expect(machine.counter().pockets).toEqual({ heso: 3, side: 0, denchu: 0, attacker: 0, out: 0 });
    expect(landed(machine.counter())).toBe(machine.stats().fired);
    expect(machine.stats()).toEqual({ ...EMPTY_STATS, fired: 3, paid: whole.paid, spins: whole.spins, hits: 0 });
    expect(whole.spins).toBeGreaterThan(0);
    expect(machine.counter().since).toBe(whole.spins);
  });

  it('are not written down again as the page is shown and takes the card back, nor by the frames after', async () => {
    const { browser, page, machine } = await threeInFlight();
    page.hide('hidden');
    await quiet(browser);
    const counter = machine.counter();
    const stats = machine.stats();
    expect(counter.pockets.heso).toBe(3);
    page.show();
    await quiet(browser);
    expect(machine.calls).toEqual(['open', 'hidden', 'open']);
    expect(machine.counter()).toEqual(counter);
    expect(machine.stats()).toEqual(stats);
    // Long after their flights would have ended: nothing is left to show.
    expect(machine.frame(1_000 * SLOT_MS)).toBe(0);
    expect(machine.counter()).toEqual(counter);
    // The next slot played is written down as it is shown, on top of them.
    machine.slot(null);
    expect(machine.frame(1_000 * SLOT_MS)).toBe(1);
    expect(machine.counter()).toEqual(once(machine.ran).counter);
    expect(machine.counter().pockets.heso).toBe(3);
  });

  it('count a hit whose stop was never shown, once', async () => {
    const { browser, page, machine } = await threeInFlight([HIT, MISS, MISS]);
    for (let guard = 0; guard < 500 && once(machine.ran).hits === 0; guard++) machine.slot(null);
    expect(once(machine.ran).hits).toBe(1);
    expect(machine.frame(FLIGHT_MS)).toBe(1);
    expect(machine.stats().hits).toBe(0);
    page.hide('hidden');
    await quiet(browser);
    const whole = once(machine.ran);
    expect(machine.stats()).toMatchObject({ fired: 3, hits: 1, spins: whole.spins, paid: whole.paid });
    expect(machine.counter()).toEqual(whole.counter);
    expect(machine.counter()).toMatchObject({ hits: 1, run: 1, bestRun: 1 });
    expect(machine.counter().log).toHaveLength(1);
    page.show();
    await quiet(browser);
    expect(machine.frame(1_000 * SLOT_MS)).toBe(0);
    expect(machine.stats().hits).toBe(1);
    expect(machine.counter().log).toHaveLength(1);
  });

  it('are written down once over a moment’s loan of the card: the day’s bonus taken in another tab', async () => {
    const { browser, hub, machine } = await threeInFlight();
    expect(machine.frame(FLIGHT_MS)).toBe(1);
    hub.bank.claimBonus();
    await quiet(browser);
    // The card went for a moment and came back; the session was read again as it stood.
    expect(machine.calls).toEqual(['open', 'moment', 'resume']);
    expect(machine.due.length).toBe(0);
    const whole = once(machine.ran);
    expect(machine.counter()).toEqual(whole.counter);
    expect(machine.counter().pockets.heso).toBe(3);
    expect(machine.stats()).toEqual({ ...EMPTY_STATS, fired: 3, paid: whole.paid, spins: whole.spins, hits: 0 });
    expect(machine.frame(1_000 * SLOT_MS)).toBe(0);
    expect(machine.counter()).toEqual(whole.counter);
  });

  it('go unwritten with a reset of the medals, and the figures and the counter start again', async () => {
    const { browser, hub, machine } = await threeInFlight();
    expect(machine.frame(FLIGHT_MS)).toBe(1);
    expect(machine.counter().pockets.heso).toBe(1);
    expect(machine.due.length).toBe(2);
    hub.bank.reset();
    await quiet(browser);
    expect(machine.calls).toContain('startOver');
    expect(machine.due.length).toBe(0);
    expect(machine.stats()).toEqual(EMPTY_STATS);
    expect(machine.counter()).toEqual(EMPTY_COUNTER);
    // The slots dropped never reach the screen or the figures afterwards.
    expect(machine.frame(1_000 * SLOT_MS)).toBe(0);
    expect(machine.stats()).toEqual(EMPTY_STATS);
    expect(machine.counter()).toEqual(EMPTY_COUNTER);
  });
});

describe('the queue of slots to be shown', () => {
  const slot = (at: number): Due => ({ at, machine: newMachine(), ticks: [], ball: null });

  it('gives each slot up once, the earliest first, and only as its moment comes', () => {
    const due = createDueQueue();
    const [a, b, c] = [slot(10), slot(20), slot(30)];
    for (const d of [a, b, c]) due.push(d);
    expect(due.length).toBe(3);
    expect(due.next(9)).toBeNull();
    expect(due.next(20)).toBe(a);
    expect(due.next(20)).toBe(b);
    expect(due.next(20)).toBeNull();
    expect(due.length).toBe(1);
    expect(due.next(30)).toBe(c);
    expect(due.next(1_000)).toBeNull();
  });

  it('hands every slot waiting over in order when flushed, and none a second time', () => {
    const due = createDueQueue();
    const [a, b, c] = [slot(10), slot(20), slot(30)];
    for (const d of [a, b, c]) due.push(d);
    expect(due.next(10)).toBe(a);
    const seen: Due[] = [];
    due.flush((d) => seen.push(d));
    expect(seen).toEqual([b, c]);
    expect(due.length).toBe(0);
    due.flush((d) => seen.push(d));
    expect(seen).toHaveLength(2);
    expect(due.next(1_000)).toBeNull();
  });

  it('hands a slot dropped to no one', () => {
    const due = createDueQueue();
    due.push(slot(10));
    due.push(slot(20));
    due.discard();
    expect(due.length).toBe(0);
    const seen: Due[] = [];
    due.flush((d) => seen.push(d));
    expect(due.next(1_000)).toBeNull();
    expect(seen).toEqual([]);
    // The queue goes on as before.
    const later = slot(40);
    due.push(later);
    expect(due.next(40)).toBe(later);
  });

  it('changes neither the figures nor the counter for a slot in which nothing happened', () => {
    const book = { stats: vi.fn(), counter: vi.fn() };
    writeDown(slot(0), book);
    expect(book.stats).not.toHaveBeenCalled();
    expect(book.counter).not.toHaveBeenCalled();
  });
});
