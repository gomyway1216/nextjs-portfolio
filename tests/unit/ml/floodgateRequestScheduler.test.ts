import { types as nodeUtilTypes } from "node:util";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS,
  FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS,
  FLOODGATE_REQUEST_USER_AGENT,
  createFloodgateRequestScheduler,
  createNonProductionFloodgateRequestSchedulerForTests,
  type FloodgateFetch,
  type FloodgateFetchResponse,
  type FloodgateRequest,
  type FloodgateRequestProgress,
} from "../../../ml/floodgate-request-scheduler";

const LISTING_A = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/";
const LISTING_B = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/02/";
const LISTING_C = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/03/";
const RATING_A =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260101.html";
const PERIOD =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260401.html";
const CSA_A =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+Alpha+Beta+20260101010203.csa";

function headerBag(values: Readonly<Record<string, string>> = {}) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name: string): string | null {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function response(
  url: string,
  options: Readonly<{
    status?: number;
    redirected?: boolean;
    body?: string;
    headers?: Readonly<Record<string, string>>;
  }> = {},
): FloodgateFetchResponse {
  const encoded = new TextEncoder().encode(options.body ?? "body");
  const buffer = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  ) as ArrayBuffer;
  return {
    status: options.status ?? 200,
    url,
    redirected: options.redirected ?? false,
    headers: headerBag(options.headers),
    async arrayBuffer() {
      return buffer.slice(0);
    },
  };
}

function fakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    sleep: async (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

describe("Floodgate request scheduler", () => {
  it("pins production policy and forbids clock or pacing overrides", () => {
    expect(FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS).toBe(4);
    expect(FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS).toBe(100);
    expect(FLOODGATE_REQUEST_USER_AGENT).toBe(
      "nextjs-portfolio-floodgate-lock/1.0",
    );
    expect(() =>
      createFloodgateRequestScheduler({
        now: () => 0,
      } as unknown as Parameters<typeof createFloodgateRequestScheduler>[0]),
    ).toThrow(/only provide fetchImpl and onProgress/);

    let proxyTrapTouched = false;
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          proxyTrapTouched = true;
          return [];
        },
      },
    );
    expect(() =>
      createFloodgateRequestScheduler(
        proxy as unknown as Parameters<
          typeof createFloodgateRequestScheduler
        >[0],
      ),
    ).toThrow(/must not be a Proxy/);
    expect(proxyTrapTouched).toBe(false);
  });

  it("sorts the queue and enforces one global start gate with bounded concurrency", async () => {
    const clock = fakeClock();
    const starts: { url: string; at: number }[] = [];
    let active = 0;
    let maximumActive = 0;
    const progress: FloodgateRequestProgress[] = [];
    const fetchImpl: FloodgateFetch = async (url, init) => {
      starts.push({ url, at: clock.now() });
      expect(init).toMatchObject({
        method: "GET",
        redirect: "manual",
        headers: {
          "accept-encoding": "identity",
          "user-agent": FLOODGATE_REQUEST_USER_AGENT,
        },
      });
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return response(url, {
        headers: { "content-encoding": "identity", "content-length": "4" },
      });
    };
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 2, minimumRequestStartIntervalMs: 10 },
      {
        fetchImpl,
        now: clock.now,
        sleep: clock.sleep,
        onProgress: (event) => progress.push(event),
      },
    );

    const result = await scheduler.run([
      { kind: "daily_listing", url: LISTING_C },
      { kind: "daily_listing", url: LISTING_A },
      { kind: "daily_listing", url: LISTING_B },
    ]);

    expect(starts.map((entry) => entry.url)).toEqual([
      LISTING_A,
      LISTING_B,
      LISTING_C,
    ]);
    expect(starts.map((entry) => entry.at)).toEqual([10, 20, 30]);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(result.map((entry) => entry.url)).toEqual([
      LISTING_A,
      LISTING_B,
      LISTING_C,
    ]);
    expect(result.every((entry) => entry.contentEncoding === "identity")).toBe(
      true,
    );
    expect(progress.filter((event) => event.type === "started")).toHaveLength(
      3,
    );
    expect(
      progress.every(
        (event) => event.inFlightRequests <= 2 && Object.isFrozen(event),
      ),
    ).toBe(true);
  });

  it("accepts only canonical URLs for the declared request kind", async () => {
    const clock = fakeClock();
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => response(url),
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    await expect(
      scheduler.run([{ kind: "csa", url: LISTING_A }]),
    ).rejects.toThrow(/CSA path/);
    await expect(
      scheduler.run([{ kind: "period_end_inventory", url: RATING_A }]),
    ).rejects.toThrow(/exact period-end inventory URL/);
    await expect(
      scheduler.run([
        { kind: "daily_listing", url: LISTING_A },
        { kind: "daily_listing", url: LISTING_A },
      ]),
    ).rejects.toThrow(/repeat URL/);

    const accessor = { kind: "daily_listing", url: LISTING_A };
    Object.defineProperty(accessor, "url", {
      enumerable: true,
      get: () => LISTING_A,
    });
    await expect(
      scheduler.run([accessor] as readonly FloodgateRequest[]),
    ).rejects.toThrow(/data property/);

    let slotAccessorTouched = false;
    const hostileSlots: FloodgateRequest[] = [];
    Object.defineProperty(hostileSlots, "0", {
      configurable: true,
      enumerable: false,
      get() {
        slotAccessorTouched = true;
        return { kind: "daily_listing", url: LISTING_A };
      },
    });
    hostileSlots.length = 1;
    await expect(scheduler.run(hostileSlots)).rejects.toThrow(/data property/);
    expect(slotAccessorTouched).toBe(false);
    await expect(
      scheduler.run(new Proxy([{ kind: "daily_listing", url: LISTING_A }], {})),
    ).rejects.toThrow(/plain array/);
  });

  it("never lets a poisoned Array.map replace validated requests", async () => {
    const clock = fakeClock();
    const originalMap = Array.prototype.map;
    const requests: FloodgateRequest[] = [
      { kind: "daily_listing", url: LISTING_A },
    ];
    let fetchedUrl: string | undefined;
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => {
          Array.prototype.map = originalMap;
          fetchedUrl = url;
          return response(url);
        },
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    Array.prototype.map = function (
      this: unknown[],
      callback: (value: unknown, index: number, array: unknown[]) => unknown,
      thisArg?: unknown,
    ): unknown[] {
      if (this === requests) {
        return [{ kind: "daily_listing", url: "https://evil.invalid/" }];
      }
      return Reflect.apply(originalMap, this, [callback, thisArg]) as unknown[];
    } as typeof Array.prototype.map;
    try {
      await scheduler.run(requests);
    } finally {
      Array.prototype.map = originalMap;
    }
    expect(fetchedUrl).toBe(LISTING_A);
  });

  it("never lets a poisoned Object.freeze replace validated requests", async () => {
    const clock = fakeClock();
    const originalFreeze = Object.freeze;
    let fetchedUrl: string | undefined;
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => {
          Object.freeze = originalFreeze;
          fetchedUrl = url;
          return response(url);
        },
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    Object.freeze = ((value: object) => {
      if (
        "kind" in value &&
        "url" in value &&
        value.kind === "daily_listing" &&
        value.url === LISTING_A
      ) {
        return { kind: "daily_listing", url: "https://evil.invalid/" };
      }
      return originalFreeze(value);
    }) as typeof Object.freeze;
    try {
      await scheduler.run([{ kind: "daily_listing", url: LISTING_A }]);
    } finally {
      Object.freeze = originalFreeze;
    }
    expect(fetchedUrl).toBe(LISTING_A);
  });

  it("uses captured structural validation instead of poisoned Set dispatch", async () => {
    const clock = fakeClock();
    const starts: string[] = [];
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => {
          starts.push(url);
          return response(url);
        },
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    const originalSetHas = Set.prototype.has;
    let duplicateRejection: unknown;
    let kindRejection: unknown;
    try {
      Set.prototype.has = function (
        this: Set<unknown>,
        value: unknown,
      ): boolean {
        if (typeof value === "string" && value.startsWith("https://")) {
          return false;
        }
        return Reflect.apply(originalSetHas, this, [value]) as boolean;
      } as typeof Set.prototype.has;
      try {
        await scheduler.run([
          { kind: "daily_listing", url: LISTING_A },
          { kind: "daily_listing", url: LISTING_A },
        ]);
      } catch (error) {
        duplicateRejection = error;
      }

      Set.prototype.has = function (
        this: Set<unknown>,
        value: unknown,
      ): boolean {
        if (value === "evil") return true;
        return Reflect.apply(originalSetHas, this, [value]) as boolean;
      } as typeof Set.prototype.has;
      try {
        await scheduler.run([
          { kind: "evil", url: CSA_A } as unknown as FloodgateRequest,
        ]);
      } catch (error) {
        kindRejection = error;
      }
    } finally {
      Set.prototype.has = originalSetHas;
    }

    expect(duplicateRejection).toBeInstanceOf(Error);
    expect((duplicateRejection as Error).message).toMatch(/repeat URL/);
    expect(kindRejection).toBeInstanceOf(Error);
    expect((kindRejection as Error).message).toMatch(/kind is unsupported/);
    expect(starts).toEqual([]);
  });

  it("rejects real accessors despite a poisoned descriptor lookup", async () => {
    const clock = fakeClock();
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => response(url),
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    let getterReads = 0;
    const hostile = {} as FloodgateRequest;
    Object.defineProperties(hostile, {
      kind: {
        enumerable: true,
        get() {
          getterReads += 1;
          return "daily_listing";
        },
      },
      url: {
        enumerable: true,
        get() {
          getterReads += 1;
          return LISTING_A;
        },
      },
    });
    const originalDescriptor = Object.getOwnPropertyDescriptor;
    let rejection: unknown;
    Object.getOwnPropertyDescriptor = ((target: object, key: PropertyKey) => {
      if (target === hostile && key === "kind") {
        return { configurable: true, enumerable: true, value: "daily_listing" };
      }
      if (target === hostile && key === "url") {
        return { configurable: true, enumerable: true, value: LISTING_A };
      }
      return originalDescriptor(target, key);
    }) as typeof Object.getOwnPropertyDescriptor;
    try {
      await scheduler.run([hostile]);
    } catch (error) {
      rejection = error;
    } finally {
      Object.getOwnPropertyDescriptor = originalDescriptor;
    }

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/data property/);
    expect(getterReads).toBe(0);
  });

  it("enforces redirect, status, encoding, and exact Content-Length contracts", async () => {
    async function runWith(
      request: FloodgateRequest,
      fetched: FloodgateFetchResponse,
    ) {
      const clock = fakeClock();
      return createNonProductionFloodgateRequestSchedulerForTests(
        { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
        {
          fetchImpl: async () => fetched,
          now: clock.now,
          sleep: clock.sleep,
        },
      ).run([request]);
    }

    await expect(
      runWith({ kind: "daily_listing", url: LISTING_A }, response(LISTING_B)),
    ).rejects.toThrow(/response URL/);
    await expect(
      runWith(
        { kind: "daily_listing", url: LISTING_A },
        response(LISTING_A, { redirected: true }),
      ),
    ).rejects.toThrow(/redirected/);
    await expect(
      runWith({ kind: "csa", url: CSA_A }, response(CSA_A, { status: 404 })),
    ).rejects.toThrow(/forbidden for csa/);
    await expect(
      runWith(
        { kind: "daily_listing", url: LISTING_A },
        response(LISTING_A, { headers: { "content-encoding": "gzip" } }),
      ),
    ).rejects.toThrow(/Content-Encoding/);
    await expect(
      runWith(
        { kind: "daily_listing", url: LISTING_A },
        response(LISTING_A, { headers: { "content-length": "04" } }),
      ),
    ).rejects.toThrow(/canonical nonnegative integer/);
    await expect(
      runWith(
        { kind: "daily_listing", url: LISTING_A },
        response(LISTING_A, { headers: { "content-length": "5" } }),
      ),
    ).rejects.toThrow(/does not match/);

    let coerced = false;
    const hostileLength = {
      toString() {
        coerced = true;
        return "4";
      },
    };
    await expect(
      runWith(
        { kind: "daily_listing", url: LISTING_A },
        {
          ...response(LISTING_A),
          headers: {
            get: (name) =>
              name === "content-length"
                ? (hostileLength as unknown as string)
                : null,
          },
        },
      ),
    ).rejects.toThrow(/primitive string/);
    expect(coerced).toBe(false);

    await expect(
      runWith(
        { kind: "daily_rating", url: RATING_A },
        response(RATING_A, { status: 404, body: "missing" }),
      ),
    ).resolves.toMatchObject([{ status: 404, contentEncoding: null }]);
    await expect(
      runWith({ kind: "period_end_inventory", url: PERIOD }, response(PERIOD)),
    ).resolves.toMatchObject([{ status: 200 }]);
  });

  it("snapshots response status once and uses captured byte-copy intrinsics", async () => {
    const clock = fakeClock();
    let statusReads = 0;
    const events: FloodgateRequestProgress[] = [];
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => {
          const base = response(url, { body: "exact" });
          return {
            ...base,
            get status() {
              statusReads += 1;
              return statusReads === 1 ? 200 : 500;
            },
          };
        },
        now: clock.now,
        sleep: clock.sleep,
        onProgress: (event) => events.push(event),
      },
    );

    const typedArrayPrototype = Object.getPrototypeOf(
      Uint8Array.prototype,
    ) as object;
    const originalByteLength = Object.getOwnPropertyDescriptor(
      typedArrayPrototype,
      "byteLength",
    )!;
    const originalSet = Uint8Array.prototype.set;
    let fetchedStatus: number | undefined;
    let fetchedBytes: Uint8Array | undefined;
    Uint8Array.prototype.set = () => undefined;
    Object.defineProperty(typedArrayPrototype, "byteLength", {
      ...originalByteLength,
      get: () => 6,
    });
    try {
      const [fetched] = await scheduler.run([
        { kind: "daily_listing", url: LISTING_A },
      ]);
      fetchedStatus = fetched.status;
      fetchedBytes = fetched.bytes;
    } finally {
      Uint8Array.prototype.set = originalSet;
      Object.defineProperty(
        typedArrayPrototype,
        "byteLength",
        originalByteLength,
      );
    }
    expect(fetchedStatus).toBe(200);
    expect(new TextDecoder().decode(fetchedBytes)).toBe("exact");
    expect(statusReads).toBe(1);
    expect(events.map((event) => event.type)).toEqual(["started", "completed"]);
    expect(events.find((event) => event.type === "completed")).toMatchObject({
      status: 200,
    });
  });

  it("uses a captured Content-Encoding normalizer", async () => {
    const clock = fakeClock();
    const fetched = {
      ...response(LISTING_A),
      headers: { get: () => "gzip" },
    };
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async () => fetched,
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    const originalToLowerCase = String.prototype.toLowerCase;
    let rejected = false;
    let rejection: unknown;
    String.prototype.toLowerCase = () => "identity";
    try {
      await scheduler.run([{ kind: "daily_listing", url: LISTING_A }]);
    } catch (error) {
      rejected = true;
      rejection = error;
    } finally {
      String.prototype.toLowerCase = originalToLowerCase;
    }
    expect(rejected).toBe(true);
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/Content-Encoding/);
  });

  it("uses captured Content-Length parsing primitives", async () => {
    const clock = fakeClock();
    const originalRegExpTest = RegExp.prototype.test;
    const originalNumber = globalThis.Number;
    let primitivesPoisoned = false;
    const fetched = {
      ...response(LISTING_A),
      headers: {
        get(name: string): string | null {
          if (name !== "content-length") return null;
          RegExp.prototype.test = () => true;
          const fakeNumber = (() => 4) as unknown as NumberConstructor;
          fakeNumber.isSafeInteger = () => true;
          globalThis.Number = fakeNumber;
          primitivesPoisoned = true;
          return "not-a-canonical-length";
        },
      },
    };
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async () => fetched,
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    let rejection: unknown;
    try {
      await scheduler.run([{ kind: "daily_listing", url: LISTING_A }]);
    } catch (error) {
      rejection = error;
    } finally {
      RegExp.prototype.test = originalRegExpTest;
      globalThis.Number = originalNumber;
    }
    expect(primitivesPoisoned).toBe(true);
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/canonical nonnegative/);
  });

  it("uses captured Node body guards instead of coercing a fake ArrayBuffer", async () => {
    const clock = fakeClock();
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => ({
          ...response(url),
          arrayBuffer: async () => 4 as unknown as ArrayBuffer,
        }),
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    const mutableTypes = nodeUtilTypes as unknown as Record<
      "isProxy" | "isArrayBuffer" | "isSharedArrayBuffer",
      (value: unknown) => boolean
    >;
    const originalIsProxy = mutableTypes.isProxy;
    const originalIsArrayBuffer = mutableTypes.isArrayBuffer;
    const originalIsSharedArrayBuffer = mutableTypes.isSharedArrayBuffer;
    let rejection: unknown;
    mutableTypes.isProxy = () => false;
    mutableTypes.isArrayBuffer = () => true;
    mutableTypes.isSharedArrayBuffer = () => false;
    try {
      await scheduler.run([{ kind: "daily_listing", url: LISTING_A }]);
    } catch (error) {
      rejection = error;
    } finally {
      mutableTypes.isProxy = originalIsProxy;
      mutableTypes.isArrayBuffer = originalIsArrayBuffer;
      mutableTypes.isSharedArrayBuffer = originalIsSharedArrayBuffer;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/plain ArrayBuffer/);
  });

  it("reports an undefined arrayBuffer rejection as failed, never completed", async () => {
    const clock = fakeClock();
    const events: FloodgateRequestProgress[] = [];
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: async (url) => ({
          ...response(url),
          arrayBuffer: () => Promise.reject(undefined),
        }),
        now: clock.now,
        sleep: clock.sleep,
        onProgress: (event) => events.push(event),
      },
    );
    let rejected = false;
    try {
      await scheduler.run([{ kind: "daily_listing", url: LISTING_A }]);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(events.map((event) => event.type)).toEqual(["started", "failed"]);
  });

  it("stops new starts after failure and poisons scheduler reuse", async () => {
    const clock = fakeClock();
    const starts: string[] = [];
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 5 },
      {
        fetchImpl: async (url) => {
          starts.push(url);
          throw new Error("network failed");
        },
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    const requests: FloodgateRequest[] = [
      { kind: "daily_listing", url: LISTING_A },
      { kind: "daily_listing", url: LISTING_B },
      { kind: "daily_listing", url: LISTING_C },
    ];
    await expect(scheduler.run(requests)).rejects.toThrow("network failed");
    expect(starts).toEqual([LISTING_A]);
    await expect(scheduler.run(requests)).rejects.toThrow(/aborted/);
    expect(starts).toEqual([LISTING_A]);
  });

  it("treats an undefined fetch rejection as a terminal failure", async () => {
    const clock = fakeClock();
    const starts: string[] = [];
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 1 },
      {
        fetchImpl: (url) => {
          starts.push(url);
          return Promise.reject(undefined);
        },
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    let rejection: unknown;
    try {
      await scheduler.run([
        { kind: "daily_listing", url: LISTING_A },
        { kind: "daily_listing", url: LISTING_B },
      ]);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/non-Error rejection/);
    expect((rejection as Error).cause).toBeUndefined();
    expect(starts).toEqual([LISTING_A]);
  });

  it("fails closed when sleep does not advance the monotonic clock", async () => {
    const scheduler = createNonProductionFloodgateRequestSchedulerForTests(
      { maximumInflightRequests: 1, minimumRequestStartIntervalMs: 5 },
      {
        fetchImpl: async (url) => response(url),
        now: () => 0,
        sleep: async () => undefined,
      },
    );
    await expect(
      scheduler.run([{ kind: "daily_listing", url: LISTING_A }]),
    ).rejects.toThrow(/clock advanced/);
  });

  it(
    "shares one production pacing gate and semaphore across factory instances",
    { timeout: 10_000 },
    async () => {
      const starts: number[] = [];
      let active = 0;
      let maximumActive = 0;
      const originalReflectApply = Reflect.apply;
      const originalPromiseRace = Promise.race;
      let reflectApplyPoisoned = false;
      let promiseRacePoisoned = false;
      const fetchImpl: FloodgateFetch = async (url) => {
        if (reflectApplyPoisoned) {
          Reflect.apply = originalReflectApply;
          reflectApplyPoisoned = false;
        }
        if (promiseRacePoisoned && starts.length > 0) {
          Promise.race = originalPromiseRace;
          promiseRacePoisoned = false;
        }
        starts.push(performance.now());
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 450));
        active -= 1;
        return response(url);
      };
      let progressDelayInjected = false;
      const first = createFloodgateRequestScheduler({
        fetchImpl,
        onProgress: (event) => {
          if (event.type === "started" && !progressDelayInjected) {
            progressDelayInjected = true;
            const end = performance.now() + 125;
            while (performance.now() < end) {
              // Simulate a slow synchronous reporting hook before fetch starts.
            }
            let poisonedCalls = 0;
            Reflect.apply = (() =>
              poisonedCalls++ === 0 ? 0 : 1_000) as typeof Reflect.apply;
            reflectApplyPoisoned = true;
            Promise.race = (async () => ({
              type: "ready",
              permit: { markStarted() {}, release() {} },
            })) as typeof Promise.race;
            promiseRacePoisoned = true;
          }
        },
      });
      const second = createFloodgateRequestScheduler({ fetchImpl });
      const requests: FloodgateRequest[] = Array.from(
        { length: 8 },
        (_, index) => ({
          kind: "daily_listing",
          url: `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/${String(
            index + 1,
          ).padStart(2, "0")}/`,
        }),
      );

      try {
        await Promise.all([
          first.run(requests.filter((_, index) => index % 2 === 0)),
          second.run(requests.filter((_, index) => index % 2 === 1)),
        ]);
      } finally {
        Reflect.apply = originalReflectApply;
        Promise.race = originalPromiseRace;
        reflectApplyPoisoned = false;
        promiseRacePoisoned = false;
      }

      const gaps = starts
        .slice(1)
        .map((startedAt, index) => startedAt - starts[index]);
      expect(starts).toHaveLength(8);
      expect(progressDelayInjected).toBe(true);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(95);
      expect(maximumActive).toBeLessThanOrEqual(
        FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS,
      );
    },
  );

  it(
    "observes native fetch promises without consulting hostile own then hooks",
    { timeout: 10_000 },
    async () => {
      const url = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/24/";
      const OriginalPromise = Promise;
      const OriginalSetTimeout = setTimeout;
      let maliciousThenInvoked = false;
      const scheduler = createFloodgateRequestScheduler({
        fetchImpl: (requestedUrl) => {
          const fakeResponse = response(requestedUrl);
          const fetched = new OriginalPromise<FloodgateFetchResponse>(
            (resolve) => {
              OriginalSetTimeout(() => resolve(response(requestedUrl)), 200);
            },
          );
          Object.defineProperty(fetched, "constructor", {
            configurable: true,
            writable: true,
            value: function FakePromise() {},
          });
          Object.defineProperty(fetched, "then", {
            configurable: true,
            writable: true,
            value: function (resolve: (value: unknown) => void) {
              maliciousThenInvoked = true;
              resolve(fakeResponse);
              return new OriginalPromise(() => undefined);
            },
          });
          return fetched;
        },
      });
      const startedAt = performance.now();
      await scheduler.run([{ kind: "daily_listing", url }]);

      expect(maliciousThenInvoked).toBe(false);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(180);
    },
  );

  it("cancels a failed run's queued production permit without blocking peers", async () => {
    const failedFirst = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/09/";
    const mustNotStart = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/10/";
    const healthyPeer = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/11/";
    const starts: string[] = [];
    const fetchImpl: FloodgateFetch = async (url) => {
      starts.push(url);
      if (url === failedFirst) throw new Error("production peer failed");
      return response(url);
    };
    const failing = createFloodgateRequestScheduler({ fetchImpl });
    const healthy = createFloodgateRequestScheduler({ fetchImpl });

    const [failedResult, healthyResult] = await Promise.allSettled([
      failing.run([
        { kind: "daily_listing", url: failedFirst },
        { kind: "daily_listing", url: mustNotStart },
      ]),
      healthy.run([{ kind: "daily_listing", url: healthyPeer }]),
    ]);

    expect(failedResult.status).toBe("rejected");
    expect(healthyResult.status).toBe("fulfilled");
    expect(starts).toEqual([failedFirst, healthyPeer]);
  });

  it(
    "rejects a failed run even when four earlier peer permits stay occupied",
    { timeout: 10_000 },
    async () => {
      const failedFirst = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/16/";
      const mustNotStart = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/17/";
      const healthyUrls = [
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/18/",
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/19/",
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/20/",
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/21/",
      ];
      let releaseHealthy!: () => void;
      const healthyBarrier = new Promise<void>((resolve) => {
        releaseHealthy = resolve;
      });
      const starts: string[] = [];
      const fetchImpl: FloodgateFetch = async (url) => {
        starts.push(url);
        if (url === failedFirst) throw new Error("first request failed");
        if (healthyUrls.includes(url)) await healthyBarrier;
        return response(url);
      };
      const failing = createFloodgateRequestScheduler({ fetchImpl });
      const peers = healthyUrls.map(() =>
        createFloodgateRequestScheduler({ fetchImpl }),
      );
      const failingRun = failing.run([
        { kind: "daily_listing", url: failedFirst },
        { kind: "daily_listing", url: mustNotStart },
      ]);
      const healthyRuns = peers.map((peer, index) =>
        peer.run([{ kind: "daily_listing", url: healthyUrls[index] }]),
      );

      let outcome: "fulfilled" | "rejected" | "timeout";
      try {
        outcome = await Promise.race([
          failingRun.then(
            () => "fulfilled" as const,
            () => "rejected" as const,
          ),
          new Promise<"timeout">((resolve) =>
            setTimeout(() => resolve("timeout"), 1_500),
          ),
        ]);
      } finally {
        releaseHealthy();
        await Promise.allSettled([failingRun, ...healthyRuns]);
      }

      expect(outcome).toBe("rejected");
      expect(starts).not.toContain(mustNotStart);
    },
  );
});
