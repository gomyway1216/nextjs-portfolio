import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const moduleRelative = "native/floodgate-v7-external-trust-root-protocol";
const protocolSourceRelative = `${moduleRelative}/Sources/FloodgateV7ExternalTrustRootProtocol`;
const evidenceRelative =
  "docs/data/floodgate-v7-external-supervisor-verifier-source-2026-07-17.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-external-supervisor-verifier-source.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-external-supervisor-verifier-source.en.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

describe("Floodgate v7 external supervisor/verifier source boundary", () => {
  it("keeps both named executables structurally fixed at STOP", () => {
    const compactPackage = read(`${moduleRelative}/Package.swift`).replaceAll(
      /\s/gu,
      "",
    );
    const exactMain = [
      "import Darwin",
      "",
      "private let unavailableExitCode: Int32 = 78",
      "",
      "_exit(unavailableExitCode)",
      "",
    ].join("\n");

    for (const [target, product] of [
      ["FloodgateV7TrustRootSupervisor", "floodgate-v7-trust-root-supervisor"],
      ["FloodgateV7TrustRootVerifier", "floodgate-v7-trust-root-verifier"],
    ]) {
      expect(compactPackage).toContain(
        `.executableTarget(name:"${target}",dependencies:[])`,
      );
      expect(compactPackage).toContain(
        `.executable(name:"${product}",targets:["${target}"])`,
      );
      const source = read(`${moduleRelative}/Sources/${target}/main.swift`);
      expect(source).toBe(exactMain);
      expect(source).not.toMatch(
        /Foundation|CryptoKit|CommandLine|Process|FileManager|read|spawn/u,
      );
    }
  });

  it("pins anti-rollback, role separation, and full-chain verification", () => {
    const stateSource = read(
      `${protocolSourceRelative}/AuthenticatedProtocolStateV1.swift`,
    );
    const manifestSource = read(
      `${protocolSourceRelative}/RepositorySourceManifestV1.swift`,
    );
    const handoffSource = read(
      `${protocolSourceRelative}/ExternalVerifierHandoffV1.swift`,
    );
    const coreSource = read(
      `${protocolSourceRelative}/VerifierSupervisorCoreV1.swift`,
    );
    const tests = read(
      `${moduleRelative}/Tests/FloodgateV7ExternalTrustRootProtocolTests/AuthenticatedHandoffTests.swift`,
    );
    const replayRetentionTests = read(
      `${moduleRelative}/Tests/FloodgateV7ExternalTrustRootProtocolTests/ReplayRetentionTests.swift`,
    );

    expect(stateSource).toContain("public struct ExpectedActivationHeadV1");
    expect(stateSource).toContain("canonicalByteCount = 148");
    expect(stateSource).toContain(
      "lastActivationSequence\n                    == expectedActivationHead.latestActivationSequence",
    );
    expect(stateSource).toContain("latestActivationEnvelopeSHA256");
    expect(stateSource).toContain("activeEnrollmentEnvelopeSHA256");
    expect(stateSource).toContain("activeEnrollmentRecordSHA256");
    expect(stateSource).toContain("validateTranscriptEnrollment");
    expect(stateSource).toContain("expectedHeadSHA256 == canonicalSHA256()");
    expect(manifestSource).toContain("validateAuthorityKeySeparation");
    expect(manifestSource).toContain(
      "supervisorArtifactSHA256 != pinnedNodeRuntimeSHA256",
    );
    expect(manifestSource).toContain(
      "verifierArtifactSHA256 != pinnedNodeRuntimeSHA256",
    );
    expect(coreSource).toContain(
      "challenge.targetProcessID\n                == supervisorProcessIdentity.processID",
    );
    expect(coreSource).toContain(
      "challenge.targetProcessIdentitySHA256\n                == supervisorProcessIdentity.canonicalSHA256()",
    );
    expect(coreSource).toContain("maximumReplayRetentionCount = 4_096");
    expect(coreSource).toContain("evictExpiredReplayEntries");
    expect(handoffSource).toContain(
      "try observation.validate(\n            manifest: manifest,\n            enrollment: enrollment",
    );
    expect(handoffSource).not.toMatch(
      /public func verify\(\n\s+publicKeyRawRepresentation: \[UInt8\],\n\s+challenge: SupervisorChallengeV1,\n\s+manifest:/u,
    );
    expect(tests).toContain(
      "testExpectedHeadRejectsTruncatedActivationHistoryAndRoleKeyReuse",
    );
    expect(tests).toContain(
      "testExpectedHeadSelectsTheExactActiveEnrollmentEnvelope",
    );
    expect(tests).toContain(
      "testVerifierIndependentlyRejectsEverySupervisorIdentityDrift",
    );
    expect(tests).toContain("testVerifierRejectsTargetThatIsNotTheSupervisor");
    expect(tests).toContain("assertFinalConsumerRejects");
    expect(tests).toContain("authoritySignerKeyID: handoffBytes32(0xf9)");
    expect(replayRetentionTests).toContain(
      "testFixedCapacityFailsClosedUntilExpiryFreesSpace",
    );
    expect(replayRetentionTests).toContain(
      "testExpiryEvictsReplayStateWithoutAllowingClockRollback",
    );
    expect(replayRetentionTests).toContain(
      "testInvalidReceiptCannotExtendReplayRetention",
    );
    expect(replayRetentionTests).toContain(
      "testLaterConcurrentClockPreventsOlderChallengeCommit",
    );
  });

  it("records exact source-only measurements and zero production work", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.scope).toMatchObject({
      status: "UNAVAILABLE",
      operational_decision: "STOP",
      source_and_test_boundary_only: true,
      external_trust_root_operational: false,
      production_entrypoint_available: false,
      production_authority_public_key_provisioned: false,
      production_activation_head_provisioned: false,
      production_state_inspected: false,
      live_evaluator_changed: false,
    });
    expect(evidence.revision).toMatchObject({
      base_revision: "87bfcae6e35e03ed37a91b860417b9b943180ee0",
      implementation_revision: "0f5446b51908b419cb40372cc1a59e7dc25dbef0",
      base_integration_method: "regular-merge-commit",
      base_pull_request: 498,
    });
    expect(evidence.canonical_records.expected_activation_head).toMatchObject({
      encoded_bytes: 148,
      same_enrollment_id_different_envelope_rejected: true,
      same_enrollment_id_different_record_rejected: true,
    });
    expect(evidence.canonical_records.one_shot_attestation).toMatchObject({
      replay_retention_maximum_live_entries: 4096,
      replay_retention_evicts_at_signed_expiry: true,
      replay_retention_capacity_fails_closed: true,
      consumer_clock_rollback_rejected: true,
    });
    expect(evidence.revocation_semantics).toMatchObject({
      expected_head_rechecked_at_receipt_verification: true,
      expected_head_rechecked_at_attestation_issuance: true,
      expected_head_rechecked_at_attestation_verification: true,
      expected_head_rechecked_at_final_consumption: true,
      post_receipt_head_advance_invalidates_transcript_immediately: true,
      same_envelope_different_authority_key_rejected: true,
      same_envelope_different_sequence_rejected: true,
      active_enrollment_envelope_pinned: true,
      active_enrollment_record_pinned: true,
      receipt_rechecks_active_enrollment_record: true,
      same_enrollment_id_different_signed_record_rejected: true,
      production_root_owned_head_source_available: false,
    });
    expect(evidence.fixed_stop_targets).toMatchObject({
      swift_target_dependencies: [],
      behavior: {
        exit_code: 78,
        stdout_bytes: 0,
        stderr_bytes: 0,
      },
      observed_local_release_build: {
        counted_as_release_artifact_evidence: false,
        supervisor_bytes: 34320,
        verifier_bytes: 34320,
        foundation_linked: false,
        cryptokit_linked: false,
        protocol_library_linked: false,
      },
    });
    expect(evidence.validation).toMatchObject({
      xcode_version: "15.3",
      swift_version: "5.10",
      swift_tests: {
        status: "PASS",
        present: 44,
        passed: 44,
        failed: 0,
      },
      replay_retention_thread_sanitizer: {
        status: "PASS",
        present: 6,
        passed: 6,
        failed: 0,
      },
      deterministic_concurrency_test_repetitions: 20,
      swift_release_build: "PASS",
      fixed_stop_integration: "PASS",
    });
    expect(
      Object.values(evidence.production_counters).every((value) => value === 0),
    ).toBe(true);
    expect(evidence.open_gates).toEqual(
      expect.arrayContaining([
        "root-owned-create-only-authority-public-key-and-activation-head-storage",
        "canonical-runtime-policy-preimage-records",
        "fixed-key-cross-parser-golden-vectors",
      ]),
    );
  });

  it("publishes matched bilingual STOP articles with explicit nonclaims", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    for (const article of [japanese, english]) {
      expect(article).toContain("UNAVAILABLE / STOP");
      expect(article).toContain("44 / 44 PASS");
      expect(article).toContain("ExpectedActivationHeadV1");
      expect(article).toContain("exit 78");
      expect(article).toContain("opaque");
      expect(article).toContain("golden");
      expect(article).toContain("0f5446b51908b419cb40372cc1a59e7dc25dbef0");
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-external-supervisor-verifier-source.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-external-supervisor-verifier-source.md",
    );
    expect(japanese).toContain("production inspector: 0");
    expect(english).toContain("0 production inspector runs");
  });
});
