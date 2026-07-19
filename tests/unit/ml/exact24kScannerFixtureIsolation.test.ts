import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  cleanupExact24kScannerFixtures,
  createTrackedExact24kScannerTemporaryRootForTests,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

describe("exact-24k scanner fixture tracking", () => {
  afterAll(async () => {
    await cleanupExact24kScannerFixtures("authority");
    await cleanupExact24kScannerFixtures("mutation");
  });

  it("keeps another shard's roots alive during same-process cleanup", async () => {
    const [authorityRoot, mutationRoot] = await Promise.all([
      createTrackedExact24kScannerTemporaryRootForTests("authority"),
      createTrackedExact24kScannerTemporaryRootForTests("mutation"),
    ]);
    const mutationSentinel = path.join(mutationRoot, "still-active");

    await Promise.all([
      cleanupExact24kScannerFixtures("authority"),
      fs.promises.writeFile(mutationSentinel, "mutation remains active\n"),
    ]);

    await expect(fs.promises.lstat(authorityRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.promises.readFile(mutationSentinel, "utf8")).resolves.toBe(
      "mutation remains active\n",
    );

    await cleanupExact24kScannerFixtures("mutation");
    await expect(fs.promises.lstat(mutationRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
