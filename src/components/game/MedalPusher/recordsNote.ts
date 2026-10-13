/**
 * Which note tells the player where the record book is kept.
 *
 * As for the machine (savedNote.ts) there are two places, the account and
 * this device, and the note speaks of both. So there is one for every pairing
 * of what is true of the account with whether this device keeps the book: a
 * note never says that this device keeps a copy when it does not, wherever
 * else the book is.
 */

import type { RecordsState } from './recordsStore';
import type { RecordStrings } from './recordsStrings';

/** The strings that are such notes. */
export type KeepNote = Extract<
  keyof RecordStrings,
  | 'keptNote'
  | 'notKeptNote'
  | 'accountKeptNote'
  | 'accountNotKeptNote'
  | 'offlineKeptNote'
  | 'offlineNotKeptNote'
  | 'unreadableKeptNote'
  | 'unreadableNotKeptNote'
  | 'checkingKeptNote'
  | 'checkingNotKeptNote'
>;

const NOTES: Record<RecordsState['where'], { kept: KeepNote; notKept: KeepNote }> = {
  // A guest's book: this device is all there is.
  device: { kept: 'keptNote', notKept: 'notKeptNote' },
  account: { kept: 'accountKeptNote', notKept: 'accountNotKeptNote' },
  offline: { kept: 'offlineKeptNote', notKept: 'offlineNotKeptNote' },
  unreadable: { kept: 'unreadableKeptNote', notKept: 'unreadableNotKeptNote' },
  checking: { kept: 'checkingKeptNote', notKept: 'checkingNotKeptNote' },
};

export function keepNoteFor({ where, kept }: Pick<RecordsState, 'where' | 'kept'>): KeepNote {
  const notes = NOTES[where];
  return kept ? notes.kept : notes.notKept;
}
