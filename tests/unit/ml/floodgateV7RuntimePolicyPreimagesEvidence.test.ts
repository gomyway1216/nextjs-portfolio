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
const implementationEvidenceRevision =
  "773f7eb88f943385ac89a6ec0e61d9e7a23e5e12";
const implementationEvidenceTree = "ef6a4f738393d1dfc59ce2c4752628633cf16f14";
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
  return execFileSync("/usr/bin/git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
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
    expect(symbolGraphVerifier).toContain("runtimeLaunchPreimageClosure: ");
    expect(symbolGraphVerifier).toContain("forbidden_partial_entrypoints");
    expect(workflow).toContain("dump-symbol-graph");
    expect(workflow).toContain("verify-public-api-symbol-graph.py");
    expect(workflow.match(/fetch-depth: 0/gu)).toHaveLength(1);
    expect(workflow.match(/timeout-minutes: 25/gu)).toHaveLength(1);
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
      base_pull_request: 499,
      base_integration_method: "regular-merge-commit",
    });
    for (const [revisionKey, treeKey] of [
      ["base_revision", "base_tree"],
      ["canonical_preimage_revision", "canonical_preimage_tree"],
      ["mandatory_closure_revision", "mandatory_closure_tree"],
      ["cross_parser_revision", "cross_parser_tree"],
      ["golden_review_fix_revision", "golden_review_fix_tree"],
      ["public_api_enforcement_revision", "public_api_enforcement_tree"],
      ["golden_domain_separation_revision", "golden_domain_separation_tree"],
      ["implementation_evidence_revision", "implementation_evidence_tree"],
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
    expect(Number.isNaN(recordedAtMillis)).toBe(false);
    expect(recordedAtMillis).toBeGreaterThanOrEqual(
      implementationCommittedAtMillis,
    );
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
        composed_entrypoints_present: 4,
        partial_entrypoints_absent: 6,
        raw_runtime_launch_policy_public_handoff_overloads: 0,
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
      public_api_symbol_graph: {
        status: "PASS",
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
        remediation_revision: implementationEvidenceRevision,
        reviewed_revision: implementationEvidenceRevision,
        resolved_p2_total: 5,
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
      publication_evidence_review: {
        status: "IN_PROGRESS",
        review_scope:
          "publication-artifacts-and-provenance-ci-delta-working-tree-content",
        reviewed_implementation_revision: implementationEvidenceRevision,
        remediation_status: "IN_PROGRESS",
        resolved_p1_total: 3,
        resolved_p2_total: 10,
        unresolved_p0: null,
        unresolved_p1: null,
        unresolved_p2: null,
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
      "P1 3件 / P2 10件",
      "3回のCHANGES_REQUESTED",
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
    ]) {
      expect(japanese).toContain(fact);
    }
    for (const fact of [
      "implementation-tree-only",
      "separate publication review",
      "three P1 and ten P2 findings",
      "three CHANGES_REQUESTED entries",
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
