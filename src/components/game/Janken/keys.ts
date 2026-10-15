/**
 * The machine's keys: M puts a medal in; 1, 2 and 3 (or G, C and P, for グー,
 * チョキ and パー) are rock, scissors and paper, in the order their buttons
 * stand; D doubles up and T takes the medals won. Every button can also be
 * reached with Tab and pressed with Enter or Space, as any button can.
 */

import type { Hand } from './engine';

export type KeyAction = { type: 'insert' } | { type: 'hand'; hand: Hand } | { type: 'double' } | { type: 'collect' };

export interface KeyPress {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** Where the key was pressed: a field that takes typing keeps its keys. */
  target?: EventTarget | null;
}

const HAND_KEYS: Readonly<Record<string, Hand>> = { '1': 'gu', g: 'gu', '2': 'choki', c: 'choki', '3': 'pa', p: 'pa' };

/** Whether a key pressed here is the typing's, not the machine's. */
const typing = (target: EventTarget | null | undefined): boolean => {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false;
  const element = target as Element & { isContentEditable?: boolean };
  return element.isContentEditable === true || element.closest('input, textarea, select, [contenteditable="true"]') !== null;
};

/** What a key press does at the machine, or null for a key that is not the machine's. */
export function keyAction(press: KeyPress): KeyAction | null {
  if (press.ctrlKey || press.metaKey || press.altKey || press.repeat || typing(press.target)) return null;
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  if (key in HAND_KEYS) return { type: 'hand', hand: HAND_KEYS[key] };
  if (key === 'm') return { type: 'insert' };
  if (key === 'd') return { type: 'double' };
  if (key === 't') return { type: 'collect' };
  return null;
}
