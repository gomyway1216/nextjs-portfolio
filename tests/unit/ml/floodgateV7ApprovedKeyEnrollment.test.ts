import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
  FloodgateV7ApprovedKeyEnrollmentError,
  claimFloodgateV7ApprovedKeyEnrollment,
  claimFloodgateV7ApprovedKeyEnrollmentCoreForTests,
  createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests,
  loadFloodgateV7ApprovedKeyEnrollmentCoreForTests,
  type FloodgateV7ApprovedKeyEnrollmentRecord,
} from "../../../ml/floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
} from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
} from "../../../ml/floodgate-v7-deployment-key-instance-enrollment";

const EUID = process.geteuid?.() ?? 501;
const INSTANCE_ID = "12".repeat(32);
const APPROVAL_ID = "34".repeat(32);
const PARENT_IDENTITY = { dev: "10", ino: "20" } as const;
const KEY_IDENTITY = { dev: "10", ino: "21" } as const;
const temporaryRoots: string[] = [];
const requireFromHere = createRequire(import.meta.url);

interface MutableInvalidRecordFixture {
  approval: {
    approved_at_utc: string;
    candidate_receipt: { bytes: number; sha256: string };
  };
  key_deployment: { key_instance_id: string };
  status: string;
  extra?: boolean;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function candidateCanonicalJson(
  ownerUid = EUID,
  instanceId = INSTANCE_ID,
): string {
  const candidate = {
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    claim_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-key-instance-inspection",
    algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    key_deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      owner_uid: ownerUid,
      parent_mode: "0700",
      key_mode: "0600",
      key_bytes: 32,
      key_nlink: 1,
      parent_identity: PARENT_IDENTITY,
      key_identity: KEY_IDENTITY,
      key_instance_id: instanceId,
      key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
      held_descriptors_revalidated: true,
    },
    test_boundary: {
      production_home_origin: false,
      production_home_alias_rejected: true,
      current_effective_uid_required: true,
      test_hook_may_observe_key_copy: true,
    },
    nonclaims: {
      key_created_or_written: false,
      key_material_disclosed: false,
      root_key_hash_disclosed: false,
      key_path_disclosed: false,
      authorization_mac: false,
      run_authorization: false,
      stage_authorization: false,
      checkpoint_key_capability: false,
      control_plane_approval: false,
      record_persisted: false,
      connector_execution: false,
      checkpoint: false,
      runtime: false,
      dataset_read: false,
      teacher_label: false,
      training: false,
      weight: false,
      live_evaluation_activation: false,
      playing_strength: false,
    },
  } as const;
  return `${JSON.stringify(candidate)}\n`;
}

function approvedRecord(
  candidateJson = candidateCanonicalJson(),
  instanceId = INSTANCE_ID,
  ownerUid = EUID,
): FloodgateV7ApprovedKeyEnrollmentRecord {
  return {
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    approval: {
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: APPROVAL_ID,
      approved_at_utc: "2026-07-14T17:00:00.000Z",
      candidate_receipt: {
        bytes: Buffer.byteLength(candidateJson),
        sha256: sha256(candidateJson),
        canonical_json: candidateJson,
      },
    },
    key_deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      owner_uid: ownerUid,
      parent_identity: PARENT_IDENTITY,
      key_identity: KEY_IDENTITY,
      key_instance_id: instanceId,
      key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
    },
    nonclaims: {
      approval_signature_or_mac: false,
      checkpoint: false,
      dataset_read: false,
      gate_authorization: false,
      key_material: false,
      key_path: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
      root_key_hash: false,
      run_authorization: false,
      runtime: false,
      teacher_label: false,
      training: false,
      weight: false,
    },
  };
}

function canonicalRecordJson(
  record: FloodgateV7ApprovedKeyEnrollmentRecord,
): string {
  return `${JSON.stringify(record)}\n`;
}

async function temporaryRecord(
  bytes: string | Uint8Array = canonicalRecordJson(approvedRecord()),
): Promise<Readonly<{ home: string; parent: string; record: string }>> {
  const createdHome = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-approved-"),
  );
  const home = await fs.promises.realpath(createdHome);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  const parent = path.join(
    home,
    ...FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  );
  await fs.promises.mkdir(parent, { mode: 0o700, recursive: true });
  await fs.promises.chmod(parent, 0o700);
  const record = path.join(
    parent,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  );
  await fs.promises.writeFile(record, bytes, { mode: 0o600 });
  await fs.promises.chmod(record, 0o600);
  return { home, parent, record };
}

describe("Floodgate v7 approved key enrollment", () => {
  it("mints an opaque frozen capability, preserves wrong-boundary nonconsumption, and claims once", () => {
    const capability =
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
        approvedRecord(),
      );

    expect(Reflect.ownKeys(capability)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
    ]);
    expect(Object.getPrototypeOf(capability)).toBeNull();
    expect(Object.isFrozen(capability)).toBe(true);
    expect(JSON.stringify(capability)).not.toContain(INSTANCE_ID);
    expect(() => claimFloodgateV7ApprovedKeyEnrollment(capability)).toThrow(
      FloodgateV7ApprovedKeyEnrollmentError,
    );

    const claim = claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability);
    expect(claim).toMatchObject({
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      key_instance_id: INSTANCE_ID,
      deployment_identity: {
        owner_uid: EUID,
        parent_dev: PARENT_IDENTITY.dev,
        parent_ino: PARENT_IDENTITY.ino,
        key_dev: KEY_IDENTITY.dev,
        key_ino: KEY_IDENTITY.ino,
      },
      approval: { approval_id: APPROVAL_ID },
    });
    expect(Object.isFrozen(claim)).toBe(true);
    expect(() =>
      claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);
    expect(() =>
      claimFloodgateV7ApprovedKeyEnrollmentCoreForTests({ ...capability }),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);
  });

  it.each([
    [
      "candidate digest",
      (record: MutableInvalidRecordFixture) =>
        (record.approval.candidate_receipt.sha256 = "00".repeat(32)),
    ],
    [
      "candidate bytes",
      (record: MutableInvalidRecordFixture) =>
        (record.approval.candidate_receipt.bytes += 1),
    ],
    [
      "deployment instance",
      (record: MutableInvalidRecordFixture) =>
        (record.key_deployment.key_instance_id = "56".repeat(32)),
    ],
    [
      "status",
      (record: MutableInvalidRecordFixture) => (record.status = "unapproved"),
    ],
    [
      "approval timestamp",
      (record: MutableInvalidRecordFixture) =>
        (record.approval.approved_at_utc = "2026-02-30T00:00:00.000Z"),
    ],
    [
      "unknown key",
      (record: MutableInvalidRecordFixture) => (record.extra = true),
    ],
  ])("rejects invalid %s records", (_label, mutate) => {
    const record = structuredClone(
      approvedRecord(),
    ) as unknown as MutableInvalidRecordFixture;
    mutate(record);
    expect(() =>
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
        record as unknown as FloodgateV7ApprovedKeyEnrollmentRecord,
      ),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);
  });

  it("rejects Proxies and accessors without invoking traps", () => {
    let proxyTraps = 0;
    const proxy = new Proxy(approvedRecord(), {
      get: () => {
        proxyTraps += 1;
        throw new Error("proxy get trap must not run");
      },
      ownKeys: () => {
        proxyTraps += 1;
        throw new Error("proxy ownKeys trap must not run");
      },
    });
    expect(() =>
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(proxy),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);
    expect(proxyTraps).toBe(0);

    const accessor = { ...approvedRecord() } as Record<string, unknown>;
    let getterCalls = 0;
    Object.defineProperty(accessor, "approval", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error("approval getter must not run");
      },
    });
    expect(() =>
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
        accessor as never,
      ),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);
    expect(getterCalls).toBe(0);
  });

  it("rejects reordered candidate bytes and applies the filesystem size bound to the synthetic factory", () => {
    const parsed = JSON.parse(candidateCanonicalJson()) as Record<
      string,
      unknown
    >;
    const reorderedTopLevel = Object.fromEntries(
      Object.entries(parsed).reverse(),
    );
    const reorderedJson = `${JSON.stringify(reorderedTopLevel)}\n`;
    expect(() =>
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
        approvedRecord(reorderedJson),
      ),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);

    const nested = JSON.parse(candidateCanonicalJson()) as {
      key_deployment: Record<string, unknown>;
    };
    nested.key_deployment = Object.fromEntries(
      Object.entries(nested.key_deployment).reverse(),
    );
    const reorderedNestedJson = `${JSON.stringify(nested)}\n`;
    expect(() =>
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
        approvedRecord(reorderedNestedJson),
      ),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);

    const oversizedCandidate = JSON.parse(candidateCanonicalJson()) as {
      key_deployment: { parent_identity: { dev: string } };
    };
    oversizedCandidate.key_deployment.parent_identity.dev = "1".repeat(65_000);
    const oversizedJson = `${JSON.stringify(oversizedCandidate)}\n`;
    const oversizedRecord = approvedRecord(oversizedJson);
    expect(
      Buffer.byteLength(canonicalRecordJson(oversizedRecord)),
    ).toBeGreaterThan(FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES);
    expect(() =>
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
        oversizedRecord,
      ),
    ).toThrow(FloodgateV7ApprovedKeyEnrollmentError);
  });

  it("preserves the existing authority contract for current EUID zero fixtures", () => {
    const zeroCandidate = candidateCanonicalJson(0);
    const capability =
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
        approvedRecord(zeroCandidate, INSTANCE_ID, 0),
      );
    expect(
      claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability)
        .deployment_identity.owner_uid,
    ).toBe(0);
  });

  it("loads one canonical private temporary-home record and claims its binding", async () => {
    const fixture = await temporaryRecord();
    const capability = await loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
      effectiveUserId: EUID,
      homeDirectory: fixture.home,
    });
    const claim = claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability);

    expect(claim.key_instance_id).toBe(INSTANCE_ID);
    expect(claim.record.bytes).toBe(
      Buffer.byteLength(canonicalRecordJson(approvedRecord())),
    );
    expect(claim.record.sha256).toBe(
      sha256(canonicalRecordJson(approvedRecord())),
    );
  });

  it("rejects BOM-prefixed and reordered outer approved-record bytes", async () => {
    const canonical = canonicalRecordJson(approvedRecord());
    const bomPrefixed = await temporaryRecord(`\ufeff${canonical}`);
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: bomPrefixed.home,
      }),
    ).rejects.toMatchObject({ phase: "record-validation" });

    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(parsed).reverse());
    const reorderedOuter = await temporaryRecord(
      `${JSON.stringify(reordered)}\n`,
    );
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: reorderedOuter.home,
      }),
    ).rejects.toMatchObject({ phase: "record-validation" });
  });

  it("rejects a filesystem record larger than the 64 KiB bound", async () => {
    const oversized = await temporaryRecord(
      Buffer.alloc(
        FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES + 1,
        0x20,
      ),
    );
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: oversized.home,
      }),
    ).rejects.toMatchObject({ phase: "record-read" });
  });

  it("rejects in-place mutation before final revalidation", async () => {
    const fixture = await temporaryRecord();
    const mutated = canonicalRecordJson(approvedRecord()).replace(
      APPROVAL_ID,
      "35".repeat(32),
    );
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: fixture.home,
        beforeFinalRevalidationForTests: async () => {
          await fs.promises.writeFile(fixture.record, mutated, { mode: 0o600 });
        },
      }),
    ).rejects.toMatchObject({ phase: "record-read" });
  });

  it("rejects named-record replacement before final revalidation", async () => {
    const fixture = await temporaryRecord();
    const replaced = `${fixture.record}.replaced`;
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: fixture.home,
        beforeFinalRevalidationForTests: async () => {
          await fs.promises.rename(fixture.record, replaced);
          await fs.promises.writeFile(
            fixture.record,
            canonicalRecordJson(approvedRecord()),
            { mode: 0o600 },
          );
          await fs.promises.chmod(fixture.record, 0o600);
        },
      }),
    ).rejects.toMatchObject({ phase: "record-read" });
  });

  it("rejects record growth before final revalidation", async () => {
    const fixture = await temporaryRecord();
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: fixture.home,
        beforeFinalRevalidationForTests: async () => {
          await fs.promises.appendFile(fixture.record, " ");
        },
      }),
    ).rejects.toMatchObject({ phase: "record-read" });
  });

  it("loads and claims without consulting poisoned runtime globals", async () => {
    const fixture = await temporaryRecord();
    const expectedRecordBytes = Buffer.byteLength(
      canonicalRecordJson(approvedRecord()),
    );
    const cryptoModule = requireFromHere("node:crypto") as {
      createHash: typeof createHash;
    };
    const cryptoCreateHashDescriptor = Object.getOwnPropertyDescriptor(
      cryptoModule,
      "createHash",
    );
    const promiseResolveDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      "resolve",
    );
    const promiseAllDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      "all",
    );
    const promiseConstructorDescriptor = Object.getOwnPropertyDescriptor(
      Promise.prototype,
      "constructor",
    );
    const promiseSpeciesDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      Symbol.species,
    );
    const arrayIteratorDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    );
    const objectPrototypeApprovalDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "approval",
    );
    const objectPrototypeHookDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "beforeFinalRevalidationForTests",
    );
    const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
    const typedArrayBufferDescriptor = Object.getOwnPropertyDescriptor(
      typedArrayPrototype,
      "buffer",
    );
    const typedArrayByteLengthDescriptor = Object.getOwnPropertyDescriptor(
      typedArrayPrototype,
      "byteLength",
    );
    const typedArrayByteOffsetDescriptor = Object.getOwnPropertyDescriptor(
      typedArrayPrototype,
      "byteOffset",
    );
    const typedArrayLengthDescriptor = Object.getOwnPropertyDescriptor(
      typedArrayPrototype,
      "length",
    );
    const bigintDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "BigInt",
    );
    const numberDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "Number",
    );
    const hashPrototype = Object.getPrototypeOf(createHash("sha256")) as object;
    const hashUpdateDescriptor = Object.getOwnPropertyDescriptor(
      hashPrototype,
      "update",
    );
    const hashDigestDescriptor = Object.getOwnPropertyDescriptor(
      hashPrototype,
      "digest",
    );
    if (
      promiseResolveDescriptor === undefined ||
      promiseAllDescriptor === undefined ||
      promiseConstructorDescriptor === undefined ||
      promiseSpeciesDescriptor === undefined ||
      arrayIteratorDescriptor === undefined ||
      typedArrayBufferDescriptor === undefined ||
      typeof typedArrayBufferDescriptor.get !== "function" ||
      typedArrayByteLengthDescriptor === undefined ||
      typeof typedArrayByteLengthDescriptor.get !== "function" ||
      typedArrayByteOffsetDescriptor === undefined ||
      typeof typedArrayByteOffsetDescriptor.get !== "function" ||
      typedArrayLengthDescriptor === undefined ||
      typeof typedArrayLengthDescriptor.get !== "function" ||
      bigintDescriptor === undefined ||
      numberDescriptor === undefined ||
      cryptoCreateHashDescriptor === undefined ||
      hashUpdateDescriptor === undefined ||
      hashDigestDescriptor === undefined
    ) {
      throw new Error("required intrinsic descriptor is unavailable");
    }
    const CapturedPromise = Promise;
    const malformedRecord = approvedRecord() as unknown as {
      approval?: unknown;
      unexpected?: boolean;
    };
    delete malformedRecord.approval;
    malformedRecord.unexpected = true;
    let promiseResolveCalls = 0;
    let promiseAllCalls = 0;
    let promiseConstructorCalls = 0;
    let promiseSpeciesCalls = 0;
    let arrayIteratorCalls = 0;
    let typedArrayBufferCalls = 0;
    let typedArrayByteLengthCalls = 0;
    let typedArrayByteOffsetCalls = 0;
    let typedArrayLengthCalls = 0;
    let bigintCalls = 0;
    let numberCalls = 0;
    let cryptoCreateHashCalls = 0;
    let hashUpdateCalls = 0;
    let hashDigestCalls = 0;
    let objectPrototypeApprovalCalls = 0;
    let objectPrototypeHookCalls = 0;
    let malformedRecordError: unknown;
    let operationError: unknown;
    let claimedInstanceId: string | undefined;
    let claimedRecordBytes: number | undefined;

    try {
      Object.defineProperty(Promise, "resolve", {
        configurable: true,
        value: () => {
          promiseResolveCalls += 1;
          throw new Error("live Promise.resolve must not run");
        },
      });
      Object.defineProperty(Promise, "all", {
        configurable: true,
        value: () => {
          promiseAllCalls += 1;
          throw new Error("live Promise.all must not run");
        },
      });
      Object.defineProperty(Promise.prototype, "constructor", {
        configurable: true,
        get: () => {
          promiseConstructorCalls += 1;
          return CapturedPromise;
        },
      });
      Object.defineProperty(Promise, Symbol.species, {
        configurable: true,
        get: () => {
          promiseSpeciesCalls += 1;
          throw new Error("live Promise Symbol.species must not run");
        },
      });
      Object.defineProperty(globalThis, "BigInt", {
        configurable: true,
        value: () => {
          bigintCalls += 1;
          throw new Error("live BigInt must not run");
        },
      });
      Object.defineProperty(globalThis, "Number", {
        configurable: true,
        value: () => {
          numberCalls += 1;
          throw new Error("live Number must not run");
        },
      });
      Object.defineProperty(cryptoModule, "createHash", {
        configurable: true,
        value: () => {
          cryptoCreateHashCalls += 1;
          throw new Error("live node:crypto createHash export must not run");
        },
      });
      syncBuiltinESMExports();
      const decoyBuffer = new ArrayBuffer(2);
      Object.defineProperty(typedArrayPrototype, "buffer", {
        configurable: true,
        get: () => {
          typedArrayBufferCalls += 1;
          return decoyBuffer;
        },
      });
      Object.defineProperty(typedArrayPrototype, "byteLength", {
        configurable: true,
        get: () => {
          typedArrayByteLengthCalls += 1;
          return 2;
        },
      });
      Object.defineProperty(typedArrayPrototype, "byteOffset", {
        configurable: true,
        get: () => {
          typedArrayByteOffsetCalls += 1;
          return 2;
        },
      });
      Object.defineProperty(typedArrayPrototype, "length", {
        configurable: true,
        get: () => {
          typedArrayLengthCalls += 1;
          return 2;
        },
      });
      const typedArrayProbe = new Uint8Array(8);
      if (
        typedArrayProbe.buffer !== decoyBuffer ||
        typedArrayProbe.byteLength !== 2 ||
        typedArrayProbe.byteOffset !== 2 ||
        typedArrayProbe.length !== 2
      ) {
        throw new Error("typed-array length poison did not take effect");
      }
      typedArrayBufferCalls = 0;
      typedArrayByteLengthCalls = 0;
      typedArrayByteOffsetCalls = 0;
      typedArrayLengthCalls = 0;
      Object.defineProperty(hashPrototype, "update", {
        configurable: true,
        value: () => {
          hashUpdateCalls += 1;
          throw new Error("live Hash.update must not run");
        },
      });
      Object.defineProperty(hashPrototype, "digest", {
        configurable: true,
        value: () => {
          hashDigestCalls += 1;
          throw new Error("live Hash.digest must not run");
        },
      });
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        configurable: true,
        value: () => {
          arrayIteratorCalls += 1;
          throw new Error("live Array iterator must not run");
        },
      });
      Object.defineProperty(Object.prototype, "approval", {
        configurable: true,
        get: () => {
          objectPrototypeApprovalCalls += 1;
          return undefined;
        },
      });
      Object.defineProperty(
        Object.prototype,
        "beforeFinalRevalidationForTests",
        {
          configurable: true,
          get: () => {
            objectPrototypeHookCalls += 1;
            return undefined;
          },
        },
      );
      try {
        try {
          createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
            malformedRecord as unknown as FloodgateV7ApprovedKeyEnrollmentRecord,
          );
        } catch (error) {
          malformedRecordError = error;
        }
        const capability =
          await loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
            effectiveUserId: EUID,
            homeDirectory: fixture.home,
          });
        const claim =
          claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability);
        claimedInstanceId = claim.key_instance_id;
        claimedRecordBytes = claim.record.bytes;
      } catch (error) {
        operationError = error;
      }
    } finally {
      Object.defineProperty(
        Array.prototype,
        Symbol.iterator,
        arrayIteratorDescriptor,
      );
      if (objectPrototypeApprovalDescriptor === undefined) {
        delete (Object.prototype as { approval?: unknown }).approval;
      } else {
        Object.defineProperty(
          Object.prototype,
          "approval",
          objectPrototypeApprovalDescriptor,
        );
      }
      if (objectPrototypeHookDescriptor === undefined) {
        delete (
          Object.prototype as { beforeFinalRevalidationForTests?: unknown }
        ).beforeFinalRevalidationForTests;
      } else {
        Object.defineProperty(
          Object.prototype,
          "beforeFinalRevalidationForTests",
          objectPrototypeHookDescriptor,
        );
      }
      Object.defineProperty(
        typedArrayPrototype,
        "buffer",
        typedArrayBufferDescriptor,
      );
      Object.defineProperty(
        typedArrayPrototype,
        "byteLength",
        typedArrayByteLengthDescriptor,
      );
      Object.defineProperty(
        typedArrayPrototype,
        "byteOffset",
        typedArrayByteOffsetDescriptor,
      );
      Object.defineProperty(
        typedArrayPrototype,
        "length",
        typedArrayLengthDescriptor,
      );
      Object.defineProperty(hashPrototype, "update", hashUpdateDescriptor);
      Object.defineProperty(hashPrototype, "digest", hashDigestDescriptor);
      Object.defineProperty(
        cryptoModule,
        "createHash",
        cryptoCreateHashDescriptor,
      );
      syncBuiltinESMExports();
      Object.defineProperty(globalThis, "BigInt", bigintDescriptor);
      Object.defineProperty(globalThis, "Number", numberDescriptor);
      Object.defineProperty(
        Promise.prototype,
        "constructor",
        promiseConstructorDescriptor,
      );
      Object.defineProperty(Promise, Symbol.species, promiseSpeciesDescriptor);
      Object.defineProperty(Promise, "resolve", promiseResolveDescriptor);
      Object.defineProperty(Promise, "all", promiseAllDescriptor);
    }

    expect({
      arrayIteratorCalls,
      bigintCalls,
      cryptoCreateHashCalls,
      hashDigestCalls,
      hashUpdateCalls,
      numberCalls,
      objectPrototypeApprovalCalls,
      objectPrototypeHookCalls,
      promiseAllCalls,
      promiseConstructorCalls,
      promiseResolveCalls,
      promiseSpeciesCalls,
      typedArrayBufferCalls,
      typedArrayByteLengthCalls,
      typedArrayByteOffsetCalls,
      typedArrayLengthCalls,
    }).toEqual({
      arrayIteratorCalls: 0,
      bigintCalls: 0,
      cryptoCreateHashCalls: 0,
      hashDigestCalls: 0,
      hashUpdateCalls: 0,
      numberCalls: 0,
      objectPrototypeApprovalCalls: 0,
      objectPrototypeHookCalls: 0,
      promiseAllCalls: 0,
      promiseConstructorCalls: 0,
      promiseResolveCalls: 0,
      promiseSpeciesCalls: 0,
      typedArrayBufferCalls: 0,
      typedArrayByteLengthCalls: 0,
      typedArrayByteOffsetCalls: 0,
      typedArrayLengthCalls: 0,
    });
    expect(malformedRecordError).toBeInstanceOf(
      FloodgateV7ApprovedKeyEnrollmentError,
    );
    expect(operationError).toBeUndefined();
    expect(claimedInstanceId).toBe(INSTANCE_ID);
    expect(claimedRecordBytes).toBe(expectedRecordBytes);
  });

  it("does not let a poisoned root-component iterator redirect the fixed record path", async () => {
    const fixture = await temporaryRecord();
    const redirectedInstanceId = "56".repeat(32);
    const redirectedCandidate = candidateCanonicalJson(
      EUID,
      redirectedInstanceId,
    );
    const redirectedParent = path.join(fixture.home, "redirected");
    await fs.promises.mkdir(redirectedParent, { mode: 0o700 });
    await fs.promises.chmod(redirectedParent, 0o700);
    const redirectedRecord = path.join(
      redirectedParent,
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
    );
    await fs.promises.writeFile(
      redirectedRecord,
      canonicalRecordJson(
        approvedRecord(redirectedCandidate, redirectedInstanceId, EUID),
      ),
      { mode: 0o600 },
    );
    await fs.promises.chmod(redirectedRecord, 0o600);
    const arrayIteratorDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    );
    if (
      arrayIteratorDescriptor === undefined ||
      typeof arrayIteratorDescriptor.value !== "function"
    ) {
      throw new Error("native Array iterator descriptor is unavailable");
    }
    const nativeArrayIterator = arrayIteratorDescriptor.value as (
      this: unknown[],
    ) => Iterator<unknown>;
    let rootIteratorCalls = 0;
    let operationError: unknown;
    let claimedInstanceId: string | undefined;

    try {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        configurable: true,
        value: function (this: unknown[]) {
          if (
            (this as unknown) ===
            FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS
          ) {
            rootIteratorCalls += 1;
            let complete = false;
            return {
              next: () => {
                if (!complete) {
                  complete = true;
                  return { done: false, value: "redirected" };
                }
                return { done: true, value: undefined };
              },
            };
          }
          return Reflect.apply(nativeArrayIterator, this, []);
        },
      });
      try {
        const capability =
          await loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
            effectiveUserId: EUID,
            homeDirectory: fixture.home,
          });
        claimedInstanceId =
          claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(
            capability,
          ).key_instance_id;
      } catch (error) {
        operationError = error;
      }
    } finally {
      Object.defineProperty(
        Array.prototype,
        Symbol.iterator,
        arrayIteratorDescriptor,
      );
    }

    expect(operationError).toBeUndefined();
    expect(rootIteratorCalls).toBe(0);
    expect(claimedInstanceId).toBe(INSTANCE_ID);
    expect(claimedInstanceId).not.toBe(redirectedInstanceId);
  });

  it("rejects unsafe mode, symlink, malformed UTF-8, CRLF, and the actual home", async () => {
    const wrongMode = await temporaryRecord();
    await fs.promises.chmod(wrongMode.record, 0o644);
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: wrongMode.home,
      }),
    ).rejects.toMatchObject({ phase: "record-read" });

    const symlink = await temporaryRecord();
    const target = `${symlink.record}.target`;
    await fs.promises.rename(symlink.record, target);
    await fs.promises.symlink(target, symlink.record);
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: symlink.home,
      }),
    ).rejects.toMatchObject({ phase: "record-read" });

    const ancestorSwap = await temporaryRecord();
    const ancestor = path.join(ancestorSwap.home, "Library");
    const movedAncestor = path.join(ancestorSwap.home, "Library-moved");
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: ancestorSwap.home,
        beforeFinalRevalidationForTests: async () => {
          await fs.promises.rename(ancestor, movedAncestor);
          await fs.promises.symlink(movedAncestor, ancestor);
        },
      }),
    ).rejects.toMatchObject({ phase: "record-read" });

    const invalidUtf8 = await temporaryRecord(
      Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc0, 0xaf, 0x7d, 0x0a]),
    );
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: invalidUtf8.home,
      }),
    ).rejects.toMatchObject({ phase: "record-validation" });

    const crlf = await temporaryRecord(
      canonicalRecordJson(approvedRecord()).replace(/\n$/, "\r\n"),
    );
    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: crlf.home,
      }),
    ).rejects.toMatchObject({ phase: "record-validation" });

    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: path.resolve(os.homedir()),
      }),
    ).rejects.toMatchObject({ phase: "test-boundary" });
  });

  it("rejects an absolute symlink alias to the actual real home at the test boundary", async () => {
    const aliasRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-approved-home-alias-"),
    );
    temporaryRoots.push(aliasRoot);
    const alias = path.resolve(aliasRoot, "production-home-alias");
    await fs.promises.symlink(
      await fs.promises.realpath(os.homedir()),
      alias,
      "dir",
    );

    await expect(
      loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: alias,
      }),
    ).rejects.toMatchObject({ phase: "test-boundary" });
  });

  it("keeps the operator preflight import-safe and argumentless", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "ml/inspect-floodgate-v7-approved-key-enrollment.ts",
      ),
      "utf8",
    );
    expect(source).toContain("if (require.main === module)");
    expect(source).toContain("process.argv.length !== 2");
    expect(source).not.toMatch(/node:(?:child_process|net|http|https)/);
  });
});
