import { afterEach, describe, it } from "vitest";

import {
  cleanupExact24kScannerFixtures,
  runExact24kScannerProductionShard,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

const posixDescribe = describe.runIf(typeof process.geteuid === "function");

posixDescribe("Floodgate v7 exact-24k sealed scanner production shard", () => {
  afterEach(cleanupExact24kScannerFixtures);

  it(
    "runs exact 100/500/24000 gates and finalizes exact parent accounting",
    runExact24kScannerProductionShard,
    1_200_000,
  );
});
