import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
  HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
  HALFKP81_V1R11_FORMAL_RUN_INTENT_SCHEMA,
  buildHalfkp81V1R11FormalRunIntentV2,
  halfkp81V1R11FormalRunFingerprintV2,
  type Halfkp81V1R11FormalRunIntentInput,
} from "../../../ml/halfkp81-depth18-v1r11-formal-run-intent";
import { independentlyComputeHalfkp81Depth18V1R11ArtifactFingerprintForTests } from "../../../ml/halfkp81-depth18-teacher-artifact-validation";
import { independentlyComputeHalfkp81V1R11StagedFormalRunFingerprintForTests } from "../../../ml/verify-halfkp81-depth18-v1r11-staged-authority";
import { independentlyComputeHalfkp81V1R11PostFormalFingerprintForTests } from "../../../ml/run-halfkp81-depth18-v1r11-postformal-supervisor";
import {
  assertHalfkp81V1R11NoCallerFingerprintForTests,
  assertHalfkp81V1R11OuterProductionReadyForTests,
} from "../../../ml/run-halfkp81-depth18-v1r11-preformal-orchestrator";
import { buildHalfkp81V1R11PlannedLaunchAgentPlistForTests } from "../../../ml/prepare-halfkp81-depth18-v1r11-planned-launchagent";
import { finalizeHalfkp81V1R11ProductionStagedAuthority } from "../../../ml/finalize-halfkp81-depth18-v1r11-staged-authority";
import { assertHalfkp81Depth18V1R11RunnerVerifierFingerprintAgreementForTests } from "../../../ml/halfkp81-depth18-teacher-runner";

function fixture(): Halfkp81V1R11FormalRunIntentInput {
  const identity = (name: string, schema: string) => ({
    path: `/private/tmp/v1r11/${name}`,
    bytes: 10 + name.length,
    sha256: name.charCodeAt(0).toString(16).padStart(2, "0").repeat(32),
    schema,
  });
  return {
    teacherPlan: identity("teacher-plan.json", "teacher-plan-v1r11"),
    selectionJsonl: {
      ...identity("selection.jsonl", "halfkp81-depth18-hard-parent-v2"),
      rows: 8_192,
    },
    selectionManifest: identity(
      "selection-manifest.json",
      "halfkp81-depth18-hard-parent-selection-manifest-v2",
    ),
    sourceRevision: "1".repeat(40),
    engine: {
      binary: identity(
        "yaneuraou",
        HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
      ),
      evalFile: identity(
        "nn.bin",
        HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
      ),
      receipt: identity("engine-receipt.json", "engine-receipt-v1"),
    },
    teacherContract: { depth: 18, candidate_policy: { depth: 16 } },
    candidateContract: { mode: "multipv12-plus-recorded" },
    plannedFinalDescriptor: identity(
      "launchagent.plist.snapshot",
      "application/x-apple-aspen-config-exact-bytes",
    ),
  };
}

describe("HalfKP81 v1r11 formal-run-intent-v2", () => {
  it("builds only the preregistered non-circular payload", () => {
    expect(Object.keys(buildHalfkp81V1R11FormalRunIntentV2(fixture()))).toEqual([
      "schema",
      "teacher_plan",
      "selection_jsonl",
      "selection_manifest",
      "source_revision",
      "engine",
      "teacher",
      "candidate_generation",
      "planned_final_launchagent_descriptor",
    ]);
    expect(buildHalfkp81V1R11FormalRunIntentV2(fixture()).schema).toBe(
      HALFKP81_V1R11_FORMAL_RUN_INTENT_SCHEMA,
    );
  });

  it("is deterministic and changes when the planned descriptor changes", () => {
    const first = fixture();
    const second = fixture();
    expect(halfkp81V1R11FormalRunFingerprintV2(first)).toBe(
      halfkp81V1R11FormalRunFingerprintV2(second),
    );
    expect(
      halfkp81V1R11FormalRunFingerprintV2({
        ...second,
        plannedFinalDescriptor: {
          ...second.plannedFinalDescriptor,
          sha256: "f".repeat(64),
        },
      }),
    ).not.toBe(halfkp81V1R11FormalRunFingerprintV2(first));
  });

  it("matches the independent artifact formula and rejects ignored authority keys", () => {
    const input = fixture();
    expect(
      independentlyComputeHalfkp81Depth18V1R11ArtifactFingerprintForTests(
        input,
      ),
    ).toBe(halfkp81V1R11FormalRunFingerprintV2(input));
    for (const extra of [
      { launchagent_authority: input.plannedFinalDescriptor },
      { preformal_authority_raw_receipt: input.plannedFinalDescriptor },
      { preformal_authority_verified_receipt: input.plannedFinalDescriptor },
    ]) {
      expect(() =>
        independentlyComputeHalfkp81Depth18V1R11ArtifactFingerprintForTests({
          ...input,
          ...extra,
        }),
      ).toThrow(/fields are not exact/u);
    }
    expect(() =>
      independentlyComputeHalfkp81Depth18V1R11ArtifactFingerprintForTests({
        ...input,
        teacherContract: {
          ...input.teacherContract,
          nested: { run_fingerprint: "a".repeat(64) },
        },
      }),
    ).toThrow(/circular authority input/u);
  });

  it("rejects fingerprint-bearing authority contracts", () => {
    const input = fixture();
    expect(() =>
      halfkp81V1R11FormalRunFingerprintV2({
        ...input,
        teacherContract: {
          ...input.teacherContract,
          preformal_authority: { sha256: "a".repeat(64) },
        },
      }),
    ).toThrow(/circular authority input/u);
    expect(() =>
      halfkp81V1R11FormalRunFingerprintV2({
        ...input,
        candidateContract: {
          ...input.candidateContract,
          nested: { run_fingerprint: "b".repeat(64) },
        },
      }),
    ).toThrow(/circular authority input/u);
  });

  it("rejects caller-added identity fields and missing selection row count", () => {
    const input = fixture();
    expect(() =>
      halfkp81V1R11FormalRunFingerprintV2({
        ...input,
        engine: {
          ...input.engine,
          binary: { ...input.engine.binary, mode: 0o755 } as never,
        },
      }),
    ).toThrow(/identity differs/u);
    expect(() =>
      halfkp81V1R11FormalRunFingerprintV2({
        ...input,
        selectionJsonl: { ...input.selectionJsonl, rows: undefined },
      }),
    ).toThrow(/source revision differs/u);
  });

  it("officially rejects extra root/engine authority and circular receipt fields", () => {
    const input = fixture();
    expect(() =>
      buildHalfkp81V1R11FormalRunIntentV2({
        ...input,
        launchagent_evidence: input.plannedFinalDescriptor,
      } as never),
    ).toThrow(/fields are not exact/u);
    expect(() =>
      buildHalfkp81V1R11FormalRunIntentV2({
        ...input,
        engine: { ...input.engine, preformal_authority: "forged" },
      } as never),
    ).toThrow(/fields are not exact/u);
    for (const forbidden of [
      "raw_receipt",
      "launchagent_evidence",
      "artifact_receipt",
      "power_continuity",
      "terminal_fault",
    ]) {
      expect(() =>
        buildHalfkp81V1R11FormalRunIntentV2({
          ...input,
          teacherContract: { ...input.teacherContract, [forbidden]: true },
        }),
      ).toThrow(/circular authority input/u);
    }
  });

  it("all three independent verifiers reject the expanded authority vocabulary", () => {
    const input = fixture();
    const independent = [
      independentlyComputeHalfkp81Depth18V1R11ArtifactFingerprintForTests,
      independentlyComputeHalfkp81V1R11StagedFormalRunFingerprintForTests,
      independentlyComputeHalfkp81V1R11PostFormalFingerprintForTests,
    ];
    for (const forbidden of [
      "launchagent_evidence",
      "launch_agent_evidence",
      "formal_authority",
      "authority_receipt",
    ]) {
      for (const compute of independent) {
        expect(() =>
          compute({
            ...input,
            teacherContract: {
              ...input.teacherContract,
              nested: { [forbidden]: "forged" },
            },
          } as never),
        ).toThrow(/circular authority input/u);
      }
    }
  });

  it("old-self-referential-formula-rejected", () => {
    const input = fixture();
    const official = halfkp81V1R11FormalRunFingerprintV2(input);
    const oldSelfReferential = createHash("sha256")
      .update(
        JSON.stringify({
          ...input,
          launchagent_authority: input.plannedFinalDescriptor,
          preformal_authority: input.teacherPlan,
        }),
      )
      .digest("hex");
    expect(() =>
      assertHalfkp81Depth18V1R11RunnerVerifierFingerprintAgreementForTests(
        official,
        oldSelfReferential,
      ),
    ).toThrow(/independent all-13 fingerprint differ/u);
    expect(() =>
      assertHalfkp81Depth18V1R11RunnerVerifierFingerprintAgreementForTests(
        "d76ec02ecd721260c380c2a421b6bc7e9d689f37eaf8279e83d78b381390eba7",
        "d76ec02ecd721260c380c2a421b6bc7e9d689f37eaf8279e83d78b381390eba7",
      ),
    ).toThrow(/forbidden old identity/u);
  });

  it("runner-and-independent-verifier-v2-recomputation-mismatch-rejected", () => {
    const official = halfkp81V1R11FormalRunFingerprintV2(fixture());
    expect(() =>
      assertHalfkp81Depth18V1R11RunnerVerifierFingerprintAgreementForTests(
        official,
        official,
      ),
    ).not.toThrow();
    expect(() =>
      assertHalfkp81Depth18V1R11RunnerVerifierFingerprintAgreementForTests(
        official,
        "e".repeat(64),
      ),
    ).toThrow(/independent all-13 fingerprint differ/u);
  });

  it("keeps production hard-locked and rejects caller-authored fingerprints", () => {
    expect(() => assertHalfkp81V1R11OuterProductionReadyForTests()).toThrow(
      /remains locked/u,
    );
    expect(() =>
      assertHalfkp81V1R11NoCallerFingerprintForTests({
        runFingerprint: "b".repeat(64),
      }),
    ).toThrow(/caller-authored formal run fingerprint is forbidden/u);
  });

  it("rejects a fingerprint-bearing planned-descriptor input", () => {
    expect(() =>
      buildHalfkp81V1R11PlannedLaunchAgentPlistForTests({
        label: "com.example.v1r11",
        repositoryRoot: "/private/repository",
        nodePath: "/private/node",
        stdoutPath: "/private/stdout",
        stderrPath: "/private/stderr",
        runFingerprint: "f".repeat(64),
      } as never),
    ).toThrow(/input keys differ/u);
  });

  it("makes the production finalizer independently reject a mismatched intent", async () => {
    await expect(
      finalizeHalfkp81V1R11ProductionStagedAuthority({
        repositoryRoot: "/does/not/exist",
        teacherPlan: fixture().teacherPlan as never,
        sourceRevision: "1".repeat(40),
        runFingerprint: "f".repeat(64),
        authorityDirectory: { path: "/does/not/exist" } as never,
        gateDirectory: { path: "/does/not/exist/gates" } as never,
        stageAReceipt: fixture().teacherPlan as never,
        ledger: fixture().teacherPlan as never,
        launchAgentAuthority: fixture().teacherPlan as never,
        formalRunIntent: fixture(),
      }),
    ).rejects.toThrow(/formal-run-intent-v2 differs/u);
  });
});
