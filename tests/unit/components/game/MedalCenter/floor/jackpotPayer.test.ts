import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountStore } from '@/components/game/MedalPusher/account';
import { createJackpotPayer, type JackpotPaid } from '@/components/game/MedalCenter/floor/jackpotPayer';
import { balanceOf, createLedger, hasReceipt, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import { ledgerKey } from '@/components/game/MedalCenter/bank';
import { CLAIM_LEASE_MS, JACKPOT_SEED } from '@/lib/medalFloor/jackpot';
import { FakeFirestore, FakeRtdb, fakeAuth } from '../../../../api/medalFloor/fakeFirebase';
import { FakeAccounts, signedIn } from '../../MedalPusher/accountFakes';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../bankFakes';

// The floor jackpot's way into a player's medals, end to end: the real bank in a fake browser that can die between
// any two writes (bankFakes.ts), and the real routes on in-memory fakes of Firestore, the Realtime Database and token
// checks. A win the server drew is paid into the player's medals once, under its receipt, and only then said to be
// paid: never twice, and never lost, wherever the browser dies. No real server, account or token is used.

const fakes = vi.hoisted(() => ({ db: null as unknown, rtdb: null as unknown, auth: null as unknown, draws: [] as number[], names: [] as string[] }));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => fakes.db,
  getRealtimeDatabase: () => fakes.rtdb,
  getAuth: () => fakes.auth,
}));
vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));
vi.mock('@/lib/medalFloor/draw', () => ({
  drawUniform: () => fakes.draws.shift() ?? 0.999_999,
  drawName: () => fakes.names.shift() ?? 'a1b2c3d4',
}));

/** The made-up account the fake token `fake-token-ann` stands for. */
const UID = 'test-uid-ann';
const TOKEN = 'fake-token-ann';
const NOON = Date.UTC(2026, 9, 17, 6, 0, 0);
const ORIGIN = 'https://floor.example.test';
const STARTING = 500;

const db = () => fakes.db as FakeFirestore;
const winDoc = (id: string) => db().read(`medal_floor_jackpot/current/medal_floor_jackpot_wins/${id}`) as { state: string } | undefined;
const pending = () => ((db().read(`medal_floor_players/${UID}`) as { jackpot?: { pending: unknown[] } } | undefined)?.jackpot?.pending ?? []).length;

function route(path: string, body: unknown, token = TOKEN): NextRequest {
  return new NextRequest(`${ORIGIN}/api/game/medal-floor${path}`, { method: path === '/me' ? 'PUT' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-real-ip': '198.51.100.7' }, body: JSON.stringify(body) });
}

/** A fresh floor on the server where the player has joined and has just won the floor jackpot: its name. */
async function floorWithWin(name = 'cafef00d'): Promise<string> {
  fakes.db = new FakeFirestore();
  fakes.rtdb = new FakeRtdb();
  fakes.auth = fakeAuth();
  const { PUT } = await import('@/app/api/game/medal-floor/me/route');
  expect((await PUT(route('/me', { name: 'Lucky Cat' }), undefined as never))!.status).toBe(200);
  return win(name);
}

async function win(name: string): Promise<string> {
  fakes.draws.push(0);
  fakes.names.push(name);
  const { POST } = await import('@/app/api/game/medal-floor/report/route');
  const answer = (await (await POST(route('/report', { game: 'slot-machine', played: 3 }), undefined as never))!.json()) as { jackpot?: { id: string } };
  return answer.jackpot!.id;
}

/** The account's store, which a browser that has died cannot reach any more than its storage. */
function storeFor(accounts: FakeAccounts, browser: () => FakeBrowser): AccountStore {
  const dead = () => browser().dead;
  return {
    load: (uid) => (dead() ? Promise.reject(new Error('the browser has died')) : accounts.store.load(uid)),
    store: (uid, state) => (dead() ? Promise.reject(new Error('the browser has died')) : accounts.store.store(uid, state)),
    prepare: (uid) => accounts.store.prepare(uid),
    storeNow: () => null,
    forget: (uid) => accounts.store.forget(uid),
  };
}

/** A page with the player's medals open on it (the account's, which start with STARTING medals). */
async function pageFor(browser: FakeBrowser, accounts: FakeAccounts): Promise<FakePage> {
  const page = browser.open();
  page.bank.attend(signedIn(UID), storeFor(accounts, () => browser));
  page.bank.subscribe(() => undefined);
  await quiet(browser);
  expect(page.bank.getState()).toMatchObject({ loaded: true, owner: UID });
  return page;
}

interface Payer {
  payer: ReturnType<typeof createJackpotPayer>;
  calls: string[];
  paid: JackpotPaid[];
  timers: { run: () => void; ms: number }[];
}

/** The payer on a page: its calls go to the real route, and fail once the page's browser has died. */
function payerOn(page: FakePage, options: { down?: () => boolean } = {}): Payer {
  const calls: string[] = [];
  const paid: JackpotPaid[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const payer = createJackpotPayer({
    account: () => ({ uid: UID, token: async () => TOKEN }),
    fetch: (async (url: string, init?: RequestInit) => {
      if (page.browser.dead || options.down?.()) throw new TypeError('Failed to fetch');
      calls.push(JSON.parse(String(init?.body)).action);
      const { POST } = await import('@/app/api/game/medal-floor/jackpot/wins/route');
      const { cache, ...rest } = init ?? {};
      void cache;
      return POST(new NextRequest(`${ORIGIN}${url}`, rest as ConstructorParameters<typeof NextRequest>[1]), undefined as never);
    }) as typeof fetch,
    bank: {
      table: () => {
        const state = page.bank.getState();
        return state.loaded && state.ledger ? { owner: state.owner, device: state.ledger.device } : null;
      },
      credit: (move, keep) => page.bank.credit(move, keep),
    },
    now: () => Date.now(),
    later: (run, ms) => {
      timers.push({ run, ms });
      return timers.length;
    },
    cancel: () => undefined,
  });
  payer.onPaid((heard) => paid.push(heard));
  return { payer, calls, paid, timers };
}

/** Lets the browser, the routes and the network finish what they are doing: until nothing has happened for a while. */
async function settle(...browsers: FakeBrowser[]): Promise<void> {
  let calm = 0;
  for (let round = 0; round < 400 && calm < 10; round++) {
    const before = JSON.stringify([db().writes, browsers.map((browser) => [browser.writes, browser.tasks.length])]);
    await quiet(...browsers);
    await new Promise((resolve) => setTimeout(resolve, 0));
    calm = JSON.stringify([db().writes, browsers.map((browser) => [browser.writes, browser.tasks.length])]) === before ? calm + 1 : 0;
  }
}

const medalsIn = (browser: FakeBrowser): number => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(UID)) ?? null);
  return ledger ? balanceOf(ledger) : -1;
};
const receiptIn = (browser: FakeBrowser, id: string): boolean => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(UID)) ?? null);
  return ledger !== null && hasReceipt(ledger, `floor-jackpot:${id}:pay`);
};

function accountsWith(browser: () => FakeBrowser): FakeAccounts {
  const accounts = new FakeAccounts(() => browser().clock);
  accounts.put(UID, serializeLedger(createLedger('acct000001', STARTING)), 'm-start');
  return accounts;
}

beforeEach(async () => {
  vi.resetModules();
  // The routes are loaded before the clock starts: loading them takes real time the first time, which no settling of
  // the browser below would wait for.
  await Promise.all([
    import('@/app/api/game/medal-floor/me/route'),
    import('@/app/api/game/medal-floor/report/route'),
    import('@/app/api/game/medal-floor/jackpot/wins/route'),
  ]);
  fakes.draws = [];
  fakes.names = [];
  vi.useFakeTimers({ toFake: ['Date'], now: NOON });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a floor jackpot on its way into the player’s medals', () => {
  it('goes in once under its receipt, and only then is it said to be paid', async () => {
    const id = await floorWithWin();
    let browser = new FakeBrowser();
    const accounts = accountsWith(() => browser);
    const page = await pageFor(browser, accounts);
    const { payer, calls, paid } = payerOn(page);
    payer.look(UID);
    await settle(browser);
    expect(calls).toEqual(['claim', 'ack']);
    expect(page.bank.getState().balance).toBe(STARTING + JACKPOT_SEED);
    expect(medalsIn(browser)).toBe(STARTING + JACKPOT_SEED);
    expect(receiptIn(browser, id)).toBe(true);
    expect(paid).toEqual([{ uid: UID, id, medals: JACKPOT_SEED }]);
    expect(winDoc(id)?.state).toBe('paid');
    expect(pending()).toBe(0);
    // Asked again, there is nothing more to pay.
    payer.look(UID);
    await settle(browser);
    expect(calls).toEqual(['claim', 'ack', 'claim']);
    expect(medalsIn(browser)).toBe(STARTING + JACKPOT_SEED);
    // The account's copy carries it to the player's other devices, receipt and all.
    const sent = parseLedger(accounts.text(UID));
    expect(sent && balanceOf(sent)).toBe(STARTING + JACKPOT_SEED);
    browser = new FakeBrowser();
  });

  it('is never paid twice and never lost, wherever the browser dies', async () => {
    let browser = new FakeBrowser();
    let accounts = accountsWith(() => browser);
    let id = '';
    /** For each moment the browser died at: whether the next page paid the win (it had not gone in) or found it in. */
    const outcomes: string[] = [];
    const writes = await atEveryWrite(
      async () => {
        id = await floorWithWin();
        browser = new FakeBrowser();
        accounts = accountsWith(() => browser);
        await pageFor(browser, accounts);
        return browser;
      },
      async (dying) => {
        const page = dying.pages[0]!;
        payerOn(page).payer.look(UID);
        await settle(dying);
      },
      async (revived, reached, total) => {
        // The browser is opened again, as it was left, and the player's medals with it: the next page pays what is due.
        browser = revived;
        const page = await pageFor(revived, accounts);
        const again = payerOn(page);
        again.payer.look(UID);
        await settle(revived);
        const where = `died after ${reached} of ${total} writes`;
        expect(page.bank.getState().balance, where).toBe(STARTING + JACKPOT_SEED);
        expect(medalsIn(revived), where).toBe(STARTING + JACKPOT_SEED);
        expect(receiptIn(revived, id), where).toBe(true);
        expect(winDoc(id)?.state, where).toBe('paid');
        expect(pending(), where).toBe(0);
        // Paid on this page only if it had not been before the browser died.
        expect(again.paid.length, where).toBeLessThanOrEqual(1);
        outcomes.push(again.paid.length === 1 ? 'paid by the next page' : 'found in');
      },
    );
    expect(writes).toBeGreaterThan(0);
    // Both happened: the browser died before the medals went in, and after they did but before it was said.
    expect(outcomes).toContain('paid by the next page');
    expect(outcomes).toContain('found in');
    expect(outcomes).toHaveLength(writes + 1);
  });

  it('is not paid again when the network goes after the medals are in and before it is said: the next page finds it in', async () => {
    const id = await floorWithWin();
    const browser = new FakeBrowser();
    const accounts = accountsWith(() => browser);
    const page = await pageFor(browser, accounts);
    let down = false;
    const first = payerOn(page, { down: () => down });
    // The claim goes through; the network goes as the medals go in, so that the ack never leaves.
    const credit = page.bank.credit.bind(page.bank);
    page.bank.credit = (move, keep) =>
      credit(move, keep).then((result) => {
        down = true;
        return result;
      });
    first.payer.look(UID);
    await settle(browser);
    expect(first.calls).toEqual(['claim']);
    expect(medalsIn(browser)).toBe(STARTING + JACKPOT_SEED);
    expect(winDoc(id)?.state).toBe('pending');
    // It is tried again a minute later.
    expect(first.timers.at(-1)?.ms).toBe(60_000);
    page.close();
    // The page is reloaded.
    const reloaded = await pageFor(browser, accounts);
    const second = payerOn(reloaded);
    second.payer.look(UID);
    await settle(browser);
    expect(second.calls).toEqual(['claim', 'ack']);
    expect(second.paid).toEqual([]);
    expect(medalsIn(browser)).toBe(STARTING + JACKPOT_SEED);
    expect(winDoc(id)?.state).toBe('paid');
  });

  it('is paid once when two tabs of one browser both hear of it', async () => {
    const id = await floorWithWin();
    const browser = new FakeBrowser();
    const accounts = accountsWith(() => browser);
    const [one, two] = [await pageFor(browser, accounts), await pageFor(browser, accounts)];
    const [a, b] = [payerOn(one), payerOn(two)];
    a.payer.look(UID);
    b.payer.look(UID);
    await settle(browser);
    expect(medalsIn(browser)).toBe(STARTING + JACKPOT_SEED);
    expect(a.paid.length + b.paid.length).toBe(1);
    expect(winDoc(id)?.state).toBe('paid');
  });

  it('goes to one of two devices at a time: the other waits, and pays it only if the first never comes back', async () => {
    const id = await floorWithWin();
    const phone = new FakeBrowser();
    const laptop = new FakeBrowser();
    const accounts = new FakeAccounts(() => phone.clock);
    accounts.put(UID, serializeLedger(createLedger('acct000001', STARTING)), 'm-start');
    const onPhone = await pageFor(phone, accounts);
    const onLaptop = await pageFor(laptop, accounts);
    // The phone is handed the win, and dies before its medals are in.
    onPhone.bank.credit = () => new Promise(() => undefined);
    const phonePayer = payerOn(onPhone);
    phonePayer.payer.look(UID);
    await settle(phone);
    expect(phonePayer.calls).toEqual(['claim']);
    expect(winDoc(id)?.state).toBe('pending');
    // The laptop is not handed it while the phone may still be paying it.
    const laptopPayer = payerOn(onLaptop);
    laptopPayer.payer.look(UID);
    await settle(laptop);
    expect(laptopPayer.paid).toEqual([]);
    expect(laptopPayer.calls).toEqual(['claim']);
    // Once the phone has had long enough, the laptop pays it.
    vi.setSystemTime(NOON + CLAIM_LEASE_MS);
    laptopPayer.payer.look(UID);
    await settle(laptop);
    expect(laptopPayer.paid).toEqual([{ uid: UID, id, medals: JACKPOT_SEED }]);
    expect(winDoc(id)?.state).toBe('paid');
    expect(onLaptop.bank.getState().balance).toBe(STARTING + JACKPOT_SEED);
  });

  it('is never paid into a guest’s medals: it waits for the player’s own', async () => {
    const id = await floorWithWin();
    const browser = new FakeBrowser();
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(page.bank.getState().owner).toBeNull();
    const { payer, calls, timers } = payerOn(page);
    payer.look(UID);
    await settle(browser);
    expect(calls).toEqual([]);
    expect(timers.at(-1)?.ms).toBe(1_000);
    expect(winDoc(id)?.state).toBe('pending');
  });

  it('is tried again later when the floor cannot be reached', async () => {
    const id = await floorWithWin();
    const browser = new FakeBrowser();
    const page = await pageFor(browser, accountsWith(() => browser));
    let down = true;
    const { payer, timers } = payerOn(page, { down: () => down });
    payer.look(UID);
    await settle(browser);
    expect(timers.at(-1)?.ms).toBe(60_000);
    down = false;
    timers.at(-1)!.run();
    await settle(browser);
    expect(winDoc(id)?.state).toBe('paid');
    expect(medalsIn(browser)).toBe(STARTING + JACKPOT_SEED);
  });

  it('keeps the receipts of the last few days’ wins, and lets older ones go in the same write as the next', async () => {
    const first = await floorWithWin('11111111');
    const browser = new FakeBrowser();
    const page = await pageFor(browser, accountsWith(() => browser));
    payerOn(page).payer.look(UID);
    await settle(browser);
    expect(receiptIn(browser, first)).toBe(true);
    // Two floor days later: a second win, and both receipts are kept.
    vi.setSystemTime(NOON + 2 * 86_400_000);
    const second = await win('22222222');
    payerOn(page).payer.look(UID);
    await settle(browser);
    expect([receiptIn(browser, first), receiptIn(browser, second)]).toEqual([true, true]);
    // Five days after the first: the first is let go of with the third win's medals.
    vi.setSystemTime(NOON + 5 * 86_400_000);
    const third = await win('33333333');
    payerOn(page).payer.look(UID);
    await settle(browser);
    expect([receiptIn(browser, first), receiptIn(browser, second), receiptIn(browser, third)]).toEqual([false, true, true]);
    const ledger = parseLedger(browser.storage.get(ledgerKey(UID)) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids.filter((receipt) => receipt.startsWith('floor-jackpot:'))).toHaveLength(2);
    expect(medalsIn(browser)).toBe(STARTING + 3 * JACKPOT_SEED);
  });
});
