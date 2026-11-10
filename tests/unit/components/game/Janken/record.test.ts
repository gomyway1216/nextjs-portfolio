import { describe, expect, it, vi } from 'vitest';

import { LAMPS, MAX_DOUBLES } from '@/components/game/Janken/engine';
import { createMachine, type Happening, type RoundStorage, type Throw } from '@/components/game/Janken/machine';
import { ROUNDS_KEPT, THROWS_KEPT, cleared, emptyRecord, noted, sumsOf, type PlayRecord } from '@/components/game/Janken/record';
import { started, type Round } from '@/components/game/Janken/round';
import { WELCOME, balanceOf, parseLedger } from '@/components/game/MedalCenter/ledger';
import { ledgerKey } from '@/components/game/MedalCenter/bank';
import { FakeBrowser, quiet, type FakePage } from '../MedalCenter/bankFakes';

vi.mock('@/components/game/MedalCenter/floor/reporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/game/MedalCenter/floor/reporter')>()),
  floorReport: () => undefined,
}));

/** Random numbers that make the cat throw a hand: rock, scissors, paper are the thirds of [0, 1). */
const CAT = { gu: 0.1, choki: 0.5, pa: 0.9 } as const;
/** The random number that stops the roulette on a lamp. */
const lamp = (at: number) => (at + 0.5) / LAMPS.length;

const storageOf = (page: FakePage): RoundStorage => ({ read: (key) => page.env.read(key), write: (key, text) => page.env.write(key, text), remove: (key) => page.env.remove(key) });

/** A page with the machine on it and a record kept of it the way the cabinet keeps one. */
async function sitting(browser: FakeBrowser, page: FakePage = browser.open()) {
  const draws: number[] = [];
  const machine = createMachine({
    bank: page.bank,
    storage: storageOf(page),
    random: () => {
      if (draws.length === 0) throw new Error('the test did not say what the cat draws');
      return draws.shift()!;
    },
  });
  const kept = { record: emptyRecord() };
  machine.hear((happening) => {
    kept.record = noted(kept.record, happening, machine.view().round?.id);
  });
  const close = machine.open();
  await quiet(browser);
  return { page, machine, draws, kept, close };
}
const medals = (browser: FakeBrowser): number => balanceOf(parseLedger(browser.storage.get(ledgerKey(null)) ?? null)!);

describe('the record, kept of a real machine', () => {
  it('counts a medal when its round ends, and comes to what the medals did', async () => {
    const browser = new FakeBrowser();
    const { machine, draws, kept } = await sitting(browser);

    // A loss.
    machine.insert();
    expect(kept.record).toMatchObject({ started: 1, played: 0, rounds: [] });
    draws.push(CAT.pa);
    machine.press('gu');
    expect(kept.record).toMatchObject({ played: 1, back: 0, wins: 0, open: null });

    // Two draws, then a win on the lamp of 5, taken.
    machine.insert();
    draws.push(CAT.gu, CAT.gu, CAT.choki, lamp(15));
    machine.press('gu');
    machine.press('gu');
    machine.press('gu');
    // Not counted while the ring runs or the medals wait.
    expect(kept.record.played).toBe(1);
    machine.stopped();
    machine.collect();
    expect(kept.record).toMatchObject({ played: 2, back: 5, wins: 1, best: 5, throws: { win: 1, draw: 2, lose: 1 }, cat: { gu: 2, choki: 1, pa: 1 } });
    const last = kept.record.rounds.at(-1)!;
    expect(last).toMatchObject({ n: 2, carried: false, lamp: 5, doubles: 0, end: 'paid', medals: 5 });
    expect(last.throws.map((thrown) => thrown.outcome)).toEqual(['draw', 'draw', 'win']);

    // The record's medals are the player's own: what it says came back, less what it says was played.
    expect(medals(browser) - WELCOME).toBe(sumsOf(kept.record).net);
    expect(sumsOf(kept.record)).toMatchObject({ net: 3, thrown: 4 });
  });

  it('follows a double-up: won, drawn, lost, and the last one paid at once', async () => {
    const browser = new FakeBrowser();
    const { machine, draws, kept } = await sitting(browser);

    // The lamp of 3, doubled once, then lost on the second double-up after a draw.
    machine.insert();
    draws.push(CAT.choki, lamp(6));
    machine.press('gu');
    machine.stopped();
    machine.double();
    draws.push(CAT.choki);
    machine.press('gu');
    machine.double();
    draws.push(CAT.gu, CAT.pa);
    machine.press('gu');
    machine.press('gu');
    expect(kept.record).toMatchObject({ played: 1, back: 0, wins: 0, doublesTried: 2, doublesWon: 1 });
    expect(kept.record.rounds.at(-1)).toMatchObject({ lamp: 3, doubles: 1, end: 'lost', medals: 0 });

    // The lamp of 10 doubled every time it can be: paid without being taken.
    machine.insert();
    draws.push(CAT.choki, lamp(0));
    machine.press('gu');
    machine.stopped();
    for (let i = 0; i < MAX_DOUBLES; i++) {
      machine.double();
      draws.push(CAT.choki);
      machine.press('gu');
    }
    const top = 10 * 2 ** MAX_DOUBLES;
    expect(kept.record).toMatchObject({ played: 2, back: top, best: top, wins: 1, doublesTried: 2 + MAX_DOUBLES, doublesWon: 1 + MAX_DOUBLES });
    expect(kept.record.rounds.at(-1)).toMatchObject({ lamp: 10, doubles: MAX_DOUBLES, end: 'paid', medals: top });
    expect(medals(browser) - WELCOME).toBe(sumsOf(kept.record).net);
  });

  it('does not count a medal given back unthrown as the page is hidden, and counts medals won that are paid then', async () => {
    const browser = new FakeBrowser();
    const { page, machine, draws, kept } = await sitting(browser);
    machine.insert();
    draws.push(CAT.gu);
    machine.press('gu');
    page.hide();
    await quiet(browser);
    // The draw was thrown; the medal came back, and its round was not played.
    expect(kept.record).toMatchObject({ played: 0, back: 0, open: null, rounds: [], throws: { draw: 1 } });
    expect(medals(browser)).toBe(WELCOME);

    page.show();
    await quiet(browser);
    machine.insert();
    draws.push(CAT.choki, lamp(15));
    machine.press('gu');
    page.hide();
    await quiet(browser);
    expect(kept.record).toMatchObject({ played: 1, back: 5 });
    expect(kept.record.rounds.at(-1)).toMatchObject({ end: 'paid', medals: 5, lamp: 5 });
    expect(medals(browser) - WELCOME).toBe(sumsOf(kept.record).net);
  });

  it('lists a round carried on from a page that died, without counting its medals', async () => {
    const browser = new FakeBrowser();
    const first = await sitting(browser);
    first.machine.insert();
    first.draws.push(CAT.choki, lamp(0));
    first.machine.press('gu');
    // The page dies with the ring still running: nothing is told, and its card is let go.
    first.page.watchers = null;
    first.page.close();

    const { machine, kept } = await sitting(browser);
    expect(kept.record.open).toMatchObject({ carried: true, lamp: 10 });
    machine.stopped();
    machine.collect();
    expect(kept.record).toMatchObject({ played: 0, back: 0, best: 0 });
    expect(kept.record.rounds).toHaveLength(1);
    expect(kept.record.rounds[0]).toMatchObject({ carried: true, end: 'paid', medals: 10 });
  });
});

describe('the record, as arithmetic', () => {
  const thrown = (outcome: Throw['outcome'], kind: Throw['kind'] = 'play', at = 3): Happening => ({
    type: 'thrown',
    throw: { player: 'gu', machine: outcome === 'win' ? 'choki' : outcome === 'draw' ? 'gu' : 'pa', outcome, lamp: outcome === 'win' && kind === 'play' ? at : -1, kind, draws: 0 },
    round: null,
  });
  const after = (record: PlayRecord, ...happenings: Happening[]) => happenings.reduce((at, happening) => noted(at, happening, 'r1'), record);
  const round = (over: Partial<Round>): Round => ({ ...started(), ...over });

  it('never changes the record it is given', () => {
    const before = after(emptyRecord(), { type: 'inserted' });
    const frozen = JSON.stringify(before);
    after(before, thrown('draw'), thrown('lose'));
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('keeps the last rounds only, and goes on counting past them', () => {
    let record = emptyRecord();
    for (let i = 0; i < ROUNDS_KEPT + 3; i++) record = after(record, { type: 'inserted' }, thrown('lose'));
    expect(record.rounds).toHaveLength(ROUNDS_KEPT);
    expect(record.rounds.map((kept) => kept.n)).toEqual(Array.from({ length: ROUNDS_KEPT }, (_, i) => i + 4));
    expect(record.played).toBe(ROUNDS_KEPT + 3);
  });

  it('cuts a long run of draws at its start, and says how many it cut', () => {
    let record = after(emptyRecord(), { type: 'inserted' });
    for (let i = 0; i < THROWS_KEPT + 5; i++) record = after(record, thrown('draw'));
    record = after(record, thrown('lose'));
    const last = record.rounds[0];
    expect(last.throws).toHaveLength(THROWS_KEPT);
    expect(last.earlier).toBe(6);
    expect(last.throws.at(-1)?.outcome).toBe('lose');
    expect(record.throws).toEqual({ win: 0, draw: THROWS_KEPT + 5, lose: 1 });
  });

  it('goes on with its own round when the card comes back, and takes any other as carried', () => {
    const mine = after(emptyRecord(), { type: 'inserted' }, thrown('draw'));
    expect(noted(mine, { type: 'resumed', round: round({ id: 'r1', draws: 1 }) })).toBe(mine);
    const other = noted(mine, { type: 'resumed', round: round({ id: 'r2', kind: 'double', phase: 'offer', stake: 0, win: 6, lamp: 6, doubles: 1 }) });
    expect(other.open).toMatchObject({ n: 2, id: 'r2', carried: true, lamp: 3, doubles: 1, throws: [] });
    expect(after(other, { type: 'paid', medals: 6, left: false })).toMatchObject({ played: 0, back: 0 });
  });

  it('leaves medals of a round it never saw out, and starts over with the medal center’s reset', () => {
    const record = after(emptyRecord(), { type: 'inserted' }, thrown('lose'));
    expect(noted(record, { type: 'paid', medals: 7, left: true })).toBe(record);
    expect(noted(record, { type: 'returned', medals: 1 })).toBe(record);
    expect(noted(record, { type: 'restarted' })).toEqual(emptyRecord());
  });

  it('is cleared to nothing, a round in play becoming one carried on', () => {
    const done = after(emptyRecord(), { type: 'inserted' }, thrown('lose'));
    expect(cleared(done)).toEqual(emptyRecord());
    const playing = after(done, { type: 'inserted' }, thrown('win'));
    const fresh = cleared(playing);
    expect(fresh).toMatchObject({ started: 1, played: 0, rounds: [], throws: { win: 0, draw: 0, lose: 0 } });
    expect(fresh.open).toMatchObject({ n: 1, carried: true, lamp: LAMPS[3] });
    expect(after(fresh, { type: 'paid', medals: 2, left: false })).toMatchObject({ played: 0, back: 0, rounds: [{ n: 1, carried: true, medals: 2 }] });
  });
});
