import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const moduleRelative = "native/floodgate-v7-external-trust-root-protocol";
const sourceRelative = `${moduleRelative}/Sources/FloodgateV7ExternalTrustRootProtocol`;
const testRelative = `${moduleRelative}/Tests/FloodgateV7ExternalTrustRootProtocolTests`;
const evidenceRelative =
  "docs/data/floodgate-v7-runtime-policy-preimages-2026-07-18.json";
const fixtureRelative =
  "tests/fixtures/floodgate-v7-external-trust-root-canonical-golden-v1.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-runtime-policy-preimages.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-runtime-policy-preimages.en.md";
const workflowRelative = ".github/workflows/ci.yml";
const symbolGraphVerifierRelative = `${moduleRelative}/Tests/verify-public-api-symbol-graph.py`;
const serviceCoreBoundaryVerifierRelative = `${moduleRelative}/Tests/verify-remote-witness-service-core-boundary.py`;
const protocolSymbolGraphPath = `${moduleRelative}/.build/**/symbolgraph/FloodgateV7ExternalTrustRootProtocol*.symbols.json`;
const serviceCoreSymbolGraphPath = `${moduleRelative}/.build/**/symbolgraph/FloodgateV7RemoteWitnessServiceCore*.symbols.json`;
const productionLauncherTestRelative =
  "tests/unit/ml/floodgateV7ProductionNativeLauncher.test.ts";
const implementationEvidenceRevision =
  "773f7eb88f943385ac89a6ec0e61d9e7a23e5e12";
const implementationEvidenceTree = "ef6a4f738393d1dfc59ce2c4752628633cf16f14";
const finalLocalEvidenceRevision = "69e982e52966d24f21c994cf42494d4234e4420e";
const finalLocalEvidenceTree = "192c847d4eb0396654b886acb7e930dea493fbdf";
const remoteHeadRevision = "64ffac635ff826ae22368bbdc0404452623f4e14";
const remoteHeadTree = "0d4d4d3e42076ccf7b70226d6ad9729acfcc5c56";
const toolchainCalibrationRevision = "f5a264d4d062a4e30e6b8c6de3c104acf432996d";
const toolchainCalibrationTree = "914b2bf91ca722c89b82714efdd22b835affefb9";
const toolchainSelfCheckRemediationRevision =
  "7d9281129e0d6447a70c1cbbbf20d3ec967d940b";
const toolchainSelfCheckRemediationTree =
  "1355122d15bb9284cbb79713c81a5287931879a8";
const publicationValidationPaths = [
  japaneseArticleRelative,
  englishArticleRelative,
  evidenceRelative,
  "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts",
  workflowRelative,
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function gitOutput(arguments_: string[]): string {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin",
    },
  }).trim();
}

function workflowJob(workflow: string, jobName: string): string {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  expect(start, `missing workflow job: ${jobName}`).toBeGreaterThanOrEqual(0);
  const afterMarker = start + marker.length;
  const nextJobOffset = workflow
    .slice(afterMarker)
    .search(/^  [A-Za-z0-9_-]+:\n/gmu);
  const end =
    nextJobOffset === -1 ? workflow.length : afterMarker + nextJobOffset;
  return workflow.slice(start, end);
}

function workflowStep(job: string, stepName: string): string {
  const marker = `      - name: ${stepName}\n`;
  const start = job.indexOf(marker);
  expect(start, `missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);
  const afterMarker = start + marker.length;
  const nextStepOffset = job.slice(afterMarker).search(/^      - /gmu);
  const end = nextStepOffset === -1 ? job.length : afterMarker + nextStepOffset;
  return job.slice(start, end);
}

function workflowScalar(
  step: string,
  indentation: number,
  key: string,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matches = Array.from(
    step.matchAll(
      new RegExp(
        `^${" ".repeat(indentation)}${escapedKey}:[ \\t]*([^#\\n]*?)(?:[ \\t]+#.*)?$`,
        "gmu",
      ),
    ),
  );
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one ${key} scalar at indentation ${indentation}, found ${matches.length}`,
    );
  }
  return matches[0][1].trim();
}

function assertExactLineOnce(text: string, line: string): void {
  const count = text
    .split("\n")
    .filter((candidate) => candidate === line).length;
  if (count !== 1) {
    throw new Error(`expected exact line once, found ${count}: ${line}`);
  }
}

function assertSubstringCount(
  text: string,
  substring: string,
  expectedCount: number,
): void {
  const count = text.split(substring).length - 1;
  if (count !== expectedCount) {
    throw new Error(
      `expected substring ${expectedCount} time(s), found ${count}: ${substring}`,
    );
  }
}

function assertCalibrationArtifactStep(step: string): void {
  const expectedStep = [
    "      - name: Preserve public symbol graphs for exact-diff calibration",
    "        if: always()",
    "        uses: actions/upload-artifact@v7",
    "        with:",
    "          name: floodgate-v7-public-symbol-graphs-${{ runner.os }}-${{ runner.arch }}-${{ github.sha }}-${{ github.run_attempt }}",
    "          path: |",
    `            ${protocolSymbolGraphPath}`,
    `            ${serviceCoreSymbolGraphPath}`,
    "          if-no-files-found: error",
    "          include-hidden-files: true",
    "          retention-days: 14",
  ].join("\n");
  if (step.trimEnd() !== expectedStep) {
    throw new Error(
      "public symbol-graph calibration artifact step is not the exact two-graph upload",
    );
  }
}

function assertSingleCalibrationArtifactUpload(
  job: string,
  workflow = job,
): void {
  const yamlAnchorOrAliasTokens = workflow.match(
    /(?:^|[ \t:[\]{},?])(?:&|\*)(?![&*])[^\s\[\]{},#]+/gmu,
  );
  if (yamlAnchorOrAliasTokens !== null) {
    throw new Error(
      `workflow YAML anchors and aliases are forbidden in this provenance gate: ${yamlAnchorOrAliasTokens.join(", ")}`,
    );
  }
  const stepMarkers = job.match(
    /^      - name: Preserve public symbol graphs for exact-diff calibration$/gmu,
  );
  if (stepMarkers?.length !== 1) {
    throw new Error(
      `expected exactly one calibration artifact step, found ${stepMarkers?.length ?? 0}`,
    );
  }
  const uploadActionReferences = job.match(/actions\/upload-artifact@/giu);
  if (uploadActionReferences?.length !== 1) {
    throw new Error(
      `expected exactly one upload-artifact action reference in the external trust-root job, found ${uploadActionReferences?.length ?? 0}`,
    );
  }
  const usesValues = job.split("\n").flatMap((line) => {
    const match = line
      .trimStart()
      .match(/^(?:-[ \t]+)?uses[ \t]*:[ \t]*([^#\n]*?)(?:[ \t]+#.*)?$/iu);
    return match === null ? [] : [match[1].trim()];
  });
  const expectedUsesValues = [
    "actions/checkout@v7",
    "actions/upload-artifact@v7",
  ];
  if (JSON.stringify(usesValues) !== JSON.stringify(expectedUsesValues)) {
    throw new Error(
      `unexpected external trust-root job uses values: ${JSON.stringify(usesValues)}`,
    );
  }
  assertSubstringCount(job, protocolSymbolGraphPath, 1);
  assertSubstringCount(job, serviceCoreSymbolGraphPath, 1);
  assertCalibrationArtifactStep(
    workflowStep(
      job,
      "Preserve public symbol graphs for exact-diff calibration",
    ),
  );
}

function assertExternalTrustRootProtocolJob(job: string, workflow = job): void {
  const expectedJob = [
    "  external_trust_root_protocol:",
    "    name: External trust-root protocol (source only)",
    "    runs-on: macos-latest",
    "    timeout-minutes: 10",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - uses: actions/checkout@v7",
    "",
    "      - name: Record Swift symbol-graph calibration context",
    "        run: |",
    "          xcodebuild -version",
    "          xcrun swift --version",
    "",
    "      - name: Run dependency-free Swift protocol tests",
    "        run: >-",
    "          xcrun swift test",
    `          --package-path ${moduleRelative}`,
    "",
    "      - name: Verify external trust-root public API surface",
    "        run: |",
    "          xcrun swift package \\",
    `            --package-path ${moduleRelative} \\`,
    "            dump-symbol-graph \\",
    "            --minimum-access-level public \\",
    "            --include-spi-symbols \\",
    "            --skip-synthesized-members",
    "          /usr/bin/python3 \\",
    `            ${symbolGraphVerifierRelative}`,
    "          /usr/bin/python3 \\",
    `            ${serviceCoreBoundaryVerifierRelative}`,
    "",
    "      - name: Preserve public symbol graphs for exact-diff calibration",
    "        if: always()",
    "        uses: actions/upload-artifact@v7",
    "        with:",
    "          name: floodgate-v7-public-symbol-graphs-${{ runner.os }}-${{ runner.arch }}-${{ github.sha }}-${{ github.run_attempt }}",
    "          path: |",
    `            ${protocolSymbolGraphPath}`,
    `            ${serviceCoreSymbolGraphPath}`,
    "          if-no-files-found: error",
    "          include-hidden-files: true",
    "          retention-days: 14",
  ].join("\n");
  if (job.trimEnd() !== expectedJob) {
    throw new Error("external trust-root job mapping is not exact");
  }
  if (workflow !== job) {
    const jobsMarker = "\njobs:\n";
    const jobsOffset = workflow.indexOf(jobsMarker);
    if (jobsOffset < 0) {
      throw new Error("workflow is missing the top-level jobs mapping");
    }
    const expectedPreamble = [
      "name: CI",
      "",
      "on:",
      "  pull_request:",
      "    branches: [main]",
      "  push:",
      "    branches: [main]",
      "",
      "# Cancel in-progress runs when new commits are pushed to the same ref, so",
      "# rapid pushes don't pile up redundant CI runs (only the latest matters).",
      "concurrency:",
      "  group: ${{ github.workflow }}-${{ github.ref }}",
      "  cancel-in-progress: true",
      "",
      "jobs:",
    ].join("\n");
    if (
      workflow.slice(0, jobsOffset + jobsMarker.length).trimEnd()
      !== expectedPreamble
    ) {
      throw new Error("workflow-level mapping before jobs is not exact");
    }
    const unexpectedPostJobsTopLevelLine = workflow
      .slice(jobsOffset + jobsMarker.length)
      .split("\n")
      .find(
        (line) =>
          line.trim() !== ""
          && !line.startsWith(" ")
          && !line.startsWith("#"),
      );
    if (unexpectedPostJobsTopLevelLine !== undefined) {
      throw new Error(
        "workflow contains a top-level mapping after jobs: "
        + unexpectedPostJobsTopLevelLine,
      );
    }
  }
  const stepsMarker = "    steps:\n";
  const stepsOffset = job.indexOf(stepsMarker);
  if (stepsOffset < 0) {
    throw new Error("external trust-root job is missing its steps boundary");
  }
  const expectedJobHeader = [
    "  external_trust_root_protocol:",
    "    name: External trust-root protocol (source only)",
    "    runs-on: macos-latest",
    "    timeout-minutes: 10",
    "    permissions:",
    "      contents: read",
    "    steps:",
  ].join("\n");
  if (
    job.slice(0, stepsOffset + stepsMarker.length).trimEnd()
    !== expectedJobHeader
  ) {
    throw new Error("external trust-root job header is not exact");
  }
  if (/defaults\s*:/iu.test(workflow)) {
    throw new Error("workflow or job run defaults are forbidden");
  }
  if (/continue-on-error\s*:/iu.test(job)) {
    throw new Error("external trust-root job cannot ignore step failures");
  }
  const conditionLines = job
    .split("\n")
    .filter((line) => /^[ \t]+if[ \t]*:/iu.test(line));
  if (
    JSON.stringify(conditionLines)
    !== JSON.stringify(["        if: always()"])
  ) {
    throw new Error(
      `external trust-root job conditions drifted: ${JSON.stringify(conditionLines)}`,
    );
  }
  const calibrationContextStep = workflowStep(
    job,
    "Record Swift symbol-graph calibration context",
  );
  for (const line of [
    "          xcodebuild -version",
    "          xcrun swift --version",
  ]) {
    assertExactLineOnce(calibrationContextStep, line);
  }
  const verificationStep = workflowStep(
    job,
    "Verify external trust-root public API surface",
  );
  const expectedVerificationStep = [
    "      - name: Verify external trust-root public API surface",
    "        run: |",
    "          xcrun swift package \\",
    `            --package-path ${moduleRelative} \\`,
    "            dump-symbol-graph \\",
    "            --minimum-access-level public \\",
    "            --include-spi-symbols \\",
    "            --skip-synthesized-members",
    "          /usr/bin/python3 \\",
    `            ${symbolGraphVerifierRelative}`,
    "          /usr/bin/python3 \\",
    `            ${serviceCoreBoundaryVerifierRelative}`,
  ].join("\n");
  if (verificationStep.trimEnd() !== expectedVerificationStep) {
    throw new Error(
      "external trust-root verification step is not the exact two-checker command",
    );
  }
  assertSubstringCount(job, "/usr/bin/python3", 2);
  assertSubstringCount(job, symbolGraphVerifierRelative, 1);
  assertSubstringCount(job, serviceCoreBoundaryVerifierRelative, 1);
  assertSingleCalibrationArtifactUpload(job, workflow);
}

function expectSubstringsInOrder(text: string, substrings: string[]): void {
  let previousIndex = -1;
  for (const substring of substrings) {
    const index = text.indexOf(substring, previousIndex + 1);
    expect(
      index,
      `missing or out-of-order substring: ${substring}`,
    ).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("Floodgate v7 runtime policy canonical preimage evidence", () => {
  it("pins exact argv, cwd, environment, and runtime-install canonical records", () => {
    const source = read(
      `${sourceRelative}/RuntimeLaunchPreimageRecordsV1.swift`,
    );
    const tests = read(
      `${testRelative}/RuntimeLaunchPreimageRecordTests.swift`,
    );

    for (const [typeName, magic, byteCount] of [
      ["FixedArgvRecordV1", "FGV7ARV1", "265"],
      ["FixedWorkingDirectoryRecordV1", "FGV7CWD1", "17"],
      ["FixedEnvironmentRecordV1", "FGV7ENV1", "16"],
      ["RuntimeInstallPolicyRecordV1", "FGV7RIP1", "1_307"],
    ]) {
      expect(source).toContain(`public struct ${typeName}`);
      expect(source).toContain(`Array("${magic}".utf8)`);
      expect(source).toContain(`canonicalByteCount = ${byteCount}`);
    }
    expect(source).toContain("canonicalPathCount = 11");
    expect(source).toContain("allowedWritableACLEntryCount: UInt32 = 0");
    expect(source).toContain("regularFile(nodeExecutablePath, mode: 0o555)");
    expect(source).toContain(
      "regularFile(diagnosticEntryBundlePath, mode: 0o444)",
    );
    expect(source).toContain(
      'directory("/Library/Application Support", ownerGID: 80)',
    );
    expect(tests).toContain(
      "testPreimageClosureRejectsEveryPolicyDigestSubstitution",
    );
    expect(tests).toContain(
      "testPreimageClosureRejectsInstallAndManifestDrift",
    );
    const runtimeInstallSource = source.slice(
      source.indexOf("public struct RuntimeInstallPolicyRecordV1"),
      source.indexOf("public struct RuntimeLaunchPreimageClosureV1"),
    );
    expect(
      Array.from(
        runtimeInstallSource.matchAll(
          /public let (recordID|[A-Za-z]+SHA256): CanonicalBytes32/gu,
        ),
        (match) => match[1],
      ),
    ).toEqual([
      "recordID",
      "nodeWholeFileSHA256",
      "nodeCodeDirectorySHA256",
      "nodeDesignatedRequirementSHA256",
      "nodeHeldExecutableIdentitySHA256",
      "diagnosticEntryBundleWholeFileSHA256",
      "diagnosticEntryBundleHeldFileIdentitySHA256",
      "filesystemIdentityPolicySHA256",
      "aclPolicySHA256",
    ]);
  });

  it("removes raw launch-policy handoff and requires the composed closure everywhere", () => {
    const preimageSource = read(
      `${sourceRelative}/RuntimeLaunchPreimageRecordsV1.swift`,
    );
    const compactPreimageSource = preimageSource.replaceAll(/\s/gu, "");
    const handoffSource = read(
      `${sourceRelative}/ExternalVerifierHandoffV1.swift`,
    );
    const manifestSource = read(
      `${sourceRelative}/RepositorySourceManifestV1.swift`,
    );
    const coreSource = read(`${sourceRelative}/VerifierSupervisorCoreV1.swift`);
    const handoffTests = read(
      `${testRelative}/AuthenticatedHandoffTests.swift`,
    );
    const workflow = read(workflowRelative);
    const symbolGraphVerifier = read(symbolGraphVerifierRelative);
    const productionLauncherTest = read(productionLauncherTestRelative);
    const evidenceTestSource = read(
      "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts",
    );

    expect(preimageSource).toContain(
      "public struct RuntimeLaunchPreimageClosureV1",
    );
    expect(preimageSource).toContain("runtimeLaunchPolicy.fixedArgvSHA256");
    expect(preimageSource).toContain(
      "runtimeLaunchPolicy.runtimeInstallPolicySHA256",
    );
    expect(preimageSource).toContain(
      "runtimeInstallPolicy.nodeWholeFileSHA256",
    );
    expect(compactPreimageSource).toContain(
      "sourceManifest.pinnedNodeHeldExecutableIdentitySHA256",
    );
    for (const source of [handoffSource, coreSource]) {
      expect(source).toContain(
        "runtimeLaunchPreimageClosure:\n            RuntimeLaunchPreimageClosureV1",
      );
      expect(source).not.toContain(
        "runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1",
      );
      expect(source).toContain("try runtimeLaunchPreimageClosure.validate(");
    }
    expect(handoffSource).not.toMatch(
      /public func verify\(\n\s+publicKeyRawRepresentation: \[UInt8\],\n\s+nowUnixSeconds: UInt64,\n\s+nowMonotonicNanoseconds: UInt64/u,
    );
    expect(manifestSource).not.toContain(
      "public func validateRuntimeLaunchPolicy",
    );
    expect(handoffTests).toContain(
      "testEveryPublicHandoffEntryPointRejectsManifestMismatchedClosure",
    );
    expect(symbolGraphVerifier).toContain(
      '"TrustRootSupervisorSessionV1", "issueChallenge("',
    );
    expect(symbolGraphVerifier).toContain(
      '"TrustRootVerifierCoreV1", "issueReceipt("',
    );
    expect(symbolGraphVerifier).toContain(
      '"TrustRootSupervisorSessionV1", "issueAttestation("',
    );
    expect(symbolGraphVerifier).toContain(
      '"OneShotAttestationConsumerV1", "consume("',
    );
    expect(symbolGraphVerifier).toContain("REQUIRED_FULL_ENTRYPOINTS");
    expect(symbolGraphVerifier).toContain("FORBIDDEN_PARTIAL_ENTRYPOINTS");
    expect(symbolGraphVerifier).toContain("CALLABLE_KINDS");
    expect(symbolGraphVerifier).toContain("FUNCTION_PROPERTY_KINDS");
    expect(symbolGraphVerifier).toContain("ALLOWED_RAW_POLICY_PRODUCER");
    expect(symbolGraphVerifier).toContain("EXPECTED_PUBLIC_SURFACE_PROFILES");
    expect(symbolGraphVerifier).toContain(
      "xcode-15.3-swift-5.10-arm64-macos13",
    );
    expect(symbolGraphVerifier).toContain(
      "57ff6311d811d0f4ae3459cdc65d0a87c2595f78a45d91565ba714f5c39f2461",
    );
    expect(symbolGraphVerifier).toContain(
      "xcode-26.5-swift-6.3.2-arm64-macos13",
    );
    expect(symbolGraphVerifier).toContain(
      "1c7cfd318999e04a46513d96895f6b345801b948937fdc01a7064fe42d16266a",
    );
    expect(symbolGraphVerifier).toContain("Apple Swift version 6.3.2 ");
    expect(symbolGraphVerifier).toContain(
      "(swiftlang-6.3.2.1.108 clang-2100.1.1.101)",
    );
    expect(symbolGraphVerifier).toContain("approved_public_surface_profile");
    expect(symbolGraphVerifier).toContain(
      "run_calibration_profile_self_checks",
    );
    expect(symbolGraphVerifier).toContain("consistent_public_surface_profile");
    expect(symbolGraphVerifier).toContain(
      "unapproved symbol-graph calibration context",
    );
    for (const context of ["generator", "format", "platform", "module"]) {
      expect(symbolGraphVerifier).toContain(`"${context}"`);
    }
    expect(symbolGraphVerifier).toContain(
      'f"unknown {context_label} calibration context "',
    );
    expect(symbolGraphVerifier).toContain(
      "mixed base/shard calibration profiles unexpectedly passed",
    );
    expect(symbolGraphVerifier).toContain("base/shard files use different ");
    expect(symbolGraphVerifier).toContain("normalized_public_surface");
    expect(symbolGraphVerifier).toContain("access_level");
    expect(symbolGraphVerifier).toContain('symbol.get("spi", False)');
    expect(symbolGraphVerifier).toContain('identifier.get("precise")');
    expect(symbolGraphVerifier).toContain("declaration_fragments");
    expect(symbolGraphVerifier).toContain("preciseIdentifier");
    expect(symbolGraphVerifier).toContain("public/SPI symbol surface mismatch");
    expect(symbolGraphVerifier).toContain("UnexpectedPublicSurface");
    expect(symbolGraphVerifier).toContain("same-path declaration mutation");
    expect(symbolGraphVerifier).toContain("normalized_relationships");
    expect(symbolGraphVerifier).toContain("relationship-only mutation");
    expect(symbolGraphVerifier).toContain('"kind") == "conformsTo"');
    expect(symbolGraphVerifier).toContain(
      "public API symbol-graph calibration context",
    );
    expect(symbolGraphVerifier).toContain('metadata.get("formatVersion")');
    expect(symbolGraphVerifier).toContain(
      'module.get("name") != SYMBOL_GRAPH_MODULE',
    );
    expect(symbolGraphVerifier).toContain("is_protocol_symbol_graph_filename");
    expect(symbolGraphVerifier).toContain("@Swift.symbols.json");
    expect(symbolGraphVerifier).toContain('"swift.func.op"');
    expect(symbolGraphVerifier).toContain('"swift.subscript"');
    expect(symbolGraphVerifier).toContain('"swift.type.subscript"');
    expect(symbolGraphVerifier).toContain('"bypass(preimages:)"');
    expect(symbolGraphVerifier).toContain('"issueChallenge(manifest:)"');
    expect(symbolGraphVerifier).toContain(
      "public callable accepts a raw launch policy",
    );
    expect(symbolGraphVerifier).toContain(
      "public security typealias is forbidden",
    );
    expect(symbolGraphVerifier).toContain(
      "public function property exposes a protected runtime-launch type",
    );
    expect(symbolGraphVerifier).toContain('("Preimages",');
    expect(symbolGraphVerifier).toContain('("RawPolicy",');
    expect(symbolGraphVerifier).toContain('"rawPolicyBypass"');
    expect(symbolGraphVerifier).toContain('"closureBypass"');
    expect(symbolGraphVerifier).toContain('"makeRawBypass()"');
    expect(symbolGraphVerifier).toContain('"makeClosureBypass()"');
    expect(symbolGraphVerifier).toContain("run_synthetic_regression_checks");
    expect(symbolGraphVerifier).toContain(
      "for symbol_graph_directory in symbol_graph_directories:",
    );
    expect(symbolGraphVerifier).toContain(
      "for symbol_graph_file in symbol_graph_files:",
    );
    expect(productionLauncherTest).toContain("retryableParentSignal");
    expect(productionLauncherTest).toContain(
      'firstSignal === "SIGABRT" || firstSignal === "SIGKILL"',
    );
    expect(productionLauncherTest).toContain(
      "[floodgate-v7-test] retrying DYLD rejection",
    );
    expect(productionLauncherTest).toContain(
      "expect(result.signal).toBeNull()",
    );
    expect(productionLauncherTest).toContain("stderr_utf8_bytes=");
    expect(productionLauncherTest).not.toContain(
      "JSON.stringify(result.stderr)",
    );
    expect(evidenceTestSource).toContain('PATH: "/usr/bin:/bin"');
    expect(evidenceTestSource).toContain('NODE_ENV: "test"');
    expect(evidenceTestSource).toContain("function workflowJob");
    expect(evidenceTestSource).toContain(".search(/^  [A-Za-z0-9_-]+:\\n/gmu)");
    const externalTrustRootJob = workflowJob(
      workflow,
      "external_trust_root_protocol",
    );
    expect(() =>
      assertExternalTrustRootProtocolJob(externalTrustRootJob, workflow),
    ).not.toThrow();
    const artifactStep = workflowStep(
      externalTrustRootJob,
      "Preserve public symbol graphs for exact-diff calibration",
    );
    expect(() =>
      assertSingleCalibrationArtifactUpload(externalTrustRootJob),
    ).not.toThrow();
    const commentDecoyMutations = [
      ["        if: always()", "        if: success() # if: always()"],
      [
        "        uses: actions/upload-artifact@v7",
        "        uses: actions/upload-artifact@v6 # uses: actions/upload-artifact@v7",
      ],
      [
        "          name: floodgate-v7-public-symbol-graphs-${{ runner.os }}-${{ runner.arch }}-${{ github.sha }}-${{ github.run_attempt }}",
        "          name: unsafe # name: floodgate-v7-public-symbol-graphs-${{ runner.os }}-${{ runner.arch }}-${{ github.sha }}-${{ github.run_attempt }}",
      ],
      [
        "          path: |",
        "          path: /etc/passwd # path: |",
      ],
      [
        `            ${protocolSymbolGraphPath}`,
        `            /etc/passwd # ${protocolSymbolGraphPath}`,
      ],
      [
        `            ${serviceCoreSymbolGraphPath}`,
        `            /etc/passwd # ${serviceCoreSymbolGraphPath}`,
      ],
      [
        "          if-no-files-found: error",
        "          if-no-files-found: warn # if-no-files-found: error",
      ],
      [
        "          include-hidden-files: true",
        "          include-hidden-files: false # include-hidden-files: true",
      ],
      [
        "          retention-days: 14",
        "          retention-days: 1 # retention-days: 14",
      ],
    ] as const;
    for (const [safeLine, unsafeLine] of commentDecoyMutations) {
      const mutation = artifactStep.replace(safeLine, unsafeLine);
      expect(mutation).not.toBe(artifactStep);
      expect(() => assertCalibrationArtifactStep(mutation)).toThrow();
    }
    const duplicateProtocolGraphArtifactStep = artifactStep.replace(
      `            ${serviceCoreSymbolGraphPath}\n`,
      `            ${protocolSymbolGraphPath}\n            ${serviceCoreSymbolGraphPath}\n`,
    );
    expect(duplicateProtocolGraphArtifactStep).not.toBe(artifactStep);
    expect(() =>
      assertCalibrationArtifactStep(duplicateProtocolGraphArtifactStep),
    ).toThrow();
    const duplicateServiceCoreGraphArtifactStep = artifactStep.replace(
      `            ${serviceCoreSymbolGraphPath}\n`,
      `            ${serviceCoreSymbolGraphPath}\n            ${serviceCoreSymbolGraphPath}\n`,
    );
    expect(duplicateServiceCoreGraphArtifactStep).not.toBe(artifactStep);
    expect(() =>
      assertCalibrationArtifactStep(duplicateServiceCoreGraphArtifactStep),
    ).toThrow();
    const duplicateServiceCoreGraphDecoyJob = externalTrustRootJob.concat(
      "      - name: Decoy service-core graph path\n",
      "        run: |\n",
      `          echo '${serviceCoreSymbolGraphPath}'\n`,
    );
    expect(() =>
      assertSingleCalibrationArtifactUpload(duplicateServiceCoreGraphDecoyJob),
    ).toThrow();
    const movedAlwaysToDecoyJob = externalTrustRootJob
      .replace(
        "        if: always()\n        uses: actions/upload-artifact@v7\n",
        "        if: success()\n        uses: actions/upload-artifact@v7\n",
      )
      .concat(
        "      - name: Decoy always condition\n",
        "        if: always()\n",
        "        run: true\n",
      );
    const movedAlwaysArtifactStep = workflowStep(
      movedAlwaysToDecoyJob,
      "Preserve public symbol graphs for exact-diff calibration",
    );
    expect(movedAlwaysArtifactStep).toContain("if: success()");
    expect(movedAlwaysArtifactStep).not.toContain("if: always()");
    expect(() =>
      assertSingleCalibrationArtifactUpload(movedAlwaysToDecoyJob),
    ).toThrow();
    const duplicateUnsafeUploadJob = externalTrustRootJob.concat(
      "      - uses: actions/upload-artifact@v7\n",
      "        with:\n",
      "          path: /etc/passwd\n",
    );
    expect(() =>
      assertSingleCalibrationArtifactUpload(duplicateUnsafeUploadJob),
    ).toThrow();
    const multiSpaceDuplicateUploadJob = externalTrustRootJob.concat(
      "      -  uses: actions/upload-artifact@v7\n",
      "         with:\n",
      "           path: /etc/passwd\n",
    );
    expect(() =>
      assertSingleCalibrationArtifactUpload(multiSpaceDuplicateUploadJob),
    ).toThrow();
    const uppercaseDuplicateUploadJob = externalTrustRootJob.concat(
      "      - uses: Actions/Upload-Artifact@v7\n",
      "        with:\n",
      "          path: /etc/passwd\n",
    );
    expect(() =>
      assertSingleCalibrationArtifactUpload(uppercaseDuplicateUploadJob),
    ).toThrow();
    const scalarAliasJob = externalTrustRootJob.concat(
      "      - uses: *unsafe_upload\n",
      "        with:\n",
      "          path: /etc/passwd\n",
    );
    const scalarAliasWorkflow = workflow
      .replace(
        "\njobs:\n",
        "\nenv:\n  UNSAFE_UPLOAD: &unsafe_upload Actions/Upload-Artifact@v7\n\njobs:\n",
      )
      .replace(externalTrustRootJob, scalarAliasJob);
    expect(() =>
      assertExternalTrustRootProtocolJob(scalarAliasJob, scalarAliasWorkflow),
    ).toThrow();
    const wholeStepAliasJob = externalTrustRootJob.concat(
      "      - *unsafe_upload_step\n",
    );
    const wholeStepAliasWorkflow = workflow
      .replace(
        "\njobs:\n",
        "\nx-unsafe-upload-step: &unsafe_upload_step\n  uses: Actions/Upload-Artifact@v7\n  with:\n    path: /etc/passwd\n\njobs:\n",
      )
      .replace(externalTrustRootJob, wholeStepAliasJob);
    expect(() =>
      assertExternalTrustRootProtocolJob(
        wholeStepAliasJob,
        wholeStepAliasWorkflow,
      ),
    ).toThrow();
    const movedSpiFlagToDecoyStepJob = externalTrustRootJob
      .replace("            --include-spi-symbols \\\n", "")
      .concat(
        "      - name: Decoy SPI flag\n",
        "        run: |\n",
        "            --include-spi-symbols \\\n",
        "            true\n",
      );
    expect(() =>
      assertExternalTrustRootProtocolJob(movedSpiFlagToDecoyStepJob),
    ).toThrow();
    for (const [safePath, unsafePath] of [
      [symbolGraphVerifierRelative, `/tmp/unsafe.py # ${symbolGraphVerifierRelative}`],
      [
        serviceCoreBoundaryVerifierRelative,
        `/tmp/unsafe.py # ${serviceCoreBoundaryVerifierRelative}`,
      ],
    ] as const) {
      const commentDecoyCheckerJob = externalTrustRootJob.replace(
        `            ${safePath}`,
        `            ${unsafePath}`,
      );
      expect(commentDecoyCheckerJob).not.toBe(externalTrustRootJob);
      expect(() =>
        assertExternalTrustRootProtocolJob(commentDecoyCheckerJob),
      ).toThrow();
    }
    const duplicateServiceCoreCheckerJob = externalTrustRootJob.replace(
      `            ${serviceCoreBoundaryVerifierRelative}\n`,
      [
        `            ${serviceCoreBoundaryVerifierRelative}`,
        "          /usr/bin/python3 \\",
        `            ${serviceCoreBoundaryVerifierRelative}`,
        "",
      ].join("\n"),
    );
    expect(duplicateServiceCoreCheckerJob).not.toBe(externalTrustRootJob);
    expect(() =>
      assertExternalTrustRootProtocolJob(duplicateServiceCoreCheckerJob),
    ).toThrow();
    const duplicateServiceCoreCheckerDecoyJob = externalTrustRootJob.concat(
      "      - name: Decoy service-core checker reference\n",
      "        run: |\n",
      `          echo '${serviceCoreBoundaryVerifierRelative}'\n`,
    );
    expect(() =>
      assertExternalTrustRootProtocolJob(duplicateServiceCoreCheckerDecoyJob),
    ).toThrow();
    const movedServiceCoreCheckerToDecoyJob = externalTrustRootJob
      .replace(
        [
          "          /usr/bin/python3 \\",
          `            ${serviceCoreBoundaryVerifierRelative}`,
          "",
        ].join("\n"),
        "",
      )
      .concat(
        "      - name: Decoy service-core checker\n",
        "        run: |\n",
        "          /usr/bin/python3 \\\n",
        `            ${serviceCoreBoundaryVerifierRelative}\n`,
      );
    expect(movedServiceCoreCheckerToDecoyJob).not.toBe(externalTrustRootJob);
    expect(() =>
      assertExternalTrustRootProtocolJob(movedServiceCoreCheckerToDecoyJob),
    ).toThrow();
    const skippedExternalTrustRootJob = externalTrustRootJob.replace(
      "    name: External trust-root protocol (source only)\n",
      [
        "    name: External trust-root protocol (source only)",
        "    if: false",
        "",
      ].join("\n"),
    );
    expect(skippedExternalTrustRootJob).not.toBe(externalTrustRootJob);
    expect(() =>
      assertExternalTrustRootProtocolJob(skippedExternalTrustRootJob),
    ).toThrow();
    const ignoredExternalTrustRootFailureJob = externalTrustRootJob.replace(
      "    name: External trust-root protocol (source only)\n",
      [
        "    name: External trust-root protocol (source only)",
        "    continue-on-error: true",
        "",
      ].join("\n"),
    );
    expect(ignoredExternalTrustRootFailureJob).not.toBe(externalTrustRootJob);
    expect(() =>
      assertExternalTrustRootProtocolJob(ignoredExternalTrustRootFailureJob),
    ).toThrow();
    for (const quotedKey of ['"if"', '"continue-on-error"'] as const) {
      const quotedJobControl = externalTrustRootJob.replace(
        "    name: External trust-root protocol (source only)\n",
        [
          "    name: External trust-root protocol (source only)",
          `    ${quotedKey}: ${quotedKey === '"if"' ? "false" : "true"}`,
          "",
        ].join("\n"),
      );
      expect(quotedJobControl).not.toBe(externalTrustRootJob);
      expect(() =>
        assertExternalTrustRootProtocolJob(quotedJobControl),
      ).toThrow();
    }
    const unsafeDefaultShellWorkflow = workflow.replace(
      "\njobs:\n",
      [
        "",
        "defaults:",
        "  run:",
        "    shell: bash {0}",
        "",
        "jobs:",
        "",
      ].join("\n"),
    );
    expect(unsafeDefaultShellWorkflow).not.toBe(workflow);
    expect(() =>
      assertExternalTrustRootProtocolJob(
        externalTrustRootJob,
        unsafeDefaultShellWorkflow,
      ),
    ).toThrow();
    for (const defaultsKey of ['"defaults"', '"def\\u0061ults"'] as const) {
      const quotedDefaultShellWorkflow = workflow.replace(
        "\njobs:\n",
        [
          "",
          `${defaultsKey}:`,
          "  run:",
          '    shell: "bash {0}"',
          "",
          "jobs:",
          "",
        ].join("\n"),
      );
      expect(quotedDefaultShellWorkflow).not.toBe(workflow);
      expect(() =>
        assertExternalTrustRootProtocolJob(
          externalTrustRootJob,
          quotedDefaultShellWorkflow,
        ),
      ).toThrow();
    }
    const appendedQuotedDefaultShellWorkflow = [
      workflow.trimEnd(),
      '"def\\u0061ults":',
      "  run:",
      '    shell: "true {0}"',
      "",
    ].join("\n");
    expect(appendedQuotedDefaultShellWorkflow).not.toBe(workflow);
    expect(() =>
      assertExternalTrustRootProtocolJob(
        externalTrustRootJob,
        appendedQuotedDefaultShellWorkflow,
      ),
    ).toThrow();
    const testAndBuildJob = workflowJob(workflow, "test_and_build");
    expect(workflowScalar(testAndBuildJob, 4, "timeout-minutes")).toBe("25");
    expect(workflowScalar(testAndBuildJob, 10, "fetch-depth")).toBe("0");
    const commentedSafeProvenanceJob = testAndBuildJob
      .replace(
        "    timeout-minutes: 25",
        "    timeout-minutes: 10 # timeout-minutes: 25",
      )
      .replace(
        "          fetch-depth: 0",
        "          fetch-depth: 1 # fetch-depth: 0",
      );
    expect(
      workflowScalar(commentedSafeProvenanceJob, 4, "timeout-minutes"),
    ).toBe("10");
    expect(workflowScalar(commentedSafeProvenanceJob, 10, "fetch-depth")).toBe(
      "1",
    );
  });

  it("records exact independent Swift and Node golden-vector results", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const fixture = JSON.parse(read(fixtureRelative));
    const fixtureRecords = fixture.records as Record<
      string,
      {
        canonical_byte_count: number;
        canonical_hex: string;
        sha256: string;
        signature_payload_hex?: string;
      }
    >;
    const expectedRecordNames = [
      "activation",
      "enrollment",
      "expected_activation_head",
      "fixed_argv",
      "fixed_cwd",
      "fixed_env",
      "one_shot_attestation",
      "repository_source_manifest",
      "runtime_install",
      "runtime_launch_policy",
      "signed_activation",
      "signed_enrollment",
      "supervisor_challenge",
      "verifier_receipt",
    ];
    const signedRecordNames = [
      "one_shot_attestation",
      "signed_activation",
      "signed_enrollment",
      "supervisor_challenge",
      "verifier_receipt",
    ];
    const recomputedRecordHashes: Record<string, string> = {};
    const recomputedByteCounts: Record<string, number> = {};
    const recomputedSignaturePayloadBytes: Record<string, number> = {};
    const recomputedSignedRecordBytes: Record<string, number> = {};

    expect(Object.keys(fixtureRecords).sort()).toEqual(expectedRecordNames);
    for (const [name, record] of Object.entries(fixtureRecords)) {
      expect(record.canonical_hex).toMatch(/^(?:[0-9a-f]{2})+$/u);
      const canonicalBytes = Buffer.from(record.canonical_hex, "hex");
      expect(canonicalBytes).toHaveLength(record.canonical_byte_count);
      expect(sha256Hex(canonicalBytes)).toBe(record.sha256);
      recomputedRecordHashes[name] = record.sha256;
      recomputedByteCounts[name] = canonicalBytes.length;
      if (record.signature_payload_hex !== undefined) {
        expect(record.signature_payload_hex).toMatch(/^(?:[0-9a-f]{2})+$/u);
        recomputedSignaturePayloadBytes[name] =
          record.signature_payload_hex.length / 2;
        recomputedSignedRecordBytes[name] = canonicalBytes.length;
      }
    }
    expect(Object.keys(recomputedSignaturePayloadBytes).sort()).toEqual(
      signedRecordNames,
    );

    expect(evidence.scope).toEqual({
      status: "UNAVAILABLE",
      operational_decision: "STOP",
      source_test_and_documentation_only: true,
      runtime_preimages_canonical: true,
      signed_handoff_requires_preimage_closure: true,
      external_trust_root_operational: false,
      production_entrypoint_available: false,
      production_authority_public_key_provisioned: false,
      production_activation_head_provisioned: false,
      production_private_key_added: false,
      root_runtime_installed: false,
      production_process_spawned: false,
      production_state_inspected: false,
      production_state_mutated: false,
      fixed_stop_executables_changed: false,
      live_evaluator_changed: false,
      live_weights_changed: false,
      live_configuration_changed: false,
    });
    expect(evidence.revision).toEqual({
      base_revision: "e142d844fcf5e2b189bb29a1ee9880df74afaf1a",
      base_tree: "a62032c1e8f6f354f426c669a194aabcbb77290d",
      canonical_preimage_revision: "0d3e457303cd1b4ade068c6a0b58527dc4cacecc",
      canonical_preimage_tree: "e5a4cf722a85ad116cc119c93bb197335549f621",
      mandatory_closure_revision: "14f0a7f041a08258689f6cc2781ef9bd1e2576df",
      mandatory_closure_tree: "103eaa5995dca816382c7cd2f001c1daa01d8e9e",
      cross_parser_revision: "385f1c8bc9f31f784a491526c86125642cb9b622",
      cross_parser_tree: "64541bef2980db603856acb8907ef63399dd4914",
      golden_review_fix_revision: "6bab0f05fe24ef373317d92e56a0c7f42fa19f85",
      golden_review_fix_tree: "223947684b0edce1e80fb2543f95a19121ef9a20",
      public_api_enforcement_revision:
        "f75638e66f6903ba3ccac93de7b3f9bd484b405f",
      public_api_enforcement_tree: "f3688e8a9ddf261dadd12bfeb49140ca7750c66b",
      golden_domain_separation_revision: implementationEvidenceRevision,
      golden_domain_separation_tree: implementationEvidenceTree,
      implementation_evidence_revision: implementationEvidenceRevision,
      implementation_evidence_tree: implementationEvidenceTree,
      integrated_main_revision: "0601268a57af32c910b785c3f79da647d3fbb428",
      integrated_main_tree: "436f76b1108a96f756f865725ee3ff81ec96ef58",
      post_main_merge_revision: "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
      post_main_merge_tree: "3b7e499d6cac376053a4a1e0852428ddfc83ba8a",
      pr_review_intermediate_remediation_revision:
        "eba6e9ecbd271fa4d8354fe1552a8123ac326959",
      pr_review_intermediate_remediation_tree:
        "c770f08c6df12f6a2d0a602025571aa0406b85d2",
      pr_review_remediation_revision:
        "735398093f7c839c8c2a97f33ef96607961bd829",
      pr_review_remediation_tree: "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
      publication_evidence_revision: "6e6697ec9fb976825866e4b2d44eb28648926357",
      publication_evidence_tree: "b438ad59b5387e39cd884ffba2d1721755b71996",
      publication_hardening_revision:
        "f231f30a3a354ce1895553a90a775b85691376e6",
      publication_hardening_tree: "259dceb28f96b90194ef03808f88d6a59effd339",
      final_local_evidence_revision: finalLocalEvidenceRevision,
      final_local_evidence_tree: finalLocalEvidenceTree,
      remote_head_revision: remoteHeadRevision,
      remote_head_tree: remoteHeadTree,
      toolchain_calibration_revision: toolchainCalibrationRevision,
      toolchain_calibration_tree: toolchainCalibrationTree,
      toolchain_self_check_remediation_revision:
        toolchainSelfCheckRemediationRevision,
      toolchain_self_check_remediation_tree: toolchainSelfCheckRemediationTree,
      base_pull_request: 499,
      base_integration_method: "regular-merge-commit",
    });
    expect(evidence.revision).not.toHaveProperty("status_snapshot_revision");
    expect(evidence.revision).not.toHaveProperty("status_snapshot_tree");
    for (const [revisionKey, treeKey] of [
      ["base_revision", "base_tree"],
      ["canonical_preimage_revision", "canonical_preimage_tree"],
      ["mandatory_closure_revision", "mandatory_closure_tree"],
      ["cross_parser_revision", "cross_parser_tree"],
      ["golden_review_fix_revision", "golden_review_fix_tree"],
      ["public_api_enforcement_revision", "public_api_enforcement_tree"],
      ["golden_domain_separation_revision", "golden_domain_separation_tree"],
      ["implementation_evidence_revision", "implementation_evidence_tree"],
      ["integrated_main_revision", "integrated_main_tree"],
      ["post_main_merge_revision", "post_main_merge_tree"],
      [
        "pr_review_intermediate_remediation_revision",
        "pr_review_intermediate_remediation_tree",
      ],
      ["pr_review_remediation_revision", "pr_review_remediation_tree"],
      ["publication_evidence_revision", "publication_evidence_tree"],
      ["publication_hardening_revision", "publication_hardening_tree"],
      ["final_local_evidence_revision", "final_local_evidence_tree"],
      ["remote_head_revision", "remote_head_tree"],
      ["toolchain_calibration_revision", "toolchain_calibration_tree"],
      [
        "toolchain_self_check_remediation_revision",
        "toolchain_self_check_remediation_tree",
      ],
    ] as const) {
      const revision = evidence.revision[revisionKey] as string;
      expect(gitOutput(["rev-parse", `${revision}^{tree}`])).toBe(
        evidence.revision[treeKey],
      );
    }
    const recordedAtMillis = Date.parse(evidence.recorded_at);
    const implementationCommittedAtMillis =
      Number(
        gitOutput([
          "show",
          "-s",
          "--format=%ct",
          implementationEvidenceRevision,
        ]),
      ) * 1_000;
    const postMainMergeCommittedAtMillis =
      Number(
        gitOutput([
          "show",
          "-s",
          "--format=%ct",
          evidence.revision.post_main_merge_revision,
        ]),
      ) * 1_000;
    expect(Number.isNaN(recordedAtMillis)).toBe(false);
    expect(recordedAtMillis).toBeGreaterThanOrEqual(
      implementationCommittedAtMillis,
    );
    expect(recordedAtMillis).toBeGreaterThanOrEqual(
      postMainMergeCommittedAtMillis,
    );
    const pullRequestObservedAtMillis = Date.parse(
      evidence.pull_request_validation.observed_at,
    );
    expect(Number.isNaN(pullRequestObservedAtMillis)).toBe(false);
    expect(recordedAtMillis).toBeGreaterThanOrEqual(
      pullRequestObservedAtMillis,
    );
    const technicalCommitCreatedAtMillis = Date.parse(
      evidence.pull_request_validation.local_remediation
        .technical_commit_created_at,
    );
    expect(Number.isNaN(technicalCommitCreatedAtMillis)).toBe(false);
    expect(recordedAtMillis).toBeGreaterThanOrEqual(
      technicalCommitCreatedAtMillis,
    );
    const remediationUpdatedAtMillis = Date.parse(
      evidence.pull_request_validation.local_remediation.updated_at,
    );
    expect(Number.isNaN(remediationUpdatedAtMillis)).toBe(false);
    expect(recordedAtMillis).toBeGreaterThanOrEqual(remediationUpdatedAtMillis);
    for (const createdAt of [
      evidence.pull_request_validation.local_remediation
        .toolchain_calibration_commit_created_at,
      evidence.pull_request_validation.local_remediation
        .toolchain_self_check_remediation_commit_created_at,
    ]) {
      const createdAtMillis = Date.parse(createdAt);
      expect(Number.isNaN(createdAtMillis)).toBe(false);
      expect(recordedAtMillis).toBeGreaterThanOrEqual(createdAtMillis);
    }
    const reviewedRevisions = new Set<string>();
    for (const history of [
      evidence.validation.independent_security_review.review_history,
      evidence.validation.publication_evidence_review.review_history,
    ] as Array<Array<Record<string, unknown>>>) {
      for (const entry of history) {
        for (const key of [
          "reviewed_revision",
          "reviewed_technical_revision",
        ]) {
          const revision = entry[key];
          if (typeof revision === "string") {
            reviewedRevisions.add(revision);
          }
        }
      }
    }
    for (const reviewedRevision of reviewedRevisions) {
      const reviewedCommitMillis =
        Number(gitOutput(["show", "-s", "--format=%ct", reviewedRevision])) *
        1_000;
      expect(
        recordedAtMillis,
        `recorded_at predates reviewed revision ${reviewedRevision}`,
      ).toBeGreaterThanOrEqual(reviewedCommitMillis);
    }
    expect(evidence.pull_request_validation).toEqual({
      pull_request: 501,
      url: "https://github.com/gomyway1216/nextjs-portfolio/pull/501",
      status: "IN_PROGRESS",
      operational_decision: "STOP",
      initial_head_revision: "3b0b37a353d478cf235901d391848886574621be",
      current_remote_head_revision: remoteHeadRevision,
      observed_at: "2026-07-18T03:23:44-07:00",
      initial_ci_observation: {
        ci_run_id: 29639949306,
        workflow_status: "COMPLETED",
        workflow_conclusion: "FAILURE",
        blocking_failure_present: true,
        failed_job_id: 88068705524,
        failed_job_name: "Darwin exclusive directory rename",
        failed_step: "Run Darwin native-launcher preload adversarial tests",
        test_file: productionLauncherTestRelative,
        failed_test_name:
          "strips or rejects DYLD injection before the attested child",
        test_file_present: 23,
        test_file_passed: 22,
        test_file_failed: 1,
        spawn_result_status: null,
        child_process_error_assertion_passed: true,
        spawn_result_signal_logged: false,
        test_and_build_job_id: 88068705540,
        test_and_build_status: "COMPLETED",
        test_and_build_conclusion: "SUCCESS",
        successful_test_and_build_steps: [
          "lint",
          "unit-tests",
          "isolated-pinned-public-deadline-calibration",
          "dependency-free-ml-contract-tests",
          "production-build",
        ],
        completed_successful_checks: [
          "npm-audit",
          "external-trust-root-protocol-source-only",
          "e2e-smoke-tests",
          "vercel",
        ],
        baseline_comparison: {
          main_revision: "0601268a57af32c910b785c3f79da647d3fbb428",
          main_ci_run_id: 29637691079,
          main_darwin_job_id: 88062776481,
          main_launcher_test_result: "23/23 PASS",
          same_runner_image: true,
          runner_os: "macOS 26.4",
          runner_image: "macos-26-arm64",
          runner_image_version: "20260715.0248.1",
          runner_provisioner_version: "20260707.563",
          launcher_test_blob_at_initial_head:
            "a7f3e5c9f820305c42f8361d931cc222bd2ab221",
          launcher_test_blob_at_main:
            "a7f3e5c9f820305c42f8361d931cc222bd2ab221",
          test_launcher_fixture_blob_at_initial_head:
            "d1e92b7f7526c5dc3978a0094feeb90653c71f30",
          test_launcher_fixture_blob_at_main:
            "d1e92b7f7526c5dc3978a0094feeb90653c71f30",
          failed_paths_changed_by_unit_b: false,
          inference:
            "pre-existing-runner-dependent-ci-portability-failure-not-unit-b-product-regression",
        },
      },
      latest_remote_ci_observation: {
        ci_run_id: 29645550110,
        workflow_status: "COMPLETED",
        workflow_conclusion: "FAILURE",
        tested_remote_head_revision: remoteHeadRevision,
        tested_temporary_merge_revision:
          "6c871485b3d65726adad72fad77aafe94e976590",
        temporary_merge_base_revision:
          "0601268a57af32c910b785c3f79da647d3fbb428",
        temporary_merge_is_github_pr_test_merge: true,
        artifact_is_from_current_remote_head_not_stale: true,
        blocking_failure_present: true,
        sole_failed_job: true,
        failed_job_id: 88083075424,
        failed_job_name: "External trust-root protocol (source only)",
        failed_step: "Verify external trust-root public API surface",
        failed_step_cause:
          "unapproved-swift-6.3.2-symbol-graph-calibration-context",
        job_conclusions: {
          test_and_build: "SUCCESS",
          darwin_exclusive_directory_rename: "SUCCESS",
          e2e_smoke_tests: "SUCCESS",
          security_audit: "SUCCESS",
          vercel: "SUCCESS",
          external_trust_root_protocol: "FAILURE",
        },
        successful_test_and_build_steps: [
          "lint",
          "unit-tests",
          "isolated-pinned-public-deadline-calibration",
          "dependency-free-ml-contract-tests",
          "production-build",
        ],
        symbol_graph_artifact: {
          artifact_id: 8429932370,
          name: "floodgate-v7-public-symbol-graphs-macOS-ARM64-6c871485b3d65726adad72fad77aafe94e976590-1",
          digest:
            "sha256:5fe40bb4cfcc5a5d967dbd001b0f30878dc23015b89d3a1b1635bae31e636baa",
          source_revision_kind: "github-temporary-pull-request-merge",
          source_head_revision: remoteHeadRevision,
          source_base_revision: "0601268a57af32c910b785c3f79da647d3fbb428",
          source_temporary_merge_revision:
            "6c871485b3d65726adad72fad77aafe94e976590",
          stale: false,
        },
        ci_symbol_graph_profile: {
          xcode_version: "26.5",
          swift_generator:
            "Apple Swift version 6.3.2 (swiftlang-6.3.2.1.108 clang-2100.1.1.101)",
          format_version: {
            major: 0,
            minor: 6,
            patch: 0,
          },
          module_name: "FloodgateV7ExternalTrustRootProtocol",
          platform_architecture: "arm64",
          platform_operating_system: "macosx",
          platform_minimum_version: {
            major: 13,
            minor: 0,
          },
          normalized_surface_symbol_count: 491,
          normalized_surface_relationship_count: 579,
          normalized_surface_sha256:
            "539e6c39aabf364b464b05b00517c18da061e23987aceb54c8fcbf0825991123",
        },
        exact_surface_diff_from_local_xcode_15_3: {
          symbols_added: 0,
          symbols_removed: 0,
          relationships_added: 37,
          relationships_removed: 0,
          all_added_relationships_kind: "conformsTo",
          all_added_relationships_target: "Swift.SendableMetatype",
          existing_precise_identifiers_with_rendered_declaration_changes: 5,
          rendered_declaration_change: "already-source-annotated-@Sendable",
          source_public_api_change_detected: false,
        },
      },
      review_feedback: {
        reviewed_head_revision: "3b0b37a353d478cf235901d391848886574621be",
        github_review_states: ["COMMENTED"],
        remediation_decision: "CHANGES_REQUESTED",
        actionable_p2_total: 3,
        resolved_p2: 2,
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        findings: [
          {
            thread_id: "PRRT_kwDOQbO82s6R-b_9",
            author: "gemini-code-assist",
            path: symbolGraphVerifierRelative,
            finding_id:
              "symbol-graph-verifier-required-exactly-one-build-product",
            remote_status: "UNRESOLVED",
            local_status:
              "LOCAL_TWO_PROFILE_REMEDIATION_VALIDATED_LATEST_HEAD_EXTERNAL_GREEN_PENDING",
          },
          {
            thread_id: "PRRT_kwDOQbO82s6R-cAA",
            author: "gemini-code-assist",
            path: "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts",
            finding_id: "evidence-test-hardcoded-usr-bin-git",
            remote_status: "RESOLVED",
            remote_resolution_basis:
              "outdated-thread-resolved-with-remediation-evidence",
            local_status: "RESOLVED",
          },
          {
            thread_id: "PRRT_kwDOQbO82s6R-cuK",
            author: "copilot-pull-request-reviewer",
            path: "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts",
            finding_id:
              "evidence-test-counted-ci-settings-across-unrelated-jobs",
            remote_status: "RESOLVED",
            remote_resolution_basis:
              "outdated-thread-resolved-with-remediation-evidence",
            local_status: "RESOLVED",
          },
        ],
      },
      local_remediation: {
        status:
          "LOCAL_TWO_PROFILE_REMEDIATION_VALIDATED_REMOTE_CI_AND_EXTERNAL_REVIEW_PENDING",
        updated_at: "2026-07-18T07:04:05-07:00",
        intermediate_remediation_revision:
          "eba6e9ecbd271fa4d8354fe1552a8123ac326959",
        intermediate_remediation_tree:
          "c770f08c6df12f6a2d0a602025571aa0406b85d2",
        remediation_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
        remediation_tree: "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
        publication_evidence_revision:
          "6e6697ec9fb976825866e4b2d44eb28648926357",
        publication_evidence_tree: "b438ad59b5387e39cd884ffba2d1721755b71996",
        publication_hardening_revision:
          "f231f30a3a354ce1895553a90a775b85691376e6",
        publication_hardening_tree: "259dceb28f96b90194ef03808f88d6a59effd339",
        final_local_evidence_revision: finalLocalEvidenceRevision,
        final_local_evidence_tree: finalLocalEvidenceTree,
        technical_commit_created_at: "2026-07-18T04:18:27-07:00",
        remote_head_revision: remoteHeadRevision,
        toolchain_calibration_revision: toolchainCalibrationRevision,
        toolchain_calibration_tree: toolchainCalibrationTree,
        toolchain_calibration_commit_created_at: "2026-07-18T06:33:30-07:00",
        toolchain_self_check_remediation_revision:
          toolchainSelfCheckRemediationRevision,
        toolchain_self_check_remediation_tree:
          toolchainSelfCheckRemediationTree,
        toolchain_self_check_remediation_commit_created_at:
          "2026-07-18T06:36:34-07:00",
        technical_exact_revision_review: {
          status: "PASS",
          reviewed_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
          reviewed_tree: "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
          unresolved_p0: 0,
          unresolved_p1: 0,
          unresolved_p2: 0,
        },
        final_local_evidence_exact_revision_review: {
          status: "PASS",
          reviewed_revision: finalLocalEvidenceRevision,
          reviewed_tree: finalLocalEvidenceTree,
          reviewed_git_blobs: {
            [japaneseArticleRelative]:
              "14fa99fe33f8a5dab86ba0f0b41f2717f3dfbcb4",
            [englishArticleRelative]:
              "8568b2f704f645d07cbc7158f4e97c200c403b44",
            [evidenceRelative]: "f2381a99344c789f76ce81fc2edefdd828af32ab",
            "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts":
              "d3fcbb1f8313d2ff38cee88ae5bff400123f6e2e",
          },
          unresolved_p0: 0,
          unresolved_p1: 0,
          unresolved_p2: 0,
        },
        toolchain_calibration_review: {
          status: "CHANGES_REQUESTED",
          reviewed_revision: toolchainCalibrationRevision,
          reviewed_tree: toolchainCalibrationTree,
          unresolved_p0: 0,
          unresolved_p1: 0,
          unresolved_p2: 1,
          finding_ids: [
            "calibration-profile-self-check-omitted-unknown-format-platform-module-and-mixed-shards",
          ],
        },
        toolchain_self_check_remediation: {
          status: "EXACT_REVISION_REVIEW_PASS_REMOTE_CI_PENDING",
          revision: toolchainSelfCheckRemediationRevision,
          tree: toolchainSelfCheckRemediationTree,
          behavioral_self_checks: [
            "unknown-generator-rejected",
            "unknown-format-rejected",
            "unknown-platform-rejected",
            "unknown-module-rejected",
            "mixed-base-shard-profiles-rejected",
          ],
          validation_status: "PASS",
          exact_revision_review: {
            status: "PASS",
            independent_reviewers: 2,
            unresolved_p0: 0,
            unresolved_p1: 0,
            unresolved_p2: 0,
          },
        },
        pushed: false,
        local_commits_after_remote_head_pushed: false,
        local_commits_after_remote_head: [
          toolchainCalibrationRevision,
          toolchainSelfCheckRemediationRevision,
        ],
        ci_rerun_status: "NOT_STARTED",
        review_threads_resolved: false,
        review_threads_resolved_count: 2,
        review_threads_unresolved_count: 1,
        technical_changed_paths: [
          workflowRelative,
          symbolGraphVerifierRelative,
          productionLauncherTestRelative,
        ],
        publication_tracking_paths: [
          japaneseArticleRelative,
          englishArticleRelative,
          evidenceRelative,
          "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts",
        ],
        changes: [
          "validate-every-build-configurations-base-and-extension-shard-symbol-graphs-including-spi-and-fail-if-none",
          "enforce-the-exact-four-composed-public-callables-and-zero-raw-policy-callable-consumers-including-global-initializer-operator-subscript-function-property-returned-function-and-typealias-surfaces",
          "pin-every-public-and-spi-symbol-access-kind-path-precise-identity-declaration-fragments-and-canonical-relationships-with-same-count-type-and-conformance-mutation-self-checks",
          "record-xcode-swift-symbol-graph-metadata-and-preserve-exact-base-and-shard-graphs-per-ci-run-attempt-for-fail-closed-calibration",
          "approve-only-exact-xcode-15.3-swift-5.10-and-xcode-26.5-swift-6.3.2-public-surface-profiles",
          "reject-unknown-generator-format-platform-module-and-mixed-base-shard-calibration-profiles",
          "resolve-git-without-a-shell-through-the-sanitized-system-path-usr-bin-and-bin-only",
          "scope-provenance-ci-counts-from-test-and-build-to-the-next-arbitrary-job-boundary",
          "retry-once-only-after-empty-stdout-sigabrt-or-sigkill-parent-exit-log-only-sanitized-outcome-shape-and-still-require-final-status-zero-or-six-with-null-signal",
        ],
        symbol_graph_toolchain_calibration: {
          local_toolchain: "xcode-15.3-swift-5.10",
          local_normalized_surface_symbol_count: 491,
          local_normalized_surface_relationship_count: 542,
          local_normalized_surface_sha256:
            "3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160",
          pr_ci_toolchain: "xcode-26.5-swift-6.3.2",
          pr_ci_generator:
            "Apple Swift version 6.3.2 (swiftlang-6.3.2.1.108 clang-2100.1.1.101)",
          pr_ci_normalized_surface_symbol_count: 491,
          pr_ci_normalized_surface_relationship_count: 579,
          pr_ci_normalized_surface_sha256:
            "539e6c39aabf364b464b05b00517c18da061e23987aceb54c8fcbf0825991123",
          status: "LOCAL_TWO_PROFILE_REMEDIATION_VALIDATED",
          latest_head_ci_rerun_status: "NOT_STARTED",
          approved_profile_count: 2,
          unknown_generator_policy: "FAIL_CLOSED",
          unknown_format_policy: "FAIL_CLOSED",
          unknown_platform_policy: "FAIL_CLOSED",
          unknown_module_policy: "FAIL_CLOSED",
          mixed_base_shard_profile_policy: "FAIL_CLOSED",
          artifact_id: 8429932370,
          artifact_digest:
            "sha256:5fe40bb4cfcc5a5d967dbd001b0f30878dc23015b89d3a1b1635bae31e636baa",
          exact_surface_diff: {
            symbols_added: 0,
            symbols_removed: 0,
            relationships_added: 37,
            relationships_removed: 0,
            all_added_relationships: "conformsTo Swift.SendableMetatype",
            existing_precise_identifiers_with_already_source_sendable_rendering: 5,
          },
          mismatch_policy:
            "fail-closed-inspect-exact-surface-diff-before-any-expected-fingerprint-update",
          ci_calibration_evidence: [
            "xcodebuild-version",
            "swift-version",
            "symbol-graph-generator-format-and-module-platform",
            "base-and-shard-symbol-graph-artifact-keyed-by-sha-and-run-attempt",
          ],
        },
        independent_review_history: [
          {
            review_sequence: 1,
            status: "CHANGES_REQUESTED",
            unresolved_p0: 0,
            unresolved_p1: 5,
            unresolved_p2: 36,
            finding_ids: [
              "bare-git-inherited-npm-path-could-intercept-provenance-command",
              "symbol-graph-gate-did-not-enforce-exact-composed-set-or-zero-raw-policy-consumers",
              "symbol-graph-gate-skipped-single-path-global-functions",
              "workflow-job-slice-used-a-specific-next-job-as-its-boundary",
              "successful-dyld-retry-would-hide-the-first-parent-signal",
              "symbol-graph-callable-scan-omitted-operators-and-subscripts",
              "new-pr-publication-facts-and-baseline-provenance-were-self-declared",
              "recorded-at-was-not-ordered-after-pull-request-observed-at",
              "sanitized-git-environment-omitted-required-node-env-and-failed-typescript-noemit",
              "symbol-graph-closure-detection-depended-on-the-parameter-label",
              "symbol-graph-composed-scan-omitted-public-initializers",
              "symbol-graph-required-method-check-missed-partial-overloads",
              "symbol-graph-callable-scan-omitted-static-subscripts",
              "symbol-graph-security-typealiases-bypassed-semantic-type-classification",
              "symbol-graph-function-properties-exposed-protected-runtime-launch-types",
              "symbol-graph-callables-returned-functions-that-exposed-protected-runtime-launch-types",
              "symbol-graph-extension-shards-were-not-loaded",
              "swift-spi-public-symbols-were-omitted-from-the-ci-symbol-graph",
              "launcher-assertion-diagnostic-could-log-raw-child-stderr",
              "public-spi-symbol-surface-was-not-structurally-pinned-across-all-kinds-and-protected-self-owners",
              "public-surface-fingerprint-collapsed-overloads-and-declaration-types",
              "public-surface-fingerprint-omitted-symbol-graph-relationships-and-conformances",
              "ci-toolchain-mismatch-lacked-retrievable-exact-symbol-graph-evidence",
              "symbol-graph-artifact-excluded-hidden-dot-build-path",
              "symbol-graph-artifact-name-collided-across-run-attempts",
              "symbol-graph-calibration-metadata-accepted-empty-objects",
              "calibration-artifact-test-did-not-pin-always-safe-path-and-no-files-policy",
              "independent-security-review-resolved-totals-omitted-pr-remediation-findings",
              "publication-review-resolved-total-omitted-post-pr-findings",
              "publication-complete-status-overstated-current-content-exact-review",
              "calibration-artifact-test-step-slice-allowed-later-always-bypass",
              "articles-described-entire-pr-branch-as-unpushed-after-initial-head-push",
              "calibration-artifact-test-string-assertions-accepted-comment-decoys",
              "calibration-artifact-upload-uniqueness-accepted-yaml-anchor-alias-step",
              "in-progress-publication-review-recorded-at-predated-reviewed-publication-commit",
              "retry-remediation-label-overstated-empty-output-predicate",
              "final-local-evidence-recorded-at-predated-final-artifact-updates",
              "full-suite-history-omitted-earlier-high-contention-attempt",
              "full-suite-history-omitted-earlier-six-worker-pass",
              "final-local-evidence-recorded-at-predated-sequence-twenty-one-artifact-freeze",
              "final-local-evidence-recorded-at-still-predated-sequence-twenty-two-artifact-freeze",
            ],
          },
          {
            review_sequence: 2,
            reviewed_revision: toolchainCalibrationRevision,
            reviewed_tree: toolchainCalibrationTree,
            status: "CHANGES_REQUESTED",
            unresolved_p0: 0,
            unresolved_p1: 0,
            unresolved_p2: 1,
            finding_ids: [
              "calibration-profile-self-check-omitted-unknown-format-platform-module-and-mixed-shards",
            ],
            remediated_by_revision: toolchainSelfCheckRemediationRevision,
            remediation_validation: "PASS",
            remediated_revision_exact_review_status: "PASS",
          },
          {
            review_sequence: 3,
            reviewed_revision: toolchainSelfCheckRemediationRevision,
            reviewed_tree: toolchainSelfCheckRemediationTree,
            status: "PASS",
            independent_reviewers: 2,
            unresolved_p0: 0,
            unresolved_p1: 0,
            unresolved_p2: 0,
          },
        ],
        validation_status: "PASS",
      },
      live_weights_changed: false,
      live_configuration_changed: false,
      new_strength_measurements: 0,
    });
    const pullRequestBaseline =
      evidence.pull_request_validation.initial_ci_observation
        .baseline_comparison;
    const initialHead = evidence.pull_request_validation
      .initial_head_revision as string;
    const mainRevision = pullRequestBaseline.main_revision as string;
    const blobPairs = [
      {
        path: productionLauncherTestRelative,
        initialKey: "launcher_test_blob_at_initial_head",
        mainKey: "launcher_test_blob_at_main",
      },
      {
        path: "tests/fixtures/ml/floodgate-v7-production-native-launcher-test.jxa",
        initialKey: "test_launcher_fixture_blob_at_initial_head",
        mainKey: "test_launcher_fixture_blob_at_main",
      },
    ];
    const changedBaselinePaths = blobPairs.filter(
      ({ path: relativePath, initialKey, mainKey }) => {
        const initialBlob = gitOutput([
          "rev-parse",
          `${initialHead}:${relativePath}`,
        ]);
        const mainBlob = gitOutput([
          "rev-parse",
          `${mainRevision}:${relativePath}`,
        ]);
        expect(initialBlob).toBe(pullRequestBaseline[initialKey]);
        expect(mainBlob).toBe(pullRequestBaseline[mainKey]);
        return initialBlob !== mainBlob;
      },
    );
    expect(changedBaselinePaths).toEqual([]);
    expect(pullRequestBaseline.failed_paths_changed_by_unit_b).toBe(false);
    expect(evidence.canonical_records.fixed_argv).toMatchObject({
      encoded_bytes: 265,
      sha256:
        "bf7c65abbc101939ca4b3bccbd52c17891e12e6db50af141b6784d753b936b15",
      argument_count: 2,
      caller_arguments_allowed: false,
    });
    expect(evidence.canonical_records.runtime_install_policy).toMatchObject({
      encoded_bytes: 1307,
      path_count: 11,
      require_no_follow: true,
      allowed_writable_acl_entry_count: 0,
      format_fixed_digest_values_variable: true,
      variable_digest_field_count: 9,
      runtime_identity_digest_field_count: 6,
      canonical_digest_constraints: ["nonzero", "pairwise-distinct"],
      operational_identity_and_policy_observation: false,
      node_identity_fields: [
        "whole-file-sha256",
        "code-directory-sha256",
        "designated-requirement-sha256",
        "held-executable-identity-sha256",
      ],
      diagnostic_bundle_identity_fields: [
        "whole-file-sha256",
        "held-file-identity-sha256",
      ],
      other_variable_digest_fields: [
        "record-id",
        "filesystem-identity-policy-sha256",
        "acl-policy-sha256",
      ],
      synthetic_cross_parser_fixture_sha256:
        "ba68275543d70af3516d289cfd56b4067209861fcabc9ff0c7984c089888b0ca",
    });
    expect(evidence.runtime_launch_preimage_closure).toMatchObject({
      required_by_all_challenge_receipt_attestation_entrypoints: true,
      raw_runtime_launch_policy_accepted_by_handoff_entrypoints: false,
      adversarial_composition_tests: {
        policy_digest_substitutions_rejected: 5,
        runtime_install_record_swap_rejected: true,
        manifest_node_identity_drifts_rejected: 4,
        manifest_canonical_identity_drift_rejected: true,
        all_public_handoff_entrypoints_reject_valid_closure_for_different_manifest: 4,
      },
      public_api_surface: {
        enforcement: "swift-public-symbol-graph",
        minimum_access_level: "public",
        spi_symbols_included: true,
        synthesized_members_skipped: true,
        base_and_external_extension_shards_unioned_per_build_configuration: true,
        normalized_surface_fields: [
          "access-level",
          "spi-marker",
          "kind-identifier",
          "path-components",
          "symbol-precise-identifier",
          "declaration-fragments-kind-spelling-precise-identifier",
          "canonical-json-of-every-symbol-relationship-field",
        ],
        normalized_surface_symbol_count: 491,
        normalized_surface_relationship_count: 542,
        normalized_surface_sha256:
          "3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160",
        same_path_declaration_mutation_self_check: "PASS",
        relationship_only_conformance_mutation_self_check: "PASS",
        local_fingerprint_toolchain: "xcode-15.3-swift-5.10",
        ci_toolchain_calibration_status:
          "COMPLETE_FROM_EXACT_FAILED_JOB_ARTIFACT",
        latest_head_ci_rerun_status: "NOT_STARTED",
        approved_exact_toolchain_profiles: [
          {
            profile: "xcode-15.3-swift-5.10-arm64-macos13",
            generator:
              "Apple Swift version 5.10 (swiftlang-5.10.0.12.7 clang-1500.3.9.3)",
            format_version: "0.6.0",
            platform: "arm64-apple-macos13",
            normalized_surface_symbol_count: 491,
            normalized_surface_relationship_count: 542,
            normalized_surface_sha256:
              "3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160",
          },
          {
            profile: "xcode-26.5-swift-6.3.2-arm64-macos13",
            generator:
              "Apple Swift version 6.3.2 (swiftlang-6.3.2.1.108 clang-2100.1.1.101)",
            format_version: "0.6.0",
            platform: "arm64-apple-macos13",
            normalized_surface_symbol_count: 491,
            normalized_surface_relationship_count: 579,
            normalized_surface_sha256:
              "539e6c39aabf364b464b05b00517c18da061e23987aceb54c8fcbf0825991123",
          },
        ],
        unknown_generator_format_platform_or_module_policy: "FAIL_CLOSED",
        mixed_base_shard_profile_policy: "FAIL_CLOSED",
        calibration_context_behavioral_self_check: "PASS",
        composed_entrypoints_present: 4,
        partial_entrypoints_absent: 6,
        raw_runtime_launch_policy_public_handoff_overloads: 0,
        signature_gate_scope:
          "direct-public-and-spi-symbol-surface-relationships-protocol-conformances-self-owner-and-protected-type-signatures",
        semantic_nonclaims: [
          "does-not-prove-existing-public-symbol-body-behavior",
          "does-not-prove-arbitrary-wrapper-byte-decoder-generic-or-dynamic-cast-behavior",
          "source-security-review-and-adversarial-tests-remain-required",
        ],
        ci_gate: true,
        local_result: "PASS",
      },
    });
    expect(fixture).toMatchObject({
      schema: "shogi-floodgate-v7-external-trust-root-canonical-golden-v1",
      status:
        "synthetic-test-only-cross-parser-fixture-not-operational-evidence",
      encoding: {
        byte_order: "big-endian",
        signature_algorithm: "Ed25519",
        signature_generation: "node-deterministic-fixture",
        swift_cryptokit: "verify-exact-bytes-but-resigning-is-randomized",
      },
    });
    expect(evidence.cross_parser_golden_fixture.scope).toEqual(fixture.scope);
    expect(evidence.cross_parser_golden_fixture.record_sha256).toEqual(
      recomputedRecordHashes,
    );
    expect(evidence.cross_parser_golden_fixture.canonical_byte_counts).toEqual(
      recomputedByteCounts,
    );
    expect(
      evidence.cross_parser_golden_fixture.signature_payload_bytes,
    ).toEqual(recomputedSignaturePayloadBytes);
    expect(evidence.cross_parser_golden_fixture.signed_record_bytes).toEqual(
      recomputedSignedRecordBytes,
    );
    expect(evidence.cross_parser_golden_fixture).toMatchObject({
      status:
        "synthetic-test-only-cross-parser-fixture-not-operational-evidence",
      node_parser_independent_of_swift_source: true,
      swift_decodes_and_reencodes_exact_fixture_bytes: true,
      swift_cryptokit_verifies_fixture_signatures: true,
    });
    expect(evidence.validation).toMatchObject({
      swift_tests: { status: "PASS", present: 58, passed: 58, failed: 0 },
      swift_cross_parser_tests: {
        status: "PASS",
        present: 4,
        passed: 4,
        failed: 0,
      },
      node_cross_parser_tests: {
        status: "PASS",
        present: 6,
        passed: 6,
        failed: 0,
      },
      node_full_suite: {
        status: "PASS",
        classification:
          "local-resource-scheduling-artifact-consistent-not-proven",
        product_regression_established: false,
        pr501_code_change_warranted: false,
        failed_attempts_authoritative: false,
        production_behavior_changed: false,
        live_weights_changed: false,
        final_revision: "f231f30a3a354ce1895553a90a775b85691376e6",
        final_worker_limit: 4,
        final_started_at: "2026-07-18T05:00:53-07:00",
        final_duration_seconds: 314.19,
        test_files_present: 181,
        test_files_passed: 181,
        test_files_failed: 0,
        tests_present: 3233,
        tests_passed: 3232,
        tests_skipped: 1,
        tests_failed: 0,
        intermediate_attempts: [
          {
            started_at: "2026-07-18T02:44:01-07:00",
            completed_at: "2026-07-18T02:49:30-07:00",
            command: "npm test -- --maxWorkers=6",
            worker_configuration: "vitest-max-workers-6",
            status: "PASS",
            authoritative: false,
            integration_base_revision:
              "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
            working_tree_committed: false,
            working_tree_content_revision_known: false,
            evidence_scope:
              "post-main-uncommitted-publication-working-tree-not-final-revision-gate",
            vitest_duration_seconds: 329.3,
            wall_clock_duration_seconds: 329.6,
            test_files_present: 181,
            test_files_passed: 181,
            test_files_failed: 0,
            tests_present: 3233,
            tests_passed: 3232,
            tests_skipped: 1,
            tests_failed: 0,
          },
          {
            started_at_known: false,
            completed_before: "2026-07-18T04:31:00-07:00",
            worker_configuration:
              "vitest-default-concurrent-with-other-heavy-validation",
            status: "FAIL",
            authoritative: false,
            evidence_scope:
              "discarded-run-overlapped-production-build-swift-tests-and-active-publication-evidence-edits",
            duration_seconds: 341.08,
            test_files_present: 181,
            test_files_passed: 179,
            test_files_failed: 2,
            tests_present: 3233,
            tests_passed: 3230,
            tests_skipped: 1,
            tests_failed: 2,
            failures: [
              {
                test_file:
                  "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts",
                reason: "working-tree-evidence-revision-changed-during-run",
              },
              {
                test_file: "tests/unit/ml/siblingTeacherGenerator.test.ts",
                reason: "vitest-test-timeout-5000ms",
              },
            ],
            isolated_sibling_teacher_recheck: {
              status: "PASS",
              tests_present: 12,
              tests_passed: 12,
              tests_failed: 0,
              duration_seconds: 14.93,
            },
          },
          {
            started_at: "2026-07-18T04:31:00-07:00",
            worker_configuration: "vitest-default",
            status: "FAIL",
            evidence_scope:
              "intermediate-uncommitted-publication-working-tree-not-a-final-revision-gate",
            duration_seconds: 325.28,
            test_files_present: 181,
            test_files_passed: 180,
            test_files_failed: 1,
            tests_present: 3233,
            tests_passed: 3231,
            tests_skipped: 1,
            tests_failed: 1,
            failure: {
              test_file: "tests/unit/ml/floodgateStableWasmProposer.test.ts",
              test_name:
                "keeps pinned proposal rows deterministic with one, two, and three reusable workers",
              error_kind: "FloodgateStableWasmWorkerFailureError",
              reason: "startup-timeout",
            },
            isolated_recheck: {
              status: "PASS",
              tests_present: 61,
              tests_passed: 61,
              tests_failed: 0,
              duration_seconds: 14.79,
            },
            interpretation:
              "startup-timeout-observed-under-default-full-suite-scheduling-not-reproduced-in-isolation-cause-not-proven",
          },
        ],
      },
      public_api_symbol_graph: {
        status: "PASS",
        build_configurations_checked: 1,
        base_and_shard_files_checked: 1,
        spi_symbols_included: true,
        synthesized_members_skipped: true,
        normalized_surface_symbol_count: 491,
        normalized_surface_relationship_count: 542,
        normalized_surface_sha256:
          "3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160",
        same_path_declaration_mutation_self_check: "PASS",
        relationship_only_conformance_mutation_self_check: "PASS",
        fingerprint_toolchain: "xcode-15.3-swift-5.10",
        ci_toolchain_calibration_status:
          "COMPLETE_FROM_EXACT_FAILED_JOB_ARTIFACT",
        latest_head_ci_rerun_status: "NOT_STARTED",
        approved_exact_profile_count: 2,
        ci_profile: {
          xcode_version: "26.5",
          swift_version: "6.3.2",
          normalized_surface_symbol_count: 491,
          normalized_surface_relationship_count: 579,
          normalized_surface_sha256:
            "539e6c39aabf364b464b05b00517c18da061e23987aceb54c8fcbf0825991123",
        },
        unknown_context_self_checks: {
          generator: "PASS",
          format: "PASS",
          platform: "PASS",
          module: "PASS",
          mixed_base_shard_profiles: "PASS",
        },
        composed_entrypoints_present: 4,
        partial_entrypoints_absent: 6,
      },
      typescript_no_emit: "PASS",
      targeted_eslint: "PASS",
      prettier_check: "PASS",
      git_diff_check: "PASS",
      independent_security_review: {
        status: "PASS",
        review_scope:
          "implementation-tree-only-docs-data-and-evidence-test-excluded",
        latest_completed_remediation_revision:
          toolchainSelfCheckRemediationRevision,
        latest_completed_pass_revision: toolchainSelfCheckRemediationRevision,
        current_remediation_revision: toolchainSelfCheckRemediationRevision,
        resolved_p1_total: 2,
        resolved_p2_total: 24,
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
        current_content_exact_review_status: "PASS",
      },
      publication_evidence_review: {
        status: "IN_PROGRESS",
        review_scope:
          "publication-artifacts-and-provenance-ci-delta-working-tree-content",
        reviewed_implementation_revision:
          "735398093f7c839c8c2a97f33ef96607961bd829",
        reviewed_implementation_tree:
          "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
        reviewed_integration_revision:
          "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
        remediation_status: "CURRENT_PUBLICATION_UPDATE_IN_PROGRESS",
        current_content_exact_review_status: "NOT_REVIEWED_OR_CI_TESTED",
        resolved_p1_total: 4,
        resolved_p2_total: 29,
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
    });
    expect(evidence.validation.publication_evidence_review.paths).toEqual(
      publicationValidationPaths,
    );
    expect(
      evidence.validation.publication_evidence_review.review_history,
    ).toEqual([
      {
        review_sequence: 1,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "initial-four-publication-artifacts-working-tree-content",
        unresolved_p0: 0,
        unresolved_p1: 3,
        unresolved_p2: 4,
        finding_ids: [
          "final-evidence-recorded-at-predated-reviewed-implementation-commits",
          "implementation-bounded-counters-and-review-broadened-to-publication-scope",
          "machine-open-gates-omitted-fresh-load-anti-rollback-and-exactly-one-evidence",
          "runtime-install-mutation-coverage-overstated-as-every-byte",
          "japanese-role-key-negative-inaccurately-called-one-byte",
          "english-open-gate-minimum-and-order-qualifiers-weakened",
          "publication-evidence-test-could-false-pass-material-drift",
        ],
      },
      {
        review_sequence: 2,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "five-path-remediated-working-tree-before-independent-provenance-audit",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 3,
        finding_ids: [
          "runtime-install-nine-variable-fields-misclassified-as-nine-identity-digests",
          "ordered-open-gates-diverged-between-articles-and-machine-record",
          "external-invocation-zero-counters-lacked-independent-immutable-ledger",
        ],
      },
      {
        review_sequence: 3,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "five-path-remediated-working-tree-before-green-snapshot",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 3,
        finding_ids: [
          "runtime-install-variability-schema-key-repeated-variable",
          "in-progress-snapshot-recorded-at-predated-latest-remediation",
          "in-progress-snapshot-evidence-test-intentionally-failed",
        ],
      },
      {
        review_sequence: 4,
        status: "PASS",
        reviewed_content:
          "post-main-merge-five-path-content-and-integration-tree",
        reviewed_revision: "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        review_sequence: 5,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "post-merge-finalization-working-tree-before-format-remediation",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "finalization-evidence-test-formatting-drift-contradicted-prettier-pass",
        ],
      },
      {
        review_sequence: 6,
        status: "PASS",
        reviewed_content: "post-main-finalized-five-path-working-tree-content",
        integration_base_revision: "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        review_sequence: 7,
        status: "CHANGES_REQUESTED",
        reviewed_content: "sequence-six-publication-provenance-metadata",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "finalized-working-tree-review-was-misattributed-to-integration-base-commit",
        ],
      },
      {
        review_sequence: 8,
        status: "PASS",
        reviewed_content: "post-main-finalized-five-path-working-tree-content",
        integration_base_revision: "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        review_sequence: 9,
        status: "CHANGES_REQUESTED",
        reviewed_content: "pr-501-initial-publication-review-feedback",
        reviewed_revision: "3b0b37a353d478cf235901d391848886574621be",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 2,
        finding_ids: [
          "evidence-test-hardcoded-usr-bin-git",
          "evidence-test-counted-ci-settings-across-unrelated-jobs",
        ],
      },
      {
        review_sequence: 10,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "pr-501-symbol-graph-calibration-artifact-evidence-test",
        reviewed_technical_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "calibration-artifact-test-did-not-pin-always-safe-path-and-no-files-policy",
        ],
      },
      {
        review_sequence: 11,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "pr-501-remediated-publication-review-aggregate-metadata",
        reviewed_technical_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 2,
        finding_ids: [
          "independent-security-review-resolved-totals-omitted-pr-remediation-findings",
          "publication-review-resolved-total-omitted-post-pr-findings",
        ],
      },
      {
        review_sequence: 12,
        status: "PASS",
        reviewed_content:
          "pre-publication-commit-four-path-working-tree-content",
        reviewed_technical_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
        reviewed_technical_tree: "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
        reviewed_git_blobs: {
          [japaneseArticleRelative]: "9c73d6e8bd61eb614b56cff2c295da0ba6ad4ca0",
          [englishArticleRelative]: "99b7923964ffad962be5fbe575b80667e15fcb3b",
          [evidenceRelative]: "872b5b294de227443a5e760f1ee43481e001d76e",
          "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts":
            "a42ad12de7cc559adabf475b4af1702a7905fecb",
        },
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        review_sequence: 13,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "sequence-twelve-final-metadata-and-artifact-step-boundary",
        reviewed_technical_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
        unresolved_p0: 0,
        unresolved_p1: 1,
        unresolved_p2: 2,
        finding_ids: [
          "publication-complete-status-overstated-current-content-exact-review",
          "calibration-artifact-test-step-slice-allowed-later-always-bypass",
          "articles-described-entire-pr-branch-as-unpushed-after-initial-head-push",
        ],
      },
      {
        review_sequence: 14,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "sequence-thirteen-artifact-step-exact-scalar-assertions",
        reviewed_technical_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "calibration-artifact-test-string-assertions-accepted-comment-decoys",
        ],
      },
      {
        review_sequence: 15,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "publication-commit-before-yaml-anchor-and-alias-rejection",
        reviewed_revision: "6e6697ec9fb976825866e4b2d44eb28648926357",
        reviewed_tree: "b438ad59b5387e39cd884ffba2d1721755b71996",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "calibration-artifact-upload-uniqueness-accepted-yaml-anchor-alias-step",
        ],
      },
      {
        review_sequence: 16,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "sequence-fifteen-yaml-anchor-alias-remediation-and-chronology",
        reviewed_revision: "6e6697ec9fb976825866e4b2d44eb28648926357",
        reviewed_tree: "b438ad59b5387e39cd884ffba2d1721755b71996",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "in-progress-publication-review-recorded-at-predated-reviewed-publication-commit",
        ],
      },
      {
        review_sequence: 17,
        status: "PASS",
        reviewed_content: "exact-publication-hardening-commit",
        reviewed_revision: "f231f30a3a354ce1895553a90a775b85691376e6",
        reviewed_tree: "259dceb28f96b90194ef03808f88d6a59effd339",
        reviewed_git_blobs: {
          [japaneseArticleRelative]: "5559e16dbf97e6a5a7c6bd106c35b77abe045620",
          [englishArticleRelative]: "2e3543fabdc36e577a0b8b7fa821bb3211c5a9d5",
          [evidenceRelative]: "322731949b5ddb9215a11a9ba51aa26b6c21ffeb",
          "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts":
            "b427d382d3ea01fde6a330fa9ca9bfc68700b331",
        },
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        review_sequence: 18,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "exact-publication-hardening-commit-retry-claim-audit",
        reviewed_revision: "f231f30a3a354ce1895553a90a775b85691376e6",
        reviewed_tree: "259dceb28f96b90194ef03808f88d6a59effd339",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "retry-remediation-label-overstated-empty-output-predicate",
        ],
      },
      {
        review_sequence: 19,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "final-local-evidence-working-tree-before-last-timestamp-refresh",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "final-local-evidence-recorded-at-predated-final-artifact-updates",
        ],
      },
      {
        review_sequence: 20,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "final-local-evidence-working-tree-full-attempt-history",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "full-suite-history-omitted-earlier-high-contention-attempt",
        ],
      },
      {
        review_sequence: 21,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "final-local-evidence-working-tree-literal-full-attempt-history",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: ["full-suite-history-omitted-earlier-six-worker-pass"],
      },
      {
        review_sequence: 22,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "final-local-evidence-working-tree-after-sequence-twenty-one-before-freeze-timestamp-refresh",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "final-local-evidence-recorded-at-predated-sequence-twenty-one-artifact-freeze",
        ],
      },
      {
        review_sequence: 23,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "final-local-evidence-working-tree-after-sequence-twenty-two-before-sufficient-freeze-margin",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "final-local-evidence-recorded-at-still-predated-sequence-twenty-two-artifact-freeze",
        ],
      },
      {
        review_sequence: 24,
        status: "PASS",
        reviewed_content: "exact-final-local-evidence-commit",
        reviewed_revision: finalLocalEvidenceRevision,
        reviewed_tree: finalLocalEvidenceTree,
        reviewed_git_blobs: {
          [japaneseArticleRelative]: "14fa99fe33f8a5dab86ba0f0b41f2717f3dfbcb4",
          [englishArticleRelative]: "8568b2f704f645d07cbc7158f4e97c200c403b44",
          [evidenceRelative]: "f2381a99344c789f76ce81fc2edefdd828af32ab",
          "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts":
            "d3fcbb1f8313d2ff38cee88ae5bff400123f6e2e",
        },
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        review_sequence: 25,
        status: "CHANGES_REQUESTED",
        reviewed_content:
          "toolchain-calibration-publication-working-diff-before-final-timestamp-refresh",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "toolchain-exact-review-snapshot-timestamp-predated-second-review",
        ],
        remediation: "snapshot-timestamp-refreshed-after-second-exact-review",
        remediation_validation: "PASS",
      },
    ]);
    expect(
      evidence.validation.independent_security_review.review_history,
    ).toEqual([
      {
        reviewed_revision: "385f1c8bc9f31f784a491526c86125642cb9b622",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 3,
      },
      {
        reviewed_revision: "f75638e66f6903ba3ccac93de7b3f9bd484b405f",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 2,
      },
      {
        reviewed_revision: implementationEvidenceRevision,
        status: "PASS",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        reviewed_revision: "3b0b37a353d478cf235901d391848886574621be",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 4,
        finding_ids: [
          "symbol-graph-verifier-required-exactly-one-build-product",
          "symbol-graph-gate-did-not-enforce-exact-composed-set-or-zero-raw-policy-consumers",
          "symbol-graph-gate-skipped-single-path-global-functions",
          "symbol-graph-callable-scan-omitted-operators-and-subscripts",
        ],
      },
      {
        reviewed_content:
          "uncommitted-symbol-graph-remediation-before-second-hardening",
        integration_base_revision: "3b0b37a353d478cf235901d391848886574621be",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 4,
        finding_ids: [
          "symbol-graph-closure-detection-depended-on-the-parameter-label",
          "symbol-graph-composed-scan-omitted-public-initializers",
          "symbol-graph-required-method-check-missed-partial-overloads",
          "symbol-graph-callable-scan-omitted-static-subscripts",
        ],
      },
      {
        reviewed_content:
          "uncommitted-symbol-graph-second-hardening-before-typealias-rejection",
        integration_base_revision: "3b0b37a353d478cf235901d391848886574621be",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "symbol-graph-security-typealiases-bypassed-semantic-type-classification",
        ],
      },
      {
        reviewed_content:
          "uncommitted-symbol-graph-typealias-hardening-before-complete-callable-shard-and-spi-enforcement",
        integration_base_revision: "3b0b37a353d478cf235901d391848886574621be",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 4,
        finding_ids: [
          "symbol-graph-function-properties-exposed-protected-runtime-launch-types",
          "symbol-graph-callables-returned-functions-that-exposed-protected-runtime-launch-types",
          "symbol-graph-extension-shards-were-not-loaded",
          "swift-spi-public-symbols-were-omitted-from-the-ci-symbol-graph",
        ],
      },
      {
        reviewed_content:
          "uncommitted-complete-callable-shard-and-spi-enforcement-before-normalized-surface-pin",
        integration_base_revision: "3b0b37a353d478cf235901d391848886574621be",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "public-spi-symbol-surface-was-not-structurally-pinned-across-all-kinds-and-protected-self-owners",
        ],
      },
      {
        reviewed_content:
          "uncommitted-normalized-public-spi-surface-pin-before-signature-aware-fingerprint",
        integration_base_revision: "3b0b37a353d478cf235901d391848886574621be",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "public-surface-fingerprint-collapsed-overloads-and-declaration-types",
        ],
      },
      {
        reviewed_revision: "eba6e9ecbd271fa4d8354fe1552a8123ac326959",
        status: "CHANGES_REQUESTED",
        unresolved_p0: 0,
        unresolved_p1: 1,
        unresolved_p2: 0,
        finding_ids: [
          "public-surface-fingerprint-omitted-symbol-graph-relationships-and-conformances",
        ],
      },
      {
        reviewed_content:
          "uncommitted-relationship-aware-surface-before-complete-ci-calibration-hardening",
        integration_base_revision: "eba6e9ecbd271fa4d8354fe1552a8123ac326959",
        unresolved_p0: 0,
        unresolved_p1: 1,
        unresolved_p2: 3,
        finding_ids: [
          "ci-toolchain-mismatch-lacked-retrievable-exact-symbol-graph-evidence",
          "symbol-graph-artifact-excluded-hidden-dot-build-path",
          "symbol-graph-artifact-name-collided-across-run-attempts",
          "symbol-graph-calibration-metadata-accepted-empty-objects",
        ],
      },
      {
        reviewed_revision: "735398093f7c839c8c2a97f33ef96607961bd829",
        reviewed_tree: "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
        status: "PASS",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      {
        reviewed_revision: toolchainCalibrationRevision,
        reviewed_tree: toolchainCalibrationTree,
        status: "CHANGES_REQUESTED",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 1,
        finding_ids: [
          "calibration-profile-self-check-omitted-unknown-format-platform-module-and-mixed-shards",
        ],
        remediated_by_revision: toolchainSelfCheckRemediationRevision,
        remediation_validation: "PASS",
        remediated_revision_exact_review_status: "PASS",
      },
      {
        reviewed_revision: toolchainSelfCheckRemediationRevision,
        reviewed_tree: toolchainSelfCheckRemediationTree,
        status: "PASS",
        independent_reviewers: 2,
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
    ]);

    const productionCounterKeys = [
      "candidate_selection_runs",
      "external_calibration_runs",
      "formal_ab_runs",
      "live_weight_activations",
      "new_strength_measurements",
      "private_clean_room_copies",
      "production_authority_head_loads",
      "production_handoff_issuances",
      "production_inspector_invocations",
      "production_process_spawns",
      "root_runtime_installs",
      "teacher_games_generated",
      "training_runs",
    ];
    expect(evidence.production_counters.scope).toEqual({
      kind: "implementation-revision-delta-only",
      from_revision_exclusive: "e142d844fcf5e2b189bb29a1ee9880df74afaf1a",
      through_revision_inclusive: implementationEvidenceRevision,
      evidence_basis:
        "git-diff-for-tracked-state-plus-task-observed-command-counters",
      immutable_command_ledger_present: false,
      independently_machine_verified_external_invocation_totals: false,
      post_implementation_publication_activity_included: false,
      not_claimed_as_program_lifetime_totals: true,
    });
    expect(Object.keys(evidence.production_counters.values).sort()).toEqual(
      productionCounterKeys,
    );
    for (const value of Object.values(evidence.production_counters.values)) {
      expect(typeof value).toBe("number");
      expect(value).toBe(0);
    }
    expect(evidence.strength_evidence).toEqual({
      live_weights_changed: false,
      live_configuration_changed: false,
      new_strength_measurements: 0,
      strength_claim: "NO_NEW_MEASUREMENT",
      strength_change: "UNKNOWN_NOT_MEASURED",
    });
    expect(evidence.open_gates).toEqual([
      "root-owned-create-only-authority-public-key-and-activation-head-storage-fresh-load-and-anti-rollback",
      "signed-notarized-release-artifact-and-canonical-root-runtime-install",
      "production-manifest-signed-enrollment-activation-and-role-key-lifecycle",
      "no-follow-held-runtime-and-bundle-filesystem-acl-code-signing-observation",
      "actual-git-control-and-repository-source-observation",
      "audit-token-and-held-process-identity-observation",
      "exact-argv-cwd-empty-environment-and-uid-enforcement-at-exec",
      "suspended-spawn-actual-image-revalidation",
      "process-group-term-kill-reap-and-bounded-output",
      "zero-argument-read-only-production-inspector-and-exactly-one-fresh-evidence-run",
      "private-clean-room-teacher-generation",
      "retraining-candidate-selection-sealed-holdout",
      "formal-ab-and-external-calibration",
      "reversible-canary-monitor-and-rollback",
      "evidence-gated-live-activation",
    ]);
  });

  it("publishes matched bilingual STOP articles with explicit nonclaims", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    for (const article of [japanese, english]) {
      expect(article).toContain("UNAVAILABLE / STOP");
      expect(article).toContain("58 / 58");
      expect(article).toContain("6 / 6");
      expect(article).toContain("RuntimeLaunchPreimageClosureV1");
      expect(article).toContain(implementationEvidenceRevision);
      expect(article).toContain("CryptoKit");
      expect(article).toContain("exit 78");
      expect(article).toContain("UNKNOWN / NOT MEASURED");
      expect(article).toContain("PR #501");
      expect(article).toContain("3b0b37a353d478cf235901d391848886574621be");
      expect(article).toContain("COMMENTED");
      expect(article).toContain("29639949306");
      expect(article).toContain("88068705524");
      expect(article).toContain(
        "strips or rejects DYLD injection before the attested child",
      );
      expect(article).toContain("22 PASS / 1 FAIL");
      expect(article).toContain("88068705540");
      expect(article).toContain("29637691079");
      expect(article).toContain("88062776481");
      expect(article).toContain("20260715.0248.1");
      expect(article).toContain("20260707.563");
      expect(article).toContain("23 / 23 PASS");
      expect(article).toContain("IN_PROGRESS / STOP");
      expect(article).toContain(remoteHeadRevision);
      expect(article).toContain("29645550110");
      expect(article).toContain("88083075424");
      expect(article).toContain("8429932370");
      expect(article).toContain(
        "sha256:5fe40bb4cfcc5a5d967dbd001b0f30878dc23015b89d3a1b1635bae31e636baa",
      );
      expect(article).toContain(
        "floodgate-v7-public-symbol-graphs-macOS-ARM64-6c871485b3d65726adad72fad77aafe94e976590-1",
      );
      expect(article).toContain("6c871485b3d65726adad72fad77aafe94e976590");
      expect(article).toContain(
        "Apple Swift version 6.3.2 (swiftlang-6.3.2.1.108 clang-2100.1.1.101)",
      );
      expect(article).toContain(
        "539e6c39aabf364b464b05b00517c18da061e23987aceb54c8fcbf0825991123",
      );
      expect(article).toContain(toolchainCalibrationRevision);
      expect(article).toContain(toolchainCalibrationTree);
      expect(article).toContain(toolchainSelfCheckRemediationRevision);
      expect(article).toContain(toolchainSelfCheckRemediationTree);
      expect(article).toContain("`NOT_STARTED`");
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-runtime-policy-preimages.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-runtime-policy-preimages.md",
    );
    for (const fact of [
      "実装treeだけを対象",
      "publication reviewで確認",
      "P1 3件 / P2 12件",
      "5回のCHANGES_REQUESTED",
      "0601268a57af32c910b785c3f79da647d3fbb428",
      "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
      "6つのNode / bundle identity digest",
      "record ID",
      "filesystem identity policy digest",
      "ACL policy digest",
      "nonzeroかつpairwise-distinct",
      "実artifact / filesystem",
      "post-implementation",
      "program lifetime",
      "task内の観測",
      "immutableな外部command ledger",
      "fresh load",
      "anti-rollback",
      "signed / notarized release artifact",
      "一度だけのfresh evidence",
      "production inspector / handoff: 0",
      "signalは初回logに記録されなかった",
      "既存のrunner依存CI portability failure",
      "temporary PR merge commit",
      "古いheadのartifactではない",
      "symbol追加0 / 削除0",
      "relationship追加37 / 削除0",
      "conformsTo Swift.SendableMetatype",
      "既存のprecise ID 5件",
      "sourceに既にある`@Sendable`",
      "unknown generator / format / platform / module",
      "mixed base / shard",
      "5 context",
      "fail closed",
      "local unpushed",
      "latest-head CI rerun",
      "reviewもCIも受けていない",
      "outdatedになったevidence test 2件",
      "symbol-graph thread 1件",
      "latest-head External green",
      "exact review",
      "以前の実装security review PASS",
      "追加P1を5件、P2を36件",
      "735398093f7c839c8c2a97f33ef96607961bd829",
      "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
      "f231f30a3a354ce1895553a90a775b85691376e6",
      "259dceb28f96b90194ef03808f88d6a59effd339",
      finalLocalEvidenceRevision,
      finalLocalEvidenceTree,
      "raw child outputを含まない",
      "3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160",
      "542 relationship",
      "491 symbol、579 relationship",
      "4 worker",
      "181 / 181 files",
      "3232 PASS / 1 skip / 0 FAIL",
      "maxWorkers=6",
      "02:44:01",
      "02:49:30",
      "329.30秒",
      "329.60秒",
      "HEADは`3adfd0651e22ecb801b958eef8c9ca00f054a52e`",
      "working treeはuncommitted",
      "179 PASS",
      "3230 PASS / 1 skip / 2 FAIL",
      "341.08秒",
      "12 / 12 PASS",
      "14.93秒",
      "startup-timeout",
      "61 / 61 PASS",
      "原因を確定したものではなく",
      "product regressionも確立していない",
      "production timeout、live weights、設定は変更しない",
    ]) {
      expect(japanese).toContain(fact);
    }
    for (const fact of [
      "implementation-tree-only",
      "separate publication review",
      "three P1 and twelve P2 findings",
      "five CHANGES_REQUESTED entries",
      "0601268a57af32c910b785c3f79da647d3fbb428",
      "3adfd0651e22ecb801b958eef8c9ca00f054a52e",
      "six Node/bundle identity digests",
      "record ID",
      "filesystem-identity-policy digest",
      "ACL-policy digest",
      "nonzero and pairwise distinct",
      "real artifacts and filesystems",
      "post-implementation",
      "program-lifetime",
      "task-observed",
      "immutable external command ledger",
      "fresh loading",
      "anti-rollback",
      "signed/notarized release artifact",
      "exactly one fresh evidence",
      "0 production inspector or handoff runs",
      "signal was not logged",
      "pre-existing runner-dependent CI portability failure",
      "temporary PR merge commit",
      "not an artifact from a stale head",
      "zero symbol additions",
      "zero symbol removals",
      "37 relationship additions",
      "zero relationship removals",
      "conformsTo Swift.SendableMetatype",
      "five existing precise identifiers",
      "`@Sendable` annotation already present in source",
      "unknown generator, format, platform, or module",
      "mixed base/shard profiles",
      "fail closed",
      "local and unpushed",
      "latest-head CI rerun",
      "have not yet passed review or CI",
      "Two outdated evidence-test review threads",
      "symbol-graph thread remains unresolved",
      "External is green on the latest head",
      "exact review",
      "previous implementation-security-review PASS",
      "five further P1 and thirty-six further P2",
      "735398093f7c839c8c2a97f33ef96607961bd829",
      "5f8b873ffe1d15d5a9efc50e7e986478d826f3bc",
      "f231f30a3a354ce1895553a90a775b85691376e6",
      "259dceb28f96b90194ef03808f88d6a59effd339",
      finalLocalEvidenceRevision,
      finalLocalEvidenceTree,
      "no raw child output",
      "3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160",
      "542 relationships",
      "491 symbols, 579 relationships",
      "four workers",
      "181 / 181 files",
      "3,232 passes",
      "maxWorkers=6",
      "02:44:01",
      "02:49:30",
      "329.30 seconds",
      "329.60 seconds",
      "HEAD was `3adfd0651e22ecb801b958eef8c9ca00f054a52e`",
      "working tree contained uncommitted",
      "179 of 181 files",
      "3,230 passes",
      "341.08 seconds",
      "12 / 12",
      "14.93 seconds",
      "startup timeout",
      "61 / 61",
      "does not establish the cause",
      "product regression",
      "does not change production timeouts, live weights, or configuration",
    ]) {
      expect(english).toContain(fact);
    }
    expectSubstringsInOrder(japanese, [
      "root-owned / create-only authority public key",
      "signed / notarized release artifact",
      "production manifest",
      "no-followで保持したruntime / bundle",
      "actual Git control / repository source",
      "exact argv / cwd / empty environment / UID",
      "suspended spawn後のactual image再検査",
      "zero-argument read-only production inspector",
      "private clean-room教師生成",
      "reversible canary",
    ]);
    expectSubstringsInOrder(english, [
      "root-owned, create-only authority public key",
      "signed/notarized release artifact",
      "production manifests",
      "no-follow filesystem",
      "actual Git-control/repository-source",
      "enforcement of exact argv",
      "actual-image revalidation after suspended spawn",
      "zero-argument read-only production inspector",
      "private clean-room teacher generation",
      "evidence-gated live activation",
    ]);
  });
});
