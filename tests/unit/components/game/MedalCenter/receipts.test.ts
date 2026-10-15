import { describe, expect, it } from 'vitest';

import { fromCloud, sizeOf, toCloud, ACCOUNT_LIMIT } from '@/components/game/MedalPusher/account';
import { BANK_KEY, ledgerKey, type Move, type SeatHandlers } from '@/components/game/MedalCenter/bank';
import {
  LIMITS,
  RECEIPTS,
  WELCOME,
  applyMove,
  balanceOf,
  createLedger,
  forgetReceipts,
  give,
  hasReceipt,
  mergeLedgers,
  parseLedger,
  printOf,
  receiptOf,
  receiptsOf,
  resetLedger,
  serializeLedger,
  take,
  type Ledger,
} from '@/components/game/MedalCenter/ledger';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { FakeBrowser, quiet, type FakePage } from './bankFakes';
import onMain from './fixtures/ledgers-on-main.json';

// Receipts: a round's moves of medals, each made once (ledger.ts, "Receipts"; bank.ts, "A machine's rounds"). The
// arithmetic first, then the bank in a fake browser (bankFakes.ts), which can die between any two writes. Nothing is
// fetched and no real account is named.

const UID = 'test-player-1';
const GUEST = { uid: null, settled: true, expected: false };
const r = (round: string, step: string, game = 'slot-machine'): string => receiptOf(game, round, step)!;

/** Makes a move and expects it to be made now. */
function moved(ledger: Ledger, receipt: string, medals: number): Ledger {
  const result = applyMove(ledger, receipt, medals);
  if (!result?.applied) throw new Error(`${receipt} was not made`);
  return result.ledger;
}

describe('a move of a round’s medals, in the ledger', () => {
  it('is made once under its receipt, in the same ledger as the medals it moves', () => {
    const start = createLedger('phone00001');
    const staked = moved(start, r('round0001', 'stake'), -3);
    expect(balanceOf(staked)).toBe(WELCOME - 3);
    expect(hasReceipt(staked, r('round0001', 'stake'))).toBe(true);
    expect(receiptsOf(staked, 'phone00001')).toEqual({ n: 1, ids: [r('round0001', 'stake')] });
    // Tried again, it is not made again: the same ledger comes back.
    expect(applyMove(staked, r('round0001', 'stake'), -3)).toEqual({ ledger: staked, applied: false });
    const paid = moved(staked, r('round0001', 'pay'), 3000);
    expect(balanceOf(paid)).toBe(WELCOME - 3 + 3000);
    expect(applyMove(paid, r('round0001', 'pay'), 3000)).toEqual({ ledger: paid, applied: false });
    // A move of nothing is written down all the same.
    const marked = moved(paid, r('round0002', 'stake'), 0);
    expect(balanceOf(marked)).toBe(balanceOf(paid));
    expect(hasReceipt(marked, r('round0002', 'stake'))).toBe(true);
  });

  it('is not made when the medals are not there, or when the receipt or the number will not do', () => {
    const start = createLedger('phone00001');
    expect(applyMove(start, r('round0001', 'stake'), -(WELCOME + 1))).toBeNull();
    expect(applyMove(start, r('round0001', 'stake'), 1.5)).toBeNull();
    expect(applyMove(start, r('round0001', 'stake'), Number.NaN)).toBeNull();
    expect(applyMove(start, 'slot-machine:round 1:stake', -1)).toBeNull();
    expect(receiptOf('slot-machine', 'Round1', 'stake')).toBeNull();
    expect(receiptOf('slot-machine', 'r'.repeat(25), 'stake')).toBeNull();
    expect(receiptOf('slot-machine', 'round1', 'a:b')).toBeNull();
    expect(receiptOf('three-card-poker', 'abcdefghijklmnopqrstuvwx', 'stake-extra-2')).toBe('three-card-poker:abcdefghijklmnopqrstuvwx:stake-extra-2');
  });

  it('holds no more than a device may: one move too many is not made until a round is let go of', () => {
    let ledger = createLedger('phone00001');
    for (let i = 0; i < RECEIPTS.device; i++) ledger = moved(ledger, r(`round${i}`, 'stake'), 0);
    expect(applyMove(ledger, r('one-more', 'stake'), 0)).toBeNull();
    // Moves made before are still known as made.
    expect(applyMove(ledger, r('round0', 'stake'), 0)?.applied).toBe(false);
    const freed = forgetReceipts(ledger, 'slot-machine', ['round5']);
    expect(receiptsOf(freed, 'phone00001').ids).toEqual([r('round5', 'stake')]);
    expect(applyMove(freed, r('onemore', 'stake'), 0)?.applied).toBe(true);
  });

  it('lets go of a game’s receipts but those of the rounds it keeps, and of no other game’s', () => {
    let ledger = createLedger('phone00001');
    ledger = moved(ledger, r('a1', 'stake'), -1);
    ledger = moved(ledger, r('a2', 'stake'), -1);
    ledger = moved(ledger, r('a1', 'stake', 'craps'), -1);
    ledger = moved(ledger, r('a1', 'stake', 'craps-two'), -1);
    const forgotten = forgetReceipts(ledger, 'craps');
    expect(receiptsOf(forgotten, 'phone00001').ids).toEqual([r('a1', 'stake', 'craps-two'), r('a1', 'stake'), r('a2', 'stake')]);
    expect(receiptsOf(forgotten, 'phone00001').n).toBe(5);
    expect(balanceOf(forgotten)).toBe(balanceOf(ledger));
    expect(forgetReceipts(forgotten, 'craps')).toBe(forgotten);
    expect(receiptsOf(forgetReceipts(forgotten, 'slot-machine', ['a2']), 'phone00001').ids).toEqual([r('a1', 'stake', 'craps-two'), r('a2', 'stake')]);
  });

  it('goes with the medals at a reset: every round from before it is void', () => {
    const played = moved(createLedger('phone00001'), r('round0001', 'stake'), -3);
    const reset = resetLedger(played);
    expect(reset.receipts).toEqual({});
    // A copy of the era before, joined with the reset one, brings none of its receipts back.
    expect(mergeLedgers(reset, played).receipts).toEqual({});
    expect(mergeLedgers(played, reset).receipts).toEqual({});
  });
});

describe('receipts in two copies of one ledger', () => {
  const phone = createLedger('phone00001');

  it('keep the later of a device’s two copies, so that a receipt let go of does not come back from an older copy', () => {
    const staked = moved(phone, r('round0001', 'stake'), -3);
    const paid = moved(staked, r('round0001', 'pay'), 10);
    const over = forgetReceipts(paid, 'slot-machine');
    for (const joined of [mergeLedgers(over, staked), mergeLedgers(over, paid), mergeLedgers(mergeLedgers(over, staked), paid)]) {
      expect(receiptsOf(joined, 'phone00001')).toEqual({ n: 3, ids: [] });
      expect(balanceOf(joined)).toBe(WELCOME - 3 + 10);
    }
    // An older copy joined with a later one takes the later's.
    expect(receiptsOf(mergeLedgers(staked, paid), 'phone00001').ids).toEqual([r('round0001', 'pay'), r('round0001', 'stake')]);
  });

  it('keep another device’s receipts too, so that a move made there is known as made here', () => {
    const laptop = moved({ ...phone, device: 'laptop0001' }, r('round0009', 'stake', 'roulette'), -5);
    const joined = mergeLedgers(phone, laptop);
    expect(joined.device).toBe('phone00001');
    expect(hasReceipt(joined, r('round0009', 'stake', 'roulette'))).toBe(true);
    expect(applyMove(joined, r('round0009', 'stake', 'roulette'), -5)?.applied).toBe(false);
    expect(balanceOf(joined)).toBe(WELCOME - 5);
    expect(printOf(serializeLedger(mergeLedgers(phone, laptop)))).toBe(printOf(serializeLedger(mergeLedgers(laptop, phone))));
  });

  it('keep both of two copies of a device’s receipts with the same count, which only two tabs without locks can make', () => {
    const one = moved(phone, r('round0001', 'stake'), -1);
    const other = moved(phone, r('round0002', 'stake'), -1);
    expect(receiptsOf(mergeLedgers(one, other), 'phone00001')).toEqual({ n: 1, ids: [r('round0001', 'stake'), r('round0002', 'stake')] });
  });

  it('keep the copy’s own device’s receipts whole, and other devices’ only while they fit', () => {
    let mine = phone;
    for (let i = 0; i < RECEIPTS.device; i++) mine = moved(mine, r(`m${i}`, 'stake'), 0);
    let others = { ...phone, device: 'laptop0001' } satisfies Ledger;
    for (let device = 0; device < 40; device++) {
      let copy: Ledger = { ...phone, device: `tablet${String(device).padStart(4, '0')}`, receipts: {} };
      for (let i = 0; i <= device % 3; i++) copy = moved(copy, r(`t${device}x${i}`, 'stake'), 0);
      others = mergeLedgers(others, copy);
    }
    const joined = mergeLedgers(mine, others);
    const counted = Object.values(joined.receipts).reduce((sum, { ids }) => sum + ids.length, 0);
    expect(receiptsOf(joined, 'phone00001').ids).toHaveLength(RECEIPTS.device);
    expect(counted).toBeLessThanOrEqual(RECEIPTS.total);
    expect(counted).toBeGreaterThan(RECEIPTS.total - 3);
    // Each other device's are kept whole or not at all.
    for (const [device, { ids }] of Object.entries(joined.receipts)) if (device !== 'phone00001') expect(ids).toHaveLength(receiptsOf(others, device).ids.length);
  });
});

describe('receipts as text', () => {
  it('come back as they went, and a ledger with none is laid out the same way however it was built', () => {
    let ledger = moved(moved(createLedger('phone00001'), r('round0001', 'stake'), -3), r('round0001', 'pay', 'roulette'), 7);
    ledger = mergeLedgers(ledger, moved({ ...createLedger('phone00001'), device: 'laptop0001' }, r('x1', 'stake', 'craps'), -2));
    const text = serializeLedger(ledger);
    expect(parseLedger(text)).toEqual(ledger);
    expect(serializeLedger(parseLedger(text)!)).toBe(text);
  });

  it('leave out what is not in shape, and never refuse the ledger for it: a receipt changes no balance', () => {
    const good = JSON.parse(serializeLedger(moved(createLedger('phone00001'), r('round0001', 'stake'), -3))) as Record<string, unknown>;
    const odd = [
      { ...good, receipts: 'none' },
      { ...good, receipts: [] },
      { ...good, receipts: { 'NOT A DEVICE': { n: 1, ids: [r('round0001', 'stake')] } } },
      { ...good, receipts: { phone00001: { n: -1, ids: [r('round0001', 'stake')] } } },
      { ...good, receipts: { phone00001: { n: 1, ids: 'slot-machine:round0001:stake' } } },
    ];
    for (const value of odd) {
      const read = parseLedger(JSON.stringify(value));
      expect(read, JSON.stringify(value.receipts)).not.toBeNull();
      expect(read!.receipts).toEqual({});
      expect(balanceOf(read!)).toBe(WELCOME - 3);
    }
    const mixed = parseLedger(JSON.stringify({ ...good, receipts: { phone00001: { n: 4, ids: ['bad receipt', r('round0001', 'stake'), 7, r('round0001', 'stake')] } } }));
    expect(mixed?.receipts).toEqual({ phone00001: { n: 4, ids: [r('round0001', 'stake')] } });
  });

  it('read every ledger main wrote before there were receipts, with the same medals, the same era and nothing else changed', () => {
    expect(onMain.ledgers).toHaveLength(4);
    for (const { name, text, balance, era, cloud } of onMain.ledgers) {
      const ledger = parseLedger(text);
      expect(ledger, name).not.toBeNull();
      expect(balanceOf(ledger!), name).toBe(balance);
      expect(ledger!.era, name).toBe(era);
      expect(ledger!.receipts, name).toEqual({});
      // Written again, it is the text main wrote with an empty set of receipts beside it.
      expect(JSON.parse(serializeLedger(ledger!)), name).toEqual({ ...JSON.parse(text), receipts: {} });
      if (cloud) expect(fromCloud(cloud)?.text, name).toBe(text);
      // Played with receipts, and joined with the copy main wrote, nothing is counted twice.
      const played = moved(ledger!, r('round0001', 'stake'), balance >= 1 ? -1 : 0);
      const joined = mergeLedgers(parseLedger(text)!, played);
      expect(balanceOf(joined), name).toBe(balanceOf(played));
      expect(hasReceipt(joined, r('round0001', 'stake'))).toBe(true);
    }
  });

  it('keep the account’s copy well inside what the account takes, and the text inside what is read at all, at the most a ledger holds', () => {
    // Everything at its most: every device with a row and a game started over, every purse, every month of days,
    // the longest names, and receipts as many as a copy keeps, each as long as a receipt can be.
    const device = (i: number) => `d${i.toString(36)}`.padEnd(16, 'x');
    const rows: Record<string, { got: number; spent: number }> = {};
    const restartedAt: Record<string, number> = {};
    for (let i = 0; i < LIMITS.devices; i++) {
      rows[device(i)] = { got: LIMITS.medals, spent: LIMITS.medals };
      restartedAt[`three-card-poker@${device(i)}`.slice(0, 64)] = LIMITS.eras;
    }
    const names = (prefix: string) => Array.from({ length: LIMITS.names }, (_, i) => `${prefix}${i.toString(36)}`.padEnd(64, 'y'));
    const claimed = Object.fromEntries(Array.from({ length: 24 }, (_, m) => [`${2026 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`, 2 ** 28 - 1]));
    const receiptAt = (i: number) => `${'g'.repeat(24)}:${i.toString(36).padStart(24, 'r')}:${'s'.repeat(16)}`;
    const receipts: Record<string, { n: number; ids: string[] }> = { [device(0)]: { n: LIMITS.medals, ids: Array.from({ length: RECEIPTS.device }, (_, i) => receiptAt(i)) } };
    // The rest one apiece, from as many devices as there is room for: each device's name costs room too.
    for (let i = 1; i <= RECEIPTS.total - RECEIPTS.device; i++) receipts[device(i)] = { n: LIMITS.medals, ids: [receiptAt(1000 + i)] };
    const most: Ledger = {
      v: 1,
      device: device(0),
      era: LIMITS.eras,
      rows,
      imports: Object.fromEntries(names('i').map((name) => [name, LIMITS.medals])),
      voided: names('v'),
      claimed,
      restarted: restartedAt,
      receipts,
    };
    const text = serializeLedger(most);
    const read = parseLedger(text);
    expect(read).not.toBeNull();
    expect(Object.values(read!.receipts).reduce((sum, { ids }) => sum + ids.length, 0)).toBe(RECEIPTS.total);
    expect(text.length).toBeLessThan(LIMITS.length);
    const cloud = toCloud(text, 'm'.repeat(20), 1_800_000_000_000);
    expect(cloud).not.toBeNull();
    const size = sizeOf(cloud!);
    // Measured when receipts came in: 42,789 characters of text and 45,517 bytes on the account, against 36,809 and
    // 39,209 for the same ledger with no receipts. The account takes 65,536.
    expect(size).toBeLessThanOrEqual(48 * 1024);
    expect(ACCOUNT_LIMIT - size).toBeGreaterThan(16 * 1024);
  });
});

// ── The bank ─────────────────────────────────────────────────────────────────

const STAKE: Move = { game: 'slot-machine', round: 'round0001', step: 'stake', medals: -3 };
const PAY: Move = { game: 'slot-machine', round: 'round0001', step: 'pay', medals: 30 };

/** A page with a machine seated at the bank, which writes down what it is told. */
function seated(page: FakePage, game = 'slot-machine') {
  const told: string[] = [];
  const handlers: SeatHandlers = { granted: (moved) => told.push(moved ? 'granted, moved' : 'granted'), yielding: (why) => told.push(`yielding ${why}`) };
  return { seat: page.bank.sit(game, handlers), told };
}

const storedBalance = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};

describe('a move of a round’s medals, at the bank', () => {
  it('is made once by the page that holds the card, and only by it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { seat } = seated(page);
    expect(page.bank.apply(STAKE)).toBeNull();
    await quiet(browser);
    expect(seat.holding()).toBe(true);
    expect(page.bank.apply(STAKE)).toBe('applied');
    expect(page.bank.apply(STAKE)).toBe('already');
    expect(page.bank.applied(STAKE)).toBe(true);
    expect(page.bank.applied(PAY)).toBe(false);
    expect(page.bank.apply(PAY)).toBe('applied');
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 30);
    expect(page.bank.getState().balance).toBe(WELCOME - 3 + 30);
    // Not for another era of the medals, not more than there is, not a move that will not do.
    expect(page.bank.apply({ ...STAKE, round: 'round0002', era: 1 })).toBeNull();
    expect(page.bank.apply({ ...STAKE, round: 'round0002', medals: -1_000_000 })).toBeNull();
    expect(page.bank.apply({ ...STAKE, round: 'Round 2' })).toBeNull();
    expect(page.bank.apply({ ...STAKE, round: 'round0002', era: 0 })).toBe('applied');
    // The Medal Pusher's medal at a time is untouched by any of it.
    expect(page.bank.take(1)).toBe(true);
    expect(page.bank.give(2)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 30 - 3 - 1 + 2);
  });

  it('is not made again by another tab that holds the card after it, nor by the page after a reload', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = seated(first);
    await quiet(browser);
    expect(one.seat.holding()).toBe(true);
    expect(first.bank.apply(STAKE)).toBe('applied');
    // Another tab's machine takes the card.
    const second = browser.open();
    const two = seated(second);
    await quiet(browser);
    expect(two.seat.holding()).toBe(true);
    expect(second.bank.apply(STAKE)).toBe('already');
    expect(second.bank.apply(PAY)).toBe('applied');
    // The first page is reloaded: a new page, with the card once the second lets it go.
    first.close();
    second.close();
    const again = browser.open();
    seated(again);
    await quiet(browser);
    expect(again.bank.apply(PAY)).toBe('already');
    expect(again.bank.apply(STAKE)).toBe('already');
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 30);
  });

  it('is made or not, as a whole, wherever the browser dies: the medals and the receipt are one write', async () => {
    for (let left = 0; left <= 1; left++) {
      const browser = new FakeBrowser();
      const page = browser.open();
      seated(page);
      await quiet(browser);
      browser.writesLeft = left;
      expect(page.bank.apply(STAKE)).toBe('applied');
      const after = browser.revive();
      const back = after.open();
      seated(back);
      await quiet(after);
      expect(back.bank.applied(STAKE)).toBe(left === 1);
      expect(storedBalance(after)).toBe(left === 1 ? WELCOME - 3 : WELCOME);
      // Tried again, it is made exactly once in all.
      expect(back.bank.apply(STAKE)).toBe(left === 1 ? 'already' : 'applied');
      expect(storedBalance(after)).toBe(WELCOME - 3);
    }
  });

  it('is known as made in the account’s medals once a guest’s medals have become the account’s at sign-in', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    seated(page);
    await quiet(browser);
    expect(page.bank.apply(STAKE)).toBe('applied');
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 3 });
    expect(browser.storage.has(BANK_KEY)).toBe(false);
    expect(page.bank.apply(STAKE)).toBe('already');
    expect(page.bank.applied(STAKE)).toBe(true);
    // The account's copy carries the receipt to the player's other devices.
    const sent = parseLedger(accounts.text(UID));
    expect(sent && hasReceipt(sent, r('round0001', 'stake'))).toBe(true);
    // The new guest's medals after signing out are other medals: nothing of the account's is made in them.
    page.bank.attend(GUEST, accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(page.bank.applied(STAKE)).toBe(false);
  });

  it('is known as made on the player’s other device once the account has carried it there', async () => {
    const accounts = new FakeAccounts(() => 0);
    accounts.put(UID, serializeLedger(give(createLedger('first00001', 0), 500)), 'm-start');
    const phone = new FakeBrowser();
    const laptop = new FakeBrowser();
    const [p, l] = [phone.open(), laptop.open()];
    for (const page of [p, l]) {
      page.bank.attend(signedIn(UID), accounts.store);
      seated(page);
    }
    await quiet(phone, laptop);
    expect(p.bank.apply(STAKE)).toBe('applied');
    // The laptop plays a round of its own at the same time. Each sends, and reads the account again a little after.
    expect(l.bank.apply({ ...STAKE, round: 'round0002', medals: -4 })).toBe('applied');
    for (let second = 0; second < 90; second++) {
      phone.clock += 1000;
      laptop.clock += 1000;
      p.watchers?.tick();
      l.watchers?.tick();
      await quiet(phone, laptop);
    }
    const onAccount = parseLedger(accounts.text(UID))!;
    expect(hasReceipt(onAccount, r('round0001', 'stake'))).toBe(true);
    expect(hasReceipt(onAccount, r('round0002', 'stake'))).toBe(true);
    expect(balanceOf(onAccount)).toBe(500 - 3 - 4);
    // Whichever device hears of the other's first, each knows the other's move as made once it has: on the laptop, a
    // page opened since (another tab) if not the one already open.
    const later = laptop.open();
    later.bank.attend(signedIn(UID), accounts.store);
    seated(later);
    await quiet(laptop);
    for (const page of [p, later]) {
      expect(page.bank.apply(STAKE)).toBe('already');
      expect(page.bank.apply({ ...STAKE, round: 'round0002', medals: -4 })).toBe('already');
      expect(page.bank.getState().balance).toBe(500 - 3 - 4);
    }
  });

  it('is not made for a round from before the medal center’s reset, and the reset leaves no receipt behind', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    seated(page);
    await quiet(browser);
    expect(page.bank.apply({ ...STAKE, era: 0 })).toBe('applied');
    page.bank.reset();
    await quiet(browser);
    expect(page.bank.getState().ledger?.era).toBe(1);
    expect(page.bank.applied(STAKE)).toBe(false);
    expect(page.bank.apply({ ...PAY, era: 0 })).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('lets go of a game’s receipts only with the card, and keeps those of the rounds the machine keeps', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    seated(page);
    await quiet(browser);
    page.bank.apply(STAKE);
    page.bank.apply({ ...STAKE, round: 'round0002' });
    page.bank.apply({ ...STAKE, game: 'roulette' });
    expect(page.bank.forget('slot-machine', ['round0002'])).toBe(true);
    expect(page.bank.applied(STAKE)).toBe(false);
    expect(page.bank.applied({ ...STAKE, round: 'round0002' })).toBe(true);
    expect(page.bank.applied({ ...STAKE, game: 'roulette' })).toBe(true);
    const stored = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(stored, stored.device).ids).toEqual([r('round0001', 'stake', 'roulette'), r('round0002', 'stake')]);
    // Another tab that does not hold the card lets go of nothing.
    const other = browser.open();
    other.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(other.bank.forget('roulette')).toBe(false);
    expect(page.bank.applied({ ...STAKE, game: 'roulette' })).toBe(true);
  });

  it('can always be made again by a machine that keeps its rounds, however many it has played', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    seated(page);
    await quiet(browser);
    for (let round = 0; round < 3 * RECEIPTS.device; round++) {
      const name = `round${round}`;
      expect(page.bank.apply({ ...STAKE, round: name, medals: -1 })).toBe('applied');
      expect(page.bank.apply({ ...PAY, round: name, medals: 1 })).toBe('applied');
      page.bank.forget('slot-machine');
    }
    expect(storedBalance(browser)).toBe(WELCOME);
    const stored = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(stored, stored.device).ids).toEqual([]);
    expect(take(stored, 1)).not.toBeNull();
  });
});
