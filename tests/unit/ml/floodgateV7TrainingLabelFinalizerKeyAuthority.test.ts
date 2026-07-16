import { createHash, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import * as authority from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_HKDF_INFO,
} from "../../../ml/floodgate-v7-checkpoint-key-contract";
import {
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO,
} from "../../../ml/floodgate-v7-training-label-finalizer-key-contract";

const RUN_ID = "a7".repeat(32);
const KEY_BYTES = Buffer.from(
  Array.from({ length: 32 }, (_value, index) => (index * 29 + 7) & 0xff),
);
const roots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type Dependencies = authority.FloodgateV7DeploymentKeyAuthorityDependencies;
type SealedRequest =
  authority.FloodgateV7DeploymentTeacherSealedScanV3KeyRequest;
type OutputRequest =
  authority.FloodgateV7DeploymentTrainingLabelOutputKeysRequest;

function nullRecord<T extends Record<string, unknown>>(value: T): Readonly<T> {
  const output = Object.create(null) as T;
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: child,
    });
  }
  return Object.freeze(output);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Readonly<Record<string, unknown>>)[key],
          )}`,
      )
      .join(",")}}`;
  }
  throw new Error(`unsupported canonical value ${typeof value}`);
}

function runBinding(): authority.FloodgateV7DeploymentTeacherRunBinding {
  return nullRecord({
    schema: "shogi-floodgate-v7-teacher-run-binding-v2" as const,
    plan: nullRecord({
      bytes: 10_890 as const,
      sha256:
        "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af" as const,
    }),
    producer_control: nullRecord({
      schema: "shogi-floodgate-v7-teacher-producer-control-v2" as const,
      parent_deadline_ms: 1_800_000 as const,
      abort_drain_ms: 30_000 as const,
      max_in_flight: 12 as const,
      cancel_policy:
        "first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2" as const,
      late_settlement_policy:
        "observe-from-start-consume-after-terminal-without-validation-or-append-v2" as const,
    }),
    stable_runtime_receipt_sha256: "31".repeat(32),
    teacher_usi_runtime_receipt_sha256: "52".repeat(32),
  });
}

function stageReceipt() {
  return nullRecord({
    contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
    trust_boundary: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
    status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
    parent_identity: nullRecord({ dev: BigInt(101), ino: BigInt(102) }),
    stage_identity: nullRecord({ dev: BigInt(201), ino: BigInt(202) }),
    lease_identity: nullRecord({ dev: BigInt(301), ino: BigInt(302) }),
    stage_basename: "sealed-stage-v7",
    destination_basename: "labels-v7",
    allowed_entries: Object.freeze([
      ...FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
    ]),
  });
}

function sealedRequest(
  overrides: Readonly<Record<string, unknown>> = {},
): SealedRequest {
  return nullRecord({
    runId: RUN_ID,
    keyId: authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding: runBinding(),
    stageAuthorizationReceipt: stageReceipt(),
    gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
    work: nullRecord({ bytes: 12_345, sha256: "6b".repeat(32) }),
    ...overrides,
  }) as SealedRequest;
}

function outputRequest(
  overrides: Readonly<Record<string, unknown>> = {},
): OutputRequest {
  const binding = runBinding();
  return nullRecord({
    runId: RUN_ID,
    keyId: authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding: binding,
    stageAuthorizationReceipt: stageReceipt(),
    teacherRunBindingSha256: createHash("sha256")
      .update(canonicalJson(binding))
      .digest("hex"),
    trainingBindingSha256: "73".repeat(32),
    work: nullRecord({
      bytes: 12_345,
      sha256: "6b".repeat(32),
      snapshot: nullRecord({
        dev: "201",
        ino: "303",
        mode: String(0o100600),
        nlink: "1",
        uid: String(effectiveUserId()),
        size: "12345",
        mtimeNs: "9001",
        ctimeNs: "9002",
      }),
    }),
    training: nullRecord({
      inputParents: 24_000,
      forcedParentsSkipped: 23_999,
      emittedParentGroups: 1,
      parentIdsSha256: "84".repeat(32),
      records: 14,
      bytes: 4_321,
      sha256: "95".repeat(32),
    }),
    ...overrides,
  }) as OutputRequest;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("POSIX effective uid required");
  }
  return process.geteuid();
}

async function fixture(
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<Readonly<{ home: string; dependencies: Dependencies }>> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-label-key-authority-"),
  );
  const home = await fs.promises.realpath(created);
  roots.push(home);
  await fs.promises.chmod(home, 0o700);
  const parent = path.join(
    home,
    ...authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
  await fs.promises.mkdir(parent, { recursive: true, mode: 0o700 });
  let current = home;
  for (const component of authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS) {
    current = path.join(current, component);
    await fs.promises.chmod(current, 0o700);
  }
  const keyPath = path.join(
    parent,
    authority.FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
  await fs.promises.writeFile(keyPath, KEY_BYTES, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(keyPath, 0o600);
  return {
    home,
    dependencies: nullRecord({
      effectiveUserId: effectiveUserId(),
      homeDirectory: home,
      observeInternalKeyForTests: undefined,
      observePreparedKeyForTests: undefined,
      beforeFinalRevalidationForTests: undefined,
      ...overrides,
    }) as Dependencies,
  };
}

function expected(info: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      KEY_BYTES,
      Buffer.from(RUN_ID, "hex"),
      Buffer.from(info),
      32,
    ),
  );
}

function allZero(value: Uint8Array): boolean {
  return value.every((byte) => byte === 0);
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

posixDescribe(
  "Floodgate v7 purpose-separated sealed-scan key authority",
  () => {
    it("keeps exact test/production/purpose registries separate and returns one owned key", async () => {
      const retained: Uint8Array[] = [];
      const value = await fixture({
        observePreparedKeyForTests(kind: string, key: Uint8Array): void {
          if (kind === "sealed-scan") retained.push(key);
        },
      });
      const request = sealedRequest();
      const prepared =
        await authority.prepareFloodgateV7DeploymentTeacherSealedScanV3KeyCoreForTests(
          request,
          value.dependencies,
        );
      expect(prepared).toMatchObject({
        contract:
          authority.FLOODGATE_V7_DEPLOYMENT_TEACHER_SEALED_SCAN_V3_KEY_CONTRACT,
        status:
          authority.FLOODGATE_V7_DEPLOYMENT_TEACHER_SEALED_SCAN_V3_KEY_STATUS,
        claim_boundary:
          authority.FLOODGATE_V7_DEPLOYMENT_TEACHER_SEALED_SCAN_V3_KEY_CLAIM_BOUNDARY,
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
        work: { bytes: 12_345, sha256: "6b".repeat(32) },
      });
      expect(JSON.stringify(prepared)).not.toContain(KEY_BYTES.toString("hex"));
      expect(retained).toHaveLength(1);
      expect(allZero(retained[0])).toBe(false);

      const clone = nullRecord({ ...prepared });
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests(
          clone as typeof prepared,
          request,
        ),
      ).toThrow(/exact prepared authorization facade/);
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKey(
          prepared as never,
          request,
        ),
      ).toThrow(/test-only boundary/);
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
          prepared as never,
          request as never,
        ),
      ).toThrow(/exact prepared authorization facade/);

      const output =
        authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests(
          prepared,
          request,
        );
      const expectedKey = expected(
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_HKDF_INFO,
      );
      expect(Buffer.from(output)).toEqual(expectedKey);
      expect(Object.getPrototypeOf(output)).toBe(Uint8Array.prototype);
      expect(output).not.toBeInstanceOf(Buffer);
      expect(output.byteOffset).toBe(0);
      expect(output.buffer.byteLength).toBe(32);
      expect(allZero(retained[0])).toBe(true);
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests(
          prepared,
          request,
        ),
      ).toThrow(/already consumed/);
      authority.discardFloodgateV7DeploymentTeacherSealedScanV3Key(prepared);
      output.fill(0);
      expectedKey.fill(0);
    });

    it("consumes mismatched claims and zeroizes both mismatch and discard states", async () => {
      const retained: Uint8Array[] = [];
      const value = await fixture({
        observePreparedKeyForTests(kind: string, key: Uint8Array): void {
          if (kind === "sealed-scan") retained.push(key);
        },
      });
      const request = sealedRequest();
      const mismatch =
        await authority.prepareFloodgateV7DeploymentTeacherSealedScanV3KeyCoreForTests(
          request,
          value.dependencies,
        );
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests(
          mismatch,
          sealedRequest({
            work: nullRecord({ bytes: 12_346, sha256: "6b".repeat(32) }),
          }),
        ),
      ).toThrow(/differs from the prepared binding/);
      expect(allZero(retained[0])).toBe(true);
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests(
          mismatch,
          request,
        ),
      ).toThrow(/already consumed/);

      const discarded =
        await authority.prepareFloodgateV7DeploymentTeacherSealedScanV3KeyCoreForTests(
          request,
          value.dependencies,
        );
      authority.discardFloodgateV7DeploymentTeacherSealedScanV3Key(discarded);
      authority.discardFloodgateV7DeploymentTeacherSealedScanV3Key(discarded);
      expect(allZero(retained[1])).toBe(true);
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests(
          discarded,
          request,
        ),
      ).toThrow(/already consumed or discarded/);
    });
  },
);

posixDescribe("Floodgate v7 training-label output key authority", () => {
  it("returns separate owned result/manifest keys and zeroizes authority copies", async () => {
    const retained = new Map<string, Uint8Array>();
    const value = await fixture({
      observePreparedKeyForTests(kind: string, key: Uint8Array): void {
        retained.set(kind, key);
      },
    });
    const request = outputRequest();
    const prepared =
      await authority.prepareFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
        request,
        value.dependencies,
      );
    expect(prepared).toMatchObject({
      contract:
        authority.FLOODGATE_V7_DEPLOYMENT_TRAINING_LABEL_OUTPUT_KEYS_CONTRACT,
      status:
        authority.FLOODGATE_V7_DEPLOYMENT_TRAINING_LABEL_OUTPUT_KEYS_STATUS,
      claim_boundary:
        authority.FLOODGATE_V7_DEPLOYMENT_TRAINING_LABEL_OUTPUT_KEYS_CLAIM_BOUNDARY,
      plan_binding_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(prepared)).not.toContain(KEY_BYTES.toString("hex"));
    expect(allZero(retained.get("training-label-result")!)).toBe(false);
    expect(allZero(retained.get("training-label-manifest")!)).toBe(false);

    const clone = nullRecord({ ...prepared });
    expect(() =>
      authority.claimFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
        clone as typeof prepared,
        request,
      ),
    ).toThrow(/exact prepared authorization facade/);
    expect(() =>
      authority.claimFloodgateV7DeploymentTrainingLabelOutputKeys(
        prepared as never,
        request,
      ),
    ).toThrow(/test-only boundary/);

    const claimed =
      authority.claimFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
        prepared,
        request,
      );
    const expectedResult = expected(
      FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO,
    );
    const expectedManifest = expected(
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
    );
    expect(Buffer.from(claimed.resultKey)).toEqual(expectedResult);
    expect(Buffer.from(claimed.manifestKey)).toEqual(expectedManifest);
    expect(claimed.resultKey).not.toEqual(claimed.manifestKey);
    for (const key of [claimed.resultKey, claimed.manifestKey]) {
      expect(Object.getPrototypeOf(key)).toBe(Uint8Array.prototype);
      expect(key).not.toBeInstanceOf(Buffer);
      expect(key.byteOffset).toBe(0);
      expect(key.buffer.byteLength).toBe(32);
    }
    expect(claimed.resultKey.buffer).not.toBe(claimed.manifestKey.buffer);
    expect(allZero(retained.get("training-label-result")!)).toBe(true);
    expect(allZero(retained.get("training-label-manifest")!)).toBe(true);
    expect(() =>
      authority.claimFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
        prepared,
        request,
      ),
    ).toThrow(/already consumed/);
    authority.discardFloodgateV7DeploymentTrainingLabelOutputKeys(prepared);
    claimed.resultKey.fill(0);
    claimed.manifestKey.fill(0);
    expectedResult.fill(0);
    expectedManifest.fill(0);
  });

  it("binds every output plan commitment and zeroizes mismatch/discard/observer failures", async () => {
    const retained: Uint8Array[] = [];
    const value = await fixture({
      observePreparedKeyForTests(_kind: string, key: Uint8Array): void {
        retained.push(key);
      },
    });
    const request = outputRequest();
    const mismatches: readonly OutputRequest[] = [
      outputRequest({ trainingBindingSha256: "ab".repeat(32) }),
      outputRequest({
        work: nullRecord({
          ...request.work,
          sha256: "bc".repeat(32),
        }),
      }),
      outputRequest({
        training: nullRecord({
          ...request.training,
          sha256: "cd".repeat(32),
        }),
      }),
      outputRequest({
        stageAuthorizationReceipt: nullRecord({
          ...stageReceipt(),
          lease_identity: nullRecord({ dev: BigInt(301), ino: BigInt(999) }),
        }),
      }),
    ];
    for (const mismatch of mismatches) {
      const prepared =
        await authority.prepareFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
          request,
          value.dependencies,
        );
      expect(() =>
        authority.claimFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
          prepared,
          mismatch,
        ),
      ).toThrow(/differs from the prepared binding/);
    }
    expect(retained).toHaveLength(mismatches.length * 2);
    expect(retained.every(allZero)).toBe(true);

    const discarded =
      await authority.prepareFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
        request,
        value.dependencies,
      );
    authority.discardFloodgateV7DeploymentTrainingLabelOutputKeys(discarded);
    authority.discardFloodgateV7DeploymentTrainingLabelOutputKeys(discarded);
    expect(retained.slice(-2).every(allZero)).toBe(true);

    const observerRetained: Uint8Array[] = [];
    const failing = await fixture({
      observePreparedKeyForTests(kind: string, key: Uint8Array): void {
        observerRetained.push(key);
        if (kind === "training-label-manifest") {
          throw new Error("synthetic prepared-key observer failure");
        }
      },
    });
    await expect(
      authority.prepareFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
        request,
        failing.dependencies,
      ),
    ).rejects.toBeInstanceOf(authority.FloodgateV7DeploymentKeyAuthorityError);
    expect(observerRetained).toHaveLength(2);
    expect(observerRetained.every(allZero)).toBe(true);
  });

  it("keeps exact arity and rejects invalid teacher/work/training bindings before key I/O", async () => {
    const value = await fixture();
    let observed = 0;
    const dependencies = nullRecord({
      ...value.dependencies,
      observeInternalKeyForTests(): void {
        observed += 1;
      },
    }) as Dependencies;
    const request = outputRequest();
    const invalids = [
      outputRequest({ teacherRunBindingSha256: "00".repeat(32) }),
      outputRequest({
        work: nullRecord({
          ...request.work,
          snapshot: nullRecord({ ...request.work.snapshot, nlink: "2" }),
        }),
      }),
      outputRequest({
        training: nullRecord({
          ...request.training,
          emittedParentGroups: 2,
        }),
      }),
    ];
    for (const invalid of invalids) {
      expect(() =>
        authority.prepareFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests(
          invalid,
          dependencies,
        ),
      ).toThrow();
    }
    expect(observed).toBe(0);
    expect(
      authority.prepareFloodgateV7DeploymentTeacherSealedScanV3Key.length,
    ).toBe(1);
    expect(
      authority.prepareFloodgateV7DeploymentTeacherSealedScanV3KeyCoreForTests
        .length,
    ).toBe(2);
    expect(
      authority.claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKey.length,
    ).toBe(2);
    expect(
      authority.prepareFloodgateV7DeploymentTrainingLabelOutputKeys.length,
    ).toBe(1);
    expect(
      authority.prepareFloodgateV7DeploymentTrainingLabelOutputKeysCoreForTests
        .length,
    ).toBe(2);
    expect(
      authority.claimFloodgateV7DeploymentTrainingLabelOutputKeys.length,
    ).toBe(2);
  });
});
