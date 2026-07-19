import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXACT24K_SCANNER_CASE_IDS,
  createExact24kScannerRuntimeReceiptRecorder,
  exact24kScannerCaseIds,
} from "../../../scripts/exact24k-scanner-runtime-receipt.mjs";
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
const workflowSource = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/ci.yml"),
  "utf8",
);

function replaceOnce(
  source: string,
  search: string,
  replacement: string,
): string {
  expect(source.split(search)).toHaveLength(2);
  return source.replace(search, replacement);
}

function passingReport(expected: ExpectedTarget): ReportFixture {
  return {
    numTotalTestSuites: 2,
    numPassedTestSuites: 2,
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
      /immutable runtime receipt cases/,
    );

    const missing = structuredClone(inventory);
    missing.scanner_shards.pop();
    expect(() => validateExact24kInventory(missing, { repoRoot })).toThrow(
      /exactly five/,
    );
  });

  it("pins all nineteen case IDs and seals only complete ordered runtime receipts", () => {
    expect(Object.values(EXACT24K_SCANNER_CASE_IDS).flat()).toHaveLength(19);
    const authorityCases = exact24kScannerCaseIds("authority");
    const recorder = createExact24kScannerRuntimeReceiptRecorder("authority");
    for (const caseId of authorityCases) recorder.pass(caseId);
    expect(recorder.seal()).toEqual({
      schema: "floodgate-exact24k-scanner-runtime-receipt-v1",
      shard_id: "authority",
      exact_parent_count: 24_000,
      case_ids: authorityCases,
    });

    const outOfOrder = createExact24kScannerRuntimeReceiptRecorder("authority");
    expect(() => outOfOrder.pass(authorityCases[1])).toThrow(/expected case/);

    const incomplete = createExact24kScannerRuntimeReceiptRecorder("authority");
    incomplete.pass(authorityCases[0]);
    expect(() => incomplete.seal()).toThrow(/completed 1 of 3/);

    const invented = structuredClone(inventory);
    for (const [shardIndex, shard] of invented.scanner_shards.entries()) {
      shard.case_ids = shard.case_ids.map(
        (_caseId, caseIndex) => `invented-${shardIndex}-${caseIndex}`,
      );
    }
    expect(() => validateExact24kInventory(invented, { repoRoot })).toThrow(
      /immutable runtime receipt cases/,
    );
  });

  it("parses aggregate wiring structurally and rejects comments, decoys, duplicates, and disabled checks", () => {
    const validated = validateExact24kInventory(inventory, { repoRoot });
    const teacherNeed = "      - exact24k_teacher\n";
    const teacherCheck =
      '          test "${{ needs.exact24k_teacher.result }}" = "success"\n';

    const commentedNeed = replaceOnce(
      workflowSource,
      teacherNeed,
      "      # - exact24k_teacher\n",
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: commentedNeed,
      }),
    ).toThrow(/needs must exactly cover/);

    const commentedCheck = replaceOnce(
      workflowSource,
      teacherCheck,
      `          # ${teacherCheck.trim()}\n`,
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: commentedCheck,
      }),
    ).toThrow(/exactly one executable success check/);

    const duplicateNeed = replaceOnce(
      workflowSource,
      teacherNeed,
      `${teacherNeed}${teacherNeed}`,
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: duplicateNeed,
      }),
    ).toThrow(/needs contains duplicates/);

    const disabledResultStep = replaceOnce(
      workflowSource,
      "      - name: Require every CI component to succeed\n",
      "      - name: Require every CI component to succeed\n        if: false\n",
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: disabledResultStep,
      }),
    ).toThrow(/result step keys/);

    const duplicateJob = `${workflowSource}\n  test_and_build: {}\n`;
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: duplicateJob,
      }),
    ).toThrow(/workflow YAML is invalid/);
  });

  it("fails closed when hidden report artifact uploads are missing, warnings, or disabled", () => {
    const validated = validateExact24kInventory(inventory, { repoRoot });
    const scannerArtifactInputs =
      "          path: .artifacts/exact24k-scanner-${{ matrix.id }}.json\n" +
      "          if-no-files-found: error\n" +
      "          include-hidden-files: true\n";

    const hiddenOnlyInComment = replaceOnce(
      workflowSource,
      scannerArtifactInputs,
      "          path: .artifacts/exact24k-scanner-${{ matrix.id }}.json\n" +
        "          if-no-files-found: error\n" +
        "          # include-hidden-files: true\n",
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: hiddenOnlyInComment,
      }),
    ).toThrow(/upload inputs keys/);

    const warningOnly = replaceOnce(
      workflowSource,
      scannerArtifactInputs,
      "          path: .artifacts/exact24k-scanner-${{ matrix.id }}.json\n" +
        "          if-no-files-found: warn\n" +
        "          include-hidden-files: true\n",
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: warningOnly,
      }),
    ).toThrow(/missing report artifact must be an error/);

    const disabledUpload = replaceOnce(
      workflowSource,
      "      - name: Preserve the exact scanner report\n" +
        "        if: always()\n" +
        "        uses: actions/upload-artifact@v7\n",
      "      - name: Preserve the exact scanner report\n" +
        "        if: false\n" +
        "        uses: actions/upload-artifact@v7\n",
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: disabledUpload,
      }),
    ).toThrow(/upload step must execute/);
  });

  it("accepts only the exact target file and title set", () => {
    const expected = expectedExact24kTarget(inventory, "authority");
    const report = passingReport(expected);

    expect(verifyExact24kVitestReport(report, expected, { repoRoot })).toEqual({
      target: "authority",
      file: "tests/unit/ml/floodgateV7TrainingLabelSealedScannerAuthority.test.ts",
      passed_tests: 3,
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

  it("rejects malformed, impossible, and assertion-inconsistent Vitest counters", () => {
    const expected = expectedExact24kTarget(inventory, "authority");
    const report = passingReport(expected);

    for (const mutation of [
      (value: ReportFixture) => {
        value.numTotalTestSuites = "2";
      },
      (value: ReportFixture) => {
        value.numTotalTestSuites = -1;
      },
      (value: ReportFixture) => {
        value.numTotalTestSuites = 2.5;
      },
      (value: ReportFixture) => {
        value.numTotalTestSuites = 999;
        value.numPassedTestSuites = 0;
      },
      (value: ReportFixture) => {
        value.numPassedTestSuites = 1;
      },
      (value: ReportFixture) => {
        value.numTotalTests = expected.titles.length + 1;
      },
      (value: ReportFixture) => {
        value.numPassedTests = expected.titles.length - 1;
      },
      (value: ReportFixture) => {
        value.testResults[0].assertionResults.pop();
      },
      (value: ReportFixture) => {
        value.testResults[0].assertionResults.push({
          title: "invented-extra-case",
          status: "passed",
          failureMessages: [],
        });
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
