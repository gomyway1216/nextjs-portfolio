import { describe, expect, it, vi } from 'vitest';

import { fromCloud, slotFor, toCloud } from '@/components/game/MedalPusher/account';
import { BONUS_CARD, RECORDS_KEY, addDay, claim, createBook, dayNumber, dayOf, serializeBook } from '@/components/game/MedalPusher/records';
import { RECORDS_GAME_KEY as BOOK_GAME_KEY } from '@/components/game/MedalPusher/recordsStore';
import { createSession } from '@/components/game/MedalPusher/session';
import { STORAGE_KEY, STORAGE_VERSION, restore, serialize } from '@/components/game/MedalPusher/storage';
import { MACHINE_GAME_KEY } from '@/components/game/MedalPusher/savedMachine';
import { RECORDS_GAME_KEY, bookKey } from '@/components/game/MedalPusher/recordsStore';
import { BANKED_KEY, BANK_KEY, CARD_KEY, PUSHER, ledgerKey, purseIn, purseInCopy, settleLedgers, type BankEvent, type SeatHandlers } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, give, importPurse, parseLedger, resetLedger, serializeLedger, take, type Ledger } from '@/components/game/MedalCenter/ledger';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { FakeBrowser, quiet, type FakePage } from './bankFakes';

import beforeTheRide from '../MedalPusher/fixtures/save-before-the-ride.json';
import beforeArms from '../MedalPusher/fixtures/save-before-feed-arms.json';
import beforeJewels from '../MedalPusher/fixtures/save-before-jewels.json';
import beforeLamp from '../MedalPusher/fixtures/save-before-the-lucky-lamp.json';
import beforeChance from '../MedalPusher/fixtures/save-before-chance-time.json';
import beforeLeftAndRight from '../MedalPusher/fixtures/save-before-left-and-right.json';
import beforeLipChuckers from '../MedalPusher/fixtures/save-before-lip-chuckers.json';
import beforeFrontSlots from '../MedalPusher/fixtures/save-before-the-front-slots.json';
import beforeLampWithWorks from '../MedalPusher/fixtures/save-before-the-lucky-lamp-with-the-payout-works.json';
import beforeWorks from '../MedalPusher/fixtures/save-before-the-payout-works.json';
import beforeThreeBowls from '../MedalPusher/fixtures/save-before-the-three-bowls.json';
import beforeTheTubes from '../MedalPusher/fixtures/save-before-the-tubes.json';
import beforeThePlate from '../MedalPusher/fixtures/save-before-the-plate.json';
import beforeTheHurry from '../MedalPusher/fixtures/save-before-the-hurry.json';
import chanceAndOneBowl from '../MedalPusher/fixtures/save-with-chance-time-and-one-bowl.json';
import jewelsBeforeWorks from '../MedalPusher/fixtures/save-with-jewels-before-the-payout-works.json';
import threeBowlsBeforeJewels from '../MedalPusher/fixtures/save-with-the-three-bowls-before-jewels.json';
import packedInFormat1 from '../MedalPusher/fixtures/copies-packed-in-format-1.json';
import packedInFormat2 from '../MedalPusher/fixtures/copies-packed-in-format-2.json';

/** Every save of an older version the Medal Pusher's own tests keep, as players' devices and accounts hold them. */
const OLD_SAVES: { save: string }[] = [
  beforeArms,
  beforeLipChuckers,
  beforeLeftAndRight,
  beforeFrontSlots,
  beforeChance,
  beforeJewels,
  beforeThreeBowls,
  chanceAndOneBowl,
  threeBowlsBeforeJewels,
  beforeWorks,
  beforeLamp,
  jewelsBeforeWorks,
  beforeLampWithWorks,
  beforeTheRide,
  beforeTheTubes,
  beforeThePlate,
  beforeTheHurry,
];

const UID = 'test-player-1';

/** An old Medal Pusher's save from a fixture, with its purse set to `credits`. */
function oldSave(fixture: { save: string }, credits: number): string {
  const save = JSON.parse(fixture.save) as { session: { credits: number } };
  save.session.credits = credits;
  return JSON.stringify(save);
}

/** The bank a browser keeps for a player, read the way the bank reads it. */
const stored = (browser: FakeBrowser, uid: string | null = null): Ledger | null => parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
const storedBalance = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = stored(browser, uid);
  return ledger ? balanceOf(ledger) : null;
};

/** A page with a machine on it: it sits at the bank and writes down what it is told. */
function machine(page: FakePage, game: string = PUSHER.game) {
  const told: string[] = [];
  const handlers: SeatHandlers = {
    granted: (moved) => told.push(moved ? 'granted, moved' : 'granted'),
    yielding: (why) => told.push(`yielding ${why}`),
  };
  const seat = page.bank.sit(game, handlers);
  return { seat, told };
}

/** Lets `seconds` go by, second by second: the clocks move on, every page's timer ticks, and what follows happens. */
async function pass(seconds: number, browsers: FakeBrowser[], pages: FakePage[]): Promise<void> {
  for (let second = 0; second < seconds; second++) {
    for (const browser of browsers) browser.clock += 1000;
    for (const page of pages) page.watchers?.tick();
    await quiet(...browsers);
  }
}

const hear = (page: FakePage): BankEvent[] => {
  const events: BankEvent[] = [];
  page.bank.listen((event) => events.push(event));
  return events;
};

describe('the old purses', () => {
  it('reads the purse out of every shape of save the Medal Pusher has written, and nothing out of anything else', () => {
    for (const fixture of [beforeArms, beforeJewels, beforeLamp, beforeTheRide]) expect(purseIn(oldSave(fixture, 321))).toBe(321);
    expect(purseIn(beforeTheRide.save)).toBeGreaterThanOrEqual(0);
    expect(purseIn('not json')).toBeNull();
    expect(purseIn(null)).toBeNull();
    expect(purseIn(JSON.stringify({ version: 9, session: { credits: -1 } }))).toBeNull();
    expect(purseIn(JSON.stringify({ version: 9, session: { credits: 2.5 } }))).toBeNull();
    expect(purseIn(JSON.stringify({ session: { credits: 5 } }))).toBeNull();
    // The copy an account's machine is kept in on a device, with what is known of the account's around it.
    expect(purseInCopy(JSON.stringify({ v: 1, changedAt: 0, dirty: false, text: oldSave(beforeTheRide, 77) }))).toBe(77);
    expect(purseInCopy('{"v":1}')).toBeNull();
  });

  it('reads the same purse out of a save of every version as the machine itself does, the version it writes now among them', () => {
    // A machine of today's version, saved with a purse as a player on main before the bank would have had it saved.
    const today = createSession(7);
    today.credits = 432;
    const saves = [...OLD_SAVES.map((fixture) => fixture.save), serialize(today)];
    const versions = new Set(saves.map((text) => (JSON.parse(text) as { version: number }).version));
    // Every version there has been, from the first to the one written now; the one before it is a save of yesterday's main.
    expect([...versions].sort((a, b) => a - b)).toEqual(Array.from({ length: STORAGE_VERSION }, (_, at) => at + 1));
    for (const text of saves) {
      const purse = purseIn(text);
      expect(purse).toBeGreaterThan(0);
      // The hub reads only the purse, and the machine reads the whole save onto today's field: they agree.
      expect(purse).toBe(restore(text, 1)?.credits);
    }
    expect(purseIn(serialize(today))).toBe(432);
  });

  it('knows the Medal Pusher’s storage by the names the Medal Pusher keeps it under', () => {
    expect(PUSHER.machineKey).toBe(STORAGE_KEY);
    expect(PUSHER.game).toBe(MACHINE_GAME_KEY);
    expect(PUSHER.bookKey(null)).toBe(RECORDS_KEY);
    expect(PUSHER.bookKey(UID)).toBe(bookKey(UID));
    expect(RECORDS_GAME_KEY).not.toBe('medal-center');
    expect(PUSHER.booksGameKey).toBe(BOOK_GAME_KEY);
  });

  it('moves a guest’s old purse into the bank once, instead of a new member’s medals, and never again on this device', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(STORAGE_KEY, oldSave(beforeTheRide, 1234));
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(hub.bank.getState().balance).toBe(1234);
    expect(storedBalance(browser)).toBe(1234);
    expect(JSON.parse(browser.storage.get(BANKED_KEY) ?? '[]')).toEqual([PUSHER.guestPurse]);

    // Another page, and the machine reporting the same purse it still holds: nothing more.
    const other = browser.open();
    other.bank.subscribe(() => undefined);
    other.bank.importPurse(null, PUSHER.guestPurse, 1234);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(1234);

    // The guest's bank is gone (it became an account's): a new guest bank is a new member's, and the old purse is not moved in again.
    browser.storage.delete(BANK_KEY);
    const later = browser.open();
    later.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('moves in a guest’s purse from a save of yesterday’s version and from one of today’s', async () => {
    const today = createSession(11);
    today.credits = 2500;
    for (const save of [beforeTheTubes.save, serialize(today)]) {
      const purse = purseIn(save) ?? 0;
      expect(purse).toBeGreaterThan(0);
      const browser = new FakeBrowser();
      browser.storage.set(STORAGE_KEY, save);
      const hub = browser.open();
      hub.bank.subscribe(() => undefined);
      await quiet(browser);
      expect(hub.bank.getState().balance).toBe(purse);
      expect(stored(browser)?.imports[PUSHER.guestPurse]).toBe(purse);
    }
  });

  it('takes an empty purse for no purse: a machine saved since the bank keeps one, and its player is a new member', async () => {
    // Copilot's case: a guest plays (the machine is saved with an empty purse), signs in, and the guest's bank becomes
    // the account's; the machine stays in the guest's place. Signed out, the next guest's bank is a new member's.
    const browser = new FakeBrowser();
    browser.storage.set(STORAGE_KEY, oldSave(beforeTheRide, 0));
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(page.bank.getState().balance).toBe(WELCOME);
    expect(browser.storage.has(BANKED_KEY)).toBe(false);
  });

  it('opens a new member’s bank for a guest who never played', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(hub.bank.getState()).toMatchObject({ loaded: true, balance: WELCOME, owner: null, where: 'device', kept: true });
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('keeps the days the record book took the bonus on, so that none of them is paid twice and the card carries on', async () => {
    const browser = new FakeBrowser();
    const today = dayNumber(browser.day)!;
    let book = createBook('book000001');
    for (let back = 6; back >= 1; back--) book = claim(book, dayOf(today - back)).book;
    book = claim(book, browser.day).book;
    browser.storage.set(RECORDS_KEY, serializeBook(book));
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(hub.bank.cardToday()?.state).toBe('taken');
    hub.bank.claimBonus();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
    browser.day = dayOf(today + 1);
    expect(hub.bank.cardToday()).toMatchObject({ state: 'ready', medals: BONUS_CARD[0] });
  });
});

describe('the card: one page at a time writes the bank', () => {
  it('lets a machine play from the bank: a medal fed is taken out, a medal won goes back, and every other page sees it', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const pusher = browser.open();
    const { seat, told } = machine(pusher);
    await quiet(browser);
    expect(told).toEqual(['granted']);
    expect(seat.holding()).toBe(true);
    expect(pusher.bank.getState().card).toBe('here');
    expect(pusher.bank.take(3)).toBe(true);
    expect(pusher.bank.give(10)).toBe(true);
    expect(pusher.bank.take(WELCOME + 8)).toBe(false);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 7);
    expect(hub.bank.getState().balance).toBe(WELCOME + 7);
    // A page that does not hold the card takes nothing and gives nothing.
    expect(hub.bank.take(1)).toBe(false);
    expect(hub.bank.give(1)).toBe(false);
    expect(storedBalance(browser)).toBe(WELCOME + 7);
  });

  it('lends the card to the hub for a moment and has it straight back: the day’s bonus is paid once, between the machine’s medals', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    const heard = hear(hub);
    hub.bank.subscribe(() => undefined);
    const pusher = browser.open();
    const { seat, told } = machine(pusher);
    await quiet(browser);
    pusher.bank.take(5);
    hub.bank.claimBonus();
    // The machine keeps on until the card is asked for, then writes down what it has and lets it go.
    await quiet(browser);
    expect(told).toEqual(['granted', 'yielding moment', 'granted']);
    expect(heard).toEqual([{ type: 'bonus', medals: BONUS_CARD[0] }]);
    expect(seat.holding()).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 5 + BONUS_CARD[0]);
    expect(pusher.bank.getState().balance).toBe(WELCOME - 5 + BONUS_CARD[0]);
    pusher.bank.give(2);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 3 + BONUS_CARD[0]);
    expect(heard).toHaveLength(1);
  });

  it('gets the card to the hub even when its request reaches the lock manager after the machine has asked for it again', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    const heard = hear(hub);
    hub.bank.subscribe(() => undefined);
    const pusher = browser.open();
    const { seat, told } = machine(pusher);
    await quiet(browser);
    expect(seat.holding()).toBe(true);
    // The hub's request is slow to reach the lock manager, and the hub cannot ask the lock manager whether it is in: the
    // machine hears that it is wanted, lets the card go and asks for it again before the hub's request is in. The hub
    // says it again with the next tick, and has the card then.
    hub.lockLag = 4;
    hub.answersQueued = false;
    hub.bank.claimBonus();
    await pass(3, [browser], [hub, pusher]);
    expect(heard).toEqual([{ type: 'bonus', medals: BONUS_CARD[0] }]);
    expect(storedBalance(browser)).toBe(WELCOME + BONUS_CARD[0]);
    // And the machine has it back, and plays on.
    expect(seat.holding()).toBe(true);
    expect(told[0]).toBe('granted');
    expect(told.at(-1)).toBe('granted');
    // The reset gets through the same way.
    hub.bank.reset();
    await pass(3, [browser], [hub, pusher]);
    expect(stored(browser)?.era).toBe(1);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(seat.holding()).toBe(true);
  });

  it('gets the card to the hub at once, no tick needed, when its request is slow to reach the lock manager', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    const heard = hear(hub);
    hub.bank.subscribe(() => undefined);
    const pusher = browser.open();
    const { seat, told } = machine(pusher);
    await quiet(browser);
    expect(seat.holding()).toBe(true);
    // The hub's request takes a while to reach the lock manager, and the hub tells the machine it wants the card only
    // once it is in: the machine, which asks for the card again at once, is behind it. No tick runs.
    hub.lockLag = 4;
    hub.bank.claimBonus();
    await quiet(browser);
    expect(heard).toEqual([{ type: 'bonus', medals: BONUS_CARD[0] }]);
    expect(storedBalance(browser)).toBe(WELCOME + BONUS_CARD[0]);
    expect(seat.holding()).toBe(true);
    expect(told).toEqual(['granted', 'yielding moment', 'granted']);
  });

  it('pays a day once when two pages reach for it at the same moment', async () => {
    const browser = new FakeBrowser();
    const [a, b] = [browser.open(), browser.open()];
    a.bank.subscribe(() => undefined);
    b.bank.subscribe(() => undefined);
    await quiet(browser);
    a.bank.claimBonus();
    b.bank.claimBonus();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + BONUS_CARD[0]);
  });

  it('pauses the machine in one tab when the player starts one in another, and opens it again from the other’s save when it is played again', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machine(first);
    await quiet(browser);
    first.bank.take(10);
    const second = browser.open();
    const two = machine(second);
    await quiet(browser);
    expect(one.told).toEqual(['granted', 'yielding moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(one.seat.holding()).toBe(false);
    expect(first.bank.take(1)).toBe(false);
    expect(two.told).toEqual(['granted']);
    expect(second.bank.getState().balance).toBe(WELCOME - 10);
    second.bank.give(4);
    // Back to the first: the second pauses, and the first is told that the other played its game since.
    one.seat.play();
    await quiet(browser);
    expect(two.told).toEqual(['granted', 'yielding moment']);
    expect(second.bank.getState().card).toBe('away');
    expect(one.told).toEqual(['granted', 'yielding moment', 'granted, moved']);
    expect(first.bank.getState().balance).toBe(WELCOME - 6);
    expect(JSON.parse(browser.storage.get(CARD_KEY) ?? '{}')).toEqual({ [PUSHER.game]: first.name });
  });

  it('lets the machine write down what it has while it still holds the card, and only then lets the card go', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const holdingWhenYielding: boolean[] = [];
    const seat = page.bank.sit(PUSHER.game, { granted: () => undefined, yielding: () => holdingWhenYielding.push(seat.holding()) });
    await quiet(browser);
    page.hide();
    expect(holdingWhenYielding).toEqual([true]);
    expect(seat.holding()).toBe(false);
  });

  it('lets the card go when its page is hidden or left, and asks for it again when it is shown', async () => {
    const browser = new FakeBrowser();
    const pusher = browser.open();
    const { seat, told } = machine(pusher);
    await quiet(browser);
    pusher.hide();
    await quiet(browser);
    expect(told).toEqual(['granted', 'yielding hidden']);
    expect(seat.holding()).toBe(false);
    expect(browser.holder).toBeNull();
    pusher.show();
    await quiet(browser);
    expect(told).toEqual(['granted', 'yielding hidden', 'granted']);
    pusher.hide('left');
    expect(told.at(-1)).toBe('yielding left');
  });

  it('gives the card on when a page holding it is closed without a word, as a browser lets go of a closed page’s lock', async () => {
    const browser = new FakeBrowser();
    const gone = browser.open();
    machine(gone);
    await quiet(browser);
    gone.bank.take(1);
    gone.closed = true;
    browser.pages = browser.pages.filter((page) => page !== gone);
    browser.holder = null;
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + BONUS_CARD[0]);
  });

  it('pays no bonus where the browser cannot keep its pages apart, and plays on all the same', async () => {
    const browser = new FakeBrowser();
    browser.apart = false;
    const pusher = browser.open();
    const { seat } = machine(pusher);
    await quiet(browser);
    expect(seat.holding()).toBe(true);
    expect(pusher.bank.take(2)).toBe(true);
    pusher.bank.claimBonus();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 2);
    expect(pusher.bank.getState().apart).toBe(false);
  });
});

describe('the refill and the reset', () => {
  it('refills a bank with nothing in it, once, by the attendant’s cupful', async () => {
    const browser = new FakeBrowser();
    const pusher = browser.open();
    const heard = hear(pusher);
    machine(pusher);
    await quiet(browser);
    expect(pusher.bank.refill()).toBe(false);
    pusher.bank.take(WELCOME);
    expect(pusher.bank.refill()).toBe(true);
    expect(pusher.bank.refill()).toBe(false);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(heard).toEqual([{ type: 'refill', medals: WELCOME }]);
  });

  it('gives no refill while medals are out on a round, at the hub or at a machine, and gives it once they are back', async () => {
    const browser = new FakeBrowser();
    const table = browser.open();
    machine(table, 'video-poker');
    await quiet(browser);
    // All of the player's medals on a double-up still waiting for its pick: none to play with, and none run out of.
    expect(table.bank.apply({ game: 'video-poker', round: 'hand0001', step: 'double1', medals: -WELCOME })).toBe('applied');
    expect(table.bank.getState()).toMatchObject({ balance: 0, out: ['video-poker'] });
    expect(table.bank.refill()).toBe(false);
    // The player walks over to the hub: the machine's page is closed, and the double still waits.
    table.close();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(hub.bank.getState()).toMatchObject({ loaded: true, balance: 0, out: ['video-poker'] });
    hub.bank.refill();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(0);
    hub.close();
    // Back at the machine, the card picked is lower: the double is settled with nothing back, and says so.
    const again = browser.open();
    const heard = hear(again);
    machine(again, 'video-poker');
    await quiet(browser);
    const before = again.bank.getState().out;
    expect(again.bank.settle('video-poker', ['hand0001'])).toBe(true);
    // The same list while it says the same.
    expect(again.bank.getState().out).toBe(before);
    expect(again.bank.settle('video-poker')).toBe(true);
    expect(again.bank.getState().out).toEqual([]);
    expect(again.bank.refill()).toBe(true);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(heard).toEqual([{ type: 'refill', medals: WELCOME }]);
  });

  it('settles a round only with the card: another tab says nothing of the medals out', async () => {
    const browser = new FakeBrowser();
    const table = browser.open();
    machine(table, 'video-poker');
    await quiet(browser);
    table.bank.apply({ game: 'video-poker', round: 'hand0001', step: 'deal', medals: -WELCOME });
    const other = browser.open();
    other.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(other.bank.settle('video-poker')).toBe(false);
    expect(table.bank.getState().out).toEqual(['video-poker']);
    expect(other.bank.getState().out).toEqual(['video-poker']);
    // Lost at the machine: settled there, and the refill is the player's from any page.
    expect(table.bank.settle('video-poker')).toBe(true);
    await quiet(browser);
    expect(other.bank.getState().out).toEqual([]);
    // Paid with the card, which the machine's page lends it for a moment.
    other.bank.refill();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('resets from the hub: the bank is a new member’s, the bonus days stay, and the machine in the other tab hears it and starts over', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const pusher = browser.open();
    const heard = hear(pusher);
    machine(pusher);
    await quiet(browser);
    pusher.bank.give(900);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(pusher.bank.restartDue(PUSHER.game)).toBe(false);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)?.era).toBe(1);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(hub.bank.cardToday()?.state).toBe('taken');
    expect(heard).toEqual([{ type: 'reset' }]);
    expect(pusher.bank.restartDue(PUSHER.game)).toBe(true);
    pusher.bank.restarted(PUSHER.game);
    await quiet(browser);
    expect(pusher.bank.restartDue(PUSHER.game)).toBe(false);
    // Started over on this device: the key is the game's and the device's, since every device's copy starts over once.
    expect(stored(browser)?.restarted).toEqual({ [`${PUSHER.game}@${stored(browser)?.device}`]: 1 });
  });
});

describe('a reset, on every device', () => {
  it('starts every device’s copy of the machine over once, whichever device started its own over first', async () => {
    const accounts = new FakeAccounts(() => 0);
    const machines = new FakeAccounts(() => 0);
    accounts.put(UID, serializeLedger(createLedger('first00001', 500)), 'm-start');
    const [phone, laptop] = [new FakeBrowser(), new FakeBrowser()];
    const [p, l] = [phone.open(), laptop.open()];
    for (const page of [p, l]) {
      page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
      page.bank.subscribe(() => undefined);
    }
    await quiet(phone, laptop);
    p.bank.reset();
    await pass(30, [phone, laptop], [p]);
    // The phone has started its machine over. The laptop, which kept a copy of the machine from before the reset,
    // has not, and when it hears of the reset its copy is still due to start over.
    expect(p.bank.restartDue(PUSHER.game)).toBe(true);
    p.bank.restarted(PUSHER.game);
    await pass(30, [phone, laptop], [p]);
    expect(p.bank.restartDue(PUSHER.game)).toBe(false);
    // The laptop hears of the reset the next time it sends: it plays a medal.
    machine(l);
    await quiet(laptop);
    l.bank.give(1);
    await pass(90, [phone, laptop], [p, l]);
    expect(l.bank.getState().ledger?.era).toBe(1);
    expect(l.bank.restartDue(PUSHER.game)).toBe(true);
  });
});

describe('the bank of a player who is signed in', () => {
  const setup = () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const machines = new FakeAccounts(() => browser.clock);
    return { browser, accounts, machines };
  };

  it('moves the guest’s bank into an account that has none, once: it does not become a second account’s', async () => {
    const { browser, accounts, machines } = setup();
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    machine(page);
    await quiet(browser);
    page.bank.take(30);
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - 30 });
    expect(browser.storage.has(BANK_KEY)).toBe(false);
    expect(storedBalance(browser, UID)).toBe(WELCOME - 30);
    const sent = parseLedger(accounts.text(UID));
    expect(sent && balanceOf(sent)).toBe(WELCOME - 30);
    // Signed out, the guest has a new member's bank of their own, and the account's stays the account's.
    page.bank.attend({ uid: null, settled: true, expected: false }, accounts.store, { machines: machines.store });
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(storedBalance(browser, UID)).toBe(WELCOME - 30);
  });

  it('moves a guest machine’s purse in once, even when the machine has become an account’s before it is played', async () => {
    const { browser, accounts, machines } = setup();
    browser.storage.set(STORAGE_KEY, oldSave(beforeTheRide, 500));
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    machine(page);
    await quiet(browser);
    expect(page.bank.getState().balance).toBe(500);
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    // The account had no bank: the guest's, with the purse in it, is the account's now.
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    // The machine, opened as the guest's, reports its purse as the guest's: it is in already, and is not moved in again.
    page.bank.importPurse(UID, PUSHER.guestPurse, 500);
    await quiet(browser);
    expect(page.bank.getState().balance).toBe(500);
    expect(storedBalance(browser, UID)).toBe(500);
  });

  it('writes down a guest purse the machine moves in, so that no later guest’s bank on this device moves it in again', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    machine(page);
    await quiet(browser);
    // A purse the bank had not seen when it was opened, as a machine of the old game in another tab would have left.
    page.bank.importPurse(null, PUSHER.guestPurse, 70);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(70);
    expect(JSON.parse(browser.storage.get(BANKED_KEY) ?? '[]')).toEqual([PUSHER.guestPurse]);
  });

  it('plays the account’s bank where the account has one, and leaves the guest’s on this device for the guest', async () => {
    const { browser, accounts, machines } = setup();
    accounts.put(UID, serializeLedger(give(createLedger('laptop0001'), 4000)), 'm-elsewhere');
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    await quiet(browser);
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME + 4000 });
    expect(storedBalance(browser)).toBe(WELCOME);
    // Taken under this device's own name, so that what it plays is a row of its own.
    expect(stored(browser, UID)?.device).not.toBe('laptop0001');
  });

  it('adds together what two devices have each done with the account’s medals, whichever reaches the account second', async () => {
    const accounts = new FakeAccounts(() => 0);
    const machines = new FakeAccounts(() => 0);
    accounts.put(UID, serializeLedger(createLedger('first00001', 500)), 'm-start');
    const phone = new FakeBrowser();
    const laptop = new FakeBrowser();
    const [p, l] = [phone.open(), laptop.open()];
    for (const page of [p, l]) {
      page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
      machine(page);
    }
    await quiet(phone, laptop);
    expect(p.bank.getState().balance).toBe(500);
    p.bank.take(100);
    p.bank.give(40);
    l.bank.give(7);
    // Both send at the same moment, and the one whose read came before the other's write writes over it. Each reads
    // the account again a little after its write, and sends again what it finds missing.
    await pass(90, [phone, laptop], [p, l]);
    const onAccount = parseLedger(accounts.text(UID));
    expect(onAccount && balanceOf(onAccount)).toBe(500 - 100 + 40 + 7);
    expect(p.bank.getState().balance).toBe(447);
    expect(l.bank.getState().balance).toBe(447);
  });

  it('moves an account’s old purse in once, from the copy on this device or from the account’s machine, however many devices do', async () => {
    const accounts = new FakeAccounts(() => 0);
    const machines = new FakeAccounts(() => 0);
    machines.put(UID, oldSave(beforeLamp, 2000), 'm-machine');
    // The phone kept a copy of the account's machine from before the bank; the laptop never played here.
    const phone = new FakeBrowser();
    phone.storage.set(slotFor(STORAGE_KEY, UID), JSON.stringify({ v: 1, changedAt: 0, dirty: false, known: null, sent: null, sentPrint: null, earlier: [], text: oldSave(beforeLamp, 1800) }));
    const laptop = new FakeBrowser();
    const pages = [phone.open(), laptop.open()];
    for (const page of pages) {
      page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
      page.bank.subscribe(() => undefined);
    }
    await pass(90, [phone, laptop], pages);
    const onAccount = parseLedger(accounts.text(UID));
    // One purse, at the larger of the two copies of it, and no new member's medals for an account that had a machine.
    expect(onAccount?.imports[PUSHER.accountPurse]).toBe(2000);
    expect(onAccount?.voided).toEqual(['welcome:0']);
    expect(onAccount && balanceOf(onAccount)).toBe(2000);
    for (const page of pages) expect(page.bank.getState().balance).toBe(2000);
    expect(machines.count('load')).toBeLessThanOrEqual(2);
  });

  it('moves an account’s old purse in from the account’s machine as it lies there packed in every older format', async () => {
    // The copies as the packer of their day wrote them on players' accounts: a save of version 6 in format 1, and
    // yesterday's main's version 9 in format 2. Each is read in the format it says it is in.
    for (const [fixture, save] of [
      [packedInFormat1, jewelsBeforeWorks],
      [packedInFormat2, beforeTheTubes],
    ] as const) {
      const { state } = fixture.copies[0];
      expect(fromCloud(state)?.text).toBe(save.save);
      const purse = purseIn(save.save) ?? 0;
      expect(purse).toBeGreaterThan(0);
      const { browser, accounts, machines } = setup();
      machines.docs.set(UID, { state, updatedAt: 0 });
      const page = browser.open();
      page.bank.subscribe(() => undefined);
      page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
      await quiet(browser);
      expect(page.bank.getState()).toMatchObject({ owner: UID, balance: purse });
      expect(stored(browser, UID)?.imports[PUSHER.accountPurse]).toBe(purse);
      // And the account has it, as soon as the bank is next sent.
      await pass(90, [browser], [page]);
      expect(parseLedger(accounts.text(UID))?.imports[PUSHER.accountPurse]).toBe(purse);
      expect(machines.count('load')).toBe(1);
    }
  });

  it('keeps a new member’s medals for an account whose machine had an empty purse, and does not look again', async () => {
    const { browser, accounts, machines } = setup();
    machines.put(UID, oldSave(beforeLamp, 0), 'm-machine');
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    machine(page);
    await quiet(browser);
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME });
    expect(stored(browser, UID)?.imports[PUSHER.accountPurse]).toBe(0);
    expect(stored(browser, UID)?.voided).not.toContain('welcome:0');
    const reads = machines.count('load');
    const again = browser.open();
    again.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    again.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(machines.count('load')).toBe(reads);
  });

  it('does not pay a day the account’s old record book took, on a device that keeps no copy of the book', async () => {
    const { browser, accounts, machines } = setup();
    const books = new FakeAccounts(() => browser.clock);
    // Before the bank, the record book on another device took today's bonus, and the account has that book.
    books.put(UID, serializeBook(claim(createBook('laptop0001'), browser.day).book), 'm-book');
    const page = browser.open();
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store, books: books.store });
    page.bank.subscribe(() => undefined);
    machine(page);
    // Pressed at once, while the book may still be on its way: the press waits for it.
    page.bank.claimBonus();
    await quiet(browser);
    page.bank.claimBonus();
    await quiet(browser);
    expect(page.bank.cardToday()?.state).toBe('taken');
    expect(page.bank.getState().balance).toBe(WELCOME);
    expect(books.count('load')).toBe(1);
    // Looked at once, for good: the next page does not ask again.
    const again = browser.open();
    again.bank.attend(signedIn(UID), accounts.store, { machines: machines.store, books: books.store });
    again.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(books.count('load')).toBe(1);
  });

  it('asks the account before it pays a day’s bonus, and does not pay a day another device has taken', async () => {
    const { browser, accounts, machines } = setup();
    accounts.put(UID, serializeLedger(createLedger('laptop0001')), 'm-1');
    const page = browser.open();
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    page.bank.subscribe(() => undefined);
    await quiet(browser);
    // Meanwhile the laptop took today's bonus.
    const there = parseLedger(accounts.text(UID))!;
    accounts.put(UID, serializeLedger(give({ ...there, claimed: addDay(there.claimed, browser.day) }, BONUS_CARD[0])), 'm-2');
    page.bank.claimBonus();
    await quiet(browser);
    expect(page.bank.getState().balance).toBe(WELCOME + BONUS_CARD[0]);
    expect(page.bank.cardToday()?.state).toBe('taken');
  });

  it('leaves an account’s copy it cannot read as it is, and keeps playing this device’s', async () => {
    const { browser, accounts, machines } = setup();
    accounts.docs.set(UID, { state: { format: 99, mark: 'x', changedAt: 0, data: '???' }, updatedAt: 0 });
    const page = browser.open();
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    page.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(page.bank.getState().where).toBe('unreadable');
    expect(accounts.docs.get(UID)?.state).toEqual({ format: 99, mark: 'x', changedAt: 0, data: '???' });
    expect(accounts.count('store')).toBe(0);
  });

  it('sends nothing as a player who has signed out', async () => {
    const { browser, accounts, machines } = setup();
    const page = browser.open();
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    machine(page);
    await quiet(browser);
    const writes = accounts.count('store');
    page.bank.attend({ uid: null, settled: true, expected: false }, accounts.store, { machines: machines.store });
    await quiet(browser);
    page.bank.take(5);
    browser.clock += 120_000;
    for (let i = 0; i < 30; i++) page.watchers?.tick();
    await quiet(browser);
    expect(accounts.count('store')).toBe(writes);
  });
});

describe('which copy wins', () => {
  const name = vi.fn(() => 'fresh00001');
  const text = (ledger: Ledger) => serializeLedger(ledger);
  const mine = take(createLedger('phone00001'), 10)!;
  const theirs = give(createLedger('laptop0001', 0), 50);

  it('holds when the account’s copy cannot be read', () => {
    expect(settleLedgers({ account: { kind: 'unreadable' }, device: null, guest: text(mine), skew: 0 }, name).verdict).toEqual({ kind: 'hold' });
    expect(settleLedgers({ account: { kind: 'save', text: 'not a ledger', mark: null, updatedAt: null }, device: null, guest: null, skew: 0 }, name).verdict).toEqual({ kind: 'hold' });
  });

  it('moves the guest’s bank into an account with none, and sends this device’s own copy to one that has lost it', () => {
    expect(settleLedgers({ account: { kind: 'none' }, device: null, guest: text(mine), skew: 0 }, name)).toEqual({ verdict: { kind: 'take', text: text(mine), send: true }, fromGuest: true });
    const device = { text: text(mine), dirty: false, known: null, sent: null, sentIsLatest: false, changedAt: 0 };
    expect(settleLedgers({ account: { kind: 'none' }, device, guest: null, skew: 0 }, name)).toEqual({ verdict: { kind: 'take', text: text(mine), send: true }, fromGuest: false });
    expect(settleLedgers({ account: { kind: 'none' }, device: null, guest: null, skew: 0 }, name).verdict).toEqual({ kind: 'adopt' });
  });

  it('joins this device’s copy with the account’s, and takes the account’s under a new name where this device has none: the guest’s stays the guest’s', () => {
    const device = { text: text(mine), dirty: true, known: null, sent: null, sentIsLatest: false, changedAt: 0 };
    const joined = settleLedgers({ account: { kind: 'save', text: text(theirs), mark: 'm', updatedAt: 0 }, device, guest: null, skew: 0 }, name);
    expect(joined.fromGuest).toBe(false);
    expect(joined.verdict.kind === 'take' && balanceOf(parseLedger(joined.verdict.text)!)).toBe(WELCOME - 10 + 50);
    expect(joined.verdict.kind === 'take' && joined.verdict.send).toBe(true);
    const taken = settleLedgers({ account: { kind: 'save', text: text(theirs), mark: 'm', updatedAt: 0 }, device: null, guest: text(mine), skew: 0 }, name);
    expect(taken.fromGuest).toBe(false);
    expect(taken.verdict.kind === 'take' && parseLedger(taken.verdict.text)).toMatchObject({ device: 'fresh00001' });
    expect(taken.verdict.kind === 'take' && balanceOf(parseLedger(taken.verdict.text)!)).toBe(50);
    expect(taken.verdict.kind === 'take' && taken.verdict.send).toBe(false);
  });

  it('lets a reset on the account win over this device’s older era', () => {
    const reset = resetLedger(importPurse(theirs, PUSHER.accountPurse, 10));
    const device = { text: text(give(mine, 5000)), dirty: true, known: null, sent: null, sentIsLatest: false, changedAt: 0 };
    const verdict = settleLedgers({ account: { kind: 'save', text: text(reset), mark: 'm', updatedAt: 0 }, device, guest: null, skew: 0 }, name).verdict;
    expect(verdict.kind === 'take' && balanceOf(parseLedger(verdict.text)!)).toBe(WELCOME);
  });
});

it('fits the account’s limit with room to spare, however many devices have played', () => {
  let ledger = createLedger('phone00001');
  for (let i = 0; i < 200; i++) ledger = { ...ledger, rows: { ...ledger.rows, [`device${String(i).padStart(5, '0')}`]: { got: 999_999_999, spent: 999_999_999 } } };
  const cloud = toCloud(serializeLedger(ledger), 'mark000000000000', 0);
  expect(cloud).not.toBeNull();
});
