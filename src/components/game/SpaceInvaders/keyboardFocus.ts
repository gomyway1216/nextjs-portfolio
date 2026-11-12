/**
 * Which key presses belong to the focused control rather than to the game.
 *
 * The game listens for Space on the window (fire / start). A button the player
 * reached with the keyboard must still be pressed by Space or Enter, so those
 * presses are left to it. A button that only has focus because it was clicked
 * or tapped (Pause, then back to playing) does not take Space away from the
 * cannon: the caller remembers which control the pointer put the focus on and
 * passes it as `pointerFocused`.
 */

export const CONTROL_SELECTOR =
  'button, a[href], summary, [role="button"], [role="radio"], [role="link"], [role="tab"]';

export function isActivationKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar' || key === 'Enter';
}

interface ClosestTarget {
  closest(selector: string): unknown;
}

function hasClosest(target: unknown): target is ClosestTarget {
  return typeof target === 'object' && target !== null && typeof (target as ClosestTarget).closest === 'function';
}

/** The button / link / radio the event target is (or is inside), if any. */
export function controlOf(target: unknown): unknown {
  return hasClosest(target) ? target.closest(CONTROL_SELECTOR) ?? null : null;
}

export function isKeyboardFocusedControl(target: unknown, key: string, pointerFocused: unknown = null): boolean {
  if (!isActivationKey(key)) return false;
  const control = controlOf(target);
  return control !== null && control !== pointerFocused;
}
