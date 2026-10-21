import { unstable_cache } from 'next/cache';
import { after } from 'next/server';
// The request's work store, from the module Next's own `after()` reads it from. The build keeps it external, so this
// is the one instance the server uses.
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external';

/**
 * `unstable_cache`, with the work it leaves running after the response kept alive until that work is done.
 *
 * `unstable_cache` returns a stale entry at once and recomputes it in the background, and writes a newly computed
 * entry to the cache in the background. It puts both on the request's `pendingRevalidates`. Next 16.3.8 hands that
 * list to the platform's `waitUntil` once, when the HTML shell is ready (`app-render.js`), so only what is on it by
 * then; for an RSC request (a client-side navigation) it never hands it over. Every page here renders under the root
 * `loading.tsx`, after the shell. On Vercel, background work that no `waitUntil` covers is frozen with the function
 * when the response ends: the Firestore read stops mid-flight, its 9 s deadline fires the next time the instance thaws,
 * for whatever request that is, and the entry is not refreshed. In production on 2026-10-20 the blog's deadlines fired
 * 0.1–0.2 s into requests for unrelated pages such as /games/keno, a minute after the blog request that had started
 * the read.
 *
 * So after each call, everything pending on the request is handed to `after()`, which gives it to `waitUntil`. A
 * promise Next has handed over as well is just awaited twice. Outside a request (a script, a test) or where there is
 * no `waitUntil`, `after()` throws, and nothing changes from plain `unstable_cache`.
 */
export function cacheWithWaitUntil<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts?: string[],
  options?: { revalidate?: number | false; tags?: string[] },
): (...args: Args) => Promise<Result> {
  const cached = unstable_cache(fn, keyParts, options);
  return async (...args: Args) => {
    try {
      return await cached(...args);
    } finally {
      keepPendingRevalidatesAlive();
    }
  };
}

/** Promises already handed to `after()`. Each belongs to one request, and is dropped with it. */
const handedOver = new WeakSet<Promise<unknown>>();

function keepPendingRevalidatesAlive(): void {
  const pending = workAsyncStorage.getStore()?.pendingRevalidates;
  if (!pending) return;
  for (const promise of Object.values(pending)) {
    if (handedOver.has(promise)) continue;
    handedOver.add(promise);
    try {
      // A revalidation never rejects (Next logs its error and keeps the stale entry); a cache write that fails is
      // logged by after().
      after(promise);
    } catch {
      // No request scope, or no waitUntil: see above.
    }
  }
}
