import { afterAll, describe, expect, it } from "vitest";

import {
  EXACT24K_SCANNER_RECEIPT_SCHEMA,
  exact24kScannerCaseIds,
} from "../../../scripts/exact24k-scanner-runtime-receipt.mjs";
import {
  cleanupExact24kScannerFixtures,
  runExact24kScannerMutationShard,
} from "./floodgateV7TrainingLabelSealedScanner.shared";

const posixDescribe = describe.runIf(typeof process.geteuid === "function");
const caseIds = exact24kScannerCaseIds("mutation");

posixDescribe("Floodgate v7 exact-24k sealed scanner mutation shard", () => {
  let execution: ReturnType<typeof runExact24kScannerMutationShard> | undefined;
  afterAll(() => cleanupExact24kScannerFixtures("mutation"));

  for (const [index, caseId] of caseIds.entries()) {
    it(
      caseId,
      async () => {
        execution ??= runExact24kScannerMutationShard();
        const receipt = await execution;
        expect(receipt).toMatchObject({
          schema: EXACT24K_SCANNER_RECEIPT_SCHEMA,
          shard_id: "mutation",
          exact_parent_count: 24_000,
        });
        expect(receipt.case_ids).toEqual(caseIds);
        expect(receipt.case_ids[index]).toBe(caseId);
      },
      1_200_000,
    );
  }
});
