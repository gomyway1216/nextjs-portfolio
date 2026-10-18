import type { Page } from '@playwright/test';

/**
 * Listens for the errors a page throws and nobody catches, as `page.on('pageerror')` does, less one report that is
 * no error of the page's.
 *
 * WebKit writes "Fetch API cannot load <address> due to access control checks." to the console whenever it refuses
 * a fetch, whether the page catches the refusal or not, and Playwright's WebKit files that line as an error thrown by
 * the page. It refuses the fetches Next.js's router starts to prefetch the page's links while the document is being
 * replaced, by a reload or a `goto`: the router catches them, and a player sees nothing. Chromium and Firefox say
 * nothing of the same fetches. A fetch to the page's own origin has no access control to fail otherwise, so only
 * that line, for an address of the page's own origin, is left out; everything else is passed on.
 */
export function onPageError(page: Page, listener: (error: Error) => void): void {
  page.on('pageerror', (error) => {
    if (!refusedOwnFetch(page, error)) listener(error);
  });
}

const REFUSED = /^Fetch API cannot load (\S+) due to access control checks\.$/;

/** The address of a fetch WebKit says it refused, if this is that line, and whether it is of the page's own origin. */
function refusedOwnFetch(page: Page, error: Error): boolean {
  // The whole line is the first line of the stack. Playwright's WebKit also splits it at its first colon, into the
  // name "Fetch API cannot load https" and the message "/host/path… due to access control checks.".
  const whole = REFUSED.exec((error.stack ?? '').split('\n')[0].trim());
  const scheme = /^Fetch API cannot load (https?)$/.exec(error.name);
  const rest = /^\/*(\S+) due to access control checks\.$/.exec(error.message);
  const address = whole?.[1] ?? (scheme && rest ? `${scheme[1]}://${rest[1]}` : null);
  if (!address) return false;
  try {
    return new URL(address).origin === new URL(page.url()).origin;
  } catch {
    return false;
  }
}
