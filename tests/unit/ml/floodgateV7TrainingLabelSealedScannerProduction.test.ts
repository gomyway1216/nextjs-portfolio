import { afterAll, describe, expect, it } from "vitest";

import {
  EXACT24K_SCANNER_RECEIPT_SCHEMA,
  exact24kScannerCaseIds,
} from "../../../scripts/exact24k-scanner-runtime-receipt.mjs";
import {
  cleanupExact24kScannerFixtures,
  runExact24kScannerProductionShard,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

const posixDescribe = describe.runIf(typeof process.geteuid === "function");
const caseIds = exact24kScannerCaseIds("production");

posixDescribe("Floodgate v7 exact-24k sealed scanner production shard", () => {
  let execution:
    ReturnType<typeof runExact24kScannerProductionShard> | undefined;
  afterAll(cleanupExact24kScannerFixtures);

  for (const [index, caseId] of caseIds.entries()) {
    it(
      caseId,
      async () => {
        execution ??= runExact24kScannerProductionShard();
        const receipt = await execution;
        expect(receipt).toMatchObject({
          schema: EXACT24K_SCANNER_RECEIPT_SCHEMA,
          shard_id: "production",
          exact_parent_count: 24_000,
        });
        expect(receipt.case_ids).toEqual(caseIds);
        expect(receipt.case_ids[index]).toBe(caseId);
      },
      1_200_000,
    );
  }
});
