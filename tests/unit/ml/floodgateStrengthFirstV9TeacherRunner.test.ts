import { createHash } from "node:crypto";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
  type StrengthFirstSiblingTeacherAdvance,
  type StrengthFirstSiblingTeacherOptions,
} from "../../../ml/generate-sibling-teacher";
import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY,
  type FloodgateStrengthFirstFastTrainingInput,
} from "../../../ml/floodgate-strength-first-fast-training-input";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
  type FloodgateProductionTeacherAssetAuthorityReceipt,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import { FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY } from "../../../ml/floodgate-role-bundle-result";
import { bindFloodgateStrengthFirstV9FromLegacyAuthorityCoreForTests } from "../../../ml/floodgate-strength-first-v9-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA,
  floodgateStrengthFirstV9TeacherPaths,
  runFloodgateStrengthFirstV9TeacherCore,
  type FloodgateStrengthFirstV9TeacherRunnerDependencies,
} from "../../../ml/floodgate-strength-first-v9-teacher-runner";
import type { FloodgateStrengthFirstTeacherFileBinding } from "../../../ml/floodgate-strength-first-teacher-runner";
import type { AuthenticatedFloodgateTrainingRows } from "../../../ml/floodgate-training-row-consumer";

const HOME = "/Users/floodgate-v9-test";
const REPOSITORY = "/Users/floodgate-v9-test/source";
const REVISION = "1".repeat(40);
const FINGERPRINT = "2".repeat(64);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function binding(
  file: string,
  root: string,
  bytes: Uint8Array,
): FloodgateStrengthFirstTeacherFileBinding {
  return Object.freeze({
    path: path.relative(root, file).split(path.sep).join("/"),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
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

function legacyAssetReceipt(): Readonly<
  FloodgateProductionTeacherAssetAuthorityReceipt<"production-fixed-registry-and-deployment-root">
> {
  const registry = FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY;
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
        yaneuraou: assetEvidence(
          "engine/yaneuraou",
          registry.engine.yaneuraou,
          "0700",
          1,
        ),
        receipt: assetEvidence(
          "engine/yaneuraou-receipt.json",
          registry.engine.receipt,
          "0600",
          2,
        ),
      },
      eval: {
        nn: assetEvidence("eval/nn.bin", registry.eval.nn, "0600", 3),
        tree_sha256: registry.eval.treeSha256,
      },
      stable: {
        plan: assetEvidence(
          "stable/floodgate-plan.json",
          registry.stable.plan,
          "0600",
          4,
        ),
        wasm: assetEvidence(
          "stable/shogi.wasm",
          registry.stable.wasm,
          "0600",
          5,
        ),
        weights: assetEvidence(
          "stable/shogi-nnue-weights.bin",
          registry.stable.weights,
          "0600",
          6,
        ),
        worker: assetEvidence(
          "stable/floodgate-stable-wasm-worker.mjs",
          registry.stable.worker,
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

function fastInput(
  source = FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY,
): Readonly<FloodgateStrengthFirstFastTrainingInput> {
  const row = Object.freeze({
    schema_version: 1,
    game_id: "test",
    parent_id: "test",
    position_id: "test",
    parent_sfen: "test",
    ply: 0,
    played_move: "7g7f",
  });
  return Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
    role: "training",
    policy: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
    manifest: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
    source,
    rows: Object.freeze(new Array(24_000).fill(row)),
  }) as unknown as Readonly<FloodgateStrengthFirstFastTrainingInput>;
}

interface Stored {
  readonly value?: unknown;
  readonly binding: FloodgateStrengthFirstTeacherFileBinding;
}

function fixture(postflightMutation = false) {
  const paths = floodgateStrengthFirstV9TeacherPaths(HOME, REPOSITORY);
  const assets = bindFloodgateStrengthFirstV9FromLegacyAuthorityCoreForTests(
    legacyAssetReceipt(),
    501,
  );
  const storage = new Map<string, Stored>();
  const operations: string[] = [];
  const options: StrengthFirstSiblingTeacherOptions[] = [];
  let loads = 0;
  const writeRaw = (file: string, bytes: Buffer) => {
    storage.set(file, { binding: binding(file, paths.outputRoot, bytes) });
  };
  const commitJson = async (
    file: string,
    root: string,
    _uid: number,
    value: unknown,
  ) => {
    operations.push(`commit:${path.basename(file)}`);
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    const stored = { value, binding: binding(file, root, bytes) };
    storage.set(file, stored);
    return stored.binding;
  };
  const advance = async (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
    option: StrengthFirstSiblingTeacherOptions,
  ): Promise<StrengthFirstSiblingTeacherAdvance> => {
    options.push(option);
    operations.push(`advance:${option.targetParents}`);
    const target = option.targetParents;
    const prefixWork = Object.freeze({
      path: "work.jsonl",
      bytes: target,
      sha256: String(target).padStart(64, "0"),
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      records: target + 1,
      binding_scope: "canonical-target-prefix-projection" as const,
    });
    if (target !== 24_000) {
      return Object.freeze({
        status: "local-work-prefix-complete-not-an-authentication-receipt",
        authentication_receipt: false,
        target_parents: target,
        completed_parents: target,
        run_fingerprint: FINGERPRINT,
        forced_parents_skipped: 0,
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 0,
        },
        emitted_parent_groups: target,
        work: prefixWork,
        current_work: prefixWork,
      }) as StrengthFirstSiblingTeacherAdvance;
    }

    const workBytes = Buffer.from("work\n");
    const trainBytes = Buffer.from("train\n");
    const completionBytes = Buffer.from("completion\n");
    const work = Object.freeze({
      ...binding(paths.stageRoot + "/work.jsonl", paths.outputRoot, workBytes),
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      records: 24_001,
    });
    const train = Object.freeze({
      ...binding(
        paths.stageRoot + "/train.jsonl",
        paths.outputRoot,
        trainBytes,
      ),
      format: "shogi-sibling-jsonl-v1",
      records: 24_000,
      parents: 23_999,
      games: 1_000,
      game_ids_sha256: "3".repeat(64),
      parent_ids_sha256: "4".repeat(64),
      semantic_position_ids_count: 24_000,
      semantic_position_ids_sha256: "5".repeat(64),
    });
    const completion = Object.freeze({
      ...binding(
        paths.stageRoot + "/parent-completion.jsonl",
        paths.outputRoot,
        completionBytes,
      ),
      format: "shogi-strength-first-parent-completion-jsonl-v1",
      records: 24_000,
      forced_parents_skipped: 1,
      emitted_parent_groups: 23_999,
      parent_ids_sha256: "6".repeat(64),
      forced_parent_ids_sha256: "7".repeat(64),
      emitted_parent_ids_sha256: "8".repeat(64),
    });
    const manifest = {
      schema: STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
      status: "complete-training-only",
      run_fingerprint: FINGERPRINT,
      pipeline: { source_revision: REVISION, tracked_tree_clean: true },
      authenticated_input: {
        bundle_verifier_revision: input.binding.verifier_revision,
        binding: input.binding,
        runtime_policy: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
      },
      source: {
        raw_sha256: input.binding.raw_sha256,
        raw_records: 24_000,
        selected_parents: 24_000,
        selected_parent_ids_sha256: input.binding.parent_ids_sha256,
      },
      teacher: {
        engine_bin_bytes: assets.assets.engine.yaneuraou.bytes,
        engine_bin_sha256: assets.assets.engine.yaneuraou.sha256,
        engine_receipt: { file: assets.assets.engine.receipt },
        eval_files: [
          {
            path: "nn.bin",
            bytes: assets.assets.eval.nn.bytes,
            sha256: assets.assets.eval.nn.sha256,
          },
        ],
        eval_sha256: assets.assets.eval.tree_sha256,
        engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
      },
      search: {
        multipv: 12,
        proposal_limit: { depth: 14 },
        limit: { depth: 16 },
        proposal_incomplete_quarantine_policy:
          "proposal-only-typed-fixed-depth-incomplete-ranks-no-label-v1",
        parallel_engines: 13,
        hash_mb_per_engine: 512,
        timeout_ms: 600_000,
      },
      forced_skip_reasons: {
        fewer_than_two_legal_moves: 0,
        search_timeout_no_label: 0,
        proposal_incomplete_no_label: 1,
      },
      parent_completion: completion,
      outputs: { train },
      publication: { consumer_postflight_bound: false },
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const manifestBinding = Object.freeze({
      ...binding(
        paths.stageRoot + "/manifest.json",
        paths.outputRoot,
        manifestBytes,
      ),
      schema: STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
    });
    const staged = {
      schema: STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
      status: "complete-training-only",
      run_fingerprint: FINGERPRINT,
      runner_revision: REVISION,
      bundle_verifier_revision: input.binding.verifier_revision,
      input_parents: 24_000,
      completed_parents: 24_000,
      forced_parents_skipped: 1,
      forced_skip_reasons: manifest.forced_skip_reasons,
      emitted_parent_groups: 23_999,
      work,
      train,
      parent_completion: completion,
      manifest: manifestBinding,
      publication: { consumer_postflight_bound: false },
    };
    const stagedBytes = Buffer.from(`${JSON.stringify(staged, null, 2)}\n`);
    writeRaw(paths.stageRoot + "/work.jsonl", workBytes);
    writeRaw(paths.stageRoot + "/train.jsonl", trainBytes);
    writeRaw(paths.stageRoot + "/parent-completion.jsonl", completionBytes);
    storage.set(paths.stageRoot + "/manifest.json", {
      value: manifest,
      binding: manifestBinding,
    });
    storage.set(paths.stageRoot + "/staged-result.json", {
      value: staged,
      binding: binding(
        paths.stageRoot + "/staged-result.json",
        paths.outputRoot,
        stagedBytes,
      ),
    });
    return Object.freeze({
      status: "complete-training-only",
      authentication_receipt: false,
      target_parents: 24_000,
      completed_parents: 24_000,
      run_fingerprint: FINGERPRINT,
      manifest,
      staged_result: staged,
    }) as unknown as StrengthFirstSiblingTeacherAdvance;
  };
  const dependencies: FloodgateStrengthFirstV9TeacherRunnerDependencies = {
    homeDirectory: () => HOME,
    runnerRepositoryRoot: REPOSITORY,
    nodeVersion: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION,
    platform: "darwin",
    architecture: "arm64",
    effectiveUserId: 501,
    ensurePrivateDirectory: vi.fn(async () => undefined),
    acquireRunLock: vi.fn(async () => async () => undefined),
    verifyProductionAssets: vi.fn(async () => assets),
    captureExactCleanRevision: vi.fn(async () => REVISION),
    loadFastTrainingInput: vi.fn(async () => {
      loads += 1;
      operations.push(`load:${loads}`);
      if (postflightMutation && loads === 2) {
        return fastInput({
          ...FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY,
          sha256: "f".repeat(64),
        });
      }
      return fastInput();
    }),
    advanceTeacher: vi.fn(advance),
    readPrivateJson: vi.fn(async (file) => storage.get(file) ?? null),
    digestPrivateFile: vi.fn(async (file) => {
      const stored = storage.get(file);
      if (!stored) throw new Error(`missing synthetic file ${file}`);
      return stored.binding;
    }),
    commitPrivateJson: vi.fn(commitJson),
    reportProgress: vi.fn(() => undefined),
  };
  return { dependencies, operations, options, storage, paths };
}

describe("strength-first v9 teacher runner", () => {
  it("runs d14 proposals and d16 rescoring, reauthenticates input, then commits result last", async () => {
    const run = fixture();
    const receipt = await runFloodgateStrengthFirstV9TeacherCore(
      run.dependencies,
    );

    expect(receipt.idempotent_existing_result).toBe(false);
    expect(receipt.result.schema).toBe(
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA,
    );
    expect(receipt.result.authenticated_input.runtime.equal).toBe(true);
    expect(run.options.map((option) => option.targetParents)).toEqual([
      100, 500, 24_000,
    ]);
    expect(
      run.options.every(
        (option) =>
          option.proposalDepth === 14 &&
          option.depth === 16 &&
          option.hashMb === 512 &&
          option.authenticatedInputPolicy ===
            FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
      ),
    ).toBe(true);
    expect(run.operations).toEqual([
      "load:1",
      "advance:100",
      "commit:milestone-100.json",
      "advance:500",
      "commit:milestone-500.json",
      "advance:24000",
      "load:2",
      "commit:result.json",
    ]);
  });

  it("fails closed before result publication when postflight input changes", async () => {
    const run = fixture(true);
    await expect(
      runFloodgateStrengthFirstV9TeacherCore(run.dependencies),
    ).rejects.toThrow("invalid strength-first v9 fast training input");
    expect(run.storage.has(run.paths.result)).toBe(false);
    expect(run.operations.at(-1)).toBe("load:2");
  });
});
