/**
 * Which note tells the player where the machine is kept.
 *
 * There are two places, the account and this device, and the note speaks of
 * both. So there is one for every pairing of what is true of the account
 * with whether the last write to this device took: a note never says that
 * this device keeps a copy when it does not, wherever else the machine is.
 */

import type { Status } from './account';
import type { PusherStrings } from './i18n';

/** The strings that are such notes. */
export type SavedNote = Extract<
  keyof PusherStrings,
  | 'savedNote'
  | 'unsavedNote'
  | 'accountNote'
  | 'accountUnsavedNote'
  | 'offlineNote'
  | 'offlineUnsavedNote'
  | 'unreadableNote'
  | 'unreadableUnsavedNote'
  | 'checkingNote'
  | 'checkingUnsavedNote'
>;

const NOTES: Record<Status['where'], { kept: SavedNote; notKept: SavedNote }> = {
  // A guest's machine: this device is all there is.
  device: { kept: 'savedNote', notKept: 'unsavedNote' },
  account: { kept: 'accountNote', notKept: 'accountUnsavedNote' },
  offline: { kept: 'offlineNote', notKept: 'offlineUnsavedNote' },
  unreadable: { kept: 'unreadableNote', notKept: 'unreadableUnsavedNote' },
  checking: { kept: 'checkingNote', notKept: 'checkingUnsavedNote' },
};

export function savedNoteFor(status: Status): SavedNote {
  const notes = NOTES[status.where];
  return status.kept ? notes.kept : notes.notKept;
}
