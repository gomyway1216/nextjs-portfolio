import type { Door, Round } from './engine';

/** One finished hand-played round, as shown in the round history. */
export interface RoundRecord {
  /** 1-based round number within the current record. */
  id: number;
  doorCount: number;
  pickedDoor: Door;
  openedDoors: Door[];
  finalDoor: Door;
  prizeDoor: Door;
}

export function toRecord(id: number, round: Round, finalDoor: Door): RoundRecord {
  return {
    id,
    doorCount: round.doorCount,
    pickedDoor: round.pickedDoor,
    openedDoors: [...round.openedDoors],
    finalDoor,
    prizeDoor: round.prizeDoor,
  };
}

export const recordSwitched = (record: RoundRecord): boolean => record.finalDoor !== record.pickedDoor;

export const recordWon = (record: RoundRecord): boolean => record.finalDoor === record.prizeDoor;

/**
 * What the choice the player did NOT make would have done in this round.
 * - switchWouldWin:   stayed on a goat; switching to the prize door wins.
 * - switchWouldLose:  stayed on the prize; every switch loses.
 * - stayWouldWin:     switched away from the prize.
 * - stayWouldLose:    switched and won; the first pick was a goat.
 * - stayWouldLoseToo: switched from one goat to another (only possible with 4+ doors).
 */
export type WhatIfKind =
  | 'switchWouldWin'
  | 'switchWouldLose'
  | 'stayWouldWin'
  | 'stayWouldLose'
  | 'stayWouldLoseToo';

export interface WhatIf {
  kind: WhatIfKind;
  /** How many doors the player could have switched to in this round. */
  switchOptions: number;
}

export function whatIf(record: RoundRecord): WhatIf {
  const switchOptions = record.doorCount - 1 - record.openedDoors.length;
  const firstPickRight = record.pickedDoor === record.prizeDoor;
  let kind: WhatIfKind;
  if (!recordSwitched(record)) {
    kind = firstPickRight ? 'switchWouldLose' : 'switchWouldWin';
  } else if (firstPickRight) {
    kind = 'stayWouldWin';
  } else {
    kind = recordWon(record) ? 'stayWouldLose' : 'stayWouldLoseToo';
  }
  return { kind, switchOptions };
}

export interface HistorySummary {
  rounds: number;
  /** Rounds whose FIRST pick was the prize door — exactly the rounds staying wins. */
  firstPickRight: number;
  /** Rounds whose first pick was a goat — the prize was behind a door the player could switch to. */
  firstPickWrong: number;
}

export function summarizeHistory(records: readonly RoundRecord[]): HistorySummary {
  let firstPickRight = 0;
  for (const r of records) {
    if (r.pickedDoor === r.prizeDoor) firstPickRight++;
  }
  return { rounds: records.length, firstPickRight, firstPickWrong: records.length - firstPickRight };
}

/** The newest `limit` records, newest first. */
export function latestRecords(records: readonly RoundRecord[], limit: number): RoundRecord[] {
  return records.slice(Math.max(0, records.length - limit)).reverse();
}
