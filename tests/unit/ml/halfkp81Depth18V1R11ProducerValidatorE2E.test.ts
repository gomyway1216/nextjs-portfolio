import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildHalfkp81Depth18V1R11FrozenEnvironmentFaultForTests,
  buildHalfkp81Depth18V1R11FrozenRawReceiptForTests,
  buildHalfkp81Depth18V1R11FrozenWorkHeaderForTests,
} from "../../../ml/halfkp81-depth18-teacher-runner";
import {
  canonicalHalfkp81Depth18Json,
  validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests,
} from "../../../ml/halfkp81-depth18-teacher-artifact-validation";

const REVISION = "a".repeat(40);
const SHA = "b".repeat(64);
const FINGERPRINT = "c".repeat(64);

function identity(name: string, schema: string) {
  return Object.freeze({
    path: `/private/tmp/v1r11/${name}`,
    bytes: 1,
    sha256: SHA,
    schema,
  });
}

const plan = identity(
  "teacher-plan.json",
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
);
const launch = identity(
  "launchagent.json",
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
);
const preformal = identity(
  "preformal-verified.json",
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11",
);
const preformalLedger = identity(
  "preformal.jsonl",
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
);
const preformalRaw = identity(
  "preformal-raw.json",
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11",
);
const powerLedger = identity(
  "power.jsonl",
  "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
);
const powerReceipt = identity(
  "power-receipt.json",
  "shogi-halfkp81-depth18-power-continuity-receipt-v1r11",
);

function admissionEntry() {
  return Object.freeze({
    schema: "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
    status: "admission-pass",
    entry_kind: "admission",
    timestamp_utc: "2026-08-02T12:00:00.000Z",
    teacher_plan: plan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    launchagent_authority_evidence: launch,
    preformal_authority_verified_receipt: preformal,
    observation: {},
    environment_fault: null,
    previous_entry_sha256: null,
    entry_sha256: SHA,
  });
}

async function fileRoundTrip(name: string, value: unknown): Promise<unknown> {
  const directory = await mkdtemp(path.join(tmpdir(), "v1r11-producer-e2e-"));
  const file = path.join(directory, name);
  await writeFile(file, `${canonicalHalfkp81Depth18Json(value)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return JSON.parse(await readFile(file, "utf8"));
}

describe("HalfKP81 depth18 v1r11 producer to validator file contract", () => {
  it("round-trips the frozen success header and raw receipt", async () => {
    const header = await fileRoundTrip(
      "teacher-work-header.json",
      buildHalfkp81Depth18V1R11FrozenWorkHeaderForTests({
        teacherPlan: plan,
        sourceRevision: REVISION,
        runFingerprint: FINGERPRINT,
        launchAgentAuthority: launch,
        verifiedPreformalAuthority: preformal,
        powerAdmissionEntry: admissionEntry(),
        openedAtUtc: "2026-08-02T12:00:00.000Z",
      }),
    );
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
        "teacher-work-header",
        header,
      ),
    ).not.toThrow();

    const datasetSchema = "canonical-shogi-sibling-v1-jsonl-one-lf-per-row";
    const raw = await fileRoundTrip(
      "teacher-receipt.json",
      buildHalfkp81Depth18V1R11FrozenRawReceiptForTests({
        teacherPlan: plan,
        sourceRevision: REVISION,
        runFingerprint: FINGERPRINT,
        teacherWork: identity(
          "teacher-work.jsonl",
          "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11",
        ),
        teacherOutput: {
          fit: identity("fit.jsonl", datasetSchema),
          tune: identity("tune.jsonl", datasetSchema),
          sealed: identity("sealed.jsonl", datasetSchema),
        },
        preformalLedger,
        preformalRawReceipt: preformalRaw,
        verifiedPreformalAuthority: preformal,
        launchAgentAuthority: launch,
        powerLedger,
        powerReceipt,
        finalizer: {
          source_revision: REVISION,
          entrypoint: "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
          dependency_closure: [
            {
              path: "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
              bytes: 1,
              sha256: SHA,
            },
          ],
        },
      }),
    );
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
        "raw-teacher-receipt",
        raw,
      ),
    ).not.toThrow();
    expect((raw as Record<string, unknown>).authority).toEqual({
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    });
  });

  it("round-trips the non-circular environment-fault closure", async () => {
    const input = {
      teacherPlan: plan,
      sourceRevision: REVISION,
      runFingerprint: FINGERPRINT,
      verifiedPreformalAuthority: preformal,
      launchAgentAuthority: launch,
      processCleanupEvidence: identity(
        "environment-process-cleanup-evidence.json",
        "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11",
      ),
      processCleanup: {
        scheduling_stopped: true as const,
        engines_terminated: 2,
        engines_reaped: 2,
        remaining_engine_pids: [] as number[],
      },
      powerLedger,
      powerReceipt,
      faultPreimageSha256: SHA,
      fault: { kind: "environment-continuity", message: "AC lost" },
      faultedAtUtc: "2026-08-02T12:00:30.000Z",
    };
    const fault = await fileRoundTrip(
      "teacher-terminal-fault.json",
      buildHalfkp81Depth18V1R11FrozenEnvironmentFaultForTests(input),
    );
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
        "environment-terminal-fault",
        fault,
      ),
    ).not.toThrow();
    expect(() =>
      buildHalfkp81Depth18V1R11FrozenEnvironmentFaultForTests({
        ...input,
        processCleanup: {
          ...input.processCleanup,
          engines_reaped: 1,
        },
      }),
    ).toThrow(/rich cleanup evidence is required/u);
    expect(() =>
      buildHalfkp81Depth18V1R11FrozenEnvironmentFaultForTests({
        ...input,
        processCleanupEvidence: undefined,
      }),
    ).toThrow(/rich cleanup evidence is required/u);
  });
});
