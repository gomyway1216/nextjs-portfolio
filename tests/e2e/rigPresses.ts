import type { Page } from '@playwright/test';

/**
 * Queues numbers for `Math.random`, served only while the page handles a press: a pointer press, a click or a key.
 * Any other caller meanwhile gets real random numbers, and the queue is left for the press.
 *
 * A machine draws its cards inside the press's handler, so a test can choose them by queueing the numbers the draw
 * turns into those cards. But the page has other callers. On the live site the Realtime Database's client draws a
 * number of its own as it starts, a moment after the machine is playable, for the floor's live strip. A plain queue
 * gave that caller the first number, every card after it moved one along, and the hand was not the one the test
 * meant to deal.
 *
 * Armed in the window's capture phase, before any handler of the press; disarmed in the window's bubble phase by a
 * listener added as the press arrives, so after every handler of it (a page's own listener on the window may have
 * been added after the rig was, as a React effect adds one again whenever what it uses changes; a disarming listener
 * added only once, with the rig, ran before such a listener, and its draw got a real number), and on the next task in
 * case a handler stopped the press there. Once the queue is used up, every caller gets real random numbers again.
 */
export async function rigPresses(page: Page, numbers: number[]): Promise<void> {
  await page.evaluate((queue) => {
    const w = window as unknown as { __rigRandom?: () => number; __rigQueue?: number[]; __rigArmed?: boolean };
    w.__rigQueue = [...queue];
    if (w.__rigRandom) return;
    w.__rigRandom = Math.random;
    const disarm = () => {
      w.__rigArmed = false;
    };
    for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) {
      window.addEventListener(
        type,
        () => {
          w.__rigArmed = true;
          // Added now, it is the last of the window's listeners for this press's bubble phase.
          window.addEventListener(type, disarm, { once: true });
          setTimeout(disarm, 0);
        },
        true,
      );
    }
    Math.random = () => (w.__rigArmed && w.__rigQueue!.length > 0 ? w.__rigQueue!.shift()! : w.__rigRandom!());
  }, numbers);
}
