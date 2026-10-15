'use client';

/**
 * The page's one craps table, in the browser: `medalTable.ts` given the
 * medal center's bank, this device's storage, and what the page says about
 * whether it may play (its seat at the medal center holds the card, the
 * medals have been read, and the site knows who is playing). Made the first
 * time it is asked for, which is never on the server.
 */

import { bank as medalBank, type Seat } from '../MedalCenter/bank';
import { FRESH_TABLE, createTable, purseOf, type MedalTable, type Table } from './medalTable';

let seat: Seat | null = null;
let settled = true;
let theTable: MedalTable | null = null;

/** Whether this page may play the table now. */
const mayPlay = (): boolean => {
  const state = medalBank().getState();
  return settled && state.loaded && state.where !== 'checking' && (seat?.holding() ?? false);
};

export const crapsTable = (): MedalTable =>
  (theTable ??= createTable(
    purseOf(medalBank()),
    {
      read: (key) => window.localStorage.getItem(key),
      write: (key, text) => window.localStorage.setItem(key, text),
      remove: (key) => window.localStorage.removeItem(key),
    },
    mayPlay,
  ));

/** The table's seat at the medal center, while the table is on the page. */
export const seatTable = (mine: Seat | null): void => {
  seat = mine;
};

/** The player has come back to this table from a machine in another tab: the medals are asked for here again. */
export const playTableHere = (): void => {
  seat?.play();
};

/** Whether the site has found out who is playing. Until it has, no medal is played. */
export const settleTable = (known: boolean): void => {
  settled = known;
};

export const mayPlayTable = mayPlay;

const subscribe = (listener: () => void): (() => void) => crapsTable().subscribe(listener);
const snapshot = (): Table => crapsTable().table();
const serverSnapshot = (): Table => FRESH_TABLE;
export const tableStore = { subscribe, snapshot, serverSnapshot } as const;
