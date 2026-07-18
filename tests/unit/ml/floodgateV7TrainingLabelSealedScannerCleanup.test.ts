import { afterEach, describe, it } from "vitest";

import {
  cleanupExact24kScannerFixtures,
  runExact24kScannerCleanupShard,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

const posixDescribe = describe.runIf(typeof process.geteuid === "function");

posixDescribe("Floodgate v7 exact-24k sealed scanner cleanup shard", () => {
  afterEach(cleanupExact24kScannerFixtures);

  it(
    "runs exact 100/500/24000 gates and preserves sticky aggregate cleanup failures",
    runExact24kScannerCleanupShard,
    1_200_000,
  );
});
