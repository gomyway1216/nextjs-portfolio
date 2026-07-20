import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  STRENGTH_FIRST_V9_PRODUCTION_ENGINES,
  advanceStrengthFirstSiblingTeacherDatasetCoreForTests,
  siblingTeacherStagePaths,
} from "../../../ml/generate-sibling-teacher";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_STATUS,
  FLOODGATE_STRENGTH_FIRST_V8_MERGE_REVISION,
  FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_STATUS,
  FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION,
  parseFloodgateStrengthFirstV8PrettyJsonForTests,
  validateFloodgateStrengthFirstV9ForcedReasonsForTests,
  verifyFloodgateStrengthFirstV8DownstreamProvenance,
  verifyFloodgateStrengthFirstV9DownstreamProvenance,
  type FloodgateStrengthFirstV8DownstreamProvenanceInput,
  type FloodgateStrengthFirstV9DownstreamProvenanceInput,
} from "../../../ml/floodgate-strength-first-v8-downstream-provenance";
import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
} from "../../../ml/floodgate-strength-first-fast-training-input";
import {
  FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
  FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
} from "../../../ml/floodgate-strength-first-teacher-runner";
import {
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT,
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS,
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME,
} from "../../../ml/floodgate-strength-first-v8-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
} from "../../../ml/floodgate-strength-first-v9-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_MILESTONE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA,
} from "../../../ml/floodgate-strength-first-v9-teacher-runner";
import { runFloodgateStrengthFirstV8DownstreamProvenanceCli } from "../../../ml/verify-floodgate-strength-first-v8-downstream-provenance";
import { runFloodgateStrengthFirstV9DownstreamProvenanceCli } from "../../../ml/verify-floodgate-strength-first-v9-downstream-provenance";
import {
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from "../../../ml/floodgate-training-row-consumer";
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from "../../../ml/floodgate-role-bundle";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import { positionKeyFromSfen } from "../../../ml/sibling-data";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const START_WITHOUT_NINTH_FILE_PAWN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/1PPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const ONE_LEGAL =
  "1+R3l2l/4+Pgk2/1s2p1sp1/p3np2p/3B3N1/P1G3S2/1P2+pP2P/1R2+n4/L+b2K1GNL b GS2P5p 107";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

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
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function prettyBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function v9VerifierBinding(value: Record<string, unknown>): {
  verifier_revision: string;
} {
  return (
    value as unknown as {
      authenticated_input: {
        generator_projection: {
          binding: { verifier_revision: string };
        };
      };
    }
  ).authenticated_input.generator_projection.binding;
}

function fileBinding(file: string, bytes: Uint8Array) {
  return {
    path: file,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function gameId(sourceUrl: string): string {
  return `sha256:${sha256(`floodgate-q1-2026-game-id-v1\0${sourceUrl}`)}`;
}

function parentId(game: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${game}\0${ply}`)}`;
}

function rawRow(
  sourceUrl: string,
  parentSfen: string,
  ply: number,
  playedMove: string,
): Record<string, unknown> {
  const game = gameId(sourceUrl);
  return {
    game_id: game,
    game_sha256: sha256(`game:${sourceUrl}`),
    parent_id: parentId(game, ply),
    parent_sfen: parentSfen,
    played_move: playedMove,
    ply,
    position_id: positionKeyFromSfen(parentSfen),
    schema_version: 1,
    source: "floodgate",
    source_url: sourceUrl,
  };
}

async function writeEngineReceipt(root: string): Promise<string> {
  const engine = await fs.promises.readFile(process.execPath);
  const receipt = path.join(root, "engine-receipt.json");
  await fs.promises.writeFile(
    receipt,
    `${JSON.stringify({
      schema: "shogi-teacher-engine-receipt-v1",
      source_repository: "https://example.test/teacher-engine.git",
      source_commit: "0123456789abcdef0123456789abcdef01234567",
      source_commit_date: "2026-07-02T13:41:06+09:00",
      build_directory: "source",
      build_command: "test build",
      compiler: "test compiler",
      compiler_target: "test-target",
      engine_id: "deterministic fake engine",
      binary_bytes: engine.byteLength,
      binary_sha256: sha256(engine),
    })}\n`,
  );
  return receipt;
}

async function writeFixtureEngine(root: string): Promise<string> {
  const engine = path.join(root, "fixture-engine.mjs");
  await fs.promises.writeFile(
    engine,
    `import readline from 'node:readline';
let multipv = 1;
const proposal = [
  '1g1f', '2g2f', '3g3f', '4g4f', '5g5f', '6g6f',
  '7g7f', '8g8f', '2h1h', '2h3h', '4i3h', '4i5h'
];
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line === 'usi') { console.log('id name fixture-engine'); console.log('usiok'); return; }
  if (line === 'isready') { console.log('readyok'); return; }
  const multi = line.match(/^setoption name MultiPV value (\\d+)$/);
  if (multi) { multipv = Number(multi[1]); return; }
  if (line === 'quit') { process.exit(0); return; }
  if (!line.startsWith('go ')) return;
  const depth = Number(line.match(/\\bdepth (\\d+)/)?.[1] ?? 16);
  const searchmoves = line.match(/\\bsearchmoves (.+)$/)?.[1].trim().split(/\\s+/) ?? [];
  const moves = (searchmoves.length === 0 ? proposal : searchmoves).slice(0, multipv);
  for (let rank = moves.length; rank >= 1; rank -= 1) {
    console.log(\`info depth \${depth} multipv \${rank} score cp \${500 - rank} nodes 64 pv \${moves[rank - 1]}\`);
  }
  console.log(\`bestmove \${moves[0]}\`);
});
`,
  );
  return engine;
}

function evidence(
  relativePath: string,
  bytes: number,
  digest: string,
  mode: "0600" | "0700",
  inode: number,
) {
  return {
    relative_path: relativePath,
    bytes,
    sha256: digest,
    mode,
    identity: { dev: "1", ino: String(inode) },
  };
}

interface Fixture {
  readonly input:
    | FloodgateStrengthFirstV8DownstreamProvenanceInput
    | FloodgateStrengthFirstV9DownstreamProvenanceInput;
  readonly resultValue: Record<string, unknown>;
}

async function fixture(
  generation: "v8" | "v9" = "v8",
  verifierRevision?: string,
): Promise<Fixture> {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `${generation}-provenance-`),
  );
  roots.push(root);
  const stageRoot = path.join(root, "stage");
  const stage = siblingTeacherStagePaths(stageRoot);
  const evalDir = path.join(root, "eval");
  await fs.promises.mkdir(evalDir, { recursive: true });
  await fs.promises.writeFile(path.join(evalDir, "nn.bin"), "fixture-nnue\n");
  const rawRows = [
    rawRow(
      "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+A+B+20260101000000.csa",
      ONE_LEGAL,
      106,
      "8h5h",
    ),
    rawRow(
      "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/02/wdoor+floodgate-300-10F+C+D+20260102000000.csa",
      START,
      0,
      "6g6f",
    ),
    rawRow(
      "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/03/wdoor+floodgate-300-10F+E+F+20260103000000.csa",
      START_WITHOUT_NINTH_FILE_PAWN,
      0,
      "6g6f",
    ),
  ].sort((left, right) =>
    Buffer.compare(
      Buffer.from(String(left.parent_id)),
      Buffer.from(String(right.parent_id)),
    ),
  );
  const authenticatedRows = rawRows.map((row): FloodgateTrainingParent => ({
    schema_version: 1,
    game_id: String(row.game_id),
    parent_id: String(row.parent_id),
    position_id: String(row.position_id),
    parent_sfen: String(row.parent_sfen),
    ply: Number(row.ply),
    played_move: String(row.played_move),
  }));
  const raw = Buffer.from(`${rawRows.map(canonicalJson).join("\n")}\n`);
  const gameIds = new Set(authenticatedRows.map((row) => row.game_id));
  const parentIds = new Set(authenticatedRows.map((row) => row.parent_id));
  const positionIds = new Set(authenticatedRows.map((row) => row.position_id));
  const authenticated: Readonly<AuthenticatedFloodgateTrainingRows> =
    Object.freeze({
      schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
      role: "training",
      binding: Object.freeze({
        result_receipt_bytes: 1,
        result_receipt_sha256: sha256("result-receipt"),
        bundle_manifest_bytes: 1,
        bundle_manifest_sha256: sha256("bundle-manifest"),
        bundle_producer_revision: "1".repeat(40),
        verifier_revision:
          verifierRevision ??
          (generation === "v8"
            ? FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION
            : FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION),
        raw_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
        raw_bytes: raw.byteLength,
        raw_sha256: sha256(raw),
        records: authenticatedRows.length,
        games: gameIds.size,
        game_ids_sha256: floodgateIdentifierDigest(gameIds),
        parent_ids_sha256: floodgateIdentifierDigest(parentIds),
        position_ids_count: positionIds.size,
        position_ids_sha256: floodgateIdentifierDigest(positionIds),
      }),
      rows: Object.freeze(authenticatedRows.map((row) => Object.freeze(row))),
    });
  const baseOptions = {
    stageRoot,
    runnerRevision:
      generation === "v8"
        ? FLOODGATE_STRENGTH_FIRST_V8_MERGE_REVISION
        : FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION,
    engineBin: process.execPath,
    engineArgs: [await writeFixtureEngine(root)],
    engineReceipt: await writeEngineReceipt(root),
    evalDir,
    multipv: 12,
    depth: 16,
    engines:
      generation === "v8" ? 12 : STRENGTH_FIRST_V9_PRODUCTION_ENGINES,
    hashMb: FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
    timeoutMs: 600_000,
    ...(generation === "v8"
      ? {}
      : {
          proposalDepth: 14,
          authenticatedInputPolicy:
            FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
        }),
  };
  const dependencies = {
    verifyRevision: async (revision: string) => ({
      source_revision: revision,
      tracked_tree_clean: true as const,
    }),
    verifyOutputPaths: async () => undefined,
  };
  const first = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
    authenticated,
    { ...baseOptions, targetParents: 1, finalize: false },
    dependencies,
  );
  const second = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
    authenticated,
    { ...baseOptions, targetParents: 2, finalize: false },
    dependencies,
  );
  const final = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
    authenticated,
    { ...baseOptions, targetParents: 3, finalize: true },
    dependencies,
  );
  if (
    first.status !==
      "local-work-prefix-complete-not-an-authentication-receipt" ||
    second.status !==
      "local-work-prefix-complete-not-an-authentication-receipt" ||
    final.status !== "complete-training-only"
  ) {
    throw new Error("fixture generation did not reach the expected milestones");
  }
  const [manifest, stagedResult, work, completion, train] = await Promise.all([
    fs.promises.readFile(stage.manifest),
    fs.promises.readFile(stage.stagedResult),
    fs.promises.readFile(stage.work),
    fs.promises.readFile(stage.parentCompletion),
    fs.promises.readFile(stage.train),
  ]);
  const manifestValue = JSON.parse(manifest.toString("utf8")) as Record<
    string,
    any
  >;
  const engineReceiptFile = manifestValue.teacher.engine_receipt.file;
  const evalNn = manifestValue.teacher.eval_files[0];
  const engineAsset = evidence(
    "engine/yaneuraou",
    manifestValue.teacher.engine_bin_bytes,
    manifestValue.teacher.engine_bin_sha256,
    "0700",
    1,
  );
  const receiptAsset = evidence(
    "engine/yaneuraou-receipt.json",
    engineReceiptFile.bytes,
    engineReceiptFile.sha256,
    "0600",
    2,
  );
  const evalAsset = evidence(
    "eval/nn.bin",
    evalNn.bytes,
    evalNn.sha256,
    "0600",
    3,
  );
  const stableAsset = (name: string, inode: number) =>
    evidence(`stable/${name}`, 1, sha256(name), "0600", inode);
  const assets = {
    engine: { yaneuraou: engineAsset, receipt: receiptAsset },
    eval: { nn: evalAsset, tree_sha256: manifestValue.teacher.eval_sha256 },
    stable: {
      plan: stableAsset("plan.json", 4),
      wasm: stableAsset("shogi.wasm", 5),
      weights: stableAsset("weights.bin", 6),
      worker: stableAsset("worker.mjs", 7),
    },
  };
  const engine = {
    receipt_schema: "shogi-teacher-engine-receipt-v1",
    source_repository: "https://example.test/teacher-engine.git",
    source_commit: "0123456789abcdef0123456789abcdef01234567",
    source_commit_date: "2026-07-02T13:41:06+09:00",
    engine_id: "deterministic fake engine",
    binary_cross_bound: true,
  };
  const postverification = {
    embedded_wasm_exactly_equal: true,
    exact_entries_revalidated: true,
    identities_revalidated: true,
    contents_stably_read: true,
  };
  const legacy = {
    contract: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
    execution_boundary: "production-fixed-registry-and-deployment-root",
    deployment: {
      layout: "fixed-per-user-application-support-v1",
      owner_uid: 501,
      exact_tree: true,
      private_directories: true,
    },
    assets,
    engine,
    runtime: FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
    postverification,
  };
  const v8Authority = {
    contract: FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT,
    status: FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS,
    claim_boundary:
      FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-registry-and-deployment-root",
    asset_authority: legacy,
    assets,
    engine,
    postverification,
    runtime: FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME,
  };
  const authority =
    generation === "v8"
      ? v8Authority
      : {
          contract: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT,
          status: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS,
          claim_boundary:
            FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
          execution_boundary:
            "production-fixed-registry-and-deployment-root",
          asset_authority: v8Authority,
          assets,
          engine,
          postverification,
          runtime: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
        };
  const inputProjection = {
    schema: authenticated.schema,
    role: authenticated.role,
    binding: authenticated.binding,
  };
  const fastInputBinding = {
    schema: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
    role: "training",
    policy: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
    manifest: {
      path: "manifest.json",
      bytes: authenticated.binding.bundle_manifest_bytes,
      sha256: authenticated.binding.bundle_manifest_sha256,
    },
    source: {
      path: "training.raw.jsonl",
      format: authenticated.binding.raw_format,
      bytes: authenticated.binding.raw_bytes,
      sha256: authenticated.binding.raw_sha256,
      records: authenticated.binding.records,
      games: authenticated.binding.games,
      game_ids_sha256: authenticated.binding.game_ids_sha256,
      parent_ids_sha256: authenticated.binding.parent_ids_sha256,
      position_ids_count: authenticated.binding.position_ids_count,
      position_ids_sha256: authenticated.binding.position_ids_sha256,
    },
  };
  const milestone = (progress: typeof first) => {
    const progressValue = {
      status: progress.status,
      authentication_receipt: progress.authentication_receipt,
      ...(generation === "v8"
        ? {
            target_parents: progress.target_parents,
            completed_parents: progress.completed_parents,
          }
        : {}),
      run_fingerprint: progress.run_fingerprint,
      forced_parents_skipped: progress.forced_parents_skipped,
      forced_skip_reasons: progress.forced_skip_reasons,
      emitted_parent_groups: progress.emitted_parent_groups,
      work: progress.work,
    };
    return {
      schema:
        generation === "v8"
          ? FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA
          : FLOODGATE_STRENGTH_FIRST_V9_TEACHER_MILESTONE_SCHEMA,
      status:
        "local-work-prefix-complete-not-an-authentication-or-playing-strength-receipt",
      authentication_receipt: false,
      playing_strength_evidence: false,
      target_parents: progress.target_parents,
      completed_parents: progress.completed_parents,
      runner_revision:
        generation === "v8"
          ? FLOODGATE_STRENGTH_FIRST_V8_MERGE_REVISION
          : FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION,
      ...(generation === "v8"
        ? {
            authenticated_input: inputProjection,
            stage: {
              root: ".",
              same_stage_for_all_targets: true,
              automatically_continue_to_next_target: true,
            },
          }
        : { fast_input_preflight: fastInputBinding }),
      progress: progressValue,
    };
  };
  const milestone100 = prettyBytes(milestone(first));
  const milestone500 = prettyBytes(milestone(second as typeof first));
  const postflight = {
    schema: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
    status: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
    claim_boundary: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-pinned-bundle-verifier",
    input: inputProjection,
    runtime_claim: FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
    postflight: {
      callback_settled_without_value: true,
      filesystem_snapshot_revalidated_after_callback: true,
      input_descriptors_closed: true,
    },
  };
  const resultValue = {
    schema:
      generation === "v8"
        ? FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA
        : FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA,
    status:
      generation === "v8"
        ? "complete-training-only-postflight-bound"
        : "complete-training-only-fast-input-postflight-bound",
    claim_boundary:
      generation === "v8"
        ? "postflight-input-and-staged-output-integrity-not-playing-strength-evidence"
        : "fast-input-and-staged-output-integrity-not-playing-strength-evidence",
    runner: {
      schema:
        generation === "v8"
          ? FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA
          : FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA,
      revision:
        generation === "v8"
          ? FLOODGATE_STRENGTH_FIRST_V8_MERGE_REVISION
          : FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION,
      node:
        generation === "v8"
          ? FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION
          : FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION,
      platform: "darwin",
      architecture: "arm64",
      local_only: true,
      network_requests: 0,
      cloud_services: [],
      live_weight_changes: 0,
    },
    production_asset_preflight: authority,
    authenticated_input:
      generation === "v8"
        ? inputProjection
        : {
            runtime: {
              preflight: fastInputBinding,
              postflight: fastInputBinding,
              equal: true,
            },
            generator_projection: {
              ...inputProjection,
              historic_provenance_not_reverified_by_fast_path: true,
            },
          },
    ...(generation === "v8" ? { consumer_postflight: postflight } : {}),
    teacher:
      generation === "v8"
        ? {
            engine: "YaneuraOu",
            parallel_engines: 12,
            threads_per_engine: 1,
            proposal: { multipv: 12, depth: 16 },
            independent_rescore: {
              multipv: 1,
              searchmoves: "exactly-one-candidate",
              depth: 16,
            },
            hash_mb_per_engine:
              FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
            timeout_ms_per_search: 600_000,
            engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
            stable_assets_verified: true,
            stable_engine_or_policy_executions: 0,
          }
        : {
            engine: "YaneuraOu",
            runtime: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
            engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
            stable_assets_verified: true,
            stable_engine_or_policy_executions: 0,
          },
    milestones: {
      targets: [1, 2, 3],
      prefix_100: fileBinding("milestone-1.json", milestone100),
      prefix_500: fileBinding("milestone-2.json", milestone500),
    },
    completion: {
      input_parents: 3,
      completed_parents: 3,
      forced_parents_skipped: final.staged_result.forced_parents_skipped,
      forced_skip_reasons: final.staged_result.forced_skip_reasons,
      emitted_parent_groups: final.staged_result.emitted_parent_groups,
      run_fingerprint: final.run_fingerprint,
    },
    staged_outputs: {
      work: fileBinding("work.jsonl", work),
      train: fileBinding("train.jsonl", train),
      parent_completion: fileBinding("parent-completion.jsonl", completion),
      manifest: fileBinding("manifest.json", manifest),
      staged_result: fileBinding("staged-result.json", stagedResult),
    },
    publication:
      generation === "v8"
        ? {
            stage_root_private_0700: true,
            stage_files_private_0600: true,
            staged_inside_single_authenticated_callback: true,
            postflight_exact_receipt_claimed_before_result_commit: true,
            result_file_sync_before_rename: true,
            result_same_directory_rename: true,
            result_directory_sync_after_rename: true,
          }
        : {
            stage_root_private_0700: true,
            stage_files_private_0600: true,
            fast_input_reauthenticated_after_teacher: true,
            postflight_equal_before_result_commit: true,
            result_committed_last: true,
          },
  };
  return {
    resultValue,
    input: {
      result: prettyBytes(resultValue),
      manifest,
      stagedResult,
      milestone100,
      milestone500,
      work,
      parentCompletion: completion,
      train,
      authenticatedInputRaw: raw,
      expectedAssetAuthority: authority,
      verifyRevisionDescendant: async () => true,
      testOnlyContract: { parentTarget: 3, milestoneTargets: [1, 2] },
    },
  };
}

describe("strength-first v8 downstream provenance", () => {
  it("accepts canonical small pretty JSON records before semantic validation", () => {
    expect(
      parseFloodgateStrengthFirstV8PrettyJsonForTests(Buffer.from("{}\n")),
    ).toEqual({});
  });

  it("keeps the production CLI argumentless", async () => {
    await expect(
      runFloodgateStrengthFirstV8DownstreamProvenanceCli(["path-override"]),
    ).rejects.toThrow("unsupported-invocation");
  });

  it("accepts the complete row-semantic chain, emits only safe aggregates, and fails closed", async () => {
    const data = await fixture();
    const input =
      data.input as FloodgateStrengthFirstV8DownstreamProvenanceInput;
    const summary = await verifyFloodgateStrengthFirstV8DownstreamProvenance(
      input,
    );
    expect(summary).toMatchObject({
      schema: FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_SCHEMA,
      status: FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_STATUS,
      target_parents: 3,
      forced_parents_skipped: 1,
      emitted_parent_groups: 2,
      fewer_than_two_legal_moves: 1,
      search_timeout_no_label: 0,
      milestone_targets: [1, 2],
      local_only: true,
      network_requests: 0,
      cloud_services: 0,
      live_weight_changes: 0,
      training_only: true,
      private_identifiers_disclosed: false,
      private_digests_disclosed: false,
    });
    const publicText = JSON.stringify(summary);
    expect(publicText).not.toMatch(/sha256:/u);
    expect(publicText).not.toMatch(/[0-9a-f]{64}/u);

    const timeoutMiscount = structuredClone(data.resultValue) as Record<
      string,
      any
    >;
    timeoutMiscount.completion.forced_skip_reasons = {
      fewer_than_two_legal_moves: 0,
      search_timeout_no_label: 1,
    };
    const failures: FloodgateStrengthFirstV8DownstreamProvenanceInput[] = [
      { ...input, result: prettyBytes(timeoutMiscount) },
      {
        ...input,
        work: Buffer.concat([input.work as Uint8Array, Buffer.from("x")]),
      },
      { ...input, verifyRevisionDescendant: async () => false },
      {
        ...input,
        authenticatedInput: {} as AuthenticatedFloodgateTrainingRows,
      },
    ];
    for (const invalid of failures) {
      await expect(
        verifyFloodgateStrengthFirstV8DownstreamProvenance(invalid),
      ).rejects.toThrow(/^v8-downstream-provenance-verification-failed$/u);
    }
  }, 30_000);
});

describe("strength-first v9 downstream provenance", () => {
  it("canonicalizes an absent third reason to zero and rejects only noncanonical fields", () => {
    expect(
      validateFloodgateStrengthFirstV9ForcedReasonsForTests(
        {
          fewer_than_two_legal_moves: 1,
          search_timeout_no_label: 0,
        },
        1_000,
        1,
      ),
    ).toEqual({ fewer: 1, timedOut: 0, proposalIncomplete: 0 });
    expect(
      validateFloodgateStrengthFirstV9ForcedReasonsForTests(
        {
          fewer_than_two_legal_moves: 1,
          search_timeout_no_label: 0,
          proposal_incomplete_no_label: 0,
        },
        1_000,
        1,
      ),
    ).toEqual({ fewer: 1, timedOut: 0, proposalIncomplete: 0 });
    expect(
      validateFloodgateStrengthFirstV9ForcedReasonsForTests(
        {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 0,
          proposal_incomplete_no_label: 1,
        },
        1_000,
        1,
      ),
    ).toEqual({ fewer: 0, timedOut: 0, proposalIncomplete: 1 });
    expect(() =>
      validateFloodgateStrengthFirstV9ForcedReasonsForTests(
        {
          fewer_than_two_legal_moves: 1,
          search_timeout_no_label: 0,
          unexpected: 0,
        },
        1_000,
        1,
      ),
    ).toThrow();
  });

  it("keeps the production CLI argumentless", async () => {
    await expect(
      runFloodgateStrengthFirstV9DownstreamProvenanceCli(["path-override"]),
    ).rejects.toThrow("unsupported-invocation");
  });

  it("accepts the d14/d16 row-semantic chain and rejects a weakened runtime claim", async () => {
    const data = await fixture("v9");
    const input =
      data.input as FloodgateStrengthFirstV9DownstreamProvenanceInput;
    expect(v9VerifierBinding(data.resultValue).verifier_revision).toBe(
      FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION,
    );
    const summary = await verifyFloodgateStrengthFirstV9DownstreamProvenance(
      input,
    );
    expect(summary).toMatchObject({
      schema: FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_SCHEMA,
      status: FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_STATUS,
      target_parents: 3,
      forced_parents_skipped: 1,
      emitted_parent_groups: 2,
      fewer_than_two_legal_moves: 1,
      search_timeout_no_label: 0,
      proposal_incomplete_no_label: 0,
      milestone_targets: [1, 2],
      local_only: true,
      network_requests: 0,
      cloud_services: 0,
      live_weight_changes: 0,
      training_only: true,
      private_identifiers_disclosed: false,
      private_digests_disclosed: false,
    });
    const publicText = JSON.stringify(summary);
    expect(publicText).not.toMatch(/sha256:/u);
    expect(publicText).not.toMatch(/[0-9a-f]{64}/u);

    const weakenedRuntime = structuredClone(data.resultValue) as Record<
      string,
      any
    >;
    weakenedRuntime.teacher.runtime.proposal.depth = 13;
    await expect(
      verifyFloodgateStrengthFirstV9DownstreamProvenance({
        ...input,
        result: prettyBytes(weakenedRuntime),
      }),
    ).rejects.toThrow(/^v9-downstream-provenance-verification-failed$/u);

    const legacyVerifierRevision = structuredClone(data.resultValue) as Record<
      string,
      unknown
    >;
    v9VerifierBinding(legacyVerifierRevision).verifier_revision =
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION;
    await expect(
      verifyFloodgateStrengthFirstV9DownstreamProvenance({
        ...input,
        result: prettyBytes(legacyVerifierRevision),
      }),
    ).rejects.toThrow(/^v9-downstream-provenance-verification-failed$/u);

    const mismatchedInput = await fixture(
      "v9",
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
    );
    await expect(
      verifyFloodgateStrengthFirstV9DownstreamProvenance(
        mismatchedInput.input as FloodgateStrengthFirstV9DownstreamProvenanceInput,
      ),
    ).rejects.toThrow(/^v9-downstream-provenance-verification-failed$/u);
  }, 30_000);
});
