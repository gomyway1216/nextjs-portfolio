import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  EXACT24K_SCANNER_CASE_IDS,
  exact24kScannerCaseIds,
} from "./exact24k-scanner-runtime-receipt.mjs";
import { parseStrictWorkflowYaml } from "./strict-workflow-yaml.mjs";

export const EXACT24K_INVENTORY_SCHEMA =
  "floodgate-exact24k-vitest-inventory-v1";

export const EXACT24K_SCANNER_FILES = Object.freeze([
  "tests/unit/ml/floodgateV7TrainingLabelSealedScannerAuthority.test.ts",
  "tests/unit/ml/floodgateV7TrainingLabelSealedScannerMutation.test.ts",
  "tests/unit/ml/floodgateV7TrainingLabelSealedScannerReplay.test.ts",
  "tests/unit/ml/floodgateV7TrainingLabelSealedScannerCleanup.test.ts",
  "tests/unit/ml/floodgateV7TrainingLabelSealedScannerProduction.test.ts",
]);

export const EXACT24K_TEACHER_FILE =
  "tests/unit/ml/floodgateV7TeacherCheckpoint.test.ts";

const EXACT_SCANNER_IDS = Object.freeze([
  "authority",
  "mutation",
  "replay",
  "cleanup",
  "production",
]);

function fail(message) {
  throw new Error(`exact-24k report verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertExactKeys(value, keys, label) {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} keys must be exactly ${expected.join(", ")}`,
  );
}

function assertUniqueStrings(values, label) {
  assert(
    Array.isArray(values) && values.length > 0,
    `${label} must be nonempty`,
  );
  assert(
    values.every((value) => typeof value === "string" && value.length > 0),
    `${label} must contain only nonempty strings`,
  );
  assert(
    new Set(values).size === values.length,
    `${label} contains duplicates`,
  );
}

function sameStringSet(actual, expected) {
  return (
    actual.length === expected.length &&
    [...actual]
      .sort()
      .every((entry, index) => entry === [...expected].sort()[index])
  );
}

export function validateExact24kInventory(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  assertExactKeys(
    inventory,
    [
      "schema",
      "exact_parent_count",
      "gates",
      "core_exclusions",
      "scanner_shards",
      "teacher",
    ],
    "inventory",
  );
  assert(
    inventory.schema === EXACT24K_INVENTORY_SCHEMA,
    `inventory schema must be ${EXACT24K_INVENTORY_SCHEMA}`,
  );
  assert(
    inventory.exact_parent_count === 24_000,
    "exact_parent_count must be 24000",
  );
  assert(
    JSON.stringify(inventory.gates) === JSON.stringify([100, 500, 24_000]),
    "gates must be exactly 100, 500, 24000",
  );

  const expectedExclusions = [EXACT24K_TEACHER_FILE, ...EXACT24K_SCANNER_FILES];
  assertUniqueStrings(inventory.core_exclusions, "core_exclusions");
  assert(
    sameStringSet(inventory.core_exclusions, expectedExclusions),
    "core_exclusions must map one-to-one to Teacher plus five scanner files",
  );

  assert(
    Array.isArray(inventory.scanner_shards) &&
      inventory.scanner_shards.length === 5,
    "scanner_shards must contain exactly five entries",
  );
  const scannerIds = [];
  const scannerFiles = [];
  const scannerTitles = [];
  const allCaseIds = [];
  for (const [index, shard] of inventory.scanner_shards.entries()) {
    assertExactKeys(
      shard,
      ["id", "file", "title", "workflow_job", "case_ids"],
      `scanner_shards[${index}]`,
    );
    assertUniqueStrings([shard.id], `scanner_shards[${index}].id`);
    assertUniqueStrings([shard.file], `scanner_shards[${index}].file`);
    assertUniqueStrings([shard.title], `scanner_shards[${index}].title`);
    assert(
      shard.workflow_job === "exact24k_scanner",
      `${shard.id}.workflow_job must be exact24k_scanner`,
    );
    assertUniqueStrings(shard.case_ids, `${shard.id}.case_ids`);
    assert(
      typeof shard.id === "string" &&
        Object.hasOwn(EXACT24K_SCANNER_CASE_IDS, shard.id),
      `${String(shard.id)} must be an own immutable scanner shard ID`,
    );
    assert(
      sameStringSet(shard.case_ids, exact24kScannerCaseIds(shard.id)),
      `${shard.id}.case_ids must match its immutable runtime receipt cases`,
    );
    scannerIds.push(shard.id);
    scannerFiles.push(shard.file);
    scannerTitles.push(shard.title);
    allCaseIds.push(...shard.case_ids);
  }
  assertUniqueStrings(scannerIds, "scanner shard IDs");
  assertUniqueStrings(scannerFiles, "scanner shard files");
  assertUniqueStrings(scannerTitles, "scanner shard titles");
  assertUniqueStrings(allCaseIds, "scanner case IDs");
  assert(
    sameStringSet(scannerIds, EXACT_SCANNER_IDS),
    "scanner shard IDs must be authority, mutation, replay, cleanup, production",
  );
  assert(
    sameStringSet(scannerFiles, EXACT24K_SCANNER_FILES),
    "scanner shard files must match the fixed five-file inventory",
  );

  assertExactKeys(
    inventory.teacher,
    ["id", "file", "workflow_job", "direct_it_titles", "titles"],
    "teacher",
  );
  assert(inventory.teacher.id === "teacher", "teacher.id must be teacher");
  assert(
    inventory.teacher.file === EXACT24K_TEACHER_FILE,
    `teacher.file must be ${EXACT24K_TEACHER_FILE}`,
  );
  assert(
    inventory.teacher.workflow_job === "exact24k_teacher",
    "teacher.workflow_job must be exact24k_teacher",
  );
  assertUniqueStrings(inventory.teacher.titles, "teacher.titles");
  assert(
    inventory.teacher.direct_it_titles === 40,
    "teacher.direct_it_titles must be exactly 40",
  );
  assert(
    inventory.teacher.titles.length === 49,
    "teacher.titles must contain exactly 49 runtime assertions",
  );

  const scannerRuntimeSource = fs.readFileSync(
    path.resolve(
      repoRoot,
      "tests/unit/ml/floodgateV7TrainingLabelSealedScanner.shared.ts",
    ),
    "utf8",
  );
  const runtimeCaseIds = [
    ...scannerRuntimeSource.matchAll(/\bcases\.pass\(\s*"([^"]+)"\s*\)/g),
  ].map((match) => match[1]);
  assertUniqueStrings(runtimeCaseIds, "scanner runtime receipt case markers");
  assert(
    sameStringSet(runtimeCaseIds, allCaseIds),
    "scanner runtime receipt markers must match all nineteen immutable case IDs",
  );

  for (const shard of inventory.scanner_shards) {
    const sourcePath = path.resolve(repoRoot, shard.file);
    assert(fs.existsSync(sourcePath), `missing scanner file ${shard.file}`);
    const source = fs.readFileSync(sourcePath, "utf8");
    assert(
      source.includes(`exact24kScannerCaseIds("${shard.id}")`),
      `${shard.file} does not register its immutable runtime receipt cases`,
    );
  }
  const teacherSourcePath = path.resolve(repoRoot, inventory.teacher.file);
  assert(
    fs.existsSync(teacherSourcePath),
    `missing Teacher file ${inventory.teacher.file}`,
  );
  const teacherSource = fs.readFileSync(teacherSourcePath, "utf8");
  const directTeacherTitles = [
    ...teacherSource.matchAll(/\bit\(\s*(["'])(.*?)\1/g),
  ].map((match) => match[2]);
  assertUniqueStrings(directTeacherTitles, "Teacher direct it titles");
  assert(
    directTeacherTitles.length === inventory.teacher.direct_it_titles,
    "Teacher direct it title count does not match the inventory",
  );
  assert(
    directTeacherTitles.every((title) =>
      inventory.teacher.titles.includes(title),
    ),
    "every direct Teacher title must appear in the runtime title inventory",
  );
  return inventory;
}

function workflowRecord(value, label) {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value;
}

function parseWorkflow(workflowSource) {
  let workflow;
  try {
    workflow = parseStrictWorkflowYaml(workflowSource);
  } catch (error) {
    fail(
      `workflow YAML is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return workflowRecord(workflow, "workflow");
}

function workflowJob(jobs, jobId) {
  assert(
    Object.hasOwn(jobs, jobId),
    `workflow is missing executable job ${jobId}`,
  );
  return workflowRecord(jobs[jobId], `workflow job ${jobId}`);
}

function workflowSteps(job, jobId) {
  assert(Array.isArray(job.steps), `${jobId}.steps must be an array`);
  return job.steps.map((step, index) =>
    workflowRecord(step, `${jobId}.steps[${index}]`),
  );
}

function namedStep(job, jobId, name) {
  const matches = workflowSteps(job, jobId).filter(
    (step) => step.name === name,
  );
  assert(
    matches.length === 1,
    `${jobId} must contain exactly one executable ${name} step`,
  );
  return matches[0];
}

function validateRequiredJobKeys(jobs, jobId) {
  const keys = [
    "name",
    "runs-on",
    "timeout-minutes",
    "permissions",
    ...(jobId === "exact24k_scanner" ? ["strategy"] : []),
    ...(jobId === "e2e" ? ["env"] : []),
    "steps",
  ];
  const job = workflowJob(jobs, jobId);
  assertExactKeys(job, keys, `required workflow job ${jobId}`);
  return job;
}

function stepIdentity(step, jobId, index) {
  if (typeof step.name === "string") return `name:${step.name}`;
  if (typeof step.uses === "string") return `uses:${step.uses}`;
  fail(`${jobId}.steps[${index}] has no exact name or action identity`);
}

function exactOrderedSteps(job, jobId, expectedIdentities) {
  const steps = workflowSteps(job, jobId);
  const actualIdentities = steps.map((step, index) =>
    stepIdentity(step, jobId, index),
  );
  assert(
    JSON.stringify(actualIdentities) === JSON.stringify(expectedIdentities),
    `${jobId} ordered step list drifted`,
  );
  return steps;
}

function validateNodeTestPreamble(steps, jobId) {
  const [checkout, setup, pinNpm, install] = steps;
  assertExactKeys(checkout, ["uses"], `${jobId} checkout step`);
  assert(
    checkout.uses === "actions/checkout@v7",
    `${jobId} checkout action drifted`,
  );
  assertExactKeys(setup, ["uses", "with"], `${jobId} setup-node step`);
  assert(
    setup.uses === "actions/setup-node@v6",
    `${jobId} setup-node action drifted`,
  );
  assertExactKeys(
    setup.with,
    ["node-version", "cache"],
    `${jobId} setup-node inputs`,
  );
  assert(
    setup.with["node-version"] === "22.13.0" && setup.with.cache === "npm",
    `${jobId} setup-node inputs drifted`,
  );
  assertExactKeys(pinNpm, ["name", "run"], `${jobId} npm pin step`);
  assert(
    normalizedCommand(pinNpm.run, `${jobId} npm pin command`) ===
      "npm install -g npm@11.14.1",
    `${jobId} npm pin command drifted`,
  );
  assertExactKeys(install, ["name", "run"], `${jobId} install step`);
  assert(
    normalizedCommand(install.run, `${jobId} install command`) === "npm ci",
    `${jobId} install command drifted`,
  );
}

function normalizedCommand(value, label) {
  assert(typeof value === "string" && value.trim() !== "", `${label} is empty`);
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert(
    lines.every((line) => !line.startsWith("#")),
    `${label} must not use shell comments as wiring`,
  );
  return lines.join(" ").replaceAll(/\s+/g, " ");
}

function validateUploadStep(step, jobId, options) {
  assertExactKeys(step, ["name", "if", "uses", "with"], `${jobId} upload step`);
  assert(step.name === options.stepName, `${jobId} upload step name drifted`);
  assert(
    step.if === "always()",
    `${jobId} upload step must execute with if: always()`,
  );
  assert(
    step.uses === "actions/upload-artifact@v7",
    `${jobId} upload step must use actions/upload-artifact@v7`,
  );
  assertExactKeys(
    step.with,
    [
      "name",
      "path",
      "if-no-files-found",
      "include-hidden-files",
      "retention-days",
    ],
    `${jobId} upload inputs`,
  );
  assert(
    step.with.name === options.artifactName,
    `${jobId} artifact name drifted`,
  );
  assert(step.with.path === options.path, `${jobId} upload path drifted`);
  assert(
    step.with["if-no-files-found"] === "error",
    `${jobId} missing report artifact must be an error`,
  );
  assert(
    step.with["include-hidden-files"] === true,
    `${jobId} must include hidden .artifacts files`,
  );
  assert(
    step.with["retention-days"] === 14,
    `${jobId} artifact retention must be 14 days`,
  );
}

export function validateExact24kCiWiring(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workflowSource =
    options.workflowSource ??
    fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  const workflow = parseWorkflow(workflowSource);
  const jobs = workflowRecord(workflow.jobs, "workflow.jobs");
  const requiredJobs = [
    "core_quality_build",
    "exact24k_scanner",
    "exact24k_teacher",
    "external_trust_root_protocol",
    "darwin_exclusive_directory_rename",
    "e2e",
  ];
  if (Object.hasOwn(jobs, "aws_witness_adapter_contract")) {
    requiredJobs.push("aws_witness_adapter_contract");
  }
  const requiredJobRecords = Object.fromEntries(
    requiredJobs.map((jobId) => [jobId, validateRequiredJobKeys(jobs, jobId)]),
  );

  const coreJob = requiredJobRecords.core_quality_build;
  const coreStep = namedStep(
    coreJob,
    "core_quality_build",
    "Run core unit tests with all exact-24k files explicitly excluded",
  );
  assertExactKeys(coreStep, ["name", "run"], "core exact-24k exclusion step");
  const expectedCoreCommand = normalizedCommand(
    `npm test -- ${inventory.core_exclusions
      .map((file) => `--exclude ${file}`)
      .join(" ")}`,
    "expected core command",
  );
  assert(
    normalizedCommand(coreStep.run, "core exclusion command") ===
      expectedCoreCommand,
    "core workflow exclusions must exactly match core_exclusions",
  );

  const scannerJob = requiredJobRecords.exact24k_scanner;
  const scannerStrategy = workflowRecord(
    scannerJob.strategy,
    "exact24k_scanner.strategy",
  );
  const scannerMatrix = workflowRecord(
    scannerStrategy.matrix,
    "exact24k_scanner.strategy.matrix",
  );
  assertExactKeys(
    scannerStrategy,
    ["fail-fast", "matrix"],
    "exact24k_scanner.strategy",
  );
  assert(
    scannerStrategy["fail-fast"] === false,
    "exact24k_scanner.strategy.fail-fast must be false",
  );
  assertExactKeys(
    scannerMatrix,
    ["include"],
    "exact24k_scanner.strategy.matrix",
  );
  assert(
    Array.isArray(scannerMatrix.include),
    "scanner matrix.include must be an array",
  );
  const matrixEntries = scannerMatrix.include.map((entry, index) => {
    assertExactKeys(entry, ["id", "file"], `scanner matrix.include[${index}]`);
    assertUniqueStrings([entry.id], `scanner matrix.include[${index}].id`);
    assertUniqueStrings([entry.file], `scanner matrix.include[${index}].file`);
    return { id: entry.id, file: entry.file };
  });
  assert(
    matrixEntries.length === inventory.scanner_shards.length,
    "scanner workflow matrix must contain exactly five ID/file entries",
  );
  const expectedPairs = inventory.scanner_shards.map(
    ({ id, file }) => `${id}\0${file}`,
  );
  const actualPairs = matrixEntries.map(({ id, file }) => `${id}\0${file}`);
  assertUniqueStrings(actualPairs, "scanner workflow matrix pairs");
  assert(
    sameStringSet(actualPairs, expectedPairs),
    "scanner workflow ID/file pairs must exactly match the inventory",
  );
  const scannerSteps = exactOrderedSteps(scannerJob, "exact24k_scanner", [
    "uses:actions/checkout@v7",
    "uses:actions/setup-node@v6",
    "name:Pin npm to 11.14.1 (matches package.json packageManager)",
    "name:Install dependencies",
    "name:Run the exact scanner file",
    "name:Verify the exact scanner file and title",
    "name:Preserve the exact scanner report",
  ]);
  validateNodeTestPreamble(scannerSteps, "exact24k_scanner");
  const scannerRunStep = scannerSteps[4];
  assertExactKeys(scannerRunStep, ["name", "run"], "exact24k_scanner run step");
  assert(
    normalizedCommand(scannerRunStep.run, "scanner run command") ===
      'npm test -- "${{ matrix.file }}" --reporter=json --outputFile=".artifacts/exact24k-scanner-${{ matrix.id }}.json"',
    "scanner workflow must execute exactly matrix.file without title or generic sharding filters",
  );
  const scannerVerifyStep = scannerSteps[5];
  assertExactKeys(
    scannerVerifyStep,
    ["name", "run"],
    "exact24k_scanner verifier step",
  );
  assert(
    normalizedCommand(scannerVerifyStep.run, "scanner verifier command") ===
      'node scripts/verify-exact24k-vitest-report.mjs --target "${{ matrix.id }}" --report ".artifacts/exact24k-scanner-${{ matrix.id }}.json"',
    "scanner workflow verifier command drifted",
  );
  validateUploadStep(scannerSteps[6], "exact24k_scanner", {
    stepName: "Preserve the exact scanner report",
    artifactName:
      "exact24k-scanner-${{ matrix.id }}-${{ github.sha }}-${{ github.run_attempt }}",
    path: ".artifacts/exact24k-scanner-${{ matrix.id }}.json",
  });

  const teacherJob = requiredJobRecords.exact24k_teacher;
  const teacherSteps = exactOrderedSteps(teacherJob, "exact24k_teacher", [
    "uses:actions/checkout@v7",
    "uses:actions/setup-node@v6",
    "name:Pin npm to 11.14.1 (matches package.json packageManager)",
    "name:Install dependencies",
    "name:Run the exact Teacher checkpoint file",
    "name:Verify the exact Teacher file and all forty-nine runtime titles",
    "name:Preserve the exact Teacher report",
  ]);
  validateNodeTestPreamble(teacherSteps, "exact24k_teacher");
  const teacherRunStep = teacherSteps[4];
  assertExactKeys(teacherRunStep, ["name", "run"], "exact24k_teacher run step");
  assert(
    normalizedCommand(teacherRunStep.run, "Teacher run command") ===
      `npm test -- ${inventory.teacher.file} --reporter=json --outputFile=.artifacts/exact24k-teacher.json`,
    "Teacher workflow must execute exactly its fixed file without title or generic sharding filters",
  );
  const teacherVerifyStep = teacherSteps[5];
  assertExactKeys(
    teacherVerifyStep,
    ["name", "run"],
    "exact24k_teacher verifier step",
  );
  assert(
    normalizedCommand(teacherVerifyStep.run, "Teacher verifier command") ===
      "node scripts/verify-exact24k-vitest-report.mjs --target teacher --report .artifacts/exact24k-teacher.json",
    "Teacher workflow verifier command drifted",
  );
  validateUploadStep(teacherSteps[6], "exact24k_teacher", {
    stepName: "Preserve the exact Teacher report",
    artifactName:
      "exact24k-teacher-${{ github.sha }}-${{ github.run_attempt }}",
    path: ".artifacts/exact24k-teacher.json",
  });

  const aggregateJob = workflowJob(jobs, "test_and_build");
  assertExactKeys(
    aggregateJob,
    [
      "name",
      "if",
      "needs",
      "runs-on",
      "timeout-minutes",
      "permissions",
      "steps",
    ],
    "required aggregate job",
  );
  assert(
    aggregateJob.name === "Test and build",
    "required aggregate name must be exactly Test and build",
  );
  assert(
    aggregateJob.if === "${{ always() }}",
    "required aggregate must use if: always()",
  );
  assertUniqueStrings(aggregateJob.needs, "required aggregate needs");
  assert(
    sameStringSet(aggregateJob.needs, requiredJobs),
    "required aggregate needs must exactly cover every required CI component",
  );
  const aggregateSteps = workflowSteps(aggregateJob, "test_and_build");
  assert(
    aggregateSteps.length === 1,
    "required aggregate must contain exactly one fail-closed step",
  );
  const [aggregateStep] = aggregateSteps;
  assertExactKeys(
    aggregateStep,
    ["name", "run"],
    "required aggregate result step",
  );
  assert(
    aggregateStep.name === "Require every CI component to succeed",
    "required aggregate result step name drifted",
  );
  const actualResultCommands = aggregateStep.run
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const expectedResultCommands = requiredJobs.map(
    (requiredJob) => `test "\${{ needs.${requiredJob}.result }}" = "success"`,
  );
  assert(
    JSON.stringify(actualResultCommands) ===
      JSON.stringify(expectedResultCommands),
    "required aggregate must contain exactly one executable success check for every dependency",
  );

  return Object.freeze({
    scanner_shards: matrixEntries.length,
    core_exclusions: inventory.core_exclusions.length,
    teacher_tests: inventory.teacher.titles.length,
    aggregate: "Test and build",
  });
}

export function expectedExact24kTarget(inventory, targetId) {
  if (targetId === inventory.teacher.id) return inventory.teacher;
  const shard = inventory.scanner_shards.find(({ id }) => id === targetId);
  assert(shard !== undefined, `unknown target ${targetId}`);
  return Object.freeze({ ...shard, titles: [...shard.case_ids] });
}

export function verifyExact24kVitestReport(report, expected, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  assertExactKeys(
    report,
    [
      "numTotalTestSuites",
      "numPassedTestSuites",
      "numFailedTestSuites",
      "numPendingTestSuites",
      "numTotalTests",
      "numPassedTests",
      "numFailedTests",
      "numPendingTests",
      "numTodoTests",
      "snapshot",
      "startTime",
      "success",
      "testResults",
    ],
    "Vitest report",
  );
  const counterNames = [
    "numTotalTestSuites",
    "numPassedTestSuites",
    "numFailedTestSuites",
    "numPendingTestSuites",
    "numTotalTests",
    "numPassedTests",
    "numFailedTests",
    "numPendingTests",
    "numTodoTests",
  ];
  for (const counterName of counterNames) {
    assert(
      Number.isSafeInteger(report[counterName]) && report[counterName] >= 0,
      `${counterName} must be a nonnegative safe integer`,
    );
  }
  assert(report.success === true, "Vitest report success must be true");
  assert(
    report.numTotalTestSuites === 2,
    `expected exactly 2 Vitest suites, received ${report.numTotalTestSuites}`,
  );
  assert(
    report.numPassedTestSuites === 2,
    "both exact Vitest suites must pass",
  );
  assert(report.numFailedTestSuites === 0, "failed suites must be zero");
  assert(report.numPendingTestSuites === 0, "pending suites must be zero");
  assert(
    report.numTotalTestSuites ===
      report.numPassedTestSuites +
        report.numFailedTestSuites +
        report.numPendingTestSuites,
    "suite counters must sum exactly",
  );
  assert(report.numFailedTests === 0, "failed tests must be zero");
  assert(report.numPendingTests === 0, "pending tests must be zero");
  assert(report.numTodoTests === 0, "todo tests must be zero");
  assert(
    report.numTotalTests === expected.titles.length,
    `expected ${expected.titles.length} tests, received ${report.numTotalTests}`,
  );
  assert(
    report.numPassedTests === expected.titles.length,
    `expected ${expected.titles.length} passed tests`,
  );
  assert(
    report.numTotalTests ===
      report.numPassedTests +
        report.numFailedTests +
        report.numPendingTests +
        report.numTodoTests,
    "test counters must sum exactly",
  );
  assert(
    Array.isArray(report.testResults) && report.testResults.length === 1,
    "report must contain exactly one test file result",
  );

  const [fileResult] = report.testResults;
  workflowRecord(fileResult, "Vitest file result");
  assert(
    path.resolve(fileResult.name) === path.resolve(repoRoot, expected.file),
    `report file must be exactly ${expected.file}`,
  );
  assert(fileResult.status === "passed", "test file status must be passed");
  assert(
    Array.isArray(fileResult.assertionResults),
    "assertionResults must be an array",
  );
  assert(
    fileResult.assertionResults.length === report.numTotalTests,
    "assertionResults length must equal numTotalTests",
  );
  for (const [index, assertion] of fileResult.assertionResults.entries()) {
    workflowRecord(assertion, `assertionResults[${index}]`);
  }
  const actualTitles = fileResult.assertionResults.map(({ title }) => title);
  assertUniqueStrings(actualTitles, "reported test titles");
  assert(
    sameStringSet(actualTitles, expected.titles),
    `reported titles must match the exact ${expected.id} inventory`,
  );
  for (const assertion of fileResult.assertionResults) {
    assert(
      assertion.status === "passed",
      `test ${assertion.title} status must be passed`,
    );
    assert(
      Array.isArray(assertion.failureMessages) &&
        assertion.failureMessages.length === 0,
      `test ${assertion.title} must have no failure messages`,
    );
  }
  return Object.freeze({
    target: expected.id,
    file: expected.file,
    passed_tests: expected.titles.length,
  });
}

export function readAndValidateExact24kInventory(inventoryPath, options = {}) {
  const parsed = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  return validateExact24kInventory(parsed, options);
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    assert(
      ["--inventory", "--target", "--report", "--inventory-only"].includes(
        argument,
      ),
      `unknown argument ${argument}`,
    );
    if (argument === "--inventory-only") {
      result.inventoryOnly = true;
      continue;
    }
    const value = argv[index + 1];
    assert(
      value !== undefined && !value.startsWith("--"),
      `${argument} needs a value`,
    );
    result[argument.slice(2)] = value;
    index += 1;
  }
  return result;
}

export function runExact24kReportVerifierCli(argv = process.argv.slice(2)) {
  const arguments_ = parseArguments(argv);
  const repoRoot = process.cwd();
  const inventoryPath = path.resolve(
    repoRoot,
    arguments_.inventory ?? ".github/ci/exact24k-vitest-inventory.json",
  );
  const inventory = readAndValidateExact24kInventory(inventoryPath, {
    repoRoot,
  });
  const wiring = validateExact24kCiWiring(inventory, { repoRoot });
  if (arguments_.inventoryOnly === true) {
    process.stdout.write(
      `${JSON.stringify({
        status: "passed",
        inventory: path.relative(repoRoot, inventoryPath),
        ...wiring,
      })}\n`,
    );
    return;
  }
  assert(typeof arguments_.target === "string", "--target is required");
  assert(typeof arguments_.report === "string", "--report is required");
  const expected = expectedExact24kTarget(inventory, arguments_.target);
  const report = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, arguments_.report), "utf8"),
  );
  const receipt = verifyExact24kVitestReport(report, expected, { repoRoot });
  process.stdout.write(`${JSON.stringify({ status: "passed", ...receipt })}\n`);
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runExact24kReportVerifierCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
