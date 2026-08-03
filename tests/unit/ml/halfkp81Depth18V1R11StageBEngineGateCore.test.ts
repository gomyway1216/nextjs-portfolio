import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  HALFKP81_V1R11_CANDIDATE_ORDER_PARENT_ID,
  HALFKP81_V1R11_KNOWN10_EXPECTED,
  HALFKP81_V1R11_PATHOLOGICAL_HASH8192_IDENTITY,
  HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID,
  runHalfkp81V1R11CandidateOrderGateCore,
  runHalfkp81V1R11Known10ProbeCore,
  runHalfkp81V1R11MixedLoadGateCore,
  runHalfkp81V1R11PathologicalFallbackGateCore,
  type Halfkp81V1R11StageBEngineBoundary,
  type Halfkp81V1R11StageBEngineLane,
  type Halfkp81V1R11StageBParent,
  type Halfkp81V1R11StageBSearchIdentity,
} from "../../../ml/halfkp81-depth18-v1r11-stage-b-engine-gate-core";
import {
  buildHalfkp81V1R11MixedLoadObservationForTests,
  filterHalfkp81V1R11PsObserverForTests,
  publishHalfkp81V1R11PrivateSnapshotForTests,
  runHalfkp81V1R11WithBoundaryCleanupForTests,
  validateHalfkp81V1R11Depth18SearchIdentityForTests,
  validateHalfkp81V1R11FixedPowerGuardianRowForTests,
  type Halfkp81V1R11FixedEngineBoundary,
} from "../../../ml/halfkp81-depth18-v1r11-stage-b-fixed-engine-boundary";
import { buildHalfkp81V1R11StageBOneShotPlist } from "../../../ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";
import { buildHalfkp81V1R11StageBChildLaunchEvidenceForTests } from "../../../ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate";
import type { UsiMultiPvResult } from "../../../ml/usi-multipv";

function identity(
  move: string,
  cp = 17,
  observedNodes = 100,
): Readonly<Halfkp81V1R11StageBSearchIdentity> {
  return Object.freeze({
    bestmove: move,
    depth: 18 as const,
    moves: Object.freeze([move] as const),
    observed_nodes: observedNodes,
    requested_multipv: 1 as const,
    scores: Object.freeze([
      Object.freeze({ cp, move, score_kind: "cp" as const }),
    ] as const),
  });
}

function parent(
  parentId: string,
  playedMove = "6h5i",
  legalMoveCount = 2,
): Readonly<Halfkp81V1R11StageBParent> {
  return Object.freeze({
    parent_id: parentId,
    parent_sfen: "fixture-sfen",
    played_move: playedMove,
    legal_move_count: legalMoveCount,
  });
}

function fakeBoundary(options?: Readonly<{ corruptKnownMove?: string }>): {
  readonly boundary: Readonly<Halfkp81V1R11StageBEngineBoundary>;
  readonly calls: string[];
} {
  const calls: string[] = [];
  const boundary = Object.freeze({
    async openLane(
      hashMib: 512 | 8192,
    ): Promise<Halfkp81V1R11StageBEngineLane> {
      calls.push(`open:${hashMib}`);
      return Object.freeze({
        hash_mib: hashMib,
        async propose() {
          calls.push(`propose:${hashMib}`);
          return Object.freeze({
            depth: 16 as const,
            moves: Object.freeze(["6h7h", "6h5i"]),
            requested_multipv: 2,
          });
        },
        async rescore(_parent, move) {
          calls.push(`rescore:${hashMib}:${move}`);
          const expected = HALFKP81_V1R11_KNOWN10_EXPECTED.find(
            (row) => row.move === move,
          );
          if (move === "G*6a") {
            return HALFKP81_V1R11_PATHOLOGICAL_HASH8192_IDENTITY;
          }
          if (expected === undefined) return identity(move, 17, hashMib);
          if (options?.corruptKnownMove === move) {
            return identity(
              move,
              expected.result_identity.scores[0].cp + 1,
              expected.result_identity.observed_nodes,
            );
          }
          return expected.result_identity;
        },
        async close() {
          calls.push(`close:${hashMib}`);
        },
      });
    },
  });
  return { boundary, calls };
}

describe("v1r11 Stage-B candidate-order and known10 engine core", () => {
  it("parses the real typed USI scoreKind field through the production depth18 identity path", () => {
    const result = {
      depth: 18,
      bestmove: "6h5i",
      observedNodes: 42_001,
      lines: [
        {
          depth: 18,
          multipv: 1,
          cp: 73,
          nodes: 42_001,
          move: "6h5i",
          pv: ["6h5i", "4a5b"],
          scoreKind: "cp",
        },
      ],
    } satisfies Readonly<UsiMultiPvResult>;

    expect(
      validateHalfkp81V1R11Depth18SearchIdentityForTests(result, "6h5i"),
    ).toEqual({
      bestmove: "6h5i",
      depth: 18,
      moves: ["6h5i"],
      observed_nodes: 42_001,
      requested_multipv: 1,
      scores: [{ cp: 73, move: "6h5i", score_kind: "cp" }],
    });
  });

  it("runs the fixed candidate order through Hash512 then Hash8192", async () => {
    const fake = fakeBoundary();
    const result = await runHalfkp81V1R11CandidateOrderGateCore(
      fake.boundary,
      parent(HALFKP81_V1R11_CANDIDATE_ORDER_PARENT_ID),
    );

    expect(result).toMatchObject({
      parents: 1,
      mismatches: 0,
      technical_faults: 0,
    });
    expect(result.candidate_set).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.normal_candidate_order_digest).toBe(
      result.fallback_candidate_order_digest,
    );
    expect(result.normal_candidate_order_digest).toBe(
      result.publication_order_digest,
    );
    expect(fake.calls).toEqual([
      "open:512",
      "propose:512",
      "rescore:512:6h5i",
      "rescore:512:6h7h",
      "close:512",
      "open:8192",
      "rescore:8192:6h5i",
      "rescore:8192:6h7h",
      "close:8192",
    ]);
  });

  it("matches all ten fixed depth18 identities across eight parents", async () => {
    const fake = fakeBoundary();
    const parents = new Map<string, Readonly<Halfkp81V1R11StageBParent>>();
    for (const row of HALFKP81_V1R11_KNOWN10_EXPECTED) {
      parents.set(row.parent_id, parent(row.parent_id, row.move));
    }
    const result = await runHalfkp81V1R11Known10ProbeCore(
      fake.boundary,
      parents,
    );

    expect(result).toMatchObject({
      parents: 8,
      moves: 10,
      mismatches: 0,
      technical_faults: 0,
    });
    expect(result.actual_exact_depth18_identities).toEqual(
      result.fixed_expected_identities,
    );
    expect(fake.calls.at(-1)).toBe("close:512");
  });

  it("fails closed on a known10 identity mismatch and still closes the lane", async () => {
    const corruptMove = "P*6f";
    const fake = fakeBoundary({ corruptKnownMove: corruptMove });
    const parents = new Map<string, Readonly<Halfkp81V1R11StageBParent>>();
    for (const row of HALFKP81_V1R11_KNOWN10_EXPECTED) {
      parents.set(row.parent_id, parent(row.parent_id, row.move));
    }

    await expect(
      runHalfkp81V1R11Known10ProbeCore(fake.boundary, parents),
    ).rejects.toThrow(/known10 exact depth18 identities differ/u);
    expect(fake.calls.at(-1)).toBe("close:512");
  });

  it("routes the fixed pathological parent to Hash8192 without publishing normal partials", async () => {
    const fake = fakeBoundary();
    const result = await runHalfkp81V1R11PathologicalFallbackGateCore(
      fake.boundary,
      parent(HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID, "G*6a"),
    );

    expect(result).toEqual({
      parent_id: HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID,
      normal_partial_rows_published: 0,
      capped_rows_published: 0,
      fallback_exact_depth18_identity:
        HALFKP81_V1R11_PATHOLOGICAL_HASH8192_IDENTITY,
      fixed_hash8192_identity:
        HALFKP81_V1R11_PATHOLOGICAL_HASH8192_IDENTITY,
      technical_faults: 0,
    });
    expect(fake.calls).toEqual([
      "open:512",
      "close:512",
      "open:8192",
      "rescore:8192:G*6a",
      "close:8192",
    ]);
  });

  it("fails closed on a pathological Hash8192 identity mismatch and closes the lane", async () => {
    const calls: string[] = [];
    const boundary = Object.freeze({
      async openLane(
        hashMib: 512 | 8192,
      ): Promise<Halfkp81V1R11StageBEngineLane> {
        calls.push(`open:${hashMib}`);
        return Object.freeze({
          hash_mib: hashMib,
          async propose() {
            throw new Error("pathological gate must not propose");
          },
          async rescore(_parent: unknown, move: string) {
            calls.push(`rescore:${hashMib}:${move}`);
            return identity(move, -35_280, 433_851_102);
          },
          async close() {
            calls.push(`close:${hashMib}`);
          },
        });
      },
    });

    await expect(
      runHalfkp81V1R11PathologicalFallbackGateCore(
        boundary,
        parent(HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID, "G*6a"),
      ),
    ).rejects.toThrow(/pathological Hash8192 exact identity differs/u);
    expect(calls.at(-1)).toBe("close:8192");
  });

  it("authenticates and removes only the ephemeral ps observer child", () => {
    const ps = (pid: number) => ({
      pid,
      ppid: 700,
      pgid: 700,
      start_token: "Sun Aug 2 15:00:00 2026",
      state: "R",
      command: "/bin/ps -axo pid=,ppid=,pgid=,lstart=,state=,command=",
    });
    const engine = {
      pid: 701,
      ppid: 700,
      pgid: 701,
      start_token: "Sun Aug 2 14:59:00 2026",
      state: "S",
      command: "/private/YaneuraOu",
    };
    expect(
      filterHalfkp81V1R11PsObserverForTests(
        [engine, ps(800)],
        [engine, ps(801)],
        700,
      ),
    ).toEqual([engine]);
    expect(() =>
      filterHalfkp81V1R11PsObserverForTests(
        [engine, ps(800)],
        [engine, ps(800)],
        700,
      ),
    ).toThrow(/observer authentication differs/u);
  });

  it("always invokes boundary abort cleanup when the core throws", async () => {
    const calls: string[] = [];
    const cleanup = {
      process_cleanup: {
        scheduling_stopped: true as const,
        engines_started: 1,
        engines_terminated: 1,
        engines_reaped: 1,
        remaining_engine_pids: [],
        children_reaped: true as const,
        next_job_started: false as const,
      },
      os_reap_evidence: {
        observer_pid: 700,
        engine_pids: [701],
        engine_pgids: [701],
        engine_start_tokens: ["Sun Aug 2 15:00:00 2026"],
        direct_parent_matches: 1,
        dedicated_process_groups_verified: 1,
        kill_zero_esrch_after_close: 1,
        ps_rows_absent_after_close: 1,
        process_group_members_absent_after_close: 1,
        remaining_descendant_pids: [],
        remaining_process_group_pids: [],
      },
    };
    const boundary = {
      async openLane() {
        throw new Error("unused");
      },
      finalizeAndVerifyNoChildren() {
        calls.push("finalize");
        return cleanup;
      },
      async abortAndVerifyNoChildren() {
        calls.push("abort");
        return cleanup;
      },
    } satisfies Halfkp81V1R11FixedEngineBoundary;

    await expect(
      runHalfkp81V1R11WithBoundaryCleanupForTests(boundary, async () => {
        calls.push("operation");
        throw new Error("gate failed");
      }),
    ).rejects.toThrow(/gate failed/u);
    expect(calls).toEqual(["operation", "abort"]);
  });

  it("requires the exact fixed power guardian command in the engine boundary", () => {
    const repositoryRoot = "/repo";
    const expected =
      "/absolute/node -r /repo/node_modules/tsx/dist/cjs/index.cjs /repo/ml/halfkp81-depth18-power-continuity-guardian.ts";
    const row = Object.freeze({
      pid: 702,
      ppid: 700,
      pgid: 700,
      start_token: "Sun Aug  2 15:00:00 2026",
      state: "S",
      command: expected,
    });
    const context = Object.freeze({
      runnerPid: 700,
      runnerPgid: 700,
      nodePath: "/absolute/node",
      repositoryRoot,
    });
    expect(() =>
      validateHalfkp81V1R11FixedPowerGuardianRowForTests(row, context),
    ).not.toThrow();
    for (const command of [
      "/tmp/fake /repo/ml/halfkp81-depth18-power-continuity-guardian.ts",
      `${expected} --extra-argument`,
    ]) {
      expect(() =>
        validateHalfkp81V1R11FixedPowerGuardianRowForTests(
          { ...row, command },
          context,
        ),
      ).toThrow(/power guardian topology differs/u);
    }
  });

  it("aborts and reaps the boundary when power continuity fails mid-gate", async () => {
    const calls: string[] = [];
    const cleanup = {
      process_cleanup: {
        scheduling_stopped: true as const,
        engines_started: 1,
        engines_terminated: 1,
        engines_reaped: 1,
        remaining_engine_pids: [],
        children_reaped: true as const,
        next_job_started: false as const,
      },
      os_reap_evidence: {
        observer_pid: 700,
        engine_pids: [701],
        engine_pgids: [701],
        engine_start_tokens: ["Sun Aug 2 15:00:00 2026"],
        direct_parent_matches: 1,
        dedicated_process_groups_verified: 1,
        kill_zero_esrch_after_close: 1,
        ps_rows_absent_after_close: 1,
        process_group_members_absent_after_close: 1,
        remaining_descendant_pids: [],
        remaining_process_group_pids: [],
      },
    };
    let settleOperation!: () => void;
    const operation = new Promise<Readonly<Record<string, unknown>>>(
      (resolve) => {
        settleOperation = () => resolve(Object.freeze({ status: "too-late" }));
      },
    );
    const boundary = {
      async openLane() {
        throw new Error("unused");
      },
      finalizeAndVerifyNoChildren() {
        calls.push("finalize");
        return cleanup;
      },
      async abortAndVerifyNoChildren() {
        calls.push("abort");
        settleOperation();
        return cleanup;
      },
    } satisfies Halfkp81V1R11FixedEngineBoundary;

    await expect(
      runHalfkp81V1R11WithBoundaryCleanupForTests(
        boundary,
        () => {
          calls.push("operation");
          return operation;
        },
        Promise.reject(new Error("power continuity failed")),
      ),
    ).rejects.toThrow(/power continuity failed/u);
    expect(calls).toEqual(["operation", "abort"]);
  });

  it("executes from a private immutable-by-content asset snapshot", async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "v1r11-stage-b-snapshot-")),
    );
    try {
      const source = path.join(root, "source.bin");
      const snapshot = path.join(root, "snapshot.bin");
      fs.writeFileSync(source, "authenticated", { mode: 0o600 });
      const authenticated = fs.readFileSync(source);
      await publishHalfkp81V1R11PrivateSnapshotForTests(
        snapshot,
        authenticated,
        0o500,
        "test engine",
      );
      fs.writeFileSync(source, "mutated-source");
      expect(fs.readFileSync(snapshot)).toEqual(authenticated);
      expect(fs.statSync(snapshot).mode & 0o7777).toBe(0o500);
      expect(fs.statSync(snapshot).nlink).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires two stable observations of a truly concurrent 8+2 mixed load", async () => {
    const active = [
      ...Array.from({ length: 2 }, (_, index) => ({
        slot_id: `fallback-${String(index + 1).padStart(2, "0")}`,
        class: "fallback" as const,
        hash_mib: 8192 as const,
        pid: 710 + index,
        ppid: 700,
        pgid: 700,
        start_token: "Sun Aug  2 15:00:01 2026",
        state: "S",
        command: `/tmp/fallback-${index + 1}/YaneuraOu-authenticated-snapshot`,
        engine_binary_sha256:
          "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        slot_id: `normal-${String(index + 1).padStart(2, "0")}`,
        class: "normal" as const,
        hash_mib: 512 as const,
        pid: 720 + index,
        ppid: 700,
        pgid: 700,
        start_token: "Sun Aug  2 15:00:01 2026",
        state: "S",
        command: `/tmp/normal-${index + 1}/YaneuraOu-authenticated-snapshot`,
        engine_binary_sha256:
          "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
      })),
    ];
    const observations = [0, 1].map((offset) => ({
      schema:
        "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-mixed-load-process-observation-v1" as const,
      status:
        "authenticated-live-process-snapshot-no-formal-authority" as const,
      observation_sequence: offset + 1,
      observed_at_utc: `2026-08-02T22:00:0${offset}.000Z`,
      runner_pid: 700,
      runner_pgid: 700,
      runner_start_token: "Sun Aug  2 15:00:00 2026",
      active_engines: active,
      normal_active_recomputed: 8,
      fallback_active_recomputed: 2,
    }));
    const boundary = Object.freeze({
      async openLane(): Promise<Halfkp81V1R11StageBEngineLane> {
        throw new Error("mixed-load must not use a serial lane");
      },
      async runAuthenticatedMixedLoadProbe() {
        return observations;
      },
    });

    await expect(runHalfkp81V1R11MixedLoadGateCore(boundary)).resolves.toEqual({
      normal_engines: 8,
      normal_hash_mib_each: 512,
      fallback_engines: 2,
      fallback_hash_mib_each: 8192,
      maximum_normal_active: 8,
      maximum_fallback_active: 2,
      process_observations: observations,
      technical_faults: 0,
    });
    await expect(
      runHalfkp81V1R11MixedLoadGateCore({
        ...boundary,
        async runAuthenticatedMixedLoadProbe() {
          return [
            { ...observations[0]!, active_engines: active.slice(0, 1) },
            observations[1]!,
          ];
        },
      }),
    ).rejects.toThrow(/observation 1 differs/u);
    await expect(
      runHalfkp81V1R11MixedLoadGateCore({
        ...boundary,
        async runAuthenticatedMixedLoadProbe() {
          return [
            observations[0]!,
            {
              ...observations[1]!,
              active_engines: active.map((engine, index) =>
                index === 0
                  ? { ...engine, start_token: "Sun Aug  2 15:01:01 2026" }
                  : engine,
              ),
            },
          ];
        },
      }),
    ).rejects.toThrow(/lifecycle changed/u);
  });

  it("derives the fixed mixed-load row from ten authenticated process identities", () => {
    const runner = {
      pid: 700,
      ppid: 1,
      pgid: 700,
      start_token: "Sun Aug  2 15:00:00 2026",
      state: "S",
      command: "/absolute/node /absolute/stage-b.ts",
    };
    const records = [
      ...Array.from({ length: 2 }, (_, index) => ({
        slotId: `fallback-${String(index + 1).padStart(2, "0")}`,
        class: "fallback" as const,
        hashMib: 8192 as const,
        processRow: {
          pid: 710 + index,
          ppid: 700,
          pgid: 700,
          start_token: "Sun Aug  2 15:00:01 2026",
          state: "S",
          command: `/tmp/fallback-${index + 1}/YaneuraOu-authenticated-snapshot`,
        },
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        slotId: `normal-${String(index + 1).padStart(2, "0")}`,
        class: "normal" as const,
        hashMib: 512 as const,
        processRow: {
          pid: 720 + index,
          ppid: 700,
          pgid: 700,
          start_token: "Sun Aug  2 15:00:01 2026",
          state: "S",
          command: `/tmp/normal-${index + 1}/YaneuraOu-authenticated-snapshot`,
        },
      })),
    ];
    const observation = buildHalfkp81V1R11MixedLoadObservationForTests({
      sequence: 1,
      observedAtMs: Date.parse("2026-08-02T22:00:00.000Z"),
      runner,
      records,
      liveRows: records.map((record) => record.processRow),
      engineBinarySha256:
        "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
    });
    expect(observation.active_engines).toHaveLength(10);
    expect(observation.active_engines[0]?.slot_id).toBe("fallback-01");
    expect(observation.normal_active_recomputed).toBe(8);
    expect(observation.fallback_active_recomputed).toBe(2);
    expect(() =>
      buildHalfkp81V1R11MixedLoadObservationForTests({
        sequence: 1,
        observedAtMs: Date.parse("2026-08-02T22:00:00.000Z"),
        runner,
        records,
        liveRows: records.map((record, index) =>
          index === 0
            ? { ...record.processRow, pgid: 999 }
            : record.processRow,
        ),
        engineBinarySha256:
          "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
      }),
    ).toThrow(/slot fallback-01 observation differs/u);
  });

  it("builds child launch evidence only from the exact live runner/holder/plist/assertions", () => {
    const gate = "candidate-order-gate" as const;
    const label = "com.meetyudai.shogi.v1r11-stage-b-fixture";
    const repositoryRoot = "/private/repository";
    const stdoutPath = "/private/job/stdout";
    const stderrPath = "/private/job/stderr";
    const utility = Object.freeze(["/absolute/node", "/absolute/runner.ts"]);
    const runner = Object.freeze({
      pid: 700,
      ppid: 1,
      pgid: 700,
      start_token: "Sun Aug  2 15:00:00 2026",
      state: "S",
      command: utility.join(" "),
    });
    const holder = Object.freeze({
      pid: 701,
      ppid: 700,
      pgid: 700,
      start_token: "Sun Aug  2 15:00:01 2026",
      state: "S",
      command: `/usr/bin/caffeinate -dimsu ${utility.join(" ")}`,
    });
    const plistRaw = buildHalfkp81V1R11StageBOneShotPlist({
      label,
      workingDirectory: repositoryRoot,
      stdoutPath,
      stderrPath,
      utilityArgv: utility,
    });
    const launchctlStdout = Buffer.from(
      [
        `gui/501/${label} = {`,
        "\ttype = LaunchAgent",
        "\tstate = running",
        "\tpid = 700",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const assertionsRaw = [
      "Assertion status system-wide:",
      "   PreventSystemSleep             1",
      "   PreventUserIdleSystemSleep     1",
      "   PreventUserIdleDisplaySleep    1",
      "Listed by owning process:",
      "   pid 701(caffeinate): [0x00000001] PreventSystemSleep named: 'caffeinate command-line tool'",
      "   pid 701(caffeinate): [0x00000002] PreventUserIdleSystemSleep named: 'caffeinate command-line tool'",
      "   pid 701(caffeinate): [0x00000003] PreventUserIdleDisplaySleep named: 'caffeinate command-line tool'",
    ].join("\n");
    const input = {
      gate,
      sequence: 8,
      fingerprint: "b".repeat(64),
      epoch: `/private/authority/preformal-gates/08-${gate}.stage-b-epoch`,
      stageAReceipt: {
        path: "/private/authority/stage-a.json",
        bytes: 1,
        sha256: "a".repeat(64),
        schema: "stage-a-v1",
      },
      label,
      uid: 501,
      repositoryRoot,
      stdoutPath,
      stderrPath,
      runnerUtilityArgv: utility,
      runner,
      holder,
      launchctlStdout,
      launchctlStderr: Buffer.alloc(0),
      plistRaw,
      plistSource: {
        path: "/private/job/job.plist",
        bytes: plistRaw.byteLength,
        sha256: "c".repeat(64),
        dev: 1,
        ino: 2,
        uid: 501,
        mode: 0o600,
        nlink: 1,
      },
      assertionsRaw,
    };
    expect(
      buildHalfkp81V1R11StageBChildLaunchEvidenceForTests(input),
    ).toMatchObject({
      gate,
      runner_pid: 700,
      xpc_service_name: label,
      caffeinate_holder: { pid: 701, parent_runner_pid: 700 },
    });
    expect(() =>
      buildHalfkp81V1R11StageBChildLaunchEvidenceForTests({
        ...input,
        assertionsRaw: assertionsRaw.replace(
          "PreventSystemSleep             1",
          "PreventSystemSleep             0",
        ),
      }),
    ).toThrow(/PreventSystemSleep differs/u);
  });
});
