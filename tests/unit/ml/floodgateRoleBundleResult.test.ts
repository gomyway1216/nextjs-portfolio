import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  serializeFloodgateRoleBundleManifest,
  type VerifiedFloodgateRoleBundle,
} from "../../../ml/floodgate-role-bundle";
import {
  FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE,
  FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
  assertFloodgateRoleBundleExecutionEvidenceCoreForTests,
  assertFloodgateRoleBundleResultBindingCoreForTests,
  assertFloodgateRoleBundleResultProjectionCoreForTests,
  parsePinnedFloodgateRoleBundleResultReceiptCoreForTests,
  projectFloodgateRoleBundleResultBindingCoreForTests,
  runPinnedFloodgateRoleBundleVerificationCoreForTests,
  type FloodgateRoleBundleResultReceipt,
} from "../../../ml/floodgate-role-bundle-result";

function trackedBytes(artifactPath: string): Uint8Array {
  return fs.readFileSync(path.join(process.cwd(), artifactPath));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function evidenceIdentities() {
  return Object.values(FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE).flatMap(
    (attempt) => Object.values(attempt),
  );
}

function evidenceBytes(): ReadonlyMap<string, Uint8Array> {
  return new Map(
    evidenceIdentities().map((identity) => [
      identity.path,
      trackedBytes(identity.path),
    ]),
  );
}

function receiptBytes(): Uint8Array {
  return trackedBytes(FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH);
}

function receipt(): Readonly<FloodgateRoleBundleResultReceipt> {
  return parsePinnedFloodgateRoleBundleResultReceiptCoreForTests(
    receiptBytes(),
  );
}

function verifiedBundle(
  result = receipt(),
): Readonly<VerifiedFloodgateRoleBundle> {
  const manifestText = serializeFloodgateRoleBundleManifest(
    result.manifest.value,
  );
  return {
    manifest: result.manifest.value,
    manifestText,
    roleLock: {} as VerifiedFloodgateRoleBundle["roleLock"],
    producerRevision: FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
    verifierRevision: "f".repeat(40),
  };
}

describe("tracked Floodgate role-bundle result receipt", () => {
  it("accepts only the byte-pinned canonical receipt", () => {
    const bytes = receiptBytes();
    expect(bytes.byteLength).toBe(FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES);
    expect(sha256(bytes)).toBe(FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256);
    expect(() =>
      parsePinnedFloodgateRoleBundleResultReceiptCoreForTests(bytes),
    ).not.toThrow();

    const text = new TextDecoder().decode(bytes);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    expect(`${JSON.stringify(JSON.parse(text), null, 2)}\n`).toBe(text);
    expect(text).not.toMatch(/"\/(?:Users|home|tmp)\//);

    const tampered = new Uint8Array(bytes);
    tampered[128] ^= 1;
    expect(() =>
      parsePinnedFloodgateRoleBundleResultReceiptCoreForTests(tampered),
    ).toThrow(/identity is not pinned/);
    expect(() =>
      parsePinnedFloodgateRoleBundleResultReceiptCoreForTests(bytes.slice(1)),
    ).toThrow(/identity is not pinned/);
  });

  it("authenticates all six tracked execution evidence files", () => {
    const bytes = evidenceBytes();
    for (const identity of evidenceIdentities()) {
      const artifact = bytes.get(identity.path)!;
      expect([artifact.byteLength, sha256(artifact)]).toEqual([
        identity.bytes,
        identity.sha256,
      ]);
    }
    expect(() =>
      assertFloodgateRoleBundleExecutionEvidenceCoreForTests(
        receipt(),
        bytes,
      ),
    ).not.toThrow();

    const changed = new Map(bytes);
    const output = FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE.verify.output;
    const changedOutput = new Uint8Array(changed.get(output.path)!);
    changedOutput[64] ^= 1;
    changed.set(output.path, changedOutput);
    expect(() =>
      assertFloodgateRoleBundleExecutionEvidenceCoreForTests(
        receipt(),
        changed,
      ),
    ).toThrow(/identity differs/);
  });

  it("binds the embedded manifest to the independently verified bundle", () => {
    const result = receipt();
    expect(() =>
      assertFloodgateRoleBundleResultBindingCoreForTests(
        result,
        verifiedBundle(result),
      ),
    ).not.toThrow();

    const changed = {
      ...verifiedBundle(result),
      producerRevision: "0".repeat(40),
    };
    expect(() =>
      assertFloodgateRoleBundleResultBindingCoreForTests(result, changed),
    ).toThrow(/does not match/);
  });

  it.each([
    ["manifest", (root: Record<string, unknown>) => {
      const manifest = root.manifest as Record<string, unknown>;
      const identity = manifest.identity as Record<string, unknown>;
      identity.sha256 = "0".repeat(64);
    }],
    ["attempt", (root: Record<string, unknown>) => {
      const execution = root.execution as { attempts: Record<string, unknown>[] };
      execution.attempts[1].elapsed_ms = 0;
    }],
    ["post-run audit", (root: Record<string, unknown>) => {
      const audit = root.post_run_audit as Record<string, unknown>;
      audit.bundle_filesystem_closure_unchanged = false;
    }],
  ] as const)("rejects a changed %s projection", (_label, mutate) => {
    const candidate = JSON.parse(
      new TextDecoder().decode(receiptBytes()),
    ) as Record<string, unknown>;
    const expected =
      projectFloodgateRoleBundleResultBindingCoreForTests(candidate);
    mutate(candidate);
    expect(() =>
      assertFloodgateRoleBundleResultProjectionCoreForTests(
        candidate,
        expected,
      ),
    ).toThrow(/projection does not match/);
  });
});

describe("pinned Floodgate role-bundle receipt verification", () => {
  function snapshots() {
    const output = new Map<
      string,
      Readonly<{ bytes: Uint8Array; identity: string }>
    >();
    output.set(FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH, {
      bytes: receiptBytes(),
      identity: "result-inode",
    });
    for (const [artifactPath, bytes] of evidenceBytes()) {
      output.set(artifactPath, {
        bytes,
        identity: `evidence-inode:${artifactPath}`,
      });
    }
    return output;
  }

  it("returns only after before/after snapshots and Git blobs agree", async () => {
    const artifacts = snapshots();
    const verified = verifiedBundle();
    const blobRevisions: string[] = [];
    const ancestryEdges: [string, string][] = [];
    const result = await runPinnedFloodgateRoleBundleVerificationCoreForTests(
      "f".repeat(40),
      {
        readTrackedArtifact: async (artifactPath) => artifacts.get(artifactPath)!,
        verifyBundle: async () => verified,
        readGitBlob: async (revision, artifactPath) => {
          blobRevisions.push(revision);
          return artifacts.get(artifactPath)!.bytes;
        },
        isAncestor: async (ancestor, descendant) => {
          ancestryEdges.push([ancestor, descendant]);
          return true;
        },
      },
    );
    expect(result.result).toEqual(receipt());
    expect(result.manifest).toEqual(verified.manifest);
    expect(new Set(blobRevisions)).toEqual(
      new Set([FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION]),
    );
    expect(ancestryEdges).toEqual([
      [
        FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
        FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,
      ],
      [
        FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,
        "f".repeat(40),
      ],
    ]);
  });

  it("rejects a tracked receipt/evidence replacement during verification", async () => {
    const artifacts = snapshots();
    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) => artifacts.get(artifactPath)!,
        verifyBundle: async () => {
          const current = artifacts.get(
            FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH,
          )!;
          artifacts.set(FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH, {
            ...current,
            identity: "replacement-inode",
          });
          return verifiedBundle();
        },
        readGitBlob: async (_revision, artifactPath) =>
          artifacts.get(artifactPath)!.bytes,
        isAncestor: async () => true,
      }),
    ).rejects.toThrow(/changed during bundle verification/);
  });

  it("rejects Git blob substitution and unrelated verifier ancestry", async () => {
    const artifacts = snapshots();
    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) => artifacts.get(artifactPath)!,
        verifyBundle: async () => verifiedBundle(),
        readGitBlob: async (_revision, artifactPath) => {
          const bytes = new Uint8Array(artifacts.get(artifactPath)!.bytes);
          if (artifactPath === FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH) {
            bytes[32] ^= 1;
          }
          return bytes;
        },
        isAncestor: async () => true,
      }),
    ).rejects.toThrow(/differs from Git/);

    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) => artifacts.get(artifactPath)!,
        verifyBundle: async () => verifiedBundle(),
        readGitBlob: async (_revision, artifactPath) =>
          artifacts.get(artifactPath)!.bytes,
        isAncestor: async () => false,
      }),
    ).rejects.toThrow(/receipt producer does not descend/);

    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) => artifacts.get(artifactPath)!,
        verifyBundle: async () => verifiedBundle(),
        readGitBlob: async (_revision, artifactPath) =>
          artifacts.get(artifactPath)!.bytes,
        isAncestor: async (ancestor) =>
          ancestor ===
          FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
      }),
    ).rejects.toThrow(/current verifier does not descend/);

    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) => artifacts.get(artifactPath)!,
        verifyBundle: async () => ({
          ...verifiedBundle(),
          verifierRevision: "e".repeat(40),
        }),
        readGitBlob: async (_revision, artifactPath) =>
          artifacts.get(artifactPath)!.bytes,
        isAncestor: async () => true,
      }),
    ).rejects.toThrow(/verifier revision differs/);
  });
});

describe("Floodgate role-bundle article parity", () => {
  it("keeps the execution identities and integrity boundary in both languages", () => {
    const japanese = fs.readFileSync(
      path.join(process.cwd(), "docs/blog-shogi-floodgate-fresh-sibling-run.md"),
      "utf8",
    );
    const english = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-fresh-sibling-run.en.md",
      ),
      "utf8",
    );
    const facts = [
      FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
      "2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9",
      "29,404,000",
      "28,281,000",
      "847,243",
      "2,121,074",
      "integrity-only-not-playing-strength-evidence",
    ];
    for (const fact of facts) {
      expect(japanese).toContain(fact);
      expect(english).toContain(fact);
    }
  });
});
