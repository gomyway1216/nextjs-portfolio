import { test, expect } from '@playwright/test';

// Cross-origin isolation (COOP/COEP) is enabled on /games/shogi to unlock
// SharedArrayBuffer + the multi-thread (Lazy SMP) engine search.
//
// The historical "AI Thinking… forever" freeze was NOT a Lazy SMP deadlock:
// under COEP require-corp the dedicated-Worker script chunks
// (/_next/static/chunks/turbopack-worker-*.js) were themselves blocked
// (net::ERR_BLOCKED_BY_RESPONSE) because they lacked their own COEP header, so
// the AI worker never booted and every search hung — even single-thread. The
// fix adds COEP to /_next/* (see next.config.ts). These tests pin: isolation is
// on, the worker chunks carry COEP, the AI actually answers (no freeze), and
// isolation stays scoped to /games/shogi.

test('/games/shogi is cross-origin isolated with SharedArrayBuffer', async ({ page }) => {
  const response = await page.goto('/games/shogi');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(response!.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response!.headers()['cross-origin-embedder-policy']).toBe('require-corp');

  const env = await page.evaluate(() => ({
    isolated: self.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  }));
  expect(env.isolated).toBe(true);
  expect(env.sharedArrayBuffer).toBe(true);

  await expect(page.getByRole('button', { name: /Start Game/i }).first()).toBeVisible();
});

test('worker script chunks carry COEP so the AI worker can boot (freeze regression)', async ({ request }) => {
  // A dedicated Worker created from a require-corp document is blocked unless its
  // OWN script response asserts COEP. Pin that /_next assets carry it, so the AI
  // worker boots instead of silently failing to load (the historical freeze).
  const res = await request.get('/games/shogi');
  const html = await res.text();
  const m = html.match(/\/_next\/static\/[^"']+\.js/);
  expect(m, 'expected at least one /_next/static/*.js reference').not.toBeNull();
  const chunk = await request.get(m![0]);
  expect(chunk.status()).toBe(200);
  expect(chunk.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(chunk.headers()['cross-origin-resource-policy']).toBe('same-origin');
});

test('the AI answers a move under isolation (no freeze)', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/games/shogi');
  // Start a normal (no-handicap) game; the human plays first as SENTE.
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  // Make a legal opening move: 7g-7f (push the SENTE pawn at file 7 from rank 7
  // to rank 6). Cells expose data-testid `cell-<suji>-<dan>`.
  await page.getByTestId('cell-7-7').click();
  await page.getByTestId('cell-7-6').click();

  // While GOTE moves, the status strip shows either 'AIが考えています…' (a real
  // search) or '定跡どおりに指しています' (an instant book reply — 7g7f is in
  // book), then 'あなたの番です' once it has answered. If the AI worker were
  // wedged (the historical freeze) it would never return to 'あなたの番です'.
  await expect(
    page.getByText('AIが考えています…').or(page.getByText('定跡どおりに指しています')),
  ).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('あなたの番です')).toBeVisible({ timeout: 30_000 });
});

test('a synchronous Worker constructor failure recovers through the measured JS fallback', async ({ page }) => {
  test.setTimeout(45_000);

  // Reproduce the failure that happens before requestBestMoveWithInfo() can
  // return a Promise. The component must catch this constructor throw itself;
  // a Promise .catch() cannot observe it.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct() {
        throw new Error('forced synchronous Worker construction failure');
      },
    });
  });

  await page.goto('/games/shogi');
  await page.getByRole('button', { name: 'Level 1 (Easy)' }).click();
  // Handicap skips the opening book and makes the AI move first, so this test
  // reaches Worker construction without needing a brittle sequence of moves.
  await page.getByRole('button', { name: '角落ち' }).click();
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  const status = page.getByTestId('shogi-engine-status');
  await expect(status).toHaveAttribute('data-search-path', 'main-thread-js', { timeout: 20_000 });
  await expect(status).toHaveAttribute('data-thinking', 'false');
  await expect(status).toHaveAttribute('data-ply', '1');
  await expect(status).toContainText('低速互換モード');

  const scoreAttr = await status.getAttribute('data-score-cp');
  const depthAttr = await status.getAttribute('data-search-depth');
  expect(scoreAttr, 'fallback should include data-score-cp').toMatch(/^-?\d+(?:\.\d+)?$/);
  expect(depthAttr, 'fallback should include data-depth').toMatch(/^\d+$/);
  const blockedMs = Number(await status.getAttribute('data-main-thread-blocked-ms'));
  const scoreCp = Number(scoreAttr);
  const depth = Number(depthAttr);
  expect(blockedMs, 'fallback should report how long it blocked the UI thread').toBeGreaterThan(0);
  expect(Number.isFinite(scoreCp), 'fallback should expose a numeric SENTE score').toBe(true);
  expect(depth, 'fallback should expose a completed JS-search depth').toBeGreaterThan(0);
});

test('leaving during the pre-search delay does not create a Worker after unmount', async ({ page }) => {
  await page.goto('/games/shogi');
  // Capture the component's one 500ms courtesy callback instead of racing the
  // real clock. We invoke it manually after client-side navigation/unmount.
  await page.evaluate(() => {
    const state = window as typeof window & {
      __shogiWorkerAttempts?: number;
      __shogiDelayedCallbacks?: Array<() => void>;
      __nativeSetTimeout?: typeof window.setTimeout;
    };
    state.__shogiWorkerAttempts = 0;
    state.__shogiDelayedCallbacks = [];
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args, newTarget) {
        state.__shogiWorkerAttempts = (state.__shogiWorkerAttempts ?? 0) + 1;
        return Reflect.construct(target, args, newTarget);
      },
    });
    const nativeSetTimeout = window.setTimeout.bind(window);
    state.__nativeSetTimeout = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 500 && typeof handler === 'function') {
        state.__shogiDelayedCallbacks?.push(() => handler(...args));
        return 2_147_483_646;
      }
      return nativeSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout;
  });

  await page.getByRole('button', { name: '角落ち' }).click();
  await page.getByRole('button', { name: /Start Game/i }).first().click();
  const status = page.getByTestId('shogi-engine-status');
  await expect(status).toHaveAttribute('data-search-path', 'worker-pending');
  const capturedCallbacks = await page.evaluate(() => {
    const state = window as typeof window & {
      __shogiDelayedCallbacks?: Array<() => void>;
      __nativeSetTimeout?: typeof window.setTimeout;
    };
    if (state.__nativeSetTimeout) window.setTimeout = state.__nativeSetTimeout;
    return state.__shogiDelayedCallbacks?.length ?? 0;
  });
  expect(capturedCallbacks).toBe(1);

  const before = await page.evaluate(
    () => (window as typeof window & { __shogiWorkerAttempts?: number }).__shogiWorkerAttempts ?? 0,
  );
  await page.getByRole('link', { name: 'Games', exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
  await page.evaluate(() => {
    const state = window as typeof window & { __shogiDelayedCallbacks?: Array<() => void> };
    const callbacks = state.__shogiDelayedCallbacks ?? [];
    state.__shogiDelayedCallbacks = [];
    for (const callback of callbacks) callback();
  });
  const after = await page.evaluate(
    () => (window as typeof window & { __shogiWorkerAttempts?: number }).__shogiWorkerAttempts ?? 0,
  );

  expect(after).toBe(before);
});

test('permanent Worker and JS fallback failures stop instead of retrying forever', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/games/shogi');
  await page.evaluate(() => {
    const state = window as typeof window & {
      __nativeMapClear?: typeof Map.prototype.clear;
      __nativeWorker?: typeof window.Worker;
      __shogiWorkerAttempts?: number;
    };
    state.__shogiWorkerAttempts = 0;
    const NativeWorker = window.Worker;
    state.__nativeWorker = NativeWorker;
    window.Worker = new Proxy(NativeWorker, {
      construct() {
        state.__shogiWorkerAttempts = (state.__shogiWorkerAttempts ?? 0) + 1;
        throw new Error('forced permanent Worker failure');
      },
    });
    const nativeClear = Map.prototype.clear;
    state.__nativeMapClear = nativeClear;
    Map.prototype.clear = function clear() {
      if ((state.__shogiWorkerAttempts ?? 0) > 0) {
        throw new Error('forced permanent JS fallback failure');
      }
      return nativeClear.call(this);
    };
  });
  await page.getByRole('button', { name: 'Level 1 (Easy)' }).click();
  await page.getByRole('button', { name: '角落ち' }).click();
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  const status = page.getByTestId('shogi-engine-status');
  await expect(status).toHaveAttribute('data-search-path', 'engine-error', { timeout: 15_000 });
  await expect(status).toHaveAttribute('data-thinking', 'false');
  await expect(status).toContainText('AIを起動できませんでした');
  const readAttempts = () =>
    page.evaluate(
      () => (window as typeof window & { __shogiWorkerAttempts?: number }).__shogiWorkerAttempts ?? 0,
    );
  const attempts = await readAttempts();

  // The property this test exists for is that construction STOPS. The bug it
  // was written against respawned and re-searched every ~500ms forever, so the
  // count grew without bound. Assert that directly: sample across several of
  // those retry intervals and require the count to be pinned. Pinning one
  // literal number instead would silently encode WHEN the worker is spawned,
  // which is an implementation detail this test has no business owning.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    expect(await readAttempts()).toBe(attempts);
  }

  // It must also stop after a small bounded number of tries, not merely stop
  // eventually. Exactly two places ask for a worker in one game — `initGame`
  // spawns it up front so the 94.7MB NNUE weights load during the opening book,
  // and the AI-move effect asks again when a search needs one. They normally
  // share a single instance via `workerRef`, but a constructor that throws
  // leaves nothing to cache, so here both ask and both fail. That a HEALTHY
  // game builds exactly one worker for both call sites is pinned separately by
  // 'a healthy game constructs exactly one AI worker' below.
  expect(attempts).toBeGreaterThanOrEqual(1);
  expect(attempts).toBeLessThanOrEqual(2);

  await page.evaluate(() => {
    const state = window as typeof window & {
      __nativeMapClear?: typeof Map.prototype.clear;
      __nativeWorker?: typeof window.Worker;
    };
    if (state.__nativeMapClear) Map.prototype.clear = state.__nativeMapClear;
    if (state.__nativeWorker) window.Worker = state.__nativeWorker;
  });
  await page.getByTestId('shogi-engine-retry').click();
  await expect(status).toHaveAttribute('data-search-path', 'wasm', { timeout: 15_000 });
  await expect(status).toHaveAttribute('data-thinking', 'false');
  await expect(status).toHaveAttribute('data-ply', '1');
});

/**
 * The AI worker is spawned when the game starts, not lazily on the first
 * out-of-book move, so its 94.7MB NNUE weights download during the opening book
 * rather than on the clock of a move — and so a move's hard deadline is not
 * spent on worker cold start.
 *
 * Pulling the spawn earlier makes one specific mistake easy and invisible:
 * spawning at game start AND again when a search needs one. That would run two
 * engines, two WASM heaps and two 94.7MB fetches, and nothing in the UI would
 * say so. Pin that both call sites share ONE instance.
 *
 * Every `new Worker` on this page is counted, not just a chosen URL: production
 * bundles route worker construction through a Turbopack shim whose URL says
 * nothing about which module it loads. That is safe to assert as exactly 1
 * because `computeSearchThreadCount()` returns 1, so `trySpawnSmpHelpers` never
 * spawns a helper. If Lazy SMP is ever switched back on this test fails loudly,
 * which is the correct outcome: whether the engine is allowed more than one
 * WASM heap and more than one weights fetch has to be re-decided, not silently
 * absorbed by a test that was pre-weakened to tolerate it.
 */
test('a healthy game constructs exactly one AI worker', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/games/shogi');
  await page.evaluate(() => {
    const state = window as typeof window & { __shogiWorkerConstructions?: number };
    state.__shogiWorkerConstructions = 0;
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args: ConstructorParameters<typeof Worker>) {
        state.__shogiWorkerConstructions = (state.__shogiWorkerConstructions ?? 0) + 1;
        return new target(...args);
      },
    });
  });
  const constructions = () =>
    page.evaluate(
      () =>
        (window as typeof window & { __shogiWorkerConstructions?: number })
          .__shogiWorkerConstructions ?? 0,
    );

  await page.getByRole('button', { name: 'Level 1 (Easy)' }).click();
  // 角落ち: the AI (上手) moves first and is out of the opening book from move
  // one, so the game-start spawn and the first out-of-book search — the only
  // two places that ask for a worker — land back to back. In a hirate game the
  // second one is merely deferred until the book runs out; it is the same call.
  await page.getByRole('button', { name: '角落ち' }).click();
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  const status = page.getByTestId('shogi-engine-status');
  // Spawned up front, before any search has been requested.
  expect(await constructions()).toBe(1);

  // The first out-of-book search reused it instead of spawning its own.
  await expect(status).toHaveAttribute('data-ply', '1', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-search-path', 'wasm');
  expect(await constructions()).toBe(1);

  // And so does every later search in the same game.
  await page.getByTestId('cell-7-7').click();
  await page.getByTestId('cell-7-6').click();
  await expect(status).toHaveAttribute('data-ply', '3', { timeout: 30_000 });
  expect(await constructions()).toBe(1);
});

/**
 * The fault injected here is a SYNCHRONOUS throw from `new Worker(...)`, i.e.
 * the Worker API refusing outright. The contract is that the client gives up
 * immediately — two constructions, one terminate, terminal `engine-error` —
 * and it is deliberate: no URL and no retry can route around an unavailable
 * Worker constructor, so anything else just delays the honest answer.
 *
 * Do not relax these numbers to accommodate a recovery strategy. The
 * poisoned-cache self-heal in shogiAiWorkerClient.ts (cache:'reload' refetch,
 * then a cache-busted URL) is deliberately NOT reachable from here: that
 * failure presents as a constructor that RETURNS followed by an empty `error`
 * event, which is a different path. An attempt to escalate on a throw as well
 * broke exactly this test — the client settled on `main-thread-js` at depth 5
 * instead of `engine-error` — and was reverted rather than re-baselined.
 */
test('Retry replaces a client disabled by a failed Worker respawn', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/games/shogi');
  await page.evaluate(() => {
    const state = window as typeof window & {
      __nativeMapClear?: typeof Map.prototype.clear;
      __nativeWorker?: typeof window.Worker;
      __shogiWorkerAttempts?: number;
      __shogiRespawnFailures?: number;
      __shogiFallbackThrows?: number;
      __shogiFakeTerminateCalls?: number;
      __shogiHealthyConstructions?: number;
      __shogiThrowNextMapClear?: boolean;
      __shogiBestMoveSeen?: boolean;
    };
    // Keep the construction count deterministic: one main Worker and no SMP
    // helpers. Worker-side search itself remains unchanged.
    Object.defineProperty(window.navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 1,
    });
    state.__shogiWorkerAttempts = 0;
    state.__shogiRespawnFailures = 0;
    state.__shogiFallbackThrows = 0;
    state.__shogiFakeTerminateCalls = 0;
    state.__shogiHealthyConstructions = 0;
    state.__shogiThrowNextMapClear = false;
    state.__shogiBestMoveSeen = false;
    const NativeWorker = window.Worker;
    state.__nativeWorker = NativeWorker;
    window.Worker = new Proxy(NativeWorker, {
      construct() {
        state.__shogiWorkerAttempts = (state.__shogiWorkerAttempts ?? 0) + 1;
        if (state.__shogiWorkerAttempts === 1) {
          // Let the initial client exist, then fail only after it receives the
          // real search. The client's recovery attempt (#2) fails to construct,
          // leaving this existing client in its permanent disabled state.
          const fake: {
            onmessage: Worker['onmessage'];
            onerror: Worker['onerror'];
            postMessage: (message: { type?: string }) => void;
            terminate: () => void;
          } = {
            onmessage: null,
            onerror: null,
            postMessage(message: { type?: string }) {
              if (message.type !== 'bestMove' || state.__shogiBestMoveSeen) return;
              state.__shogiBestMoveSeen = true;
              queueMicrotask(() => {
                fake.onerror?.call(
                  fake as unknown as Worker,
                  new ErrorEvent('error', { message: 'forced Worker runtime failure' }),
                );
                // recoverWithSingleThread has already cleared pending requests
                // and attempted the respawn. The next clear therefore belongs
                // to the Promise rejection's main-thread fallback.
                state.__shogiThrowNextMapClear = true;
              });
            },
            terminate() {
              state.__shogiFakeTerminateCalls = (state.__shogiFakeTerminateCalls ?? 0) + 1;
            },
          };
          return fake as unknown as Worker;
        }
        state.__shogiRespawnFailures = (state.__shogiRespawnFailures ?? 0) + 1;
        throw new Error('forced Worker respawn construction failure');
      },
    });
    const nativeClear = Map.prototype.clear;
    state.__nativeMapClear = nativeClear;
    Map.prototype.clear = function clear() {
      if (state.__shogiThrowNextMapClear) {
        state.__shogiThrowNextMapClear = false;
        state.__shogiFallbackThrows = (state.__shogiFallbackThrows ?? 0) + 1;
        throw new Error('forced JS fallback failure after Worker recovery');
      }
      return nativeClear.call(this);
    };
  });

  await page.getByRole('button', { name: 'Level 1 (Easy)' }).click();
  await page.getByRole('button', { name: '角落ち' }).click();
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  const status = page.getByTestId('shogi-engine-status');
  await expect(status).toHaveAttribute('data-search-path', 'engine-error', { timeout: 15_000 });
  await expect(status).toHaveAttribute('data-thinking', 'false');
  await expect(status).toHaveAttribute('data-ply', '0');
  const failedState = await page.evaluate(() => {
    const state = window as typeof window & {
      __shogiWorkerAttempts?: number;
      __shogiRespawnFailures?: number;
      __shogiFallbackThrows?: number;
      __shogiFakeTerminateCalls?: number;
    };
    return {
      attempts: state.__shogiWorkerAttempts ?? 0,
      respawnFailures: state.__shogiRespawnFailures ?? 0,
      fallbackThrows: state.__shogiFallbackThrows ?? 0,
      fakeTerminateCalls: state.__shogiFakeTerminateCalls ?? 0,
    };
  });
  expect(failedState).toEqual({
    attempts: 2,
    respawnFailures: 1,
    fallbackThrows: 1,
    fakeTerminateCalls: 1,
  });
  await page.waitForTimeout(1_200);
  await expect(status).toHaveAttribute('data-search-path', 'engine-error');
  const attemptsAfterWait = await page.evaluate(
    () => (window as typeof window & { __shogiWorkerAttempts?: number }).__shogiWorkerAttempts ?? 0,
  );
  expect(attemptsAfterWait).toBe(2);

  await page.evaluate(() => {
    const state = window as typeof window & {
      __nativeMapClear?: typeof Map.prototype.clear;
      __nativeWorker?: typeof window.Worker;
      __shogiHealthyConstructions?: number;
    };
    if (state.__nativeMapClear) Map.prototype.clear = state.__nativeMapClear;
    if (state.__nativeWorker) {
      window.Worker = new Proxy(state.__nativeWorker, {
        construct(target, args, newTarget) {
          state.__shogiHealthyConstructions = (state.__shogiHealthyConstructions ?? 0) + 1;
          return Reflect.construct(target, args, newTarget);
        },
      });
    }
  });
  await page.getByTestId('shogi-engine-retry').click();
  await expect(status).toHaveAttribute('data-search-path', 'wasm', { timeout: 15_000 });
  await expect(status).toHaveAttribute('data-thinking', 'false');
  await expect(status).toHaveAttribute('data-ply', '1');
  const recoveredState = await page.evaluate(() => {
    const state = window as typeof window & {
      __shogiHealthyConstructions?: number;
      __shogiFakeTerminateCalls?: number;
    };
    return {
      healthyConstructions: state.__shogiHealthyConstructions ?? 0,
      fakeTerminateCalls: state.__shogiFakeTerminateCalls ?? 0,
    };
  });
  expect(recoveredState).toEqual({ healthyConstructions: 1, fakeTerminateCalls: 2 });
});

test('the old /games/shogi-improved URL no longer exists (direct 404, not a redirect)', async ({ request }) => {
  const response = await request.get('/games/shogi-improved', { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

test('isolation is scoped to /games/shogi only', async ({ request }) => {
  for (const path of ['/', '/games']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cross-origin-embedder-policy']).toBeUndefined();
    expect(response.headers()['cross-origin-opener-policy']).toBeUndefined();
  }
});
