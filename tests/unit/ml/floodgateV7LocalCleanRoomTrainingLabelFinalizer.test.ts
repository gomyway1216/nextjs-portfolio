import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  type FloodgateTeacherStageLease,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
  FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
} from "../../../ml/floodgate-v7-clean-room-teacher-runner";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FloodgateV7LocalCleanRoomTrainingLabelFinalizerError,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CONTRACT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_PACKAGE_SCRIPT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_TEST_STATUS,
  runFloodgateV7LocalCleanRoomTrainingLabelFinalizer,
  runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests,
  type FloodgateV7LocalCleanRoomTrainingLabelFinalizerDependencies,
} from "../../../ml/floodgate-v7-local-clean-room-training-label-finalizer";
import {
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
} from "../../../ml/floodgate-v7-local-clean-room-teacher-runner";
import {
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
} from "../../../ml/floodgate-v7-production-parent-coordinator";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const HMAC_DOMAIN =
  "shogi-floodgate-v7-local-clean-room-finalizer-handoff-v1\0";
const KEY = Buffer.alloc(32, 0x4a);
const RUN_ID = "1".repeat(64);
const WORK_SHA256 = "c".repeat(64);
const PUBLICATION_PARENT = path.join(
  FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
  "publication",
);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function runBinding() {
  return {
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: {
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    },
    producer_control: {
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms:
        FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
      abort_drain_ms: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    },
    stable_runtime_receipt_sha256: "a".repeat(64),
    teacher_usi_runtime_receipt_sha256: "b".repeat(64),
  };
}

type Mutable<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Mutable<U>[]
        : T extends object
          ? { -readonly [K in keyof T]: Mutable<T[K]> }
          : T;

type MutableHandoff = Mutable<ReturnType<typeof handoffPayload>>;

function handoffPayload() {
  const binding = runBinding();
  return {
    schema: "shogi-floodgate-v7-local-clean-room-finalizer-handoff-v1",
    status: "sealed-final-ready-for-separate-local-finalizer",
    claim_boundary:
      "validated-three-gate-local-stream-fixed-current-user-deployment-checkpoint-key-private-handoff-integrity-key-exact-run-binding-and-sealed-work-binding-not-finalized-label-training-weight-match-live-or-strength-evidence",
    run_id: RUN_ID,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    integrity_key_id: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
    local_integrity_key_filename: "local-integrity-key.bin",
    local_integrity_key_is_external_credential: false,
    run_binding: binding,
    run_binding_sha256: createHash("sha256")
      .update(canonicalJson(binding))
      .digest("hex"),
    stage: {
      basename: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
      parent_dev: "10",
      parent_ino: "11",
      dev: "12",
      ino: "13",
    },
    work: {
      filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      bytes: 12_345,
      sha256: WORK_SHA256,
      parents: 24_000,
      records: 47_500,
      resumed_parents: 500,
      sealed: true,
    },
    input: {
      verifier_revision: FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
      role: "training",
      parents: 24_000,
    },
    completion_receipts: [
      {
        gate: "durable-prefix-100",
        filename: "completion-prefix-100.json",
        bytes: 100,
        sha256: "d".repeat(64),
      },
      {
        gate: "durable-prefix-500",
        filename: "completion-prefix-500.json",
        bytes: 200,
        sha256: "e".repeat(64),
      },
      {
        gate: "sealed-final-24000",
        filename: "completion-final-24000.json",
        bytes: 300,
        sha256: "f".repeat(64),
      },
    ],
    requirements: {
      separate_explicit_finalizer_command_required: true,
      same_sealed_work_and_key_binding_required: true,
      prefix_100_or_500_finalization_forbidden: true,
    },
    external_services: {
      network: false,
      aws: false,
      firebase_gcp: false,
      vercel: false,
    },
    nonclaims: {
      labels_finalized: false,
      optimizer_training: false,
      weight: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
    },
  };
}

function signedHandoff(
  mutate?: (value: MutableHandoff) => void,
  corruptMac = false,
): Buffer {
  const payload = handoffPayload();
  mutate?.(payload);
  const mac = createHmac("sha256", KEY)
    .update(HMAC_DOMAIN)
    .update(canonicalJson(payload))
    .digest("hex");
  return Buffer.from(
    `${canonicalJson({
      ...payload,
      handoff_mac: corruptMac ? `0${mac.slice(1)}` : mac,
    })}\n`,
  );
}

function lease(
  close: () => Promise<void> = vi.fn(async (): Promise<void> => undefined),
) {
  return Object.freeze({
    receipt: Object.freeze({
      contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      trust_boundary: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
      parent_identity: Object.freeze({ dev: BigInt(10), ino: BigInt(11) }),
      stage_identity: Object.freeze({ dev: BigInt(12), ino: BigInt(13) }),
      lease_identity: Object.freeze({ dev: BigInt(14), ino: BigInt(15) }),
      stage_basename: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
      destination_basename:
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
      allowed_entries: FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
    }),
    stageRoot: path.join(
      PUBLICATION_PARENT,
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
    ),
    destinationRoot: path.join(
      PUBLICATION_PARENT,
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
    ),
    close,
  }) as Readonly<FloodgateTeacherStageLease>;
}

function finalization(workSha256 = WORK_SHA256) {
  const file = (filename: string, bytes: number, sha256: string) =>
    Object.freeze({
      filename,
      dev: "20",
      ino: "21",
      mode: "0600",
      bytes,
      sha256,
    });
  return Object.freeze({
    contract:
      "shogi-floodgate-v7-training-label-finalization-publication-core-v1",
    status:
      "production-authenticated-sealed-scan-plan-exact-prefix-content-finalized-exclusively-published-and-destination-reverified",
    claim_boundary: "synthetic-test-receipt",
    execution_boundary:
      "production-fixed-authenticated-sealed-scan-plan-finalizer-and-exclusive-private-directory-publication",
    content: Object.freeze({
      work: file(
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        12_345,
        workSha256,
      ),
      train: file("train.jsonl", 40_000, "2".repeat(64)),
      result: file("result.json", 2_000, "3".repeat(64)),
      manifest: file("manifest.json", 1_000, "4".repeat(64)),
      parents: 24_000,
      training_records: 47_500,
      consumer_postflight_sha256: "5".repeat(64),
    }),
    publication: Object.freeze({
      stage_basename: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
      destination_basename:
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
    }),
    postpublication: Object.freeze({
      destination_reopened: true,
      exact_entries: Object.freeze([
        "manifest.json",
        "result.json",
        "train.jsonl",
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      ]),
      content_reverified: true,
    }),
  });
}

function operations(settings?: {
  readonly onAuthorize?: () => void | Promise<void>;
  readonly consumeFailure?: boolean;
  readonly postflightFailure?: boolean;
  readonly createFailure?: boolean;
  readonly resultWorkSha256?: string;
}) {
  const events: string[] = [];
  const close = vi.fn(async () => {
    events.push("close");
  });
  const authorizeStage = vi.fn(async () => {
    events.push("authorize");
    await settings?.onAuthorize?.();
    return lease(close);
  });
  const consumeRowsAndPostflight = vi.fn(
    async (_options: unknown, consume: (value: never) => Promise<void>) => {
      events.push("consume");
      if (settings?.consumeFailure)
        throw new Error("synthetic consume failure");
      await consume(Object.freeze({}) as never);
      if (settings?.postflightFailure)
        throw new Error("synthetic postflight failure");
      return Object.freeze({});
    },
  );
  const createPlan = vi.fn(async (..._arguments: readonly unknown[]) => {
    events.push("create-plan");
    if (settings?.createFailure) throw new Error("synthetic create failure");
    return Object.freeze({ plan: true });
  });
  const discardPlan = vi.fn(async () => {
    events.push("discard");
  });
  const finalize = vi.fn(async () => {
    events.push("finalize");
    return finalization(settings?.resultWorkSha256);
  });
  return {
    events,
    close,
    authorizeStage,
    consumeRowsAndPostflight,
    createPlan,
    discardPlan,
    finalize,
    dependencies: Object.freeze({
      authorizeStage,
      consumeRowsAndPostflight,
      createPlan,
      discardPlan,
      finalize,
    }) as unknown as Readonly<
      FloodgateV7LocalCleanRoomTrainingLabelFinalizerDependencies<
        Readonly<{ plan: true }>
      >
    >,
  };
}

describe("Floodgate v7 Mac-local clean-room training-label finalizer", () => {
  it("composes exact stage, sealed scan plan, postflight, and finalizer without private disclosure", async () => {
    const fixture = operations();
    const bytes = signedHandoff();
    const receipt =
      await runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
        KEY,
        bytes,
        fixture.dependencies,
      );

    expect(fixture.events).toEqual([
      "authorize",
      "consume",
      "create-plan",
      "finalize",
    ]);
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CONTRACT,
      status:
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_TEST_STATUS,
      execution_boundary: "test-only-injected-production-api-composition",
      operational_evidence: false,
      output: {
        parents: 24_000,
        training_records: 47_500,
        work: { bytes: 12_345, sha256: WORK_SHA256 },
      },
      verification: {
        handoff_mac_revalidated: true,
        exact_run_binding_digest_revalidated: true,
        fixed_deployment_key_revalidated: true,
        fixed_stage_identity_revalidated: true,
        exact_sealed_work_revalidated: true,
        durable_one_shot_replay_claimed: false,
        sealed_scanner_and_finalizer_composed: true,
        destination_content_reverified: true,
      },
    });
    expect(receipt.output.work).toEqual({
      bytes: 12_345,
      sha256: WORK_SHA256,
    });
    expect(Object.values(receipt.nonclaims)).toEqual(
      Array(Object.keys(receipt.nonclaims).length).fill(false),
    );
    const output = JSON.stringify(receipt);
    expect(output).not.toContain(RUN_ID);
    expect(output).not.toContain(FLOODGATE_V7_DEPLOYMENT_KEY_ID);
    expect(output).not.toContain("finalizer-handoff.json");
    expect(output).not.toContain(FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT);

    const createArguments = fixture.createPlan.mock.calls[0]!;
    expect(createArguments[2]).toEqual(runBinding());
    expect(createArguments[3]).toEqual({
      runId: RUN_ID,
      keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      work: { bytes: 12_345, sha256: WORK_SHA256 },
    });
    expect(fixture.close).not.toHaveBeenCalled();
    expect(fixture.discardPlan).not.toHaveBeenCalled();
    bytes.fill(0);
  });

  it.each([
    ["wrong MAC", undefined, true],
    [
      "wrong deployment key",
      (value: MutableHandoff) => {
        value.key_id = "wrong-key";
      },
      false,
    ],
    [
      "wrong run-binding digest",
      (value: MutableHandoff) => {
        value.run_binding_sha256 = "0".repeat(64);
      },
      false,
    ],
    [
      "wrong run-binding plan",
      (value: MutableHandoff) => {
        value.run_binding.plan.sha256 = "0".repeat(64);
        value.run_binding_sha256 = createHash("sha256")
          .update(canonicalJson(value.run_binding))
          .digest("hex");
      },
      false,
    ],
    [
      "wrong stage",
      (value: MutableHandoff) => {
        value.stage.basename = "near-stage";
      },
      false,
    ],
    [
      "prefix 100",
      (value: MutableHandoff) => {
        value.work.parents = 100;
      },
      false,
    ],
    [
      "prefix 500",
      (value: MutableHandoff) => {
        value.work.parents = 500;
      },
      false,
    ],
    [
      "unsealed work",
      (value: MutableHandoff) => {
        value.work.sealed = false;
      },
      false,
    ],
    [
      "wrong resume point",
      (value: MutableHandoff) => {
        value.work.resumed_parents = 100;
      },
      false,
    ],
    [
      "wrong input role",
      (value: MutableHandoff) => {
        value.input.role = "selection";
      },
      false,
    ],
    [
      "reordered completion",
      (value: MutableHandoff) => {
        value.completion_receipts[2]!.gate = "durable-prefix-500";
      },
      false,
    ],
    [
      "cloud claim",
      (value: MutableHandoff) => {
        value.external_services.aws = true;
      },
      false,
    ],
    [
      "relaxed requirement",
      (value: MutableHandoff) => {
        value.requirements.prefix_100_or_500_finalization_forbidden = false;
      },
      false,
    ],
    [
      "invented training claim",
      (value: MutableHandoff) => {
        value.nonclaims.optimizer_training = true;
      },
      false,
    ],
  ])(
    "rejects authenticated-shape adversary: %s",
    async (_label, mutate, corrupt) => {
      const fixture = operations();
      await expect(
        runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
          KEY,
          signedHandoff(mutate, corrupt),
          fixture.dependencies,
        ),
      ).rejects.toMatchObject({
        name: "FloodgateV7LocalCleanRoomTrainingLabelFinalizerError",
        phase: "handoff",
        publication_may_have_occurred: false,
        stage_or_lease_may_remain: false,
        sensitive_values_disclosed: false,
      });
      expect(fixture.authorizeStage).not.toHaveBeenCalled();
    },
  );

  it("rejects noncanonical, duplicate-key, extra-field, and wrong-key bytes before stage authorization", async () => {
    const cases = [
      Buffer.from(
        `${JSON.stringify({ ...handoffPayload(), handoff_mac: "0".repeat(64) })}\n`,
      ),
      Buffer.from('{"schema":"one","schema":"two"}\n'),
      Buffer.from(
        `${canonicalJson({
          ...handoffPayload(),
          unexpected: true,
          handoff_mac: "0".repeat(64),
        })}\n`,
      ),
    ];
    for (const bytes of cases) {
      const fixture = operations();
      await expect(
        runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
          KEY,
          bytes,
          fixture.dependencies,
        ),
      ).rejects.toBeInstanceOf(
        FloodgateV7LocalCleanRoomTrainingLabelFinalizerError,
      );
      expect(fixture.authorizeStage).not.toHaveBeenCalled();
    }
    const fixture = operations();
    await expect(
      runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
        Buffer.alloc(32, 0x22),
        signedHandoff(),
        fixture.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "handoff" });
    expect(fixture.authorizeStage).not.toHaveBeenCalled();
  });

  it("detects a handoff mutation between initial validation and stage-bound revalidation", async () => {
    const bytes = signedHandoff();
    const fixture = operations({
      onAuthorize: () => {
        bytes[20] = bytes[20]! ^ 1;
      },
    });
    await expect(
      runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
        KEY,
        bytes,
        fixture.dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "stage-binding",
      publication_may_have_occurred: false,
      stage_or_lease_may_remain: false,
    });
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.createPlan).not.toHaveBeenCalled();
  });

  it("closes before composition failure, discards a minted plan, and treats post-finalizer mismatch as publication-sensitive", async () => {
    const consumeFailure = operations({ consumeFailure: true });
    await expect(
      runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
        KEY,
        signedHandoff(),
        consumeFailure.dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "training-consumer",
      publication_may_have_occurred: false,
      stage_or_lease_may_remain: false,
    });
    expect(consumeFailure.close).toHaveBeenCalledOnce();

    const createFailure = operations({ createFailure: true });
    await expect(
      runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
        KEY,
        signedHandoff(),
        createFailure.dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "plan-composition",
      publication_may_have_occurred: false,
      stage_or_lease_may_remain: true,
    });
    expect(createFailure.close).not.toHaveBeenCalled();
    expect(createFailure.discardPlan).not.toHaveBeenCalled();

    const postflightFailure = operations({ postflightFailure: true });
    await expect(
      runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
        KEY,
        signedHandoff(),
        postflightFailure.dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "training-consumer",
      publication_may_have_occurred: false,
      stage_or_lease_may_remain: false,
    });
    expect(postflightFailure.events).toEqual([
      "authorize",
      "consume",
      "create-plan",
      "discard",
    ]);
    expect(postflightFailure.discardPlan).toHaveBeenCalledOnce();
    expect(postflightFailure.close).not.toHaveBeenCalled();

    const badResult = operations({ resultWorkSha256: "9".repeat(64) });
    await expect(
      runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
        KEY,
        signedHandoff(),
        badResult.dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "receipt",
      publication_may_have_occurred: true,
    });
    expect(badResult.discardPlan).not.toHaveBeenCalled();
    expect(badResult.close).not.toHaveBeenCalled();
  });

  it("durably rejects the same authenticated handoff in a fresh process", async () => {
    const createdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "floodgate-v7-finalizer-claim-"),
    );
    const localStateRoot = fs.realpathSync(createdRoot);
    fs.chmodSync(localStateRoot, 0o700);
    const moduleName =
      "./ml/floodgate-v7-local-clean-room-training-label-finalizer";
    const exportName =
      "claimFloodgateV7LocalCleanRoomTrainingLabelHandoffOnceCoreForTests";
    const childSource = [
      `const operation = require(${JSON.stringify(moduleName)})[${JSON.stringify(exportName)}];`,
      "void operation(process.argv[1], process.argv[2], process.argv[3], process.argv[4])",
      "  .then(() => process.exit(0), () => process.exit(23));",
    ].join("\n");
    const invoke = () =>
      spawnSync(
        process.execPath,
        [
          "-r",
          "tsx/cjs",
          "-e",
          childSource,
          localStateRoot,
          "6".repeat(64),
          "7".repeat(64),
          WORK_SHA256,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
        },
      );
    try {
      const first = invoke();
      const replay = invoke();
      expect({
        firstStatus: first.status,
        firstSignal: first.signal,
        firstStderr: first.stderr,
        replayStatus: replay.status,
        replaySignal: replay.signal,
        replayStderr: replay.stderr,
      }).toEqual({
        firstStatus: 0,
        firstSignal: null,
        firstStderr: "",
        replayStatus: 23,
        replaySignal: null,
        replayStderr: "",
      });
      const entries = fs.readdirSync(localStateRoot);
      expect(entries).toEqual(["finalizer-handoff.claimed.json"]);
      const claimPath = path.join(localStateRoot, entries[0]!);
      expect(fs.statSync(claimPath).mode & 0o7777).toBe(0o600);
      const claim = fs.readFileSync(claimPath, "utf8");
      expect(claim.endsWith("\n")).toBe(true);
      expect(claim).not.toContain("6".repeat(64));
      expect(JSON.parse(claim)).toEqual({
        schema:
          "shogi-floodgate-v7-local-clean-room-finalizer-handoff-one-shot-claim-v1",
        status: "durably-consumed-before-stage-authorization",
        handoff_mac_sha256: createHash("sha256")
          .update("6".repeat(64))
          .digest("hex"),
        run_binding_sha256: "7".repeat(64),
        work_sha256: WORK_SHA256,
      });
    } finally {
      fs.rmSync(localStateRoot, { recursive: true, force: true });
    }
  });

  it("rejects non-command and simulated non-Mac operational entry before private capture", async () => {
    await expect(
      runFloodgateV7LocalCleanRoomTrainingLabelFinalizer(),
    ).rejects.toMatchObject({
      phase: "capture",
      publication_may_have_occurred: false,
      stage_or_lease_may_remain: false,
    });

    const moduleName =
      "./ml/floodgate-v7-local-clean-room-training-label-finalizer";
    const childSource = [
      'Object.defineProperty(process, "platform", { value: "linux" });',
      `const operation = require(${JSON.stringify(moduleName)}).runFloodgateV7LocalCleanRoomTrainingLabelFinalizer;`,
      "void operation().then(() => process.exit(29), (error) =>",
      '  process.exit(error?.phase === "capture" ? 0 : 31));',
    ].join("\n");
    const child = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", childSource],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect({
      status: child.status,
      signal: child.signal,
      stderr: child.stderr,
    }).toEqual({ status: 0, signal: null, stderr: "" });
  });

  it("keeps the operational command argumentless, local-only, and import-inert", async () => {
    await expect(
      Reflect.apply(runFloodgateV7LocalCleanRoomTrainingLabelFinalizer, null, [
        "unexpected",
      ]),
    ).rejects.toMatchObject({ phase: "capture" });

    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "floodgate-v7-local-clean-room-training-label-finalizer.ts",
      ),
      "utf8",
    );
    const entry = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "run-floodgate-v7-local-clean-room-training-label-finalizer.ts",
      ),
      "utf8",
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(source).toContain("authorizeFloodgateTeacherStage");
    expect(source).toContain(
      "withVerifiedPinnedFloodgateTrainingRowsAndPostflight",
    );
    expect(source).toContain("createFloodgateV7TrainingLabelFinalizationPlan");
    expect(source).toContain("finalizeAndPublishFloodgateV7TrainingLabels");
    expect(source).toContain("fs.constants.O_EXCL");
    expect(source).toContain('process.platform !== "darwin"');
    expect(source).not.toContain("operationalHandoffMacs");
    expect(source).not.toMatch(
      /from ["'][^"']*(?:aws|firebase|vercel|network|train\.py)/i,
    );
    expect(entry).toContain("if (require.main === module)");
    expect(
      packageJson.scripts[
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_PACKAGE_SCRIPT
      ],
    ).toBe(
      "node -r tsx/cjs ml/run-floodgate-v7-local-clean-room-training-label-finalizer.ts",
    );
  });
});
