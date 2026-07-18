import { afterEach, describe, it } from "vitest";

import {
  cleanupExact24kScannerFixtures,
  runExact24kScannerReplayShard,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

const posixDescribe = describe.runIf(typeof process.geteuid === "function");

posixDescribe("Floodgate v7 exact-24k sealed scanner replay shard", () => {
  afterEach(cleanupExact24kScannerFixtures);

  it(
    "runs exact 100/500/24000 gates and replays exact W/WT/WTR/WTRM parents",
    runExact24kScannerReplayShard,
    1_200_000,
  );
});
