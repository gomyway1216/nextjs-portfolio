/**
 * Pays a player's floor jackpots into their medals: the one way a win the
 * server drew becomes medals in the player's browser.
 *
 * The server keeps every win as pending until it is told the win is in the
 * player's medals. A page whose bank is the player's (the hub, or any machine)
 * asks the server for them (`claim`, saying which device's medals they are
 * for), puts each into the medals under its receipt, `floor-jackpot:<id>:pay`,
 * with the card (bank.ts `credit`), and only then tells the server it is paid
 * (`ack`). So:
 *
 * - A page that dies before the medals are in leaves the win pending: the next
 *   page pays it.
 * - A page that dies after the medals are in and before it says so leaves the
 *   receipt in the medals: the next page finds the win paid already (`already`)
 *   and says so. Never twice.
 * - Two tabs of one browser are kept apart by the card and the receipt; two
 *   devices by the server, which hands a win to one device at a time
 *   (CLAIM_LEASE_MS in jackpot.ts).
 * - The receipts of wins paid are kept for RECEIPT_KEEP_DAYS, so that a page
 *   that heard of a win before it was paid finds it paid; older ones are let go
 *   of in the same write as the next win's medals.
 *
 * It runs when it is told there may be something to pay: a report that won,
 * the floor saying a player has wins due, or a page opening for a player this
 * device knows is on the floor.
 */

import { periodAt } from '@/lib/medalFloor/periods';
import { JACKPOT_GAME, JACKPOT_PAY_STEP, RECEIPT_KEEP_DAYS, compactDay, isWinId, winDay, type JackpotPrize } from '@/lib/medalFloor/jackpot';
import { FLOOR_API } from './api';
import type { FloorAccount } from './pageAccount';

/** The medals as the payer needs them: whose they are, which device keeps this copy, and a way to pay into them. */
export interface PayerBank {
  table(): { owner: string | null; device: string | null } | null;
  credit(move: { game: string; round: string; step: string; medals: number }, keep: (round: string) => boolean): Promise<'applied' | 'already' | null>;
}

export interface PayerDeps {
  account(): FloorAccount | null;
  fetch: typeof fetch;
  bank: PayerBank;
  now(): number;
  later(run: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

/** A floor jackpot just paid into the medals on this page. */
export interface JackpotPaid {
  uid: string;
  id: string;
  medals: number;
}

/** While the medals on the page are not the player's yet (still being read), they are looked at again this often, this many times. */
export const BANK_WAIT_MS = 1_000;
const BANK_TRIES = 30;
/** After the floor or the medals could not be reached, it is tried again this much later. */
export const RETRY_MS = 60_000;
const DAY_MS = 86_400_000;

const prizesFrom = (value: unknown): JackpotPrize[] => {
  const wins = (value as { wins?: unknown } | null)?.wins;
  if (!Array.isArray(wins)) return [];
  return wins.flatMap((raw) => {
    const win = raw as Partial<JackpotPrize> | null;
    return win && isWinId(win.id) && Number.isSafeInteger(win.medals) && (win.medals ?? 0) > 0 && typeof win.at === 'number' ? [{ id: win.id, medals: win.medals!, at: win.at }] : [];
  });
};

export function createJackpotPayer(deps: PayerDeps) {
  /** The account that may have wins to be paid; null while nobody has said so. */
  let wanted: string | null = null;
  let running = false;
  let again = false;
  let timer: unknown = null;
  let bankTries = 0;
  const hearers = new Set<(paid: JackpotPaid) => void>();

  const later = (ms: number) => {
    if (timer !== null) return;
    timer = deps.later(() => {
      timer = null;
      void run();
    }, ms);
  };

  /** The receipts still needed: those of wins of the last few floor days. */
  const keep = (round: string): boolean => {
    const day = winDay(round);
    return day !== null && day >= compactDay(periodAt('day', deps.now() - RECEIPT_KEEP_DAYS * DAY_MS).key);
  };

  const post = async (account: FloorAccount, body: Record<string, unknown>): Promise<Response> =>
    deps.fetch(`${FLOOR_API}/jackpot/wins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await account.token()}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

  /** One pass: the wins this device is handed, each paid and then said to be paid. Returns whether it is done. */
  async function pass(): Promise<'done' | 'bank' | 'retry'> {
    const account = deps.account();
    if (!account || account.uid !== wanted) return 'done';
    const table = deps.bank.table();
    // The medals on the page are not this player's yet (still being read, or a guest's while the account's are asked for).
    if (!table || table.owner !== account.uid || !table.device) return 'bank';
    let prizes: JackpotPrize[];
    try {
      const response = await post(account, { action: 'claim', device: table.device });
      if (response.status === 401 || response.status === 403) return 'done';
      if (!response.ok) return 'retry';
      prizes = prizesFrom(await response.json());
    } catch {
      return 'retry';
    }
    for (const prize of prizes) {
      // Somebody else signed in, or other medals on the table, while it was asked: none of this is for them.
      const now = deps.bank.table();
      if (deps.account()?.uid !== account.uid || !now || now.owner !== account.uid || now.device !== table.device) return 'bank';
      const paid = await deps.bank.credit({ game: JACKPOT_GAME, round: prize.id, step: JACKPOT_PAY_STEP, medals: prize.medals }, keep);
      if (paid === null) return 'retry';
      if (paid === 'applied') for (const hearer of [...hearers]) hearer({ uid: account.uid, id: prize.id, medals: prize.medals });
      try {
        const response = await post(account, { action: 'ack', id: prize.id });
        // Refused for good (not theirs, not there): nothing more to say about it. Anything else is said again later.
        if (!response.ok && response.status !== 404 && response.status !== 400) return 'retry';
      } catch {
        return 'retry';
      }
    }
    return 'done';
  }

  async function run(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const result = await pass();
        if (result === 'bank') {
          bankTries += 1;
          if (bankTries <= BANK_TRIES) later(BANK_WAIT_MS);
        } else {
          bankTries = 0;
          if (result === 'retry') later(RETRY_MS);
        }
      } while (again);
    } finally {
      running = false;
    }
  }

  return {
    /** There may be floor jackpots of this account's to pay: they are asked for now, and paid. */
    look(uid: string): void {
      if (wanted !== uid) bankTries = 0;
      wanted = uid;
      if (timer !== null) {
        deps.cancel(timer);
        timer = null;
      }
      void run();
    },

    /** Hears every floor jackpot paid into the medals on this page. */
    onPaid(hearer: (paid: JackpotPaid) => void): () => void {
      hearers.add(hearer);
      return () => {
        hearers.delete(hearer);
      };
    },
  };
}

export type JackpotPayer = ReturnType<typeof createJackpotPayer>;
