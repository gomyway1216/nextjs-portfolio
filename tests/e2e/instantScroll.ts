import type { BrowserContext } from '@playwright/test';

/**
 * Makes every page of `context` scroll at once instead of gliding, for specs that press one control after another on
 * a page taller than the window.
 *
 * The site scrolls smoothly: `scroll-behavior: smooth` on the root (Bootstrap's reboot), unless the device asks for
 * less motion. In WebKit and Firefox the video poker page was seen gliding while Playwright pressed a card: the press
 * went down on the card, the page moved on, and the release 10 ms later came up on what was under the pointer by then.
 * A press that comes up elsewhere is no click, so the card was not held, and a full house drew to two pair (about one
 * run in a hundred, in both engines; not seen in Chromium). With the glide gone the page is where it was when a press
 * was aimed, and the specs that use this check nothing that moves with it.
 */
export async function instantScroll(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('html { scroll-behavior: auto !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}
