import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShogiAiWorkerClient,
  type SerializedKyokumenImproved,
} from '@/components/game/ShogiImproved/shogiAiWorkerClient';

/**
 * The AI worker's script can be un-loadable while being perfectly well served.
 *
 * Measured on production: `new Worker(<entry chunk URL>)` failed 3/3 in ~4ms
 * with an empty error message and a null filename — the script never executed —
 * while `fetch()` of the SAME url returned 200 with the correct 818 bytes and
 * neighbouring chunks loaded fine as workers. The browser was holding a
 * poisoned HTTP cache entry, and because /_next/static/** is served
 * `public, max-age=31536000, immutable` it never revalidated: every respawn
 * re-requested the same URL, hit the same broken entry, and the session stayed
 * in 低速互換モード across reloads. Backoff cannot fix that — there is no outage
 * to wait out.
 *
 * Two repairs were proven in the affected browser and are what these tests
 * pin: refetching with `cache: 'reload'` (which overwrites the stored entry),
 * and, failing that, requesting a URL the poisoned entry is not keyed on.
 */

/**
 * The URL shape Turbopack actually hands the browser. The `#params=` fragment
 * is its own bootstrap payload — the entry chunk reads it back to know which
 * chunks to `importScripts()` — so it is NOT noise and must survive any URL
 * rewriting the client does.
 */
const WORKER_ENTRY_HASH =
  '#params=[[%22static/chunks/shogi-ai.worker.js%22],%22%22,null,null]';
const WORKER_ENTRY_ORIGIN = 'https://example.test';
/** The parameter the client appends to route around a poisoned cache entry. */
const WORKER_CACHE_BUST_PARAM_NAME = '__wcb';
const WORKER_ENTRY_PATH = '/_next/static/chunks/turbopack-worker-9f2c4a1b.js';
const WORKER_ENTRY_URL = `${WORKER_ENTRY_ORIGIN}${WORKER_ENTRY_PATH}${WORKER_ENTRY_HASH}`;

/** Ordered log of every network-visible thing the client did. */
let events: string[] = [];

/**
 * Stand in for Turbopack's build-time rewrite: the client asks for the
 * TypeScript module, the runtime resolves it to the entry chunk above.
 */
const RealURL = URL;
class UrlStub extends RealURL {
  constructor(input: string | URL, base?: string | URL) {
    if (typeof input === 'string' && input.endsWith('shogi-ai.worker.ts')) {
      super(WORKER_ENTRY_URL);
      return;
    }
    super(input as string, base as string);
  }
}

class HealableWorkerStub {
  static instances: HealableWorkerStub[] = [];
  /** When false, even a cache-busted URL fails — a genuinely broken build. */
  static healableByCacheBust = true;

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  readonly terminate = vi.fn();
  readonly url: string;
  readonly boots: boolean;

  constructor(scriptURL: string | URL) {
    this.url = String(scriptURL);
    events.push(`worker:${this.url}`);
    HealableWorkerStub.instances.push(this);
    this.boots =
      HealableWorkerStub.healableByCacheBust && this.url.includes('__wcb=');
    if (!this.boots) {
      // How the real failure presents: an error event with nothing in it,
      // dispatched after the constructor returns (so the client's handlers are
      // already attached), because the script never ran.
      queueMicrotask(() => this.onerror?.({ message: '' } as ErrorEvent));
    }
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

const position: SerializedKyokumenImproved = {
  board: new Array<number>(81).fill(0),
  hand: [],
  teban: 0,
};

function installStubs(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown) => {
    events.push(`fetch:${String(input)}`);
    return { ok: true, status: 200 } as unknown as Response;
  });
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { hardwareConcurrency: 1 });
  vi.stubGlobal('URL', UrlStub);
  vi.stubGlobal('Worker', HealableWorkerStub);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

function latestWorker(): HealableWorkerStub {
  const worker = HealableWorkerStub.instances[HealableWorkerStub.instances.length - 1];
  expect(worker).toBeDefined();
  return worker!;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  HealableWorkerStub.instances = [];
  HealableWorkerStub.healableByCacheBust = true;
  events = [];
});

describe('shogi AI worker cache self-heal', () => {
  it('ends up on a working worker when only a fresh URL can load the script', async () => {
    const fetchMock = installStubs();
    const gaveUp: string[] = [];
    const client = createShogiAiWorkerClient({
      onWorkerGaveUp: (reason) => gaveUp.push(reason),
    });

    // First instance dies on boot; the immediate retry re-requests the same
    // (still poisoned) URL and dies too.
    await vi.advanceTimersByTimeAsync(0);
    // The next attempt escalates to a URL the bad cache entry cannot answer.
    await vi.advanceTimersByTimeAsync(1_000);

    const alive = latestWorker();
    expect(alive.url).toContain(`${WORKER_CACHE_BUST_PARAM_NAME}=`);
    // The bootstrap payload has to survive intact, and the query has to sit
    // BEFORE the fragment or the worker would parse the parameter as part of
    // its chunk list.
    expect(alive.url).toBe(
      `${WORKER_ENTRY_ORIGIN}${WORKER_ENTRY_PATH}?__wcb=1${WORKER_ENTRY_HASH}`
    );
    expect(alive.boots).toBe(true);

    // And it is a real, usable worker: a move goes out and comes back.
    const pending = client.requestBestMoveWithInfo(position, 'master', 1);
    await vi.advanceTimersByTimeAsync(0);
    const request = alive.posted.find(
      (message) => (message as { type?: string }).type === 'bestMove'
    ) as { id: number };
    expect(request).toBeDefined();
    alive.emit({
      type: 'bestMoveResult',
      id: request.id,
      move: { koma: 1, from: 0x77, to: 0x76, promote: false },
      searchPath: 'wasm',
    });
    await expect(pending).resolves.toMatchObject({ searchPath: 'wasm' });

    // No give-up: the session never had to fall back to the main-thread engine.
    expect(gaveUp).toEqual([]);
    expect(fetchMock).toHaveBeenCalled();
    client.terminate();
  });

  it('refetches the script with cache:"reload" before rebuilding the worker', async () => {
    const fetchMock = installStubs();
    const client = createShogiAiWorkerClient();

    await vi.advanceTimersByTimeAsync(0);

    // The repair targets the exact poisoned entry: same URL, minus the
    // fragment (which is never sent to the server and is not part of the
    // cache key), and explicitly bypassing/overwriting the cached response.
    expect(fetchMock).toHaveBeenCalledWith(
      `${WORKER_ENTRY_ORIGIN}${WORKER_ENTRY_PATH}`,
      { cache: 'reload' }
    );

    // Ordering is the whole point: rebuilding first would just re-read the
    // poisoned entry again.
    const firstFetch = events.findIndex((event) => event.startsWith('fetch:'));
    const secondWorker = events.map((event) => event.startsWith('worker:')).lastIndexOf(true);
    expect(firstFetch).toBeGreaterThanOrEqual(0);
    expect(firstFetch).toBeLessThan(secondWorker);
    expect(events[0]).toBe(`worker:${WORKER_ENTRY_URL}`);

    client.terminate();
  });

  it('still gives up through the storm guard when nothing can load the script', async () => {
    HealableWorkerStub.healableByCacheBust = false;
    installStubs();
    const gaveUp: string[] = [];
    const client = createShogiAiWorkerClient({
      onWorkerGaveUp: (reason) => gaveUp.push(reason),
    });
    void client.requestBestMoveWithInfo(position, 'master', 0).catch(() => {});

    // Four respawns' worth of backoff, then the guard fires.
    await vi.advanceTimersByTimeAsync(20_000);

    expect(gaveUp).toHaveLength(1);
    // Bounded: the self-heal must not turn a broken environment into an
    // endless rebuild loop.
    expect(HealableWorkerStub.instances.length).toBeLessThanOrEqual(5);
    await expect(client.requestBestMoveWithInfo(position, 'master', 1)).rejects.toThrow(
      'AI worker unavailable'
    );
    client.terminate();
  });
});
