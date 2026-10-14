import { describe, expect, it } from 'vitest';

import {
  LIMITS,
  REFILL,
  WELCOME,
  balanceOf,
  claimBonus,
  createLedger,
  give,
  hasImported,
  importPurse,
  markChecked,
  mergeLedgers,
  parseLedger,
  printOf,
  refill,
  refillDue,
  resetLedger,
  restartDue,
  restarted,
  serializeLedger,
  spendable,
  take,
  tookBonus,
  withClaimed,
  type Ledger,
} from '@/components/game/MedalCenter/ledger';
import { BONUS_CARD, addDay, dayNumber, dayOf } from '@/components/game/MedalPusher/records';
import { START_CREDITS } from '@/components/game/MedalPusher/session';

const DAY = '2026-10-14';
const next = (day: string, by = 1): string => dayOf(dayNumber(day)! + by);

/** Plays a ledger: a list of medals fed (negative) and won (positive). */
function play(ledger: Ledger, moves: number[]): Ledger {
  let at = ledger;
  for (const move of moves) at = move < 0 ? (take(at, -move) ?? at) : give(at, move);
  return at;
}

describe('one ledger', () => {
  it('gives a new member what a new Medal Pusher always started with', () => {
    expect(WELCOME).toBe(START_CREDITS);
    expect(REFILL).toBe(START_CREDITS);
    expect(balanceOf(createLedger('phone00001'))).toBe(WELCOME);
    expect(balanceOf(createLedger('phone00001', 0))).toBe(0);
  });

  it('takes out only what it holds, and puts in whole numbers only', () => {
    const start = createLedger('phone00001');
    expect(take(start, WELCOME + 1)).toBeNull();
    expect(take(start, 0)).toBeNull();
    expect(take(start, 1.5)).toBeNull();
    const spent = take(start, WELCOME);
    expect(spent && balanceOf(spent)).toBe(0);
    expect(spent && take(spent, 1)).toBeNull();
    expect(give(start, -3)).toBe(start);
    expect(give(start, Number.NaN)).toBe(start);
    expect(balanceOf(give(start, 7))).toBe(WELCOME + 7);
  });

  it('counts what was fed and what was won in its own device’s row, which only grows', () => {
    const played = play(createLedger('phone00001'), [-1, -1, 3, -5, 12]);
    expect(balanceOf(played)).toBe(WELCOME - 7 + 15);
    expect(played.rows.phone00001).toEqual({ got: 15, spent: 7 });
  });

  it('gives a refill only to a bank with nothing in it', () => {
    const full = createLedger('phone00001');
    expect(refillDue(full)).toBe(false);
    expect(refill(full)).toBe(full);
    const empty = take(full, WELCOME)!;
    expect(refillDue(empty)).toBe(true);
    expect(balanceOf(refill(empty))).toBe(REFILL);
  });

  it('pays a day’s bonus once, by the card, and stamps the day in the same ledger as the medals', () => {
    const start = createLedger('phone00001');
    const first = claimBonus(start, DAY);
    expect(first.medals).toBe(BONUS_CARD[0]);
    expect(balanceOf(first.ledger)).toBe(WELCOME + BONUS_CARD[0]);
    expect(tookBonus(first.ledger, DAY)).toBe(true);
    expect(claimBonus(first.ledger, DAY)).toEqual({ ledger: first.ledger, medals: 0 });
    const second = claimBonus(first.ledger, next(DAY));
    expect(second.medals).toBe(BONUS_CARD[1]);
  });

  it('carries on the card from the days a record book took the bonus on', () => {
    let days = {};
    for (let back = 6; back >= 1; back--) days = addDay(days, next(DAY, -back));
    const carried = withClaimed(createLedger('phone00001'), days);
    expect(claimBonus(carried, DAY).medals).toBe(BONUS_CARD[6]);
    expect(withClaimed(carried, days)).toBe(carried);
  });

  it('moves an old purse in once, under where it came from', () => {
    const start = createLedger('phone00001', 0);
    const moved = importPurse(start, 'medal-pusher@guest', 1234);
    expect(balanceOf(moved)).toBe(1234);
    expect(hasImported(moved, 'medal-pusher@guest')).toBe(true);
    expect(importPurse(moved, 'medal-pusher@guest', 99)).toBe(moved);
    expect(balanceOf(importPurse(moved, 'medal-pusher@account', 66))).toBe(1300);
    expect(importPurse(start, 'Not A Name!', 5)).toBe(start);
    expect(importPurse(start, 'medal-pusher@guest', -1)).toBe(start);
  });

  it('takes a new member’s medals back when an old purse is moved in: that player was never a new member', () => {
    const played = play(createLedger('phone00001'), [-30, 5]);
    expect(balanceOf(played)).toBe(WELCOME - 25);
    const moved = importPurse(played, 'medal-pusher@account', 2000);
    expect(balanceOf(moved)).toBe(2000 - 25);
    // A copy from before the move still has the new member's medals: joined, they are void all the same.
    expect(balanceOf(mergeLedgers(played, moved))).toBe(2000 - 25);
    expect(balanceOf(mergeLedgers(moved, played))).toBe(2000 - 25);
    expect(importPurse(played, 'welcome:0', 50)).toBe(played);
  });

  it('starts over at a reset: a new member’s medals, the bonus days kept, and every purse moved in void for good', () => {
    const played = importPurse(claimBonus(play(createLedger('phone00001'), [-50, 400]), DAY).ledger, 'medal-pusher@guest', 900);
    const reset = resetLedger(played);
    expect(reset.era).toBe(1);
    expect(balanceOf(reset)).toBe(WELCOME);
    expect(tookBonus(reset, DAY)).toBe(true);
    expect(claimBonus(reset, DAY).medals).toBe(0);
    expect(hasImported(reset, 'medal-pusher@guest')).toBe(true);
    expect(importPurse(reset, 'medal-pusher@guest', 900)).toBe(reset);
  });

  it('says when this device’s copy of a game’s machine is to be started over after a reset, and stops saying it once it has', () => {
    const start = createLedger('phone00001');
    expect(restartDue(start, 'medal-pusher')).toBe(false);
    const reset = resetLedger(start);
    expect(restartDue(reset, 'medal-pusher')).toBe(true);
    const done = restarted(reset, 'medal-pusher');
    expect(restartDue(done, 'medal-pusher')).toBe(false);
    expect(restartDue(done, 'slot-machine')).toBe(true);
    expect(restarted(done, 'medal-pusher')).toBe(done);
    expect(restartDue(resetLedger(done), 'medal-pusher')).toBe(true);
    // Another device's copy of the same machine is its own, and starts over on that device: the phone's restart is not the laptop's.
    const laptop = mergeLedgers({ ...reset, device: 'laptop0001' }, done);
    expect(restartDue(laptop, 'medal-pusher')).toBe(true);
    expect(restartDue(mergeLedgers(done, laptop), 'medal-pusher')).toBe(false);
  });

  it('stays readable however often it is reset: what an older era moved in or started over is not kept', () => {
    let ledger = importPurse(claimBonus(createLedger('phone00001'), DAY).ledger, 'medal-pusher@guest', 5);
    for (let time = 0; time < 300; time++) ledger = restarted(resetLedger(play(ledger, [-3, 7])), 'medal-pusher');
    expect(ledger.era).toBe(300);
    expect(ledger.voided).toEqual(['medal-pusher@guest']);
    expect(Object.keys(ledger.restarted)).toEqual(['medal-pusher@phone00001']);
    const text = serializeLedger(ledger);
    expect(parseLedger(text)).toEqual(ledger);
    expect(balanceOf(ledger)).toBe(WELCOME);
    expect(tookBonus(ledger, DAY)).toBe(true);
    // Joined with a copy of any era before it, the same.
    const older = resetLedger(createLedger('laptop0001'));
    expect(serializeLedger(mergeLedgers(ledger, older))).toBe(text);
  });

  it('notes a source that has been looked at for good, without a medal and without taking a new member’s medals back', () => {
    const start = createLedger('phone00001');
    const checked = markChecked(start, 'medal-pusher-days@account');
    expect(hasImported(checked, 'medal-pusher-days@account')).toBe(true);
    expect(balanceOf(checked)).toBe(WELCOME);
    expect(markChecked(checked, 'medal-pusher-days@account')).toBe(checked);
    expect(hasImported(resetLedger(checked), 'medal-pusher-days@account')).toBe(true);
    expect(hasImported(mergeLedgers(start, checked), 'medal-pusher-days@account')).toBe(true);
  });
});

describe('two copies of one ledger', () => {
  const phone = createLedger('phone00001');
  const laptop = { ...phone, device: 'laptop0001', rows: {} } satisfies Ledger;

  it('keep everything each device did, once, whichever order they meet in and however often', () => {
    const a = play(phone, [-10, 25, -3]);
    const b = play(laptop, [40, -2]);
    const ab = mergeLedgers(a, b);
    const ba = mergeLedgers(b, a);
    expect(balanceOf(ab)).toBe(WELCOME - 13 + 25 + 40 - 2);
    expect(balanceOf(ba)).toBe(balanceOf(ab));
    expect(printOf(serializeLedger(ab))).toBe(printOf(serializeLedger(ba)));
    // Joined again, or joined with an older copy of either, nothing changes.
    expect(serializeLedger(mergeLedgers(ab, a))).toBe(serializeLedger(ab));
    expect(serializeLedger(mergeLedgers(ab, phone))).toBe(serializeLedger(ab));
    expect(serializeLedger(mergeLedgers(mergeLedgers(ab, b), ab))).toBe(serializeLedger(ab));
    // Each keeps its own device's name.
    expect(ab.device).toBe('phone00001');
    expect(ba.device).toBe('laptop0001');
  });

  it('give a new member’s medals once, however many guests’ banks became the account’s', () => {
    expect(balanceOf(mergeLedgers(phone, laptop))).toBe(WELCOME);
    expect(balanceOf(mergeLedgers(play(phone, [5]), play(laptop, [-5])))).toBe(WELCOME);
  });

  it('count a purse that both moved in once, at the larger of the two, and no new member’s medals beside it', () => {
    const a = importPurse(phone, 'medal-pusher@account', 300);
    const b = importPurse(laptop, 'medal-pusher@account', 250);
    expect(balanceOf(mergeLedgers(a, b))).toBe(300);
    expect(balanceOf(mergeLedgers(b, a))).toBe(300);
  });

  it('let a reset win over everything from before it, on whichever device, but never bring back a bonus day or a purse', () => {
    const before = importPurse(claimBonus(play(phone, [500]), DAY).ledger, 'medal-pusher@account', 300);
    const reset = play(resetLedger(before), [-20]);
    // The other device still had the old era, and moved the same purse in again and won more in it.
    const stale = importPurse(play({ ...laptop, claimed: {} }, [9999]), 'medal-pusher@account', 300);
    for (const joined of [mergeLedgers(reset, stale), mergeLedgers(stale, reset)]) {
      expect(joined.era).toBe(1);
      expect(balanceOf(joined)).toBe(WELCOME - 20);
      expect(tookBonus(joined, DAY)).toBe(true);
      expect(hasImported(joined, 'medal-pusher@account')).toBe(true);
      expect(importPurse(joined, 'medal-pusher@account', 300)).toBe(joined);
    }
  });

  it('can come to less than nothing when two devices spent the same medals: nothing can be taken out then', () => {
    const shared = play(phone, [-60]);
    const there = { ...shared, device: 'laptop0001' };
    const a = take(shared, 40)!;
    const b = take(there, 40)!;
    const joined = mergeLedgers(a, b);
    expect(balanceOf(joined)).toBe(-40);
    expect(spendable(joined)).toBe(0);
    expect(take(joined, 1)).toBeNull();
    expect(refillDue(joined)).toBe(true);
    expect(balanceOf(give(joined, 50))).toBe(10);
  });
});

describe('a ledger as text', () => {
  it('comes back as it went, and is laid out the same however it was built', () => {
    const ledger = importPurse(claimBonus(play(createLedger('phone00001'), [-3, 8]), DAY).ledger, 'medal-pusher@guest', 42);
    const text = serializeLedger(ledger);
    expect(parseLedger(text)).toEqual(ledger);
    expect(serializeLedger(parseLedger(text)!)).toBe(text);
    const shuffled = JSON.stringify({ ...JSON.parse(text), restarted: {}, voided: [], claimed: ledger.claimed });
    expect(parseLedger(shuffled)).not.toBeNull();
  });

  it('is refused as a whole when anything in it is wrong, since a part left out would change the balance', () => {
    const good = JSON.parse(serializeLedger(play(createLedger('phone00001'), [-3, 8]))) as Record<string, unknown>;
    const bad = [
      { ...good, v: 2 },
      { ...good, device: 'X' },
      { ...good, era: -1 },
      { ...good, era: 1.5 },
      { ...good, rows: { phone00001: { got: -1, spent: 0 } } },
      { ...good, rows: { phone00001: { got: '5', spent: 0 } } },
      { ...good, rows: { 'not a device': { got: 5, spent: 0 } } },
      { ...good, rows: { phone00001: { got: LIMITS.medals + 1, spent: 0 } } },
      { ...good, imports: { 'medal-pusher@guest': 1.5 } },
      { ...good, imports: [] },
      { ...good, voided: ['BAD NAME'] },
      { ...good, restarted: { 'medal-pusher': -1 } },
      { ...good, rows: Object.fromEntries(Array.from({ length: LIMITS.devices + 1 }, (_, i) => [`device${String(i).padStart(4, '0')}`, { got: 1, spent: 0 }])) },
    ];
    for (const value of bad) expect(parseLedger(JSON.stringify(value)), JSON.stringify(value).slice(0, 80)).toBeNull();
    expect(parseLedger('not json')).toBeNull();
    expect(parseLedger(null)).toBeNull();
    expect(parseLedger('x'.repeat(LIMITS.length + 1))).toBeNull();
  });

  it('leaves out a bonus day that is not on the calendar, as the record book does', () => {
    const good = JSON.parse(serializeLedger(createLedger('phone00001'))) as Record<string, unknown>;
    const parsed = parseLedger(JSON.stringify({ ...good, claimed: { '2026-02': 2 ** 29, '2026-10': 1 } }));
    expect(parsed?.claimed).toEqual({ '2026-10': 1 });
  });

  it('prints the same for two copies that hold the same, whichever device each is on', () => {
    const ledger = play(createLedger('phone00001'), [5]);
    expect(printOf(serializeLedger(ledger))).toBe(printOf(serializeLedger({ ...ledger, device: 'laptop0001' })));
    expect(printOf('not a ledger')).toBe('not a ledger');
  });
});
