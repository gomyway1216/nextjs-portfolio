import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const moduleRelative = "native/floodgate-v7-external-trust-root-protocol";
const packageRelative = `${moduleRelative}/Package.swift`;
const sourceRelative = `${moduleRelative}/Sources/FloodgateV7ExternalTrustRootProtocol`;
const evidenceRelative =
  "docs/data/floodgate-v7-external-trust-root-protocol-2026-07-17.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-external-trust-root-protocol.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-external-trust-root-protocol.en.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

describe("Floodgate v7 external trust-root protocol boundary", () => {
  it("ships one dependency-free library and no operational target", () => {
    const packageSource = read(packageRelative);
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageSource.match(/\.library\(/gu)).toHaveLength(1);
    expect(packageSource).toContain("dependencies: []");
    expect(packageSource).not.toMatch(/\.executable(?:Target)?\(/u);
    expect(packageSource).not.toContain(".plugin(");
    expect(packageSource).not.toContain(".binaryTarget(");
    expect(
      fs.existsSync(
        path.join(repositoryRoot, moduleRelative, "Package.resolved"),
      ),
    ).toBe(false);
    expect(
      Object.entries(packageJson.scripts ?? {}).filter(
        ([name, command]) =>
          name.includes("external-trust-root") ||
          command.includes("external-trust-root"),
      ),
    ).toEqual([]);
  });

  it("keeps the source surface standard-library-only and non-operational", () => {
    const expectedSources = [
      "ActivationRecord.swift",
      "CanonicalBytes.swift",
      "EnrollmentRecord.swift",
      "ProtocolState.swift",
    ];
    const sourceDirectory = path.join(repositoryRoot, sourceRelative);
    const actualSources = fs.readdirSync(sourceDirectory).sort();
    expect(actualSources).toEqual(expectedSources);

    const source = actualSources
      .map((name) => fs.readFileSync(path.join(sourceDirectory, name), "utf8"))
      .join("\n");
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
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it("pins both canonical domains, sizes, and internal digest authority", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const enrollmentSource = read(`${sourceRelative}/EnrollmentRecord.swift`);
    const activationSource = read(`${sourceRelative}/ActivationRecord.swift`);
    const stateSource = read(`${sourceRelative}/ProtocolState.swift`);

    expect(evidence.implementation_surface.canonical_bytes).toMatchObject({
      integer_encoding: "big-endian",
      dependency_free_sha256: true,
      decode_error: "invalidCanonicalRecord",
      detailed_private_input_error_disclosed: false,
    });
    expect(evidence.implementation_surface.enrollment_record).toMatchObject({
      encoded_bytes: 232,
      fixed_magic_distinct_from_activation: true,
      fixed_audience: "productionRecovery",
      fixed_purpose: "inspectStalePrefix100",
      fields: {
        not_before: "UInt64-nonzero",
      },
      validity_interval: "0 < not-before < expires-at",
    });
    expect(evidence.implementation_surface.activation_record).toMatchObject({
      encoded_bytes: 124,
      fixed_magic_distinct_from_enrollment: true,
      actions: ["activate", "revoke", "rollback"],
    });
    expect(enrollmentSource).toContain("0x45, 0x4e, 0x52, 0x31");
    expect(activationSource).toContain("0x41, 0x43, 0x54, 0x31");
    expect(enrollmentSource).toContain("canonicalByteCount = 232");
    expect(activationSource).toContain("canonicalByteCount = 124");
    expect(stateSource).toContain(
      "let expectedPreviousDigest = lastActivationDigest ?? .zero",
    );
    expect(stateSource).toContain(
      "record.previousActivationDigest == expectedPreviousDigest",
    );
    expect(stateSource).not.toMatch(
      /applyActivation\s*\([^)]*(?:callback|provider|resolver|closure)/u,
    );
  });

  it("fixes rollback and revocation semantics without partial transitions", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.implementation_surface.protocol_state).toMatchObject({
      pure_state_transition: true,
      partial_transition_on_failure: false,
      rollback_scope:
        "any-previously-activated-unrevoked-currently-valid-enrollment",
      revoke_registered_never_activated_allowed: true,
      revoke_outside_validity_window_allowed: true,
      activate_same_enrollment_more_than_once_allowed: false,
      return_to_previously_activated_enrollment_requires_rollback: true,
      previous_activation_digest_authority:
        "protocol-state-internal-computation",
      activation_chain_digest: "canonical-sha256-of-previous-activation-record",
    });
  });

  it("records bilingual UNAVAILABLE STOP evidence and zero production work", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    expect(evidence.scope).toMatchObject({
      status: "UNAVAILABLE",
      operational_decision: "STOP",
      protocol_library_source_only: true,
      external_trust_root_installed: false,
      approved_revision_enrolled: false,
      approved_tree_enrolled: false,
      production_state_inspected: false,
      persistent_mutation_performed: false,
      live_evaluator_changed: false,
    });
    expect(evidence.validation_boundary).toMatchObject({
      xcode_beta_role: "compiler-and-source-test-only",
      xcode_beta_test_status: "PASS",
      xcode_version: "15.3",
      xcode_build: "15E5188j",
      swift_tests_status: "PASS",
      swift_tests_present: 14,
      swift_tests_passed: 14,
      swift_tests_failed: 0,
      repository_vitest_evidence_tests_status: "PASS",
      repository_vitest_evidence_tests_passed: 5,
      repository_vitest_evidence_tests_failed: 0,
      repository_vitest_runtime: "node-v22.13.0",
      full_repository_validation: {
        runtime: "node-v22.13.0",
        vitest: {
          status: "PASS",
          files_passed: 169,
          tests_passed: 3089,
          tests_failed: 0,
          max_workers: 4,
        },
        python_stdlib: {
          status: "PASS",
          tests_passed: 68,
          tests_failed: 0,
        },
        eslint: {
          status: "PASS",
          errors: 0,
          repository_warnings_outside_this_change: 157,
          changed_typescript_warnings: 0,
        },
        production_build: "PASS",
        prettier: "PASS",
        json_parse: "PASS",
        git_diff_check: "PASS",
      },
      xcode_beta_results_counted_as_release_artifact_evidence: false,
      release_toolchain_compatibility_established: false,
      signed_artifact_evidence_established: false,
      notarized_artifact_evidence_established: false,
      installed_artifact_evidence_established: false,
    });
    expect(
      Object.values(evidence.production_counters).every((value) => value === 0),
    ).toBe(true);
    for (const article of [japanese, english]) {
      expect(article).toContain("UNAVAILABLE / STOP");
      expect(article).toContain("232");
      expect(article).toContain("124");
      expect(article).toContain("rollback");
      expect(article).toContain("revoke");
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-external-trust-root-protocol.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-external-trust-root-protocol.md",
    );
  });
});
