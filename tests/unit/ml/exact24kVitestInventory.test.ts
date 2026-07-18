import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  expectedExact24kTarget,
  validateExact24kCiWiring,
  validateExact24kInventory,
  verifyExact24kVitestReport,
} from "../../../scripts/verify-exact24k-vitest-report.mjs";

interface ExpectedTarget {
  readonly id: string;
  readonly file: string;
  readonly titles: readonly string[];
}

interface InventoryFixture {
  core_exclusions: string[];
  gates: number[];
  scanner_shards: Array<{
    case_ids: string[];
  }>;
  teacher: {
    direct_it_titles: number;
    titles: string[];
  };
}

interface ReportFixture {
  [key: string]: unknown;
  success: boolean;
  numFailedTestSuites: number;
  numPendingTestSuites: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: Array<{
    name: string;
    status: string;
    assertionResults: Array<{
      title: string;
      status: string;
      failureMessages: string[];
    }>;
  }>;
}

const repoRoot = process.cwd();
const inventory = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, ".github/ci/exact24k-vitest-inventory.json"),
    "utf8",
  ),
) as InventoryFixture;

function passingReport(expected: ExpectedTarget): ReportFixture {
  return {
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: expected.titles.length,
    numPassedTests: expected.titles.length,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    snapshot: {},
    startTime: 1,
    success: true,
    testResults: [
      {
        assertionResults: expected.titles.map((title) => ({
          title,
          status: "passed",
          failureMessages: [],
        })),
        status: "passed",
        name: path.join(repoRoot, expected.file),
      },
    ],
  };
}

describe("exact-24k Vitest inventory and report verifier", () => {
  it("fixes five scanner shards, forty-nine Teacher assertions, and six core exclusions", () => {
    const validated = validateExact24kInventory(inventory, { repoRoot });

    expect(validated.scanner_shards).toHaveLength(5);
    expect(validated.teacher.direct_it_titles).toBe(40);
    expect(validated.teacher.titles).toHaveLength(49);
    expect(validated.core_exclusions).toHaveLength(6);
    expect(validated.gates).toEqual([100, 500, 24_000]);
    expect(validateExact24kCiWiring(validated, { repoRoot })).toEqual({
      scanner_shards: 5,
      core_exclusions: 6,
      teacher_tests: 49,
      aggregate: "Test and build",
    });
  });

  it("rejects duplicate conceptual cases and a missing shard", () => {
    const duplicate = structuredClone(inventory);
    duplicate.scanner_shards[1].case_ids[0] =
      duplicate.scanner_shards[0].case_ids[0];
    expect(() => validateExact24kInventory(duplicate, { repoRoot })).toThrow(
      /case IDs contains duplicates/,
    );

    const missing = structuredClone(inventory);
    missing.scanner_shards.pop();
    expect(() => validateExact24kInventory(missing, { repoRoot })).toThrow(
      /exactly five/,
    );
  });

  it("accepts only the exact target file and title set", () => {
    const expected = expectedExact24kTarget(inventory, "authority");
    const report = passingReport(expected);

    expect(verifyExact24kVitestReport(report, expected, { repoRoot })).toEqual({
      target: "authority",
      file: "tests/unit/ml/floodgateV7TrainingLabelSealedScannerAuthority.test.ts",
      passed_tests: 1,
    });

    const wrongFile = structuredClone(report);
    wrongFile.testResults[0].name = path.join(
      repoRoot,
      "tests/unit/ml/floodgateV7TrainingLabelSealedScannerMutation.test.ts",
    );
    expect(() =>
      verifyExact24kVitestReport(wrongFile, expected, { repoRoot }),
    ).toThrow(/report file must be exactly/);

    const wrongTitle = structuredClone(report);
    wrongTitle.testResults[0].assertionResults[0].title = "other test";
    expect(() =>
      verifyExact24kVitestReport(wrongTitle, expected, { repoRoot }),
    ).toThrow(/reported titles must match/);
  });

  it("fails closed on skipped, pending, todo, failed, or extra results", () => {
    const expected = expectedExact24kTarget(inventory, "authority");
    const report = passingReport(expected);

    for (const mutation of [
      (value: ReportFixture) => {
        value.success = false;
      },
      (value: ReportFixture) => {
        value.numFailedTestSuites = 1;
      },
      (value: ReportFixture) => {
        value.numPendingTestSuites = 1;
      },
      (value: ReportFixture) => {
        value.numFailedTests = 1;
      },
      (value: ReportFixture) => {
        value.numPendingTests = 1;
      },
      (value: ReportFixture) => {
        value.numTodoTests = 1;
      },
      (value: ReportFixture) => {
        value.testResults.push(structuredClone(value.testResults[0]));
      },
      (value: ReportFixture) => {
        value.testResults[0].assertionResults[0].status = "skipped";
      },
    ]) {
      const invalid = structuredClone(report);
      mutation(invalid);
      expect(() =>
        verifyExact24kVitestReport(invalid, expected, { repoRoot }),
      ).toThrow(/verification failed/);
    }
  });
});
