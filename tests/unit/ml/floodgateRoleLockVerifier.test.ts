import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifyExistingFloodgateRoleLockArtifactsCoreForTests } from "../../../ml/floodgate-role-lock";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const roots: string[] = [];

const SNAPSHOT = Object.freeze({
  manifestText: `{"pipeline":{"source_revision":"${REVISION}","tracked_tree_clean":true}}\n`,
  materializedInputText: '{"games":[],"schema":"fixture-input"}',
  allocationText: '{"roles":{},"schema":"fixture-allocation"}',
});

async function fixture(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-role-lock-verifier-"),
  );
  const container = await fs.promises.realpath(created);
  roots.push(container);
  const root = path.join(container, "role-lock");
  await fs.promises.mkdir(root);
  await Promise.all([
    fs.promises.writeFile(
      path.join(root, "manifest.json"),
      SNAPSHOT.manifestText,
    ),
    fs.promises.writeFile(
      path.join(root, "materialized-input.json"),
      SNAPSHOT.materializedInputText,
    ),
    fs.promises.writeFile(
      path.join(root, "allocation.json"),
      SNAPSHOT.allocationText,
    ),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("existing Floodgate role-lock artifact verification", () => {
  it("accepts the exact three canonical artifacts and rereads them", async () => {
    const root = await fixture();
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(root, SNAPSHOT),
    ).resolves.toBeUndefined();
  });

  it("rejects noncanonical JSON, duplicate keys, and an extra root entry", async () => {
    const noncanonical = await fixture();
    await fs.promises.writeFile(
      path.join(noncanonical, "manifest.json"),
      `{"pipeline": {"source_revision":"${REVISION}","tracked_tree_clean":true}}\n`,
    );
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(
        noncanonical,
        SNAPSHOT,
      ),
    ).rejects.toThrow(/canonical key order|canonical JSON/);

    const duplicate = await fixture();
    await fs.promises.writeFile(
      path.join(duplicate, "allocation.json"),
      '{"roles":{},"roles":{},"schema":"fixture-allocation"}',
    );
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(duplicate, SNAPSHOT),
    ).rejects.toThrow(/canonical key order/);

    const extra = await fixture();
    await fs.promises.writeFile(path.join(extra, "unreferenced.json"), "{}\n");
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(extra, SNAPSHOT),
    ).rejects.toThrow(/root entries are not exact/);
  });

  it("detects an in-place allocation mutation between verification passes", async () => {
    const root = await fixture();
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(
        root,
        SNAPSHOT,
        async () => {
          await fs.promises.writeFile(
            path.join(root, "allocation.json"),
            '{"roles":[],"schema":"fixture-allocation"}',
          );
        },
      ),
    ).rejects.toThrow(/changed during non-production verification/);
  });

  it("rechecks an early-read file before one closure snapshot returns", async () => {
    const root = await fixture();
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(
        root,
        SNAPSHOT,
        async () => undefined,
        async () => {
          await fs.promises.writeFile(
            path.join(root, "manifest.json"),
            SNAPSHOT.manifestText,
          );
        },
      ),
    ).rejects.toThrow(/manifest changed during its closure snapshot/);
  });

  it("rejects an identical-byte allocation inode replacement", async () => {
    const root = await fixture();
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(
        root,
        SNAPSHOT,
        async () => {
          const allocationPath = path.join(root, "allocation.json");
          await fs.promises.unlink(allocationPath);
          await fs.promises.writeFile(allocationPath, SNAPSHOT.allocationText);
        },
      ),
    ).rejects.toThrow(/changed during non-production verification/);
  });

  it("rejects output-root rename and restore through the pinned parent closure", async () => {
    const root = await fixture();
    const moved = `${root}.moved`;
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(
        root,
        SNAPSHOT,
        async () => {
          await fs.promises.rename(root, moved);
          await fs.promises.rename(moved, root);
        },
      ),
    ).rejects.toThrow(/changed during non-production verification/);
  });

  it("rejects a symlinked artifact before accepting its bytes", async () => {
    const root = await fixture();
    const target = path.join(root, "allocation-target.json");
    await fs.promises.rename(path.join(root, "allocation.json"), target);
    await fs.promises.symlink(target, path.join(root, "allocation.json"));
    await expect(
      verifyExistingFloodgateRoleLockArtifactsCoreForTests(root, SNAPSHOT),
    ).rejects.toThrow(/root entries are not exact|symbolic links/);
  });
});
