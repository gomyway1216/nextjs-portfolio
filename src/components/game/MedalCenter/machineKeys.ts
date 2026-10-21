'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * A machine's keys on a desktop, as Calico Janken has its own (Janken/keys.ts):
 * while the machine's tab is shown, a key press anywhere on the page plays it,
 * unless it is typing (a field, a select), it comes with a modifier, it is held
 * down and repeating, a dialog is open over the page, or it is Space or Enter
 * on a button or a link, which press that button or follow that link as they
 * always do. Every control can also be reached with Tab, as any button can.
 */

/** Whether a key pressed here belongs to typing, not to the machine. */
export function typingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false;
  const element = target as Element & { isContentEditable?: boolean };
  return element.isContentEditable === true || element.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/** Whether Space or Enter pressed here already presses something: a button, a link, a tab. */
export function pressTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false;
  return (target as Element).closest('button, a[href], [role="button"], [role="tab"], [role="radio"], summary, label') !== null;
}

/** The key as the machines name it: a letter in lower case, ' ' for Space, and the name of any other key. */
export const keyName = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

export interface MachineKey {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  target?: EventTarget | null;
}

/** Whether a press is the machine's to act on at all (before the machine says whether the key is one of its own). */
export function forTheMachine(press: MachineKey): boolean {
  if (press.ctrlKey || press.metaKey || press.altKey || press.repeat || press.isComposing) return false;
  if (typingTarget(press.target)) return false;
  const key = keyName(press.key);
  if ((key === ' ' || key === 'Enter') && pressTarget(press.target)) return false;
  return true;
}

/**
 * Listens for the machine's keys while `active`. `onKey` is told the key's
 * name and says whether it was the machine's; a key that was is kept from the
 * page (Space does not scroll it), and so are its repeats for as long as it is
 * held down: the machine does nothing more with them, but a held Space would
 * otherwise scroll the page a screen at every repeat (the Smart Ball's plunger
 * is drawn by holding Space).
 */
export function useMachineKeys(active: boolean, onKey: (key: string) => boolean): void {
  // Brought up to date as the machine is drawn (a layout effect), not after the paint: a key pressed the moment a
  // button is drawn enabled otherwise went to the handler of the render before, which still saw that button off.
  const handler = useRef(onKey);
  useLayoutEffect(() => {
    handler.current = onKey;
  });
  useEffect(() => {
    if (!active) return;
    /** The key the machine took as it went down, while it is still held. */
    let held: string | null = null;
    const listen = (event: KeyboardEvent) => {
      const key = keyName(event.key);
      if (event.repeat) {
        if (key === held) event.preventDefault();
        return;
      }
      held = null;
      if (event.defaultPrevented || !forTheMachine(event)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return;
      if (handler.current(key)) {
        event.preventDefault();
        held = key;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (keyName(event.key) === held) held = null;
    };
    window.addEventListener('keydown', listen);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', listen);
      window.removeEventListener('keyup', up);
    };
  }, [active]);
}
