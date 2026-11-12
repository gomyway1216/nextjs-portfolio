/**
 * Space Invaders — which key presses belong to a focused control, and the lobby's strings.
 * (No jsdom in this repo: the targets are stand-ins with the one method the helper uses.)
 */

import { describe, expect, it } from 'vitest';

import { getSpaceInvadersStrings } from '@/components/game/SpaceInvaders/i18n';
import {
  CONTROL_SELECTOR,
  controlOf,
  isActivationKey,
  isKeyboardFocusedControl,
} from '@/components/game/SpaceInvaders/keyboardFocus';

/** An element inside (or being) `control`, a button unless said to be a link; `closest` answers by the selector asked. */
const target = (control: unknown, kind: 'button' | 'link' = 'button') => ({
  closest: (selector: string) => {
    const asked = selector.split(',').map((part) => part.trim());
    return asked.includes(kind === 'link' ? 'a[href]' : 'button') ? control : null;
  },
});

describe('isActivationKey', () => {
  it('is Space and Enter only', () => {
    expect(isActivationKey(' ')).toBe(true);
    expect(isActivationKey('Enter')).toBe(true);
    expect(isActivationKey('ArrowUp')).toBe(false);
    expect(isActivationKey('w')).toBe(false);
    expect(isActivationKey('p')).toBe(false);
  });
});

describe('isKeyboardFocusedControl', () => {
  const button = { id: 'pause' };

  it('leaves Space and Enter to a button the keyboard focus is on', () => {
    expect(isKeyboardFocusedControl(target(button), ' ')).toBe(true);
    expect(isKeyboardFocusedControl(target(button), 'Enter')).toBe(true);
  });

  it('also when the event target is something inside the button (its icon)', () => {
    const icon = target(button);
    expect(controlOf(icon)).toBe(button);
    expect(isKeyboardFocusedControl(icon, ' ', null)).toBe(true);
  });

  it('keeps Space for the cannon when the button only has focus because it was clicked', () => {
    expect(isKeyboardFocusedControl(target(button), ' ', button)).toBe(false);
    // …but another control, reached with Tab since, gets its key.
    expect(isKeyboardFocusedControl(target({ id: 'other' }), ' ', button)).toBe(true);
  });

  it('leaves Enter to a focused link, but not Space (which would only scroll the page)', () => {
    const link = { id: 'games' };
    expect(CONTROL_SELECTOR.split(',').map((part) => part.trim())).toContain('a[href]');
    expect(controlOf(target(link, 'link'))).toBe(link);
    expect(isKeyboardFocusedControl(target(link, 'link'), 'Enter')).toBe(true);
    expect(isKeyboardFocusedControl(target(link, 'link'), ' ')).toBe(false);
  });

  it('never takes the movement, fire-by-arrow or pause keys', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'a', 'd', 'w', 'p', 'Escape']) {
      expect(isKeyboardFocusedControl(target(button), key)).toBe(false);
    }
  });

  it('is false when the focus is on no control (the page body, the canvas, the window)', () => {
    expect(isKeyboardFocusedControl(target(null), ' ')).toBe(false);
    expect(isKeyboardFocusedControl(null, ' ')).toBe(false);
    expect(isKeyboardFocusedControl({}, 'Enter')).toBe(false);
  });
});

describe('multiplayer lobby strings', () => {
  const en = getSpaceInvadersStrings('en').lobby;
  const ja = getSpaceInvadersStrings('ja').lobby;

  it('has every lobby string in both languages, and none of the Japanese ones left in English', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (key === 'errors') continue;
      expect(ja[key], key).toBeTruthy();
      expect(ja[key], key).not.toBe(en[key]);
      expect(ja[key] as string, key).not.toMatch(/[A-Za-z]{3,}/);
    }
  });

  it("translates the lobby's own error messages into Japanese", () => {
    for (const message of ['Room was closed', 'Failed to create room', 'Failed to join room', 'Network error']) {
      expect(ja.errors[message], message).toBeTruthy();
    }
  });
});
