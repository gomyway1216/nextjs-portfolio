import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  type FloodgateTeacherStageLease,
} from "../../../ml/floodgate-teacher-stage-authorization";
import { FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA } from "../../../ml/floodgate-training-row-consumer";
import {
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
} from "../../../ml/floodgate-v7-production-parent-coordinator";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_STATUS,
  FloodgateV7TrainingLabelProductionOwnerError,
  inspectFloodgateV7TrainingLabelProductionStageCoreForTests,
  runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests,
  type FloodgateV7TrainingLabelProductionOwnerCoreDependencies,
} from "../../../ml/floodgate-v7-training-label-production-owner";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_IN_PROGRESS_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  type FloodgateV7TeacherCheckpointRunBinding,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWNER_SOURCE = path.resolve(
  HERE,
  "../../../ml/floodgate-v7-training-label-production-owner.ts",
);
const RUN_ID = "a".repeat(64);
const DIGEST = "b".repeat(64);
const REVISION = "c".repeat(40);
const temporaryRoots: string[] = [];
const getEffectiveUserId = process.geteuid;
const posixDescribe = describe.runIf(typeof getEffectiveUserId === "function");

interface Plan {
  readonly marker: "plan";
}

interface OwnerFixture {
  readonly capability: Parameters<
    typeof runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests
  >[0];
  readonly dependencies: FloodgateV7TrainingLabelProductionOwnerCoreDependencies<Plan>;
  readonly events: string[];
  readonly lease: Readonly<FloodgateTeacherStageLease>;
  readonly plan: Readonly<Plan>;
  preflightFailure: Error | undefined;
  consumerAfterCallbackFailure: Error | undefined;
  finalizerFailure: Error | undefined;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareUtf8)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function runBinding(): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  return Object.freeze({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: Object.freeze({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    }),
    producer_control: Object.freeze({
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms:
        FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
      abort_drain_ms: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256: DIGEST,
    teacher_usi_runtime_receipt_sha256: DIGEST,
  });
}

function v3Header(
  lease: Readonly<FloodgateTeacherStageLease>,
  runId = RUN_ID,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    kind: "header",
    run_id: runId,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_IN_PROGRESS_STATUS,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
    stage_binding: Object.freeze({
      authorization_contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      authorization_trust_boundary:
        FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      stage_basename: lease.receipt.stage_basename,
      parent_dev: lease.receipt.parent_identity.dev.toString(10),
      parent_ino: lease.receipt.parent_identity.ino.toString(10),
      stage_dev: lease.receipt.stage_identity.dev.toString(10),
      stage_ino: lease.receipt.stage_identity.ino.toString(10),
    }),
    training: Object.freeze({
      schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
      role: "training",
      binding: Object.freeze({
        result_receipt_bytes: 1,
        result_receipt_sha256: DIGEST,
        bundle_manifest_bytes: 1,
        bundle_manifest_sha256: DIGEST,
        bundle_producer_revision: REVISION,
        verifier_revision: REVISION,
        raw_format: "shogi-floodgate-label-free-raw-parent-jsonl-v1",
        raw_bytes: 1,
        raw_sha256: DIGEST,
        records: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        games: 1,
        game_ids_sha256: DIGEST,
        parent_ids_sha256: DIGEST,
        position_ids_count: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        position_ids_sha256: DIGEST,
      }),
      records: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      parent_ids_sha256: DIGEST,
      canonical_parents_sha256: DIGEST,
    }),
    run_binding: runBinding(),
    gate_contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
    header_mac: DIGEST,
  });
}

async function createStage(
  prefix:
    | "work-only"
    | "work-train"
    | "work-train-result"
    | "work-train-result-manifest",
  headerRunId = RUN_ID,
): Promise<Readonly<FloodgateTeacherStageLease>> {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-label-owner-"),
  );
  temporaryRoots.push(root);
  await fs.promises.chmod(root, 0o700);
  const stageRoot = path.join(root, "stage");
  await fs.promises.mkdir(stageRoot, { mode: 0o700 });
  const rootStat = await fs.promises.stat(root, { bigint: true });
  const stageStat = await fs.promises.stat(stageRoot, { bigint: true });
  const lease = Object.freeze({
    receipt: Object.freeze({
      contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      trust_boundary: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
      parent_identity: Object.freeze({
        dev: rootStat.dev,
        ino: rootStat.ino,
      }),
      stage_identity: Object.freeze({
        dev: stageStat.dev,
        ino: stageStat.ino,
      }),
      lease_identity: Object.freeze({ dev: BigInt(1), ino: BigInt(1) }),
      stage_basename: "stage",
      destination_basename: "published",
      allowed_entries: Object.freeze([
        "manifest.json",
        "result.json",
        "train.jsonl",
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      ]),
    }),
    stageRoot,
    destinationRoot: path.join(root, "published"),
    close: () => Promise.resolve(),
  }) as Readonly<FloodgateTeacherStageLease>;
  const work = Buffer.from(`${canonicalJson(v3Header(lease, headerRunId))}\n`);
  const workPath = path.join(
    stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  await fs.promises.writeFile(workPath, work, { mode: 0o600 });
  await fs.promises.chmod(workPath, 0o600);
  if (prefix !== "work-only") {
    await fs.promises.writeFile(path.join(stageRoot, "train.jsonl"), "");
  }
  if (
    prefix === "work-train-result" ||
    prefix === "work-train-result-manifest"
  ) {
    await fs.promises.writeFile(path.join(stageRoot, "result.json"), "");
  }
  if (prefix === "work-train-result-manifest") {
    await fs.promises.writeFile(path.join(stageRoot, "manifest.json"), "");
  }
  return lease;
}

function publishedFile(filename: string, bytes: number) {
  return Object.freeze({
    filename,
    dev: "1",
    ino: "1",
    mode: "0600" as const,
    bytes,
    sha256: DIGEST,
  });
}

function finalizationReceipt() {
  return {
    content: {
      work: publishedFile("work.jsonl", 10),
      train: publishedFile("train.jsonl", 20),
      result: publishedFile("result.json", 30),
      manifest: publishedFile("manifest.json", 40),
      parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      training_records: 123,
      consumer_postflight_sha256: DIGEST,
    },
    postpublication: {
      destination_reopened: true,
      content_reverified: true,
      exact_entries: Object.freeze([
        "manifest.json",
        "result.json",
        "train.jsonl",
        "work.jsonl",
      ]),
    },
  } as unknown as Awaited<
    ReturnType<
      FloodgateV7TrainingLabelProductionOwnerCoreDependencies<Plan>["finalize"]
    >
  >;
}

function makeOwnerFixture(): OwnerFixture {
  const events: string[] = [];
  const plan = Object.freeze({ marker: "plan" as const });
  const fixture = {} as OwnerFixture;
  const lease = Object.freeze({
    close: (): Promise<void> => {
      events.push("lease-close");
      return Promise.resolve();
    },
  }) as unknown as Readonly<FloodgateTeacherStageLease>;
  const registryClaim = {
    runId: RUN_ID,
    approvedKeyBinding: {
      recordBytes: 7,
      recordSha256: DIGEST,
      keyInstanceId: DIGEST,
    },
    stageAuthorization: {},
    consumer: {},
  } as unknown as ReturnType<
    FloodgateV7TrainingLabelProductionOwnerCoreDependencies<Plan>["claimRegistry"]
  >;
  const dependencies: FloodgateV7TrainingLabelProductionOwnerCoreDependencies<Plan> =
    {
      executionBoundary:
        "test-only-injected-owner-dependencies-and-real-held-file-preflight",
      effectiveUserId: 501,
      claimOuterGateCapability: () => {
        events.push("outer-claim");
      },
      loadRegistry: () => {
        events.push("registry-load");
        return Promise.resolve({} as never);
      },
      claimRegistry: () => {
        events.push("registry-claim");
        return registryClaim;
      },
      loadApprovedEnrollment: () => {
        events.push("approved-load");
        return Promise.resolve({} as never);
      },
      claimApprovedEnrollment: () => {
        events.push("approved-claim");
        return {
          record: { bytes: 7, sha256: DIGEST },
          key_instance_id: DIGEST,
        } as never;
      },
      verifyCurrentBinding: () => {
        events.push("current-binding");
        return Promise.resolve({});
      },
      authorizeStage: () => {
        events.push("stage-authorize");
        return Promise.resolve(lease);
      },
      preflightStage: () => {
        events.push("stage-preflight");
        return fixture.preflightFailure === undefined
          ? Promise.resolve({
              stagePrefix: "work-only",
              work: { bytes: 101, sha256: DIGEST },
              runBinding: runBinding(),
            })
          : Promise.reject(fixture.preflightFailure);
      },
      consumeRowsAndPostflight: async (_options, consume) => {
        events.push("consumer-start");
        await consume({} as never);
        if (fixture.consumerAfterCallbackFailure !== undefined) {
          throw fixture.consumerAfterCallbackFailure;
        }
        events.push("consumer-postflight");
        return {} as never;
      },
      createPlan: () => {
        events.push("composer");
        return Promise.resolve(plan);
      },
      discardPlan: (discarded) => {
        expect(discarded).toBe(plan);
        events.push("plan-discard");
        return Promise.resolve();
      },
      finalize: (finalized) => {
        expect(finalized).toBe(plan);
        events.push("finalizer");
        return fixture.finalizerFailure === undefined
          ? Promise.resolve(finalizationReceipt())
          : Promise.reject(fixture.finalizerFailure);
      },
    };
  Object.assign(fixture, {
    capability: Object.freeze({
      contract:
        "shogi-floodgate-v7-production-outer-gate-training-label-finalization-capability-v1",
      status:
        "opaque-single-use-valid-only-while-common-os-lock-and-purpose-bound-lease-are-held",
    }),
    dependencies,
    events,
    lease,
    plan,
    preflightFailure: undefined,
    consumerAfterCallbackFailure: undefined,
    finalizerFailure: undefined,
  });
  return fixture;
}

describe("Floodgate v7 training-label production owner", () => {
  it("claims a rejected outer capability synchronously and touches no later dependency", async () => {
    const fixture = makeOwnerFixture();
    const dependencies = {
      ...fixture.dependencies,
      claimOuterGateCapability: () => {
        fixture.events.push("outer-claim");
        throw new Error("wrong purpose");
      },
    };

    const result =
      runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests(
        fixture.capability,
        dependencies,
      );
    expect(fixture.events).toEqual(["outer-claim"]);
    await expect(result).rejects.toMatchObject({
      phase: "outer-capability",
      publication_may_have_occurred: false,
      lease_may_remain: false,
    });
    expect(fixture.events).toEqual(["outer-claim"]);
  });

  it("claims the outer capability synchronously and keeps every authority in one ordered owner", async () => {
    const fixture = makeOwnerFixture();
    const result =
      runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests(
        fixture.capability,
        fixture.dependencies,
      );
    expect(fixture.events[0]).toBe("outer-claim");
    const receipt = await result;

    expect(fixture.events).toEqual([
      "outer-claim",
      "registry-load",
      "registry-claim",
      "approved-load",
      "approved-claim",
      "current-binding",
      "stage-authorize",
      "stage-preflight",
      "consumer-start",
      "composer",
      "consumer-postflight",
      "finalizer",
    ]);
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_STATUS,
      claim_boundary:
        FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CLAIM_BOUNDARY,
      execution_boundary:
        "test-only-injected-owner-dependencies-and-real-held-file-preflight",
      output: {
        parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        training_records: 123,
        work: { bytes: 10, sha256: DIGEST },
        train: { bytes: 20, sha256: DIGEST },
        result: { bytes: 30, sha256: DIGEST },
        manifest: { bytes: 40, sha256: DIGEST },
      },
    });
    expect(Object.getPrototypeOf(receipt)).toBeNull();
    expect(Object.getPrototypeOf(receipt.output)).toBeNull();
    expect(Object.values(receipt.verification)).toEqual(Array(11).fill(true));
    expect(Object.values(receipt.nonclaims)).toEqual(Array(12).fill(false));
    expect(JSON.stringify(receipt)).not.toContain(RUN_ID);
    expect(JSON.stringify(receipt)).not.toContain("stageRoot");
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("closes the still-owner-held lease on a pre-composer failure", async () => {
    const fixture = makeOwnerFixture();
    fixture.preflightFailure = new Error(`private ${RUN_ID}`);
    const failure =
      await runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests(
        fixture.capability,
        fixture.dependencies,
      ).catch((error: unknown) => error);

    expect(fixture.events).toContain("lease-close");
    expect(fixture.events).not.toContain("composer");
    expect(failure).toBeInstanceOf(
      FloodgateV7TrainingLabelProductionOwnerError,
    );
    expect(failure).toMatchObject({
      phase: "stage-preflight",
      publication_may_have_occurred: false,
      lease_may_remain: false,
      cleanup_failure_count: 0,
      retry_disposition: "fresh-invocation-required",
      sensitive_values_disclosed: false,
    });
    expect(JSON.stringify(failure)).not.toContain(RUN_ID);
  });

  it("stops an approved-binding mismatch before current-key or stage work", async () => {
    const fixture = makeOwnerFixture();
    const dependencies = {
      ...fixture.dependencies,
      claimApprovedEnrollment: () => {
        fixture.events.push("approved-claim");
        return {
          record: { bytes: 8, sha256: DIGEST },
          key_instance_id: DIGEST,
        } as never;
      },
    };
    const failure =
      await runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests(
        fixture.capability,
        dependencies,
      ).catch((error: unknown) => error);

    expect(fixture.events).not.toContain("current-binding");
    expect(fixture.events).not.toContain("stage-authorize");
    expect(failure).toMatchObject({
      phase: "approved-binding",
      lease_may_remain: false,
      publication_may_have_occurred: false,
    });
  });

  it("discards a minted plan when post-callback consumer postflight fails", async () => {
    const fixture = makeOwnerFixture();
    fixture.consumerAfterCallbackFailure = new Error("postflight failed");
    const failure =
      await runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests(
        fixture.capability,
        fixture.dependencies,
      ).catch((error: unknown) => error);

    expect(fixture.events).toContain("composer");
    expect(fixture.events).toContain("plan-discard");
    expect(fixture.events).not.toContain("lease-close");
    expect(fixture.events).not.toContain("finalizer");
    expect(failure).toMatchObject({
      phase: "training-consumer",
      lease_may_remain: false,
      publication_may_have_occurred: false,
    });
  });

  it("does not double-clean after finalizer invocation", async () => {
    const fixture = makeOwnerFixture();
    fixture.finalizerFailure = new Error("finalizer failed");
    const failure =
      await runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests(
        fixture.capability,
        fixture.dependencies,
      ).catch((error: unknown) => error);

    expect(fixture.events).toContain("finalizer");
    expect(fixture.events).not.toContain("plan-discard");
    expect(fixture.events).not.toContain("lease-close");
    expect(failure).toMatchObject({
      phase: "finalization",
      publication_may_have_occurred: true,
      lease_may_remain: true,
      retry_disposition: "publication-and-lease-reconciliation-required",
    });
  });

  it("keeps production preflight off the exported CoreForTests wrapper", async () => {
    const source = await fs.promises.readFile(OWNER_SOURCE, "utf8");
    const productionSlice = source.slice(
      source.indexOf("function productionDependencies("),
      source.indexOf(
        "export function runFloodgateV7TrainingLabelProductionOwnerUnderOuterGate(",
      ),
    );
    expect(productionSlice).toContain(
      "inspectFloodgateV7TrainingLabelProductionStageInternal",
    );
    expect(productionSlice).not.toContain("CoreForTests");
  });
});

posixDescribe("Floodgate v7 training-label held-file owner preflight", () => {
  it.each([
    "work-only",
    "work-train",
    "work-train-result",
    "work-train-result-manifest",
  ] as const)(
    "accepts the exact %s prefix and returns only bytes/SHA plus a deep run-binding candidate",
    async (prefix) => {
      const lease = await createStage(prefix);
      const result =
        await inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
          lease,
          getEffectiveUserId?.() as number,
          RUN_ID,
        );
      const work = await fs.promises.readFile(
        path.join(
          lease.stageRoot,
          FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        ),
      );

      expect(result.stagePrefix).toBe(prefix);
      expect(result.work).toEqual({
        bytes: work.byteLength,
        sha256: createHash("sha256").update(work).digest("hex"),
      });
      expect(result.runBinding).toEqual(runBinding());
      expect(Object.getPrototypeOf(result)).toBeNull();
      expect(Object.getPrototypeOf(result.runBinding)).toBeNull();
      expect(Object.isFrozen(result.runBinding.producer_control)).toBe(true);
    },
  );

  it("rejects a named-work replacement after the full held-file read", async () => {
    const lease = await createStage("work-only");
    const workPath = path.join(
      lease.stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    );
    const replacement = await fs.promises.readFile(workPath);
    await expect(
      inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
        lease,
        getEffectiveUserId?.() as number,
        RUN_ID,
        {
          beforeRevalidationForTests: async (phase) => {
            if (phase !== "before-final-revalidation") return;
            await fs.promises.rename(workPath, `${workPath}.held-old`);
            await fs.promises.writeFile(workPath, replacement, { mode: 0o600 });
            await fs.promises.chmod(workPath, 0o600);
          },
        },
      ),
    ).rejects.toThrow();
  });

  it("rejects an entry set outside W, WT, WTR, and WTRM", async () => {
    const lease = await createStage("work-only");
    await fs.promises.writeFile(path.join(lease.stageRoot, "unexpected"), "");
    await expect(
      inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
        lease,
        getEffectiveUserId?.() as number,
        RUN_ID,
      ),
    ).rejects.toThrow();
  });

  it("rejects a canonical header whose private run id differs", async () => {
    const lease = await createStage("work-only", "d".repeat(64));
    await expect(
      inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
        lease,
        getEffectiveUserId?.() as number,
        RUN_ID,
      ),
    ).rejects.toThrow();
  });

  it("rejects non-canonical or fatal UTF-8 first-line data", async () => {
    const noncanonical = await createStage("work-only");
    const noncanonicalPath = path.join(
      noncanonical.stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    );
    await fs.promises.writeFile(
      noncanonicalPath,
      `${JSON.stringify(v3Header(noncanonical))}\n`,
    );
    await fs.promises.chmod(noncanonicalPath, 0o600);
    await expect(
      inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
        noncanonical,
        getEffectiveUserId?.() as number,
        RUN_ID,
      ),
    ).rejects.toThrow();

    const invalidUtf8 = await createStage("work-only");
    const invalidPath = path.join(
      invalidUtf8.stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    );
    await fs.promises.writeFile(invalidPath, Buffer.from([0xff, 0x0a]));
    await fs.promises.chmod(invalidPath, 0o600);
    await expect(
      inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
        invalidUtf8,
        getEffectiveUserId?.() as number,
        RUN_ID,
      ),
    ).rejects.toThrow();
  });

  it("rejects a header beyond 24 KiB without a line terminator", async () => {
    const lease = await createStage("work-only");
    const workPath = path.join(
      lease.stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    );
    await fs.promises.writeFile(
      workPath,
      Buffer.alloc(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1, 0x61),
    );
    await fs.promises.chmod(workPath, 0o600);
    await expect(
      inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
        lease,
        getEffectiveUserId?.() as number,
        RUN_ID,
      ),
    ).rejects.toThrow();
  });

  it("rejects work whose private 0600 mode has drifted", async () => {
    const lease = await createStage("work-only");
    await fs.promises.chmod(
      path.join(lease.stageRoot, FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME),
      0o640,
    );
    await expect(
      inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
        lease,
        getEffectiveUserId?.() as number,
        RUN_ID,
      ),
    ).rejects.toThrow();
  });
});
