/**
 * What the medal floor shows, as it goes over the wire. Nothing in it says who
 * a player is beyond the name they chose (or their four digits): no account id,
 * no email. The account id stays on the server.
 */

import type { FloorGame } from './games';
import type { JackpotPrize, JackpotWinOwned, FloorJackpotView } from './jackpot';
import type { PeriodKind } from './periods';

/** A moment on the floor: somebody won big at a machine. */
export interface FloorFeedEntry {
  /** The moment's number, counting up across the floor. */
  id: number;
  /** The name the player chose, or null while they go by their four digits. */
  name: string | null;
  tag: string;
  game: FloorGame;
  /** A named win (`jackpot`, `seven3`, `double-up` …), or null for a plain big win. */
  label: string | null;
  medals: number;
  /** When the server heard of it, ms since the epoch. */
  at: number;
}

/** A line on a ranking board. */
export interface FloorRow {
  rank: number;
  name: string | null;
  tag: string;
  score: number;
  /** When the score was last raised, ms since the epoch. */
  at: number;
  /** For the owner only: which player's line it is (an opaque id, not the account's) and whether it is hidden. */
  pid?: string;
  hidden?: boolean;
  /** For the owner only: the player is blocked (every line of theirs is hidden). */
  blocked?: boolean;
}

/** A board's name: medals won on every machine, or the biggest single win at one machine. */
export type FloorBoard = 'won' | `best:${FloorGame}`;

export interface FloorBoards {
  kind: PeriodKind;
  key: string;
  start: number;
  end: number;
  won: FloorRow[];
  best: Partial<Record<FloorGame, FloorRow[]>>;
}

export interface FloorSummary {
  /** The server's clock as it answered. */
  now: number;
  /** False when the floor's store could not be reached: everything is empty then. */
  available: boolean;
  feed: FloorFeedEntry[];
  day: FloorBoards;
  week: FloorBoards;
  /** For the owner only: the floor jackpot, with its last wins as the owner sees them. */
  jackpot?: FloorJackpotView & { owned: JackpotWinOwned[] };
}

/** A signed-in player's own place on the floor. */
export interface FloorMe {
  /** On the floor: their wins are counted and shown. Off until they join. */
  joined: boolean;
  name: string | null;
  /** Their four digits, once they have joined once. */
  tag: string | null;
  /** The owner has taken them off the floor. */
  blocked: boolean;
  /** Floor jackpots they have won that are still to go into their medals: there only when there are any. */
  due?: number;
}

/**
 * What a browser tells the floor about one machine: the medals it paid since it last said, the biggest single win among
 * them, and the medals played on it since (for the floor jackpot).
 */
export interface FloorReport {
  game: FloorGame;
  won: number;
  played?: number;
  best?: number;
  moment?: { medals: number; label?: string };
}

export interface FloorReportResult {
  /** The medals won that were counted (the rest were past what the floor believes). */
  counted: number;
  /** Whether the biggest win was taken onto the boards. */
  best: boolean;
  /** Whether the moment was shown to the floor. */
  shown: boolean;
  /** For a report of medals played: how many of them took part in the floor jackpot. */
  played?: number;
  /** The floor jackpot, won with this report: it is the player's, to go into their medals. */
  jackpot?: JackpotPrize;
}
