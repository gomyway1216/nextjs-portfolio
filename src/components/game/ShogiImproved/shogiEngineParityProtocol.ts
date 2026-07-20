/**
 * Pure protocol shared by the opt-in browser harness, its Playwright runner,
 * and focused unit tests. Nothing in this module starts a Worker or reads an
 * artifact.
 */

export const SHOGI_ENGINE_PARITY_QUERY_KEY = "__shogiEngineParity" as const;
export const SHOGI_ENGINE_PARITY_QUERY_VALUE =
  "browser-worker-nnue-v1" as const;
export const SHOGI_ENGINE_PARITY_PATH =
  `/games/shogi/engine-parity?${SHOGI_ENGINE_PARITY_QUERY_KEY}=${SHOGI_ENGINE_PARITY_QUERY_VALUE}` as const;
export const SHOGI_ENGINE_PARITY_TEST_ID =
  "shogi-engine-parity-result" as const;
export const SHOGI_ENGINE_PARITY_FIXTURE =
  "bishop-handicap-gote-out-of-book-v1" as const;
export const SHOGI_ENGINE_PARITY_HARNESS_SCHEMA =
  "shogi-engine-browser-worker-parity-harness-v1" as const;

export type ShogiEngineParitySearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

export function isExactShogiEngineParityQuery(
  searchParams: ShogiEngineParitySearchParams,
): boolean {
  const keys = Object.keys(searchParams);
  return (
    keys.length === 1 &&
    keys[0] === SHOGI_ENGINE_PARITY_QUERY_KEY &&
    searchParams[SHOGI_ENGINE_PARITY_QUERY_KEY] ===
      SHOGI_ENGINE_PARITY_QUERY_VALUE
  );
}

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("canonical JSON object is invalid");
  }
  return value as Record<string, unknown>;
}

/** Deterministic JSON used for the single aggregate browser observation. */
export function canonicalShogiEngineParityJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || Object.is(value, -0))
    ) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) => canonicalShogiEngineParityJson(entry))
      .join(",")}]`;
  }
  const object = record(value);
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalShogiEngineParityJson(object[key])}`,
    )
    .join(",")}}`;
}

export interface ShogiEngineParitySha256Identity {
  readonly bytes: number;
  readonly sha256: string;
}

export type ShogiEngineParityFailureCode =
  | "worker-request-failed"
  | "worker-returned-no-move"
  | "worker-returned-illegal-move"
  | "worker-search-path-differed"
  | "worker-diagnostics-failed"
  | "worker-evaluation-path-differed"
  | "nnue-not-loaded-and-enabled"
  | "runtime-wasm-not-ready";

export interface ShogiEngineParityHarnessResult {
  readonly schema: typeof SHOGI_ENGINE_PARITY_HARNESS_SCHEMA;
  readonly status: "pass" | "fail";
  readonly fixture: typeof SHOGI_ENGINE_PARITY_FIXTURE;
  readonly environment: {
    readonly cross_origin_isolated: boolean;
    readonly shared_array_buffer: boolean;
  };
  readonly execution: {
    readonly worker_response: boolean;
    readonly legal_result: boolean;
    readonly search_path: string;
    readonly evaluation_path: string;
  };
  readonly nnue: {
    readonly fetch_status: string;
    readonly fetched_weights: ShogiEngineParitySha256Identity | null;
    readonly loaded: boolean;
    readonly enabled: boolean;
  };
  readonly runtime_wasm: {
    readonly ready: boolean;
    readonly embedded: ShogiEngineParitySha256Identity | null;
  };
  readonly failure_code: ShogiEngineParityFailureCode | null;
}
