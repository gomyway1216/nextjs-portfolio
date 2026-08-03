import { describe, expect, it } from "vitest";

import { Halfkp81V1R11PreformalStageFailure } from "../../../ml/halfkp81-depth18-v1r11-preformal-stage-failure";

describe("HalfKP81 v1r11 typed preformal stage failure", () => {
  it("exposes the frozen outer-orchestrator fields without claiming cleanup", () => {
    const failure = new Halfkp81V1R11PreformalStageFailure({
      phase: "stage-b-power",
      gate: "known10-probe",
      sequence: 9,
      runnerState: "active",
      failure: new TypeError("engine transcript differs"),
      artifacts: {
        ledgerPrefix: null,
        lastGateReceipt: null,
        engineGateVerifiedReceipt: null,
        launchAgentAuthority: null,
        runnerIdentity: { pid: 101, pgid: 101, lstart: "Sun Aug  2 17:00:00 2026" },
        partialArtifacts: [],
      },
    });

    expect({
      phase: failure.phase,
      gate: failure.gate,
      sequence: failure.sequence,
      runner_state: failure.runner_state,
      error: failure.error,
    }).toEqual({
      phase: "stage-b-power",
      gate: "known10-probe",
      sequence: 9,
      runner_state: "active",
      error: {
        kind: "TypeError",
        message: "engine transcript differs",
        exit_code: null,
        signal: null,
      },
    });
    expect("process_cleanup" in failure).toBe(false);
    expect("cleanup_evidence" in failure).toBe(false);
    expect(Object.isFrozen(failure.error)).toBe(true);
    expect(Object.isFrozen(failure.artifacts)).toBe(true);
    expect(Object.isFrozen(failure.artifacts.partialArtifacts)).toBe(true);
  });
});
