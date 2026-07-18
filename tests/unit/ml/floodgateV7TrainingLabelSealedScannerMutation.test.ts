import { afterEach, describe, it } from "vitest";

import {
  cleanupExact24kScannerFixtures,
  runExact24kScannerMutationShard,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

const posixDescribe = describe.runIf(typeof process.geteuid === "function");

posixDescribe("Floodgate v7 exact-24k sealed scanner mutation shard", () => {
  afterEach(cleanupExact24kScannerFixtures);

  it(
    "runs exact 100/500/24000 gates and rejects sink, path, and seal mutations",
    runExact24kScannerMutationShard,
    1_200_000,
  );
});
