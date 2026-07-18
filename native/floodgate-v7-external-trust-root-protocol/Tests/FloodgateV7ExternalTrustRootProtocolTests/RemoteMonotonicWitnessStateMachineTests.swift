import CryptoKit
import Foundation
import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func witnessBytes32(
    _ value: UInt8
) -> CanonicalBytes32 {
    try! CanonicalBytes32(Array(repeating: value, count: 32))
}

private let zeroWitnessBytes32 =
    try! CanonicalBytes32(Array(repeating: 0, count: 32))

private enum WitnessSignerFailure: Error {
    case expected
}

private final class SequencedWitnessClock {
    private let values: [UInt64]
    private var index = 0

    init(_ values: [UInt64]) {
        self.values = values
    }

    func read() throws -> UInt64 {
        guard index < values.count else {
            throw WitnessSignerFailure.expected
        }
        defer { index += 1 }
        return values[index]
    }
}

private func witnessSigner(
    _ key: Curve25519.Signing.PrivateKey
) -> TrustRootSignatureProviderV1 {
    { payload in
        Array(try key.signature(for: Data(payload)))
    }
}

private func witnessCheckpoint(
    sequence: UInt64,
    previous: CanonicalBytes32 = zeroWitnessBytes32,
    lastByte: UInt8
) throws -> AuthorityRollbackCheckpointV1 {
    try AuthorityRollbackCheckpointV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        journalID: witnessBytes32(0x11),
        journalSequence: sequence,
        authorityPublicKeyRecordSHA256: witnessBytes32(0x21),
        journalHeaderSHA256: witnessBytes32(0x22),
        lastJournalEntrySHA256: witnessBytes32(lastByte),
        expectedActivationHeadSHA256:
            witnessBytes32(lastByte &+ 1),
        previousWitnessedCheckpointSHA256: previous
    )
}

private func checkpoint(
    for token: TrustRootAuthorityStateTokenV1,
    previous: CanonicalBytes32
) throws -> AuthorityRollbackCheckpointV1 {
    try AuthorityRollbackCheckpointV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        journalID: token.journalID,
        journalSequence: token.journalSequence,
        authorityPublicKeyRecordSHA256:
            token.authorityPublicKeyRecordSHA256,
        journalHeaderSHA256: token.journalHeaderSHA256,
        lastJournalEntrySHA256:
            token.lastJournalEntrySHA256,
        expectedActivationHeadSHA256:
            token.expectedActivationHeadSHA256,
        previousWitnessedCheckpointSHA256: previous
    )
}

private func queryRequest(
    witnessID: CanonicalBytes32 = witnessBytes32(0x61),
    endpointID: CanonicalBytes32 = witnessBytes32(0x62),
    nonce: CanonicalBytes32 = witnessBytes32(0x63),
    operationID: CanonicalBytes32 = witnessBytes32(0x64)
) throws -> RemoteMonotonicWitnessRequestV1 {
    try RemoteMonotonicWitnessRequestV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        operation: .query,
        witnessID: witnessID,
        endpointID: endpointID,
        clientNonce: nonce,
        operationID: operationID,
        expectedCheckpointSHA256: zeroWitnessBytes32,
        candidateCheckpoint: nil
    )
}

private func advanceRequest(
    witnessID: CanonicalBytes32 = witnessBytes32(0x61),
    endpointID: CanonicalBytes32 = witnessBytes32(0x62),
    nonce: CanonicalBytes32,
    operationID: CanonicalBytes32,
    expected: AuthorityRollbackCheckpointV1,
    candidate: AuthorityRollbackCheckpointV1
) throws -> RemoteMonotonicWitnessRequestV1 {
    try RemoteMonotonicWitnessRequestV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        operation: .advance,
        witnessID: witnessID,
        endpointID: endpointID,
        clientNonce: nonce,
        operationID: operationID,
        expectedCheckpointSHA256: expected.canonicalSHA256(),
        candidateCheckpoint: candidate
    )
}

final class RemoteMonotonicWitnessStateMachineTests:
    XCTestCase
{
    func testQueryReturnsNonceBoundFreshSignedCurrentCheckpoint()
        throws
    {
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let initial = try witnessCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint: initial
            )
        let request = try queryRequest()

        let receipt = try machine.handle(
            request,
            issuedAtUnixSeconds: 100,
            sign: witnessSigner(key)
        )
        let verified = try receipt.verifiedCheckpoint(
            for: request,
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation),
            nowUnixSeconds: 115
        )

        XCTAssertTrue(receipt.accepted)
        XCTAssertEqual(verified, initial)
        XCTAssertEqual(receipt.requestSHA256, request.canonicalSHA256())
        XCTAssertThrowsError(
            try receipt.verifiedCheckpoint(
                for: queryRequest(
                    nonce: witnessBytes32(0x65)
                ),
                publicKeyRawRepresentation:
                    Array(key.publicKey.rawRepresentation),
                nowUnixSeconds: 115
            )
        )
        XCTAssertThrowsError(
            try receipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation:
                    Array(key.publicKey.rawRepresentation),
                nowUnixSeconds: 131
            )
        )
    }

    func testConcurrentAdvanceCASAcceptsExactlyOneFork()
        throws
    {
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let initial = try witnessCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidateA = try witnessCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let candidateB = try witnessCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x51
        )
        let requests = [
            try advanceRequest(
                nonce: witnessBytes32(0x71),
                operationID: witnessBytes32(0x81),
                expected: initial,
                candidate: candidateA
            ),
            try advanceRequest(
                nonce: witnessBytes32(0x72),
                operationID: witnessBytes32(0x82),
                expected: initial,
                candidate: candidateB
            ),
        ]
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint: initial
            )
        let resultLock = NSLock()
        var results:
            [
                (
                    RemoteMonotonicWitnessRequestV1,
                    RemoteMonotonicWitnessReceiptV1
                )
            ] = []
        var errors: [Error] = []

        DispatchQueue.concurrentPerform(
            iterations: requests.count
        ) { index in
            do {
                let receipt = try machine.handle(
                    requests[index],
                    issuedAtUnixSeconds: 100,
                    sign: witnessSigner(key)
                )
                resultLock.withLock {
                    results.append((requests[index], receipt))
                }
            } catch {
                resultLock.withLock {
                    errors.append(error)
                }
            }
        }

        XCTAssertTrue(errors.isEmpty)
        XCTAssertEqual(results.count, 2)
        XCTAssertEqual(
            results.filter { $0.1.accepted }.count,
            1
        )
        XCTAssertEqual(
            results.filter { !$0.1.accepted }.count,
            1
        )
        for (request, receipt) in results {
            _ = try receipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation:
                    Array(key.publicKey.rawRepresentation),
                nowUnixSeconds: 100
            )
        }
        let accepted = try XCTUnwrap(
            results.first { $0.1.accepted }
        )
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            accepted.1.checkpoint
        )
    }

    func testAcceptedAdvanceRetryIsIdempotentAndReuseDriftStops()
        throws
    {
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let initial = try witnessCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try witnessCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try advanceRequest(
            nonce: witnessBytes32(0x71),
            operationID: witnessBytes32(0x81),
            expected: initial,
            candidate: candidate
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint: initial
            )

        let first = try machine.handle(
            request,
            issuedAtUnixSeconds: 100,
            sign: witnessSigner(key)
        )
        let retry = try machine.handle(
            request,
            issuedAtUnixSeconds: 101,
            sign: witnessSigner(key)
        )
        XCTAssertTrue(first.accepted)
        XCTAssertTrue(retry.accepted)
        XCTAssertEqual(first.checkpoint, candidate)
        XCTAssertEqual(retry.checkpoint, candidate)

        let drifted = try advanceRequest(
            nonce: witnessBytes32(0x72),
            operationID: request.operationID,
            expected: initial,
            candidate: candidate
        )
        XCTAssertThrowsError(
            try machine.handle(
                drifted,
                issuedAtUnixSeconds: 102,
                sign: witnessSigner(key)
            )
        )
    }

    func testAdvanceCommitsOnlyAfterReceiptConstructionAndSigning()
        throws
    {
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let initial = try witnessCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try witnessCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint: initial
            )

        let receiptRoleAliasedRequest = try advanceRequest(
            nonce: candidate.canonicalSHA256(),
            operationID: witnessBytes32(0x81),
            expected: initial,
            candidate: candidate
        )
        XCTAssertThrowsError(
            try machine.handle(
                receiptRoleAliasedRequest,
                issuedAtUnixSeconds: 100,
                sign: witnessSigner(key)
            )
        )
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            initial
        )
        XCTAssertEqual(
            machine.acceptedOperationCountSnapshot(),
            0
        )

        let request = try advanceRequest(
            nonce: witnessBytes32(0x71),
            operationID: witnessBytes32(0x82),
            expected: initial,
            candidate: candidate
        )
        XCTAssertThrowsError(
            try machine.handle(
                request,
                issuedAtUnixSeconds: 0,
                sign: witnessSigner(key)
            )
        )
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            initial
        )
        XCTAssertThrowsError(
            try machine.handle(
                request,
                issuedAtUnixSeconds: 100
            ) { _ in
                throw WitnessSignerFailure.expected
            }
        )
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            initial
        )
        XCTAssertEqual(
            machine.acceptedOperationCountSnapshot(),
            0
        )

        let receipt = try machine.handle(
            request,
            issuedAtUnixSeconds: 100,
            sign: witnessSigner(key)
        )
        XCTAssertTrue(receipt.accepted)
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            candidate
        )
        XCTAssertEqual(
            machine.acceptedOperationCountSnapshot(),
            1
        )
    }

    func testAcceptedRetryRemainsStableAfterInterveningAdvance()
        throws
    {
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let initial = try witnessCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let second = try witnessCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let third = try witnessCheckpoint(
            sequence: 3,
            previous: second.canonicalSHA256(),
            lastByte: 0x51
        )
        let firstRequest = try advanceRequest(
            nonce: witnessBytes32(0x71),
            operationID: witnessBytes32(0x81),
            expected: initial,
            candidate: second
        )
        let secondRequest = try advanceRequest(
            nonce: witnessBytes32(0x72),
            operationID: witnessBytes32(0x82),
            expected: second,
            candidate: third
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint: initial
            )

        XCTAssertTrue(
            try machine.handle(
                firstRequest,
                issuedAtUnixSeconds: 100,
                sign: witnessSigner(key)
            ).accepted
        )
        XCTAssertTrue(
            try machine.handle(
                secondRequest,
                issuedAtUnixSeconds: 101,
                sign: witnessSigner(key)
            ).accepted
        )
        let delayedRetry = try machine.handle(
            firstRequest,
            issuedAtUnixSeconds: 102,
            sign: witnessSigner(key)
        )

        XCTAssertTrue(delayedRetry.accepted)
        XCTAssertEqual(delayedRetry.checkpoint, second)
        XCTAssertEqual(
            try delayedRetry.verifiedCheckpoint(
                for: firstRequest,
                publicKeyRawRepresentation:
                    Array(key.publicKey.rawRepresentation),
                nowUnixSeconds: 102
            ),
            second
        )
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            third
        )
        XCTAssertEqual(
            machine.acceptedOperationCountSnapshot(),
            2
        )

        let reusedWithDrift = try advanceRequest(
            nonce: witnessBytes32(0x73),
            operationID: firstRequest.operationID,
            expected: second,
            candidate: third
        )
        XCTAssertThrowsError(
            try machine.handle(
                reusedWithDrift,
                issuedAtUnixSeconds: 103,
                sign: witnessSigner(key)
            )
        )
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            third
        )
    }

    func testInvalidSuccessorAndWrongWitnessStop()
        throws
    {
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let initial = try witnessCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let skipped = try witnessCheckpoint(
            sequence: 3,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint: initial
            )
        let skippedRequest = try advanceRequest(
            nonce: witnessBytes32(0x71),
            operationID: witnessBytes32(0x81),
            expected: initial,
            candidate: skipped
        )
        XCTAssertThrowsError(
            try machine.handle(
                skippedRequest,
                issuedAtUnixSeconds: 100,
                sign: witnessSigner(key)
            )
        )
        XCTAssertEqual(
            machine.currentCheckpointSnapshot(),
            initial
        )

        XCTAssertThrowsError(
            try machine.handle(
                queryRequest(
                    witnessID: witnessBytes32(0x69)
                ),
                issuedAtUnixSeconds: 100,
                sign: witnessSigner(key)
            )
        )
    }

    func testGateRequiresRemoteMatchAndUnchangedLocalState()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        let local = try store.freshSnapshot()
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint:
                    checkpoint(
                        for: local.token,
                        previous: zeroWitnessBytes32
                    )
            )

        let verified =
            try RemoteMonotonicWitnessGateV1
            .requireFreshCurrentAuthorityState(
                store: store,
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessPublicKeyRawRepresentation:
                    Array(key.publicKey.rawRepresentation),
                clientNonce: witnessBytes32(0x63),
                operationID: witnessBytes32(0x64),
                trustedUnixClock: { 100 }
            ) { request in
                try machine.handle(
                    request,
                    issuedAtUnixSeconds: 100,
                    sign: witnessSigner(key)
                )
            }

        XCTAssertEqual(verified.token, local.token)
    }

    func testGateUsesPostFetchAndCompletionTimeAndRejectsRollback()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        let local = try store.freshSnapshot()
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint:
                    checkpoint(
                        for: local.token,
                        previous: zeroWitnessBytes32
                    )
            )

        func requireGateFailure(
            clockValues: [UInt64],
            nonce: UInt8,
            operationID: UInt8
        ) {
            let clock = SequencedWitnessClock(clockValues)
            XCTAssertThrowsError(
                try RemoteMonotonicWitnessGateV1
                    .requireFreshCurrentAuthorityState(
                        store: store,
                        witnessID: witnessBytes32(0x61),
                        endpointID: witnessBytes32(0x62),
                        witnessPublicKeyRawRepresentation:
                            Array(key.publicKey.rawRepresentation),
                        clientNonce: witnessBytes32(nonce),
                        operationID:
                            witnessBytes32(operationID),
                        trustedUnixClock: clock.read
                    ) { request in
                        try machine.handle(
                            request,
                            issuedAtUnixSeconds: 100,
                            sign: witnessSigner(key)
                        )
                    }
            )
        }

        requireGateFailure(
            clockValues: [100, 131],
            nonce: 0x71,
            operationID: 0x81
        )
        requireGateFailure(
            clockValues: [101, 100],
            nonce: 0x72,
            operationID: 0x82
        )
        requireGateFailure(
            clockValues: [100, 129, 130],
            nonce: 0x73,
            operationID: 0x83
        )
    }

    func testGateRejectsOldForkedWrongKeyAndExpiredWitness()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        let local = try store.freshSnapshot()
        let correctKey = Curve25519.Signing.PrivateKey()
        let wrongKey = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(correctKey.publicKey.rawRepresentation)
        )
        let matching = try checkpoint(
            for: local.token,
            previous: zeroWitnessBytes32
        )

        func machine(
            checkpoint: AuthorityRollbackCheckpointV1 = matching
        ) throws -> RemoteMonotonicWitnessReferenceStateMachineV1 {
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint: checkpoint
            )
        }

        XCTAssertThrowsError(
            try RemoteMonotonicWitnessGateV1
                .requireFreshCurrentAuthorityState(
                    store: store,
                    witnessID: witnessBytes32(0x61),
                    endpointID: witnessBytes32(0x62),
                    witnessPublicKeyRawRepresentation:
                        Array(wrongKey.publicKey.rawRepresentation),
                    clientNonce: witnessBytes32(0x63),
                    operationID: witnessBytes32(0x64),
                    trustedUnixClock: { 100 }
                ) { request in
                    try machine().handle(
                        request,
                        issuedAtUnixSeconds: 100,
                        sign: witnessSigner(correctKey)
                    )
                }
        )

        XCTAssertThrowsError(
            try RemoteMonotonicWitnessGateV1
                .requireFreshCurrentAuthorityState(
                    store: store,
                    witnessID: witnessBytes32(0x61),
                    endpointID: witnessBytes32(0x62),
                    witnessPublicKeyRawRepresentation:
                        Array(correctKey.publicKey.rawRepresentation),
                    clientNonce: witnessBytes32(0x65),
                    operationID: witnessBytes32(0x66),
                    trustedUnixClock: { 131 }
                ) { request in
                    try machine().handle(
                        request,
                        issuedAtUnixSeconds: 100,
                        sign: witnessSigner(correctKey)
                    )
                }
        )

        let forked = try AuthorityRollbackCheckpointV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            journalID: local.token.journalID,
            journalSequence: local.token.journalSequence,
            authorityPublicKeyRecordSHA256:
                local.token.authorityPublicKeyRecordSHA256,
            journalHeaderSHA256:
                local.token.journalHeaderSHA256,
            lastJournalEntrySHA256: witnessBytes32(0x77),
            expectedActivationHeadSHA256:
                witnessBytes32(0x78),
            previousWitnessedCheckpointSHA256:
                zeroWitnessBytes32
        )
        XCTAssertThrowsError(
            try RemoteMonotonicWitnessGateV1
                .requireFreshCurrentAuthorityState(
                    store: store,
                    witnessID: witnessBytes32(0x61),
                    endpointID: witnessBytes32(0x62),
                    witnessPublicKeyRawRepresentation:
                        Array(correctKey.publicKey.rawRepresentation),
                    clientNonce: witnessBytes32(0x67),
                    operationID: witnessBytes32(0x68),
                    trustedUnixClock: { 100 }
                ) { request in
                    try machine(checkpoint: forked).handle(
                        request,
                        issuedAtUnixSeconds: 100,
                        sign: witnessSigner(correctKey)
                    )
                }
        )

        let remoteAhead = try AuthorityRollbackCheckpointV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            journalID: local.token.journalID,
            journalSequence: local.token.journalSequence + 1,
            authorityPublicKeyRecordSHA256:
                local.token.authorityPublicKeyRecordSHA256,
            journalHeaderSHA256:
                local.token.journalHeaderSHA256,
            lastJournalEntrySHA256: witnessBytes32(0x79),
            expectedActivationHeadSHA256:
                witnessBytes32(0x7A),
            previousWitnessedCheckpointSHA256:
                matching.canonicalSHA256()
        )
        XCTAssertThrowsError(
            try RemoteMonotonicWitnessGateV1
                .requireFreshCurrentAuthorityState(
                    store: store,
                    witnessID: witnessBytes32(0x61),
                    endpointID: witnessBytes32(0x62),
                    witnessPublicKeyRawRepresentation:
                        Array(correctKey.publicKey.rawRepresentation),
                    clientNonce: witnessBytes32(0x6B),
                    operationID: witnessBytes32(0x6C),
                    trustedUnixClock: { 100 }
                ) { request in
                    try machine(checkpoint: remoteAhead).handle(
                        request,
                        issuedAtUnixSeconds: 100,
                        sign: witnessSigner(correctKey)
                    )
                }
        )

        try fixture.appendEntry(sequence: 2)
        XCTAssertThrowsError(
            try RemoteMonotonicWitnessGateV1
                .requireFreshCurrentAuthorityState(
                    store: store,
                    witnessID: witnessBytes32(0x61),
                    endpointID: witnessBytes32(0x62),
                    witnessPublicKeyRawRepresentation:
                        Array(correctKey.publicKey.rawRepresentation),
                    clientNonce: witnessBytes32(0x69),
                    operationID: witnessBytes32(0x6A),
                    trustedUnixClock: { 100 }
                ) { request in
                    try machine().handle(
                        request,
                        issuedAtUnixSeconds: 100,
                        sign: witnessSigner(correctKey)
                    )
                }
        )
    }

    func testGateRejectsLocalAdvanceDuringRemoteCallback()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        let local = try store.freshSnapshot()
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let machine =
            try RemoteMonotonicWitnessReferenceStateMachineV1(
                witnessID: witnessBytes32(0x61),
                endpointID: witnessBytes32(0x62),
                witnessSignerKeyID: keyID,
                initialCheckpoint:
                    checkpoint(
                        for: local.token,
                        previous: zeroWitnessBytes32
                    )
            )

        XCTAssertThrowsError(
            try RemoteMonotonicWitnessGateV1
                .requireFreshCurrentAuthorityState(
                    store: store,
                    witnessID: witnessBytes32(0x61),
                    endpointID: witnessBytes32(0x62),
                    witnessPublicKeyRawRepresentation:
                        Array(key.publicKey.rawRepresentation),
                    clientNonce: witnessBytes32(0x63),
                    operationID: witnessBytes32(0x64),
                    trustedUnixClock: { 100 }
                ) { request in
                    let receipt = try machine.handle(
                        request,
                        issuedAtUnixSeconds: 100,
                        sign: witnessSigner(key)
                    )
                    try fixture.appendEntry(sequence: 2)
                    return receipt
                }
        )
    }
}
