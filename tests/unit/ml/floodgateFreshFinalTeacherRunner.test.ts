import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  FRESH_FINAL_TEACHER_AUTHORITY_SCHEMA,
  FRESH_FINAL_TEACHER_DATASET_SCHEMA,
  FRESH_FINAL_TEACHER_MANIFEST_SCHEMA,
  FRESH_FINAL_TEACHER_PREFLIGHT_CLI_SCHEMA,
  FRESH_FINAL_TEACHER_RESULT_SCHEMA,
  FRESH_FINAL_TEACHER_RUNNER_SCHEMA,
  FRESH_FINAL_TEACHER_SELECTION_PREFLIGHT_SCHEMA,
  FRESH_FINAL_TEACHER_SOURCE,
  FRESH_FINAL_TEACHER_STATUS,
  FreshFinalTeacherBlocked,
  assertFreshFinalTeacherGeneratorOutputPathsCoreForTests,
  freshFinalTeacherPaths,
  freshFinalPrivateArtifactRelativePathCoreForTests,
  runFreshFinalTeacherCore,
  subprocessJsonCoreForTests,
  validateFreshFinalDatasetBytesCoreForTests,
  validateFreshFinalTeacherSelectionPreflight,
  type FreshFinalTeacherBlockedReceipt,
  type FreshFinalTeacherRunnerDependencies,
  type FreshFinalTeacherSelectionPreflight,
  type FreshFinalTeacherSourceSnapshot,
} from "../../../ml/floodgate-fresh-final-teacher-runner";
import {
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
  type FreshSelectionTeacherArtifactIdentity,
  type FreshSelectionTeacherSearchPolicy,
} from "../../../ml/floodgate-fresh-selection-teacher-runner";
import { runFreshFinalTeacherCliCore } from "../../../ml/run-floodgate-fresh-final-teacher";
import type { FloodgateTrainingParent } from "../../../ml/floodgate-training-row-validation";
import {
  buildSiblingGroup,
  positionKeyFromSfen,
} from "../../../ml/sibling-data";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";

const REVISION = "1".repeat(40);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifact(
  pathname: string,
  schema: string,
): FreshSelectionTeacherArtifactIdentity {
  return {
    path: pathname,
    bytes: 123,
    sha256: sha256(pathname),
    schema,
  };
}

function preflight(): FreshFinalTeacherSelectionPreflight {
  return {
    schema: FRESH_FINAL_TEACHER_SELECTION_PREFLIGHT_SCHEMA,
    status: "selected-candidate-receipt-recomputed",
    selection_evaluator_registry: artifact(
      "ml/protocols/floodgate-q1-2026-strength-first-qat-selection-evaluator-registry.json",
      "shogi-floodgate-strength-first-selection-evaluator-registry-v1",
    ),
    selection_evaluation_report: artifact(
      ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1/selection-evaluation-report.json",
      "shogi-floodgate-strength-first-selection-evaluation-report-v1",
    ),
    selection_receipt: artifact(
      ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1/selection-receipt.json",
      "shogi-floodgate-strength-first-three-seed-candidate-selection-receipt-v1",
    ),
    selection_publication_result: artifact(
      ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1/selection-publication-result.json",
      "shogi-floodgate-strength-first-selection-publication-result-v1",
    ),
    selected_seed: 43,
    selected_checkpoint: artifact(
      "ml/runs/floodgate-q1-2026-strength-first-int16-aware/seed-43/final.pt",
      "shogi-floodgate-strength-first-qat-final-checkpoint-v2",
    ),
    selection_evaluation_report_reads: 1,
    selection_receipt_reads: 1,
    selection_publication_result_reads: 1,
    selection_dataset_reads: 1,
    selection_checkpoint_evaluations: 4,
    fresh_final_source_opened: false,
    fresh_final_label_reads: 0,
    teacher_engines_started: 0,
    network_requests: 0,
    cloud_requests: 0,
    live_weight_writes: 0,
  };
}

function blockedReceipt(): FreshFinalTeacherBlockedReceipt {
  return {
    schema: FRESH_FINAL_TEACHER_PREFLIGHT_CLI_SCHEMA,
    status: "STOP",
    reason: "selected-candidate-receipt-not-ready",
    selection_evaluator_registry_reads: 1,
    selection_receipt_reads: 0,
    selection_dataset_reads: 0,
    fresh_final_source_reads: 0,
    fresh_final_label_reads: 0,
    teacher_engines_started: 0,
    network_requests: 0,
    cloud_requests: 0,
    live_weight_writes: 0,
  };
}

function policy(): FreshSelectionTeacherSearchPolicy {
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

const PARENT_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const PARENT_POSITION_ID = positionKeyFromSfen(PARENT_SFEN);
const SOURCE_ROWS = Object.freeze(
  Array.from({ length: 4_800 }, (_, index): FloodgateTrainingParent =>
    Object.freeze({
      schema_version: 1,
      game_id: `sha256:${sha256(`game-${Math.floor(index / 24)}`)}`,
      parent_id: `sha256:${sha256(`parent-${index}`)}`,
      position_id: PARENT_POSITION_ID,
      parent_sfen: PARENT_SFEN,
      ply: 0,
      played_move: "7g7f",
    }),
  ),
);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

let cachedDatasetBytes: Buffer | undefined;
function validDatasetBytes(): Buffer {
  cachedDatasetBytes ??= Buffer.from(
    `${SOURCE_ROWS.flatMap((row) =>
      buildSiblingGroup(
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
      ),
    )
      .map(canonicalJson)
      .join("\n")}\n`,
    "utf8",
  );
  return cachedDatasetBytes;
}

function source(): FreshFinalTeacherSourceSnapshot {
  return {
    bytes: new Uint8Array(),
    rows: SOURCE_ROWS,
    identity: FRESH_FINAL_TEACHER_SOURCE,
  };
}

async function dependencies(
  home: string,
  overrides: Partial<FreshFinalTeacherRunnerDependencies> = {},
): Promise<FreshFinalTeacherRunnerDependencies> {
  const repositoryRoot = path.join(home, "repository");
  await fs.promises.mkdir(repositoryRoot);
  return {
    homeDirectory: () => home,
    repositoryRoot,
    effectiveUserId: process.geteuid?.() ?? 0,
    availableParallelism: 14,
    captureExactCleanRevision: vi.fn(async () => REVISION),
    selectionPreflight: vi.fn(async () => preflight()),
    acquireFormalTeacherExclusion: vi.fn(async () => async () => undefined),
    verifyAssets: vi.fn(async () => ({ fixed: "asset-receipt" }) as never),
    readSearchPolicy: vi.fn(async () => ({
      value: policy(),
      identity: artifact(
        FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
        FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
      ),
    })),
    readSource: vi.fn(async () => source()),
    generate: vi.fn(async (request) => {
      await fs.promises.writeFile(request.datasetPath, validDatasetBytes(), {
        mode: 0o600,
      });
      await fs.promises.chmod(request.datasetPath, 0o600);
      return {
        status: "complete-fresh-final-only",
        generation_run_fingerprint: sha256("fresh-final-generation"),
        completed_parents: 4_800,
        forced_parents_skipped: 0,
        forced_skip_reasons: { fewer_than_two_legal_moves: 0 },
        emitted_parent_groups: 4_800,
        dataset_records: 9_600,
      };
    }),
    computeGenerationFingerprint: vi.fn(async () =>
      sha256("fresh-final-generation"),
    ),
    reportProgress: vi.fn(),
    ...overrides,
  };
}

describe("fresh-final teacher runner", () => {
  it("stops before output, locks, assets, source, and generation when no selected receipt exists", async () => {
    const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fresh-final-stop-"));
    const acquire = vi.fn();
    const assets = vi.fn();
    const readPolicy = vi.fn();
    const readSource = vi.fn();
    const generate = vi.fn();
    const base = await dependencies(home, {
      selectionPreflight: vi.fn(async () => {
        throw new FreshFinalTeacherBlocked(blockedReceipt());
      }),
      acquireFormalTeacherExclusion: acquire,
      verifyAssets: assets,
      readSearchPolicy: readPolicy,
      readSource,
      generate,
    });

    await expect(runFreshFinalTeacherCore(base)).rejects.toBeInstanceOf(
      FreshFinalTeacherBlocked,
    );
    expect(acquire).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
    expect(readPolicy).not.toHaveBeenCalled();
    expect(readSource).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    const paths = freshFinalTeacherPaths(home, base.repositoryRoot);
    await expect(fs.promises.access(paths.outputRoot)).rejects.toThrow();
  });

  it("generates exact final.jsonl only after receipt validation and seals postflight evidence", async () => {
    const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fresh-final-runner-"));
    const events: string[] = [];
    let exclusionHeld = false;
    const base = await dependencies(home);
    const wrapped: FreshFinalTeacherRunnerDependencies = {
      ...base,
      selectionPreflight: vi.fn(async () => {
        events.push("selection-preflight");
        return preflight();
      }),
      acquireFormalTeacherExclusion: vi.fn(async () => {
        exclusionHeld = true;
        events.push("formal-exclusion-acquired");
        return async () => {
          exclusionHeld = false;
          events.push("formal-exclusion-released");
        };
      }),
      readSource: vi.fn(async () => {
        expect(exclusionHeld).toBe(true);
        events.push("fresh-final-source-read");
        return source();
      }),
      generate: vi.fn(async (request) => {
        expect(exclusionHeld).toBe(true);
        events.push("generate");
        expect(request.rows).toHaveLength(4_800);
        expect(request.selectionPreflight.selected_seed).toBe(43);
        expect(request.datasetPath).toBe(
          path.join(request.outputRoot, "final.jsonl"),
        );
        await fs.promises.writeFile(
          request.datasetPath,
          validDatasetBytes(),
          { mode: 0o600 },
        );
        return {
          status: "complete-fresh-final-only",
          generation_run_fingerprint: sha256("fresh-final-generation"),
          completed_parents: 4_800,
          forced_parents_skipped: 0,
          forced_skip_reasons: { fewer_than_two_legal_moves: 0 },
          emitted_parent_groups: 4_800,
          dataset_records: 9_600,
        };
      }),
    };

    const receipt = await runFreshFinalTeacherCore(wrapped);
    expect(receipt).toEqual({
      schema: FRESH_FINAL_TEACHER_RUNNER_SCHEMA,
      status: FRESH_FINAL_TEACHER_STATUS,
      idempotent_existing_result: false,
      selected_seed: 43,
      completed_parents: 4_800,
      emitted_parent_groups: 4_800,
      dataset_records: 9_600,
      parallel_engines: 12,
      live_weight_changes: 0,
    });
    expect(events).toEqual([
      "selection-preflight",
      "formal-exclusion-acquired",
      "fresh-final-source-read",
      "generate",
      "selection-preflight",
      "fresh-final-source-read",
      "formal-exclusion-released",
    ]);

    const paths = freshFinalTeacherPaths(home, wrapped.repositoryRoot);
    const authority = JSON.parse(
      await fs.promises.readFile(paths.authority, "utf8"),
    ) as Record<string, unknown>;
    const manifest = JSON.parse(
      await fs.promises.readFile(paths.manifest, "utf8"),
    ) as Record<string, unknown>;
    const result = JSON.parse(
      await fs.promises.readFile(paths.result, "utf8"),
    ) as Record<string, unknown>;
    expect(authority.schema).toBe(FRESH_FINAL_TEACHER_AUTHORITY_SCHEMA);
    expect(manifest.schema).toBe(FRESH_FINAL_TEACHER_MANIFEST_SCHEMA);
    expect(result.schema).toBe(FRESH_FINAL_TEACHER_RESULT_SCHEMA);
    expect(result.role).toBe("fresh_final_holdout");
    expect(result.selected_seed).toBe(43);
    expect(result.postflight_complete).toBe(true);
    expect((result.dataset as Record<string, unknown>).schema).toBe(
      FRESH_FINAL_TEACHER_DATASET_SCHEMA,
    );
    expect(await fs.promises.readdir(paths.outputRoot)).toEqual(
      expect.arrayContaining([
        "authority.json",
        "final.jsonl",
        "manifest.json",
        "result.json",
      ]),
    );
    await expect(
      fs.promises.access(path.join(paths.outputRoot, "selection.jsonl")),
    ).rejects.toThrow();
    for (const file of [
      paths.authority,
      paths.manifest,
      paths.result,
      paths.dataset,
    ]) {
      expect((await fs.promises.lstat(file)).mode & 0o7777).toBe(0o600);
    }
  });

  it("binds exact preflight paths and generator final/work outputs", () => {
    expect(() =>
      validateFreshFinalTeacherSelectionPreflight({
        ...preflight(),
        selection_receipt: artifact(
          "/tmp/forged-receipt.json",
          "shogi-floodgate-strength-first-three-seed-candidate-selection-receipt-v1",
        ),
      }),
    ).toThrow(/preflight is incomplete/);
    const paths = freshFinalTeacherPaths("/Users/tester", "/repository");
    expect(() =>
      assertFreshFinalTeacherGeneratorOutputPathsCoreForTests(
        paths.outputRoot,
        paths.dataset,
        paths.work,
      ),
    ).not.toThrow();
    expect(() =>
      assertFreshFinalTeacherGeneratorOutputPathsCoreForTests(
        paths.outputRoot,
        path.join(paths.outputRoot, "selection.jsonl"),
        paths.work,
      ),
    ).toThrow(/output paths drifted/);
  });

  it("rejects the exact parent-directory boundary and settles subprocess failure once", async () => {
    expect(
      freshFinalPrivateArtifactRelativePathCoreForTests(
        "/private/root/artifact.json",
        "/private/root",
      ),
    ).toBe("artifact.json");
    expect(() =>
      freshFinalPrivateArtifactRelativePathCoreForTests(
        "/private",
        "/private/root",
      ),
    ).toThrow(/outside its root/);

    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const spawnProcess = vi.fn(() => child) as unknown as typeof spawn;
    const promise = subprocessJsonCoreForTests(
      "/missing/python3",
      [],
      { cwd: "/", env: {} },
      spawnProcess,
    );
    const assertion = expect(promise).rejects.toThrow("spawn failed");
    child.emit("error", new Error("spawn failed"));
    expect(() => child.emit("close", 0)).not.toThrow();
    await assertion;
    expect(spawnProcess).toHaveBeenCalledOnce();

    const lyingChild = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    lyingChild.stdout = new EventEmitter();
    lyingChild.stderr = new EventEmitter();
    const lyingSpawn = vi.fn(() => lyingChild) as unknown as typeof spawn;
    const lyingPromise = subprocessJsonCoreForTests(
      "/python3",
      [],
      { cwd: "/", env: {} },
      lyingSpawn,
    );
    const lyingAssertion = expect(lyingPromise).rejects.toThrow(
      "STOP receipt is invalid",
    );
    lyingChild.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          ...blockedReceipt(),
          selection_evaluator_registry_reads: 0,
        }),
      ),
    );
    lyingChild.emit("close", 2);
    await lyingAssertion;
  });

  it("rejects row, count, group, and source-coverage lies in final.jsonl", () => {
    const completion = {
      input_games: 200,
      input_parents: 4_800,
      completed_parents: 4_800,
      forced_parents_skipped: 0,
      forced_skip_reasons: { fewer_than_two_legal_moves: 0 },
      emitted_parent_groups: 4_800,
      dataset_records: 9_600,
      sealed: true,
    };
    expect(() =>
      validateFreshFinalDatasetBytesCoreForTests(
        validDatasetBytes(),
        SOURCE_ROWS,
        completion,
      ),
    ).not.toThrow();

    const lines = validDatasetBytes().toString("utf8").trimEnd().split("\n");
    const rewrite = (
      mutate: (records: Record<string, unknown>[]) => void,
    ): Buffer => {
      const records = lines.map(
        (line) => JSON.parse(line) as Record<string, unknown>,
      );
      mutate(records);
      return Buffer.from(`${records.map(canonicalJson).join("\n")}\n`, "utf8");
    };
    const cases = [
      {
        label: "utf8",
        bytes: Buffer.from([0xed, 0xa0, 0x80]),
        completion,
        pattern: /exact UTF-8/,
      },
      {
        label: "row",
        bytes: rewrite((records) => {
          records[0].schema = "forged";
        }),
        completion,
        pattern: /unsupported schema/,
      },
      {
        label: "count",
        bytes: validDatasetBytes(),
        completion: { ...completion, dataset_records: 9_601 },
        pattern: /record count/,
      },
      {
        label: "group",
        bytes: rewrite((records) => {
          records[1].parent_id = records[2].parent_id;
        }),
        completion,
        pattern: /fewer than two siblings/,
      },
      {
        label: "coverage",
        bytes: rewrite((records) => {
          records[0].parent_id = `sha256:${sha256("unknown-parent")}`;
          records[1].parent_id = records[0].parent_id;
        }),
        completion,
        pattern: /unknown parent coverage/,
      },
    ] as const;
    for (const testCase of cases) {
      expect(
        () =>
          validateFreshFinalDatasetBytesCoreForTests(
            testCase.bytes,
            SOURCE_ROWS,
            testCase.completion,
          ),
        testCase.label,
      ).toThrow(testCase.pattern);
    }
  });

  it("rejects every tampered existing-result binding instead of treating it as idempotent", async () => {
    const cases = [
      {
        label: "dataset byte",
        mutate: async (
          paths: ReturnType<typeof freshFinalTeacherPaths>,
        ): Promise<void> => {
          await fs.promises.appendFile(paths.dataset, "tampered\n");
        },
      },
      {
        label: "manifest",
        mutate: async (
          paths: ReturnType<typeof freshFinalTeacherPaths>,
        ): Promise<void> => {
          const value = JSON.parse(
            await fs.promises.readFile(paths.manifest, "utf8"),
          ) as Record<string, unknown>;
          value.selected_seed = 42;
          await fs.promises.writeFile(
            paths.manifest,
            `${JSON.stringify(value, null, 2)}\n`,
            { mode: 0o600 },
          );
        },
      },
      {
        label: "authority",
        mutate: async (
          paths: ReturnType<typeof freshFinalTeacherPaths>,
        ): Promise<void> => {
          const value = JSON.parse(
            await fs.promises.readFile(paths.authority, "utf8"),
          ) as Record<string, unknown>;
          value.role = "fresh_selection";
          await fs.promises.writeFile(
            paths.authority,
            `${JSON.stringify(value, null, 2)}\n`,
            { mode: 0o600 },
          );
        },
      },
      {
        label: "completion type",
        mutate: async (
          paths: ReturnType<typeof freshFinalTeacherPaths>,
        ): Promise<void> => {
          const value = JSON.parse(
            await fs.promises.readFile(paths.result, "utf8"),
          ) as Record<string, unknown>;
          (value.completion as Record<string, unknown>).dataset_records = "9600";
          await fs.promises.writeFile(
            paths.result,
            `${JSON.stringify(value, null, 2)}\n`,
            { mode: 0o600 },
          );
        },
      },
      {
        label: "selected checkpoint",
        mutate: async (
          paths: ReturnType<typeof freshFinalTeacherPaths>,
        ): Promise<void> => {
          const value = JSON.parse(
            await fs.promises.readFile(paths.result, "utf8"),
          ) as Record<string, unknown>;
          (value.selected_checkpoint as Record<string, unknown>).sha256 =
            sha256("other-checkpoint");
          await fs.promises.writeFile(
            paths.result,
            `${JSON.stringify(value, null, 2)}\n`,
            { mode: 0o600 },
          );
        },
      },
    ] as const;

    for (const testCase of cases) {
      const home = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), `fresh-final-existing-${testCase.label}-`),
      );
      const base = await dependencies(home);
      await runFreshFinalTeacherCore(base);
      const paths = freshFinalTeacherPaths(home, base.repositoryRoot);
      await testCase.mutate(paths);
      await expect(runFreshFinalTeacherCore(base), testCase.label).rejects.toThrow(
        /fresh-final/,
      );
      expect(base.generate).toHaveBeenCalledTimes(1);
    }
  });

  it("recomputes existing-result revision, asset, and generation fingerprints", async () => {
    for (const stale of ["revision", "asset", "generation"] as const) {
      const home = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), `fresh-final-stale-${stale}-`),
      );
      const base = await dependencies(home);
      await runFreshFinalTeacherCore(base);
      const reused = await runFreshFinalTeacherCore(base);
      expect(reused.idempotent_existing_result).toBe(true);
      if (stale === "revision") {
        vi.mocked(base.captureExactCleanRevision).mockResolvedValue(
          "2".repeat(40),
        );
      } else if (stale === "asset") {
        vi.mocked(base.verifyAssets).mockResolvedValue({
          fixed: "changed-asset-receipt",
        } as never);
      } else {
        vi.mocked(base.computeGenerationFingerprint).mockResolvedValue(
          sha256("changed-generation"),
        );
      }
      await expect(runFreshFinalTeacherCore(base), stale).rejects.toThrow(
        /fresh-final/,
      );
      expect(base.generate).toHaveBeenCalledTimes(1);
    }
  });

  it("CLI preserves the exact STOP counters and rejects path overrides without running", async () => {
    const stoppedOutput: string[] = [];
    const stopped = await runFreshFinalTeacherCliCore([], {
      run: async () => {
        throw new FreshFinalTeacherBlocked(blockedReceipt());
      },
      writeStdout: (text) => stoppedOutput.push(text),
    });
    expect(stopped).toEqual(blockedReceipt());
    expect(JSON.parse(stoppedOutput.join(""))).toEqual(blockedReceipt());

    const run = vi.fn();
    const argumentOutput: string[] = [];
    const argumentStopped = await runFreshFinalTeacherCliCore(
      ["--source", "/tmp/private.jsonl"],
      {
        run,
        writeStdout: (text) => argumentOutput.push(text),
      },
    );
    expect(run).not.toHaveBeenCalled();
    expect(argumentStopped).toMatchObject({
      status: "STOP",
      reason: "arguments-forbidden",
      selection_evaluator_registry_reads: 0,
      selection_receipt_reads: 0,
      fresh_final_source_reads: 0,
      fresh_final_label_reads: 0,
      teacher_engines_started: 0,
      live_weight_writes: 0,
    });
    expect(JSON.parse(argumentOutput.join(""))).toEqual(argumentStopped);
  });
});
