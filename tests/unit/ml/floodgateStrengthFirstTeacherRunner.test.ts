import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  STRENGTH_FIRST_PARENT_COMPLETION_FORMAT,
  STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
  STRENGTH_FIRST_TRAIN_FORMAT,
  type StrengthFirstSiblingTeacherAdvance,
  type StrengthFirstSiblingTeacherOptions,
} from "../../../ml/generate-sibling-teacher";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
  type FloodgateProductionTeacherAssetAuthorityReceipt,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME,
  bindFloodgateStrengthFirstV8TeacherAuthorityCoreForTests,
  captureFloodgateStrengthFirstV8TeacherAuthorityReceipt,
} from "../../../ml/floodgate-strength-first-v8-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
  FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME,
  FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
  acquireFloodgateStrengthFirstTeacherRunLockCoreForTests,
  floodgateStrengthFirstTeacherPaths,
  runFloodgateStrengthFirstTeacherCore,
  type FloodgateStrengthFirstTeacherFileBinding,
  type FloodgateStrengthFirstTeacherRunnerDependencies,
} from "../../../ml/floodgate-strength-first-teacher-runner";
import {
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
} from "../../../ml/floodgate-training-row-consumer";

const HOME = "/Users/floodgate-test";
const REPOSITORY_ROOT = "/Users/floodgate-test/source";
const RUNNER_REVISION = "1".repeat(40);
const RUN_FINGERPRINT = "2".repeat(64);
const ENGINE_ASSET =
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou;
const ENGINE_RECEIPT_ASSET =
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.receipt;
const EVAL_NN_ASSET = FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn;
const EVAL_TREE_SHA256 =
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.treeSha256;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

interface StoredFile {
  value?: unknown;
  binding: FloodgateStrengthFirstTeacherFileBinding;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bindingForBytes(
  filePath: string,
  outputRoot: string,
  bytes: Uint8Array,
): FloodgateStrengthFirstTeacherFileBinding {
  return Object.freeze({
    path: path.relative(outputRoot, filePath).split(path.sep).join("/"),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  });
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function inputFixture(): Readonly<AuthenticatedFloodgateTrainingRows> {
  return Object.freeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training",
    binding: Object.freeze({
      result_receipt_bytes: 100,
      result_receipt_sha256: "3".repeat(64),
      bundle_manifest_bytes: 200,
      bundle_manifest_sha256: "4".repeat(64),
      bundle_producer_revision: "5".repeat(40),
      verifier_revision: FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
      raw_format: "floodgate-parent-jsonl-v1",
      raw_bytes: 300,
      raw_sha256: "6".repeat(64),
      records: 24_000,
      games: 1_000,
      game_ids_sha256: "7".repeat(64),
      parent_ids_sha256: "8".repeat(64),
      position_ids_count: 24_000,
      position_ids_sha256: "9".repeat(64),
    }),
    rows: Object.freeze([]),
  }) as unknown as Readonly<AuthenticatedFloodgateTrainingRows>;
}

function postflightFixture(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): Readonly<FloodgateTrainingConsumerPostflightReceipt> {
  return Object.freeze({
    schema: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
    status: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
    claim_boundary: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-pinned-bundle-verifier",
    input: Object.freeze({
      schema: input.schema,
      role: input.role,
      binding: input.binding,
    }),
    runtime_claim: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
    postflight: Object.freeze({
      callback_settled_without_value: true,
      filesystem_snapshot_revalidated_after_callback: true,
      input_descriptors_closed: true,
    }),
  });
}

function assetEvidence(
  relativePath: string,
  identity: Readonly<{ readonly bytes: number; readonly sha256: string }>,
  mode: "0600" | "0700",
  inode: number,
) {
  return Object.freeze({
    relative_path: relativePath,
    bytes: identity.bytes,
    sha256: identity.sha256,
    mode,
    identity: Object.freeze({ dev: "1", ino: String(inode) }),
  });
}

function legacyAssetReceiptFixture(): Readonly<
  FloodgateProductionTeacherAssetAuthorityReceipt<"production-fixed-registry-and-deployment-root">
> {
  return Object.freeze({
    contract: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
    execution_boundary: "production-fixed-registry-and-deployment-root",
    runtime: FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
    deployment: {
      layout: "fixed-per-user-application-support-v1",
      owner_uid: 501,
      exact_tree: true,
      private_directories: true,
    },
    assets: {
      engine: {
        yaneuraou: assetEvidence("engine/yaneuraou", ENGINE_ASSET, "0700", 1),
        receipt: assetEvidence(
          "engine/yaneuraou-receipt.json",
          ENGINE_RECEIPT_ASSET,
          "0600",
          2,
        ),
      },
      eval: {
        nn: assetEvidence("eval/nn.bin", EVAL_NN_ASSET, "0600", 3),
        tree_sha256: EVAL_TREE_SHA256,
      },
      stable: {
        plan: assetEvidence(
          "stable/floodgate-plan.json",
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.stable.plan,
          "0600",
          4,
        ),
        wasm: assetEvidence(
          "stable/shogi.wasm",
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.stable.wasm,
          "0600",
          5,
        ),
        weights: assetEvidence(
          "stable/shogi-nnue-weights.bin",
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.stable.weights,
          "0600",
          6,
        ),
        worker: assetEvidence(
          "stable/floodgate-stable-wasm-worker.mjs",
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.stable.worker,
          "0600",
          7,
        ),
      },
    },
    engine: {
      receipt_schema: "shogi-teacher-engine-receipt-v1",
      source_repository: "https://github.com/yaneurao/YaneuraOu.git",
      source_commit: "9133c527791c8b2f5f378a32df29a5e3752bd41b",
      source_commit_date: "2026-07-02T13:41:06+09:00",
      engine_id: "YaneuraOu NNUE 9.60git 64APPLEM1",
      binary_cross_bound: true,
    },
    postverification: {
      embedded_wasm_exactly_equal: true,
      exact_entries_revalidated: true,
      identities_revalidated: true,
      contents_stably_read: true,
    },
  }) as unknown as Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<"production-fixed-registry-and-deployment-root">
  >;
}

function assetReceiptFixture(): Awaited<
  ReturnType<
    FloodgateStrengthFirstTeacherRunnerDependencies["verifyProductionAssets"]
  >
> {
  return bindFloodgateStrengthFirstV8TeacherAuthorityCoreForTests(
    legacyAssetReceiptFixture(),
    501,
  ) as Awaited<
    ReturnType<
      FloodgateStrengthFirstTeacherRunnerDependencies["verifyProductionAssets"]
    >
  >;
}

interface Fixture {
  readonly dependencies: FloodgateStrengthFirstTeacherRunnerDependencies;
  readonly input: Readonly<AuthenticatedFloodgateTrainingRows>;
  readonly postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>;
  readonly storage: Map<string, StoredFile>;
  readonly events: string[];
  readonly targets: number[];
  readonly options: StrengthFirstSiblingTeacherOptions[];
  readonly calls: {
    lock: ReturnType<typeof vi.fn>;
    assets: ReturnType<typeof vi.fn>;
    revision: ReturnType<typeof vi.fn>;
    consume: ReturnType<typeof vi.fn>;
    claimInput: ReturnType<typeof vi.fn>;
    claimPostflight: ReturnType<typeof vi.fn>;
    advance: ReturnType<typeof vi.fn>;
  };
}

function fixture(failTarget?: 100 | 500 | 24_000): Fixture {
  const paths = floodgateStrengthFirstTeacherPaths(HOME, REPOSITORY_ROOT);
  const input = inputFixture();
  const postflight = postflightFixture(input);
  const storage = new Map<string, StoredFile>();
  const events: string[] = [];
  const targets: number[] = [];
  const options: StrengthFirstSiblingTeacherOptions[] = [];
  let remainingFailure = failTarget;
  let prefix100Calls = 0;
  const workBytes = Buffer.from("synthetic complete work\n");
  const trainBytes = Buffer.from("synthetic canonical training rows\n");
  const completionBytes = Buffer.from("synthetic parent completion\n");
  const work = bindingForBytes(
    path.join(paths.stageRoot, "work.jsonl"),
    paths.outputRoot,
    workBytes,
  );
  const train = {
    ...bindingForBytes(
      path.join(paths.stageRoot, "train.jsonl"),
      paths.outputRoot,
      trainBytes,
    ),
    path: "train.jsonl",
    format: STRENGTH_FIRST_TRAIN_FORMAT,
    records: 48_000,
    parents: 24_000,
    games: 1_000,
    game_ids_sha256: "a".repeat(64),
    parent_ids_sha256: "b".repeat(64),
    semantic_position_ids_count: 48_000,
    semantic_position_ids_sha256: "c".repeat(64),
  } as const;
  const completion = {
    ...bindingForBytes(
      path.join(paths.stageRoot, "parent-completion.jsonl"),
      paths.outputRoot,
      completionBytes,
    ),
    path: "parent-completion.jsonl",
    format: STRENGTH_FIRST_PARENT_COMPLETION_FORMAT,
    records: 24_000,
    forced_parents_skipped: 0,
    emitted_parent_groups: 24_000,
    parent_ids_sha256: input.binding.parent_ids_sha256,
    forced_parent_ids_sha256: "e".repeat(64),
    emitted_parent_ids_sha256: "f".repeat(64),
  } as const;
  const manifest = {
    schema: STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
    status: "complete-training-only",
    run_fingerprint: RUN_FINGERPRINT,
    pipeline: {
      source_revision: RUNNER_REVISION,
      tracked_tree_clean: true,
    },
    authenticated_input: {
      bundle_verifier_revision:
        FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
      binding: input.binding,
    },
    source: {
      raw_sha256: input.binding.raw_sha256,
      raw_records: 24_000,
      selected_parents: 24_000,
      selected_parent_ids_sha256: input.binding.parent_ids_sha256,
    },
    teacher: {
      engine_bin_bytes: ENGINE_ASSET.bytes,
      engine_bin_sha256: ENGINE_ASSET.sha256,
      engine_receipt: {
        file: ENGINE_RECEIPT_ASSET,
        content: {},
      },
      eval_files: [{ path: "nn.bin", ...EVAL_NN_ASSET }],
      eval_sha256: EVAL_TREE_SHA256,
      engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
    },
    search: {
      multipv: 12,
      limit: { depth: 16 },
      parallel_engines: 12,
      hash_mb_per_engine: FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
      timeout_ms: 600_000,
    },
    candidate_sets: {},
    progress_checkpoint: {},
    forced_skip_reasons: {
      fewer_than_two_legal_moves: 0,
      search_timeout_no_label: 0,
    },
    parent_completion: completion,
    outputs: { train },
    publication: {
      staged_inside_authenticated_callback: true,
      consumer_postflight_bound: false,
    },
  } as const;
  const manifestBytes = jsonBytes(manifest);
  const manifestBinding = {
    ...bindingForBytes(
      path.join(paths.stageRoot, "manifest.json"),
      paths.outputRoot,
      manifestBytes,
    ),
    path: "manifest.json",
    schema: STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
  } as const;
  const stagedResult = {
    schema: STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
    status: "complete-training-only",
    run_fingerprint: RUN_FINGERPRINT,
    runner_revision: RUNNER_REVISION,
    bundle_verifier_revision:
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
    input_parents: 24_000,
    completed_parents: 24_000,
    forced_parents_skipped: 0,
    forced_skip_reasons: {
      fewer_than_two_legal_moves: 0,
      search_timeout_no_label: 0,
    },
    emitted_parent_groups: 24_000,
    work: {
      ...work,
      path: "work.jsonl",
      schema: "shogi-sibling-teacher-work-v2",
      records: 24_001,
    },
    train,
    parent_completion: completion,
    manifest: manifestBinding,
    publication: {
      staged_inside_authenticated_callback: true,
      consumer_postflight_bound: false,
    },
  } as const;
  const finalOutcome = {
    status: "complete-training-only",
    authentication_receipt: false,
    target_parents: 24_000,
    completed_parents: 24_000,
    run_fingerprint: RUN_FINGERPRINT,
    manifest,
    staged_result: stagedResult,
  } as unknown as StrengthFirstSiblingTeacherAdvance;

  const assets = vi.fn(async () => {
    events.push("asset-preflight");
    return assetReceiptFixture();
  });
  const revision = vi.fn(async () => {
    events.push("revision");
    return RUNNER_REVISION;
  });
  const claimInput = vi.fn(() => {
    events.push("claim-input");
  });
  const claimPostflight = vi.fn(() => {
    events.push("claim-postflight");
  });
  const lock = vi.fn(async () => {
    events.push("lock-acquired");
    return async () => {
      events.push("lock-released");
    };
  });
  const advance = vi.fn(
    async (
      actualInput: Readonly<AuthenticatedFloodgateTrainingRows>,
      actualOptions: StrengthFirstSiblingTeacherOptions,
    ): Promise<StrengthFirstSiblingTeacherAdvance> => {
      expect(actualInput).toBe(input);
      const target = actualOptions.targetParents as 100 | 500 | 24_000;
      targets.push(target);
      options.push(actualOptions);
      events.push(`advance-${target}`);
      if (remainingFailure === target) {
        remainingFailure = undefined;
        throw new Error(`synthetic failure at ${target}`);
      }
      if (target === 100 || target === 500) {
        if (target === 100) prefix100Calls += 1;
        return {
          status: "local-work-prefix-complete-not-an-authentication-receipt",
          authentication_receipt: false,
          target_parents: target,
          completed_parents: target,
          run_fingerprint: RUN_FINGERPRINT,
          forced_parents_skipped: 0,
          forced_skip_reasons: {
            fewer_than_two_legal_moves: 0,
            search_timeout_no_label: 0,
          },
          emitted_parent_groups: target,
          work: {
            path: "work.jsonl",
            bytes: target,
            sha256: target === 100 ? "1".repeat(64) : "2".repeat(64),
            schema: "shogi-sibling-teacher-work-v2",
            records: target + 1,
            binding_scope: "canonical-target-prefix-projection",
          },
          current_work: {
            path: "work.jsonl",
            bytes: target === 100 && prefix100Calls > 1 ? 750 : target,
            sha256:
              target === 100 && prefix100Calls > 1
                ? "5".repeat(64)
                : target === 100
                  ? "3".repeat(64)
                  : "4".repeat(64),
            schema: "shogi-sibling-teacher-work-v2",
            records: target === 100 && prefix100Calls > 1 ? 751 : target + 1,
          },
        } as StrengthFirstSiblingTeacherAdvance;
      }
      storage.set(path.join(paths.stageRoot, "work.jsonl"), {
        binding: work,
      });
      storage.set(path.join(paths.stageRoot, "train.jsonl"), {
        binding: train,
      });
      storage.set(path.join(paths.stageRoot, "parent-completion.jsonl"), {
        binding: completion,
      });
      storage.set(path.join(paths.stageRoot, "manifest.json"), {
        value: manifest,
        binding: manifestBinding,
      });
      storage.set(path.join(paths.stageRoot, "staged-result.json"), {
        value: stagedResult,
        binding: bindingForBytes(
          path.join(paths.stageRoot, "staged-result.json"),
          paths.outputRoot,
          jsonBytes(stagedResult),
        ),
      });
      return finalOutcome;
    },
  );
  const consume = vi.fn(
    async (
      _options: unknown,
      callback: (
        value: Readonly<AuthenticatedFloodgateTrainingRows>,
      ) => Promise<void>,
    ) => {
      events.push("consume");
      const promise = callback(input);
      events.push("callback-returned");
      await promise;
      events.push("consumer-postflight");
      return postflight;
    },
  );
  const dependencies: FloodgateStrengthFirstTeacherRunnerDependencies = {
    homeDirectory: () => HOME,
    runnerRepositoryRoot: REPOSITORY_ROOT,
    nodeVersion: FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION,
    platform: "darwin",
    architecture: "arm64",
    effectiveUserId: 501,
    setUmask: vi.fn(() => 0o022),
    ensurePrivateDirectory: vi.fn(async () => undefined),
    acquireRunLock: lock,
    verifyProductionAssets: assets,
    captureExactCleanRevision: revision,
    consumeTrainingRows: consume,
    claimTrainingInput: claimInput,
    claimPostflight,
    advanceTeacher: advance,
    readPrivateJson: vi.fn(async (filePath) => {
      const stored = storage.get(filePath);
      if (!stored) return null;
      if (stored.value === undefined) {
        throw new Error(`test attempted to parse a non-JSON file: ${filePath}`);
      }
      return { value: stored.value, binding: stored.binding };
    }),
    digestPrivateFile: vi.fn(async (filePath) => {
      const stored = storage.get(filePath);
      if (!stored) throw new Error(`missing synthetic file: ${filePath}`);
      return stored.binding;
    }),
    commitPrivateJson: vi.fn(async (filePath, outputRoot, _uid, value) => {
      const bytes = jsonBytes(value);
      const binding = bindingForBytes(filePath, outputRoot, bytes);
      const existing = storage.get(filePath);
      if (existing) {
        expect(existing.binding).toEqual(binding);
        expect(existing.value).toEqual(value);
        return existing.binding;
      }
      storage.set(filePath, { value, binding });
      events.push(
        filePath.endsWith("/result.json")
          ? "commit-result"
          : `commit-${path.basename(filePath)}`,
      );
      return binding;
    }),
    reportProgress: vi.fn(),
  };
  return {
    dependencies,
    input,
    postflight,
    storage,
    events,
    targets,
    options,
    calls: {
      lock,
      assets,
      revision,
      consume,
      claimInput,
      claimPostflight,
      advance,
    },
  };
}

function rewriteManifestWithConsistentBindings(
  run: Fixture,
  resultPath: string,
  mutate: (manifest: Record<string, unknown>) => Record<string, unknown>,
): void {
  const paths = floodgateStrengthFirstTeacherPaths(HOME, REPOSITORY_ROOT);
  const manifestPath = path.join(paths.outputRoot, "manifest.json");
  const stagedPath = path.join(paths.outputRoot, "staged-result.json");
  const manifestStored = run.storage.get(manifestPath) as StoredFile;
  const stagedStored = run.storage.get(stagedPath) as StoredFile;
  const changedManifest = mutate(
    manifestStored.value as Record<string, unknown>,
  );
  const manifestBinding = bindingForBytes(
    manifestPath,
    paths.outputRoot,
    jsonBytes(changedManifest),
  );
  const oldStaged = stagedStored.value as Record<string, unknown>;
  const changedStaged = {
    ...oldStaged,
    manifest: {
      ...(oldStaged.manifest as Record<string, unknown>),
      bytes: manifestBinding.bytes,
      sha256: manifestBinding.sha256,
    },
  };
  const stagedBinding = bindingForBytes(
    stagedPath,
    paths.outputRoot,
    jsonBytes(changedStaged),
  );
  run.storage.set(manifestPath, {
    value: changedManifest,
    binding: manifestBinding,
  });
  run.storage.set(stagedPath, {
    value: changedStaged,
    binding: stagedBinding,
  });
  const resultStored = run.storage.get(resultPath) as StoredFile;
  const oldMarker = resultStored.value as Record<string, unknown>;
  const marker = {
    ...oldMarker,
    staged_outputs: {
      ...(oldMarker.staged_outputs as Record<string, unknown>),
      manifest: manifestBinding,
      staged_result: stagedBinding,
    },
  };
  run.storage.set(resultPath, {
    value: marker,
    binding: bindingForBytes(resultPath, paths.outputRoot, jsonBytes(marker)),
  });
}

function rewriteStagedResultWithConsistentBindings(
  run: Fixture,
  resultPath: string,
  mutate: (staged: Record<string, unknown>) => Record<string, unknown>,
): void {
  const paths = floodgateStrengthFirstTeacherPaths(HOME, REPOSITORY_ROOT);
  const stagedPath = path.join(paths.outputRoot, "staged-result.json");
  const stagedStored = run.storage.get(stagedPath) as StoredFile;
  const changedStaged = mutate(stagedStored.value as Record<string, unknown>);
  const stagedBinding = bindingForBytes(
    stagedPath,
    paths.outputRoot,
    jsonBytes(changedStaged),
  );
  run.storage.set(stagedPath, {
    value: changedStaged,
    binding: stagedBinding,
  });
  const resultStored = run.storage.get(resultPath) as StoredFile;
  const oldMarker = resultStored.value as Record<string, unknown>;
  const marker = {
    ...oldMarker,
    staged_outputs: {
      ...(oldMarker.staged_outputs as Record<string, unknown>),
      staged_result: stagedBinding,
    },
  };
  run.storage.set(resultPath, {
    value: marker,
    binding: bindingForBytes(resultPath, paths.outputRoot, jsonBytes(marker)),
  });
}

describe("Floodgate strength-first teacher runner", () => {
  it("keeps legacy v1 at Hash 64 while issuing a distinct Hash 512 v8 authority", () => {
    expect(FLOODGATE_PRODUCTION_TEACHER_RUNTIME.hash_mb_per_engine).toBe(64);
    expect(FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME.hash_mb_per_engine).toBe(
      512,
    );
    const receipt = assetReceiptFixture();
    expect(receipt.runtime.hash_mb_per_engine).toBe(512);
    expect(receipt.asset_authority.runtime.hash_mb_per_engine).toBe(64);
  });

  it("derives every private production input, asset, and output path from the user home", () => {
    const paths = floodgateStrengthFirstTeacherPaths(HOME, REPOSITORY_ROOT);
    expect(paths).toMatchObject({
      home: HOME,
      runnerRepositoryRoot: REPOSITORY_ROOT,
      verifierRepositoryRoot: `${HOME}/.codex/worktrees/shogi-floodgate-role-bundle`,
      rawLockRoot: `${HOME}/.codex/shogi-data/floodgate-q1-2026-raw-lock`,
      roleLockRoot: `${HOME}/.codex/shogi-data/floodgate-q1-2026-role-lock-v1`,
      roleBundleRoot: `${HOME}/.codex/shogi-bundles/floodgate-q1-2026-label-free-role-bundle-v2`,
      assetRoot: `${HOME}/Library/Application Support/nextjs-portfolio/shogi-production-teacher-assets-v1`,
      engineBin: `${HOME}/Library/Application Support/nextjs-portfolio/shogi-production-teacher-assets-v1/engine/yaneuraou`,
      evalDir: `${HOME}/Library/Application Support/nextjs-portfolio/shogi-production-teacher-assets-v1/eval`,
      outputRoot: `${HOME}/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8`,
      stageRoot: `${HOME}/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8`,
    });
  });

  it("claims once synchronously and advances one callback through 100, 500, and 24000 with 12 fixed engines", async () => {
    const run = fixture();
    const receipt = await runFloodgateStrengthFirstTeacherCore(
      run.dependencies,
    );
    expect(receipt.idempotent_existing_result).toBe(false);
    expect(run.calls.assets).toHaveBeenCalledTimes(1);
    expect(run.calls.lock).toHaveBeenCalledWith(
      `${HOME}/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8`,
      501,
    );
    expect(run.calls.revision).toHaveBeenCalledWith(REPOSITORY_ROOT);
    expect(run.calls.consume).toHaveBeenCalledTimes(1);
    expect(run.calls.claimInput).toHaveBeenCalledTimes(1);
    expect(run.calls.claimInput).toHaveBeenCalledWith(run.input);
    expect(run.calls.claimPostflight).toHaveBeenCalledTimes(1);
    expect(run.calls.claimPostflight).toHaveBeenCalledWith(run.postflight);
    expect(run.targets).toEqual([100, 500, 24_000]);
    expect(run.events.indexOf("claim-input")).toBeLessThan(
      run.events.indexOf("callback-returned"),
    );
    expect(run.events.indexOf("claim-input")).toBeLessThan(
      run.events.indexOf("advance-100"),
    );
    expect(run.events.indexOf("consumer-postflight")).toBeLessThan(
      run.events.indexOf("claim-postflight"),
    );
    expect(run.events.indexOf("claim-postflight")).toBeLessThan(
      run.events.indexOf("commit-result"),
    );
    expect(run.events.indexOf("lock-acquired")).toBeLessThan(
      run.events.indexOf("asset-preflight"),
    );
    expect(run.events.indexOf("commit-result")).toBeLessThan(
      run.events.indexOf("lock-released"),
    );
    for (const [index, options] of run.options.entries()) {
      expect(options).toMatchObject({
        stageRoot: `${HOME}/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8`,
        runnerRevision: RUNNER_REVISION,
        engineBin: `${HOME}/Library/Application Support/nextjs-portfolio/shogi-production-teacher-assets-v1/engine/yaneuraou`,
        engineReceipt: `${HOME}/Library/Application Support/nextjs-portfolio/shogi-production-teacher-assets-v1/engine/yaneuraou-receipt.json`,
        evalDir: `${HOME}/Library/Application Support/nextjs-portfolio/shogi-production-teacher-assets-v1/eval`,
        engineArgs: [],
        multipv: 12,
        depth: 16,
        fvScale: 20,
        hashMb: FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
        timeoutMs: 600_000,
        targetParents: [100, 500, 24_000][index],
      });
      expect(options).not.toHaveProperty("engines");
      expect(options).not.toHaveProperty("stable");
      expect(options).not.toHaveProperty("nodes");
    }
    expect(receipt.result.teacher).toMatchObject({
      parallel_engines: 12,
      hash_mb_per_engine: FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
      proposal: { multipv: 12, depth: 16 },
      independent_rescore: {
        multipv: 1,
        searchmoves: "exactly-one-candidate",
        depth: 16,
      },
      engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
      stable_engine_or_policy_executions: 0,
    });
    expect(receipt.result.runner).toMatchObject({
      local_only: true,
      network_requests: 0,
      cloud_services: [],
      live_weight_changes: 0,
    });
    expect(receipt.result.schema).toBe(
      FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
    );
    expect(receipt.result.completion).toMatchObject({
      forced_parents_skipped: 0,
      forced_skip_reasons: {
        fewer_than_two_legal_moves: 0,
        search_timeout_no_label: 0,
      },
      emitted_parent_groups: 24_000,
    });
  });

  it("rejects a malformed canonical prefix before committing its milestone", async () => {
    const run = fixture();
    const advance = run.dependencies.advanceTeacher;
    await expect(
      runFloodgateStrengthFirstTeacherCore({
        ...run.dependencies,
        advanceTeacher: async (input, options) => {
          const outcome = await advance(input, options);
          if (outcome.target_parents !== 100) return outcome;
          return {
            ...outcome,
            work: {
              ...outcome.work,
              path: "work-prefix-100.jsonl",
            },
          };
        },
      }),
    ).rejects.toThrow(/invalid teacher milestone 100/i);
    expect(run.targets).toEqual([100]);
    expect(run.calls.claimPostflight).not.toHaveBeenCalled();
    expect(run.events).not.toContain("commit-result");
    expect(run.events).toContain("lock-released");
  });

  it("rejects a noncanonical first fingerprint before committing its milestone", async () => {
    const run = fixture();
    const advance = run.dependencies.advanceTeacher;
    await expect(
      runFloodgateStrengthFirstTeacherCore({
        ...run.dependencies,
        advanceTeacher: async (input, options) => {
          const outcome = await advance(input, options);
          if (outcome.target_parents !== 100) return outcome;
          return {
            ...outcome,
            run_fingerprint: "not-a-sha256",
          };
        },
      }),
    ).rejects.toThrow(/invalid teacher milestone 100/i);
    expect(run.targets).toEqual([100]);
    expect(run.calls.claimPostflight).not.toHaveBeenCalled();
    expect(run.events).not.toContain("commit-result");
    expect(run.events).toContain("lock-released");
  });

  it("rejects a prefix whose explicit timeout skip count exceeds its fixed budget", async () => {
    const run = fixture();
    const advance = run.dependencies.advanceTeacher;
    await expect(
      runFloodgateStrengthFirstTeacherCore({
        ...run.dependencies,
        advanceTeacher: async (input, options) => {
          const outcome = await advance(input, options);
          if (outcome.target_parents !== 100) return outcome;
          return {
            ...outcome,
            forced_parents_skipped: 2,
            forced_skip_reasons: {
              fewer_than_two_legal_moves: 0,
              search_timeout_no_label: 2,
            },
            emitted_parent_groups: 98,
          };
        },
      }),
    ).rejects.toThrow(/invalid teacher milestone 100/i);
    expect(run.targets).toEqual([100]);
    expect(run.calls.claimPostflight).not.toHaveBeenCalled();
    expect(run.events).not.toContain("commit-result");
  });

  it("rejects inconsistent initial source metadata before claiming postflight or publishing", async () => {
    const run = fixture();
    const advance = run.dependencies.advanceTeacher;
    await expect(
      runFloodgateStrengthFirstTeacherCore({
        ...run.dependencies,
        advanceTeacher: async (input, options) => {
          const outcome = await advance(input, options);
          if (outcome.target_parents !== 24_000) return outcome;
          return {
            ...outcome,
            manifest: {
              ...outcome.manifest,
              source: {
                ...outcome.manifest.source,
                raw_sha256: "0".repeat(64),
                raw_records: 23_999,
              },
            },
          };
        },
      }),
    ).rejects.toThrow(/invalid final teacher artifact bindings/i);
    expect(run.targets).toEqual([100, 500, 24_000]);
    expect(run.calls.claimPostflight).not.toHaveBeenCalled();
    expect(run.events).not.toContain("commit-result");
    expect(run.events).toContain("lock-released");
  });

  it("rejects a v8 policy/nested asset mismatch before authentication", async () => {
    const run = fixture();
    run.calls.assets.mockImplementationOnce(async () => {
      const receipt = assetReceiptFixture();
      return {
        ...receipt,
        assets: {
          ...receipt.assets,
          engine: {
            ...receipt.assets.engine,
            yaneuraou: {
              ...receipt.assets.engine.yaneuraou,
              sha256: "e".repeat(64),
            },
          },
        },
      };
    });
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/production asset preflight/i);
    expect(run.targets).toEqual([]);
    expect(run.calls.consume).not.toHaveBeenCalled();
    expect(run.calls.claimPostflight).not.toHaveBeenCalled();
    expect(run.events).not.toContain("commit-result");
    expect(run.events).toContain("lock-released");
  });

  it("refuses to bind a legacy receipt whose pinned asset tree drifted", () => {
    const legacy = legacyAssetReceiptFixture();
    const changedLegacy = {
      ...legacy,
      assets: {
        ...legacy.assets,
        engine: {
          ...legacy.assets.engine,
          yaneuraou: {
            ...legacy.assets.engine.yaneuraou,
            sha256: "e".repeat(64),
          },
        },
      },
    } as typeof legacy;
    expect(() =>
      bindFloodgateStrengthFirstV8TeacherAuthorityCoreForTests(
        changedLegacy,
        501,
      ),
    ).toThrow(/pinned v1 asset identity/i);
  });

  it("rejects a raw legacy v1 Hash 64 preflight before v8 authentication or engine work", async () => {
    const run = fixture();
    run.calls.assets.mockResolvedValueOnce(
      legacyAssetReceiptFixture() as unknown as Awaited<
        ReturnType<
          FloodgateStrengthFirstTeacherRunnerDependencies["verifyProductionAssets"]
        >
      >,
    );
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/production asset preflight/i);
    expect(run.targets).toEqual([]);
    expect(run.calls.consume).not.toHaveBeenCalled();
    expect(run.calls.advance).not.toHaveBeenCalled();
    expect(run.events).not.toContain("commit-result");
  });

  it.each([64, 256, 1024])(
    "rejects top-level Hash %i before v8 authentication or engine work",
    async (hashMb) => {
      const run = fixture();
      const receipt = assetReceiptFixture();
      run.calls.assets.mockResolvedValueOnce({
        ...receipt,
        runtime: {
          ...receipt.runtime,
          hash_mb_per_engine: hashMb,
        },
      } as typeof receipt);
      await expect(
        runFloodgateStrengthFirstTeacherCore(run.dependencies),
      ).rejects.toThrow(/production asset preflight/i);
      expect(run.targets).toEqual([]);
      expect(run.calls.consume).not.toHaveBeenCalled();
      expect(run.calls.advance).not.toHaveBeenCalled();
    },
  );

  it("rejects altered top-level schema, status, or claim boundary", async () => {
    const mutations = [
      { contract: "wrong-v8-contract" },
      { status: "wrong-v8-status" },
      { claim_boundary: "wrong-v8-claim" },
    ];
    for (const mutation of mutations) {
      const run = fixture();
      const receipt = assetReceiptFixture();
      run.calls.assets.mockResolvedValueOnce({
        ...receipt,
        ...mutation,
      } as unknown as typeof receipt);
      await expect(
        runFloodgateStrengthFirstTeacherCore(run.dependencies),
      ).rejects.toThrow(/production asset preflight/i);
      expect(run.targets).toEqual([]);
      expect(run.calls.consume).not.toHaveBeenCalled();
      expect(run.calls.advance).not.toHaveBeenCalled();
    }
  });

  it("rejects nested legacy schema, boundary, runtime, or asset tampering", async () => {
    const mutations: Array<
      (
        legacy: ReturnType<typeof legacyAssetReceiptFixture>,
      ) => Record<string, unknown>
    > = [
      (legacy) => ({ ...legacy, contract: "wrong-v1-contract" }),
      (legacy) => ({ ...legacy, status: "wrong-v1-status" }),
      (legacy) => ({ ...legacy, claim_boundary: "wrong-v1-claim" }),
      (legacy) => ({ ...legacy, trust_boundary: "wrong-v1-trust" }),
      (legacy) => ({
        ...legacy,
        runtime: {
          ...legacy.runtime,
          hash_mb_per_engine: 512,
        },
      }),
      (legacy) => ({
        ...legacy,
        assets: {
          ...legacy.assets,
          eval: {
            ...legacy.assets.eval,
            tree_sha256: "e".repeat(64),
          },
        },
      }),
    ];
    for (const mutate of mutations) {
      const run = fixture();
      const receipt = assetReceiptFixture();
      run.calls.assets.mockResolvedValueOnce({
        ...receipt,
        asset_authority: mutate(receipt.asset_authority),
      } as unknown as typeof receipt);
      await expect(
        runFloodgateStrengthFirstTeacherCore(run.dependencies),
      ).rejects.toThrow(/production asset preflight/i);
      expect(run.targets).toEqual([]);
      expect(run.calls.consume).not.toHaveBeenCalled();
      expect(run.calls.advance).not.toHaveBeenCalled();
    }
  });

  it("rejects synchronized nested and top-level legacy forgeries", async () => {
    const mutations: Array<
      (
        receipt: ReturnType<typeof assetReceiptFixture>,
      ) => Record<string, unknown>
    > = [
      (receipt) => {
        const assets = {
          ...receipt.asset_authority.assets,
          eval: {
            ...receipt.asset_authority.assets.eval,
            tree_sha256: "e".repeat(64),
          },
        };
        return {
          ...receipt,
          asset_authority: {
            ...receipt.asset_authority,
            assets,
          },
          assets,
        };
      },
      (receipt) => ({
        ...receipt,
        asset_authority: {
          ...receipt.asset_authority,
          deployment: {
            ...receipt.asset_authority.deployment,
            owner_uid: 502,
          },
        },
      }),
      (receipt) => {
        const engine = {
          ...receipt.asset_authority.engine,
          source_commit: "f".repeat(40),
        };
        return {
          ...receipt,
          asset_authority: {
            ...receipt.asset_authority,
            engine,
          },
          engine,
        };
      },
      (receipt) => {
        const postverification = {
          ...receipt.asset_authority.postverification,
          contents_stably_read: false,
        };
        return {
          ...receipt,
          asset_authority: {
            ...receipt.asset_authority,
            postverification,
          },
          postverification,
        };
      },
    ];
    for (const mutate of mutations) {
      const run = fixture();
      run.calls.assets.mockResolvedValueOnce(
        mutate(assetReceiptFixture()) as unknown as ReturnType<
          typeof assetReceiptFixture
        >,
      );
      await expect(
        runFloodgateStrengthFirstTeacherCore(run.dependencies),
      ).rejects.toThrow(/production asset preflight/i);
      expect(run.targets).toEqual([]);
      expect(run.calls.consume).not.toHaveBeenCalled();
      expect(run.calls.advance).not.toHaveBeenCalled();
    }
  });

  it("rejects proxy, accessor, symbol, hidden, and prototype legacy receipts", () => {
    const receipt = assetReceiptFixture();
    const capture = (assetAuthority: unknown) =>
      captureFloodgateStrengthFirstV8TeacherAuthorityReceipt(
        {
          ...receipt,
          asset_authority: assetAuthority,
        },
        "production-fixed-registry-and-deployment-root",
        501,
      );

    expect(() => capture(new Proxy(receipt.asset_authority, {}))).toThrow(
      /plain non-Proxy/i,
    );

    const getter = vi.fn(() => receipt.asset_authority.runtime);
    const accessor = { ...receipt.asset_authority };
    Object.defineProperty(accessor, "runtime", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    expect(() => capture(accessor)).toThrow(/data property/i);
    expect(getter).not.toHaveBeenCalled();

    expect(() =>
      capture({
        ...receipt.asset_authority,
        [Symbol("forged")]: true,
      }),
    ).toThrow(/symbol/i);

    const hidden = { ...receipt.asset_authority };
    Object.defineProperty(hidden, "forged", {
      enumerable: false,
      value: true,
    });
    expect(() => capture(hidden)).toThrow(/data property/i);

    const customPrototype = Object.assign(
      Object.create({ forged: true }),
      receipt.asset_authority,
    );
    expect(() => capture(customPrototype)).toThrow(/plain non-Proxy/i);
  });

  it("uses a canonical deep-frozen copy after authority validation", () => {
    const receipt = assetReceiptFixture();
    const runtime = { ...receipt.runtime };
    const mutable = { ...receipt, runtime };
    const captured = captureFloodgateStrengthFirstV8TeacherAuthorityReceipt(
      mutable,
      "production-fixed-registry-and-deployment-root",
      501,
    );
    (runtime as { hash_mb_per_engine: number }).hash_mb_per_engine = 64;
    expect(captured.runtime.hash_mb_per_engine).toBe(512);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.runtime)).toBe(true);
    expect(Object.isFrozen(captured.asset_authority.assets.engine)).toBe(true);
    expect(captured.assets).toBe(captured.asset_authority.assets);
    expect(captured.engine).toBe(captured.asset_authority.engine);
    expect(captured.postverification).toBe(
      captured.asset_authority.postverification,
    );
  });

  it("validates a completed result before authentication and skips all repeated engine work", async () => {
    const run = fixture();
    const first = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    const consumeCalls = run.calls.consume.mock.calls.length;
    const advanceCalls = run.calls.advance.mock.calls.length;
    const claimCalls = run.calls.claimInput.mock.calls.length;
    const second = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    expect(first.idempotent_existing_result).toBe(false);
    expect(second.idempotent_existing_result).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(run.calls.assets).toHaveBeenCalledTimes(2);
    expect(run.calls.revision).toHaveBeenCalledTimes(2);
    expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
    expect(run.calls.advance).toHaveBeenCalledTimes(advanceCalls);
    expect(run.calls.claimInput).toHaveBeenCalledTimes(claimCalls);
    expect(run.calls.claimPostflight).toHaveBeenCalledTimes(1);
  });

  it("parses a digest-consistent manifest and rejects a tampered fingerprint before reauthentication", async () => {
    const run = fixture();
    const first = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    rewriteManifestWithConsistentBindings(
      run,
      first.result_path,
      (manifest) => ({
        ...manifest,
        run_fingerprint: "f".repeat(64),
      }),
    );
    const consumeCalls = run.calls.consume.mock.calls.length;
    const advanceCalls = run.calls.advance.mock.calls.length;
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/bound manifest or staged result/i);
    expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
    expect(run.calls.advance).toHaveBeenCalledTimes(advanceCalls);
  });

  it("rejects digest-consistent manifest source SHA and count tampering before reauthentication", async () => {
    const run = fixture();
    const first = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    rewriteManifestWithConsistentBindings(
      run,
      first.result_path,
      (manifest) => ({
        ...manifest,
        source: {
          ...(manifest.source as Record<string, unknown>),
          raw_sha256: "0".repeat(64),
          raw_records: 23_999,
        },
      }),
    );
    const consumeCalls = run.calls.consume.mock.calls.length;
    const advanceCalls = run.calls.advance.mock.calls.length;
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/bound manifest or staged result/i);
    expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
    expect(run.calls.advance).toHaveBeenCalledTimes(advanceCalls);
  });

  it("rejects digest-consistent manifest metadata that differs from the authenticated input or staged train", async () => {
    const mutations = [
      (manifest: Record<string, unknown>) => ({
        ...manifest,
        source: {
          ...(manifest.source as Record<string, unknown>),
          selected_parent_ids_sha256: "0".repeat(64),
        },
      }),
      (manifest: Record<string, unknown>) => {
        const outputs = manifest.outputs as Record<string, unknown>;
        const train = outputs.train as Record<string, unknown>;
        return {
          ...manifest,
          outputs: {
            ...outputs,
            train: {
              ...train,
              records: (train.records as number) + 1,
            },
          },
        };
      },
    ];
    for (const mutate of mutations) {
      const run = fixture();
      const first = await runFloodgateStrengthFirstTeacherCore(
        run.dependencies,
      );
      rewriteManifestWithConsistentBindings(run, first.result_path, mutate);
      const consumeCalls = run.calls.consume.mock.calls.length;
      const advanceCalls = run.calls.advance.mock.calls.length;
      await expect(
        runFloodgateStrengthFirstTeacherCore(run.dependencies),
      ).rejects.toThrow(/bound manifest or staged result/i);
      expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
      expect(run.calls.advance).toHaveBeenCalledTimes(advanceCalls);
    }
  });

  it("rejects every digest-consistent staged schema and nested completion drift before reauthentication", async () => {
    const mutations = [
      (staged: Record<string, unknown>) => ({
        ...staged,
        work: {
          ...(staged.work as Record<string, unknown>),
          schema: "tampered-work-schema",
        },
      }),
      (staged: Record<string, unknown>) => ({
        ...staged,
        manifest: {
          ...(staged.manifest as Record<string, unknown>),
          schema: "tampered-manifest-schema",
        },
      }),
      (staged: Record<string, unknown>) => ({
        ...staged,
        parent_completion: {
          ...(staged.parent_completion as Record<string, unknown>),
          forced_parents_skipped: 1,
          emitted_parent_groups: 23_999,
        },
      }),
    ];
    for (const mutate of mutations) {
      const run = fixture();
      const first = await runFloodgateStrengthFirstTeacherCore(
        run.dependencies,
      );
      rewriteStagedResultWithConsistentBindings(run, first.result_path, mutate);
      const consumeCalls = run.calls.consume.mock.calls.length;
      const advanceCalls = run.calls.advance.mock.calls.length;
      await expect(
        runFloodgateStrengthFirstTeacherCore(run.dependencies),
      ).rejects.toThrow(/bound manifest or staged result/i);
      expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
      expect(run.calls.advance).toHaveBeenCalledTimes(advanceCalls);
    }
  });

  it("parses a digest-consistent staged result and rejects tampered completion counts before reauthentication", async () => {
    const run = fixture();
    const first = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    const paths = floodgateStrengthFirstTeacherPaths(HOME, REPOSITORY_ROOT);
    const stagedPath = path.join(paths.outputRoot, "staged-result.json");
    const stagedStored = run.storage.get(stagedPath) as StoredFile;
    const tamperedStaged = {
      ...(stagedStored.value as Record<string, unknown>),
      completed_parents: 23_999,
    };
    const stagedBinding = bindingForBytes(
      stagedPath,
      paths.outputRoot,
      jsonBytes(tamperedStaged),
    );
    run.storage.set(stagedPath, {
      value: tamperedStaged,
      binding: stagedBinding,
    });
    const resultStored = run.storage.get(first.result_path) as StoredFile;
    const oldMarker = resultStored.value as Record<string, unknown>;
    const marker = {
      ...oldMarker,
      staged_outputs: {
        ...(oldMarker.staged_outputs as Record<string, unknown>),
        staged_result: stagedBinding,
      },
    };
    run.storage.set(first.result_path, {
      value: marker,
      binding: bindingForBytes(
        first.result_path,
        paths.outputRoot,
        jsonBytes(marker),
      ),
    });
    const consumeCalls = run.calls.consume.mock.calls.length;
    const advanceCalls = run.calls.advance.mock.calls.length;
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/bound manifest or staged result/i);
    expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
    expect(run.calls.advance).toHaveBeenCalledTimes(advanceCalls);
  });

  it("fails closed on an invalid existing commit marker instead of authenticating or overwriting it", async () => {
    const run = fixture();
    const first = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    const resultFile = run.storage.get(first.result_path);
    expect(resultFile).toBeDefined();
    run.storage.set(first.result_path, {
      binding: (resultFile as StoredFile).binding,
      value: {
        ...((resultFile as StoredFile).value as Record<string, unknown>),
        status: "tampered",
      },
    });
    const consumeCalls = run.calls.consume.mock.calls.length;
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/existing result marker/i);
    expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
  });

  it("rejects a digest-consistent v1 result marker in the isolated v8 root", async () => {
    const run = fixture();
    const first = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    const resultFile = run.storage.get(first.result_path) as StoredFile;
    const oldMarker = resultFile.value as Record<string, unknown>;
    const marker = {
      ...oldMarker,
      schema: "shogi-floodgate-strength-first-teacher-postflight-result-v1",
    };
    run.storage.set(first.result_path, {
      value: marker,
      binding: bindingForBytes(
        first.result_path,
        floodgateStrengthFirstTeacherPaths(HOME, REPOSITORY_ROOT).outputRoot,
        jsonBytes(marker),
      ),
    });
    const consumeCalls = run.calls.consume.mock.calls.length;
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/existing result marker/i);
    expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
  });

  it("rejects a public completion marker above the exact timeout-skip cap", async () => {
    const run = fixture();
    const first = await runFloodgateStrengthFirstTeacherCore(run.dependencies);
    const resultFile = run.storage.get(first.result_path) as StoredFile;
    const marker = resultFile.value as Record<string, unknown>;
    run.storage.set(first.result_path, {
      binding: resultFile.binding,
      value: {
        ...marker,
        completion: {
          ...(marker.completion as Record<string, unknown>),
          forced_parents_skipped: 25,
          forced_skip_reasons: {
            fewer_than_two_legal_moves: 0,
            search_timeout_no_label: 25,
          },
          emitted_parent_groups: 23_975,
        },
      },
    });
    const consumeCalls = run.calls.consume.mock.calls.length;
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow(/existing result marker/i);
    expect(run.calls.consume).toHaveBeenCalledTimes(consumeCalls);
  });

  it("does not advance, claim postflight, or publish result after a failed milestone", async () => {
    const run = fixture(500);
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow("synthetic failure at 500");
    expect(run.targets).toEqual([100, 500]);
    expect(run.calls.claimPostflight).not.toHaveBeenCalled();
    expect(run.events).not.toContain("commit-result");
  });

  it("reuses target-invariant milestone 100 after the current work grows on restart", async () => {
    const run = fixture(500);
    await expect(
      runFloodgateStrengthFirstTeacherCore(run.dependencies),
    ).rejects.toThrow("synthetic failure at 500");
    const paths = floodgateStrengthFirstTeacherPaths(HOME, REPOSITORY_ROOT);
    const firstMilestone = run.storage.get(paths.milestone100);
    expect(firstMilestone).toBeDefined();
    const firstValue = (firstMilestone as StoredFile).value as {
      progress: Record<string, unknown>;
    };
    expect(firstValue.progress).toMatchObject({
      target_parents: 100,
      completed_parents: 100,
      run_fingerprint: RUN_FINGERPRINT,
      work: {
        binding_scope: "canonical-target-prefix-projection",
      },
    });
    expect(firstValue.progress).not.toHaveProperty("current_work");

    const receipt = await runFloodgateStrengthFirstTeacherCore(
      run.dependencies,
    );
    expect(receipt.status).toBe("complete-training-only-postflight-bound");
    expect(run.targets).toEqual([100, 500, 100, 500, 24_000]);
    expect(run.storage.get(paths.milestone100)).toEqual(firstMilestone);
  });

  it("rejects the wrong Node version before touching assets or inputs", async () => {
    const run = fixture();
    await expect(
      runFloodgateStrengthFirstTeacherCore({
        ...run.dependencies,
        nodeVersion: "v22.14.0",
      }),
    ).rejects.toThrow(/exact Node v22\.13\.0/i);
    expect(run.calls.assets).not.toHaveBeenCalled();
    expect(run.calls.consume).not.toHaveBeenCalled();
  });

  it("rejects an accidental concurrent runner before assets, authentication, or engines", async () => {
    const run = fixture();
    await expect(
      runFloodgateStrengthFirstTeacherCore({
        ...run.dependencies,
        acquireRunLock: vi.fn(async () => {
          throw new Error(
            "strength-first teacher kernel lock is already active",
          );
        }),
      }),
    ).rejects.toThrow(/kernel lock is already active/i);
    expect(run.calls.assets).not.toHaveBeenCalled();
    expect(run.calls.consume).not.toHaveBeenCalled();
    expect(run.calls.advance).not.toHaveBeenCalled();
  });
});

const darwinDescribe = describe.runIf(
  process.platform === "darwin" && typeof process.geteuid === "function",
);

darwinDescribe("Floodgate strength-first operational run lock", () => {
  const lockDependencies = Object.freeze({
    lockfExecutable: "/usr/bin/lockf",
    acquisitionTimeoutMs: 5_000,
  });

  async function privateRoot(): Promise<string> {
    const created = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "strength-first-lock-"),
    );
    const root = await fs.promises.realpath(created);
    temporaryRoots.push(root);
    await fs.promises.chmod(root, 0o700);
    return root;
  }

  it("closes the retained descriptor when output-directory sync fails", async () => {
    const root = await privateRoot();
    const uid = process.geteuid!();
    const lockPath = path.join(
      root,
      FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME,
    );
    const realOpen = fs.promises.open.bind(fs.promises);
    let closeCalls = 0;
    const open = vi
      .spyOn(fs.promises, "open")
      .mockImplementation(async (file, flags, mode) => {
        if (file === root) {
          throw new Error("synthetic directory sync failure");
        }
        const handle = await realOpen(file, flags, mode);
        if (file === lockPath) {
          const realClose = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(async () => {
            closeCalls += 1;
            await realClose();
          });
        }
        return handle;
      });
    try {
      await expect(
        acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
          root,
          uid,
          lockDependencies,
        ),
      ).rejects.toThrow(/synthetic directory sync failure/);
    } finally {
      open.mockRestore();
    }
    expect(closeCalls).toBe(1);
  });

  it("lets exactly one of two adversarial contenders hold the kernel lock", async () => {
    const root = await privateRoot();
    const uid = process.geteuid!();
    const contenders = await Promise.allSettled([
      acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
        root,
        uid,
        lockDependencies,
      ),
      acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
        root,
        uid,
        lockDependencies,
      ),
    ]);
    const winners = contenders.filter(
      (result): result is PromiseFulfilledResult<() => Promise<void>> =>
        result.status === "fulfilled",
    );
    const rejected = contenders.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(winners).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      message: expect.stringMatching(/already active/i),
    });
    const lockPath = path.join(
      root,
      FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME,
    );
    expect((await fs.promises.stat(lockPath)).mode & 0o7777).toBe(0o600);
    await winners[0].value();
    expect((await fs.promises.stat(lockPath)).mode & 0o7777).toBe(0o600);
  });

  it("reuses the same retained inode and preserves its inert bytes", async () => {
    const root = await privateRoot();
    const uid = process.geteuid!();
    const lockPath = path.join(
      root,
      FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME,
    );
    await fs.promises.writeFile(
      lockPath,
      "retained bytes are inert because exclusivity is descriptor-backed\n",
      { flag: "wx", mode: 0o600 },
    );
    const before = await fs.promises.stat(lockPath);
    const first = await acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
      root,
      uid,
      lockDependencies,
    );
    await first();
    const second =
      await acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
        root,
        uid,
        lockDependencies,
      );
    await second();
    const after = await fs.promises.stat(lockPath);
    expect(after.ino).toBe(before.ino);
    expect(after.mode & 0o7777).toBe(0o600);
    expect(await fs.promises.readFile(lockPath, "utf8")).toBe(
      "retained bytes are inert because exclusivity is descriptor-backed\n",
    );
  });

  it("keeps the lock after the acquisition helper exits until the parent releases its descriptor", async () => {
    const root = await privateRoot();
    const uid = process.geteuid!();
    const first = await acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
      root,
      uid,
      lockDependencies,
    );
    await expect(
      acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
        root,
        uid,
        lockDependencies,
      ),
    ).rejects.toThrow(/already active/i);
    await Promise.all([first(), first()]);
    const second =
      await acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
        root,
        uid,
        lockDependencies,
      );
    await second();
  });

  it("releases the retained-inode lock when its parent process is killed", async () => {
    const root = await privateRoot();
    const uid = process.geteuid!();
    const lockPath = path.join(
      root,
      FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME,
    );
    const ownerSource = [
      'const fs=require("node:fs");',
      'const {spawn}=require("node:child_process");',
      "const file=process.argv[1];",
      "const fd=fs.openSync(file,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,384);",
      'const helper=spawn("/usr/bin/lockf",["-s","-t","0","3"],{stdio:["ignore","ignore","ignore",fd]});',
      'helper.once("error",()=>process.exit(3));',
      'helper.once("close",code=>{if(code!==0)process.exit(4);process.stdout.write("READY\\n");setInterval(()=>undefined,1000);});',
    ].join("");
    const owner = spawn(process.execPath, ["-e", ownerSource, lockPath], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    try {
      const [ready] = (await once(owner.stdout!, "data")) as [Buffer];
      expect(ready.toString("utf8")).toBe("READY\n");
      const before = await fs.promises.stat(lockPath);
      await expect(
        acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
          root,
          uid,
          lockDependencies,
        ),
      ).rejects.toThrow(/already active/i);
      const exited = once(owner, "exit");
      owner.kill("SIGKILL");
      await exited;
      const release =
        await acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
          root,
          uid,
          lockDependencies,
        );
      await release();
      expect((await fs.promises.stat(lockPath)).ino).toBe(before.ino);
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) {
        owner.kill("SIGKILL");
        await once(owner, "exit");
      }
    }
  });

  it("rejects a symlink lock path without changing its target mode", async () => {
    const root = await privateRoot();
    const uid = process.geteuid!();
    const target = path.join(root, "unrelated-target");
    const lockPath = path.join(
      root,
      FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME,
    );
    await fs.promises.writeFile(target, "do not touch\n", { mode: 0o644 });
    await fs.promises.chmod(target, 0o644);
    await fs.promises.symlink(target, lockPath);
    await expect(
      acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
        root,
        uid,
        lockDependencies,
      ),
    ).rejects.toThrow();
    expect((await fs.promises.stat(target)).mode & 0o7777).toBe(0o644);
  });
});
