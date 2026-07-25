import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readJson(path: string) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function identity(path: string) {
  const bytes = readFileSync(join(root, path));
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

describe("balanced pure depth-12 result evidence", () => {
  const evidence = readJson(
    "docs/data/shogi-balanced-pure-depth12-result-2026-07-25.json",
  );
  const plan = readJson(
    "ml/protocols/halfkp-alpha050-balanced-pure-depth12-v1-plan.json",
  );

  it("binds the result to the fixed preregistration and exact datasets", () => {
    expect(evidence.preregistration.planId).toBe(plan.plan_id);
    expect(identity(evidence.preregistration.identity.path)).toEqual({
      bytes: evidence.preregistration.identity.bytes,
      sha256: evidence.preregistration.identity.sha256,
    });
    expect(evidence.preregistration.planStatus).toBe("fixed-before-result");
    expect(evidence.preregistration.externallyTimestampedBeforeResult).toBe(
      true,
    );

    const training = evidence.dataset.training;
    const validation = evidence.dataset.validation;
    expect(training.output).toMatchObject({
      rows: plan.deterministic_dataset.training.total_rows,
      selectedBySide: { b: 100_000, w: 100_000 },
      bytes: 102_687_388,
      sha256:
        "8ae60b1c00fc4d3f4990effbe884d33981b1a991c9e0f242c7dae9e06a3026af",
    });
    expect(validation.output).toMatchObject({
      rows: plan.deterministic_dataset.validation.total_rows,
      selectedBySide: { b: 1_484, w: 1_484 },
      bytes: 1_517_817,
      sha256:
        "3e60b42183e1ca1091efca03f794a5ff172cf5eef4fd227ebb568cd839997313",
    });
    expect(training.manifestGates).toEqual({
      bothSidesPresent: true,
      inputIdentityExact: true,
      positionIdsUnique: true,
      selectedSidesEqual: true,
    });
    expect(validation.manifestGates).toEqual(training.manifestGates);

    for (const receipt of [
      training.manifest,
      validation.manifest,
      training.source,
      training.output,
      validation.source,
      validation.output,
    ]) {
      expect(receipt.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(receipt.bytes).toBeGreaterThan(0);
    }
  });

  it("recomputes the static metric deltas without treating them as strength", () => {
    const metrics = evidence.training.staticValidation;
    const expected = {
      loss: metrics.candidate.loss - metrics.baseline.loss,
      maeCp: metrics.candidate.maeCp - metrics.baseline.maeCp,
      pairAccuracy:
        metrics.candidate.pairAccuracy - metrics.baseline.pairAccuracy,
    };
    expect(expected.loss).toBeCloseTo(
      metrics.deltaCandidateMinusBaseline.loss,
      12,
    );
    expect(expected.maeCp).toBeCloseTo(
      metrics.deltaCandidateMinusBaseline.maeCp,
      12,
    );
    expect(expected.pairAccuracy).toBeCloseTo(
      metrics.deltaCandidateMinusBaseline.pairAccuracy,
      12,
    );
    expect(expected.loss).toBeLessThan(0);
    expect(expected.maeCp).toBeLessThan(0);
    expect(expected.pairAccuracy).toBeGreaterThan(0);
    expect(metrics.strengthInterpretation).toBe(
      "diagnostic-only-not-playing-strength-evidence",
    );
    expect(metrics.recordedNonFiniteMetrics).toEqual([
      "curve.epoch0.train_loss",
      "curve.epoch0.val_sibling_pair_acc",
      "curve.epoch0.val_sibling_top1",
      "curve.epoch1.val_sibling_pair_acc",
      "curve.epoch1.val_sibling_top1",
      "checkpoint.val_sibling_pair_acc",
      "checkpoint.val_sibling_top1",
    ]);
    expect(metrics.allRecordedMetricsFinite).toBe(false);
  });

  it("rejects the run because its saved execution contract is not the fixed arm", () => {
    const expected = plan.training.fixed_arm;
    const audit = evidence.training.executionContractAudit;

    expect(audit.planBinding).toEqual({
      expected:
        "ml/protocols/halfkp-alpha050-balanced-pure-depth12-v1-plan.json",
      checkpointArgument: "",
      checkpointTopLevelValue: null,
      passed: false,
    });
    expect(audit.rankWeight).toEqual({
      expected: expected.rank_weight,
      checkpointArgument: 1,
      passed: false,
    });
    expect(audit.policyWeight).toEqual({
      expected: expected.policy_weight,
      checkpointArgument: 0.25,
      passed: false,
    });
    expect(audit.overall).toBe(false);
    expect(evidence.correctness.preregisteredExecutionContractPassed).toBe(
      false,
    );
    expect(evidence.correctness.allRecordedMetricsFinite).toBe(false);
  });

  it("recomputes the reproduced quantization result as a secondary failure", () => {
    const quantization = evidence.quantization;
    expect(quantization.status).toBe("secondary-diagnostic-reproduced-failed");
    expect(quantization.decisionRole).toBe(
      "secondary-only-after-primary-contract-invalid",
    );
    expect(quantization.measurement).toMatchObject({
      dataset: {
        rows: 2_968,
        bytes: 1_517_817,
        sha256:
          "3e60b42183e1ca1091efca03f794a5ff172cf5eef4fd227ebb568cd839997313",
      },
      sampleRule: "entire-balanced-validation-file-in-stored-order",
      verifyN: 2_968,
      exactCommandRecoveredFromSessionLog: true,
      dedicatedRuntimeReceiptAtRunRoot: false,
      independentFullPrecisionRecalculationCompleted: true,
    });

    const meanRatio =
      quantization.candidate.meanAbsoluteErrorCp /
      quantization.base.meanAbsoluteErrorCp;
    const maxRatio =
      quantization.candidate.maxAbsoluteErrorCp /
      quantization.base.maxAbsoluteErrorCp;
    expect(meanRatio).toBeCloseTo(
      quantization.candidateToBaseRatio.meanAbsoluteError,
      15,
    );
    expect(maxRatio).toBeCloseTo(
      quantization.candidateToBaseRatio.maxAbsoluteError,
      15,
    );
    expect(quantization.thresholdsFromPlan).toEqual({
      maximumMeanAbsoluteErrorRatio:
        plan.correctness_gate.quantization.maximum_mean_absolute_error_ratio,
      maximumMaxAbsoluteErrorRatio:
        plan.correctness_gate.quantization.maximum_max_absolute_error_ratio,
    });
    expect(quantization.gates).toEqual({
      meanAbsoluteErrorRatio:
        meanRatio <=
        quantization.thresholdsFromPlan.maximumMeanAbsoluteErrorRatio,
      maximumAbsoluteErrorRatio:
        maxRatio <=
        quantization.thresholdsFromPlan.maximumMaxAbsoluteErrorRatio,
      overall: false,
    });
    expect(
      quantization.roundedDisplayRobustness
        .minimumPossibleMaxRatioFromTwoDecimalDisplay,
    ).toBeGreaterThan(
      quantization.thresholdsFromPlan.maximumMaxAbsoluteErrorRatio,
    );
    expect(quantization.evidenceBoundary).toMatchObject({
      reproducedFromBalancedValidation: true,
      usedForPrimaryDecision: false,
      usedAsSecondaryFailure: true,
    });
    expect(evidence.correctness.quantizationGateEvaluated).toBe(
      "post-invalid-secondary-diagnostic",
    );
    expect(evidence.correctness.quantizationPassed).toBe(false);
  });

  it("pins candidate artifacts while requiring no ignored run files in CI", () => {
    const artifacts = [
      evidence.training.artifacts.bestCheckpoint,
      evidence.training.artifacts.lastCheckpoint,
      evidence.training.artifacts.curve,
      evidence.quantization.base.weights,
      evidence.quantization.candidate.weights,
    ];
    for (const artifact of artifacts) {
      expect(artifact.path).toMatch(/^\$HOME\/\.codex\/shogi-runs\//);
      expect(artifact.bytes).toBeGreaterThan(0);
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect({
      bytes: evidence.training.artifacts.bestCheckpoint.bytes,
      sha256: evidence.training.artifacts.bestCheckpoint.sha256,
    }).toEqual({
      bytes: evidence.training.artifacts.lastCheckpoint.bytes,
      sha256: evidence.training.artifacts.lastCheckpoint.sha256,
    });
    expect(evidence.quantization.base.weights.bytes).toBe(94_656_708);
    expect(evidence.quantization.candidate.weights.bytes).toBe(94_656_708);
    expect(evidence.quantization.base.weights.sha256).not.toBe(
      evidence.quantization.candidate.weights.sha256,
    );
  });

  it("proves the screen did not run and tracked live weights are unchanged", () => {
    expect(evidence.status).toBe(
      "preregistration-contract-invalid-live-unchanged",
    );
    expect(evidence.decision.value).toBe(
      "reject-invalid-execution-contract-no-rerun-no-screen-no-live-change",
    );
    expect(evidence.decision.decisiveGate).toBe(
      "correctness.preregistrationContractAndFiniteMetrics",
    );
    expect(evidence.correctness.preregisteredExecutionContractPassed).toBe(
      false,
    );
    expect(evidence.correctness.torchTorchScriptWasmParity).toBe(
      "not-run-after-contract-and-finite-metric-failure",
    );
    expect(evidence.correctness.overall).toBe(false);
    expect(evidence.screen56).toMatchObject({
      status: "not-run-preregistration-contract-invalid",
      gamesRun: 0,
      openingPairsRun: 0,
      candidateHalfpoints: null,
      strengthConclusion: "not-measured",
    });

    expect(identity(evidence.live.weights.path)).toEqual({
      bytes: evidence.live.weights.bytes,
      sha256: evidence.live.weights.sha256,
    });
    expect(evidence.live).toMatchObject({
      weightsChanged: false,
      productionChanged: false,
      deploymentRun: false,
    });
    expect(evidence.claimBoundary).toEqual({
      staticTeacherApproximationImproved: true,
      playingStrengthMeasured: false,
      playingStrengthGainProved: false,
      playingStrengthRegressionProved: false,
      candidatePromoted: false,
      liveChanged: false,
    });
  });
});
