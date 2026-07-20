import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  FRESH_SELECTION_TEACHER_AUTHORITY_SCHEMA,
  FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
  FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
  FRESH_SELECTION_TEACHER_PREFLIGHT_SCHEMA,
  FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
  FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
  FRESH_SELECTION_TEACHER_SOURCE,
  FRESH_SELECTION_TEACHER_STATUS,
  freshSelectionTeacherPaths,
  runFreshSelectionTeacherCore,
  validateFreshSelectionTeacherSearchPolicy,
  type FreshSelectionTeacherArtifactIdentity,
  type FreshSelectionTeacherCheckpointPreflight,
  type FreshSelectionTeacherRunnerDependencies,
  type FreshSelectionTeacherSearchPolicy,
  type FreshSelectionTeacherSourceSnapshot,
} from "../../../ml/floodgate-fresh-selection-teacher-runner";
import { runFreshSelectionTeacherCliCore } from "../../../ml/run-floodgate-fresh-selection-teacher";
import {
  parseAuthenticatedFloodgateFreshSelectionRows,
  parseAuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from "../../../ml/floodgate-training-row-validation";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import { positionKeyFromSfen } from "../../../ml/sibling-data";

const REVISION = "1".repeat(40);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function artifact(pathname: string, schema: string): FreshSelectionTeacherArtifactIdentity {
  return {
    path: pathname,
    bytes: 123,
    sha256: sha256(pathname),
    schema,
  };
}

function preflight(): FreshSelectionTeacherCheckpointPreflight {
  return {
    schema: FRESH_SELECTION_TEACHER_PREFLIGHT_SCHEMA,
    status: "three-candidate-checkpoints-strict-loaded",
    training_plan: artifact("ml/protocols/training-plan.json", "training-plan-v2"),
    selection_preflight_registry: artifact(
      "ml/protocols/selection-preflight.json",
      "selection-preflight-v1",
    ),
    checkpoint_preflight_sha256: sha256("checkpoint-preflight"),
    strict_loaded_seeds: [42, 43, 44],
    strict_loaded_checkpoints: 3,
    selection_source_opened: false,
    network_requests: 0,
    live_weight_writes: 0,
  };
}

function policy(
  overrides: Partial<FreshSelectionTeacherSearchPolicy["runtime"]> = {},
): FreshSelectionTeacherSearchPolicy {
  return {
    schema: FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
    status: "ready-for-post-checkpoint-local-teacher",
    role: "fresh_selection",
    teacher: {
      engine: "YaneuraOu",
      threads_per_engine: 1,
      proposal: { multipv: 6, depth: 14 },
      typed_incomplete_proposal_fallback: {
        allowed_only_when_legal_moves_at_most: 6,
        search: "every-legal-move-separately",
        multipv: 1,
        depth: 14,
        mixed_partial_and_fallback_ranks_accepted: false,
      },
      candidate_union: [
        "complete-proposal-or-complete-all-legal-fallback",
        "strong-game-played-move",
      ],
      independent_rescore: {
        multipv: 1,
        searchmoves: "exactly-one-candidate",
        depth: 16,
        isready_before_each_candidate: true,
        tt_reset_before_each_candidate: true,
        candidate_execution_order: "utf8-bytewise-ascending",
      },
    },
    runtime: {
      parallel_engines: 12,
      threads_per_engine: 1,
      hash_mb_per_engine: 512,
      timeout_ms_per_search: 600_000,
      network: false,
      ...overrides,
    },
    completion: {
      input_parents: 4_800,
      input_games: 200,
      timeout_or_incomplete_without_exact_fallback: "fatal-no-publication",
      allowed_forced_skip_reason: "fewer_than_two_legal_moves",
      partial_publication: false,
    },
  };
}

function source(): FreshSelectionTeacherSourceSnapshot {
  const row: FloodgateTrainingParent = Object.freeze({
    schema_version: 1,
    game_id: `sha256:${"2".repeat(64)}`,
    parent_id: `sha256:${"3".repeat(64)}`,
    position_id: `sha256:${"4".repeat(64)}`,
    parent_sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    ply: 0,
    played_move: "7g7f",
  });
  return {
    bytes: new Uint8Array(),
    rows: Object.freeze(Array.from({ length: 4_800 }, () => row)),
    identity: FRESH_SELECTION_TEACHER_SOURCE,
  };
}

async function dependencies(
  home: string,
  overrides: Partial<FreshSelectionTeacherRunnerDependencies> = {},
): Promise<FreshSelectionTeacherRunnerDependencies> {
  const repositoryRoot = path.join(home, "repository");
  await fs.promises.mkdir(repositoryRoot);
  const sourceSnapshot = source();
  const searchPolicy = policy();
  return {
    homeDirectory: () => home,
    repositoryRoot,
    effectiveUserId: process.geteuid?.() ?? 0,
    availableParallelism: 14,
    setUmask: (mode) => process.umask(mode),
    assertFormalTeacherIdle: vi.fn(async () => undefined),
    captureExactCleanRevision: vi.fn(async () => REVISION),
    checkpointPreflight: vi.fn(async () => preflight()),
    verifyAssets: vi.fn(async () => ({ fixed: "asset-receipt" }) as never),
    readSearchPolicy: vi.fn(async () => ({
      value: searchPolicy,
      identity: artifact(
        FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
        FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
      ),
    })),
    readSource: vi.fn(async () => sourceSnapshot),
    generate: vi.fn(async (request) => {
      await fs.promises.writeFile(request.datasetPath, "{}\n", { mode: 0o600 });
      await fs.promises.chmod(request.datasetPath, 0o600);
      return {
        status: "complete-fresh-selection-only",
        generation_run_fingerprint: sha256("generation"),
        completed_parents: 4_800,
        forced_parents_skipped: 0,
        forced_skip_reasons: { fewer_than_two_legal_moves: 0 },
        emitted_parent_groups: 4_800,
        dataset_records: 9_600,
      };
    }),
    reportProgress: vi.fn(),
    ...overrides,
  };
}

describe("fresh-selection teacher runner", () => {
  it("authenticates the fresh-selection basename without weakening the training basename", () => {
    const sourceUrl =
      "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/" +
      "wdoor+floodgate-300-10F+playerA+playerB+20260101000000.csa";
    const gameId = `sha256:${sha256(`floodgate-q1-2026-game-id-v1\0${sourceUrl}`)}`;
    const parentId = `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${0}`)}`;
    const parentSfen =
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
    const positionId = positionKeyFromSfen(parentSfen);
    const line = canonicalJson({
      game_id: gameId,
      game_sha256: "a".repeat(64),
      parent_id: parentId,
      parent_sfen: parentSfen,
      played_move: "7g7f",
      ply: 0,
      position_id: positionId,
      schema_version: 1,
      source: "floodgate",
      source_url: sourceUrl,
    });
    const bytes = Buffer.from(`${line}\n`);
    const identity = {
      path: "fresh-selection.raw.jsonl" as const,
      bytes: bytes.byteLength,
      format: "shogi-floodgate-label-free-raw-parent-jsonl-v1" as const,
      sha256: sha256(bytes.toString()),
      records: 1,
      games: 1,
      game_ids_sha256: floodgateIdentifierDigest([gameId]),
      parent_ids_sha256: floodgateIdentifierDigest([parentId]),
      position_ids_count: 1,
      position_ids_sha256: floodgateIdentifierDigest([positionId]),
    };
    expect(parseAuthenticatedFloodgateFreshSelectionRows(bytes, identity)).toHaveLength(1);
    expect(() =>
      parseAuthenticatedFloodgateTrainingRows(bytes, identity),
    ).toThrow(/path or format is not fixed/);
  });

  it("strict-loads first, generates all 4,800 parents, revalidates, and commits exact documents", async () => {
    const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fresh-selection-runner-"));
    const events: string[] = [];
    const base = await dependencies(home);
    const wrapped: FreshSelectionTeacherRunnerDependencies = {
      ...base,
      checkpointPreflight: vi.fn(async () => {
        events.push("checkpoint-preflight");
        return preflight();
      }),
      readSource: vi.fn(async () => {
        events.push("source-read");
        return source();
      }),
      generate: vi.fn(async (request) => {
        events.push("generate");
        expect(request.rows).toHaveLength(4_800);
        expect(request.searchPolicy.teacher.proposal).toEqual({
          multipv: 6,
          depth: 14,
        });
        expect(request.searchPolicy.teacher.independent_rescore.depth).toBe(16);
        await fs.promises.writeFile(request.datasetPath, "{}\n", { mode: 0o600 });
        return {
          status: "complete-fresh-selection-only",
          generation_run_fingerprint: sha256("generation"),
          completed_parents: 4_800,
          forced_parents_skipped: 0,
          forced_skip_reasons: { fewer_than_two_legal_moves: 0 },
          emitted_parent_groups: 4_800,
          dataset_records: 9_600,
        };
      }),
    };

    const receipt = await runFreshSelectionTeacherCore(wrapped);
    expect(receipt).toEqual({
      schema: FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      idempotent_existing_result: false,
      completed_parents: 4_800,
      emitted_parent_groups: 4_800,
      dataset_records: 9_600,
      parallel_engines: 12,
      live_weight_changes: 0,
    });
    expect(events).toEqual([
      "checkpoint-preflight",
      "source-read",
      "generate",
      "checkpoint-preflight",
      "source-read",
    ]);

    const paths = freshSelectionTeacherPaths(home, wrapped.repositoryRoot);
    const authority = JSON.parse(
      await fs.promises.readFile(paths.authority, "utf8"),
    ) as Record<string, unknown>;
    const manifest = JSON.parse(
      await fs.promises.readFile(paths.manifest, "utf8"),
    ) as Record<string, unknown>;
    const result = JSON.parse(
      await fs.promises.readFile(paths.result, "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(authority).sort()).toEqual(
      [
        "schema",
        "status",
        "role",
        "source",
        "training_plan",
        "selection_preflight_registry",
        "checkpoint_preflight_sha256",
        "artifacts",
        "completion",
        "run_fingerprint",
        "boundary",
      ].sort(),
    );
    expect(Object.keys(manifest).sort()).toEqual(
      [
        "schema",
        "status",
        "role",
        "source",
        "dataset",
        "completion",
        "run_fingerprint",
        "boundary",
      ].sort(),
    );
    expect(Object.keys(result).sort()).toEqual(
      [
        "schema",
        "status",
        "role",
        "manifest",
        "dataset",
        "completion",
        "run_fingerprint",
        "postflight_complete",
        "boundary",
      ].sort(),
    );
    expect(authority.schema).toBe(FRESH_SELECTION_TEACHER_AUTHORITY_SCHEMA);
    expect(manifest.schema).toBe(FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA);
    expect(result.schema).toBe(FRESH_SELECTION_TEACHER_RESULT_SCHEMA);
    expect((result.dataset as Record<string, unknown>).schema).toBe(
      FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
    );
    expect((result.completion as Record<string, unknown>).forced_skip_reasons).toEqual({
      fewer_than_two_legal_moves: 0,
    });
    expect(result.postflight_complete).toBe(true);
    for (const file of [
      paths.authority,
      paths.manifest,
      paths.result,
      paths.dataset,
    ]) {
      expect((await fs.promises.lstat(file)).mode & 0o7777).toBe(0o600);
    }
  });

  it("does not open the selection source when checkpoint strict-load is blocked", async () => {
    const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fresh-selection-blocked-"));
    const readSource = vi.fn(async () => source());
    const generate = vi.fn();
    const base = await dependencies(home, {
      checkpointPreflight: vi.fn(async () => {
        throw new Error("seed 44 final.pt is absent");
      }),
      readSource,
      generate,
    });
    await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/seed 44/);
    expect(readSource).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps search depth in tracked policy data and bounds local parallelism", () => {
    const changed = policy();
    changed.teacher.proposal.depth = 15;
    changed.teacher.typed_incomplete_proposal_fallback.depth = 15;
    changed.teacher.independent_rescore.depth = 17;
    expect(validateFreshSelectionTeacherSearchPolicy(changed, 14)).toBe(changed);
    expect(() =>
      validateFreshSelectionTeacherSearchPolicy(
        policy({ parallel_engines: 15 }),
        14,
      ),
    ).toThrow(/exceeds this Mac/);
    expect(() =>
      validateFreshSelectionTeacherSearchPolicy(
        policy({ hash_mb_per_engine: 64 }),
        14,
      ),
    ).toThrow(/invalid/);
    const mixedRanks = policy();
    mixedRanks.teacher.typed_incomplete_proposal_fallback.mixed_partial_and_fallback_ranks_accepted =
      true;
    expect(() =>
      validateFreshSelectionTeacherSearchPolicy(mixedRanks, 14),
    ).toThrow(/invalid/);
  });

  it("CLI rejects path overrides and emits no private path or label", async () => {
    const run = vi.fn(async () => ({
      schema: FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      idempotent_existing_result: false,
      completed_parents: 4_800 as const,
      emitted_parent_groups: 4_800,
      dataset_records: 9_600,
      parallel_engines: 12,
      live_weight_changes: 0 as const,
    }));
    await expect(
      runFreshSelectionTeacherCliCore(["--root", "/tmp/other"], {
        run,
        writeStdout: vi.fn(),
      }),
    ).rejects.toThrow(/no arguments/);
    expect(run).not.toHaveBeenCalled();

    const writeStdout = vi.fn();
    await runFreshSelectionTeacherCliCore([], { run, writeStdout });
    const output = JSON.parse(writeStdout.mock.calls[0][0]) as Record<string, unknown>;
    expect(output).toMatchObject({
      completed_parents: 4_800,
      parallel_engines: 12,
      private_paths_emitted: false,
      labels_emitted: false,
      live_weight_changes: 0,
    });
    expect(JSON.stringify(output)).not.toContain(".codex");
  });
});
