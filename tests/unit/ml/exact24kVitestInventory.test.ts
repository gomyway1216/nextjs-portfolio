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
import { parseStrictWorkflowYaml } from "../../../scripts/strict-workflow-yaml.mjs";

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

function replaceOnceInJob(
  source: string,
  jobId: string,
  nextJobId: string,
  search: string,
  replacement: string,
): string {
  const startMarker = `\n  ${jobId}:\n`;
  const endMarker = `\n  ${nextJobId}:\n`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const section = source.slice(start, end);
  expect(section.split(search)).toHaveLength(2);
  return (
    source.slice(0, start) +
    section.replace(search, replacement) +
    source.slice(end)
  );
}

function removeJobSection(
  source: string,
  jobId: string,
  nextJobId: string,
): string {
  const startMarker = `\n  ${jobId}:\n`;
  const endMarker = `\n  ${nextJobId}:\n`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(0, start) + source.slice(end);
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

    for (const inheritedShardId of [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "valueOf",
    ]) {
      expect(() => exact24kScannerCaseIds(inheritedShardId)).toThrow(
        /unknown shard/,
      );
    }
    expect(() =>
      exact24kScannerCaseIds(Object.create({ toString: () => "authority" })),
    ).toThrow(/unknown shard/);

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

  it("uses prototype-safe YAML mappings and rejects duplicate prototype keys", () => {
    const parsed = parseStrictWorkflowYaml(
      "__proto__: first\nconstructor: second\nprototype: third\nitems:\n  - __proto__: nested\n    constructor: nested-constructor\n",
    ) as Record<string, unknown>;
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(Object.hasOwn(parsed, "constructor")).toBe(true);
    expect(Object.hasOwn(parsed, "prototype")).toBe(true);
    const [nested] = parsed.items as Array<Record<string, unknown>>;
    expect(Object.getPrototypeOf(nested)).toBeNull();
    expect(nested.__proto__).toBe("nested");
    expect(nested.constructor).toBe("nested-constructor");

    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(() =>
        parseStrictWorkflowYaml(`${key}: first\n${key}: duplicate\n`),
      ).toThrow(new RegExp(`duplicate mapping key ${key}`));
      expect(() =>
        parseStrictWorkflowYaml(
          `items:\n  - ${key}: first\n    ${key}: duplicate\n`,
        ),
      ).toThrow(new RegExp(`duplicate mapping key ${key}`));
    }
  });

  it("reports the exact physical line after blank block-scalar lines", () => {
    expect(() =>
      parseStrictWorkflowYaml(
        "job:\n  run: |\n\n    first command\n\n  \tsecond command\n",
      ),
    ).toThrow(
      "strict workflow YAML parse failed at line 6: tabs are forbidden in indentation",
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

    const withoutAwsJob = removeJobSection(
      workflowSource,
      "aws_witness_adapter_contract",
      "darwin_exclusive_directory_rename",
    );
    const withoutAwsNeed = replaceOnce(
      withoutAwsJob,
      "      - aws_witness_adapter_contract\n",
      "",
    );
    const withoutAwsNeedOrResult = replaceOnce(
      withoutAwsNeed,
      '          test "${{ needs.aws_witness_adapter_contract.result }}" = "success"\n',
      "",
    );
    expect(() =>
      validateExact24kCiWiring(validated, {
        repoRoot,
        workflowSource: withoutAwsNeedOrResult,
      }),
    ).toThrow(
      /workflow is missing executable job aws_witness_adapter_contract/,
    );
  });

  it("rejects disabling and continue-on-error on every required component job", () => {
    const validated = validateExact24kInventory(inventory, { repoRoot });
    for (const jobId of [
      "core_quality_build",
      "exact24k_scanner",
      "exact24k_teacher",
      "external_trust_root_protocol",
      "aws_witness_adapter_contract",
      "darwin_exclusive_directory_rename",
      "e2e",
    ]) {
      for (const property of ["if: false", "continue-on-error: true"]) {
        const mutated = replaceOnce(
          workflowSource,
          `\n  ${jobId}:\n`,
          `\n  ${jobId}:\n    ${property}\n`,
        );
        expect(() =>
          validateExact24kCiWiring(validated, {
            repoRoot,
            workflowSource: mutated,
          }),
        ).toThrow(new RegExp(`required workflow job ${jobId} keys`));
      }
    }
  });

  it("requires the exact scanner strategy and matrix keys", () => {
    const validated = validateExact24kInventory(inventory, { repoRoot });
    for (const mutated of [
      replaceOnceInJob(
        workflowSource,
        "exact24k_scanner",
        "exact24k_teacher",
        "    strategy:\n      fail-fast: false\n",
        "    strategy:\n      max-parallel: 5\n      fail-fast: false\n",
      ),
      replaceOnceInJob(
        workflowSource,
        "exact24k_scanner",
        "exact24k_teacher",
        "      matrix:\n        include:\n",
        "      matrix:\n        exclude: []\n        include:\n",
      ),
      replaceOnceInJob(
        workflowSource,
        "exact24k_scanner",
        "exact24k_teacher",
        "      fail-fast: false\n",
        "      fail-fast: true\n",
      ),
    ]) {
      expect(() =>
        validateExact24kCiWiring(validated, {
          repoRoot,
          workflowSource: mutated,
        }),
      ).toThrow(/exact24k_scanner\.strategy/);
    }
  });

  it("requires exact ordered scanner and Teacher steps without inserted or tampered steps", () => {
    const validated = validateExact24kInventory(inventory, { repoRoot });
    for (const [jobId, nextJobId, uploadStep] of [
      [
        "exact24k_scanner",
        "exact24k_teacher",
        "Preserve the exact scanner report",
      ],
      [
        "exact24k_teacher",
        "external_trust_root_protocol",
        "Preserve the exact Teacher report",
      ],
    ]) {
      const inserted = replaceOnceInJob(
        workflowSource,
        jobId,
        nextJobId,
        `      - name: ${uploadStep}\n`,
        "      - name: Decoy between verification and upload\n" +
          '        run: "true"\n\n' +
          `      - name: ${uploadStep}\n`,
      );
      expect(() =>
        validateExact24kCiWiring(validated, {
          repoRoot,
          workflowSource: inserted,
        }),
      ).toThrow(new RegExp(`${jobId} ordered step list drifted`));

      const tamperedSetup = replaceOnceInJob(
        workflowSource,
        jobId,
        nextJobId,
        '          cache: "npm"\n',
        '          cache: "tampered"\n',
      );
      expect(() =>
        validateExact24kCiWiring(validated, {
          repoRoot,
          workflowSource: tamperedSetup,
        }),
      ).toThrow(new RegExp(`${jobId} setup-node inputs drifted`));
    }
  });

  it("pins exact scanner and Teacher upload actions, names, paths, and options", () => {
    const validated = validateExact24kInventory(inventory, { repoRoot });
    for (const contract of [
      {
        jobId: "exact24k_scanner",
        nextJobId: "exact24k_teacher",
        artifactName:
          "exact24k-scanner-${{ matrix.id }}-${{ github.sha }}-${{ github.run_attempt }}",
        artifactPath: ".artifacts/exact24k-scanner-${{ matrix.id }}.json",
      },
      {
        jobId: "exact24k_teacher",
        nextJobId: "external_trust_root_protocol",
        artifactName:
          "exact24k-teacher-${{ github.sha }}-${{ github.run_attempt }}",
        artifactPath: ".artifacts/exact24k-teacher.json",
      },
    ]) {
      for (const [search, replacement, error] of [
        [
          "        uses: actions/upload-artifact@v7\n",
          "        uses: actions/upload-artifact@v6\n",
          /upload-artifact@v7/,
        ],
        [
          `          name: ${contract.artifactName}\n`,
          "          name: tampered-artifact\n",
          /artifact name drifted/,
        ],
        [
          `          path: ${contract.artifactPath}\n`,
          `          path: ${contract.artifactPath}.tampered\n`,
          /upload path drifted/,
        ],
        [
          "          retention-days: 14\n",
          "          retention-days: 13\n",
          /artifact retention must be 14 days/,
        ],
      ] as const) {
        const mutated = replaceOnceInJob(
          workflowSource,
          contract.jobId,
          contract.nextJobId,
          search,
          replacement,
        );
        expect(() =>
          validateExact24kCiWiring(validated, {
            repoRoot,
            workflowSource: mutated,
          }),
        ).toThrow(error);
      }
    }
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
