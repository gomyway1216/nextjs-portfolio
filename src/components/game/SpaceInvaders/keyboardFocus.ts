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

/** What Space presses. Not a link: Space on a link only scrolls the page, so the game keeps that one. */
const SPACE_CONTROLS = 'button, summary, [role="button"], [role="radio"], [role="tab"]';

/** What Enter presses: the same, and links. */
export const CONTROL_SELECTOR = `${SPACE_CONTROLS}, a[href], [role="link"]`;

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
export function controlOf(target: unknown, selector: string = CONTROL_SELECTOR): unknown {
  return hasClosest(target) ? target.closest(selector) ?? null : null;
}

export function isKeyboardFocusedControl(target: unknown, key: string, pointerFocused: unknown = null): boolean {
  if (!isActivationKey(key)) return false;
  const control = controlOf(target, key === 'Enter' ? CONTROL_SELECTOR : SPACE_CONTROLS);
  return control !== null && control !== pointerFocused;
}
