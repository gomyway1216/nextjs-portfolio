/**
 * Measurement-only real-browser parity runner.
 *
 * The caller supplies one canonical request on stdin. This process
 * authenticates a repository-local candidate and the exact production WASM,
 * serves the candidate only by intercepting the fixed NNUE asset request, and
 * requires an out-of-book move from the real browser Worker/WASM/NNUE path.
 * It never writes the shipped asset and does not grant enrollment or A/B
 * authority.
 */

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { chromium, type Page, type Request, type Route } from "@playwright/test";

import {
  canonicalShogiEngineParityJson,
  SHOGI_ENGINE_PARITY_FIXTURE,
  SHOGI_ENGINE_PARITY_HARNESS_SCHEMA,
  SHOGI_ENGINE_PARITY_PATH,
  SHOGI_ENGINE_PARITY_TEST_ID,
  type ShogiEngineParityHarnessResult,
  type ShogiEngineParitySha256Identity,
} from "../src/components/game/ShogiImproved/shogiEngineParityProtocol";

export const BROWSER_WORKER_PARITY_REQUEST_SCHEMA =
  "shogi-floodgate-strength-first-browser-worker-parity-request-v1" as const;
export const BROWSER_WORKER_PARITY_RESULT_SCHEMA =
  "shogi-floodgate-strength-first-browser-worker-parity-result-v1" as const;
export const CANDIDATE_WEIGHTS_SCHEMA =
  "shogi-int16-nnue-weights-bin-v1" as const;
export const PRODUCTION_WASM_SCHEMA =
  "shogi-floodgate-strength-first-production-wasm-v1" as const;
export const NNUE_WEIGHTS_BYTES = 1_185_988 as const;
export const PRODUCTION_WASM_PATH =
  "src/components/game/ShogiImproved/wasm/shogi.wasm" as const;
export const PRODUCTION_WASM_BYTES = 35_597 as const;
export const PRODUCTION_WASM_SHA256 =
  "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c" as const;
export const BROWSER_WORKER_PARITY_ORIGIN =
  "http://127.0.0.1:3000" as const;
export const NNUE_ASSET_URL =
  `${BROWSER_WORKER_PARITY_ORIGIN}/shogi-nnue-weights.bin` as const;

const MAX_STDIN_BYTES = 16 * 1024;
const SHA256_RE = /^[0-9a-f]{64}$/u;

export interface BrowserWorkerParityArtifactIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
}

export interface BrowserWorkerParityRequest {
  readonly schema: typeof BROWSER_WORKER_PARITY_REQUEST_SCHEMA;
  readonly candidate_weights: BrowserWorkerParityArtifactIdentity;
  readonly production_wasm: BrowserWorkerParityArtifactIdentity;
}

interface AuthenticatedBrowserWorkerParityRequest {
  readonly request: BrowserWorkerParityRequest;
  readonly candidateBytes: Buffer;
}

function fail(message: string): never {
  throw new Error(message);
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} fields differ`);
  }
}

function validateArtifactIdentity(
  value: unknown,
  label: string,
): BrowserWorkerParityArtifactIdentity {
  const identity = record(value, label);
  exactKeys(identity, ["bytes", "path", "schema", "sha256"], label);
  if (
    typeof identity.path !== "string" ||
    identity.path.length === 0 ||
    identity.path.includes("\0") ||
    identity.path.includes("\\") ||
    isAbsolute(identity.path) ||
    identity.path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    !Number.isSafeInteger(identity.bytes) ||
    (identity.bytes as number) <= 0 ||
    typeof identity.sha256 !== "string" ||
    !SHA256_RE.test(identity.sha256) ||
    identity.sha256 === "0".repeat(64) ||
    typeof identity.schema !== "string" ||
    identity.schema.length === 0
  ) {
    fail(`${label} identity is invalid`);
  }
  return identity as unknown as BrowserWorkerParityArtifactIdentity;
}

function readAuthenticatedArtifact(
  repoRoot: string,
  identity: BrowserWorkerParityArtifactIdentity,
  label: string,
): Buffer {
  const root = realpathSync(repoRoot);
  const absolute = resolve(root, identity.path);
  const real = realpathSync(absolute);
  if (
    real !== absolute ||
    (real !== root && !real.startsWith(`${root}${sep}`))
  ) {
    fail(`${label} escapes the repository`);
  }
  const before = statSync(real, { bigint: true });
  if (
    !before.isFile() ||
    before.nlink !== BigInt(1) ||
    before.size !== BigInt(identity.bytes)
  ) {
    fail(`${label} file identity differs`);
  }
  const bytes = readFileSync(real);
  const after = statSync(real, { bigint: true });
  if (
    after.dev !== before.dev ||
    after.ino !== before.ino ||
    after.size !== before.size ||
    after.mtimeNs !== before.mtimeNs ||
    digest(bytes) !== identity.sha256
  ) {
    fail(`${label} changed or its SHA-256 differs`);
  }
  return bytes;
}

function authenticateRequest(
  repoRoot: string,
  value: unknown,
): AuthenticatedBrowserWorkerParityRequest {
  const input = record(value, "browser Worker parity request");
  exactKeys(
    input,
    ["candidate_weights", "production_wasm", "schema"],
    "browser Worker parity request",
  );
  if (input.schema !== BROWSER_WORKER_PARITY_REQUEST_SCHEMA) {
    fail("browser Worker parity request schema differs");
  }
  const candidate = validateArtifactIdentity(
    input.candidate_weights,
    "candidate weights",
  );
  const wasm = validateArtifactIdentity(input.production_wasm, "production WASM");
  if (
    candidate.schema !== CANDIDATE_WEIGHTS_SCHEMA ||
    candidate.bytes !== NNUE_WEIGHTS_BYTES
  ) {
    fail("candidate weights schema or size differs");
  }
  if (
    wasm.path !== PRODUCTION_WASM_PATH ||
    wasm.schema !== PRODUCTION_WASM_SCHEMA ||
    wasm.bytes !== PRODUCTION_WASM_BYTES ||
    wasm.sha256 !== PRODUCTION_WASM_SHA256
  ) {
    fail("production WASM identity differs");
  }

  const candidateBytes = readAuthenticatedArtifact(
    repoRoot,
    candidate,
    "candidate weights",
  );
  try {
    const wasmBytes = readAuthenticatedArtifact(
      repoRoot,
      wasm,
      "production WASM",
    );
    const wasmView = new Uint8Array(
      wasmBytes.buffer as ArrayBuffer,
      wasmBytes.byteOffset,
      wasmBytes.byteLength,
    );
    if (!WebAssembly.validate(wasmView)) {
      fail("production WASM is invalid");
    }
  } catch (error) {
    candidateBytes.fill(0);
    throw error;
  }
  return {
    request: {
      schema: BROWSER_WORKER_PARITY_REQUEST_SCHEMA,
      candidate_weights: candidate,
      production_wasm: wasm,
    },
    candidateBytes,
  };
}

function validateShaIdentity(
  value: unknown,
  expected: BrowserWorkerParityArtifactIdentity,
  label: string,
): ShogiEngineParitySha256Identity {
  const identity = record(value, label);
  exactKeys(identity, ["bytes", "sha256"], label);
  if (
    identity.bytes !== expected.bytes ||
    identity.sha256 !== expected.sha256
  ) {
    fail(`${label} differs from the authenticated artifact`);
  }
  return {
    bytes: identity.bytes as number,
    sha256: identity.sha256 as string,
  };
}

function validateHarnessObservation(
  value: unknown,
  candidate: BrowserWorkerParityArtifactIdentity,
  wasm: BrowserWorkerParityArtifactIdentity,
): ShogiEngineParityHarnessResult {
  const observation = record(value, "browser harness observation");
  exactKeys(
    observation,
    [
      "environment",
      "execution",
      "failure_code",
      "fixture",
      "nnue",
      "runtime_wasm",
      "schema",
      "status",
    ],
    "browser harness observation",
  );
  if (
    observation.schema !== SHOGI_ENGINE_PARITY_HARNESS_SCHEMA ||
    observation.status !== "pass" ||
    observation.fixture !== SHOGI_ENGINE_PARITY_FIXTURE ||
    observation.failure_code !== null
  ) {
    fail("browser harness did not report a passing fixed fixture");
  }

  const environment = record(
    observation.environment,
    "browser harness environment",
  );
  exactKeys(
    environment,
    ["cross_origin_isolated", "shared_array_buffer"],
    "browser harness environment",
  );
  if (
    environment.cross_origin_isolated !== true ||
    environment.shared_array_buffer !== true
  ) {
    fail("browser harness is not cross-origin isolated");
  }

  const execution = record(
    observation.execution,
    "browser harness execution",
  );
  exactKeys(
    execution,
    [
      "evaluation_path",
      "legal_result",
      "search_path",
      "worker_response",
    ],
    "browser harness execution",
  );
  if (
    execution.worker_response !== true ||
    execution.legal_result !== true ||
    execution.search_path !== "wasm" ||
    execution.evaluation_path !== "nnue-wasm"
  ) {
    fail("browser harness execution path differs");
  }

  const nnue = record(observation.nnue, "browser harness NNUE");
  exactKeys(
    nnue,
    ["enabled", "fetch_status", "fetched_weights", "loaded"],
    "browser harness NNUE",
  );
  if (
    nnue.fetch_status !== "loaded" ||
    nnue.loaded !== true ||
    nnue.enabled !== true
  ) {
    fail("browser harness NNUE state differs");
  }
  validateShaIdentity(
    nnue.fetched_weights,
    candidate,
    "browser fetched candidate weights",
  );

  const runtimeWasm = record(
    observation.runtime_wasm,
    "browser harness runtime WASM",
  );
  exactKeys(
    runtimeWasm,
    ["embedded", "ready"],
    "browser harness runtime WASM",
  );
  if (runtimeWasm.ready !== true) {
    fail("browser harness runtime WASM is not ready");
  }
  validateShaIdentity(
    runtimeWasm.embedded,
    wasm,
    "browser runtime WASM",
  );
  return value as ShogiEngineParityHarnessResult;
}

function buildAggregateResult(
  request: BrowserWorkerParityRequest,
  observation: ShogiEngineParityHarnessResult,
  externalOrigins: readonly string[],
  interceptCount: number,
): Record<string, unknown> {
  return {
    schema: BROWSER_WORKER_PARITY_RESULT_SCHEMA,
    status: "complete-explicit-artifact-browser-worker-parity",
    fixture: observation.fixture,
    candidate_weights: request.candidate_weights,
    runtime_wasm: request.production_wasm,
    environment: observation.environment,
    execution: observation.execution,
    engine_state: {
      nnue_fetch_status: observation.nnue.fetch_status,
      nnue_loaded: observation.nnue.loaded,
      nnue_enabled: observation.nnue.enabled,
      wasm_ready: observation.runtime_wasm.ready,
    },
    network: {
      loopback_origin: BROWSER_WORKER_PARITY_ORIGIN,
      exact_candidate_asset_intercepts: interceptCount,
      external_origins: externalOrigins,
    },
    safety: {
      measurement_only: true,
      candidate_served_from_memory: true,
      live_asset_modified: false,
      live_weight_write: false,
      cloud: false,
      aws: false,
      gcp: false,
      vercel: false,
      firebase: false,
      raw_position_published: false,
    },
    nonclaims: {
      candidate_enrollment_verified: false,
      real_selected_candidate_measured: false,
      served_app_build_identity_verified: false,
      standalone_result_is_formal_parity_evidence: false,
      formal_ab_ready: false,
      formal_ab_games: 0,
      external_calibration_games: 0,
      strength_improved: false,
      high_dan_calibrated: false,
      live_weights_changed: false,
    },
  };
}

async function runAuthenticatedInPage(
  page: Page,
  authenticated: AuthenticatedBrowserWorkerParityRequest,
): Promise<Record<string, unknown>> {
  const externalOrigins = new Set<string>();
  let interceptCount = 0;
  const onRequest = (request: Request): void => {
    const url = request.url();
    if (url.startsWith("blob:") || url.startsWith("data:")) return;
    try {
      const origin = new URL(url).origin;
      if (origin !== BROWSER_WORKER_PARITY_ORIGIN) {
        externalOrigins.add(origin);
      }
    } catch {
      externalOrigins.add("invalid-url");
    }
  };
  const serveCandidate = async (route: Route): Promise<void> => {
    interceptCount++;
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      headers: {
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": "no-store",
      },
      body: authenticated.candidateBytes,
    });
  };

  page.on("request", onRequest);
  await page.route(NNUE_ASSET_URL, serveCandidate);
  try {
    const response = await page.goto(
      `${BROWSER_WORKER_PARITY_ORIGIN}${SHOGI_ENGINE_PARITY_PATH}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    if (
      response === null ||
      response.status() !== 200 ||
      response.headers()["cross-origin-opener-policy"] !== "same-origin" ||
      response.headers()["cross-origin-embedder-policy"] !== "require-corp"
    ) {
      fail("diagnostics document isolation headers differ");
    }
    if (
      page.url() !==
      `${BROWSER_WORKER_PARITY_ORIGIN}${SHOGI_ENGINE_PARITY_PATH}`
    ) {
      fail("diagnostics navigation escaped the fixed local URL");
    }
    await page.waitForFunction(
      (testId) => {
        const output = document.querySelector(
          `[data-testid="${testId}"]`,
        );
        return (
          output instanceof HTMLElement &&
          output.dataset.status !== undefined &&
          output.dataset.status !== "running"
        );
      },
      SHOGI_ENGINE_PARITY_TEST_ID,
      { timeout: 45_000 },
    );
    const output = page.getByTestId(SHOGI_ENGINE_PARITY_TEST_ID);
    const text = await output.textContent();
    if (!text) fail("browser harness emitted no aggregate observation");
    const value = JSON.parse(text) as unknown;
    if (canonicalShogiEngineParityJson(value) !== text) {
      fail("browser harness observation is not canonical JSON");
    }
    const observation = validateHarnessObservation(
      value,
      authenticated.request.candidate_weights,
      authenticated.request.production_wasm,
    );
    if (interceptCount !== 1) {
      fail("candidate asset was not intercepted exactly once");
    }
    const sortedExternalOrigins = [...externalOrigins].sort();
    if (sortedExternalOrigins.length !== 0) {
      fail("diagnostics page contacted an external origin");
    }
    return buildAggregateResult(
      authenticated.request,
      observation,
      sortedExternalOrigins,
      interceptCount,
    );
  } finally {
    page.off("request", onRequest);
    await page.unroute(NNUE_ASSET_URL, serveCandidate);
  }
}

function revalidateArtifacts(
  repoRoot: string,
  request: BrowserWorkerParityRequest,
): void {
  const candidate = readAuthenticatedArtifact(
    repoRoot,
    request.candidate_weights,
    "candidate weights postflight",
  );
  const wasm = readAuthenticatedArtifact(
    repoRoot,
    request.production_wasm,
    "production WASM postflight",
  );
  candidate.fill(0);
  wasm.fill(0);
}

export function authenticateBrowserWorkerParityRequestForTests(
  repoRoot: string,
  value: unknown,
): BrowserWorkerParityRequest {
  const authenticated = authenticateRequest(repoRoot, value);
  authenticated.candidateBytes.fill(0);
  return authenticated.request;
}

export function validateBrowserWorkerHarnessObservationForTests(
  value: unknown,
  candidate: BrowserWorkerParityArtifactIdentity,
  wasm: BrowserWorkerParityArtifactIdentity,
): ShogiEngineParityHarnessResult {
  return validateHarnessObservation(value, candidate, wasm);
}

export async function runBrowserWorkerParityWithPageForTests(
  page: Page,
  repoRoot: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  const authenticated = authenticateRequest(repoRoot, value);
  try {
    const result = await runAuthenticatedInPage(page, authenticated);
    revalidateArtifacts(repoRoot, authenticated.request);
    return result;
  } finally {
    authenticated.candidateBytes.fill(0);
  }
}

async function readBoundedStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of process.stdin) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.byteLength;
    if (total > MAX_STDIN_BYTES) fail("stdin exceeds the hard byte limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function main(): Promise<number> {
  if (process.argv.length !== 2) {
    fail("arguments are forbidden");
  }
  const input = await readBoundedStdin();
  if (
    input.byteLength === 0 ||
    input[input.byteLength - 1] !== 0x0a ||
    input.subarray(0, input.byteLength - 1).includes(0x0a)
  ) {
    fail("stdin must contain one canonical JSON line");
  }
  const text = input.subarray(0, input.byteLength - 1).toString("utf8");
  const value = JSON.parse(text) as unknown;
  if (canonicalShogiEngineParityJson(value) !== text) {
    fail("stdin is not canonical JSON");
  }

  const repoRoot = resolve(__dirname, "..");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const result = await runBrowserWorkerParityWithPageForTests(
      page,
      repoRoot,
      value,
    );
    process.stdout.write(
      `${canonicalShogiEngineParityJson(result)}\n`,
    );
    return 0;
  } finally {
    await browser.close();
  }
}

if (typeof require !== "undefined" && require.main === module) {
  void main().then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.stderr.write(
        `${canonicalShogiEngineParityJson({
          status: "STOP",
          reason: "browser-worker-parity-measurement-failed",
        })}\n`,
      );
      process.exitCode = 2;
    },
  );
}
