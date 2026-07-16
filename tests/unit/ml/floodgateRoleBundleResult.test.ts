import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
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
  assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests,
  assertFloodgateRoleBundleExecutionEvidenceCoreForTests,
  assertFloodgateRoleBundleResultBindingCoreForTests,
  assertFloodgateRoleBundleResultProjectionCoreForTests,
  interpretGitIsAncestorExitCoreForTests,
  parsePinnedFloodgateRoleBundleResultReceiptCoreForTests,
  projectFloodgateRoleBundleResultBindingCoreForTests,
  readPinnedFloodgateRoleBundleArtifactSnapshotCoreForTests,
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
      assertFloodgateRoleBundleExecutionEvidenceCoreForTests(receipt(), bytes),
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
    [
      "manifest",
      (root: Record<string, unknown>) => {
        const manifest = root.manifest as Record<string, unknown>;
        const identity = manifest.identity as Record<string, unknown>;
        identity.sha256 = "0".repeat(64);
      },
    ],
    [
      "attempt",
      (root: Record<string, unknown>) => {
        const execution = root.execution as {
          attempts: Record<string, unknown>[];
        };
        execution.attempts[1].elapsed_ms = 0;
      },
    ],
    [
      "post-run audit",
      (root: Record<string, unknown>) => {
        const audit = root.post_run_audit as Record<string, unknown>;
        audit.bundle_filesystem_closure_unchanged = false;
      },
    ],
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
        readTrackedArtifact: async (artifactPath) =>
          artifacts.get(artifactPath)!,
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
      [FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION, "f".repeat(40)],
    ]);
  });

  it("rejects a tracked receipt/evidence replacement during verification", async () => {
    const artifacts = snapshots();
    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) =>
          artifacts.get(artifactPath)!,
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
        readTrackedArtifact: async (artifactPath) =>
          artifacts.get(artifactPath)!,
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
        readTrackedArtifact: async (artifactPath) =>
          artifacts.get(artifactPath)!,
        verifyBundle: async () => verifiedBundle(),
        readGitBlob: async (_revision, artifactPath) =>
          artifacts.get(artifactPath)!.bytes,
        isAncestor: async () => false,
      }),
    ).rejects.toThrow(/receipt producer does not descend/);

    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) =>
          artifacts.get(artifactPath)!,
        verifyBundle: async () => verifiedBundle(),
        readGitBlob: async (_revision, artifactPath) =>
          artifacts.get(artifactPath)!.bytes,
        isAncestor: async (ancestor) =>
          ancestor === FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
      }),
    ).rejects.toThrow(/current verifier does not descend/);

    await expect(
      runPinnedFloodgateRoleBundleVerificationCoreForTests("f".repeat(40), {
        readTrackedArtifact: async (artifactPath) =>
          artifacts.get(artifactPath)!,
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

  it("distinguishes Git's non-ancestor exit from execution failures", () => {
    expect(interpretGitIsAncestorExitCoreForTests(null)).toBe(true);
    expect(interpretGitIsAncestorExitCoreForTests({ code: 1 })).toBe(false);
    expect(() =>
      interpretGitIsAncestorExitCoreForTests({ code: "ENOENT" }),
    ).toThrow();
    expect(() =>
      interpretGitIsAncestorExitCoreForTests({ code: 128 }),
    ).toThrow();
  });
});

describe("source-tree and pinned receipt-evidence Git closure", () => {
  const oldVerifierRevision = "b086243781396e2c197cc9e1cfab1fc6b773ae2a";
  const acceptedVerifierRevision = "e8a9197608cb48b1160b6707d97b0c4f78f90a1d";
  const repositoryRoot = "/dedicated/verifier-worktree";

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

  function closureDependencies(
    artifacts: ReturnType<typeof snapshots>,
    verifierRevision: string,
  ) {
    return {
      assertExactCleanRevision: async (
        _repositoryRoot: string,
        _expectedRevision: string,
      ) => undefined,
      readTrackedArtifact: async (artifactPath: string) =>
        artifacts.get(artifactPath)!,
      readGitBlob: async (_revision: string, artifactPath: string) =>
        artifacts.get(artifactPath)!.bytes,
      isAncestor: async (ancestor: string, descendant: string) =>
        (ancestor === FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION &&
          descendant ===
            FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION) ||
        (ancestor === FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION &&
          descendant === verifierRevision),
    };
  }

  it("accepts e8a9197, directly checks seven pinned artifacts, and never verifies the external bundle", async () => {
    const artifacts = snapshots();
    const readPaths: string[] = [];
    const blobReads: [string, string][] = [];
    const exactCleanCalls: [string, string][] = [];
    let verifyBundleCalls = 0;
    const base = closureDependencies(artifacts, acceptedVerifierRevision);
    const dependencies = {
      ...base,
      assertExactCleanRevision: async (root: string, revision: string) => {
        exactCleanCalls.push([root, revision]);
      },
      readTrackedArtifact: async (artifactPath: string) => {
        readPaths.push(artifactPath);
        return artifacts.get(artifactPath)!;
      },
      readGitBlob: async (revision: string, artifactPath: string) => {
        blobReads.push([revision, artifactPath]);
        return artifacts.get(artifactPath)!.bytes;
      },
      get verifyBundle(): never {
        verifyBundleCalls += 1;
        throw new Error("metadata closure crossed into bundle verification");
      },
    };

    await expect(
      assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
        { repositoryRoot, verifierRevision: acceptedVerifierRevision },
        dependencies,
      ),
    ).resolves.toBeUndefined();

    const expectedPaths = [
      FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH,
      ...evidenceIdentities().map((identity) => identity.path),
    ];
    expect(readPaths).toEqual([...expectedPaths, ...expectedPaths]);
    expect(blobReads).toEqual(
      expectedPaths.map((artifactPath) => [
        FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,
        artifactPath,
      ]),
    );
    expect(exactCleanCalls).toEqual([
      [repositoryRoot, acceptedVerifierRevision],
      [repositoryRoot, acceptedVerifierRevision],
    ]);
    expect(verifyBundleCalls).toBe(0);
  });

  it("rejects b086243 because it predates the receipt producer", async () => {
    const artifacts = snapshots();
    await expect(
      assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
        { repositoryRoot, verifierRevision: oldVerifierRevision },
        closureDependencies(artifacts, acceptedVerifierRevision),
      ),
    ).rejects.toThrow(/current verifier does not descend/);
  });

  it("performs no artifact or ancestry I/O when the initial source-tree boundary fails", async () => {
    const artifacts = snapshots();
    let laterIoCalls = 0;
    await expect(
      assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
        { repositoryRoot, verifierRevision: acceptedVerifierRevision },
        {
          ...closureDependencies(artifacts, acceptedVerifierRevision),
          assertExactCleanRevision: async () => {
            throw new Error("initial source tree differs");
          },
          readTrackedArtifact: async () => {
            laterIoCalls += 1;
            throw new Error("artifact read must not run");
          },
          readGitBlob: async () => {
            laterIoCalls += 1;
            throw new Error("blob read must not run");
          },
          isAncestor: async () => {
            laterIoCalls += 1;
            return false;
          },
        },
      ),
    ).rejects.toThrow(/initial source tree differs/u);
    expect(laterIoCalls).toBe(0);
  });

  it("rejects tracked replacement, Git-blob substitution, and a dirty final boundary", async () => {
    const replacedArtifacts = snapshots();
    const reads = new Map<string, number>();
    const replacementDependencies = {
      ...closureDependencies(replacedArtifacts, acceptedVerifierRevision),
      readTrackedArtifact: async (artifactPath: string) => {
        const count = (reads.get(artifactPath) ?? 0) + 1;
        reads.set(artifactPath, count);
        const snapshot = replacedArtifacts.get(artifactPath)!;
        return count === 2 &&
          artifactPath ===
            FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE.verify.output.path
          ? { ...snapshot, identity: "replacement-inode" }
          : snapshot;
      },
    };
    await expect(
      assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
        { repositoryRoot, verifierRevision: acceptedVerifierRevision },
        replacementDependencies,
      ),
    ).rejects.toThrow(/changed during bundle verification/);

    const substitutedArtifacts = snapshots();
    const substitutionDependencies = {
      ...closureDependencies(substitutedArtifacts, acceptedVerifierRevision),
      readGitBlob: async (_revision: string, artifactPath: string) => {
        const bytes = new Uint8Array(
          substitutedArtifacts.get(artifactPath)!.bytes,
        );
        if (artifactPath === FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH) {
          bytes[32] ^= 1;
        }
        return bytes;
      },
    };
    await expect(
      assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
        { repositoryRoot, verifierRevision: acceptedVerifierRevision },
        substitutionDependencies,
      ),
    ).rejects.toThrow(/differs from Git/);

    const finalBoundaryArtifacts = snapshots();
    let boundaryCall = 0;
    const finalBoundaryDependencies = {
      ...closureDependencies(finalBoundaryArtifacts, acceptedVerifierRevision),
      assertExactCleanRevision: async () => {
        boundaryCall += 1;
        if (boundaryCall === 2) throw new Error("dirty final tree");
      },
    };
    await expect(
      assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
        { repositoryRoot, verifierRevision: acceptedVerifierRevision },
        finalBoundaryDependencies,
      ),
    ).rejects.toThrow(/dirty final tree/);
    expect(boundaryCall).toBe(2);
  });

  it("rejects Proxy, accessor, symbol, extra-key, and malformed options before I/O", async () => {
    const artifacts = snapshots();
    let ioCalls = 0;
    const dependencies = {
      ...closureDependencies(artifacts, acceptedVerifierRevision),
      assertExactCleanRevision: async () => {
        ioCalls += 1;
      },
      readTrackedArtifact: async (artifactPath: string) => {
        ioCalls += 1;
        return artifacts.get(artifactPath)!;
      },
    };
    const proxy = new Proxy(
      { repositoryRoot, verifierRevision: acceptedVerifierRevision },
      {},
    );
    let accessorReads = 0;
    const accessor = { repositoryRoot } as Record<string, unknown>;
    Object.defineProperty(accessor, "verifierRevision", {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return acceptedVerifierRevision;
      },
    });
    const withSymbol = {
      repositoryRoot,
      verifierRevision: acceptedVerifierRevision,
      [Symbol("hidden")]: true,
    };
    const invalidOptions: readonly unknown[] = [
      proxy,
      accessor,
      withSymbol,
      {
        repositoryRoot,
        verifierRevision: acceptedVerifierRevision,
        rawLockRoot: "/forbidden/raw-lock",
        roleLockRoot: "/forbidden/role-lock",
        outputRoot: "/forbidden/bundle",
        legacyProtectedPositionIdsPath: "/forbidden/legacy-exclusion",
      },
      {
        repositoryRoot: "relative",
        verifierRevision: acceptedVerifierRevision,
      },
      {
        repositoryRoot,
        verifierRevision: acceptedVerifierRevision.toUpperCase(),
      },
    ];
    for (const options of invalidOptions) {
      await expect(
        assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
          options,
          dependencies,
        ),
      ).rejects.toThrow(/invalid Floodgate role-bundle result/);
    }
    expect(accessorReads).toBe(0);
    expect(ioCalls).toBe(0);
  });
});

describe("bounded pinned receipt-evidence reads", () => {
  function artifactFixture(): Readonly<{
    root: string;
    absolute: string;
  }> {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "floodgate-pinned-artifact-")),
    );
    const absolute = path.join(root, FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    return Object.freeze({ root, absolute });
  }

  it("rejects an oversized regular file before reading its contents", async () => {
    const fixture = artifactFixture();
    try {
      fs.writeFileSync(
        fixture.absolute,
        Buffer.alloc(FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES + 1),
      );
      await expect(
        readPinnedFloodgateRoleBundleArtifactSnapshotCoreForTests(
          fixture.root,
          FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH,
        ),
      ).rejects.toThrow(/size differs/u);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "rejects a FIFO without blocking on an absent writer",
    () => {
      const fixture = artifactFixture();
      try {
        const fifo = spawnSync("/usr/bin/mkfifo", [fixture.absolute]);
        expect(fifo.status).toBe(0);
        const child = spawnSync(
          process.execPath,
          [
            "-r",
            "tsx/cjs",
            "-e",
            [
              "const boundary = require('./ml/floodgate-role-bundle-result.ts');",
              "boundary.readPinnedFloodgateRoleBundleArtifactSnapshotCoreForTests(",
              "process.env.FLOODGATE_TEST_REPOSITORY_ROOT,",
              `"${FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH}"`,
              ").then(() => process.exit(2), () => process.exit(0));",
            ].join(""),
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              FLOODGATE_TEST_REPOSITORY_ROOT: fixture.root,
            },
            timeout: 2_000,
          },
        );
        expect(child.error).toBeUndefined();
        expect(child.status).toBe(0);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    },
  );
});

describe("Floodgate role-bundle article parity", () => {
  it("keeps the execution identities and integrity boundary in both languages", () => {
    const japanese = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-fresh-sibling-run.md",
      ),
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
