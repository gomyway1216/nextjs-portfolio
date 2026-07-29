/**
 * Argumentless production orchestration for the preregistered sealed-512 lane.
 *
 * This CLI never invents labels or scores. It authenticates the checked-in
 * post-phase registry, the phase-1 known-eval sources, the protected raw
 * holdout, the fixed legal enumerator and the fixed teacher receipt before it
 * starts a YaneuraOu process. Outputs are create-only through the primitives in
 * child_board_sealed512_pipeline.ts.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  BROWSER_CONFUSION_RECEIPT_SCHEMA,
  type FixedMoveTeacher,
} from "./build-browser-confusion-ranking-teacher";
import {
  FIXED_SEALED_PARENTS,
  FIXED_SHARDS,
  FIXED_TEACHER_DEPTH,
  buildCleanDerivativeFromAuthenticatedSnapshot,
  finalizeLabelShards,
  labelAndPublishShard,
  publishCleanAndSelection,
  selectSealedParents,
  type FileIdentity,
  type PublishedShard,
  type RegisteredCleanExpected,
  type ShardBinding,
} from "./child_board_sealed512_pipeline";
import {
  FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
  type FloodgateFreshFinalRawIdentity,
} from "./floodgate-training-row-validation";
import { compareBytewise } from "./sibling-data";
import { UsiTeacherEngine } from "./usi-engine";

const REGISTRY_SCHEMA =
  "shogi-child-board-strength-candidate-postphase-registry-v1";
const REGISTRY_STATUS =
  "prospective-postphase-interfaces-fixed-protected-data-locked";
const PHASE1_RESULT_SCHEMA = "shogi-child-board-strength-candidate-result-v1";
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;

type JsonObject = Record<string, unknown>;

export interface ProductionContext {
  readonly repoRoot: string;
  readonly registry: JsonObject;
  readonly sealed: JsonObject;
  readonly execution: JsonObject;
  readonly clean: ReturnType<
    typeof buildCleanDerivativeFromAuthenticatedSnapshot
  >;
  readonly selection: ReturnType<typeof selectSealedParents>;
  readonly paths: {
    readonly cleanDerivative: string;
    readonly cleanDerivativeReceipt: string;
    readonly selectedParentIds: string;
    readonly selectionReceipt: string;
    readonly shardDirectory: string;
    readonly shardReceiptDirectory: string;
    readonly labels: string;
    readonly labelReceipt: string;
  };
  readonly expectedClean: RegisteredCleanExpected;
  readonly legalEnumerator: FileIdentity;
  readonly teacherReceiptPath: string;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("canonical JSON rejects this number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as JsonObject;
    return `{${Object.keys(record)
      .sort(compareBytewise)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

function requiredObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function readRegular(file: string, label: string): Buffer {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  const raw = fs.readFileSync(file);
  const after = fs.lstatSync(file);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error(`${label} changed while reading`);
  }
  return raw;
}

function fileIdentity(file: string, label: string): FileIdentity {
  const raw = readRegular(file, label);
  return Object.freeze({
    path: file,
    bytes: raw.byteLength,
    sha256: sha256(raw),
  });
}

function atomicCreate(file: string, raw: Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    if (!readRegular(file, `existing ${path.basename(file)}`).equals(raw)) {
      throw new Error(`existing immutable output differs: ${file}`);
    }
    return;
  }
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp-${process.pid}-${sha256(
      `${file}\0${Date.now()}\0${Math.random()}`,
    )}`,
  );
  const descriptor = fs.openSync(
    temporary,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, raw);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.linkSync(temporary, file);
    fs.unlinkSync(temporary);
    const directory = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function verifyIdentity(
  actual: FileIdentity,
  expected: JsonObject,
  label: string,
): void {
  if (
    actual.path !== requiredString(expected.path, `${label}.path`) ||
    actual.bytes !== requiredInteger(expected.bytes, `${label}.bytes`) ||
    actual.sha256 !== requiredString(expected.sha256, `${label}.sha256`) ||
    !SHA256_RE.test(actual.sha256)
  ) {
    throw new Error(`${label} path/byte/SHA identity mismatch`);
  }
}

function parseStrictJson(raw: Buffer, label: string): JsonObject {
  if (
    raw.byteLength === 0 ||
    raw.includes(0) ||
    raw.includes(0x0d) ||
    raw.toString("utf8").startsWith("\ufeff")
  ) {
    throw new Error(`${label} JSON framing mismatch`);
  }
  const text = raw.toString("utf8").trimEnd();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not JSON`);
  }
  return requiredObject(parsed, label);
}

function verifiedRegistry(repoRoot: string): JsonObject {
  const file = path.join(
    repoRoot,
    "ml/protocols/child-board-strength-candidate-postphase-v1-registry.json",
  );
  const raw = readRegular(file, "post-phase registry");
  const registry = parseStrictJson(raw, "post-phase registry");
  if (
    registry.schema !== REGISTRY_SCHEMA ||
    registry.status !== REGISTRY_STATUS
  ) {
    throw new Error("post-phase registry schema/status mismatch");
  }
  return registry;
}

/**
 * Rebuild the exact phase-1 known-eval semantic union. This mirrors
 * capacity_policy_value_data.read_known_eval_position_ids.
 */
export function readKnownEvalUnion(
  sources: readonly JsonObject[],
  expected: JsonObject,
): ReadonlySet<string> {
  if (sources.length === 0) throw new Error("known-eval sources are empty");
  const identifiers = new Set<string>();
  const observedSources: JsonObject[] = [];
  for (const [sourceIndex, source] of sources.entries()) {
    const role = requiredString(
      source.role,
      `known source ${sourceIndex}.role`,
    );
    if (role !== "known-eval-sibling" && role !== "known-eval-scalar") {
      throw new Error(`known source ${sourceIndex} role mismatch`);
    }
    const file = requiredString(
      source.path,
      `known source ${sourceIndex}.path`,
    );
    const raw = readRegular(file, `known source ${sourceIndex}`);
    const actual = fileIdentity(file, `known source ${sourceIndex}`);
    verifyIdentity(actual, source, `known source ${sourceIndex}`);
    if (
      raw.byteLength === 0 ||
      raw[raw.byteLength - 1] !== 0x0a ||
      raw.includes(0x0d)
    ) {
      throw new Error(`known source ${sourceIndex} JSONL framing mismatch`);
    }
    const lines = raw.toString("utf8").slice(0, -1).split("\n");
    for (const [lineIndex, line] of lines.entries()) {
      const row = parseStrictJson(
        Buffer.from(line, "utf8"),
        `known source ${sourceIndex} row ${lineIndex + 1}`,
      );
      const fields =
        role === "known-eval-sibling"
          ? (["position_id", "child_position_id"] as const)
          : (["position_id"] as const);
      for (const field of fields) {
        const value = requiredString(
          row[field],
          `known source ${sourceIndex} row ${lineIndex + 1}.${field}`,
        );
        if (!POSITION_ID_RE.test(value)) {
          throw new Error(`known source ${sourceIndex} has invalid ${field}`);
        }
        identifiers.add(value);
      }
    }
    observedSources.push({
      path: file,
      role,
      bytes: raw.byteLength,
      sha256: sha256(raw),
      rows: lines.length,
    });
  }
  const ordered = [...identifiers].sort(compareBytewise);
  const identityBytes = Buffer.from(ordered.join("\n"), "ascii");
  const canonicalFile = Buffer.concat([identityBytes, Buffer.from("\n")]);
  const observed = {
    algorithm:
      "strict-jsonl-semantic-position-union-bytewise-sort-unique-lf-v1",
    sources: observedSources,
    count: ordered.length,
    bytes: canonicalFile.byteLength,
    sha256: sha256(canonicalFile),
    identifiers_sha256: sha256(identityBytes),
  };
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    throw new Error("known-eval semantic union receipt mismatch");
  }
  return new Set(ordered);
}

function phase1KnownEval(repoRoot: string): ReadonlySet<string> {
  const resultPath =
    "/Users/yudaiyaguchi/.codex/shogi-runs/child-board-strength-candidate-v1-phase1/result.json";
  const result = parseStrictJson(
    readRegular(resultPath, "phase-1 result"),
    "phase-1 result",
  );
  if (
    result.schema !== PHASE1_RESULT_SCHEMA ||
    result.status !==
      "complete-phase1-two-scratch-checkpoints-frozen-tune-locked" ||
    result.tune_opened !== false ||
    result.sealed_opened !== false ||
    result.live_weights_changed !== false
  ) {
    throw new Error("phase-1 result is not the closed complete result");
  }
  const fit = requiredObject(result.fit_data_receipt, "phase-1 fit receipt");
  const sources = requiredObject(fit.sources, "phase-1 fit sources");
  const expected = requiredObject(
    sources.known_eval_position_ids,
    "phase-1 known-eval receipt",
  );
  const expectedSources = expected.sources;
  if (!Array.isArray(expectedSources)) {
    throw new Error("phase-1 known-eval source list is malformed");
  }
  // Paths in the phase-1 receipt may refer to the original worktree. They are
  // absolute data paths except for one checked-in source, which is rebound to
  // the current authenticated repo checkout without changing byte/SHA.
  const rebound = expectedSources.map((value, index) => {
    const source = requiredObject(value, `known source ${index}`);
    const original = requiredString(source.path, `known source ${index}.path`);
    const marker = "/ml/data/";
    const offset = original.indexOf(marker);
    const local =
      offset < 0 ? original : path.join(repoRoot, original.slice(offset + 1));
    return offset < 0 || !fs.existsSync(local)
      ? source
      : {
          ...source,
          path: local,
        };
  });
  const reboundExpected = { ...expected, sources: rebound };
  return readKnownEvalUnion(rebound, reboundExpected);
}

function teacherBinding(registeredPath: string): Readonly<{
  receipt: FileIdentity;
  engine: FileIdentity;
  evalDir: string;
}> {
  if (!fs.existsSync(registeredPath)) {
    const manifestPath = path.join(
      path.dirname(registeredPath),
      "manifest.json",
    );
    const manifestRaw = readRegular(
      manifestPath,
      "aggregate teacher dataset manifest",
    );
    const manifest = parseStrictJson(
      manifestRaw,
      "aggregate teacher dataset manifest",
    );
    const input = requiredObject(manifest.input, "aggregate teacher input");
    const common = requiredObject(
      input.common_binding,
      "aggregate teacher common binding",
    );
    const shards = input.shards;
    if (
      manifest.schema !==
        "shogi-browser-confusion-ranking-dataset-manifest-v1" ||
      manifest.status !== "research-data-only-not-deployment-authorization" ||
      common.schema !== BROWSER_CONFUSION_RECEIPT_SCHEMA ||
      !Array.isArray(shards) ||
      shards.length !== FIXED_SHARDS
    ) {
      throw new Error("aggregate teacher dataset manifest mismatch");
    }
    const receiptIdentities = shards.map((value, index) => {
      const shard = requiredObject(value, `aggregate teacher shard ${index}`);
      if (shard.index !== index || shard.total !== FIXED_SHARDS) {
        throw new Error(`aggregate teacher shard ${index} index mismatch`);
      }
      const registered = requiredObject(
        shard.receipt,
        `aggregate teacher shard ${index} receipt`,
      );
      const receiptPath = requiredString(
        registered.path,
        `aggregate teacher shard ${index} receipt path`,
      );
      const actual = fileIdentity(
        receiptPath,
        `aggregate teacher shard ${index} receipt`,
      );
      verifyIdentity(
        actual,
        registered,
        `aggregate teacher shard ${index} receipt`,
      );
      const receipt = parseStrictJson(
        readRegular(receiptPath, `aggregate teacher shard ${index} receipt`),
        `aggregate teacher shard ${index} receipt`,
      );
      for (const key of [
        "schema",
        "status",
        "selection_policy",
        "label_policy",
        "incomplete_parent_policy",
        "source",
        "browser",
        "teacher",
      ] as const) {
        if (canonicalJson(receipt[key]) !== canonicalJson(common[key])) {
          throw new Error(
            `aggregate teacher shard ${index} common binding mismatch: ${key}`,
          );
        }
      }
      return actual;
    });
    const aggregateReceipt = {
      ...common,
      aggregate_manifest: {
        path: manifestPath,
        bytes: manifestRaw.byteLength,
        sha256: sha256(manifestRaw),
      },
      shard_receipts: receiptIdentities,
      derivation:
        "all-16-registered-shard-receipts-equal-aggregate-common-binding-v1",
    };
    atomicCreate(
      registeredPath,
      Buffer.from(`${canonicalJson(aggregateReceipt)}\n`, "utf8"),
    );
  }
  const receipt = fileIdentity(registeredPath, "sealed teacher receipt");
  const value = parseStrictJson(
    readRegular(registeredPath, "sealed teacher receipt"),
    "sealed teacher receipt",
  );
  if (
    value.schema !== BROWSER_CONFUSION_RECEIPT_SCHEMA ||
    value.status !== "research-data-only-not-deployment-authorization"
  ) {
    throw new Error("sealed teacher receipt schema/status mismatch");
  }
  const teacher = requiredObject(value.teacher, "sealed teacher binding");
  if (
    teacher.fixed_depth !== FIXED_TEACHER_DEPTH ||
    teacher.multipv !== 1 ||
    teacher.reset_before_each_candidate !== true ||
    teacher.search_mode !== "unrestricted-search-from-each-legal-child-position"
  ) {
    throw new Error("sealed fixed-move teacher contract mismatch");
  }
  const registeredEngine = requiredObject(
    teacher.engine,
    "sealed teacher engine",
  );
  const enginePath = requiredString(
    registeredEngine.path,
    "sealed teacher engine.path",
  );
  const engine = fileIdentity(enginePath, "sealed teacher engine");
  verifyIdentity(engine, registeredEngine, "sealed teacher engine");
  const evalDir =
    "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/eval/eval";
  const evalStat = fs.lstatSync(evalDir);
  if (!evalStat.isDirectory() || evalStat.isSymbolicLink()) {
    throw new Error("sealed teacher eval directory is unavailable");
  }
  return Object.freeze({ receipt, engine, evalDir });
}

export function loadProductionContext(
  repoRoot = path.resolve(__dirname, ".."),
): ProductionContext {
  const registry = verifiedRegistry(repoRoot);
  const outputs = requiredObject(registry.outputs, "registry outputs");
  const sealedPaths = requiredObject(outputs.sealed, "registry sealed outputs");
  const execution = requiredObject(
    registry.execution_contract,
    "registry execution contract",
  );
  const sealed = requiredObject(execution.sealed, "sealed execution");
  const rawExpected = requiredObject(sealed.source_raw, "sealed raw source");
  const rawPath = requiredString(rawExpected.path, "sealed raw path");
  const raw = readRegular(rawPath, "sealed raw source");
  const roleManifest = parseStrictJson(
    readRegular(
      path.join(path.dirname(rawPath), "manifest.json"),
      "label-free role bundle manifest",
    ),
    "label-free role bundle manifest",
  );
  const roles = requiredObject(roleManifest.roles, "role bundle roles");
  const finalRole = requiredObject(
    roles.fresh_final_holdout,
    "fresh-final role",
  );
  const registeredRaw = requiredObject(
    finalRole.raw_parents,
    "fresh-final raw identity",
  );
  if (
    roleManifest.schema !== "shogi-floodgate-label-free-role-bundle-v2" ||
    roleManifest.status !== "complete-label-free-role-bundle" ||
    registeredRaw.format !== FLOODGATE_TRAINING_RAW_PARENT_FORMAT ||
    registeredRaw.bytes !== rawExpected.bytes ||
    registeredRaw.sha256 !== rawExpected.sha256 ||
    registeredRaw.records !== rawExpected.parents ||
    registeredRaw.games !== rawExpected.games
  ) {
    throw new Error("sealed raw source and role-bundle identity mismatch");
  }
  const rawIdentity = {
    bytes: requiredInteger(registeredRaw.bytes, "sealed raw bytes"),
    format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
    game_ids_sha256: requiredString(
      registeredRaw.game_ids_sha256,
      "sealed raw game IDs SHA",
    ),
    games: requiredInteger(registeredRaw.games, "sealed raw games"),
    parent_ids_sha256: requiredString(
      registeredRaw.parent_ids_sha256,
      "sealed raw parent IDs SHA",
    ),
    path: "fresh-final-holdout.raw.jsonl" as const,
    position_ids_count: requiredInteger(
      registeredRaw.position_ids_count,
      "sealed raw position count",
    ),
    position_ids_sha256: requiredString(
      registeredRaw.position_ids_sha256,
      "sealed raw position IDs SHA",
    ),
    records: requiredInteger(registeredRaw.records, "sealed raw records"),
    sha256: requiredString(registeredRaw.sha256, "sealed raw SHA"),
  } satisfies FloodgateFreshFinalRawIdentity;
  if (
    raw.byteLength !== rawIdentity.bytes ||
    sha256(raw) !== rawIdentity.sha256
  ) {
    throw new Error("sealed raw source byte/SHA identity mismatch");
  }
  const knownEval = phase1KnownEval(repoRoot);
  const registeredKnown = requiredObject(
    sealed.known_eval_union,
    "sealed known-eval union",
  );
  const canonicalKnown = Buffer.from(
    `${[...knownEval].sort(compareBytewise).join("\n")}\n`,
    "ascii",
  );
  if (
    knownEval.size !== registeredKnown.count ||
    canonicalKnown.byteLength !== registeredKnown.bytes ||
    sha256(canonicalKnown) !== registeredKnown.sha256 ||
    sha256(canonicalKnown.subarray(0, canonicalKnown.byteLength - 1)) !==
      registeredKnown.identifiers_sha256
  ) {
    throw new Error("sealed registered known-eval union mismatch");
  }
  const clean = buildCleanDerivativeFromAuthenticatedSnapshot(
    raw,
    rawIdentity,
    knownEval,
  );
  const selectionContract = requiredObject(
    sealed.selection,
    "sealed selection contract",
  );
  const selection = selectSealedParents(
    clean.rows,
    requiredInteger(selectionContract.parents, "sealed parent count"),
    requiredInteger(
      selectionContract.maximum_parents_per_game,
      "sealed maximum parents per game",
    ),
  );
  if (selection.rows.length !== FIXED_SEALED_PARENTS) {
    throw new Error("sealed selection is not exactly 512 parents");
  }
  const expectedClean = requiredObject(
    sealed.clean_derivative_expected,
    "registered clean derivative",
  ) as unknown as RegisteredCleanExpected;
  const labeling = requiredObject(sealed.labeling, "sealed labeling");
  const legalPath = path.join(repoRoot, "ml/shogi-sfen.ts");
  const legalEnumerator = fileIdentity(legalPath, "legal enumerator");
  return Object.freeze({
    repoRoot,
    registry,
    sealed,
    execution,
    clean,
    selection,
    expectedClean,
    legalEnumerator,
    teacherReceiptPath: requiredString(
      labeling.teacher_receipt,
      "sealed teacher receipt path",
    ),
    paths: Object.freeze({
      cleanDerivative: requiredString(
        sealedPaths.clean_derivative,
        "clean derivative path",
      ),
      cleanDerivativeReceipt: requiredString(
        sealedPaths.clean_derivative_receipt,
        "clean derivative receipt path",
      ),
      selectedParentIds: requiredString(
        sealedPaths.selected_parent_ids,
        "selected parent IDs path",
      ),
      selectionReceipt: requiredString(
        sealedPaths.selection_receipt,
        "selection receipt path",
      ),
      shardDirectory: requiredString(
        sealedPaths.label_shards_directory,
        "label shard directory",
      ),
      shardReceiptDirectory: requiredString(
        sealedPaths.label_shard_receipts_directory,
        "label shard receipt directory",
      ),
      labels: requiredString(sealedPaths.labels, "sealed labels path"),
      labelReceipt: requiredString(
        sealedPaths.label_receipt,
        "sealed label receipt path",
      ),
    }),
  });
}

async function prepare(context: ProductionContext) {
  return publishCleanAndSelection(
    context.clean,
    context.selection,
    context.expectedClean,
    {
      cleanDerivative: context.paths.cleanDerivative,
      cleanDerivativeReceipt: context.paths.cleanDerivativeReceipt,
      selectedParentIds: context.paths.selectedParentIds,
      selectionReceipt: context.paths.selectionReceipt,
    },
  );
}

async function bindingFor(
  context: ProductionContext,
  teacherReceipt: FileIdentity,
): Promise<ShardBinding> {
  const prepared = await prepare(context);
  const parent = requiredObject(
    context.registry.parent_protocol,
    "parent protocol",
  );
  return Object.freeze({
    parentProtocolSha256: requiredString(parent.sha256, "parent protocol SHA"),
    cleanDerivativeReceiptSha256: prepared.cleanDerivativeReceipt.sha256,
    selectionReceiptSha256: prepared.selectionReceipt.sha256,
    legalEnumerator: context.legalEnumerator,
    teacherReceipt,
    depth: FIXED_TEACHER_DEPTH,
  });
}

async function createTeacher(
  fixedTeacher: ReturnType<typeof teacherBinding>,
): Promise<UsiTeacherEngine> {
  const teacher = new UsiTeacherEngine({
    engineBin: fixedTeacher.engine.path,
    evalDir: fixedTeacher.evalDir,
    hashMb: 128,
    timeoutMs: 120_000,
  });
  await teacher.init();
  return teacher;
}

function requireTunePass(context: ProductionContext): void {
  const outputs = requiredObject(context.registry.outputs, "registry outputs");
  const tuneOutput = requiredObject(outputs.tune, "registry tune outputs");
  const tuneContract = requiredObject(context.execution.tune, "tune contract");
  const resultPath = requiredString(tuneOutput.result, "tune result path");
  const result = parseStrictJson(
    readRegular(resultPath, "one-shot tune result"),
    "one-shot tune result",
  );
  if (
    result.schema !== tuneOutput.result_schema ||
    result.status !== tuneContract.success_status ||
    result.pass !== true ||
    result.tune_opened !== true ||
    result.sealed_labels_generated !== false ||
    result.sealed_scores_opened !== false ||
    result.live_weights_changed !== false
  ) {
    throw new Error("sealed labels require the exact successful tune result");
  }
}

async function labelShard(
  context: ProductionContext,
  index: number,
): Promise<PublishedShard> {
  requireTunePass(context);
  const fixedTeacher = teacherBinding(context.teacherReceiptPath);
  const binding = await bindingFor(context, fixedTeacher.receipt);
  const teacher = await createTeacher(fixedTeacher);
  try {
    return await labelAndPublishShard({
      selectedRows: context.selection.rows,
      shardIndex: index,
      binding,
      shardDirectory: context.paths.shardDirectory,
      receiptDirectory: context.paths.shardReceiptDirectory,
      teacher,
    });
  } finally {
    await teacher.quit();
  }
}

const recoveryTeacher: FixedMoveTeacher = {
  async resetForParent() {
    throw new Error("finalization cannot generate a missing label shard");
  },
  async search() {
    throw new Error("finalization cannot generate a missing label shard");
  },
};

async function recoverExistingShards(
  context: ProductionContext,
): Promise<readonly PublishedShard[]> {
  requireTunePass(context);
  const fixedTeacher = teacherBinding(context.teacherReceiptPath);
  const binding = await bindingFor(context, fixedTeacher.receipt);
  const shards: PublishedShard[] = [];
  for (let index = 0; index < FIXED_SHARDS; index += 1) {
    const shard = await labelAndPublishShard({
      selectedRows: context.selection.rows,
      shardIndex: index,
      binding,
      shardDirectory: context.paths.shardDirectory,
      receiptDirectory: context.paths.shardReceiptDirectory,
      teacher: recoveryTeacher,
    });
    if (!shard.recovered) {
      throw new Error(`finalization unexpectedly generated shard ${index}`);
    }
    shards.push(shard);
  }
  return Object.freeze(shards);
}

async function finalize(context: ProductionContext) {
  const shards = await recoverExistingShards(context);
  return finalizeLabelShards({
    shards,
    labelsPath: context.paths.labels,
    labelReceiptPath: context.paths.labelReceipt,
    expectedParents: FIXED_SEALED_PARENTS,
  });
}

function shardIndex(argv: readonly string[]): number {
  const value = Number(argv[1]);
  if (!Number.isSafeInteger(value) || value < 0 || value >= FIXED_SHARDS) {
    throw new Error(
      `label-shard requires an integer from 0 to ${FIXED_SHARDS - 1}`,
    );
  }
  return value;
}

export async function runProductionCli(
  argv = process.argv.slice(2),
): Promise<unknown> {
  const command = argv[0];
  if (!["prepare", "label-shard", "finalize", "all"].includes(command)) {
    throw new Error(
      "usage: child_board_sealed512_cli.ts prepare|label-shard INDEX|finalize|all",
    );
  }
  const context = loadProductionContext();
  if (command === "prepare") return prepare(context);
  if (command === "label-shard") return labelShard(context, shardIndex(argv));
  if (command === "finalize") return finalize(context);
  await prepare(context);
  const shards: PublishedShard[] = [];
  for (let index = 0; index < FIXED_SHARDS; index += 1) {
    shards.push(await labelShard(context, index));
  }
  return finalizeLabelShards({
    shards,
    labelsPath: context.paths.labels,
    labelReceiptPath: context.paths.labelReceipt,
    expectedParents: FIXED_SEALED_PARENTS,
  });
}

if (require.main === module) {
  runProductionCli()
    .then((result) => {
      process.stdout.write(`${canonicalJson(result)}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`sealed512 production CLI failed: ${message}\n`);
      process.exitCode = 1;
    });
}
