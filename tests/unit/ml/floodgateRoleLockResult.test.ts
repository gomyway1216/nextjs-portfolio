import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_PATH,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_BYTES,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_PATH,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_SHA256,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_BYTES,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_PATH,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_SHA256,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_BYTES,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_PATH,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_SHA256,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_BYTES,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_PATH,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_SHA256,
  FLOODGATE_ROLE_LOCK_FULL_REPLAY_VERIFIER_REVISION,
  assertFloodgateRoleLockFullReplayTargetsBindArtifactsCoreForTests,
  assertFloodgateRoleLockResultProjectionCoreForTests,
  parsePinnedFloodgateRoleLockResultReceiptCoreForTests,
  parseFloodgateRoleLockFailedFullReplayEvidenceCoreForTests,
  parseFloodgateRoleLockFullReplayEvidenceCoreForTests,
  projectFloodgateRoleLockResultBindingCoreForTests,
} from "../../../ml/floodgate-role-lock";

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("fixture value is not an object");
  }
  return value as Record<string, unknown>;
}

function receiptBytes(): Uint8Array {
  return fs.readFileSync(
    path.join(process.cwd(), FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_PATH),
  );
}

function trackedBytes(artifactPath: string): Uint8Array {
  return fs.readFileSync(path.join(process.cwd(), artifactPath));
}

describe("tracked Floodgate role-lock result receipt", () => {
  it("accepts only the byte-pinned tracked receipt", () => {
    const bytes = receiptBytes();
    expect(bytes.byteLength).toBe(FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_BYTES);
    expect(() =>
      parsePinnedFloodgateRoleLockResultReceiptCoreForTests(bytes),
    ).not.toThrow();

    const tampered = new Uint8Array(bytes);
    tampered[128] ^= 1;
    expect(() =>
      parsePinnedFloodgateRoleLockResultReceiptCoreForTests(tampered),
    ).toThrow(/identity is not pinned/);
    expect(() =>
      parsePinnedFloodgateRoleLockResultReceiptCoreForTests(bytes.slice(1)),
    ).toThrow(/identity is not pinned/);
  });

  it("directly authenticates the tracked successful and failed full-replay evidence", () => {
    const statusBytes = trackedBytes(
      FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_PATH,
    );
    const logBytes = trackedBytes(FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_PATH);
    const failedStatusBytes = trackedBytes(
      FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_PATH,
    );
    const failedLogBytes = trackedBytes(
      FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_PATH,
    );
    expect([
      [statusBytes.byteLength, byteSha256(statusBytes)],
      [logBytes.byteLength, byteSha256(logBytes)],
      [failedStatusBytes.byteLength, byteSha256(failedStatusBytes)],
      [failedLogBytes.byteLength, byteSha256(failedLogBytes)],
    ]).toEqual([
      [
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_BYTES,
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_SHA256,
      ],
      [
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_BYTES,
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_SHA256,
      ],
      [
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_BYTES,
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_SHA256,
      ],
      [
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_BYTES,
        FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_SHA256,
      ],
    ]);

    const successful = parseFloodgateRoleLockFullReplayEvidenceCoreForTests(
      statusBytes,
      logBytes,
      {
        status: {
          path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_PATH,
          bytes: FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_BYTES,
          sha256: FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_SHA256,
        },
        log: {
          path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_PATH,
          bytes: FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_BYTES,
          sha256: FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_SHA256,
        },
      },
      PRODUCER_REVISION,
    );
    const failed = parseFloodgateRoleLockFailedFullReplayEvidenceCoreForTests(
      failedStatusBytes,
      failedLogBytes,
      {
        status: {
          path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_PATH,
          bytes: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_BYTES,
          sha256:
            FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_SHA256,
        },
        log: {
          path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_PATH,
          bytes: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_BYTES,
          sha256: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_SHA256,
        },
      },
      PRODUCER_REVISION,
    );
    expect(successful.semanticReceipt).toMatchObject({
      attempt: 2,
      startedAt: "2026-07-11T15:49:52.852Z",
      finishedAt: "2026-07-11T19:44:12.426Z",
      elapsedMs: 14_059_521,
      processExitCode: 0,
    });
    expect(failed).toMatchObject({
      attempt: 1,
      status: "failed",
      processExitCode: 1,
    });

    const result = object(
      parsePinnedFloodgateRoleLockResultReceiptCoreForTests(receiptBytes()),
    );
    const replay = object(
      object(result.runtime_observation).independent_full_replay,
    );
    expect(object(replay.successful_attempt)).toMatchObject({
      status: "pass",
      started_at: successful.semanticReceipt.startedAt,
      finished_at: successful.semanticReceipt.finishedAt,
      elapsed_ms: successful.semanticReceipt.elapsedMs,
      status_receipt: successful.status,
      log_receipt: successful.log,
    });
    expect(object(replay.prior_failed_attempt)).toMatchObject({
      attempt: failed.attempt,
      status: failed.status,
      started_at: failed.startedAt,
      finished_at: failed.finishedAt,
      error: failed.error,
      status_receipt: failed.statusReceipt,
      log_receipt: failed.logReceipt,
    });
  });

  it.each([
    [
      "producer",
      (root: Record<string, unknown>) => {
        object(root.pipeline).source_revision = "0".repeat(40);
      },
    ],
    [
      "raw manifest",
      (root: Record<string, unknown>) => {
        object(object(root.inputs).raw_manifest).sha256 = "0".repeat(64);
      },
    ],
    [
      "training role",
      (root: Record<string, unknown>) => {
        object(object(root.roles).training).games = 999;
      },
    ],
    [
      "artifact bytes",
      (root: Record<string, unknown>) => {
        object(object(root.artifacts).manifest).bytes = 1;
      },
    ],
    [
      "runtime observation",
      (root: Record<string, unknown>) => {
        object(root.runtime_observation).wall_seconds = 0;
      },
    ],
    [
      "full replay status",
      (root: Record<string, unknown>) => {
        object(root.post_run_audit).independent_full_replay_verification =
          "forged";
      },
    ],
  ] as const)("rejects a changed %s binding", (_label, mutate) => {
    const candidate = JSON.parse(
      new TextDecoder().decode(receiptBytes()),
    ) as unknown;
    const expected =
      projectFloodgateRoleLockResultBindingCoreForTests(candidate);
    const changed = object(JSON.parse(JSON.stringify(candidate)) as unknown);
    mutate(changed);
    expect(() =>
      assertFloodgateRoleLockResultProjectionCoreForTests(changed, expected),
    ).toThrow(/projection does not match expected evidence/);
  });

  it("keeps nested failed-attempt receipt identities inside the exact projection", () => {
    const candidate = object(
      JSON.parse(new TextDecoder().decode(receiptBytes())) as unknown,
    );
    object(candidate.runtime_observation).independent_full_replay = {
      gate_attempt: 2,
      prior_failed_attempt: {
        status_receipt: {
          path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_PATH,
          bytes: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_BYTES,
          sha256:
            FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_SHA256,
        },
      },
    };
    const expected = projectFloodgateRoleLockResultBindingCoreForTests(candidate);
    const changed = object(JSON.parse(JSON.stringify(candidate)) as unknown);
    object(
      object(
        object(object(changed.runtime_observation).independent_full_replay)
          .prior_failed_attempt,
      ).status_receipt,
    ).sha256 = "0".repeat(64);
    expect(() =>
      assertFloodgateRoleLockResultProjectionCoreForTests(changed, expected),
    ).toThrow(/projection does not match expected evidence/);
  });
});

const PRODUCER_REVISION = "fc18554e1ff61e2bd7a0f7a24f277ce4e418a175";
const EVENT_SCHEMA =
  "shogi-floodgate-role-lock-full-verification-event-v2";
const STATUS_SCHEMA =
  "shogi-floodgate-role-lock-full-verification-status-v2";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function byteSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stat(size: number, permissions = "0600"): Record<string, string> {
  return {
    dev: "16777234",
    ino: String(1000 + size),
    mode: permissions === "0700" ? "16832" : "33152",
    permissions_octal: permissions,
    nlink: "1",
    uid: "501",
    gid: "20",
    rdev: "0",
    size: String(size),
    blksize: "4096",
    blocks: "8",
    mtime_ns: "1783768590000000000",
    ctime_ns: "1783768590000000000",
    birthtime_ns: "1783768590000000000",
  };
}

function watched(): Record<string, unknown> {
  return {
    parent: stat(160, "0700"),
    role_root: stat(160, "0700"),
    entries: ["allocation.json", "manifest.json", "materialized-input.json"],
    targets: {
      "allocation.json": {
        identity: stat(236_504_991),
        sha256:
          "e252d2237a7ba50b959f6bbe9ebc11157623185ec7d5d949727855de4c0159b4",
      },
      "manifest.json": {
        identity: stat(5_516_989),
        sha256:
          "e6a54ed004e961f7924acabb174d1da4ef6c9f6e398e23afd3da3532445b084e",
      },
      "materialized-input.json": {
        identity: stat(31_265_897),
        sha256:
          "ed43d7a2f3918178472aea03f897d13d4bd526a6c82f79b1427d3e4f1e666719",
      },
    },
  };
}

function gitReceipt(): Record<string, unknown> {
  return {
    head: FLOODGATE_ROLE_LOCK_FULL_REPLAY_VERIFIER_REVISION,
    tracked_tree_clean: true,
    untracked_tree_clean: true,
    replace_refs_absent: true,
    producer_is_ancestor: true,
  };
}

function baseEvent(event: string, state: string): Record<string, unknown> {
  return {
    schema: EVENT_SCHEMA,
    event,
    state,
    attempt: 2,
    contract: "verifyExistingFloodgateRoleLock",
    started_at: "2026-07-11T16:00:00.000Z",
    pid: 4242,
    repository_root:
      "/Users/yudaiyaguchi/.codex/worktrees/shogi-floodgate-role-bundle",
    producer_revision: PRODUCER_REVISION,
    verifier_revision: FLOODGATE_ROLE_LOCK_FULL_REPLAY_VERIFIER_REVISION,
    node: "v22.13.0",
    raw_lock_root:
      "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-q1-2026-raw-lock",
    role_lock_root:
      "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-q1-2026-role-lock-v1",
    legacy_protected_position_ids_path:
      "/Users/yudaiyaguchi/.codex/worktrees/shogi-floodgate-role-bundle/ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt",
    status_path:
      "/Users/yudaiyaguchi/.codex/full-replay-evidence/role-lock-full-verify-b086243-attempt-2.status.json",
    log_path:
      "/Users/yudaiyaguchi/.codex/full-replay-evidence/role-lock-full-verify-b086243-attempt-2.log",
  };
}

interface FullReplayFixture {
  readonly started: Record<string, unknown>;
  readonly succeeded: Record<string, unknown>;
  readonly status: Record<string, unknown>;
  readonly statusBytes: Uint8Array;
  readonly logBytes: Uint8Array;
}

function fullReplayFixture(
  mutate?: (
    started: Record<string, unknown>,
    succeeded: Record<string, unknown>,
  ) => void,
): FullReplayFixture {
  const evidenceRoot = stat(128, "0700");
  const before = watched();
  const started = {
    ...baseEvent("role_lock_full_verifier_started", "running"),
    evidence_root: "/Users/yudaiyaguchi/.codex/full-replay-evidence",
    evidence_root_identity: jsonClone(evidenceRoot),
    git_before: gitReceipt(),
    watched_before: jsonClone(before),
  };
  const succeeded = {
    ...baseEvent("role_lock_full_verifier_succeeded", "succeeded"),
    finished_at: "2026-07-11T16:00:01.000Z",
    elapsed_ms: 1000,
    process_exit_code: 0,
    evidence_root: "/Users/yudaiyaguchi/.codex/full-replay-evidence",
    evidence_root_identity: jsonClone(evidenceRoot),
    git_before: gitReceipt(),
    git_after: gitReceipt(),
    watched_before: jsonClone(before),
    watched_after: jsonClone(before),
    watched_closure_unchanged: true,
    verified_manifest_schema: "shogi-floodgate-role-lock-v1",
    verified_manifest_status: "complete-label-blind-role-lock",
  };
  mutate?.(started, succeeded);
  const status = { ...succeeded, schema: STATUS_SCHEMA };
  return {
    started,
    succeeded,
    status,
    statusBytes: bytes(`${JSON.stringify(status, null, 2)}\n`),
    logBytes: bytes(
      `${JSON.stringify(started)}\n${JSON.stringify(succeeded)}\n`,
    ),
  };
}

function parseFullReplay(
  statusBytes: Uint8Array,
  logBytes: Uint8Array,
) {
  return parseFloodgateRoleLockFullReplayEvidenceCoreForTests(
    statusBytes,
    logBytes,
    {
      status: {
        path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_PATH,
        bytes: statusBytes.byteLength,
        sha256: byteSha256(statusBytes),
      },
      log: {
        path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_PATH,
        bytes: logBytes.byteLength,
        sha256: byteSha256(logBytes),
      },
    },
    PRODUCER_REVISION,
  );
}

describe("Floodgate role-lock full-replay evidence v2", () => {
  it("accepts exactly one canonical started-to-succeeded attempt and freezes the semantic receipt", () => {
    const fixture = fullReplayFixture();
    const parsed = parseFullReplay(fixture.statusBytes, fixture.logBytes);

    expect(parsed.semanticReceipt).toMatchObject({
      attempt: 2,
      contract: "verifyExistingFloodgateRoleLock",
      producerRevision: PRODUCER_REVISION,
      verifierRevision: FLOODGATE_ROLE_LOCK_FULL_REPLAY_VERIFIER_REVISION,
      node: "v22.13.0",
      elapsedMs: 1000,
      processExitCode: 0,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.semanticReceipt)).toBe(true);
    expect(Object.isFrozen(parsed.semanticReceipt.watchedBefore.targets)).toBe(
      true,
    );
  });

  it("rejects a same-content role artifact substituted onto a different inode", () => {
    const fixture = fullReplayFixture();
    const parsed = parseFullReplay(fixture.statusBytes, fixture.logBytes);
    const watchedReceipt = parsed.semanticReceipt.watchedBefore;
    const fileIdentity = (
      target: (typeof watchedReceipt.targets)[keyof typeof watchedReceipt.targets],
    ) => ({
      dev: BigInt(target.identity.dev),
      ino: BigInt(target.identity.ino),
      size: BigInt(target.identity.size),
      ctimeNs: BigInt(target.identity.ctimeNs),
      mtimeNs: BigInt(target.identity.mtimeNs),
    });
    const closure = {
      parent: {
        dev: BigInt(watchedReceipt.parent.dev),
        ino: BigInt(watchedReceipt.parent.ino),
        ctimeNs: BigInt(watchedReceipt.parent.ctimeNs) + BigInt(1),
      },
      root: {
        dev: BigInt(watchedReceipt.roleRoot.dev),
        ino: BigInt(watchedReceipt.roleRoot.ino),
        ctimeNs: BigInt(watchedReceipt.roleRoot.ctimeNs),
      },
      files: {
        allocation: fileIdentity(
          watchedReceipt.targets["allocation.json"],
        ),
        manifest: fileIdentity(watchedReceipt.targets["manifest.json"]),
        materializedInput: fileIdentity(
          watchedReceipt.targets["materialized-input.json"],
        ),
      },
    };
    const artifacts = {
      allocation: {
        bytes: 236_504_991,
        sha256:
          "e252d2237a7ba50b959f6bbe9ebc11157623185ec7d5d949727855de4c0159b4",
      },
      manifest: {
        bytes: 5_516_989,
        sha256:
          "e6a54ed004e961f7924acabb174d1da4ef6c9f6e398e23afd3da3532445b084e",
      },
      materializedInput: {
        bytes: 31_265_897,
        sha256:
          "ed43d7a2f3918178472aea03f897d13d4bd526a6c82f79b1427d3e4f1e666719",
      },
    };
    expect(() =>
      assertFloodgateRoleLockFullReplayTargetsBindArtifactsCoreForTests(
        parsed,
        artifacts,
        closure,
      ),
    ).not.toThrow();

    const substituted = {
      ...closure,
      files: {
        ...closure.files,
        manifest: {
          ...closure.files.manifest,
          ino: closure.files.manifest.ino + BigInt(1),
        },
      },
    };
    expect(() =>
      assertFloodgateRoleLockFullReplayTargetsBindArtifactsCoreForTests(
        parsed,
        artifacts,
        substituted,
      ),
    ).toThrow(/does not bind/);
  });

  it.each([
    [
      "v1 schema",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        succeeded.schema =
          "shogi-floodgate-role-lock-full-verification-event-v1";
      },
    ],
    [
      "failed event",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        succeeded.event = "role_lock_full_verifier_failed";
        succeeded.state = "failed";
      },
    ],
    [
      "nonzero exit",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        succeeded.process_exit_code = 1;
      },
    ],
    [
      "pending manifest status",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        succeeded.verified_manifest_status = "pending";
      },
    ],
    [
      "extra recursive key",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        object(succeeded.git_after).unexpected = true;
      },
    ],
    [
      "changed Git closure",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        object(succeeded.git_after).head = "0".repeat(40);
      },
    ],
    [
      "changed watched target",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        object(object(succeeded.watched_after).targets)["manifest.json"] = {
          identity: stat(5_516_989),
          sha256: "0".repeat(64),
        };
      },
    ],
    [
      "public target permissions",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        object(
          object(object(succeeded.watched_after).targets)["manifest.json"],
        ).identity = stat(5_516_989, "0644");
      },
    ],
    [
      "mode-permission disagreement",
      (started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        for (const watchedValue of [
          started.watched_before,
          succeeded.watched_before,
          succeeded.watched_after,
        ]) {
          object(
            object(object(object(watchedValue).targets)["manifest.json"])
              .identity,
          ).mode = String(0o100644);
        }
      },
    ],
    [
      "mode above POSIX range",
      (started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        const bypassMode = (
          BigInt(2 ** 32) + BigInt(0o100600)
        ).toString();
        for (const watchedValue of [
          started.watched_before,
          succeeded.watched_before,
          succeeded.watched_after,
        ]) {
          object(
            object(object(object(watchedValue).targets)["manifest.json"])
              .identity,
          ).mode = bypassMode;
        }
      },
    ],
    [
      "false watched closure flag",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        succeeded.watched_closure_unchanged = false;
      },
    ],
    [
      "backwards finish time",
      (_started: Record<string, unknown>, succeeded: Record<string, unknown>) => {
        succeeded.finished_at = "2026-07-11T15:59:59.000Z";
      },
    ],
  ] as const)("rejects semantic tamper: %s", (_label, mutate) => {
    const fixture = fullReplayFixture(mutate);
    expect(() =>
      parseFullReplay(fixture.statusBytes, fixture.logBytes),
    ).toThrow(/invalid Floodgate role lock/);
  });

  it("rejects a status that does not exactly normalize from log line two", () => {
    const fixture = fullReplayFixture();
    const changedStatus = { ...fixture.status, elapsed_ms: 1001 };
    const statusBytes = bytes(`${JSON.stringify(changedStatus, null, 2)}\n`);
    expect(() => parseFullReplay(statusBytes, fixture.logBytes)).toThrow(
      /does not exactly normalize/,
    );
  });

  it("rejects missing or extra JSONL events", () => {
    const fixture = fullReplayFixture();
    const one = bytes(`${JSON.stringify(fixture.started)}\n`);
    const three = bytes(
      `${JSON.stringify(fixture.started)}\n${JSON.stringify(fixture.succeeded)}\n${JSON.stringify(fixture.succeeded)}\n`,
    );
    expect(() => parseFullReplay(fixture.statusBytes, one)).toThrow(
      /exactly two/,
    );
    expect(() => parseFullReplay(fixture.statusBytes, three)).toThrow(
      /exactly two/,
    );
  });

  it.each(["bom", "cr", "nul", "blank", "invalid-utf8"] as const)(
    "rejects %s status framing",
    (kind) => {
      const fixture = fullReplayFixture();
      const text = new TextDecoder().decode(fixture.statusBytes);
      const changed =
        kind === "bom"
          ? bytes(`\ufeff${text}`)
          : kind === "cr"
            ? bytes(text.replace("\n", "\r\n"))
            : kind === "nul"
              ? bytes(`${text.slice(0, -1)}\0\n`)
              : kind === "blank"
                ? bytes(`${text}\n`)
                : new Uint8Array([0xff, 0x0a]);
      expect(() => parseFullReplay(changed, fixture.logBytes)).toThrow(
        /invalid Floodgate role lock/,
      );
    },
  );

  it.each(["bom", "cr", "nul", "blank", "invalid-utf8"] as const)(
    "rejects %s log framing",
    (kind) => {
      const fixture = fullReplayFixture();
      const text = new TextDecoder().decode(fixture.logBytes);
      const changed =
        kind === "bom"
          ? bytes(`\ufeff${text}`)
          : kind === "cr"
            ? bytes(text.replace("\n", "\r\n"))
            : kind === "nul"
              ? bytes(`${text.slice(0, -1)}\0\n`)
              : kind === "blank"
                ? bytes(`${text}\n`)
                : new Uint8Array([0xff, 0x0a]);
      expect(() => parseFullReplay(fixture.statusBytes, changed)).toThrow(
        /invalid Floodgate role lock/,
      );
    },
  );

  it("rejects an identity that does not bind the supplied evidence bytes", () => {
    const fixture = fullReplayFixture();
    expect(() =>
      parseFloodgateRoleLockFullReplayEvidenceCoreForTests(
        fixture.statusBytes,
        fixture.logBytes,
        {
          status: {
            path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_STATUS_PATH,
            bytes: fixture.statusBytes.byteLength,
            sha256: "0".repeat(64),
          },
          log: {
            path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_LOG_PATH,
            bytes: fixture.logBytes.byteLength,
            sha256: byteSha256(fixture.logBytes),
          },
        },
        PRODUCER_REVISION,
      ),
    ).toThrow(/does not bind/);
  });
});

function failedFullReplayFixture(
  mutate?: (
    started: Record<string, unknown>,
    failed: Record<string, unknown>,
  ) => void,
) {
  const logPath =
    "/Users/yudaiyaguchi/.codex/shogi-data/role-lock-full-verify-b086243-20260711T114441Z.log";
  const started = {
    event: "role_lock_full_verifier_started",
    state: "running",
    started_at: "2026-07-11T11:45:56.673Z",
    pid: 83396,
    repository_root:
      "/Users/yudaiyaguchi/.codex/worktrees/shogi-floodgate-role-bundle",
    producer_revision: PRODUCER_REVISION,
    verifier_revision: FLOODGATE_ROLE_LOCK_FULL_REPLAY_VERIFIER_REVISION,
    node: "v22.13.0",
    raw_lock_root:
      "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-q1-2026-raw-lock",
    role_lock_root:
      "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-q1-2026-role-lock-v1",
    log_path: logPath,
    target_before_sha256: {
      "manifest.json":
        "e6a54ed004e961f7924acabb174d1da4ef6c9f6e398e23afd3da3532445b084e",
      "materialized-input.json":
        "ed43d7a2f3918178472aea03f897d13d4bd526a6c82f79b1427d3e4f1e666719",
      "allocation.json":
        "e252d2237a7ba50b959f6bbe9ebc11157623185ec7d5d949727855de4c0159b4",
    },
  };
  const failed = {
    event: "role_lock_full_verifier_failed",
    state: "failed",
    started_at: "2026-07-11T11:45:56.673Z",
    finished_at: "2026-07-11T15:35:11.239Z",
    producer_revision: PRODUCER_REVISION,
    verifier_revision: FLOODGATE_ROLE_LOCK_FULL_REPLAY_VERIFIER_REVISION,
    node: "v22.13.0",
    error:
      "invalid Floodgate role lock: existing role-lock changed during production verification",
    log_path: logPath,
  };
  mutate?.(started, failed);
  const status = {
    schema: "shogi-floodgate-role-lock-full-verification-status-v1",
    ...failed,
  };
  return {
    started,
    failed,
    status,
    statusBytes: bytes(`${JSON.stringify(status, null, 2)}\n`),
    logBytes: bytes(`${JSON.stringify(started)}\n${JSON.stringify(failed)}\n`),
  };
}

function parseFailedFullReplay(
  statusBytes: Uint8Array,
  logBytes: Uint8Array,
) {
  return parseFloodgateRoleLockFailedFullReplayEvidenceCoreForTests(
    statusBytes,
    logBytes,
    {
      status: {
        path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_PATH,
        bytes: statusBytes.byteLength,
        sha256: byteSha256(statusBytes),
      },
      log: {
        path: FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_PATH,
        bytes: logBytes.byteLength,
        sha256: byteSha256(logBytes),
      },
    },
    PRODUCER_REVISION,
  );
}

describe("Floodgate role-lock failed full-replay attempt-1 evidence", () => {
  it("reconstructs and authenticates the exact tracked failed receipt bytes", () => {
    const fixture = failedFullReplayFixture();
    expect(fixture.statusBytes.byteLength).toBe(
      FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_BYTES,
    );
    expect(byteSha256(fixture.statusBytes)).toBe(
      FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_STATUS_SHA256,
    );
    expect(fixture.logBytes.byteLength).toBe(
      FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_BYTES,
    );
    expect(byteSha256(fixture.logBytes)).toBe(
      FLOODGATE_ROLE_LOCK_FULL_REPLAY_ATTEMPT_1_FAILED_LOG_SHA256,
    );
    expect(
      parseFailedFullReplay(fixture.statusBytes, fixture.logBytes),
    ).toMatchObject({
      attempt: 1,
      status: "failed",
      verifierRevision: FLOODGATE_ROLE_LOCK_FULL_REPLAY_VERIFIER_REVISION,
      node: "v22.13.0",
      processExitCode: 1,
    });
  });

  it.each([
    [
      "error",
      (_started: Record<string, unknown>, failed: Record<string, unknown>) => {
        failed.error = "forged failure";
      },
    ],
    [
      "verifier revision",
      (_started: Record<string, unknown>, failed: Record<string, unknown>) => {
        failed.verifier_revision = "0".repeat(40);
      },
    ],
    [
      "nested target hash",
      (started: Record<string, unknown>) => {
        object(started.target_before_sha256)["manifest.json"] = "0".repeat(64);
      },
    ],
    [
      "nested extra target key",
      (started: Record<string, unknown>) => {
        object(started.target_before_sha256).unexpected = "0".repeat(64);
      },
    ],
    [
      "extra failed key",
      (_started: Record<string, unknown>, failed: Record<string, unknown>) => {
        failed.unexpected = true;
      },
    ],
  ] as const)("rejects %s tamper", (_label, mutate) => {
    const fixture = failedFullReplayFixture(mutate);
    expect(() =>
      parseFailedFullReplay(fixture.statusBytes, fixture.logBytes),
    ).toThrow(/invalid Floodgate role lock/);
  });

  it("rejects a failed status that disagrees with JSONL line two", () => {
    const fixture = failedFullReplayFixture();
    const changedStatus = { ...fixture.status, state: "running" };
    expect(() =>
      parseFailedFullReplay(
        bytes(`${JSON.stringify(changedStatus, null, 2)}\n`),
        fixture.logBytes,
      ),
    ).toThrow(/does not normalize/);
  });
});
