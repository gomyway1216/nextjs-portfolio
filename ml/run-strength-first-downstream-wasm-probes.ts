/**
 * Local production-WASM probes used after strength-first candidate selection.
 *
 * The parent Python composition authenticates a fixed reviewed registry and
 * sends one canonical request over stdin. This process revalidates the exact
 * candidate weights, raw embedded WASM, and known-regression fixture before
 * running the existing WASM module. It does not claim browser/Worker parity;
 * that requires the separate opt-in diagnostics in a real browser harness.
 */

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import {
  clearWasmTT,
  getLastWasmSearchStats,
  loadNnueWeights,
  NNUE_WEIGHTS_BYTES,
  setWasmNnueEnabled,
  wasmEvaluateNnueCp,
  wasmSearchBestMove,
} from "../src/components/game/ShogiImproved/wasmEngine";
import { SHOGI_WASM_BASE64 } from "../src/components/game/ShogiImproved/wasm/shogiWasmBase64";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
  teToUsi,
} from "./shogi-sfen";

export const REQUEST_SCHEMA =
  "shogi-floodgate-strength-first-downstream-wasm-probe-request-v1" as const;
export const RESULT_SCHEMA =
  "shogi-floodgate-strength-first-downstream-wasm-probe-result-v1" as const;
export const FIXTURE_SCHEMA =
  "shogi-floodgate-strength-first-known-regression-fixture-v1" as const;
export const WASM_BYTES = 36_545 as const;
export const WASM_SHA256 =
  "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31" as const;

const MAX_STDIN_BYTES = 128 * 1024;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const USI_RE = /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/u;

interface Identity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
}

interface ProbeRequest {
  readonly schema: typeof REQUEST_SCHEMA;
  readonly candidate_weights: Identity;
  readonly known_regression_fixture: Identity;
  readonly production_wasm: Identity;
  readonly search_time_budgets_ms: readonly number[];
}

interface RegressionFixture {
  readonly schema: typeof FIXTURE_SCHEMA;
  readonly bad_move: "P*8f";
  readonly stable_good_move: "3a4b";
  readonly parent_sfen: string;
  readonly parent_ply: number;
  readonly candidates: readonly Readonly<{
    readonly move: string;
    readonly child_sfen: string;
  }>[];
}

interface SearchResult {
  readonly bestmove: string;
  readonly legal: boolean;
}

export interface ProbeDependencies {
  readonly search: (
    fixture: RegressionFixture,
    maxTimeMs: number,
    maxDepth: number,
  ) => SearchResult;
  readonly evaluateChildCp: (childSfen: string) => number;
}

interface AuthenticatedProbe {
  readonly request: ProbeRequest;
  readonly fixture: RegressionFixture;
  readonly weights: Buffer;
}

function fail(message: string): never {
  throw new Error(message);
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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

function canonicalJson(value: unknown): string {
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
      fail("canonical JSON rejects nonfinite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const object = record(value, "canonical JSON value");
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function validateIdentity(value: unknown, label: string): Identity {
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
    (identity.bytes as number) > MAX_ARTIFACT_BYTES ||
    typeof identity.sha256 !== "string" ||
    !SHA256_RE.test(identity.sha256) ||
    identity.sha256 === "0".repeat(64) ||
    typeof identity.schema !== "string" ||
    identity.schema.length === 0
  ) {
    fail(`${label} identity is invalid`);
  }
  return identity as unknown as Identity;
}

function readIdentity(
  repoRoot: string,
  identity: Identity,
  label: string,
): Buffer {
  const root = realpathSync(repoRoot);
  const absolute = resolve(root, identity.path);
  const real = realpathSync(absolute);
  if (
    real !== absolute ||
    (!real.startsWith(`${root}${sep}`) && real !== root)
  ) {
    fail(`${label} escapes the repository`);
  }
  const metadata = statSync(real);
  if (
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    metadata.size !== identity.bytes
  ) {
    fail(`${label} file identity differs`);
  }
  const bytes = readFileSync(real);
  if (digest(bytes) !== identity.sha256) fail(`${label} SHA-256 differs`);
  return bytes;
}

function validateFixture(value: unknown): RegressionFixture {
  const fixture = record(value, "known-regression fixture");
  exactKeys(
    fixture,
    [
      "bad_move",
      "candidates",
      "parent_ply",
      "parent_sfen",
      "schema",
      "stable_good_move",
    ],
    "known-regression fixture",
  );
  if (
    fixture.schema !== FIXTURE_SCHEMA ||
    fixture.bad_move !== "P*8f" ||
    fixture.stable_good_move !== "3a4b" ||
    typeof fixture.parent_sfen !== "string" ||
    fixture.parent_sfen.length === 0 ||
    !Number.isSafeInteger(fixture.parent_ply) ||
    (fixture.parent_ply as number) < 0 ||
    !Array.isArray(fixture.candidates) ||
    fixture.candidates.length < 2
  ) {
    fail("known-regression fixture header is invalid");
  }
  const parsed = positionFromSfen(fixture.parent_sfen);
  if (parsed.moveNumber !== (fixture.parent_ply as number) + 1) {
    fail("known-regression fixture ply differs from SFEN");
  }
  const legal = rulesCompleteLegalMoves(parsed.position).map(
    (entry) => entry.usi,
  );
  const candidates = fixture.candidates.map((entry, index) => {
    const candidate = record(entry, `known-regression candidate ${index}`);
    exactKeys(
      candidate,
      ["child_sfen", "move"],
      `known-regression candidate ${index}`,
    );
    if (
      typeof candidate.move !== "string" ||
      !USI_RE.test(candidate.move) ||
      typeof candidate.child_sfen !== "string" ||
      candidate.child_sfen.length === 0 ||
      candidate.child_sfen !==
        childSfenAfterUsi(fixture.parent_sfen as string, candidate.move)
    ) {
      fail(`known-regression candidate ${index} is invalid`);
    }
    return { move: candidate.move, child_sfen: candidate.child_sfen };
  });
  const moves = candidates.map((candidate) => candidate.move);
  if (
    moves.some((move, index) => index > 0 && moves[index - 1] >= move) ||
    moves.length !== legal.length ||
    moves.some((move, index) => move !== legal[index]) ||
    !moves.includes("P*8f") ||
    !moves.includes("3a4b")
  ) {
    fail("known-regression candidates are not the exact legal move set");
  }
  return {
    schema: FIXTURE_SCHEMA,
    bad_move: "P*8f",
    stable_good_move: "3a4b",
    parent_sfen: fixture.parent_sfen as string,
    parent_ply: fixture.parent_ply as number,
    candidates,
  };
}

export function validateRegressionFixtureForTests(
  value: unknown,
): RegressionFixture {
  return validateFixture(value);
}

function retainSensitiveBufferOnSuccess<T>(
  bytes: Buffer,
  authenticateRemainingArtifacts: () => T,
): T {
  try {
    return authenticateRemainingArtifacts();
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

export function retainSensitiveBufferOnSuccessForTests<T>(
  bytes: Buffer,
  authenticateRemainingArtifacts: () => T,
): T {
  return retainSensitiveBufferOnSuccess(bytes, authenticateRemainingArtifacts);
}

function authenticateRequest(
  repoRoot: string,
  value: unknown,
): AuthenticatedProbe {
  const request = record(value, "WASM probe request");
  exactKeys(
    request,
    [
      "candidate_weights",
      "known_regression_fixture",
      "production_wasm",
      "schema",
      "search_time_budgets_ms",
    ],
    "WASM probe request",
  );
  if (
    request.schema !== REQUEST_SCHEMA ||
    !Array.isArray(request.search_time_budgets_ms) ||
    request.search_time_budgets_ms.length === 0 ||
    request.search_time_budgets_ms.some(
      (value) => !Number.isSafeInteger(value) || (value as number) <= 0,
    ) ||
    request.search_time_budgets_ms.some(
      (value, index, values) => index > 0 && values[index - 1] >= value,
    )
  ) {
    fail("WASM probe request header is invalid");
  }
  const candidateWeights = validateIdentity(
    request.candidate_weights,
    "candidate weights",
  );
  const fixtureIdentity = validateIdentity(
    request.known_regression_fixture,
    "known-regression fixture",
  );
  const wasmIdentity = validateIdentity(
    request.production_wasm,
    "production WASM",
  );
  if (
    candidateWeights.bytes !== NNUE_WEIGHTS_BYTES ||
    wasmIdentity.schema !==
      "shogi-floodgate-strength-first-production-wasm-v1" ||
    fixtureIdentity.schema !==
      "shogi-floodgate-strength-first-known-regression-fixture-v1"
  ) {
    fail("WASM probe artifact schema or size differs");
  }
  const weights = readIdentity(repoRoot, candidateWeights, "candidate weights");
  return retainSensitiveBufferOnSuccess(weights, () => {
    const wasm = readIdentity(repoRoot, wasmIdentity, "production WASM");
    const embeddedWasm = Buffer.from(SHOGI_WASM_BASE64, "base64");
    if (
      wasm.byteLength !== WASM_BYTES ||
      digest(wasm) !== WASM_SHA256 ||
      !wasm.equals(embeddedWasm) ||
      !WebAssembly.validate(wasm)
    ) {
      fail("production WASM differs from the embedded browser engine");
    }
    const fixtureRaw = readIdentity(
      repoRoot,
      fixtureIdentity,
      "known-regression fixture",
    );
    const fixtureText = fixtureRaw.toString("utf8");
    const fixtureValue = JSON.parse(fixtureText) as unknown;
    if (`${canonicalJson(fixtureValue)}\n` !== fixtureText) {
      fail("known-regression fixture is not canonical JSON");
    }
    return {
      request: {
        schema: REQUEST_SCHEMA,
        candidate_weights: candidateWeights,
        known_regression_fixture: fixtureIdentity,
        production_wasm: wasmIdentity,
        search_time_budgets_ms: request.search_time_budgets_ms as number[],
      },
      fixture: validateFixture(fixtureValue),
      weights,
    };
  });
}

function realSearch(
  fixture: RegressionFixture,
  maxTimeMs: number,
  maxDepth: number,
): SearchResult {
  const parsed = positionFromSfen(fixture.parent_sfen);
  clearWasmTT();
  const move = wasmSearchBestMove(
    parsed.position,
    fixture.parent_ply,
    maxTimeMs,
    maxDepth,
    10,
  );
  const bestmove = move === null ? "" : teToUsi(move);
  const legal = rulesCompleteLegalMoves(parsed.position).some(
    (candidate) => candidate.usi === bestmove,
  );
  const stats = getLastWasmSearchStats();
  if (
    move === null ||
    !legal ||
    stats === null ||
    (maxTimeMs === 0 && stats.depth !== maxDepth)
  ) {
    fail("production WASM search did not complete its exact contract");
  }
  return { bestmove, legal };
}

function realStaticChildCp(childSfen: string): number {
  const parsed = positionFromSfen(childSfen);
  const value = wasmEvaluateNnueCp(parsed.position);
  if (value === null) fail("production NNUE static evaluation was unavailable");
  return value;
}

function staticRanks(
  fixture: RegressionFixture,
  evaluateChildCp: (childSfen: string) => number,
): Readonly<{ "P*8f": number; "3a4b": number }> {
  const scores = fixture.candidates.map((candidate) => {
    const childCp = evaluateChildCp(candidate.child_sfen);
    if (!Number.isSafeInteger(childCp)) {
      fail(`static evaluation for ${candidate.move} is not an exact integer`);
    }
    return { move: candidate.move, childCp };
  });
  const rank = (move: string): number => {
    const selected = scores.find((value) => value.move === move);
    if (!selected) fail(`static evaluation omitted ${move}`);
    // Values are child-view. Lower child CP is better for the parent.
    // Competition ranking gives equal scores the same rank, so a tie fails.
    return (
      1 + scores.filter((value) => value.childCp < selected.childCp).length
    );
  };
  return { "P*8f": rank("P*8f"), "3a4b": rank("3a4b") };
}

function runProbeCore(
  authenticated: AuthenticatedProbe,
  dependencies: ProbeDependencies,
): Record<string, unknown> {
  const { request, fixture } = authenticated;
  const measuredStaticRanks = staticRanks(
    fixture,
    dependencies.evaluateChildCp,
  );
  const fixedDepthBestmoves: Record<string, string> = {};
  for (const depth of [11, 12] as const) {
    const result = dependencies.search(fixture, 0, depth);
    if (!USI_RE.test(result.bestmove) || !result.legal) {
      fail(`fixed-depth ${depth} result is invalid`);
    }
    fixedDepthBestmoves[String(depth)] = result.bestmove;
  }
  const timedBestmoves: {
    time_ms: number;
    run: number;
    bestmove: string;
  }[] = [];
  for (const timeMs of request.search_time_budgets_ms) {
    for (const run of [1, 2, 3] as const) {
      const result = dependencies.search(fixture, timeMs, 32);
      if (!USI_RE.test(result.bestmove) || !result.legal) {
        fail(`timed ${timeMs}ms run ${run} result is invalid`);
      }
      timedBestmoves.push({
        time_ms: timeMs,
        run,
        bestmove: result.bestmove,
      });
    }
  }
  return {
    schema: RESULT_SCHEMA,
    status: "complete-local-wasm-module-probes",
    loaded_weights_sha256: request.candidate_weights.sha256,
    static_ranks: measuredStaticRanks,
    fixed_depth_bestmoves: fixedDepthBestmoves,
    timed_bestmoves: timedBestmoves,
    wasm_module_identity: {
      path: request.production_wasm.path,
      bytes: request.production_wasm.bytes,
      sha256: request.production_wasm.sha256,
      embedded_bytes_equal: true,
    },
    safety: {
      local_only: true,
      network: false,
      cloud: false,
      aws: false,
      live_weight_write: false,
    },
  };
}

export function runProbeCoreForTests(
  authenticated: AuthenticatedProbe,
  dependencies: ProbeDependencies,
): Record<string, unknown> {
  return runProbeCore(authenticated, dependencies);
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
    process.stderr.write(
      `${canonicalJson({ status: "STOP", reason: "arguments-forbidden" })}\n`,
    );
    return 2;
  }
  const input = await readBoundedStdin();
  if (
    input.byteLength === 0 ||
    input[input.byteLength - 1] !== 0x0a ||
    input.subarray(0, input.byteLength - 1).includes(0x0a)
  ) {
    fail("stdin must be one bounded canonical JSON line");
  }
  const text = input.subarray(0, input.byteLength - 1).toString("utf8");
  const value = JSON.parse(text) as unknown;
  if (canonicalJson(value) !== text) fail("stdin is not canonical JSON");
  const authenticated = authenticateRequest(resolve(__dirname, ".."), value);
  let consoleErrors = 0;
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => {
    consoleErrors++;
    originalConsoleError(...values);
  };
  try {
    if (
      !loadNnueWeights(authenticated.weights, 600) ||
      !setWasmNnueEnabled(true)
    ) {
      fail("production WASM rejected the candidate weights");
    }
    const result = runProbeCore(authenticated, {
      search: realSearch,
      evaluateChildCp: realStaticChildCp,
    });
    if (consoleErrors !== 0) {
      fail("local WASM module probe emitted a console error");
    }
    process.stdout.write(`${canonicalJson(result)}\n`);
    return 0;
  } finally {
    authenticated.weights.fill(0);
    console.error = originalConsoleError;
  }
}

if (require.main === module) {
  void main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message.slice(0, 900)
          : "unknown failure";
      process.stderr.write(
        `${canonicalJson({
          status: "STOP",
          reason: "downstream-wasm-probe-failed",
          message,
        })}\n`,
      );
      process.exitCode = 2;
    },
  );
}
