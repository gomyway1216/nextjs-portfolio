import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA,
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY,
  confirmFloodgateStableWasmDeadlineParityCoreForTests,
  runFloodgateStableWasmDeadlineDiagnosticCoreForTests,
  runFloodgateStableWasmDeadlineDiagnosticWithSourceCoreForTests,
  type FloodgateStableWasmDeadlineDiagnosticAssets,
  type FloodgateStableWasmDeadlineDiagnosticInput,
} from "../../../ml/floodgate-stable-wasm-deadline-diagnostic";
import { positionFromSfen } from "../../../ml/shogi-sfen";

const REPOSITORY_ROOT = process.cwd();
const WORKER_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-diagnostic-worker-v1";
const MATE_SFEN = "4k4/9/5G3/9/4+R4/9/9/9/4K4 b 3P 1";
const INITIAL_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const EVIDENCE_PATH = join(
  REPOSITORY_ROOT,
  "docs",
  "data",
  "floodgate-stable-wasm-deadline-diagnostic-2026-07-17.json",
);
const JAPANESE_ARTICLE_PATH = join(
  REPOSITORY_ROOT,
  "docs",
  "blog-shogi-floodgate-stable-wasm-deadline-diagnostic.md",
);
const ENGLISH_ARTICLE_PATH = join(
  REPOSITORY_ROOT,
  "docs",
  "blog-shogi-floodgate-stable-wasm-deadline-diagnostic.en.md",
);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assets(
  workerSourceBytes: Uint8Array = readFileSync(
    join(
      REPOSITORY_ROOT,
      "ml",
      "floodgate-stable-wasm-deadline-diagnostic-worker.mjs",
    ),
  ),
): FloodgateStableWasmDeadlineDiagnosticAssets {
  return {
    wasmBytes: readFileSync(
      join(
        REPOSITORY_ROOT,
        "src",
        "components",
        "game",
        "ShogiImproved",
        "wasm",
        "shogi.wasm",
      ),
    ),
    weightsBytes: readFileSync(
      join(REPOSITORY_ROOT, "public", "shogi-nnue-weights.bin"),
    ),
    workerSourceBytes,
  };
}

function input(
  sfen: string,
  rootTesu = 0,
): FloodgateStableWasmDeadlineDiagnosticInput {
  const { position } = positionFromSfen(sfen);
  const board: number[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      board.push(position.ban[(file << 4) + rank] | 0);
    }
  }
  const hands: number[] = [];
  for (let piece = 17; piece <= 39; piece += 1) {
    hands.push(position.hand[piece] | 0);
  }
  return {
    board,
    hands,
    sideToMove: position.teban as 16 | 32,
    rootTesu,
  };
}

function syntheticIsolationWorker(): Buffer {
  return Buffer.from(
    `
const S=${JSON.stringify(WORKER_SCHEMA)};
let data="";
process.stdin.setEncoding("ascii");
process.stdin.on("data",chunk=>{data+=chunk;});
process.stdin.on("end",()=>{
  const message=JSON.parse(data.slice(0,-1));
  if(message.root_tesu===2){setInterval(()=>{},1000);return;}
  if(message.root_tesu===3){
    process.stderr.write("SENSITIVE_SFEN_BOARD_INDEX_DIGEST_GAME_PARENT_POSITION_PID_STDERR_MOVE_SCORE_CANARY");
    setInterval(()=>{},1000);
    return;
  }
  const deadline=message.root_tesu===1;
  const response={
    adopted:false,
    completed_depth:deadline?2:11,
    leaves_bucket:deadline?"1024-32767":"32768-1048575",
    nodes_bucket:deadline?"1-1023":"1024-32767",
    outcome:deadline?"deadline":"complete",
    phase:deadline?"cooperative-deadline-after-completed-depth-2":"requested-depth-complete",
    schema:S,
    type:"result"
  };
  const delay=message.root_tesu>=4?(12-message.root_tesu)*5:0;
  setTimeout(()=>process.stdout.write(JSON.stringify(response)+"\\n","ascii",()=>process.exit(0)),delay);
});
`,
    "utf8",
  );
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

describe("stable-WASM cooperative deadline diagnostic", () => {
  it("proves exact real pinned-WASM parity for maxTime=0 and maxTime=1 under a constant clock", async () => {
    await expect(
      confirmFloodgateStableWasmDeadlineParityCoreForTests(
        input(MATE_SFEN),
        assets(),
      ),
    ).resolves.toBe(true);
  }, 30_000);

  it("returns cooperatively under a scaled real clock and never adopts the partial iteration", async () => {
    const result = await runFloodgateStableWasmDeadlineDiagnosticCoreForTests(
      [input(INITIAL_SFEN)],
      assets(),
      {
        cooperativeDeadlineMilliseconds: 1,
        outerWatchdogMilliseconds: 30_000,
      },
    );

    expect(result.outcome_counts).toEqual({
      complete: 0,
      deadline: 1,
      watchdog: 0,
      failure: 0,
    });
    expect(result.partial_iteration_results_adopted).toBe(0);
    expect(result.individual_lane_records_returned).toBe(0);
    expect(
      result.completed_depth_histogram.reduce(
        (sum, entry) => sum + entry.count,
        0,
      ),
    ).toBe(1);
    expect(result.all_children_reaped).toBe(true);
    expect(
      result.phase_histogram
        .filter((entry) =>
          entry.phase.startsWith("cooperative-deadline-after-completed-depth-"),
        )
        .reduce((sum, entry) => sum + entry.count, 0),
    ).toBe(1);
  }, 30_000);

  it("snapshots Buffer-backed assets before the first asynchronous boundary", async () => {
    const workerSourceBytes = syntheticIsolationWorker();
    const workerIdentity = {
      bytes: workerSourceBytes.byteLength,
      sha256: sha256(workerSourceBytes),
    };
    const mutableAssets = assets(workerSourceBytes);
    const resultPromise =
      runFloodgateStableWasmDeadlineDiagnosticWithSourceCoreForTests(
        [input(MATE_SFEN, 4)],
        mutableAssets,
        {
          cooperativeDeadlineMilliseconds: 20,
          outerWatchdogMilliseconds: 1_000,
        },
        workerIdentity,
      );

    mutableAssets.wasmBytes.fill(0);
    mutableAssets.weightsBytes.fill(0);
    mutableAssets.workerSourceBytes.fill(0);

    await expect(resultPromise).resolves.toMatchObject({
      outcome_counts: {
        complete: 1,
        deadline: 0,
        watchdog: 0,
        failure: 0,
      },
      all_children_reaped: true,
    });
  });

  it("rejects malformed positions before launching a diagnostic child", () => {
    const valid = input(INITIAL_SFEN);
    const missingKingBoard = [...valid.board];
    missingKingBoard[missingKingBoard.indexOf(24)] = 0;
    const invalidPieceBoard = [...valid.board];
    invalidPieceBoard[0] = 1;
    const nonDroppableHands = [...valid.hands];
    nonDroppableHands[7] = 1;
    const excessiveMaterialHands = [...valid.hands];
    excessiveMaterialHands[0] = 18;

    for (const [malformed, message] of [
      [
        { ...valid, board: missingKingBoard },
        "diagnostic board must contain exactly one king for each side",
      ],
      [
        { ...valid, board: invalidPieceBoard },
        "diagnostic board square 0 contains an invalid piece",
      ],
      [
        { ...valid, hands: nonDroppableHands },
        "diagnostic hands[7] is not a droppable-piece slot",
      ],
      [
        { ...valid, hands: excessiveMaterialHands },
        "diagnostic position exceeds the material limit for kind 1",
      ],
    ] as const) {
      expect(() =>
        runFloodgateStableWasmDeadlineDiagnosticCoreForTests(
          [malformed],
          assets(),
        ),
      ).toThrow(message);
    }
  });

  it("isolates children and matches histogram/count aggregates for two tested permutations", async () => {
    const workerSourceBytes = syntheticIsolationWorker();
    const workerIdentity = {
      bytes: workerSourceBytes.byteLength,
      sha256: sha256(workerSourceBytes),
    };
    const inputs = Array.from({ length: 12 }, (_, rootTesu) =>
      input(MATE_SFEN, rootTesu),
    );
    const run = (
      runInputs: readonly FloodgateStableWasmDeadlineDiagnosticInput[],
    ) =>
      runFloodgateStableWasmDeadlineDiagnosticWithSourceCoreForTests(
        runInputs,
        assets(workerSourceBytes),
        {
          cooperativeDeadlineMilliseconds: 20,
          outerWatchdogMilliseconds: 1_000,
        },
        workerIdentity,
      );

    const first = await run(inputs);
    const second = await run([...inputs].reverse());

    const histogramCountAggregate = ({
      outcome_counts,
      phase_histogram,
      completed_depth_histogram,
      nodes_bucket_histogram,
      leaves_bucket_histogram,
      individual_lane_records_returned,
      partial_iteration_results_adopted,
    }: typeof first) => ({
      outcome_counts,
      phase_histogram,
      completed_depth_histogram,
      nodes_bucket_histogram,
      leaves_bucket_histogram,
      individual_lane_records_returned,
      partial_iteration_results_adopted,
    });

    expect(histogramCountAggregate(first)).toEqual(
      histogramCountAggregate(second),
    );
    expect(first.outcome_counts).toEqual({
      complete: 9,
      deadline: 1,
      watchdog: 1,
      failure: 1,
    });
    expect(first.completed_depth_histogram[2]).toEqual({
      depth: 2,
      count: 1,
    });
    expect(first.completed_depth_histogram[11]).toEqual({
      depth: 11,
      count: 9,
    });
    expect(first.all_children_reaped).toBe(true);
    expect(first.partial_iteration_results_adopted).toBe(0);
    expect(first.configured_maximum_parallel_children).toBe(
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN,
    );
    expect(first.observed_peak_parallel_children).toBe(6);
    expect(
      first.phase_histogram.find(
        (entry) => entry.phase === "requested-depth-complete",
      )?.count,
    ).toBe(9);
    expect(
      first.phase_histogram.find(
        (entry) =>
          entry.phase === "cooperative-deadline-after-completed-depth-2",
      )?.count,
    ).toBe(1);
    expect(
      first.phase_histogram.find((entry) => entry.phase === "outer-watchdog")
        ?.count,
    ).toBe(1);
    expect(
      first.phase_histogram.find((entry) => entry.phase === "failure")?.count,
    ).toBe(1);

    const serialized = JSON.stringify(first);
    for (const forbidden of [
      "SENSITIVE_",
      "sfen",
      "board",
      "index",
      "digest",
      "game",
      "parent",
      "position",
      "pid",
      "stderr",
      "packed_move",
      "raw_search_score",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  }, 10_000);

  it("does not count an asynchronous spawn failure as an observed child", async () => {
    const result = await runFloodgateStableWasmDeadlineDiagnosticCoreForTests(
      [input(MATE_SFEN)],
      assets(),
      {
        cooperativeDeadlineMilliseconds: 1,
        outerWatchdogMilliseconds: 1_000,
        testOnlyChildExecutablePath: join(
          tmpdir(),
          "missing-stable-wasm-diagnostic-node",
        ),
      },
    );

    expect(result.outcome_counts).toEqual({
      complete: 0,
      deadline: 0,
      watchdog: 0,
      failure: 1,
    });
    expect(result.configured_maximum_parallel_children).toBe(6);
    expect(result.observed_peak_parallel_children).toBe(0);
    expect(result.all_children_reaped).toBe(true);
  });

  it("fixes the 600s cooperative and 615s outer boundaries and exact follow-up commands", () => {
    expect(FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS).toBe(
      600_000,
    );
    expect(FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS).toBe(615_000);

    const packageJson = JSON.parse(
      readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"),
    );
    expect(
      Object.keys(packageJson.scripts)
        .filter((name) => name.includes("floodgate-stable-wasm-deadline"))
        .sort(),
    ).toEqual(
      [
        "build:shogi-floodgate-stable-wasm-deadline-diagnostic-bundle",
        "shogi:floodgate-stable-wasm-deadline-diagnostic",
        "test:shogi-floodgate-stable-wasm-deadline-public-calibration",
      ].sort(),
    );
    expect(packageJson.scripts).toMatchObject({
      "build:shogi-floodgate-stable-wasm-deadline-diagnostic-bundle":
        "node ml/build-floodgate-stable-wasm-deadline-diagnostic-bundle.mjs --write",
      "shogi:floodgate-stable-wasm-deadline-diagnostic":
        '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-stable-wasm-deadline-diagnostic-launcher.jxa"',
      "test:shogi-floodgate-stable-wasm-deadline-public-calibration":
        'FLOODGATE_STABLE_WASM_DEADLINE_REAL_PUBLIC_CALIBRATION=1 vitest run tests/unit/ml/floodgateStableWasmDeadlineRunBinding.test.ts -t "runs the pinned public sentinel" --reporter=verbose',
    });
  });

  it("keeps the worker clock, search knobs, shared-TT, and privacy boundary explicit", () => {
    const worker = readFileSync(
      join(
        REPOSITORY_ROOT,
        "ml",
        "floodgate-stable-wasm-deadline-diagnostic-worker.mjs",
      ),
      "utf8",
    );
    const core = readFileSync(
      join(
        REPOSITORY_ROOT,
        "ml",
        "floodgate-stable-wasm-deadline-diagnostic.ts",
      ),
      "utf8",
    );

    expect(worker).toContain(
      "() => (performance.now() - epoch) / message.cooperative_deadline_ms",
    );
    expect(worker).toContain("const result = runSearch(runtime, message, 1);");
    expect(worker).toContain(
      "instantiateRuntime(wasmBytes, weightsBytes, () => 0)",
    );
    expect(worker).toContain("wasm.setSharedTtEnabled(0)");
    expect(worker).not.toContain("wasm.setSharedTtEnabled(1)");
    expect(worker).toContain("const SEARCH_DEPTH = 11");
    expect(worker).toContain("const QUIESCENCE_DEPTH = 10");
    expect(core).toContain('child.once("spawn"');
    expect(core).toContain("if (lifecycleSpawned) lifecycle?.onReap()");
    expect(`${core}\n${worker}`).not.toMatch(
      /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\b/u,
    );
    expect(core).not.toContain("process.argv");
    expect(worker).not.toContain("process.argv");
  });

  it("publishes a closed design record and matching Japanese/English articles", () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const japanese = readFileSync(JAPANESE_ARTICLE_PATH, "utf8");
    const english = readFileSync(ENGLISH_ARTICLE_PATH, "utf8");

    expect(evidence).toMatchObject({
      schema:
        "shogi-floodgate-stable-wasm-deadline-diagnostic-design-evidence-v1",
      evidence_date: "2026-07-17",
      source_base: {
        commit: "398b6d20dbe9b2de4648e77424c2a15820f15dec",
      },
      contract: {
        cooperative_deadline_ms: 600000,
        outer_watchdog_ms: 615000,
        requests_per_child: 1,
        maximum_parallel_children: 6,
        constant_clock_parity_scope:
          "deadline-not-crossed-algorithmic-branch-sentinel-only",
        host_callback_boundary_crossing_present_when_max_time_is_1: true,
        shared_tt_enabled: false,
        assets_snapshotted_before_first_asynchronous_boundary: true,
        malformed_position_rejected_before_child_launch: true,
        observed_peak_parallelism_claim:
          "timing-sensitive-per-run-measurement-not-claimed-order-invariant",
        partial_iteration_results_adopted: 0,
      },
      operational_state: {
        state: "STOP",
        real_diagnostic_runs: 0,
        live_weights_changed: false,
      },
      unit_verification: {
        asynchronous_spawn_failure_observed_peak_parallel_children: 0,
        buffer_backed_asset_snapshot_isolation: "PASS",
        malformed_position_prelaunch_rejection: "PASS",
        synthetic_tested_input_and_completion_order_permutation_count: 2,
        synthetic_two_tested_permutations_same_histogram_count_aggregate:
          "PASS",
      },
      nonclaims: {
        host_callback_overhead_is_zero: false,
        constant_clock_and_deadline_clock_wall_performance_equal: false,
        same_600_second_wall_timing_as_production_established: false,
        production_timing_equivalence_established: false,
      },
    });
    expect(evidence.runtime_exports).toEqual({
      schema: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA,
      status: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS,
      claim_boundary: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY,
    });
    const diagnosticWorker = readFileSync(
      join(
        REPOSITORY_ROOT,
        "ml",
        "floodgate-stable-wasm-deadline-diagnostic-worker.mjs",
      ),
    );
    expect(evidence.pinned_assets.diagnostic_worker).toEqual(
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY,
    );
    expect(diagnosticWorker.byteLength).toBe(
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY.bytes,
    );
    expect(sha256(diagnosticWorker)).toBe(
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY.sha256,
    );
    expect(numberedSections(japanese)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(numberedSections(english)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const marker of [
      "600,000",
      "615,000",
      "searchBestMove(1, 11, 10)",
      "0",
      "STOP",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
  });

  it("keeps every pinned production identity unchanged from the latest main base", () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));

    for (const identity of evidence.unchanged_production_identities) {
      const bytes = readFileSync(join(REPOSITORY_ROOT, identity.path));
      expect(bytes.byteLength, identity.path).toBe(identity.bytes);
      expect(sha256(bytes), identity.path).toBe(identity.sha256);
    }
    for (const productionPath of [
      "ml/floodgate-stable-wasm-worker.mjs",
      "ml/floodgate-stable-wasm-proposer.ts",
      "ml/floodgate-production-stable-wasm-runtime.ts",
      "ml/floodgate-production-teacher-asset-authority.ts",
    ]) {
      const source = readFileSync(
        join(REPOSITORY_ROOT, productionPath),
        "utf8",
      );
      expect(source).not.toContain("floodgate-stable-wasm-deadline-diagnostic");
    }
  });
});
