import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type EvidenceRecord =
  typeof import("../../../docs/data/floodgate-v7-release-artifact-install-policy-2026-07-17.json");

const repositoryRoot = path.resolve(__dirname, "../../..");
const moduleRelative = "native/floodgate-v7-external-trust-root-protocol";
const sourceRelative = `${moduleRelative}/Sources/FloodgateV7ExternalTrustRootProtocol`;
const packageRelative = `${moduleRelative}/Package.swift`;
const testsRelative = `${moduleRelative}/Tests/FloodgateV7ExternalTrustRootProtocolTests`;
const evidenceRelative =
  "docs/data/floodgate-v7-release-artifact-install-policy-2026-07-17.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-release-artifact-install-policy.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-release-artifact-install-policy.en.md";
const changedPublicFiles = [
  "docs/blog-shogi-floodgate-v7-release-artifact-install-policy.en.md",
  "docs/blog-shogi-floodgate-v7-release-artifact-install-policy.md",
  evidenceRelative,
  `${sourceRelative}/ArtifactClosureRecordV1.swift`,
  `${sourceRelative}/InstallPolicyRecordV1.swift`,
  `${sourceRelative}/ReleaseToolchainRecordV1.swift`,
  `${testsRelative}/ReleaseArtifactInstallPolicyRecordTests.swift`,
  "tests/unit/ml/floodgateV7ExternalTrustRootProtocolEvidence.test.ts",
  "tests/unit/ml/floodgateV7ReleaseArtifactInstallPolicyEvidence.test.ts",
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function parseStrictJson(text: string): unknown {
  let cursor = 0;

  function skipWhitespace(): void {
    while (/\s/u.test(text[cursor] ?? "")) {
      cursor += 1;
    }
  }

  function scanString(): string {
    skipWhitespace();
    const start = cursor;
    if (text[cursor] !== '"') {
      throw new Error(`expected JSON string at ${cursor}`);
    }
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor += 2;
      } else if (text[cursor] === '"') {
        cursor += 1;
        return JSON.parse(text.slice(start, cursor)) as string;
      } else {
        cursor += 1;
      }
    }
    throw new Error("unterminated JSON string");
  }

  function scanArray(): void {
    cursor += 1;
    skipWhitespace();
    if (text[cursor] === "]") {
      cursor += 1;
      return;
    }
    while (true) {
      scanValue();
      skipWhitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (text[cursor] !== ",") {
        throw new Error(`expected array delimiter at ${cursor}`);
      }
      cursor += 1;
    }
  }

  function scanObject(): void {
    cursor += 1;
    const keys = new Set<string>();
    skipWhitespace();
    if (text[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (true) {
      const key = scanString();
      if (keys.has(key)) {
        throw new Error(`duplicate JSON key: ${key}`);
      }
      keys.add(key);
      skipWhitespace();
      if (text[cursor] !== ":") {
        throw new Error(`expected object colon at ${cursor}`);
      }
      cursor += 1;
      scanValue();
      skipWhitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (text[cursor] !== ",") {
        throw new Error(`expected object delimiter at ${cursor}`);
      }
      cursor += 1;
    }
  }

  function scanValue(): void {
    skipWhitespace();
    if (text[cursor] === "{") {
      scanObject();
      return;
    }
    if (text[cursor] === "[") {
      scanArray();
      return;
    }
    if (text[cursor] === '"') {
      scanString();
      return;
    }
    const start = cursor;
    while (cursor < text.length && !/[\s,\]}]/u.test(text[cursor] ?? "")) {
      cursor += 1;
    }
    JSON.parse(text.slice(start, cursor));
  }

  scanValue();
  skipWhitespace();
  if (cursor !== text.length) {
    throw new Error(`trailing JSON input at ${cursor}`);
  }
  return JSON.parse(text) as unknown;
}

function evidence(): EvidenceRecord {
  return parseStrictJson(read(evidenceRelative)) as EvidenceRecord;
}

describe("Floodgate v7 release, artifact, and install policy boundary", () => {
  it("retains the dependency-free policy source subset", () => {
    const packageSource = read(packageRelative);
    const sourceNames = fs
      .readdirSync(path.join(repositoryRoot, sourceRelative))
      .sort();
    const policySourceNames = [
      "ActivationRecord.swift",
      "ArtifactClosureRecordV1.swift",
      "CanonicalBytes.swift",
      "EnrollmentRecord.swift",
      "InstallPolicyRecordV1.swift",
      "ProtocolState.swift",
      "ReleaseToolchainRecordV1.swift",
    ];
    const source = policySourceNames
      .map((name) => read(`${sourceRelative}/${name}`))
      .join("\n");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageSource.match(/\.library\(/gu)).toHaveLength(1);
    expect(packageSource).toMatch(/dependencies\s*:\s*\[\s*\]/u);
    expect(sourceNames).toEqual(expect.arrayContaining(policySourceNames));
    for (const forbidden of [
      /\bimport\s/u,
      /@main\b/u,
      /\bFoundation\b/u,
      /\bSecurity\b/u,
      /\bCryptoKit\b/u,
      /\bFileManager\b/u,
      /\bURLSession\b/u,
      /\bProcess\s*\(/u,
      /\bCommandLine\b/u,
      /\bgetenv\s*\(/u,
      /\bdlopen\s*\(/u,
      /\bposix_spawn\s*\(/u,
      /\bfork\s*\(/u,
      /\bchmod\s*\(/u,
      /\bchown\s*\(/u,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
    expect(
      Object.entries(packageJson.scripts ?? {}).filter(
        ([name, command]) =>
          name.includes("release-artifact-install") ||
          command.includes("release-artifact-install"),
      ),
    ).toEqual([]);
  });

  it("pins the final root-owned repeatable release-toolchain record", () => {
    const record = evidence().canonical_policy.records.release_toolchain;
    const source = read(`${sourceRelative}/ReleaseToolchainRecordV1.swift`);
    const tests = read(
      `${testsRelative}/ReleaseArtifactInstallPolicyRecordTests.swift`,
    );

    expect(record).toMatchObject({
      type: "ReleaseToolchainRecordV1",
      magic: "FGV7RTL1",
      encoded_bytes: 798,
      purpose: "externalTrustRootPair",
      fixed_release_identity: {
        channel: "Apple-final-release-catalog",
        xcode_version: "15.3.0",
        xcode_build: "15E204a",
        supported_build_host_minimum_inclusive: "14.0.0",
        supported_build_host_maximum_exclusive: "15.0.0",
        target_os: "macOS",
        target_architecture: "arm64",
        swift_language_mode: "Swift-5",
      },
      filesystem_policy: {
        owner_uid: 0,
        owner_group: "wheel",
        owner_gid: 0,
        directory_mode_octal: "0755",
        immutable_closure_required: true,
        writable_acl_entries_allowed: 0,
      },
      required_equalities: {
        pre_build_identity_equals_post_build_identity: true,
        first_unsigned_build_equals_second_unsigned_build: true,
      },
      fixed_zero_counts: {
        network_accesses: 0,
        plugins: 0,
        external_dependencies: 0,
      },
      clean_unsigned_builds_required: 2,
    });
    expect(record.required_identity_digests).toContain(
      "ld_version_output_sha256",
    );
    expect(source).toContain("canonicalByteCount = 798");
    expect(source).toContain("case externalTrustRootPair = 1");
    expect(source).toContain("requiredToolchainOwnerUID: UInt32 = 0");
    expect(source).toContain("requiredToolchainOwnerGID: UInt32 = 0");
    expect(source).toContain("requiredToolchainDirectoryMode: UInt32 = 0o755");
    expect(source).toContain("ldVersionOutputSHA256");
    expect(source).toContain(
      "preBuildIdentitySHA256 == postBuildIdentitySHA256",
    );
    expect(source).toContain(
      "firstUnsignedBuildSHA256 == secondUnsignedBuildSHA256",
    );
    const encodeBoundsGuard =
      /precondition\(\s*Self\.expectedXcodeBuildIdentifier\.count\s*<= Self\.buildIdentifierSlotByteCount,/u;
    const decodeBoundsGuard =
      "guard buildIdentifierCount <= buildIdentifierSlotByteCount else";
    const paddingSubtraction = "- Self.expectedXcodeBuildIdentifier.count";
    const decodedSlice = "buildIdentifierSlot[..<buildIdentifierCount]";

    const hasBoundsGuardsBeforeRiskyOperations = (candidate: string) => {
      const encodeBoundsGuardIndex = candidate.search(encodeBoundsGuard);
      return (
        encodeBoundsGuardIndex >= 0 &&
        encodeBoundsGuardIndex < candidate.indexOf(paddingSubtraction) &&
        candidate.indexOf(decodeBoundsGuard) >= 0 &&
        candidate.indexOf(decodeBoundsGuard) < candidate.indexOf(decodedSlice)
      );
    };

    expect(hasBoundsGuardsBeforeRiskyOperations(source)).toBe(true);
    expect(
      hasBoundsGuardsBeforeRiskyOperations(
        source.replace(encodeBoundsGuard, ""),
      ),
    ).toBe(false);
    expect(
      hasBoundsGuardsBeforeRiskyOperations(
        source.replace(decodeBoundsGuard, ""),
      ),
    ).toBe(false);
    expect(tests).toContain(
      "testReleaseToolchainRejectsUnsupportedHostZeroAndDrift",
    );
  });

  it("pins two distinct Mach-O identities and every named zero counter", () => {
    const record = evidence().canonical_policy.records.artifact_closure;
    const source = read(`${sourceRelative}/ArtifactClosureRecordV1.swift`);
    const expectedZeroCounters = [
      "fat_binary_slices",
      "rpath_load_commands",
      "relative_loads",
      "non_system_loads",
      "weak_loads",
      "reexport_loads",
      "upward_loads",
      "lazy_loads",
      "dyld_environment_entries",
      "plugins",
      "preloads",
      "dangerous_entitlements",
      "package_scripts",
      "code_signing_warnings",
      "notary_warnings",
      "staple_warnings",
      "gatekeeper_warnings",
    ];

    expect(record).toMatchObject({
      type: "ArtifactClosureRecordV1",
      magic: "FGV7ACL1",
      encoded_bytes: 993,
      executables: [
        "floodgate-v7-trust-root-supervisor",
        "floodgate-v7-trust-root-verifier",
      ],
      macho_policy: {
        format: "thin",
        architecture: "arm64",
        file_type: "MH_EXECUTE",
        minimum_os: "13.0.0",
        sdk: "14.4.0",
        load_dependencies: "Apple-system-only",
      },
      application_signing_policy: {
        identity: "Developer ID Application",
        secure_timestamp_required: true,
        hardened_runtime_required: true,
        library_validation_required: true,
        dangerous_entitlements_allowed: 0,
      },
      container_policy: {
        format: "signed-flat-pkg",
        payload_executables: 2,
        payload_regular_files: 2,
        non_executable_regular_files_allowed: 0,
        symlinks_allowed: 0,
        hardlink_aliases_allowed: 0,
        special_files_allowed: 0,
        directory_entries: "exact-install-policy-ancestors-only",
        package_scripts_allowed: 0,
        identity: "Developer ID Installer",
        notary_status: "accepted",
        stapled_ticket_required: true,
        gatekeeper_acceptance_required: true,
        warnings_allowed: 0,
      },
    });
    expect(record.must_differ_between_executables).toEqual([
      "whole_file_sha256",
      "semantic_macho_sha256",
      "executable_identifier_sha256",
      "designated_requirement_sha256",
      "code_directory_sha256",
      "cdhash",
    ]);
    expect(record.may_match_between_executables).toEqual([
      "dependency_closure_sha256",
      "entitlement_policy_sha256",
    ]);
    expect(record.fixed_zero_counts_in_encoded_order).toEqual(
      expectedZeroCounters,
    );
    for (const sourceName of [
      "allowedFatBinarySliceCount",
      "allowedRPathLoadCommandCount",
      "allowedRelativeLoadCount",
      "allowedNonSystemLoadCount",
      "allowedWeakLoadCount",
      "allowedReexportLoadCount",
      "allowedUpwardLoadCount",
      "allowedLazyLoadCount",
      "allowedDYLDEnvironmentEntryCount",
      "allowedPluginCount",
      "allowedPreloadCount",
      "allowedDangerousEntitlementCount",
      "allowedPackageScriptCount",
      "allowedCodeSigningWarningCount",
      "allowedNotaryWarningCount",
      "allowedStapleWarningCount",
      "allowedGatekeeperWarningCount",
    ]) {
      expect(source).toContain(sourceName);
    }
    expect(source).not.toMatch(/for\s+_\s+in\s+0\.\.<17/u);
    for (const sourceName of [
      "requiredPayloadRegularFileCount",
      "allowedPayloadNonExecutableRegularFileCount",
      "allowedPayloadSymlinkCount",
      "allowedPayloadHardlinkAliasCount",
      "allowedPayloadSpecialFileCount",
    ]) {
      expect(source).toContain(sourceName);
    }
    expect(Object.keys(record.container_policy).sort()).toEqual(
      [
        "directory_entries",
        "format",
        "gatekeeper_acceptance_required",
        "hardlink_aliases_allowed",
        "identity",
        "non_executable_regular_files_allowed",
        "notary_status",
        "package_scripts_allowed",
        "payload_executables",
        "payload_regular_files",
        "secure_timestamp_required",
        "special_files_allowed",
        "stapled_ticket_required",
        "symlinks_allowed",
        "warnings_allowed",
      ].sort(),
    );
  });

  it("models every exact install ancestor and leaf separately", () => {
    const record = evidence().canonical_policy.records.install_policy;
    const source = read(`${sourceRelative}/InstallPolicyRecordV1.swift`);
    const paths = record.paths as Array<Record<string, unknown>>;

    expect(record).toMatchObject({
      type: "InstallPolicyRecordV1",
      magic: "FGV7INP1",
      encoded_bytes: 980,
      global_policy: {
        no_follow_required: true,
        same_device_required: true,
        local_filesystem_required: true,
        writable_acl_entries_allowed: 0,
      },
      artifact_composition: {
        artifact_closure_record_sha256_exact_match_required: true,
        supervisor_leaf_matches_supervisor_whole_file_sha256: true,
        verifier_leaf_matches_verifier_whole_file_sha256: true,
        swapped_leaf_identities_rejected: true,
      },
    });
    expect(paths).toHaveLength(9);
    expect(paths.map(({ path: entryPath }) => entryPath)).toEqual([
      "/",
      "/Library",
      "/Library/Application Support",
      "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7",
      "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot",
      "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1",
      "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/bin",
      "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/bin/floodgate-v7-trust-root-supervisor",
      "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/bin/floodgate-v7-trust-root-verifier",
    ]);
    expect(paths.slice(0, 7).every(({ kind }) => kind === "directory")).toBe(
      true,
    );
    expect(
      paths
        .slice(0, 7)
        .every(
          ({ link_policy, exact_link_count }) =>
            link_policy === "positive-and-stable" && exact_link_count === null,
        ),
    ).toBe(true);
    expect(paths[2]).toMatchObject({
      owner: "root",
      group: "admin",
      gid: 80,
      mode_octal: "0755",
    });
    for (const [index, leaf] of paths.slice(7).entries()) {
      expect(leaf).toMatchObject({
        kind: "regular-file",
        owner: "root",
        group: "wheel",
        mode_octal: "0555",
        link_policy: "exact",
        exact_link_count: 1,
        artifact_identity_field:
          index === 0 ? "supervisorWholeFileSHA256" : "verifierWholeFileSHA256",
      });
    }
    expect(source).toContain("canonicalPathCount = 9");
    expect(source).toContain("requireSameDevice");
    expect(source).toContain("requireLocalFilesystem");
    expect(source).toContain("positiveStableLinkCount");
    expect(source).toContain("exactLinkCount: 1");
    expect(source).toContain("validateArtifactClosure");
    expect(source).toContain("artifactClosure.canonicalSHA256()");
    expect(source).toContain("artifactClosure.supervisorWholeFileSHA256");
    expect(source).toContain("artifactClosure.verifierWholeFileSHA256");
  });

  it("records the local environment as ineligible source-test-only evidence", () => {
    const record = evidence();
    const local = record.local_source_test_only;
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    expect(local).toMatchObject({
      role: "compiler-and-source-test-only",
      eligible_for_release_artifact_generation: false,
      host: {
        product: "macOS",
        version: "15.1",
        xcode_15_3_supported_host: "macOS-Sonoma-14.x",
        inside_supported_matrix: false,
      },
      xcode: {
        version: "15.3",
        installed_build: "15E5188j",
        required_final_build: "15E204a",
        matches_required_final_build: false,
        bundle_ownership: "user-owned",
        developer_directory_ownership: "user-owned",
        owner_class: "current-nonroot-user",
        matches_root_wheel_policy: false,
      },
      credential_readiness: {
        developer_id_identities: 0,
        notary_profile_present: false,
        credential_inventory_rechecked_in_this_change: false,
        keychain_or_notary_profile_accesses_in_this_change: 0,
      },
    });
    const officialUrls = [
      "https://developer.apple.com/xcode-cloud/release-notes/",
      "https://developer.apple.com/support/xcode/",
      "https://developer.apple.com/help/account/certificates/create-developer-id-certificates/",
      "https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution",
      "https://developer.apple.com/documentation/security/customizing-the-notarization-workflow",
      "https://developer.apple.com/documentation/security/hardened-runtime",
      "https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/",
    ];
    expect(record.official_apple_sources).toHaveLength(officialUrls.length);
    expect(
      record.official_apple_sources.map(({ url }: { url: string }) => url),
    ).toEqual(officialUrls);
    for (const source of record.official_apple_sources) {
      expect(source.publisher).toBe("Apple");
      expect(new URL(source.url).hostname).toBe("developer.apple.com");
    }
    for (const article of [japanese, english]) {
      expect(article).toContain("UNAVAILABLE / STOP");
      expect(article).toContain("15E204a");
      expect(article).toContain("15E5188j");
      expect(article).toContain("macOS 15.1");
      expect(article).toContain("Developer ID");
      expect(article).toContain("25 / 25");
    }
    expect(record.privacy).toMatchObject({
      personal_username_disclosed: false,
      private_selected_xcode_path_disclosed: false,
      local_tool_output_fingerprint_disclosed: false,
      unnecessary_host_build_disclosed: false,
      fixed_future_install_paths_are_public_policy: true,
    });
    expect(
      Object.values(record.privacy_counters).every((value) => value === 0),
    ).toBe(true);
    const publicArtifacts = changedPublicFiles.map(read).join("\n");
    for (const forbiddenPrivateValue of [
      /\/Users\//u,
      /\/Applications\/Xcode[^/\n]*\.app/u,
      /"(?:hardware_uuid|serial_number|local_tool_output_sha256|host_build_identifier)"\s*:/iu,
      new RegExp(`\\b${["bundle", "owner"].join("_")}\\b\\s*:`, "u"),
      new RegExp(
        `\\b${["developer", "directory", "owner"].join("_")}\\b\\s*:`,
        "u",
      ),
    ]) {
      expect(publicArtifacts).not.toMatch(forbiddenPrivateValue);
    }
  });

  it("keeps every operational counter at zero and every future gate open", () => {
    const record = evidence();

    expect(record.base).toMatchObject({
      repository_main_revision: "cae5de16f91f2eff04ca98a48ef0739f5b48a11f",
      repository_main_tree: "e00cdc17f4fe0ba4cd90752421eacfff25c4095d",
      latest_main_integration_method: "regular-merge-commit",
      latest_main_integration_pull_request: 494,
      latest_main_integration_commit:
        "cae5de16f91f2eff04ca98a48ef0739f5b48a11f",
      latest_main_integration_main_parent:
        "398b6d20dbe9b2de4648e77424c2a15820f15dec",
      latest_main_integration_feature_parent:
        "7fe9fe60eb00fadc823174ae883aa251ae11ee72",
    });
    expect(record.scope).toMatchObject({
      status: "UNAVAILABLE",
      operational_decision: "STOP",
      swift_library_source_only: true,
      executable_created: false,
      flat_package_created: false,
      installer_created: false,
      signer_created: false,
      notarizer_created: false,
      credential_or_key_material_added: false,
      root_install_performed: false,
      production_binding_changed: false,
      live_evaluator_changed: false,
    });
    expect(
      Object.values(record.production_counters).every((value) => value === 0),
    ).toBe(true);
    expect(
      Object.values(record.future_gates).every((value) => value === "OPEN"),
    ).toBe(true);
    expect(record.validation).toMatchObject({
      local_xcode_results_counted_as_release_artifact_evidence: false,
      swift_source_tests: {
        status: "PASS",
        tests_present: 25,
        tests_passed: 25,
        tests_failed: 0,
        new_policy_tests: 11,
      },
      repository_evidence_tests: {
        status: "PASS",
        tests_present: 11,
        tests_passed: 11,
        tests_failed: 0,
      },
      full_repository_validation: {
        status: "PASS",
        test_files_present: 172,
        test_files_passed: 172,
        test_files_failed: 0,
        tests_present: 3112,
        tests_passed: 3112,
        tests_failed: 0,
      },
      release_toolchain_evidence_established: false,
      release_artifacts_established: false,
      signed_flat_package_established: false,
      notarization_established: false,
      installed_closure_established: false,
    });
    expect(() =>
      parseStrictJson('{"outer":{"status":"one","status":"two"}}'),
    ).toThrow(/duplicate JSON key: status/u);
  });
});
