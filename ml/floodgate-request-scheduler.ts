/**
 * Deterministic, globally paced HTTP acquisition for the pinned Floodgate lock.
 * Filesystem persistence and corpus interpretation deliberately live elsewhere.
 */

import { types as nodeUtilTypes } from "node:util";
import { performance as nodePerformance } from "node:perf_hooks";

import {
  FLOODGATE_ORIGIN,
  FLOODGATE_PERIOD_END_INVENTORY_URL,
  compareUtf8Bytes,
  parseFloodgateCsaUrl,
  parseFloodgateDailyListingUrl,
  parseFloodgateDailyRatingUrl,
} from "./floodgate-source";

const INTRINSIC_REFLECT_APPLY = Reflect.apply;
const IntrinsicPromise = Promise;
const IntrinsicNumber = Number;
const INTRINSIC_NODE_IS_PROXY = nodeUtilTypes.isProxy;
const INTRINSIC_NODE_IS_ARRAY_BUFFER = nodeUtilTypes.isArrayBuffer;
const INTRINSIC_NODE_IS_SHARED_ARRAY_BUFFER = nodeUtilTypes.isSharedArrayBuffer;
const IntrinsicUint8Array = Uint8Array;
const INTRINSIC_UINT8_ARRAY_SET = IntrinsicUint8Array.prototype.set;
const INTRINSIC_ARRAY_PUSH = Array.prototype.push;
const INTRINSIC_ARRAY_SHIFT = Array.prototype.shift;
const INTRINSIC_ARRAY_SORT = Array.prototype.sort;
const INTRINSIC_ARRAY_INDEX_OF = Array.prototype.indexOf;
const INTRINSIC_ARRAY_SPLICE = Array.prototype.splice;
const INTRINSIC_REGEXP_TEST = RegExp.prototype.test;
const INTRINSIC_NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const INTRINSIC_NUMBER_IS_FINITE = Number.isFinite;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(
  IntrinsicUint8Array.prototype,
) as object;
const INTRINSIC_TYPED_ARRAY_BYTE_LENGTH_GETTER = (() => {
  const getter = Object.getOwnPropertyDescriptor(
    TYPED_ARRAY_PROTOTYPE,
    "byteLength",
  )?.get;
  if (!getter) throw new Error("Uint8Array byteLength getter is unavailable");
  return getter;
})();
const INTRINSIC_STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const INTRINSIC_PERFORMANCE_NOW = nodePerformance.now;
const INTRINSIC_SET_TIMEOUT = setTimeout;
const CONTENT_LENGTH_RE = /^(0|[1-9]\d*)$/;

function intrinsicIsProxy(value: unknown): boolean {
  return INTRINSIC_REFLECT_APPLY(INTRINSIC_NODE_IS_PROXY, nodeUtilTypes, [
    value,
  ]) as boolean;
}

function intrinsicIsArrayBuffer(value: unknown): boolean {
  return INTRINSIC_REFLECT_APPLY(
    INTRINSIC_NODE_IS_ARRAY_BUFFER,
    nodeUtilTypes,
    [value],
  ) as boolean;
}

function intrinsicIsSharedArrayBuffer(value: unknown): boolean {
  return INTRINSIC_REFLECT_APPLY(
    INTRINSIC_NODE_IS_SHARED_ARRAY_BUFFER,
    nodeUtilTypes,
    [value],
  ) as boolean;
}

function intrinsicIsSafeInteger(value: unknown): boolean {
  return INTRINSIC_REFLECT_APPLY(
    INTRINSIC_NUMBER_IS_SAFE_INTEGER,
    IntrinsicNumber,
    [value],
  ) as boolean;
}

function intrinsicIsFiniteNumber(value: unknown): boolean {
  return INTRINSIC_REFLECT_APPLY(INTRINSIC_NUMBER_IS_FINITE, IntrinsicNumber, [
    value,
  ]) as boolean;
}

function pushArrayValue<T>(target: T[], value: T): void {
  INTRINSIC_REFLECT_APPLY(INTRINSIC_ARRAY_PUSH, target, [value]);
}

function shiftArrayValue<T>(target: T[]): T | undefined {
  return INTRINSIC_REFLECT_APPLY(INTRINSIC_ARRAY_SHIFT, target, []) as
    T | undefined;
}

function sortArrayValues<T>(
  target: T[],
  compare: (left: T, right: T) => number,
): void {
  INTRINSIC_REFLECT_APPLY(INTRINSIC_ARRAY_SORT, target, [compare]);
}

function removeArrayValue<T>(target: T[], value: T): void {
  const index = INTRINSIC_REFLECT_APPLY(INTRINSIC_ARRAY_INDEX_OF, target, [
    value,
  ]) as number;
  if (index >= 0) {
    INTRINSIC_REFLECT_APPLY(INTRINSIC_ARRAY_SPLICE, target, [index, 1]);
  }
}

interface SettlementSignal {
  readonly promise: Promise<void>;
  resolve(): void;
}

function createSettlementSignal(): SettlementSignal {
  let resolve!: () => void;
  const promise = new IntrinsicPromise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

export const FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS = 4 as const;
export const FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS = 100 as const;
export const FLOODGATE_REQUEST_USER_AGENT =
  "nextjs-portfolio-floodgate-lock/1.0" as const;

export type FloodgateRequestKind =
  "daily_listing" | "daily_rating" | "period_end_inventory" | "csa";

export interface FloodgateRequest {
  readonly kind: FloodgateRequestKind;
  readonly url: string;
}

export interface FloodgateFetchedResponse extends FloodgateRequest {
  readonly status: number;
  readonly contentEncoding: null | "identity";
  readonly bytes: Uint8Array;
}

export interface FloodgateFetchResponse {
  readonly status: number;
  readonly url: string;
  readonly redirected: boolean;
  readonly headers: Pick<Headers, "get">;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FloodgateFetch = (
  url: string,
  init: RequestInit,
) => Promise<FloodgateFetchResponse>;

interface FloodgateProgressBase extends FloodgateRequest {
  readonly inFlightRequests: number;
  readonly settledRequests: number;
  readonly totalRequests: number;
}

export interface FloodgateRequestStartedProgress extends FloodgateProgressBase {
  readonly type: "started";
}

export interface FloodgateRequestCompletedProgress extends FloodgateProgressBase {
  readonly type: "completed";
  readonly status: number;
}

export interface FloodgateRequestFailedProgress extends FloodgateProgressBase {
  readonly type: "failed";
  readonly error: unknown;
}

export type FloodgateRequestProgress =
  | FloodgateRequestStartedProgress
  | FloodgateRequestCompletedProgress
  | FloodgateRequestFailedProgress;

interface FloodgateRequestSchedulerRuntimeDependencies {
  readonly fetchImpl?: FloodgateFetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly onProgress?: (progress: FloodgateRequestProgress) => void;
}

interface FloodgateSharedStartPermit {
  markStarted(): void;
  release(): void;
}

interface FloodgateSharedStartReservation {
  readonly promise: Promise<FloodgateSharedStartPermit | null>;
  cancel(): void;
}

interface FloodgateSharedStartGate {
  reserve(): FloodgateSharedStartReservation;
}

export interface FloodgateProductionSchedulerDependencies {
  readonly fetchImpl?: FloodgateFetch;
  readonly onProgress?: (progress: FloodgateRequestProgress) => void;
}

export interface NonProductionFloodgateSchedulerDependenciesForTests {
  readonly fetchImpl: FloodgateFetch;
  readonly now: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly onProgress?: (progress: FloodgateRequestProgress) => void;
}

export interface FloodgateRequestScheduler {
  run(
    requests: readonly FloodgateRequest[],
  ): Promise<readonly FloodgateFetchedResponse[]>;
}

export interface NonProductionFloodgateSchedulerPolicyForTests {
  readonly maximumInflightRequests: number;
  readonly minimumRequestStartIntervalMs: number;
}

const REQUEST_KINDS = new Set<FloodgateRequestKind>([
  "daily_listing",
  "daily_rating",
  "period_end_inventory",
  "csa",
]);

const PRODUCTION_POLICY = Object.freeze({
  maximumInflightRequests: FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS,
  minimumRequestStartIntervalMs: FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS,
});

function fail(message: string): never {
  throw new Error(`invalid Floodgate request schedule: ${message}`);
}

function validatePolicy(
  policy: NonProductionFloodgateSchedulerPolicyForTests,
): Readonly<NonProductionFloodgateSchedulerPolicyForTests> {
  if (
    !intrinsicIsSafeInteger(policy.maximumInflightRequests) ||
    policy.maximumInflightRequests <= 0
  ) {
    fail("maximumInflightRequests must be a positive safe integer");
  }
  if (
    !intrinsicIsSafeInteger(policy.minimumRequestStartIntervalMs) ||
    policy.minimumRequestStartIntervalMs < 0
  ) {
    fail("minimumRequestStartIntervalMs must be a nonnegative safe integer");
  }
  return Object.freeze({ ...policy });
}

function validateFloodgateUrl(
  rawUrl: unknown,
  kind: FloodgateRequestKind,
  label: string,
): string {
  if (
    typeof rawUrl !== "string" ||
    rawUrl.length === 0 ||
    rawUrl !== rawUrl.trim() ||
    /[\u0000-\u001f\u007f\\]/.test(rawUrl)
  ) {
    fail(`${label} must be nonempty canonical URL text`);
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail(`${label} is not an absolute URL`);
  }
  if (
    url.href !== rawUrl ||
    url.protocol !== "https:" ||
    url.origin !== FLOODGATE_ORIGIN ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    fail(
      `${label} must use the exact canonical Floodgate HTTPS origin without credentials, port, query, or fragment`,
    );
  }
  let canonical: string;
  if (kind === "daily_listing") {
    canonical = parseFloodgateDailyListingUrl(url.href).url;
  } else if (kind === "daily_rating") {
    canonical = parseFloodgateDailyRatingUrl(url.href).url;
  } else if (kind === "period_end_inventory") {
    if (url.href !== FLOODGATE_PERIOD_END_INVENTORY_URL) {
      fail(`${label} must use the exact period-end inventory URL`);
    }
    canonical = FLOODGATE_PERIOD_END_INVENTORY_URL;
  } else {
    canonical = parseFloodgateCsaUrl(url.href).url;
  }
  if (canonical !== rawUrl) fail(`${label} must use canonical URL spelling`);
  return canonical;
}

function validateRequests(
  input: readonly FloodgateRequest[],
): readonly Readonly<FloodgateRequest>[] {
  if (intrinsicIsProxy(input) || !Array.isArray(input)) {
    fail("requests must be a plain array");
  }
  const inputNames = Object.getOwnPropertyNames(input);
  const expectedInputNames = new Set<string>(["length"]);
  for (let index = 0; index < input.length; index += 1) {
    expectedInputNames.add(String(index));
  }
  if (
    Object.getPrototypeOf(input) !== Array.prototype ||
    Object.getOwnPropertySymbols(input).length !== 0 ||
    inputNames.length !== input.length + 1 ||
    inputNames.some((name) => !expectedInputNames.has(name))
  ) {
    fail("requests must be a dense plain array with no hidden fields");
  }
  const urls = new Set<string>();
  const requests: Readonly<FloodgateRequest>[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const slotDescriptor = Object.getOwnPropertyDescriptor(
      input,
      String(index),
    );
    if (
      !slotDescriptor ||
      !("value" in slotDescriptor) ||
      !slotDescriptor.enumerable
    ) {
      fail(`requests[${index}] must be an enumerable data property`);
    }
    const rawRequest = slotDescriptor.value as FloodgateRequest;
    if (
      intrinsicIsProxy(rawRequest) ||
      rawRequest === null ||
      typeof rawRequest !== "object" ||
      Array.isArray(rawRequest) ||
      Object.getPrototypeOf(rawRequest) !== Object.prototype
    ) {
      fail(`requests[${index}] must be a plain object`);
    }
    if (Object.getOwnPropertySymbols(rawRequest).length !== 0) {
      fail(`requests[${index}] must not contain symbol keys`);
    }
    const keys = Object.getOwnPropertyNames(rawRequest);
    sortArrayValues(keys, compareUtf8Bytes);
    if (keys.length !== 2 || keys[0] !== "kind" || keys[1] !== "url") {
      fail(`requests[${index}] must contain exactly kind and url`);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(rawRequest, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(`requests[${index}].${key} must be an enumerable data property`);
      }
    }
    if (!REQUEST_KINDS.has(rawRequest.kind)) {
      fail(`requests[${index}].kind is unsupported`);
    }
    const url = validateFloodgateUrl(
      rawRequest.url,
      rawRequest.kind,
      `requests[${index}].url`,
    );
    if (urls.has(url)) fail(`requests repeat URL ${url}`);
    urls.add(url);
    pushArrayValue(requests, Object.freeze({ kind: rawRequest.kind, url }));
  }
  sortArrayValues(requests, (left, right) =>
    compareUtf8Bytes(left.url, right.url),
  );
  return Object.freeze(requests);
}

function assertAllowedStatus(kind: FloodgateRequestKind, status: number): void {
  if (!intrinsicIsSafeInteger(status))
    fail("response status must be an integer");
  const allowed =
    kind === "daily_rating" ? status === 200 || status === 404 : status === 200;
  if (!allowed) fail(`HTTP ${status} is forbidden for ${kind}`);
}

function contentLength(
  getHeader: (name: string) => string | null,
): number | null {
  const value = getHeader("content-length");
  if (value === null) return null;
  if (typeof value !== "string") {
    fail("response Content-Length must be a primitive string or absent");
  }
  if (
    !(INTRINSIC_REFLECT_APPLY(INTRINSIC_REGEXP_TEST, CONTENT_LENGTH_RE, [
      value,
    ]) as boolean)
  ) {
    fail("response Content-Length must be a canonical nonnegative integer");
  }
  const parsed = IntrinsicNumber(value);
  if (!intrinsicIsSafeInteger(parsed)) {
    fail("response Content-Length exceeds the safe integer range");
  }
  return parsed;
}

async function exactResponseBytes(
  getHeader: (name: string) => string | null,
  readArrayBuffer: () => Promise<ArrayBuffer>,
): Promise<
  Readonly<{ bytes: Uint8Array; contentEncoding: null | "identity" }>
> {
  const encoding = getHeader("content-encoding");
  if (encoding !== null && typeof encoding !== "string") {
    fail("response Content-Encoding must be a primitive string or absent");
  }
  const normalizedEncoding =
    encoding === null
      ? null
      : (INTRINSIC_REFLECT_APPLY(
          INTRINSIC_STRING_TO_LOWER_CASE,
          encoding,
          [],
        ) as string);
  if (normalizedEncoding !== null && normalizedEncoding !== "identity") {
    fail("response Content-Encoding must be absent or identity");
  }
  const expectedLength = contentLength(getHeader);
  const rawBuffer = await readArrayBuffer();
  if (
    intrinsicIsProxy(rawBuffer) ||
    !intrinsicIsArrayBuffer(rawBuffer) ||
    intrinsicIsSharedArrayBuffer(rawBuffer)
  ) {
    fail("response body must be backed by a plain ArrayBuffer");
  }
  let source: Uint8Array;
  try {
    source = new IntrinsicUint8Array(rawBuffer);
  } catch {
    return fail("response body ArrayBuffer is detached or invalid");
  }
  const sourceByteLength = INTRINSIC_REFLECT_APPLY(
    INTRINSIC_TYPED_ARRAY_BYTE_LENGTH_GETTER,
    source,
    [],
  ) as number;
  const bytes = new IntrinsicUint8Array(sourceByteLength);
  INTRINSIC_REFLECT_APPLY(INTRINSIC_UINT8_ARRAY_SET, bytes, [source]);
  const copiedByteLength = INTRINSIC_REFLECT_APPLY(
    INTRINSIC_TYPED_ARRAY_BYTE_LENGTH_GETTER,
    bytes,
    [],
  ) as number;
  if (copiedByteLength !== sourceByteLength) {
    fail("response body copy changed byte length");
  }
  if (expectedLength !== null && expectedLength !== copiedByteLength) {
    fail(
      `response Content-Length ${expectedLength} does not match ${copiedByteLength} body bytes`,
    );
  }
  return Object.freeze({ bytes, contentEncoding: normalizedEncoding });
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new IntrinsicPromise((resolve) => setTimeout(resolve, milliseconds));
}

function productionNow(): number {
  return INTRINSIC_REFLECT_APPLY(
    INTRINSIC_PERFORMANCE_NOW,
    nodePerformance,
    [],
  ) as number;
}

/**
 * One process-wide production gate. Every scheduler factory shares both its
 * four-request semaphore and its start clock, so creating another scheduler
 * cannot multiply the acquisition policy.
 */
function createProductionStartGate(): FloodgateSharedStartGate {
  type Waiter = {
    state: "queued" | "granted" | "cancelled";
    permit?: FloodgateSharedStartPermit;
    resolve: (permit: FloodgateSharedStartPermit | null) => void;
  };

  const queue: Waiter[] = [];
  let inFlightRequests = 0;
  let startGrantOutstanding = false;
  let nextAllowedStartAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const drain = (): void => {
    if (timer !== null || startGrantOutstanding) return;
    while (queue[0]?.state === "cancelled") shiftArrayValue(queue);
    if (
      queue.length === 0 ||
      inFlightRequests >= FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS
    ) {
      return;
    }

    const observed = productionNow();
    if (nextAllowedStartAt === null) {
      nextAllowedStartAt =
        observed + FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS;
    }
    const remaining = nextAllowedStartAt - observed;
    if (remaining > 0) {
      timer = INTRINSIC_SET_TIMEOUT(() => {
        timer = null;
        drain();
      }, remaining);
      return;
    }

    const waiter = shiftArrayValue(queue);
    if (!waiter || waiter.state !== "queued") {
      drain();
      return;
    }
    inFlightRequests += 1;
    startGrantOutstanding = true;
    let released = false;
    let started = false;
    const permit: FloodgateSharedStartPermit = Object.freeze({
      markStarted(): void {
        if (released || started) {
          fail("production start permit was used more than once");
        }
        started = true;
        startGrantOutstanding = false;
        nextAllowedStartAt =
          productionNow() + FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS;
        drain();
      },
      release(): void {
        if (released) return;
        released = true;
        if (!started) startGrantOutstanding = false;
        inFlightRequests -= 1;
        drain();
      },
    });
    waiter.state = "granted";
    waiter.permit = permit;
    waiter.resolve(permit);
  };

  const reserve = (): FloodgateSharedStartReservation => {
    let resolve!: (permit: FloodgateSharedStartPermit | null) => void;
    const promise = new IntrinsicPromise<FloodgateSharedStartPermit | null>(
      (resolvePromise) => {
        resolve = resolvePromise;
      },
    );
    const waiter: Waiter = { state: "queued", resolve };
    pushArrayValue(queue, waiter);
    drain();
    return Object.freeze({
      promise,
      cancel(): void {
        if (waiter.state === "cancelled") return;
        if (waiter.state === "granted") {
          waiter.permit?.release();
          return;
        }
        waiter.state = "cancelled";
        waiter.resolve(null);
        drain();
      },
    });
  };

  return Object.freeze({ reserve });
}

const PRODUCTION_START_GATE = createProductionStartGate();

function createScheduler(
  rawPolicy: NonProductionFloodgateSchedulerPolicyForTests,
  dependencies: FloodgateRequestSchedulerRuntimeDependencies,
  sharedStartGate?: FloodgateSharedStartGate,
): FloodgateRequestScheduler {
  const policy = validatePolicy(rawPolicy);
  if (
    dependencies.fetchImpl !== undefined &&
    typeof dependencies.fetchImpl !== "function"
  ) {
    fail("fetchImpl must be a function");
  }
  if (
    dependencies.now !== undefined &&
    typeof dependencies.now !== "function"
  ) {
    fail("now must be a function");
  }
  if (
    dependencies.sleep !== undefined &&
    typeof dependencies.sleep !== "function"
  ) {
    fail("sleep must be a function");
  }
  if (
    dependencies.onProgress !== undefined &&
    typeof dependencies.onProgress !== "function"
  ) {
    fail("onProgress must be a function");
  }
  const fetchImpl: FloodgateFetch =
    dependencies.fetchImpl ??
    ((url, init) => fetch(url, init) as Promise<FloodgateFetchResponse>);
  const clock = dependencies.now ?? (() => performance.now());
  const sleep = dependencies.sleep ?? defaultSleep;
  const onProgress = dependencies.onProgress;

  let lastObservedTime: number | null = null;
  let nextAllowedStartAt: number | null = null;
  let running = false;
  let poisoned = false;
  let poisonedError: unknown;

  const now = (): number => {
    const value = clock();
    if (!intrinsicIsFiniteNumber(value))
      fail("monotonic clock returned a nonfinite value");
    if (lastObservedTime !== null && value < lastObservedTime) {
      fail("monotonic clock moved backwards");
    }
    lastObservedTime = value;
    return value;
  };

  const waitUntil = async (target: number): Promise<void> => {
    for (;;) {
      const before = now();
      const remaining = target - before;
      if (remaining <= 0) return;
      await sleep(remaining);
      const after = now();
      if (after <= before) {
        fail("sleep returned before the monotonic clock advanced");
      }
    }
  };

  const run = async (
    requestInput: readonly FloodgateRequest[],
  ): Promise<readonly FloodgateFetchedResponse[]> => {
    const requests = validateRequests(requestInput);
    if (poisoned) {
      throw new Error(
        "Floodgate request scheduler is aborted after a prior failure",
        {
          cause: poisonedError,
        },
      );
    }
    if (running) fail("concurrent run calls are forbidden");
    if (requests.length === 0) return Object.freeze([]);
    running = true;

    let inFlightRequests = 0;
    let settledRequests = 0;
    let failed = false;
    let firstError: unknown;
    const results: FloodgateFetchedResponse[] = [];
    const active: Promise<void>[] = [];
    let settlementSignal = createSettlementSignal();
    let pendingReservation: FloodgateSharedStartReservation | null = null;

    const notifySettlement = (): void => {
      const signal = settlementSignal;
      settlementSignal = createSettlementSignal();
      signal.resolve();
    };

    const recordFailure = (error: unknown): void => {
      if (!failed) {
        failed = true;
        firstError = error;
        poisoned = true;
        poisonedError = error;
        const reservation = pendingReservation;
        pendingReservation = null;
        reservation?.cancel();
      }
    };

    const progress = (event: FloodgateRequestProgress): void => {
      onProgress?.(Object.freeze(event));
    };

    const acquire = async (
      request: Readonly<FloodgateRequest>,
      sharedPermit: FloodgateSharedStartPermit | null,
    ): Promise<FloodgateFetchedResponse> => {
      inFlightRequests += 1;
      let responseStatus: number | undefined;
      let acquisitionSucceeded = false;
      let acquisitionError: unknown;
      try {
        progress({
          type: "started",
          ...request,
          inFlightRequests,
          settledRequests,
          totalRequests: requests.length,
        });
        if (sharedPermit) {
          sharedPermit.markStarted();
        } else {
          const startedAt = now();
          nextAllowedStartAt = startedAt + policy.minimumRequestStartIntervalMs;
        }
        const response = await fetchImpl(request.url, {
          method: "GET",
          redirect: "manual",
          headers: {
            "accept-encoding": "identity",
            "user-agent": FLOODGATE_REQUEST_USER_AGENT,
          },
        });
        if (intrinsicIsProxy(response)) {
          fail("response must not be a Proxy");
        }
        if (response === null || typeof response !== "object") {
          fail("response must be an object");
        }
        const responseUrl = response.url;
        const redirected = response.redirected;
        const status = response.status;
        const headers = response.headers;
        const arrayBufferMethod = response.arrayBuffer;
        if (responseUrl !== request.url) {
          fail("response URL does not exactly match its requested URL");
        }
        if (redirected !== false) {
          fail("redirected responses are forbidden");
        }
        responseStatus = status;
        assertAllowedStatus(request.kind, status);
        if (!headers || intrinsicIsProxy(headers)) {
          fail("response headers are unavailable");
        }
        const headerGet = headers.get;
        if (typeof headerGet !== "function") {
          fail("response headers are unavailable");
        }
        if (typeof arrayBufferMethod !== "function") {
          fail("response arrayBuffer method is unavailable");
        }
        const { bytes, contentEncoding } = await exactResponseBytes(
          (name) =>
            INTRINSIC_REFLECT_APPLY(headerGet, headers, [name]) as
              string | null,
          () =>
            INTRINSIC_REFLECT_APPLY(
              arrayBufferMethod,
              response,
              [],
            ) as Promise<ArrayBuffer>,
        );
        const result = Object.freeze({
          ...request,
          status,
          contentEncoding,
          bytes,
        });
        acquisitionSucceeded = true;
        return result;
      } catch (error) {
        acquisitionError = error;
        throw error;
      } finally {
        inFlightRequests -= 1;
        settledRequests += 1;
        sharedPermit?.release();
        if (acquisitionSucceeded && responseStatus !== undefined) {
          progress({
            type: "completed",
            ...request,
            status: responseStatus,
            inFlightRequests,
            settledRequests,
            totalRequests: requests.length,
          });
        } else {
          try {
            progress({
              type: "failed",
              ...request,
              error: acquisitionError,
              inFlightRequests,
              settledRequests,
              totalRequests: requests.length,
            });
          } catch {
            // Preserve the acquisition error when a reporting hook also fails.
          }
        }
      }
    };

    try {
      if (!sharedStartGate && nextAllowedStartAt === null) {
        nextAllowedStartAt = now() + policy.minimumRequestStartIntervalMs;
      }
      for (
        let requestIndex = 0;
        requestIndex < requests.length;
        requestIndex += 1
      ) {
        const request = requests[requestIndex];
        if (failed) break;
        while (active.length >= policy.maximumInflightRequests && !failed) {
          await settlementSignal.promise;
        }
        if (failed) break;

        let sharedPermit: FloodgateSharedStartPermit | null = null;
        if (sharedStartGate) {
          const reservation = sharedStartGate.reserve();
          pendingReservation = reservation;
          const permit = await reservation.promise;
          if (pendingReservation === reservation) pendingReservation = null;
          if (permit === null || failed) {
            permit?.release();
            break;
          }
          sharedPermit = permit;
        } else {
          await waitUntil(nextAllowedStartAt!);
          if (failed) break;
        }

        const holder: { promise?: Promise<void> } = {};
        const tracked = (async () => {
          try {
            const result = await acquire(request, sharedPermit);
            pushArrayValue(results, result);
          } catch (error) {
            recordFailure(error);
          } finally {
            if (holder.promise) removeArrayValue(active, holder.promise);
            notifySettlement();
          }
        })();
        holder.promise = tracked;
        pushArrayValue(active, tracked);
      }
      while (active.length > 0) await settlementSignal.promise;
      if (failed) throw firstError;
      sortArrayValues(results, (left, right) =>
        compareUtf8Bytes(left.url, right.url),
      );
      return Object.freeze(results);
    } catch (error) {
      recordFailure(error);
      while (active.length > 0) await settlementSignal.promise;
      throw firstError;
    } finally {
      pendingReservation?.cancel();
      pendingReservation = null;
      running = false;
    }
  };

  return Object.freeze({ run });
}

/** Production factory. Its concurrency and pacing policy cannot be overridden. */
export function createFloodgateRequestScheduler(
  dependencies: FloodgateProductionSchedulerDependencies = {},
): FloodgateRequestScheduler {
  if (intrinsicIsProxy(dependencies)) {
    fail("production dependencies must not be a Proxy");
  }
  const dependencyNames =
    dependencies !== null && typeof dependencies === "object"
      ? Object.getOwnPropertyNames(dependencies)
      : [];
  if (
    dependencies === null ||
    typeof dependencies !== "object" ||
    Array.isArray(dependencies) ||
    Object.getPrototypeOf(dependencies) !== Object.prototype ||
    Object.getOwnPropertySymbols(dependencies).length !== 0 ||
    dependencyNames.some((key) => key !== "fetchImpl" && key !== "onProgress")
  ) {
    fail("production dependencies may only provide fetchImpl and onProgress");
  }
  for (const name of dependencyNames) {
    const descriptor = Object.getOwnPropertyDescriptor(dependencies, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`production dependency ${name} must be an enumerable data property`);
    }
  }
  return createScheduler(
    PRODUCTION_POLICY,
    {
      fetchImpl: dependencies.fetchImpl,
      onProgress: dependencies.onProgress,
    },
    PRODUCTION_START_GATE,
  );
}

/**
 * Explicitly non-production constructor for deterministic low-latency tests.
 * Production code must use `createFloodgateRequestScheduler`.
 */
export function createNonProductionFloodgateRequestSchedulerForTests(
  policy: NonProductionFloodgateSchedulerPolicyForTests,
  dependencies: NonProductionFloodgateSchedulerDependenciesForTests,
): FloodgateRequestScheduler {
  return createScheduler(policy, dependencies);
}

export { FLOODGATE_ORIGIN };
