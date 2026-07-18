import { afterEach, describe, it } from "vitest";

import {
  cleanupExact24kScannerFixtures,
  runExact24kScannerAuthorityShard,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

const posixDescribe = describe.runIf(typeof process.geteuid === "function");

posixDescribe("Floodgate v7 exact-24k sealed scanner authority shard", () => {
  afterEach(cleanupExact24kScannerFixtures);

  it(
    "runs exact 100/500/24000 gates and rejects invalid lease and key authorities",
    runExact24kScannerAuthorityShard,
    1_200_000,
  );
});
