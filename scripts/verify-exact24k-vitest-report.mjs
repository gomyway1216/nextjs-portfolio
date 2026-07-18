import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

  for (const shard of inventory.scanner_shards) {
    const sourcePath = path.resolve(repoRoot, shard.file);
    assert(fs.existsSync(sourcePath), `missing scanner file ${shard.file}`);
    const source = fs.readFileSync(sourcePath, "utf8");
    assert(
      source.includes(shard.title),
      `${shard.file} does not contain its exact inventory title`,
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

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function workflowSection(workflow, jobId, nextJobId) {
  const startMarker = `\n  ${jobId}:\n`;
  const start = workflow.indexOf(startMarker);
  assert(start >= 0, `workflow is missing job ${jobId}`);
  if (nextJobId === undefined) return workflow.slice(start);
  const end = workflow.indexOf(
    `\n  ${nextJobId}:\n`,
    start + startMarker.length,
  );
  assert(end > start, `workflow job ${jobId} has no ${nextJobId} boundary`);
  return workflow.slice(start, end);
}

export function validateExact24kCiWiring(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/ci.yml"),
    "utf8",
  );

  const coreSection = workflowSection(
    workflow,
    "core_quality_build",
    "exact24k_scanner",
  );
  const actualExclusions = [
    ...coreSection.matchAll(/(?:^|\s)--exclude\s+(\S+)/g),
  ].map((match) => match[1]);
  assertUniqueStrings(actualExclusions, "core workflow exclusions");
  assert(
    sameStringSet(actualExclusions, inventory.core_exclusions),
    "core workflow exclusions must exactly match core_exclusions",
  );

  const scannerSection = workflowSection(
    workflow,
    "exact24k_scanner",
    "exact24k_teacher",
  );
  const matrixEntries = [
    ...scannerSection.matchAll(/^\s+- id:\s+(\S+)\s*\n\s+file:\s+(\S+)\s*$/gm),
  ].map((match) => ({ id: match[1], file: match[2] }));
  assert(
    matrixEntries.length === inventory.scanner_shards.length,
    "scanner workflow matrix must contain exactly five ID/file entries",
  );
  const expectedPairs = inventory.scanner_shards.map(
    ({ id, file }) => `${id}\0${file}`,
  );
  const actualPairs = matrixEntries.map(({ id, file }) => `${id}\0${file}`);
  assert(
    sameStringSet(actualPairs, expectedPairs),
    "scanner workflow ID/file pairs must exactly match the inventory",
  );
  assert(
    scannerSection.includes('"${{ matrix.file }}"'),
    "scanner workflow must pass matrix.file as the exact test path",
  );
  assert(
    !/(?:^|\s)-t(?:\s|$)|--shard(?:\s|=|$)/m.test(scannerSection),
    "scanner workflow must not select tests with -t or --shard",
  );
  for (const shard of inventory.scanner_shards) {
    assert(
      occurrences(scannerSection, shard.file) === 1,
      `scanner workflow must contain ${shard.file} exactly once`,
    );
  }

  const teacherSection = workflowSection(
    workflow,
    "exact24k_teacher",
    "external_trust_root_protocol",
  );
  assert(
    occurrences(teacherSection, inventory.teacher.file) === 1,
    "Teacher workflow must directly contain its exact file exactly once",
  );
  assert(
    teacherSection.includes("--target teacher"),
    "Teacher workflow must verify the teacher inventory target",
  );
  assert(
    !/(?:^|\s)-t(?:\s|$)|--shard(?:\s|=|$)/m.test(teacherSection),
    "Teacher workflow must not select tests with -t or --shard",
  );

  const aggregateSection = workflowSection(workflow, "test_and_build");
  assert(
    /^\s+name:\s+Test and build\s*$/m.test(aggregateSection),
    "required aggregate name must be exactly Test and build",
  );
  assert(
    /^\s+if:\s+\$\{\{\s*always\(\)\s*\}\}\s*$/m.test(aggregateSection),
    "required aggregate must use if: always()",
  );
  for (const requiredJob of [
    "core_quality_build",
    "exact24k_scanner",
    "exact24k_teacher",
    "external_trust_root_protocol",
    "darwin_exclusive_directory_rename",
    "e2e",
  ]) {
    assert(
      aggregateSection.includes(`- ${requiredJob}`) &&
        aggregateSection.includes(`needs.${requiredJob}.result`),
      `required aggregate must fail closed on ${requiredJob}`,
    );
  }
  if (workflow.includes("\n  aws_witness_adapter_contract:\n")) {
    assert(
      aggregateSection.includes("- aws_witness_adapter_contract") &&
        aggregateSection.includes("needs.aws_witness_adapter_contract.result"),
      "required aggregate must fail closed on aws_witness_adapter_contract",
    );
  }
  return Object.freeze({
    scanner_shards: matrixEntries.length,
    core_exclusions: actualExclusions.length,
    teacher_tests: inventory.teacher.titles.length,
    aggregate: "Test and build",
  });
}

export function expectedExact24kTarget(inventory, targetId) {
  if (targetId === inventory.teacher.id) return inventory.teacher;
  const shard = inventory.scanner_shards.find(({ id }) => id === targetId);
  assert(shard !== undefined, `unknown target ${targetId}`);
  return Object.freeze({ ...shard, titles: [shard.title] });
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
  assert(report.success === true, "Vitest report success must be true");
  assert(report.numFailedTestSuites === 0, "failed suites must be zero");
  assert(report.numPendingTestSuites === 0, "pending suites must be zero");
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
    Array.isArray(report.testResults) && report.testResults.length === 1,
    "report must contain exactly one test file result",
  );

  const [fileResult] = report.testResults;
  assert(
    path.resolve(fileResult.name) === path.resolve(repoRoot, expected.file),
    `report file must be exactly ${expected.file}`,
  );
  assert(fileResult.status === "passed", "test file status must be passed");
  assert(
    Array.isArray(fileResult.assertionResults),
    "assertionResults must be an array",
  );
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
