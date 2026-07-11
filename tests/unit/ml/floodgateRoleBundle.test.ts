import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY,
  FLOODGATE_ROLE_BUNDLE_INVALID_MANIFEST_SENTINEL,
  FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
  FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION,
  acquireAndReleaseFreshFloodgateRoleBundleRootForTests,
  assertFloodgateRoleBundleRevisionAncestryCoreForTests,
  assertFloodgateRoleBundleRoleLockClosureCoreForTests,
  captureFloodgateRoleBundleOptionsCoreForTests,
  historicalFloodgateRoleBundleRevisionBindingCoreForTests,
  materializeFloodgateRoleBundleRolesCoreForTests,
  runFreshFloodgateRoleBundleOutputLifecycleCoreForTests,
  runFreshFloodgateRoleBundleRootGuardCoreForTests,
  runFloodgateRoleBundlePublishSequenceCoreForTests,
  verifyExistingFloodgateRoleBundleArtifactsCoreForTests,
  type NonProductionFloodgateRoleBundlePublishSequenceFixture,
} from "../../../ml/floodgate-role-bundle";
import {
  floodgateCanonicalUrlGameId,
  floodgateRawObjectPath,
  type FloodgateRawCsaIndexEntry,
} from "../../../ml/floodgate-raw-lock";
import {
  FLOODGATE_ROLE_PRIORITY,
  floodgateIdentifierDigest,
  protectedSemanticPositionIds,
  type FloodgateAllocatedGame,
  type FloodgatePureAllocationArtifact,
  type FloodgateRole,
} from "../../../ml/floodgate-roles";
import { parseFloodgateCsa, sha256 } from "../../../ml/import-csa-games";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import { snapshotExistingFloodgateRoleLockFilesystemClosureCoreForTests } from "../../../ml/floodgate-role-lock";

const temporaryRoots: string[] = [];

async function freshOutputRoot(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-role-bundle-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  return path.join(container, "bundle");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

function csaUrl(index: number): string {
  const stamp = String(index).padStart(6, "0");
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+a+b+20260101${stamp}.csa`;
}

function csa(tag: number): Uint8Array {
  return Buffer.from(
    [
      "V3.0",
      "$EVENT:floodgate-300-10F",
      `'fixture:${tag}`,
      "PI",
      "+",
      "+7776FU",
      "-3334FU",
      "%TORYO",
      "",
    ].join("\n"),
    "utf8",
  );
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${createHash("sha256")
    .update(`parent-occurrence-v1\0${gameId}\0${ply}`, "utf8")
    .digest("hex")}`;
}

interface FixtureGame {
  readonly bytes: Uint8Array;
  readonly entry: FloodgateRawCsaIndexEntry;
  readonly allocated: FloodgateAllocatedGame;
}

function game(index: number): FixtureGame {
  const canonicalUrl = csaUrl(index);
  const bytes = csa(index);
  const digest = sha256(bytes);
  const gameId = floodgateCanonicalUrlGameId(canonicalUrl);
  const parsed = parseFloodgateCsa(bytes, canonicalUrl);
  const move = parsed.moves[0];
  return {
    bytes,
    entry: {
      url: canonicalUrl,
      canonical_url: canonicalUrl,
      game_id: gameId,
      receipt: `receipts/${index}.json`,
      status: 200,
      bytes: bytes.byteLength,
      sha256: digest,
      object: floodgateRawObjectPath(digest),
    },
    allocated: {
      game_id: gameId,
      player_identities: [
        "a+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "b+bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      parents: [
        {
          parent_id: parentId(gameId, 0),
          parent_sfen: move.parentSfen,
          ply: 0,
          position_id: positionKeyFromSfen(move.parentSfen),
          phase: "opening",
          sampling_stage: "phase",
          protected_position_ids: protectedSemanticPositionIds(move.parentSfen),
        },
      ],
    },
  };
}

function summary(games: readonly FloodgateAllocatedGame[]) {
  const gameIds = games.map((entry) => entry.game_id).sort();
  const parents = games.flatMap((entry) => entry.parents);
  const parentIds = parents.map((parent) => parent.parent_id).sort();
  const protectedIds = new Set(
    parents.flatMap((parent) => parent.protected_position_ids),
  );
  return {
    requested_games: games.length,
    selected_games: games.length,
    selected_parents: parents.length,
    identity_game_cap: 1,
    unordered_identity_pair_game_cap: 1,
    game_ids: gameIds,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    parent_ids: parentIds,
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    game_parent_ids: [],
    protected_position_ids_count: protectedIds.size,
    protected_position_ids_sha256: floodgateIdentifierDigest(protectedIds),
    identity_game_counts: [],
    unordered_identity_pair_game_counts: [],
  };
}

function allocation(
  finalGames: readonly FloodgateAllocatedGame[],
): FloodgatePureAllocationArtifact["output"] {
  const roles: Record<FloodgateRole, FloodgateAllocatedGame[]> = {
    fresh_final_holdout: [...finalGames],
    fresh_selection: [],
    training: [],
  };
  return {
    roles,
    role_summaries: Object.fromEntries(
      FLOODGATE_ROLE_PRIORITY.map((role) => [role, summary(roles[role])]),
    ),
  } as unknown as FloodgatePureAllocationArtifact["output"];
}

function publishFixture(
  overrides: Partial<NonProductionFloodgateRoleBundlePublishSequenceFixture> = {},
): NonProductionFloodgateRoleBundlePublishSequenceFixture {
  return {
    validateCandidate: () => undefined,
    publishDataFiles: async () => undefined,
    verifyDataFiles: async () => undefined,
    revalidateSourceClosure: async () => undefined,
    publishManifest: async () => undefined,
    verifyCompleteBundle: async () => undefined,
    ...overrides,
  };
}

const ROLE_PRODUCER_REVISION = "3da276f56378a2bb973e43f0e3d63f84ae1b4be0";
const SIBLING_ROLE_PRODUCER_REVISION =
  "8c89c72d29a5d64bd942762362661b48dcd2849f";
const BUNDLE_PRODUCER_REVISION = "c34cb3806bd1ee5a444b5f20b1b1ac014d507f0f";
const BUNDLE_VERIFIER_REVISION = "d75ba874b9441ec7d94c5201f84baac3160513fe";

function historicalManifestText(
  bundleProducer = BUNDLE_PRODUCER_REVISION,
  roleProducer = ROLE_PRODUCER_REVISION,
  recordedRoleVerifier = bundleProducer,
): string {
  return `${JSON.stringify({
    contract: {},
    isolation: {},
    pipeline: {
      source_revision: bundleProducer,
      tracked_tree_clean: true,
    },
    provenance: {},
    replay_exclusion: {},
    roles: {},
    schema: "shogi-floodgate-label-free-role-bundle-v1",
    sources: {
      legacy_replay_exclusion: {},
      raw_lock: {
        manifest: {},
        source_revision: "649423d455b5762a697864610d9e8f606cc327c3",
      },
      role_lock: {
        allocation: {},
        manifest: {},
        producer_revision: roleProducer,
        verifier_revision: recordedRoleVerifier,
      },
    },
    status: "complete-label-free-role-bundle",
  })}\n`;
}

describe("Floodgate label-free role bundle", () => {
  it("accepts an ancestor producer and descendant verifier revision", async () => {
    const binding = historicalFloodgateRoleBundleRevisionBindingCoreForTests(
      historicalManifestText(),
    );
    const accepted = new Set([
      `${FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION}\0${BUNDLE_PRODUCER_REVISION}`,
      `${BUNDLE_PRODUCER_REVISION}\0${BUNDLE_VERIFIER_REVISION}`,
      `${ROLE_PRODUCER_REVISION}\0${BUNDLE_PRODUCER_REVISION}`,
    ]);
    await expect(
      assertFloodgateRoleBundleRevisionAncestryCoreForTests(
        binding,
        BUNDLE_VERIFIER_REVISION,
        async (ancestor, descendant) =>
          ancestor === descendant || accepted.has(`${ancestor}\0${descendant}`),
      ),
    ).resolves.toBeUndefined();

    const minimumBinding =
      historicalFloodgateRoleBundleRevisionBindingCoreForTests(
        historicalManifestText(
          FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION,
          ROLE_PRODUCER_REVISION,
        ),
      );
    await expect(
      assertFloodgateRoleBundleRevisionAncestryCoreForTests(
        minimumBinding,
        FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION,
        async (ancestor, descendant) =>
          ancestor === descendant || ancestor === ROLE_PRODUCER_REVISION,
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["producer below the floor", 0],
    ["producer not ancestral to verifier", 1],
    ["role-lock producer not ancestral to bundle producer", 2],
  ] as const)("rejects a %s", async (_label, rejectedEdge) => {
    const binding = historicalFloodgateRoleBundleRevisionBindingCoreForTests(
      historicalManifestText(),
    );
    let edge = 0;
    await expect(
      assertFloodgateRoleBundleRevisionAncestryCoreForTests(
        binding,
        BUNDLE_VERIFIER_REVISION,
        async () => edge++ !== rejectedEdge,
      ),
    ).rejects.toThrow(/outside the audited producer\/verifier ancestry/);
  });

  it("rejects a historical manifest with mismatched producer/verifier recording", () => {
    expect(() =>
      historicalFloodgateRoleBundleRevisionBindingCoreForTests(
        historicalManifestText(
          BUNDLE_PRODUCER_REVISION,
          ROLE_PRODUCER_REVISION,
          BUNDLE_VERIFIER_REVISION,
        ),
      ),
    ).toThrow(/verifier revision must equal the bundle producer revision/);
  });

  it("requires the cited role-lock producer to precede the historical bundle", async () => {
    const premergeBinding =
      historicalFloodgateRoleBundleRevisionBindingCoreForTests(
        historicalManifestText(
          BUNDLE_PRODUCER_REVISION,
          SIBLING_ROLE_PRODUCER_REVISION,
        ),
      );
    const premergeEdges = new Set([
      `${FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION}\0${BUNDLE_PRODUCER_REVISION}`,
      `${BUNDLE_PRODUCER_REVISION}\0${BUNDLE_VERIFIER_REVISION}`,
    ]);
    await expect(
      assertFloodgateRoleBundleRevisionAncestryCoreForTests(
        premergeBinding,
        BUNDLE_VERIFIER_REVISION,
        async (ancestor, descendant) =>
          ancestor === descendant ||
          premergeEdges.has(`${ancestor}\0${descendant}`),
      ),
    ).rejects.toThrow(/outside the audited producer\/verifier ancestry/);

    const mergedBinding =
      historicalFloodgateRoleBundleRevisionBindingCoreForTests(
        historicalManifestText(
          BUNDLE_VERIFIER_REVISION,
          SIBLING_ROLE_PRODUCER_REVISION,
        ),
      );
    await expect(
      assertFloodgateRoleBundleRevisionAncestryCoreForTests(
        mergedBinding,
        BUNDLE_VERIFIER_REVISION,
        async (ancestor, descendant) =>
          ancestor === descendant ||
          (ancestor === FLOODGATE_ROLE_BUNDLE_MINIMUM_PRODUCER_REVISION &&
            descendant === BUNDLE_VERIFIER_REVISION) ||
          (ancestor === SIBLING_ROLE_PRODUCER_REVISION &&
            descendant === BUNDLE_VERIFIER_REVISION),
      ),
    ).resolves.toBeUndefined();
  });

  it("captures and freezes caller paths before any awaited I/O", async () => {
    const outputRoot = await freshOutputRoot();
    const container = path.dirname(outputRoot);
    const options = {
      repositoryRoot: path.join(container, "repository"),
      verifierRevision: "0123456789abcdef0123456789abcdef01234567",
      rawLockRoot: path.join(container, "raw-lock"),
      roleLockRoot: path.join(container, "role-lock"),
      legacyProtectedPositionIdsPath: path.join(
        container,
        "repository/ml/data/legacy.txt",
      ),
      outputRoot,
    };
    const captured = captureFloodgateRoleBundleOptionsCoreForTests(options);
    options.repositoryRoot = path.join(container, "attacker-repository");
    options.verifierRevision = "f".repeat(40);
    options.rawLockRoot = path.join(container, "attacker-raw-lock");
    options.roleLockRoot = path.join(container, "attacker-role-lock");
    options.legacyProtectedPositionIdsPath = path.join(
      container,
      "attacker-legacy.txt",
    );
    options.outputRoot = path.join(container, "attacker-output");

    expect(Object.isFrozen(captured)).toBe(true);
    expect(captured).toMatchObject({
      repositoryRoot: path.join(container, "repository"),
      verifierRevision: "0123456789abcdef0123456789abcdef01234567",
      rawLockRoot: path.join(container, "raw-lock"),
      roleLockRoot: path.join(container, "role-lock"),
      outputRoot,
    });
  });

  it("adopts only the shared-parent ctime change caused by sibling output mkdir", () => {
    const file = Object.freeze({
      dev: BigInt(1),
      ino: BigInt(10),
      size: BigInt(20),
      ctimeNs: BigInt(30),
      mtimeNs: BigInt(40),
    });
    const expected = Object.freeze({
      parent: Object.freeze({
        dev: BigInt(1),
        ino: BigInt(2),
        ctimeNs: BigInt(3),
      }),
      root: Object.freeze({
        dev: BigInt(1),
        ino: BigInt(4),
        ctimeNs: BigInt(5),
      }),
      files: Object.freeze({
        manifest: file,
        materializedInput: Object.freeze({ ...file, ino: BigInt(11) }),
        allocation: Object.freeze({ ...file, ino: BigInt(12) }),
      }),
    });
    const afterSiblingMkdir = Object.freeze({
      ...expected,
      parent: Object.freeze({ ...expected.parent, ctimeNs: BigInt(99) }),
    });
    expect(() =>
      assertFloodgateRoleBundleRoleLockClosureCoreForTests(
        afterSiblingMkdir,
        expected,
      ),
    ).not.toThrow();
    expect(() =>
      assertFloodgateRoleBundleRoleLockClosureCoreForTests(
        {
          ...afterSiblingMkdir,
          root: { ...expected.root, ctimeNs: BigInt(100) },
        },
        expected,
      ),
    ).toThrow(/filesystem closure changed/);
    expect(() =>
      assertFloodgateRoleBundleRoleLockClosureCoreForTests(
        {
          ...afterSiblingMkdir,
          files: {
            ...expected.files,
            manifest: { ...file, ino: BigInt(999) },
          },
        },
        expected,
      ),
    ).toThrow(/filesystem closure changed/);
  });

  it("accepts the real shared-parent ctime change from creating the sibling bundle root", async () => {
    const outputRoot = await freshOutputRoot();
    const container = path.dirname(outputRoot);
    const roleLockRoot = path.join(container, "role-lock");
    await fs.promises.mkdir(roleLockRoot);
    await Promise.all([
      fs.promises.writeFile(
        path.join(roleLockRoot, "manifest.json"),
        `{"pipeline":{"source_revision":"${ROLE_PRODUCER_REVISION}","tracked_tree_clean":true}}\n`,
      ),
      fs.promises.writeFile(
        path.join(roleLockRoot, "materialized-input.json"),
        '{"games":[],"schema":"fixture-input"}',
      ),
      fs.promises.writeFile(
        path.join(roleLockRoot, "allocation.json"),
        '{"roles":{},"schema":"fixture-allocation"}',
      ),
    ]);
    const before =
      await snapshotExistingFloodgateRoleLockFilesystemClosureCoreForTests(
        roleLockRoot,
      );
    await fs.promises.mkdir(outputRoot);
    const after =
      await snapshotExistingFloodgateRoleLockFilesystemClosureCoreForTests(
        roleLockRoot,
      );

    expect(after.parent.ctimeNs).not.toBe(before.parent.ctimeNs);
    expect(() =>
      assertFloodgateRoleBundleRoleLockClosureCoreForTests(after, before),
    ).not.toThrow();
  });

  it("preserves the canonical-URL game ID and recovers the played USI move", async () => {
    const fixture = game(1);
    const bodyDerived = parseFloodgateCsa(
      fixture.bytes,
      fixture.entry.canonical_url,
    ).gameId;
    expect(bodyDerived).not.toBe(fixture.entry.game_id);

    const aliasUrl = csaUrl(2);
    const alias = { ...fixture.entry, url: aliasUrl };
    const roles = await materializeFloodgateRoleBundleRolesCoreForTests({
      allocation: allocation([fixture.allocated]),
      csaIndex: [alias, fixture.entry],
      readObject: async (entry) => {
        expect(entry.url).toBe(entry.canonical_url);
        return fixture.bytes;
      },
    });

    expect(roles.fresh_final_holdout.rows).toHaveLength(1);
    expect(roles.fresh_final_holdout.rows[0]).toMatchObject({
      source: "floodgate",
      source_url: fixture.entry.canonical_url,
      game_sha256: fixture.entry.sha256,
      game_id: fixture.entry.game_id,
      parent_id: fixture.allocated.parents[0].parent_id,
      played_move: "7g7f",
    });
    expect(roles.fresh_final_holdout.rawText.endsWith("\n")).toBe(true);
    expect(roles.fresh_final_holdout.rawText).not.toContain("teacher");
    expect(roles.fresh_final_holdout.rawText).not.toContain("score");
  });

  it("rejects duplicate canonical rows and allocated-parent tampering", async () => {
    const fixture = game(3);
    await expect(
      materializeFloodgateRoleBundleRolesCoreForTests({
        allocation: allocation([fixture.allocated]),
        csaIndex: [fixture.entry, { ...fixture.entry }],
        readObject: async () => fixture.bytes,
      }),
    ).rejects.toThrow(/exactly one canonical raw-index row/);

    const tampered = {
      ...fixture.allocated,
      parents: [
        {
          ...fixture.allocated.parents[0],
          parent_id: `sha256:${"0".repeat(64)}`,
        },
      ],
    };
    await expect(
      materializeFloodgateRoleBundleRolesCoreForTests({
        allocation: allocation([tampered]),
        csaIndex: [fixture.entry],
        readObject: async () => fixture.bytes,
      }),
    ).rejects.toThrow(/does not match CSA semantics/);
  });

  it("never exceeds the pinned CAS read concurrency", async () => {
    const fixtures = Array.from({ length: 40 }, (_, index) =>
      game(100 + index),
    );
    let active = 0;
    let maximum = 0;
    await materializeFloodgateRoleBundleRolesCoreForTests({
      allocation: allocation(fixtures.map((entry) => entry.allocated)),
      csaIndex: fixtures.map((entry) => entry.entry),
      readObject: async (entry) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => setImmediate(resolve));
        active -= 1;
        return fixtures.find((fixture) => fixture.entry.url === entry.url)!
          .bytes;
      },
    });
    expect(maximum).toBeLessThanOrEqual(
      FLOODGATE_ROLE_BUNDLE_CAS_READ_CONCURRENCY,
    );
    expect(maximum).toBeGreaterThan(1);
  });

  it("does not publish the manifest after source-closure failure", async () => {
    const events: string[] = [];
    const publishManifest = vi.fn(async () => {
      events.push("manifest");
    });
    await expect(
      runFloodgateRoleBundlePublishSequenceCoreForTests(
        publishFixture({
          validateCandidate: () => events.push("validate"),
          publishDataFiles: async () => {
            events.push("data");
          },
          verifyDataFiles: async () => {
            events.push("verify-data");
          },
          revalidateSourceClosure: async () => {
            events.push("source");
            throw new Error("CAS changed");
          },
          publishManifest,
        }),
      ),
    ).rejects.toThrow(/CAS changed/);
    expect(publishManifest).not.toHaveBeenCalled();
    expect(events).toEqual(["validate", "data", "verify-data", "source"]);
  });

  it("revalidates data after source closure and before manifest publication", async () => {
    const events: string[] = [];
    await runFloodgateRoleBundlePublishSequenceCoreForTests(
      publishFixture({
        validateCandidate: () => events.push("validate"),
        publishDataFiles: async () => {
          events.push("data");
        },
        verifyDataFiles: async () => {
          events.push("verify-data");
        },
        revalidateSourceClosure: async () => {
          events.push("source");
        },
        publishManifest: async () => {
          events.push("manifest");
        },
        verifyCompleteBundle: async () => {
          events.push("verify-complete");
        },
      }),
    );
    expect(events).toEqual([
      "validate",
      "data",
      "verify-data",
      "source",
      "verify-data",
      "validate",
      "manifest",
      "verify-complete",
    ]);
  });

  it("holds one root identity through the real manifest-last lifecycle", async () => {
    const outputRoot = await freshOutputRoot();
    await expect(
      runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
        outputRoot,
        async () => undefined,
      ),
    ).resolves.toBeUndefined();

    const entries = (await fs.promises.readdir(outputRoot)).sort();
    expect(entries).toEqual([
      "fixture-a.raw.jsonl",
      "fixture-b.protected-position-ids.txt",
      FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
    ]);
    await expect(
      fs.promises.readFile(
        path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
        "utf8",
      ),
    ).resolves.toBe('{"fixture":"manifest"}\n');
  });

  it("keeps the manifest absent after an in-place pre-manifest mutation", async () => {
    const outputRoot = await freshOutputRoot();
    await expect(
      runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
        outputRoot,
        async (root) => {
          await fs.promises.writeFile(
            path.join(root, "fixture-a.raw.jsonl"),
            '{"fixture":"tampered"}\n',
          );
        },
      ),
    ).rejects.toThrow(
      /output entry fixture-a\.raw\.jsonl changed|output root ctime changed/,
    );
    await expect(
      fs.promises.lstat(
        path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the manifest absent after an identical-byte data inode replacement", async () => {
    const outputRoot = await freshOutputRoot();
    await expect(
      runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
        outputRoot,
        async (root) => {
          const artifact = path.join(root, "fixture-a.raw.jsonl");
          await fs.promises.unlink(artifact);
          await fs.promises.writeFile(artifact, '{"fixture":"a"}\n');
        },
      ),
    ).rejects.toThrow(
      /output entry fixture-a\.raw\.jsonl changed|output root ctime changed/,
    );
    await expect(
      fs.promises.lstat(
        path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    "after-link-before-final-stat",
    "after-link",
    "after-directory-sync",
    "after-temp-unlink",
  ] as const)(
    "durably invalidates its owned manifest after a %s failure",
    async (failurePhase) => {
      const outputRoot = await freshOutputRoot();
      await expect(
        runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
          outputRoot,
          async () => undefined,
          (phase) => {
            if (phase === failurePhase) {
              throw new Error(`injected ${failurePhase} failure`);
            }
          },
        ),
      ).rejects.toThrow(`injected ${failurePhase} failure`);
      await expect(
        fs.promises.readFile(
          path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
          "utf8",
        ),
      ).resolves.toBe(FLOODGATE_ROLE_BUNDLE_INVALID_MANIFEST_SENTINEL);
    },
  );

  it("never alters a foreign canonical manifest that wins before link", async () => {
    const outputRoot = await freshOutputRoot();
    const foreign = "FOREIGN-CANONICAL-MANIFEST\n";
    await expect(
      runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
        outputRoot,
        async () => undefined,
        async (phase) => {
          if (phase === "after-temp-sync") {
            await fs.promises.writeFile(
              path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
              foreign,
              { flag: "wx" },
            );
          }
        },
      ),
    ).rejects.toThrow(/conflicting bytes/);
    await expect(
      fs.promises.readFile(
        path.join(outputRoot, FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME),
        "utf8",
      ),
    ).resolves.toBe(foreign);
  });

  it("invalidates only its held inode when the canonical manifest is displaced", async () => {
    const outputRoot = await freshOutputRoot();
    const container = path.dirname(outputRoot);
    const manifestPath = path.join(
      outputRoot,
      FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME,
    );
    const displacedPath = path.join(
      outputRoot,
      "publisher-owned-displaced.json",
    );
    const foreignPath = path.join(container, "foreign-manifest.json");
    const foreign = "FOREIGN-MANIFEST-MUST-STAY-BYTE-EXACT\n";
    await fs.promises.writeFile(foreignPath, foreign, { flag: "wx" });

    await expect(
      runFreshFloodgateRoleBundleOutputLifecycleCoreForTests(
        outputRoot,
        async () => undefined,
        async (phase) => {
          if (phase === "after-link-before-final-stat") {
            await fs.promises.rename(manifestPath, displacedPath);
            await fs.promises.rename(foreignPath, manifestPath);
          }
        },
      ),
    ).rejects.toThrow(/expected regular hard link/);
    await expect(fs.promises.readFile(manifestPath, "utf8")).resolves.toBe(
      foreign,
    );
    await expect(fs.promises.readFile(displacedPath, "utf8")).resolves.toBe(
      FLOODGATE_ROLE_BUNDLE_INVALID_MANIFEST_SENTINEL,
    );
  });

  it.each(["artifact.json", FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME])(
    "rejects identical-byte replacement of existing %s",
    async (replaced) => {
      const outputRoot = await freshOutputRoot();
      const expected: Record<string, string> = {
        "artifact.json": '{"artifact":true}\n',
        [FLOODGATE_ROLE_BUNDLE_MANIFEST_FILENAME]: '{"manifest":true}\n',
      };
      await fs.promises.mkdir(outputRoot);
      await Promise.all(
        Object.entries(expected).map(([filename, contents]) =>
          fs.promises.writeFile(path.join(outputRoot, filename), contents),
        ),
      );
      await expect(
        verifyExistingFloodgateRoleBundleArtifactsCoreForTests(
          outputRoot,
          expected,
          async () => {
            const replacedPath = path.join(outputRoot, replaced);
            await fs.promises.unlink(replacedPath);
            await fs.promises.writeFile(replacedPath, expected[replaced]);
          },
        ),
      ).rejects.toThrow(/output entry .* changed|output root ctime changed/);
    },
  );

  it("rejects exact-byte in-place rewrite and output-root rename/restore", async () => {
    const expected = { "artifact.json": '{"artifact":true}\n' };
    const rewrittenRoot = await freshOutputRoot();
    await fs.promises.mkdir(rewrittenRoot);
    await fs.promises.writeFile(
      path.join(rewrittenRoot, "artifact.json"),
      expected["artifact.json"],
    );
    await expect(
      verifyExistingFloodgateRoleBundleArtifactsCoreForTests(
        rewrittenRoot,
        expected,
        async () => {
          await fs.promises.writeFile(
            path.join(rewrittenRoot, "artifact.json"),
            expected["artifact.json"],
          );
        },
      ),
    ).rejects.toThrow(/output entry artifact\.json changed/);

    const renamedRoot = await freshOutputRoot();
    await fs.promises.mkdir(renamedRoot);
    await fs.promises.writeFile(
      path.join(renamedRoot, "artifact.json"),
      expected["artifact.json"],
    );
    const moved = `${renamedRoot}.moved`;
    await expect(
      verifyExistingFloodgateRoleBundleArtifactsCoreForTests(
        renamedRoot,
        expected,
        async () => {
          await fs.promises.rename(renamedRoot, moved);
          await fs.promises.rename(moved, renamedRoot);
        },
      ),
    ).rejects.toThrow(/output parent changed/);
  });

  it("rejects output-root ABA and refuses an existing no-clobber root", async () => {
    const outputRoot = await freshOutputRoot();
    const movedRoot = `${outputRoot}.moved`;
    await expect(
      runFreshFloodgateRoleBundleRootGuardCoreForTests(
        outputRoot,
        async (root) => {
          await fs.promises.rename(root, movedRoot);
          await fs.promises.mkdir(root);
          await fs.promises.rmdir(root);
          await fs.promises.rename(movedRoot, root);
        },
      ),
    ).rejects.toThrow(/output parent changed|output root changed/);

    await expect(
      acquireAndReleaseFreshFloodgateRoleBundleRootForTests(outputRoot),
    ).rejects.toThrow(/must be freshly created/);
  });
});
