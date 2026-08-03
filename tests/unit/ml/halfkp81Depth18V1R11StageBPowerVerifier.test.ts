import { describe, expect, it } from "vitest";

import {
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityFileIdentity,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import {
  verifyHalfkp81V1R11FrozenStageBPowerLedger,
  type Halfkp81V1R11FrozenPowerEntry,
  type Halfkp81V1R11FrozenPowerObservation,
} from "../../../ml/halfkp81-depth18-v1r11-stage-b-power-verifier";
import {
  verifyHalfkp81V1R11All13StageBPayloadForTests,
  verifyHalfkp81V1R11All13StageBPowerForTests,
} from "../../../ml/verify-halfkp81-depth18-v1r11-staged-authority";
import { HALFKP81_V1R11_KNOWN10_EXPECTED } from "../../../ml/halfkp81-depth18-v1r11-stage-b-engine-gate-core";
import { validateHalfkp81V1R11ExternalPowerGuardianBindingForTests } from "../../../ml/produce-halfkp81-depth18-v1r11-stage-bc";

const SCHEMA = "shogi-halfkp81-depth18-power-continuity-ledger-v1r11";
const DOMAIN = "shogi-halfkp81-depth18-power-continuity-entry-v1r11\0";
const PMSET_ROW =
  "2027-01-15 08:00:00 -0800 Assertions             PID 101(test) Summary";
const TEACHER_PLAN: V1R11AuthorityFileIdentity = Object.freeze({
  path: "/tmp/v1r11/teacher-plan.json",
  bytes: 123,
  sha256: "a".repeat(64),
  schema: "teacher-plan-v1r11",
});
const STAGE_A: V1R11AuthorityFileIdentity = Object.freeze({
  path: "/tmp/v1r11/stage-a.json",
  bytes: 456,
  sha256: "b".repeat(64),
  schema: "stage-a-v1r11",
});
const LAUNCH = Object.freeze({
  path: "/tmp/v1r11/launch.json",
  sha256: "c".repeat(64),
});
const SOURCE_REVISION = "d".repeat(40);
const FINGERPRINT = "e".repeat(64);

function observation(
  observedAtMs: number,
): Halfkp81V1R11FrozenPowerObservation {
  const anchor = Object.freeze({
    boot_session_identity: "boot-1",
    timestamp_utc: "2027-01-15T16:00:00.000Z",
    timezone_offset: "-08:00",
    pmset_event_ordinal: 1,
    last_raw_event_line_sha256: v1r11Sha256(PMSET_ROW),
  });
  return Object.freeze({
    observed_at_ms: observedAtMs,
    timestamp_utc: new Date(observedAtMs).toISOString(),
    power_source: "AC Power",
    battery_percentage: 95,
    runner_pid: 100,
    guardian_pid: 102,
    caffeinate_assertion_holder_pid: 101,
    caffeinate_assertion_holder_parent_runner_pid: 100,
    caffeinate_executable: "/usr/bin/caffeinate",
    caffeinate_argv: [
      "/usr/bin/caffeinate",
      "-dimsu",
      "/usr/bin/node",
      "runner.js",
    ],
    runner_utility_argv: ["/usr/bin/node", "runner.js"],
    launchagent_authority_evidence: LAUNCH,
    preformal_authority_verified_receipt: STAGE_A,
    assertion_owner_caffeinate_pid: 101,
    required_assertions: [
      "PreventSystemSleep",
      "PreventUserIdleSystemSleep",
      "PreventUserIdleDisplaySleep",
    ],
    boot_session_identity: "boot-1",
    pmset_start_anchor: anchor,
    pmset_current_cursor: anchor,
  });
}

function entry(
  kind: "admission" | "sample" | "final",
  observedAtMs: number,
  previous: string | null,
  runFingerprint = FINGERPRINT,
): Halfkp81V1R11FrozenPowerEntry {
  const preimage = Object.freeze({
    schema: SCHEMA,
    status: `${kind}-pass`,
    entry_kind: kind,
    timestamp_utc: new Date(observedAtMs).toISOString(),
    teacher_plan: TEACHER_PLAN,
    source_revision: SOURCE_REVISION,
    run_fingerprint: runFingerprint,
    launchagent_authority_evidence: LAUNCH,
    preformal_authority_verified_receipt: STAGE_A,
    observation: observation(observedAtMs),
    previous_entry_sha256: previous,
  });
  return Object.freeze({
    ...preimage,
    entry_sha256: v1r11Sha256(`${DOMAIN}${v1r11CanonicalJson(preimage)}`),
  }) as Halfkp81V1R11FrozenPowerEntry;
}

function fixture() {
  const admission = entry("admission", 1_800_000_000_000, null);
  const final = entry("final", 1_800_000_001_000, admission.entry_sha256);
  return [admission, final] as const;
}

const CONTEXT = Object.freeze({
  teacherPlan: TEACHER_PLAN,
  sourceRevision: SOURCE_REVISION,
  stageBRunFingerprint: FINGERPRINT,
  stageAReceipt: STAGE_A,
  launchAgentEvidence: LAUNCH,
  pmsetRawRows: [PMSET_ROW],
});

describe("HalfKP81 v1r11 frozen Stage-B power verifier", () => {
  it("independently verifies an exact admission-to-final chain", () => {
    expect(
      verifyHalfkp81V1R11FrozenStageBPowerLedger(fixture(), CONTEXT),
    ).toEqual({
      entries: 2,
      first_entry_sha256: fixture()[0].entry_sha256,
      final_entry_sha256: fixture()[1].entry_sha256,
      runner_pid: 100,
      guardian_pid: 102,
    });
  });

  it("binds the sole external guardian PID to every frozen row and the final verifier", () => {
    const expectedGuardianCommand =
      "/usr/bin/node -r /repo/node_modules/tsx/dist/cjs/index.cjs /repo/ml/halfkp81-depth18-power-continuity-guardian.ts";
    const guardian = Object.freeze({
      pid: 102,
      ppid: 100,
      pgid: 100,
      start_token: "Sun Aug  2 11:00:03 2026",
      state: "S",
      command: expectedGuardianCommand,
    });
    const verified = Object.freeze({ runner_pid: 100, guardian_pid: 102 });
    const verifier = Object.freeze({ guardian_pid: 102 });
    const entries = fixture();
    expect(() =>
      validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(
        "candidate-order-gate",
        {
          observedAuxiliaryRows: [guardian],
          powerEntries: entries,
          verifier,
          independentlyVerified: verified,
          expectedGuardianCommand,
        },
      ),
    ).not.toThrow();

    for (const observedAuxiliaryRows of [[], [guardian, { ...guardian, pid: 103 }]]) {
      expect(() =>
        validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(
          "candidate-order-gate",
          {
            observedAuxiliaryRows,
            powerEntries: entries,
            verifier,
            independentlyVerified: verified,
            expectedGuardianCommand,
          },
        ),
      ).toThrow(/guardian count differs/u);
    }
    expect(() =>
      validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(
        "candidate-order-gate",
        {
          observedAuxiliaryRows: [{ ...guardian, pid: 999 }],
          powerEntries: entries,
          verifier,
          independentlyVerified: verified,
          expectedGuardianCommand,
        },
      ),
    ).toThrow(/guardian binding differs/u);
    expect(() =>
      validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(
        "candidate-order-gate",
        {
          observedAuxiliaryRows: [guardian],
          powerEntries: [
            entries[0],
            {
              ...entries[1],
              observation: { ...entries[1].observation, guardian_pid: 999 },
            },
          ],
          verifier,
          independentlyVerified: verified,
          expectedGuardianCommand,
        },
      ),
    ).toThrow(/guardian binding differs/u);
    expect(() =>
      validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(
        "candidate-order-gate",
        {
          observedAuxiliaryRows: [guardian],
          powerEntries: entries,
          verifier: { guardian_pid: 999 },
          independentlyVerified: verified,
          expectedGuardianCommand,
        },
      ),
    ).toThrow(/guardian binding differs/u);
    for (const command of [
      "/tmp/fake /repo/ml/halfkp81-depth18-power-continuity-guardian.ts",
      `${expectedGuardianCommand} --extra-argument`,
    ]) {
      expect(() =>
        validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(
          "candidate-order-gate",
          {
            observedAuxiliaryRows: [{ ...guardian, command }],
            powerEntries: entries,
            verifier,
            independentlyVerified: verified,
            expectedGuardianCommand,
          },
        ),
      ).toThrow(/guardian binding differs/u);
    }
  });

  it("duplicates the full frozen power proof in the distinct all-13 verifier", () => {
    const gate = "candidate-order-gate" as const;
    const sequence = 8;
    const gateDirectory = "/tmp/v1r11/gates";
    const formalRunFingerprint = "f".repeat(64);
    const epoch = `${gateDirectory}/08-${gate}.stage-b-epoch`;
    const stageBRunFingerprint = v1r11Sha256(
      v1r11CanonicalJson({
        domain: "shogi-halfkp81-depth18-v1r11-stage-b-run-fingerprint-v1",
        gate,
        sequence,
        teacher_plan: TEACHER_PLAN,
        source_revision: SOURCE_REVISION,
        formal_run_fingerprint: formalRunFingerprint,
        stage_a_verified_receipt: STAGE_A,
        stage_b_epoch_namespace: epoch,
        source_02_path: `${gateDirectory}/08-${gate}.source-02.bin`,
        source_03_path: `${gateDirectory}/08-${gate}.source-03.bin`,
      }),
    );
    const admission = entry(
      "admission",
      1_800_000_000_000,
      null,
      stageBRunFingerprint,
    );
    const final = entry(
      "final",
      1_800_000_001_000,
      admission.entry_sha256,
      stageBRunFingerprint,
    );
    const source2 = Object.freeze({
      path: `${gateDirectory}/08-${gate}.source-02.bin`,
      bytes: 123,
      sha256: "1".repeat(64),
      schema:
        "shogi-halfkp81-depth18-yaneura-only-v1r11-candidate-order-gate-primary-source-stage-b-power-ledger-v1",
    });
    const ledger = Object.freeze({
      schema: source2.schema,
      status:
        "preformal-engine-gate-power-continuity-complete-no-formal-authority",
      gate,
      stage_b_run_fingerprint: stageBRunFingerprint,
      stage_b_epoch_namespace: epoch,
      stage_a_verified_receipt: STAGE_A,
      launchagent_evidence: LAUNCH,
      admission_entry: admission,
      samples: Object.freeze([]),
      final_entry: final,
      previous_entry_hash_chain_verified: true,
    });
    const anchor = admission.observation.pmset_start_anchor;
    const receipt = Object.freeze({
      schema:
        "shogi-halfkp81-depth18-yaneura-only-v1r11-candidate-order-gate-primary-source-stage-b-power-receipt-v1",
      status:
        "preformal-engine-gate-power-continuity-independently-verified-no-formal-authority",
      gate,
      stage_b_run_fingerprint: stageBRunFingerprint,
      stage_b_epoch_namespace: epoch,
      stage_a_verified_receipt: STAGE_A,
      stage_b_power_ledger: source2,
      launchagent_evidence: LAUNCH,
      all_engines_reaped: true,
      pmset_interval: Object.freeze({
        start_anchor: anchor,
        end_anchor: final.observation.pmset_current_cursor,
        raw_log_base64: Buffer.from(`${PMSET_ROW}\n`).toString("base64"),
        raw_log_bytes: Buffer.byteLength(`${PMSET_ROW}\n`),
        raw_log_sha256: v1r11Sha256(`${PMSET_ROW}\n`),
      }),
      verifier: Object.freeze({
        entries: 2,
        first_entry_sha256: admission.entry_sha256,
        final_entry_sha256: final.entry_sha256,
        runner_pid: 100,
        guardian_pid: 102,
      }),
      authority: Object.freeze({
        may_execute_preformal_engine_gates: false,
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      }),
    });
    expect(() =>
      verifyHalfkp81V1R11All13StageBPowerForTests(gate, ledger, receipt, {
        teacherPlan: TEACHER_PLAN,
        sourceRevision: SOURCE_REVISION,
        formalRunFingerprint,
        stageA: STAGE_A,
        gateDirectory,
        sequence,
        source2,
      }),
    ).not.toThrow();
    expect(() =>
      verifyHalfkp81V1R11All13StageBPowerForTests(
        gate,
        ledger,
        {
          ...receipt,
          verifier: { ...receipt.verifier, guardian_pid: 999 },
        },
        {
          teacherPlan: TEACHER_PLAN,
          sourceRevision: SOURCE_REVISION,
          formalRunFingerprint,
          stageA: STAGE_A,
          gateDirectory,
          sequence,
          source2,
        },
      ),
    ).toThrow(/power verifier binding differs/u);
    expect(() =>
      verifyHalfkp81V1R11All13StageBPowerForTests(
        gate,
        { ...ledger, final_entry: { ...final, entry_sha256: "0".repeat(64) } },
        receipt,
        {
          teacherPlan: TEACHER_PLAN,
          sourceRevision: SOURCE_REVISION,
          formalRunFingerprint,
          stageA: STAGE_A,
          gateDirectory,
          sequence,
          source2,
        },
      ),
    ).toThrow(/power row 2 differs/u);
    expect(() =>
      verifyHalfkp81V1R11All13StageBPowerForTests(
        gate,
        { ...ledger, schema: "forged-stage-b-power-ledger" },
        receipt,
        {
          teacherPlan: TEACHER_PLAN,
          sourceRevision: SOURCE_REVISION,
          formalRunFingerprint,
          stageA: STAGE_A,
          gateDirectory,
          sequence,
          source2,
        },
      ),
    ).toThrow(/power envelope differs/u);
  });

  it("binds candidate-order semantics to the raw gate result in all-13", () => {
    const source2 = Object.freeze({
      path: "/tmp/v1r11/source-02.bin",
      bytes: 10,
      sha256: "1".repeat(64),
      schema: "power-ledger-v1",
    });
    const source3 = Object.freeze({
      path: "/tmp/v1r11/source-03.bin",
      bytes: 10,
      sha256: "2".repeat(64),
      schema: "power-receipt-v1",
    });
    const digest = "3".repeat(64);
    const raw = Object.freeze({
      parents: 1,
      candidate_set: `sha256:${digest}`,
      normal_candidate_order_digest: digest,
      fallback_candidate_order_digest: digest,
      publication_order_digest: digest,
      mismatches: 0,
      technical_faults: 0,
    });
    const payload = Object.freeze({
      ...raw,
      stage_a_verified_receipt: STAGE_A,
      stage_b_power_ledger: source2,
      stage_b_power_receipt: source3,
    });
    expect(() =>
      verifyHalfkp81V1R11All13StageBPayloadForTests(
        "candidate-order-gate",
        payload,
        raw,
        STAGE_A,
        source2,
        source3,
      ),
    ).not.toThrow();
    expect(() =>
      verifyHalfkp81V1R11All13StageBPayloadForTests(
        "candidate-order-gate",
        { ...payload, parents: 2 },
        { ...raw, parents: 2 },
        STAGE_A,
        source2,
        source3,
      ),
    ).toThrow(/semantics differ/u);
  });

  it("binds known10 to the frozen identities instead of two equal caller arrays", () => {
    const source2 = Object.freeze({
      path: "/tmp/v1r11/source-02.bin",
      bytes: 10,
      sha256: "1".repeat(64),
      schema: "power-ledger-v1",
    });
    const source3 = Object.freeze({
      path: "/tmp/v1r11/source-03.bin",
      bytes: 10,
      sha256: "2".repeat(64),
      schema: "power-receipt-v1",
    });
    const raw = Object.freeze({
      parents: 8,
      moves: 10,
      fixed_expected_identities: HALFKP81_V1R11_KNOWN10_EXPECTED,
      actual_exact_depth18_identities: HALFKP81_V1R11_KNOWN10_EXPECTED,
      mismatches: 0,
      technical_faults: 0,
    });
    const payload = Object.freeze({
      ...raw,
      stage_a_verified_receipt: STAGE_A,
      stage_b_power_ledger: source2,
      stage_b_power_receipt: source3,
    });
    expect(() =>
      verifyHalfkp81V1R11All13StageBPayloadForTests(
        "known10-probe",
        payload,
        raw,
        STAGE_A,
        source2,
        source3,
      ),
    ).not.toThrow();

    const bogus = Array.from({ length: 10 }, (_, index) => ({ index }));
    const forgedRaw = { ...raw, fixed_expected_identities: bogus, actual_exact_depth18_identities: bogus };
    expect(() =>
      verifyHalfkp81V1R11All13StageBPayloadForTests(
        "known10-probe",
        {
          ...forgedRaw,
          stage_a_verified_receipt: STAGE_A,
          stage_b_power_ledger: source2,
          stage_b_power_receipt: source3,
        },
        forgedRaw,
        STAGE_A,
        source2,
        source3,
      ),
    ).toThrow(/semantics differ/u);
  });

  it("rejects mixed-load claims with no active engine or empty observations", () => {
    const source2 = Object.freeze({
      path: "/tmp/v1r11/source-02.bin",
      bytes: 10,
      sha256: "1".repeat(64),
      schema: "power-ledger-v1",
    });
    const source3 = Object.freeze({
      path: "/tmp/v1r11/source-03.bin",
      bytes: 10,
      sha256: "2".repeat(64),
      schema: "power-receipt-v1",
    });
    const activeEngines = [
      ...Array.from({ length: 2 }, (_, index) => ({
        slot_id: `fallback-${String(index + 1).padStart(2, "0")}`,
        class: "fallback",
        hash_mib: 8_192,
        pid: 200 + index,
        ppid: 100,
        pgid: 100,
        start_token: "Sun Aug  2 11:00:01 2026",
        state: "S",
        command: `/tmp/v1r11/${String(index + 1)}/YaneuraOu-authenticated-snapshot`,
        engine_binary_sha256:
          "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        slot_id: `normal-${String(index + 1).padStart(2, "0")}`,
        class: "normal",
        hash_mib: 512,
        pid: 300 + index,
        ppid: 100,
        pgid: 100,
        start_token: "Sun Aug  2 11:00:01 2026",
        state: "S",
        command: `/tmp/v1r11/${String(index + 3)}/YaneuraOu-authenticated-snapshot`,
        engine_binary_sha256:
          "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
      })),
    ];
    const processObservations = [0, 1].map((offset) => ({
      schema:
        "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-mixed-load-process-observation-v1",
      status: "authenticated-live-process-snapshot-no-formal-authority",
      observation_sequence: offset + 1,
      observed_at_utc: `2027-01-15T16:00:0${offset}.000Z`,
      runner_pid: 100,
      runner_pgid: 100,
      runner_start_token: "Sun Aug  2 11:00:00 2026",
      active_engines: activeEngines,
      normal_active_recomputed: 8,
      fallback_active_recomputed: 2,
    }));
    const validRaw = Object.freeze({
      normal_engines: 8,
      normal_hash_mib_each: 512,
      fallback_engines: 2,
      fallback_hash_mib_each: 8_192,
      maximum_normal_active: 8,
      maximum_fallback_active: 2,
      process_observations: processObservations,
      technical_faults: 0,
    });
    expect(() =>
      verifyHalfkp81V1R11All13StageBPayloadForTests(
        "mixed-load-gate",
        {
          ...validRaw,
          stage_a_verified_receipt: STAGE_A,
          stage_b_power_ledger: source2,
          stage_b_power_receipt: source3,
        },
        validRaw,
        STAGE_A,
        source2,
        source3,
      ),
    ).not.toThrow();
    const raw = Object.freeze({
      normal_engines: 8,
      normal_hash_mib_each: 512,
      fallback_engines: 2,
      fallback_hash_mib_each: 8_192,
      maximum_normal_active: 0,
      maximum_fallback_active: 0,
      process_observations: [{}],
      technical_faults: 0,
    });
    expect(() =>
      verifyHalfkp81V1R11All13StageBPayloadForTests(
        "mixed-load-gate",
        {
          ...raw,
          stage_a_verified_receipt: STAGE_A,
          stage_b_power_ledger: source2,
          stage_b_power_receipt: source3,
        },
        raw,
        STAGE_A,
        source2,
        source3,
      ),
    ).toThrow(/semantics differ/u);
    const bogusRaw = {
      ...raw,
      maximum_normal_active: 1,
      maximum_fallback_active: 1,
      process_observations: [{ bogus: true }, { bogus: true }],
    };
    expect(() =>
      verifyHalfkp81V1R11All13StageBPayloadForTests(
        "mixed-load-gate",
        {
          ...bogusRaw,
          stage_a_verified_receipt: STAGE_A,
          stage_b_power_ledger: source2,
          stage_b_power_receipt: source3,
        },
        bogusRaw,
        STAGE_A,
        source2,
        source3,
      ),
    ).toThrow(/keys differ|observation 1 differs/u);
  });

  it("rejects a forged chain digest", () => {
    const [admission, final] = fixture();
    expect(() =>
      verifyHalfkp81V1R11FrozenStageBPowerLedger(
        [admission, { ...final, previous_entry_sha256: "0".repeat(64) }],
        CONTEXT,
      ),
    ).toThrow(/power row 2 differs/u);
  });

  it("rejects a heartbeat gap above the frozen 30-second maximum", () => {
    const admission = fixture()[0];
    const delayed = entry("final", 1_800_000_031_000, admission.entry_sha256);
    expect(() =>
      verifyHalfkp81V1R11FrozenStageBPowerLedger([admission, delayed], CONTEXT),
    ).toThrow(/power continuity differs/u);
  });

  it("rejects a DarkWake or Hibernate-class pmset event inside the sealed interval", () => {
    const admission = fixture()[0];
    const eventRow =
      "2027-01-15 08:00:01 -0800 DarkWake              DarkWake from Normal Sleep";
    const base = observation(1_800_000_001_000);
    const finalObservation = Object.freeze({
      ...base,
      pmset_current_cursor: Object.freeze({
        ...base.pmset_current_cursor,
        timestamp_utc: "2027-01-15T16:00:01.000Z",
        pmset_event_ordinal: 2,
        last_raw_event_line_sha256: v1r11Sha256(eventRow),
      }),
    });
    const preimage = Object.freeze({
      schema: SCHEMA,
      status: "final-pass",
      entry_kind: "final",
      timestamp_utc: finalObservation.timestamp_utc,
      teacher_plan: TEACHER_PLAN,
      source_revision: SOURCE_REVISION,
      run_fingerprint: FINGERPRINT,
      launchagent_authority_evidence: LAUNCH,
      preformal_authority_verified_receipt: STAGE_A,
      observation: finalObservation,
      previous_entry_sha256: admission.entry_sha256,
    });
    const final = Object.freeze({
      ...preimage,
      entry_sha256: v1r11Sha256(`${DOMAIN}${v1r11CanonicalJson(preimage)}`),
    }) as Halfkp81V1R11FrozenPowerEntry;
    expect(() =>
      verifyHalfkp81V1R11FrozenStageBPowerLedger([admission, final], {
        ...CONTEXT,
        pmsetRawRows: [PMSET_ROW, eventRow],
      }),
    ).toThrow(/raw pmset cursor differs/u);
  });

  it("rejects a literal Hibernate pmset event class", () => {
    const admission = fixture()[0];
    const eventRow =
      "2027-01-15 08:00:01 -0800 Hibernate             Entering hibernation";
    const base = observation(1_800_000_001_000);
    const finalObservation = Object.freeze({
      ...base,
      pmset_current_cursor: Object.freeze({
        ...base.pmset_current_cursor,
        timestamp_utc: "2027-01-15T16:00:01.000Z",
        pmset_event_ordinal: 2,
        last_raw_event_line_sha256: v1r11Sha256(eventRow),
      }),
    });
    const preimage = Object.freeze({
      schema: SCHEMA,
      status: "final-pass",
      entry_kind: "final",
      timestamp_utc: finalObservation.timestamp_utc,
      teacher_plan: TEACHER_PLAN,
      source_revision: SOURCE_REVISION,
      run_fingerprint: FINGERPRINT,
      launchagent_authority_evidence: LAUNCH,
      preformal_authority_verified_receipt: STAGE_A,
      observation: finalObservation,
      previous_entry_sha256: admission.entry_sha256,
    });
    const final = Object.freeze({
      ...preimage,
      entry_sha256: v1r11Sha256(`${DOMAIN}${v1r11CanonicalJson(preimage)}`),
    }) as Halfkp81V1R11FrozenPowerEntry;
    expect(() =>
      verifyHalfkp81V1R11FrozenStageBPowerLedger([admission, final], {
        ...CONTEXT,
        pmsetRawRows: [PMSET_ROW, eventRow],
      }),
    ).toThrow(/raw pmset cursor differs/u);
  });
});
