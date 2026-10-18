import type { BrowserContext } from '@playwright/test';

import type { FloorJackpotView } from '../../src/lib/medalFloor/jackpot';
import { emptyFloor } from './layoutShift';

/**
 * The floor's API answered at once, for every page of `context`: a quiet floor and its jackpot, with the live database
 * and the sign-in cut off. Nothing reaches a real server.
 *
 * Why a spec that is not about the floor needs it: every machine page and the medal center ask the floor's API, and
 * where the store cannot be reached (CI's server has no Google credentials) each of those requests waits out the
 * server's 6 s read timeout. A browser keeps at most six connections to one HTTP/1.1 server, so two or three of them
 * held for 6 s, with the page's link prefetches queued behind them, can hold up the next navigation's request for
 * longer than an expectation waits: a click from the hub to a machine then "did not navigate" (video-poker.spec.ts and
 * medal-refill-out.spec.ts, failing or flaky on CI). Production speaks HTTP/2 and reaches its store, so a player never
 * meets it.
 */
export async function quietFloor(context: BrowserContext): Promise<void> {
  await context.routeWebSocket(/firebaseio\.com/, (socket) => socket.close());
  await context.route(/firebaseio\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com/, (route) => route.abort());
  await context.route(/\/api\/game\/medal-floor(\?|$)/, (route) => route.fulfill({ json: emptyFloor() }));
  await context.route(/\/api\/game\/medal-floor\/jackpot(\?|$)/, (route) => {
    const jackpot: FloorJackpotView = { now: Date.now(), available: true, amount: 1_000, seq: 1, v: 7, wins: [] };
    return route.fulfill({ json: jackpot });
  });
}
