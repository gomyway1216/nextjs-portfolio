import { describe, expect, it } from "vitest";

import { validateHalfkp81V1R11StageBOsReapEvidenceForTests } from "../../../ml/produce-halfkp81-depth18-v1r11-stage-bc";

function fixture() {
  return {
    cleanup: {
      scheduling_stopped: true,
      engines_started: 2,
      engines_terminated: 2,
      engines_reaped: 2,
      remaining_engine_pids: [],
      children_reaped: true,
      next_job_started: false,
    },
    evidence: {
      observer_pid: 700,
      engine_pids: [701, 702],
      engine_pgids: [700, 700],
      engine_start_tokens: [
        "Sun Aug 2 15:00:00 2026",
        "Sun Aug 2 15:01:00 2026",
      ],
      direct_parent_matches: 2,
      dedicated_process_groups_verified: 2,
      kill_zero_esrch_after_close: 2,
      ps_rows_absent_after_close: 2,
      process_group_members_absent_after_close: 2,
      remaining_descendant_pids: [],
      remaining_process_group_pids: [],
    },
  };
}

describe("HalfKP81 v1r11 Stage-B OS reap evidence", () => {
  it("cross-checks every engine PID against cleanup and every OS proof count", () => {
    const { cleanup, evidence } = fixture();
    expect(
      validateHalfkp81V1R11StageBOsReapEvidenceForTests(
        evidence,
        cleanup,
        "known10-probe",
      ),
    ).toEqual(evidence);
  });

  it.each([
    ["missing ESRCH", { kill_zero_esrch_after_close: 1 }],
    ["missing ps proof", { ps_rows_absent_after_close: 1 }],
    ["wrong parent", { direct_parent_matches: 1 }],
    ["remaining child", { remaining_descendant_pids: [703] }],
    ["duplicate PID", { engine_pids: [701, 701] }],
    ["self-observation", { observer_pid: 701 }],
  ])("rejects %s", (_label, mutation) => {
    const { cleanup, evidence } = fixture();
    expect(() =>
      validateHalfkp81V1R11StageBOsReapEvidenceForTests(
        { ...evidence, ...mutation },
        cleanup,
        "known10-probe",
      ),
    ).toThrow(/OS reap evidence differs/u);
  });
});
