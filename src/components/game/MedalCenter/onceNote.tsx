'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * The one-time notes on the floor's machines ("this table plays with your medals now"), drawn so that they never move
 * the page.
 *
 * Whether a note has been read is kept in this device's storage, which the server cannot see. A note the server left
 * out, put in by the browser as the page woke up, pushed the whole machine down by the note's height: a layout shift
 * of 0.14–0.23 on a phone, on every first visit to every table. So every note is in the server's drawing, and the
 * device's storage is asked before the page is first painted: the note's gate (`NoteGate`, put just before the note)
 * is a script the browser runs as it reads the page in, which hides the note where it has been read. The page's own
 * state then takes a hidden note out, which moves nothing, and leaves a note still to be read where the server put it.
 */

/** The attribute a note's outermost element carries, with the note's name, for its gate to find it by. */
export const NOTE_ATTRIBUTE = 'data-once-note';

/** The attributes for a note's outermost element. */
export const noteAttributes = (name: string): { 'data-once-note': string } => ({ [NOTE_ATTRIBUTE]: name }) as { 'data-once-note': string };

export interface NoteGateProps {
  /** The note's name, as its element's `data-once-note` has it. */
  name: string;
  /** Where this device keeps that the note has been read. */
  storageKey: string;
  /** What is kept there once it has been: when left out, anything at all. */
  readValue?: string;
}

/** The gate's script: where the note has been read, a rule that hides it, in the page's head before it is painted. */
export function noteGateScript({ name, storageKey, readValue }: NoteGateProps): string {
  const read = readValue === undefined ? 'v!==null' : `v===${JSON.stringify(readValue)}`;
  const rule = `[${NOTE_ATTRIBUTE}=${JSON.stringify(name)}]{display:none!important}`;
  const code = `(function(){try{var v=window.localStorage.getItem(${JSON.stringify(storageKey)});if(${read}){var s=document.createElement("style");s.textContent=${JSON.stringify(rule)};document.head.appendChild(s)}}catch(e){}})()`;
  // Nothing in it can end the script element early.
  return code.replace(/</g, '\\u003c');
}

const never = () => () => {};
/** True while the page is drawn as the server drew it: on the server, and in the browser until the page has woken up. */
export const useServerDrawing = (): boolean =>
  useSyncExternalStore(
    never,
    () => false,
    () => true,
  );

/**
 * The note's gate, in the server's drawing only. A script put in by the browser is never run, so a page drawn in the
 * browser (one reached by a link) has no gate and needs none: it draws the note from the device's storage at once.
 */
export function NoteGate(props: NoteGateProps) {
  const serverDrawing = useServerDrawing();
  if (!serverDrawing) return null;
  return <script dangerouslySetInnerHTML={{ __html: noteGateScript(props) }} />;
}

export interface OnceNoteOptions extends NoteGateProps {
  /** What is written down once the note has been read; `readValue`, or '1', when left out. */
  writeValue?: string;
  /**
   * Written down as read as soon as it is shown, the player being told once whether or not they put it away; it stays
   * on the page until they do. Otherwise it is written down when it is put away.
   */
  readWhenShown?: boolean;
}

export interface OnceNote {
  /** Whether the note is shown: always in the server's drawing; in the browser while it is still to be read on this device and has not been put away. */
  useShown: () => boolean;
  /** Takes the note away from the page, and writes down on this device that it has been read. */
  putAway: () => void;
  /** Whether the note is shown, outside React: in the browser only. */
  due: () => boolean;
}

/**
 * A one-time note's state, for a page: whether it is still to be read is asked of the device once, the first time the
 * page asks, and kept for the page's life, so that a note written down as read as soon as it is shown stays shown.
 * A device whose storage cannot be read shows the note each time: it cannot be known to have been read.
 */
export function createOnceNote({ storageKey, readValue, writeValue = readValue ?? '1', readWhenShown = false }: OnceNoteOptions): OnceNote {
  let state: 'unknown' | 'due' | 'read' = 'unknown';
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const write = () => {
    try {
      window.localStorage.setItem(storageKey, writeValue);
    } catch {
      // Read on this page; shown again on the next.
    }
  };
  const due = (): boolean => {
    if (state === 'unknown') {
      let read = false;
      try {
        const value = window.localStorage.getItem(storageKey);
        read = readValue === undefined ? value !== null : value === readValue;
      } catch {
        read = false;
      }
      state = read ? 'read' : 'due';
    }
    return state === 'due';
  };
  const putAway = () => {
    if (state === 'read') return;
    state = 'read';
    write();
    for (const listener of [...listeners]) listener();
  };
  const shownOnServer = () => true;
  const useShown = (): boolean => {
    const shown = useSyncExternalStore(subscribe, due, shownOnServer);
    useEffect(() => {
      // Told once: written down as read the first time it is shown in the browser.
      if (readWhenShown && shown && due()) write();
    }, [shown]);
    return shown;
  };
  return { useShown, putAway, due };
}
