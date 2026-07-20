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
  FRESH_SELECTION_FORMAL_V9_OUTPUT_DIRECTORY,
  acquireFreshSelectionFormalTeacherExclusionCoreForTests,
  assertFreshSelectionTeacherGeneratorOutputPathsCoreForTests,
  freshSelectionFormalTeacherOutputRoots,
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
  parseAuthenticatedFloodgateFreshFinalRows,
  parseAuthenticatedFloodgateFreshSelectionRows,
  parseAuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from "../../../ml/floodgate-training-row-validation";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import {
  buildSiblingGroup,
  positionKeyFromSfen,
} from "../../../ml/sibling-data";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";

const REVISION = "1".repeat(40);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeValidatorOwnedWorkHandoff(file: string) {
  const bytes = `${[
    JSON.stringify({
      schema: "shogi-sibling-teacher-work-v2",
      kind: "header",
      test_scope: "runner-handoff-semantic-validation-is-injected",
    }),
    ...Array.from({ length: 4_800 }, (_, index) =>
      JSON.stringify({
        schema: "shogi-sibling-teacher-work-v2",
        kind: "runner-handoff",
        sequence: index,
      }),
    ),
  ].join("\n")}\n`;
  await fs.promises.writeFile(file, bytes, { mode: 0o600 });
  return {
    path: "work.jsonl" as const,
    bytes: Buffer.byteLength(bytes),
    sha256: sha256(bytes),
    schema: "shogi-sibling-teacher-work-v2" as const,
    records: 4_801 as const,
  };
}

function parentAccounting(parentIdsSha256: string) {
  return {
    parent_ids_sha256: parentIdsSha256,
    forced_parent_ids_sha256: sha256(""),
    emitted_parent_ids_sha256: parentIdsSha256,
    fewer_than_two_legal_moves_parent_ids_sha256: sha256(""),
    search_timeout_parent_ids_sha256: sha256(""),
  };
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
    role: "fresh_selection_and_fresh_final",
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
      parallel_engines: 13,
      threads_per_engine: 1,
      hash_mb_per_engine: 512,
      timeout_ms_per_search: 600_000,
      network: false,
      ...overrides,
    },
    completion: {
      input_parents: 4_800,
      input_games: 200,
      search_timeout_no_label: {
        disposition: "forced-parent-skip-no-label",
        skip_limit_divisor: 1_000,
        maximum_skips: 5,
        partial_parent_labels_accepted: false,
      },
      proposal_fallback_timeout: "fatal-no-publication",
      proposal_incomplete_without_exact_fallback: "fatal-no-publication",
      allowed_forced_skip_reasons: [
        "fewer_than_two_legal_moves",
        "search-timeout-no-label",
      ],
      partial_publication: false,
    },
  };
}

function source(): FreshSelectionTeacherSourceSnapshot {
  const parentSfen =
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
  const row: FloodgateTrainingParent = Object.freeze({
    schema_version: 1,
    game_id: `sha256:${"2".repeat(64)}`,
    parent_id: `sha256:${"3".repeat(64)}`,
    position_id: positionKeyFromSfen(parentSfen),
    parent_sfen: parentSfen,
    ply: 0,
    played_move: "7g7f",
  });
  return {
    bytes: new Uint8Array(),
    rows: Object.freeze(Array.from({ length: 4_800 }, () => row)),
    identity: FRESH_SELECTION_TEACHER_SOURCE,
  };
}

let cachedDatasetBytes: Buffer | undefined;
function validRunnerDatasetBytes(): Buffer {
  if (cachedDatasetBytes !== undefined) return cachedDatasetBytes;
  const row = source().rows[0];
  const records = buildSiblingGroup(
    {
      game_id: row.game_id,
      parent_id: row.parent_id,
      position_id: row.position_id,
      parent_sfen: row.parent_sfen,
      parent_ply: row.ply,
    },
    [
      {
        move: "7g7f",
        child_sfen: childSfenAfterUsi(row.parent_sfen, "7g7f"),
        sources: ["played", "teacher"],
        teacher_parent_cp: 100,
        teacher_rank: 1,
      },
      {
        move: "2g2f",
        child_sfen: childSfenAfterUsi(row.parent_sfen, "2g2f"),
        sources: ["teacher"],
        teacher_parent_cp: 50,
        teacher_rank: 2,
      },
    ],
  );
  const group = `${records.map(canonicalJson).join("\n")}\n`;
  cachedDatasetBytes = Buffer.from(group.repeat(4_800), "utf8");
  return cachedDatasetBytes;
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
    acquireFormalTeacherExclusion: vi.fn(async () => async () => undefined),
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
      await fs.promises.writeFile(request.datasetPath, validRunnerDatasetBytes(), {
        mode: 0o600,
      });
      await fs.promises.chmod(request.datasetPath, 0o600);
      const work = await writeValidatorOwnedWorkHandoff(request.workPath);
      return {
        status: "complete-fresh-selection-only",
        generation_run_fingerprint: sha256("generation"),
        completed_parents: 4_800,
        forced_parents_skipped: 0,
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 0,
        },
        work,
        parent_accounting: parentAccounting(
          FRESH_SELECTION_TEACHER_SOURCE.parent_ids_sha256,
        ),
        emitted_parent_groups: 4_800,
        dataset_records: 9_600,
      };
    }),
    computeGenerationFingerprint: vi.fn(async () => sha256("generation")),
    validateArtifacts: vi.fn(),
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
    const finalIdentity = {
      ...identity,
      path: "fresh-final-holdout.raw.jsonl" as const,
    };
    expect(parseAuthenticatedFloodgateFreshFinalRows(bytes, finalIdentity)).toHaveLength(1);
    expect(() =>
      parseAuthenticatedFloodgateTrainingRows(bytes, identity),
    ).toThrow(/path or format is not fixed/);
    expect(() =>
      parseAuthenticatedFloodgateFreshFinalRows(bytes, identity),
    ).toThrow(/path or format is not fixed/);
    expect(() =>
      parseAuthenticatedFloodgateFreshSelectionRows(bytes, finalIdentity),
    ).toThrow(/path or format is not fixed/);
    expect(() =>
      parseAuthenticatedFloodgateFreshSelectionRows(
        Buffer.from("tampered\n"),
        identity,
      ),
    ).toThrow(/authenticated raw bytes do not match its identity/);
    try {
      parseAuthenticatedFloodgateFreshSelectionRows(
        Buffer.from("tampered\n"),
        identity,
      );
    } catch (error) {
      expect((error as Error).message).not.toContain("training raw");
    }
  });

  it("strict-loads first, generates all 4,800 parents, revalidates, and commits exact documents", async () => {
    const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fresh-selection-runner-"));
    const events: string[] = [];
    let exclusionHeld = false;
    const base = await dependencies(home);
    const wrapped: FreshSelectionTeacherRunnerDependencies = {
      ...base,
      acquireFormalTeacherExclusion: vi.fn(async () => {
        expect(exclusionHeld).toBe(false);
        exclusionHeld = true;
        events.push("formal-exclusion-acquired");
        return async () => {
          expect(exclusionHeld).toBe(true);
          exclusionHeld = false;
          events.push("formal-exclusion-released");
        };
      }),
      checkpointPreflight: vi.fn(async () => {
        expect(exclusionHeld).toBe(true);
        events.push("checkpoint-preflight");
        return preflight();
      }),
      readSource: vi.fn(async () => {
        expect(exclusionHeld).toBe(true);
        events.push("source-read");
        return source();
      }),
      generate: vi.fn(async (request) => {
        expect(exclusionHeld).toBe(true);
        events.push("generate");
        expect(request.rows).toHaveLength(4_800);
        expect(request.searchPolicy.teacher.proposal).toEqual({
          multipv: 6,
          depth: 14,
        });
        expect(request.searchPolicy.teacher.independent_rescore.depth).toBe(16);
        await fs.promises.writeFile(
          request.datasetPath,
          validRunnerDatasetBytes(),
          { mode: 0o600 },
        );
        const work = await writeValidatorOwnedWorkHandoff(request.workPath);
        return {
          status: "complete-fresh-selection-only",
          generation_run_fingerprint: sha256("generation"),
          completed_parents: 4_800,
          forced_parents_skipped: 0,
          forced_skip_reasons: {
            fewer_than_two_legal_moves: 0,
            search_timeout_no_label: 0,
          },
          work,
          parent_accounting: parentAccounting(
            FRESH_SELECTION_TEACHER_SOURCE.parent_ids_sha256,
          ),
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
      parallel_engines: 13,
      live_weight_changes: 0,
    });
    expect(events).toEqual([
      "formal-exclusion-acquired",
      "checkpoint-preflight",
      "source-read",
      "generate",
      "checkpoint-preflight",
      "source-read",
      "formal-exclusion-released",
    ]);
    expect(exclusionHeld).toBe(false);

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
        "generation_run_fingerprint",
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
        "work",
        "completion",
        "generation_run_fingerprint",
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
        "work",
        "completion",
        "generation_run_fingerprint",
        "run_fingerprint",
        "postflight_complete",
        "boundary",
      ].sort(),
    );
    expect(authority.schema).toBe(FRESH_SELECTION_TEACHER_AUTHORITY_SCHEMA);
    expect(manifest.schema).toBe(FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA);
    expect(result.schema).toBe(FRESH_SELECTION_TEACHER_RESULT_SCHEMA);
    expect(authority.generation_run_fingerprint).toBe(sha256("generation"));
    expect(manifest.generation_run_fingerprint).toBe(sha256("generation"));
    expect(result.generation_run_fingerprint).toBe(sha256("generation"));
    expect((result.dataset as Record<string, unknown>).schema).toBe(
      FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
    );
    expect((result.completion as Record<string, unknown>).forced_skip_reasons).toEqual({
      fewer_than_two_legal_moves: 0,
      search_timeout_no_label: 0,
    });
    expect(result.postflight_complete).toBe(true);
    for (const file of [
      paths.authority,
      paths.manifest,
      paths.result,
      paths.dataset,
      paths.work,
    ]) {
      expect((await fs.promises.lstat(file)).mode & 0o7777).toBe(0o600);
    }
    expect(wrapped.validateArtifacts).toHaveBeenCalledTimes(1);
    expect(wrapped.validateArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        inputGames: 200,
        inputParents: 4_800,
        sourceRawSha256: FRESH_SELECTION_TEACHER_SOURCE.sha256,
        expectedGenerationRunFingerprint: sha256("generation"),
        expectedRevision: REVISION,
      }),
    );

    const reused = await runFreshSelectionTeacherCore(wrapped);
    expect(reused).toMatchObject({
      idempotent_existing_result: true,
      parallel_engines: 12,
    });
    expect(wrapped.generate).toHaveBeenCalledTimes(1);
    expect(wrapped.validateArtifacts).toHaveBeenCalledTimes(2);
    expect(wrapped.computeGenerationFingerprint).toHaveBeenCalledTimes(4);
  });

  it("fails closed when a result exists but any bound auxiliary artifact is missing", async () => {
    const home = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "fresh-selection-partial-commit-"),
    );
    const base = await dependencies(home);
    await runFreshSelectionTeacherCore(base);
    const paths = freshSelectionTeacherPaths(home, base.repositoryRoot);
    for (const file of [paths.manifest, paths.authority, paths.dataset, paths.work]) {
      const bytes = await fs.promises.readFile(file);
      await fs.promises.unlink(file);
      await expect(runFreshSelectionTeacherCore(base), path.basename(file)).rejects.toThrow();
      expect(base.generate).toHaveBeenCalledTimes(1);
      await fs.promises.writeFile(file, bytes, { mode: 0o600 });
    }
  });

  it("resumes generation when and only when the result marker is absent", async () => {
    const home = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "fresh-selection-resume-"),
    );
    const base = await dependencies(home);
    await runFreshSelectionTeacherCore(base);
    const paths = freshSelectionTeacherPaths(home, base.repositoryRoot);
    await fs.promises.unlink(paths.result);

    const resumed = await runFreshSelectionTeacherCore(base);
    expect(resumed.idempotent_existing_result).toBe(false);
    expect(base.generate).toHaveBeenCalledTimes(2);
    await expect(fs.promises.access(paths.result)).resolves.toBeUndefined();
  });

  it("rejects tampered result, manifest, authority, dataset, and work bindings", async () => {
    const home = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "fresh-selection-binding-tamper-"),
    );
    const base = await dependencies(home);
    await runFreshSelectionTeacherCore(base);
    const paths = freshSelectionTeacherPaths(home, base.repositoryRoot);
    const files = [
      paths.result,
      paths.manifest,
      paths.authority,
      paths.dataset,
      paths.work,
    ] as const;
    const originals = new Map(
      await Promise.all(
        files.map(async (file) => [file, await fs.promises.readFile(file)] as const),
      ),
    );
    const cases = [
      {
        file: paths.result,
        mutate: async () => {
          const value = JSON.parse(await fs.promises.readFile(paths.result, "utf8")) as Record<
            string,
            unknown
          >;
          value.unknown = true;
          await fs.promises.writeFile(paths.result, `${JSON.stringify(value, null, 2)}\n`, {
            mode: 0o600,
          });
        },
      },
      {
        file: paths.manifest,
        mutate: async () => {
          const value = JSON.parse(
            await fs.promises.readFile(paths.manifest, "utf8"),
          ) as Record<string, unknown>;
          value.role = "fresh_final_holdout";
          await fs.promises.writeFile(paths.manifest, `${JSON.stringify(value, null, 2)}\n`, {
            mode: 0o600,
          });
        },
      },
      {
        file: paths.authority,
        mutate: async () => {
          const value = JSON.parse(
            await fs.promises.readFile(paths.authority, "utf8"),
          ) as Record<string, unknown>;
          (value.artifacts as Record<string, unknown>).unknown = true;
          await fs.promises.writeFile(paths.authority, `${JSON.stringify(value, null, 2)}\n`, {
            mode: 0o600,
          });
        },
      },
      {
        file: paths.dataset,
        mutate: async () => fs.promises.appendFile(paths.dataset, "tampered\n"),
      },
      {
        file: paths.work,
        mutate: async () => fs.promises.appendFile(paths.work, "tampered\n"),
      },
    ] as const;
    for (const testCase of cases) {
      await testCase.mutate();
      await expect(runFreshSelectionTeacherCore(base), path.basename(testCase.file)).rejects.toThrow(
        /fresh-selection/,
      );
      expect(base.generate).toHaveBeenCalledTimes(1);
      await fs.promises.writeFile(testCase.file, originals.get(testCase.file)!, {
        mode: 0o600,
      });
    }
  });

  it("recomputes revision, preflight, policy, assets, and generation evidence", async () => {
    const home = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "fresh-selection-stale-evidence-"),
    );
    const base = await dependencies(home);
    await runFreshSelectionTeacherCore(base);
    const originalPreflight = preflight();
    const originalPolicy = {
      value: policy(),
      identity: artifact(
        FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
        FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
      ),
    };

    vi.mocked(base.captureExactCleanRevision).mockResolvedValue("2".repeat(40));
    await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/fresh-selection/);
    vi.mocked(base.captureExactCleanRevision).mockResolvedValue(REVISION);

    vi.mocked(base.checkpointPreflight).mockResolvedValue({
      ...originalPreflight,
      checkpoint_preflight_sha256: sha256("changed-preflight"),
    });
    await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/fresh-selection/);
    vi.mocked(base.checkpointPreflight).mockResolvedValue(originalPreflight);

    vi.mocked(base.readSearchPolicy).mockResolvedValue({
      ...originalPolicy,
      identity: { ...originalPolicy.identity, sha256: sha256("changed-policy") },
    });
    await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/fresh-selection/);
    vi.mocked(base.readSearchPolicy).mockResolvedValue(originalPolicy);

    vi.mocked(base.verifyAssets).mockResolvedValue({ fixed: "changed-assets" } as never);
    await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/fresh-selection/);
    vi.mocked(base.verifyAssets).mockResolvedValue({ fixed: "asset-receipt" } as never);

    vi.mocked(base.computeGenerationFingerprint).mockResolvedValue(
      sha256("changed-generation"),
    );
    await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/fresh-selection/);
    expect(base.generate).toHaveBeenCalledTimes(1);
  });

  it("publishes no result when generation fingerprints mismatch or drift postflight", async () => {
    for (const drift of ["generator", "postflight"] as const) {
      const home = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), `fresh-selection-${drift}-fingerprint-`),
      );
      const base = await dependencies(home);
      if (drift === "generator") {
        vi.mocked(base.computeGenerationFingerprint).mockResolvedValue(sha256("different"));
      } else {
        vi.mocked(base.computeGenerationFingerprint)
          .mockResolvedValueOnce(sha256("generation"))
          .mockResolvedValueOnce(sha256("postflight-drift"));
      }
      await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/fingerprint/);
      const paths = freshSelectionTeacherPaths(home, base.repositoryRoot);
      await expect(fs.promises.access(paths.result)).rejects.toThrow();
    }
  });

  it("does not open the selection source when checkpoint strict-load is blocked", async () => {
    const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fresh-selection-blocked-"));
    const readSource = vi.fn(async () => source());
    const generate = vi.fn();
    let exclusionHeld = false;
    const releaseFormalTeacherExclusion = vi.fn(async () => {
      expect(exclusionHeld).toBe(true);
      exclusionHeld = false;
    });
    const base = await dependencies(home, {
      acquireFormalTeacherExclusion: vi.fn(async () => {
        exclusionHeld = true;
        return releaseFormalTeacherExclusion;
      }),
      checkpointPreflight: vi.fn(async () => {
        expect(exclusionHeld).toBe(true);
        throw new Error("seed 44 final.pt is absent");
      }),
      readSource,
      generate,
    });
    await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(/seed 44/);
    expect(releaseFormalTeacherExclusion).toHaveBeenCalledOnce();
    expect(exclusionHeld).toBe(false);
    expect(readSource).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the exact formal v8 and v9 roots for whole-run exclusion", () => {
    const roots = freshSelectionFormalTeacherOutputRoots(
      "/Users/tester",
      "/repository",
    );
    expect(roots).toEqual([
      "/Users/tester/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8",
      `/Users/tester/.codex/shogi-runs/${FRESH_SELECTION_FORMAL_V9_OUTPUT_DIRECTORY}`,
    ]);
    expect(FRESH_SELECTION_FORMAL_V9_OUTPUT_DIRECTORY).toBe(
      "floodgate-q1-2026-strength-first-v9",
    );
  });

  it("acquires formal v8 then v9 and releases them in reverse order", async () => {
    const events: string[] = [];
    const prepareDirectory = vi.fn(async (outputRoot: string, uid: number) => {
      events.push(`prepare:${path.basename(outputRoot)}:${uid}`);
    });
    const acquireLock = vi.fn(async (outputRoot: string, uid: number) => {
      const name = path.basename(outputRoot);
      events.push(`acquire:${name}:${uid}`);
      return async () => {
        events.push(`release:${name}:${uid}`);
      };
    });
    const release = await acquireFreshSelectionFormalTeacherExclusionCoreForTests(
      "/Users/tester",
      "/repository",
      501,
      { prepareDirectory, acquireLock },
    );
    expect(events).toEqual([
      "prepare:floodgate-q1-2026-strength-first-v8:501",
      "acquire:floodgate-q1-2026-strength-first-v8:501",
      "prepare:floodgate-q1-2026-strength-first-v9:501",
      "acquire:floodgate-q1-2026-strength-first-v9:501",
    ]);
    await release();
    expect(events.slice(-2)).toEqual([
      "release:floodgate-q1-2026-strength-first-v9:501",
      "release:floodgate-q1-2026-strength-first-v8:501",
    ]);
    await expect(release()).rejects.toThrow(/already released/);
  });

  it("releases v8 when acquiring the formal v9 exclusion fails", async () => {
    const events: string[] = [];
    await expect(
      acquireFreshSelectionFormalTeacherExclusionCoreForTests(
        "/Users/tester",
        "/repository",
        501,
        {
          prepareDirectory: vi.fn(async (outputRoot: string) => {
            events.push(`prepare:${path.basename(outputRoot)}`);
          }),
          acquireLock: vi.fn(async (outputRoot: string) => {
            const name = path.basename(outputRoot);
            events.push(`acquire:${name}`);
            if (name === FRESH_SELECTION_FORMAL_V9_OUTPUT_DIRECTORY) {
              throw new Error("formal-v9-teacher-active");
            }
            return async () => {
              events.push(`release:${name}`);
            };
          }),
        },
      ),
    ).rejects.toThrow(/formal-v9-teacher-active/);
    expect(events).toEqual([
      "prepare:floodgate-q1-2026-strength-first-v8",
      "acquire:floodgate-q1-2026-strength-first-v8",
      "prepare:floodgate-q1-2026-strength-first-v9",
      "acquire:floodgate-q1-2026-strength-first-v9",
      "release:floodgate-q1-2026-strength-first-v8",
    ]);
  });

  it("binds the generator dataset to the fixed selection.jsonl stage path", () => {
    assertFreshSelectionTeacherGeneratorOutputPathsCoreForTests(
      "/private/stage",
      "/private/stage/selection.jsonl",
      "/private/stage/work.jsonl",
    );
    expect(() =>
      assertFreshSelectionTeacherGeneratorOutputPathsCoreForTests(
        "/private/stage",
        "/private/stage/dataset.jsonl",
        "/private/stage/work.jsonl",
      ),
    ).toThrow(/output paths drifted/);
  });

  it.each(["v8", "v9"])(
    "an active formal %s run blocks before checkpoint, source, or engine work",
    async (formalGeneration) => {
      const home = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), `fresh-selection-${formalGeneration}-active-`),
      );
      const checkpointPreflight = vi.fn(async () => preflight());
      const readSource = vi.fn(async () => source());
      const generate = vi.fn();
      const base = await dependencies(home, {
        acquireFormalTeacherExclusion: vi.fn(async () => {
          throw new Error(`formal-${formalGeneration}-teacher-active`);
        }),
        checkpointPreflight,
        readSource,
        generate,
      });
      await expect(runFreshSelectionTeacherCore(base)).rejects.toThrow(
        `formal-${formalGeneration}-teacher-active`,
      );
      expect(checkpointPreflight).not.toHaveBeenCalled();
      expect(readSource).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    },
  );

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
    const topLevelExtra = { ...policy(), unknown: true };
    expect(() =>
      validateFreshSelectionTeacherSearchPolicy(topLevelExtra, 14),
    ).toThrow(/fields are not exact/);
    const nestedExtra = policy() as FreshSelectionTeacherSearchPolicy & {
      teacher: FreshSelectionTeacherSearchPolicy["teacher"] & {
        unknown?: boolean;
      };
    };
    nestedExtra.teacher.unknown = true;
    expect(() =>
      validateFreshSelectionTeacherSearchPolicy(nestedExtra, 14),
    ).toThrow(/fields are not exact/);
  });

  it("CLI rejects path overrides and emits no private path or label", async () => {
    const run = vi.fn(async () => ({
      schema: FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      idempotent_existing_result: false,
      completed_parents: 4_800 as const,
      emitted_parent_groups: 4_800,
      dataset_records: 9_600,
      parallel_engines: 13,
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
      parallel_engines: 13,
      private_paths_emitted: false,
      labels_emitted: false,
      live_weight_changes: 0,
    });
    expect(JSON.stringify(output)).not.toContain(".codex");
  });
});
