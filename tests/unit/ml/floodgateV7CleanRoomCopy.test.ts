import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY,
  FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
  FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS,
  FloodgateV7CleanRoomCopyError,
  copyFloodgateV7CleanRoomFileByValueCoreForTests,
  copyFloodgateV7CleanRoomTreeByValueCoreForTests,
} from "../../../ml/floodgate-v7-clean-room-copy";

const roots: string[] = [];
const effectiveUserId = process.geteuid?.() ?? 501;

async function fixture(): Promise<Readonly<{
  root: string;
  source: string;
  destinationParent: string;
  destination: string;
}>> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-clean-room-copy-"),
    ),
  );
  roots.push(root);
  await fs.promises.chmod(root, 0o700);
  const source = path.join(root, "source");
  const destinationParent = path.join(root, "destination-parent");
  const destination = path.join(destinationParent, "copy");
  await fs.promises.mkdir(source, { mode: 0o700 });
  await fs.promises.mkdir(destinationParent, { mode: 0o700 });
  await fs.promises.chmod(source, 0o700);
  await fs.promises.chmod(destinationParent, 0o700);
  return Object.freeze({ root, source, destinationParent, destination });
}

async function writePrivate(
  file: string,
  content: string,
  mode: 0o400 | 0o500 | 0o600 | 0o700 = 0o600,
): Promise<void> {
  await fs.promises.writeFile(file, content, { mode: 0o600 });
  await fs.promises.chmod(file, mode);
}

async function rejectionOf(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error("expected rejection");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.promises.rm(root, { force: true, recursive: true }),
    ),
  );
});

describe("Floodgate v7 clean-room copy-by-value", () => {
  it("copies a private tree through new single-link inodes and normalizes private modes", async () => {
    const value = await fixture();
    const nested = path.join(value.source, "nested");
    await fs.promises.mkdir(nested, { mode: 0o700 });
    await fs.promises.chmod(nested, 0o700);
    await writePrivate(path.join(value.source, "read-only.txt"), "alpha\n", 0o400);
    await writePrivate(path.join(nested, "engine"), "engine\n", 0o500);

    const receipt = await copyFloodgateV7CleanRoomTreeByValueCoreForTests(
      value.source,
      value.destination,
      { effectiveUserId },
    );

    expect(receipt).toEqual({
      contract: FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
      status: FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS,
      claim_boundary: FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY,
      execution_boundary: "non-production-copy-by-value-preparation",
      copied: {
        directories: 1,
        files: 2,
        bytes: 13,
        source_revalidated_after_copy: true,
        destination_revalidated_after_copy: true,
        destination_files_single_link: true,
        source_destination_inode_aliases: 0,
        filesystem_clone_api_used: false,
        file_copy_concurrency_limit: 8,
        per_file_fsync_used: false,
      },
      nonclaims: {
        source_path: false,
        destination_path: false,
        source_or_tree_digest: false,
        crash_durable_copy: false,
        dataset_semantics: false,
        holdout_opened: false,
        teacher_process: false,
        teacher_label: false,
        optimizer_training: false,
        weight_changed: false,
        live_evaluation_activation: false,
        match: false,
        playing_strength: false,
      },
    });
    expect(
      await fs.promises.readFile(
        path.join(value.destination, "read-only.txt"),
        "utf8",
      ),
    ).toBe("alpha\n");
    expect(
      await fs.promises.readFile(
        path.join(value.destination, "nested", "engine"),
        "utf8",
      ),
    ).toBe("engine\n");

    const source = await fs.promises.lstat(
      path.join(value.source, "read-only.txt"),
      { bigint: true },
    );
    const destination = await fs.promises.lstat(
      path.join(value.destination, "read-only.txt"),
      { bigint: true },
    );
    const executable = await fs.promises.lstat(
      path.join(value.destination, "nested", "engine"),
      { bigint: true },
    );
    expect(destination.nlink).toBe(BigInt(1));
    expect([destination.dev, destination.ino]).not.toEqual([
      source.dev,
      source.ino,
    ]);
    expect(Number(destination.mode & BigInt(0o7777))).toBe(0o600);
    expect(Number(executable.mode & BigInt(0o7777))).toBe(0o700);
  });

  it("rejects symlinks and hard-linked source files before creating a destination", async () => {
    const symlink = await fixture();
    const target = path.join(symlink.source, "target");
    await writePrivate(target, "target\n");
    await fs.promises.symlink(target, path.join(symlink.source, "alias"));

    const symlinkFailure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        symlink.source,
        symlink.destination,
        { effectiveUserId },
      ),
    );
    expect(symlinkFailure).toMatchObject({
      phase: "source-inventory",
      partial_destination_preserved: false,
      sensitive_values_disclosed: false,
    });
    await expect(fs.promises.lstat(symlink.destination)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const hardlink = await fixture();
    const original = path.join(hardlink.source, "original");
    await writePrivate(original, "original\n");
    await fs.promises.link(original, path.join(hardlink.source, "alias"));
    const hardlinkFailure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        hardlink.source,
        hardlink.destination,
        { effectiveUserId },
      ),
    );
    expect(hardlinkFailure).toMatchObject({
      phase: "source-inventory",
      partial_destination_preserved: false,
    });
  });

  it("copies the separate legacy exclusion file by value into an existing private parent", async () => {
    const value = await fixture();
    const source = path.join(value.source, "legacy.txt");
    const destination = path.join(value.destinationParent, "legacy.txt");
    await writePrivate(source, "legacy\n", 0o400);

    const receipt = await copyFloodgateV7CleanRoomFileByValueCoreForTests(
      source,
      destination,
      { effectiveUserId },
    );

    expect(receipt.copied).toMatchObject({
      directories: 0,
      files: 1,
      bytes: 7,
      destination_files_single_link: true,
      source_destination_inode_aliases: 0,
    });
    const sourceStat = await fs.promises.lstat(source, { bigint: true });
    const destinationStat = await fs.promises.lstat(destination, {
      bigint: true,
    });
    expect(await fs.promises.readFile(destination, "utf8")).toBe("legacy\n");
    expect(Number(destinationStat.mode & BigInt(0o7777))).toBe(0o600);
    expect(destinationStat.nlink).toBe(BigInt(1));
    expect([destinationStat.dev, destinationStat.ino]).not.toEqual([
      sourceStat.dev,
      sourceStat.ino,
    ]);
  });

  it("exposes no callback detail before a destination exists", async () => {
    const value = await fixture();
    const sourceFile = path.join(value.source, "input");
    const secret = "secret-source-mutation-path-and-value";
    await writePrivate(sourceFile, "before\n");

    const failure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        value.source,
        value.destination,
        {
          effectiveUserId,
          afterSourceInventoryForTests: async () => {
            await fs.promises.chmod(sourceFile, 0o600);
            await fs.promises.writeFile(sourceFile, "after\n", { flag: "w" });
            throw new Error(secret);
          },
        },
      ),
    );

    expect(failure).toBeInstanceOf(FloodgateV7CleanRoomCopyError);
    expect(failure).toMatchObject({
      phase: "callback",
      partial_destination_preserved: false,
      retry_disposition: "fresh-absent-destination-required",
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);
  });

  it("detects a source mutation after inventory and preserves the partial destination", async () => {
    const value = await fixture();
    const sourceFile = path.join(value.source, "input");
    await writePrivate(sourceFile, "before\n");

    const failure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        value.source,
        value.destination,
        {
          effectiveUserId,
          afterSourceInventoryForTests: async () => {
            await fs.promises.writeFile(sourceFile, "after\n", { flag: "w" });
          },
        },
      ),
    );

    expect(failure).toMatchObject({
      phase: "copy",
      partial_destination_preserved: true,
      retry_disposition: "manual-clean-room-reconciliation-required",
      sensitive_values_disclosed: false,
    });
    expect(
      (await fs.promises.lstat(value.destination)).isDirectory(),
    ).toBe(true);
  });

  it("drains both copied-file descriptors when the first close fails", async () => {
    const value = await fixture();
    await writePrivate(path.join(value.source, "input"), "input\n");
    const closed: string[] = [];

    const failure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        value.source,
        value.destination,
        {
          effectiveUserId,
          closeCopiedFileHandleForTests: async (handle, kind) => {
            closed.push(kind);
            await handle.close();
            if (kind === "source") {
              throw new Error("private source close detail");
            }
          },
        },
      ),
    );

    expect(closed).toEqual(["source", "destination"]);
    expect(failure).toMatchObject({
      phase: "copy",
      partial_destination_preserved: true,
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain("private source close detail");
  });

  it("detects destination replacement and retains the partial namespace for reconciliation", async () => {
    const value = await fixture();
    await writePrivate(path.join(value.source, "input"), "input\n");

    const failure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        value.source,
        value.destination,
        {
          effectiveUserId,
          afterFileCopiedForTests: async (relativePath) => {
            const destination = path.join(value.destination, relativePath);
            await fs.promises.rm(destination);
            await fs.promises.symlink(
              path.join(value.source, "input"),
              destination,
            );
          },
        },
      ),
    );

    expect(failure).toMatchObject({
      phase: "revalidation",
      partial_destination_preserved: true,
      retry_disposition: "manual-clean-room-reconciliation-required",
    });
    expect(
      (await fs.promises.lstat(path.join(value.destination, "input"))).isSymbolicLink(),
    ).toBe(true);
  });

  it(
    "stops scheduling after the first bounded-worker failure and drains already-started callbacks",
    async () => {
      const value = await fixture();
      await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          writePrivate(
            path.join(value.source, `input-${index.toString().padStart(2, "0")}`),
            `${index}\n`,
          ),
        ),
      );
      let callbackIndex = 0;
      let callbacksActive = 0;
      let resolveAllEight: (() => void) | undefined;
      let releaseFailure: (() => void) | undefined;
      let releaseOthers: (() => void) | undefined;
      const allEight = new Promise<void>((resolve) => {
        resolveAllEight = resolve;
      });
      const failureGate = new Promise<void>((resolve) => {
        releaseFailure = resolve;
      });
      const otherGate = new Promise<void>((resolve) => {
        releaseOthers = resolve;
      });
      const run = copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        value.source,
        value.destination,
        {
          effectiveUserId,
          afterFileCopiedForTests: async (_relativePath) => {
            const index = callbackIndex;
            callbackIndex += 1;
            callbacksActive += 1;
            if (callbacksActive === 8) resolveAllEight?.();
            if (index === 0) {
              await failureGate;
              callbacksActive -= 1;
              throw new Error("fixed synthetic failure");
            }
            await otherGate;
            callbacksActive -= 1;
          },
        },
      );
      await allEight;
      releaseFailure?.();
      let returned = false;
      void run.catch(() => {
        returned = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(returned).toBe(false);
      releaseOthers?.();

      const failure = await rejectionOf(run);

      expect(failure).toMatchObject({
        phase: "callback",
        partial_destination_preserved: true,
      });
      expect(callbackIndex).toBe(8);
      expect(callbacksActive).toBe(0);
      expect(
        (await fs.promises.readdir(value.destination)).length,
      ).toBe(8);
    },
    30_000,
  );

  it(
    "copies a synthetic 1,000-small-file tree with the fixed eight-worker limit",
    async () => {
      const value = await fixture();
      await Promise.all(
        Array.from({ length: 1_000 }, (_, index) =>
          writePrivate(
            path.join(
              value.source,
              `small-${index.toString().padStart(4, "0")}.txt`,
            ),
            "x",
          ),
        ),
      );

      const receipt = await copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        value.source,
        value.destination,
        { effectiveUserId },
      );

      expect(receipt.copied).toMatchObject({
        files: 1_000,
        bytes: 1_000,
        file_copy_concurrency_limit: 8,
        per_file_fsync_used: false,
      });
      expect(receipt.nonclaims.crash_durable_copy).toBe(false);
      expect(
        (await fs.promises.readdir(value.destination)).length,
      ).toBe(1_000);
    },
    30_000,
  );

  it("rejects an existing destination and overlapping namespaces without deleting evidence", async () => {
    const existing = await fixture();
    await writePrivate(path.join(existing.source, "input"), "input\n");
    await fs.promises.mkdir(existing.destination, { mode: 0o700 });
    await writePrivate(path.join(existing.destination, "evidence"), "keep\n");

    const existingFailure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        existing.source,
        existing.destination,
        { effectiveUserId },
      ),
    );
    expect(existingFailure).toMatchObject({
      phase: "namespace",
      partial_destination_preserved: true,
      retry_disposition: "manual-clean-room-reconciliation-required",
    });
    expect(
      await fs.promises.readFile(
        path.join(existing.destination, "evidence"),
        "utf8",
      ),
    ).toBe("keep\n");

    const overlap = await fixture();
    const overlapFailure = await rejectionOf(
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        overlap.source,
        path.join(overlap.source, "copy"),
        { effectiveUserId },
      ),
    );
    expect(overlapFailure).toMatchObject({
      phase: "capture",
      partial_destination_preserved: false,
    });
  });

  it("contains no filesystem clone or generic copy-file path", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "floodgate-v7-clean-room-copy.ts",
      ),
      "utf8",
    );
    expect(source).not.toContain("COPYFILE_FICLONE");
    expect(source).not.toContain("copyFile(");
    expect(source).toContain("O_NOFOLLOW");
    expect(source).toContain("O_EXCL");
    expect(source).toContain("destinationAfter.nlink !== BigInt(1)");
    expect(source).toContain(
      "before.size >= BigInt(MAX_FILE_BYTES)",
    );
    expect(source).not.toContain("destinationHandle.sync()");
    expect(source).toContain("Promise.allSettled(workers)");
  });
});
