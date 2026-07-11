import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_LOCK_RESULT_RECEIPT_PATH,
  assertFloodgateRoleLockResultProjectionCoreForTests,
  parsePinnedFloodgateRoleLockResultReceiptCoreForTests,
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
      "full replay status",
      (root: Record<string, unknown>) => {
        object(root.post_run_audit).independent_full_replay_verification =
          "forged";
      },
    ],
  ] as const)("rejects a changed %s binding", (_label, mutate) => {
    const candidate =
      parsePinnedFloodgateRoleLockResultReceiptCoreForTests(receiptBytes());
    const expected =
      projectFloodgateRoleLockResultBindingCoreForTests(candidate);
    const changed = object(JSON.parse(JSON.stringify(candidate)) as unknown);
    mutate(changed);
    expect(() =>
      assertFloodgateRoleLockResultProjectionCoreForTests(changed, expected),
    ).toThrow(/projection does not match expected evidence/);
  });
});
