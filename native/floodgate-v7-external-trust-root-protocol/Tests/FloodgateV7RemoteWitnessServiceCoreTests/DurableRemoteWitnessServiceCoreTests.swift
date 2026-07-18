import CryptoKit
import Foundation
import XCTest

import FloodgateV7ExternalTrustRootProtocol
@testable import FloodgateV7RemoteWitnessServiceCore

private enum ServiceCoreTestFailure: Error {
    case expected
}

private func serviceBytes32(_ value: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(Array(repeating: value, count: 32))
}

private let serviceZero32 = CanonicalBytes32.zero
private let serviceWitnessID = serviceBytes32(0x61)
private let serviceStoreGenerationID = serviceBytes32(0x66)
private let serviceEndpointID = try!
    DurableRemoteWitnessDeploymentIdentityV1.boundEndpointID(
        witnessID: serviceWitnessID,
        storeGenerationID: serviceStoreGenerationID
    )

private func serviceCheckpoint(
    sequence: UInt64,
    previous: CanonicalBytes32 = serviceZero32,
    lastByte: UInt8
) throws -> AuthorityRollbackCheckpointV1 {
    try AuthorityRollbackCheckpointV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        journalID: serviceBytes32(0x11),
        journalSequence: sequence,
        authorityPublicKeyRecordSHA256:
            serviceBytes32(0x21),
        journalHeaderSHA256: serviceBytes32(0x22),
        lastJournalEntrySHA256:
            serviceBytes32(lastByte),
        expectedActivationHeadSHA256:
            serviceBytes32(lastByte &+ 1),
        previousWitnessedCheckpointSHA256: previous
    )
}

private func serviceQuery(
    operationID: CanonicalBytes32 = serviceBytes32(0x64),
    witnessID: CanonicalBytes32 = serviceWitnessID,
    endpointID: CanonicalBytes32 = serviceEndpointID
) throws -> RemoteMonotonicWitnessRequestV1 {
    try RemoteMonotonicWitnessRequestV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        operation: .query,
        witnessID: witnessID,
        endpointID: endpointID,
        clientNonce: serviceBytes32(0x63),
        operationID: operationID,
        expectedCheckpointSHA256: .zero,
        candidateCheckpoint: nil
    )
}

private func serviceAdvance(
    current: AuthorityRollbackCheckpointV1,
    candidate: AuthorityRollbackCheckpointV1,
    operationID: CanonicalBytes32 = serviceBytes32(0x81),
    nonce: CanonicalBytes32 = serviceBytes32(0x71)
) throws -> RemoteMonotonicWitnessRequestV1 {
    try RemoteMonotonicWitnessRequestV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        operation: .advance,
        witnessID: serviceWitnessID,
        endpointID: serviceEndpointID,
        clientNonce: nonce,
        operationID: operationID,
        expectedCheckpointSHA256: current.canonicalSHA256(),
        candidateCheckpoint: candidate
    )
}

private func serviceSnapshot(
    identity: DurableRemoteWitnessDeploymentIdentityV1,
    current: AuthorityRollbackCheckpointV1,
    acceptedOperationCount: Int,
    operation: DurableRemoteWitnessAcceptedOperationV1? = nil,
    observedStoreGenerationID: CanonicalBytes32? = nil
) -> DurableRemoteWitnessTransactionalSnapshotV1 {
    DurableRemoteWitnessTransactionalSnapshotV1(
        deploymentIdentity: identity,
        observedStoreGenerationID:
            observedStoreGenerationID
            ?? identity.storeGenerationID,
        currentCheckpoint: current,
        acceptedOperationCount: acceptedOperationCount,
        operation: operation
    )
}

private final class ScriptedServiceClock {
    private var values: [UInt64]
    private var index = 0

    init(_ values: [UInt64]) {
        self.values = values
    }

    func read() throws -> UInt64 {
        guard index < values.count else {
            throw ServiceCoreTestFailure.expected
        }
        defer { index += 1 }
        return values[index]
    }
}

private final class CountingServiceSigner:
    @unchecked Sendable
{
    private let lock = NSLock()
    private let key: Curve25519.Signing.PrivateKey
    private(set) var callCount = 0
    var shouldFail = false

    init(_ key: Curve25519.Signing.PrivateKey) {
        self.key = key
    }

    var provider: TrustRootSignatureProviderV1 {
        { [self] payload in
            try sign(payload)
        }
    }

    func sign(_ payload: [UInt8]) throws -> [UInt8] {
        try lock.withLock {
            callCount += 1
            if shouldFail {
                throw ServiceCoreTestFailure.expected
            }
            return Array(
                try key.signature(for: Data(payload))
            )
        }
    }
}

private final class FakeDurableWitnessStore {
    let identity: DurableRemoteWitnessDeploymentIdentityV1
    let observedStoreGenerationID: CanonicalBytes32
    var current: AuthorityRollbackCheckpointV1
    var acceptedOperationCount: Int
    var operations:
        [
            CanonicalBytes32:
                DurableRemoteWitnessAcceptedOperationV1
        ] = [:]
    var commitResults:
        [DurableRemoteWitnessCommitResultV1] = [.committed]
    var ambiguousCommitIndexesToApply: Set<Int> = []
    var throwOnCommit = false
    private(set) var transactionalReadOperationIDs:
        [CanonicalBytes32] = []
    private(set) var commitPlans:
        [DurableRemoteWitnessCommitPlanV1] = []

    init(
        identity: DurableRemoteWitnessDeploymentIdentityV1,
        current: AuthorityRollbackCheckpointV1,
        acceptedOperationCount: Int = 0,
        observedStoreGenerationID: CanonicalBytes32? = nil
    ) {
        self.identity = identity
        self.observedStoreGenerationID =
            observedStoreGenerationID
            ?? identity.storeGenerationID
        self.current = current
        self.acceptedOperationCount = acceptedOperationCount
    }

    func transactionalRead(
        operationID: CanonicalBytes32
    ) -> DurableRemoteWitnessTransactionalSnapshotV1 {
        transactionalReadOperationIDs.append(operationID)
        return DurableRemoteWitnessTransactionalSnapshotV1(
            deploymentIdentity: identity,
            observedStoreGenerationID:
                observedStoreGenerationID,
            currentCheckpoint: current,
            acceptedOperationCount: acceptedOperationCount,
            operation: operations[operationID]
        )
    }

    func commit(
        _ plan: DurableRemoteWitnessCommitPlanV1
    ) throws -> DurableRemoteWitnessCommitResultV1 {
        if throwOnCommit {
            throw ServiceCoreTestFailure.expected
        }
        let index = commitPlans.count
        commitPlans.append(plan)
        let result =
            index < commitResults.count
                ? commitResults[index]
                : commitResults.last ?? .ambiguous
        if result == .committed
            || (
                result == .ambiguous
                    && ambiguousCommitIndexesToApply
                    .contains(index)
            )
        {
            applyIdempotently(plan)
        }
        return result
    }

    private func applyIdempotently(
        _ plan: DurableRemoteWitnessCommitPlanV1
    ) {
        let operationID =
            plan.createOnlyOperation.operationID
        if let existing = operations[operationID] {
            precondition(existing == plan.createOnlyOperation)
            return
        }
        precondition(plan.deploymentIdentity == identity)
        precondition(
            plan.expectedCheckpointSHA256
                == current.canonicalSHA256()
        )
        precondition(
            plan.expectedAcceptedOperationCount
                == acceptedOperationCount
        )
        current = plan.replacementCheckpoint
        acceptedOperationCount += 1
        operations[operationID] =
            plan.createOnlyOperation
    }
}

private struct ServiceHarness {
    let key: Curve25519.Signing.PrivateKey
    let identity: DurableRemoteWitnessDeploymentIdentityV1
    let core: DurableRemoteWitnessServiceCoreV1
    let signer: CountingServiceSigner

    init() throws {
        let key = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let identity =
            try DurableRemoteWitnessDeploymentIdentityV1(
                witnessID: serviceWitnessID,
                endpointID: serviceEndpointID,
                witnessSignerKeyID: keyID,
                storeGenerationID: serviceStoreGenerationID
            )
        self.key = key
        self.identity = identity
        core = try DurableRemoteWitnessServiceCoreV1(
            deploymentIdentity: identity,
            witnessSignerPublicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        signer = CountingServiceSigner(key)
    }
}

final class DurableRemoteWitnessServiceCoreTests:
    XCTestCase
{
    func testQueryRevalidatesTransactionalSnapshotAndNeverCommits()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        let request = try serviceQuery()
        let clock = ScriptedServiceClock([100, 100, 100])

        let receipt = try harness.core.handle(
            request,
            callerRole: .queryOnly,
            exactAttemptID: serviceBytes32(0x91),
            clock: clock.read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )

        XCTAssertTrue(receipt.accepted)
        XCTAssertEqual(receipt.checkpoint, initial)
        XCTAssertEqual(
            store.transactionalReadOperationIDs,
            [request.operationID, request.operationID]
        )
        XCTAssertTrue(store.commitPlans.isEmpty)
    }

    func testQueryStopsIfStateAdvancesAfterSigningBeforeRevalidation()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let advanced = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceQuery()
        var readCount = 0
        var commitCount = 0

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .queryOnly,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100, 100])
                    .read,
                sign: harness.signer.provider,
                transactionalRead: { _ in
                    defer { readCount += 1 }
                    return serviceSnapshot(
                        identity: harness.identity,
                        current:
                            readCount == 0
                                ? initial
                                : advanced,
                        acceptedOperationCount:
                            readCount == 0 ? 0 : 1
                    )
                },
                commit: { _ in
                    commitCount += 1
                    return .committed
                }
            )
        )
        XCTAssertEqual(readCount, 2)
        XCTAssertEqual(commitCount, 0)
        XCTAssertEqual(harness.signer.callCount, 1)
    }

    func testRejectedAdvanceStopsIfStateChangesBeforeRevalidation()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let requested = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let competing = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x51
        )
        let later = try serviceCheckpoint(
            sequence: 3,
            previous: competing.canonicalSHA256(),
            lastByte: 0x61
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: requested
        )
        var readCount = 0
        var commitCount = 0

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100, 100])
                    .read,
                sign: harness.signer.provider,
                transactionalRead: { _ in
                    defer { readCount += 1 }
                    return serviceSnapshot(
                        identity: harness.identity,
                        current:
                            readCount == 0
                                ? competing
                                : later,
                        acceptedOperationCount:
                            readCount == 0 ? 1 : 2
                    )
                },
                commit: { _ in
                    commitCount += 1
                    return .committed
                }
            )
        )
        XCTAssertEqual(readCount, 2)
        XCTAssertEqual(commitCount, 0)
        XCTAssertEqual(harness.signer.callCount, 1)
    }

    func testQueryOnlyAdvanceAndWrongGenerationStopBeforeSigning()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .queryOnly,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(harness.signer.callCount, 0)
        XCTAssertTrue(
            store.transactionalReadOperationIDs.isEmpty
        )

        let restoredStore = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial,
            observedStoreGenerationID:
                serviceBytes32(0x67)
        )
        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100]).read,
                sign: harness.signer.provider,
                transactionalRead:
                    restoredStore.transactionalRead,
                commit: restoredStore.commit
            )
        )
        XCTAssertEqual(harness.signer.callCount, 0)
    }

    func testSignOrCommitFailureProducesNoDurableWriteOrReceipt()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )

        harness.signer.shouldFail = true
        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.current, initial)
        XCTAssertTrue(store.operations.isEmpty)
        XCTAssertTrue(store.commitPlans.isEmpty)

        harness.signer.shouldFail = false
        store.throwOnCommit = true
        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([101, 101]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.current, initial)
        XCTAssertTrue(store.operations.isEmpty)
    }

    func testCommitMustReconcileDurableOperationBeforeResponse()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        let clock = ScriptedServiceClock([100, 100, 100])

        let receipt = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: clock.read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )

        XCTAssertTrue(receipt.accepted)
        XCTAssertEqual(store.current, candidate)
        XCTAssertEqual(store.acceptedOperationCount, 1)
        XCTAssertEqual(store.commitPlans.count, 1)
        XCTAssertEqual(
            store.transactionalReadOperationIDs,
            [request.operationID, request.operationID]
        )
        let plan = try XCTUnwrap(store.commitPlans.first)
        XCTAssertEqual(
            plan.createOnlyOperation.immutableInitialReceipt,
            receipt
        )
        XCTAssertEqual(
            Mirror(reflecting: plan).children.compactMap(\.label),
            [
                "exactAttemptID",
                "deploymentIdentity",
                "expectedCheckpointSHA256",
                "expectedAcceptedOperationCount",
                "replacementCheckpoint",
                "createOnlyOperation",
            ]
        )
    }

    func testTransientConflictResendsOnlyTheExactPlan()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        store.commitResults = [
            .transientConflict,
            .committed,
        ]

        let receipt = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )

        XCTAssertTrue(receipt.accepted)
        XCTAssertEqual(store.commitPlans.count, 2)
        XCTAssertEqual(
            store.commitPlans[0],
            store.commitPlans[1]
        )
    }

    func testAmbiguousAppliedThenDefinitiveCASLossReconcilesWinner()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        store.commitResults = [
            .ambiguous,
            .definitiveCASLoss,
        ]
        store.ambiguousCommitIndexesToApply = [0]

        let receipt = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )

        XCTAssertTrue(receipt.accepted)
        XCTAssertEqual(store.current, candidate)
        XCTAssertEqual(store.commitPlans.count, 2)
        XCTAssertEqual(
            store.commitPlans[0],
            store.commitPlans[1]
        )
    }

    func testConcurrentExactRequestReturnsDurableWinnerReceipt()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let winnerStore = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        let winnerReceipt = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: winnerStore.transactionalRead,
            commit: winnerStore.commit
        )
        var readCount = 0
        var losingPlans: [DurableRemoteWitnessCommitPlanV1] = []

        let reconciled = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x92),
            clock: ScriptedServiceClock([101, 101, 101])
                .read,
            sign: harness.signer.provider,
            transactionalRead: { operationID in
                defer { readCount += 1 }
                if readCount == 0 {
                    return serviceSnapshot(
                        identity: harness.identity,
                        current: initial,
                        acceptedOperationCount: 0
                    )
                }
                return winnerStore.transactionalRead(
                    operationID: operationID
                )
            },
            commit: { plan in
                losingPlans.append(plan)
                return .definitiveCASLoss
            }
        )

        XCTAssertEqual(reconciled, winnerReceipt)
        XCTAssertEqual(readCount, 2)
        XCTAssertEqual(losingPlans.count, 1)
        XCTAssertNotEqual(
            losingPlans[0]
                .createOnlyOperation
                .immutableInitialReceipt,
            winnerReceipt
        )
    }

    func testRepeatedAmbiguityStopsWithoutInferringAbsent()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        store.commitResults = [.ambiguous]

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100, 100])
                    .read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(
            store.commitPlans.count,
            DurableRemoteWitnessServiceCoreV1
                .maximumExactCommitAttempts
        )
        XCTAssertTrue(
            store.commitPlans.dropFirst().allSatisfy {
                $0 == store.commitPlans[0]
            }
        )
        XCTAssertEqual(store.current, initial)
        XCTAssertTrue(store.operations.isEmpty)
    }

    func testCompetingForkAcceptsOnlyOne()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidateA = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let candidateB = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x51
        )
        let requestA = try serviceAdvance(
            current: initial,
            candidate: candidateA,
            operationID: serviceBytes32(0x81),
            nonce: serviceBytes32(0x71)
        )
        let requestB = try serviceAdvance(
            current: initial,
            candidate: candidateB,
            operationID: serviceBytes32(0x82),
            nonce: serviceBytes32(0x72)
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )

        let first = try harness.core.handle(
            requestA,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        let second = try harness.core.handle(
            requestB,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x92),
            clock: ScriptedServiceClock([101, 101, 101])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )

        XCTAssertTrue(first.accepted)
        XCTAssertFalse(second.accepted)
        XCTAssertEqual(store.current, candidateA)
        XCTAssertEqual(store.commitPlans.count, 1)
    }

    func testDefinitiveDifferentForkCASLossReturnsRevalidatedRejection()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let winner = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let loser = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x51
        )
        let winnerRequest = try serviceAdvance(
            current: initial,
            candidate: winner,
            operationID: serviceBytes32(0x81),
            nonce: serviceBytes32(0x71)
        )
        let loserRequest = try serviceAdvance(
            current: initial,
            candidate: loser,
            operationID: serviceBytes32(0x82),
            nonce: serviceBytes32(0x72)
        )
        let winnerStore = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        _ = try harness.core.handle(
            winnerRequest,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: winnerStore.transactionalRead,
            commit: winnerStore.commit
        )
        var readCount = 0
        var losingPlans: [DurableRemoteWitnessCommitPlanV1] = []

        let rejected = try harness.core.handle(
            loserRequest,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x92),
            clock: ScriptedServiceClock(
                [101, 101, 102, 102, 102]
            ).read,
            sign: harness.signer.provider,
            transactionalRead: { operationID in
                defer { readCount += 1 }
                if readCount == 0 {
                    return serviceSnapshot(
                        identity: harness.identity,
                        current: initial,
                        acceptedOperationCount: 0
                    )
                }
                return winnerStore.transactionalRead(
                    operationID: operationID
                )
            },
            commit: { plan in
                losingPlans.append(plan)
                return .definitiveCASLoss
            }
        )

        XCTAssertFalse(rejected.accepted)
        XCTAssertEqual(rejected.checkpoint, winner)
        XCTAssertEqual(winnerStore.current, winner)
        XCTAssertNil(
            winnerStore.operations[loserRequest.operationID]
        )
        XCTAssertEqual(readCount, 3)
        XCTAssertEqual(losingPlans.count, 1)
    }

    func testExactDelayedRetrySurvivesLaterAdvanceButDriftStops()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        let original = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        let later = try serviceCheckpoint(
            sequence: 3,
            previous: candidate.canonicalSHA256(),
            lastByte: 0x51
        )
        store.current = later
        store.acceptedOperationCount = 2

        let retry = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x92),
            clock: ScriptedServiceClock([110]).read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        XCTAssertEqual(retry, original)
        XCTAssertEqual(retry.checkpoint, candidate)

        let drifted = try serviceAdvance(
            current: initial,
            candidate: candidate,
            operationID: request.operationID,
            nonce: serviceBytes32(0x72)
        )
        XCTAssertThrowsError(
            try harness.core.handle(
                drifted,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x93),
                clock: ScriptedServiceClock([111]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
    }

    func testInitialRetryStopsForForkedCurrentState()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        _ = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        store.current = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x51
        )

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x92),
                clock: ScriptedServiceClock([110]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.commitPlans.count, 1)
    }

    func testInitialRetryStopsForDirectAndMultiStepDivergentForks()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        _ = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )

        let divergentDirectSuccessor = try serviceCheckpoint(
            sequence: 3,
            previous: serviceBytes32(0x99),
            lastByte: 0x51
        )
        store.current = divergentDirectSuccessor
        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x92),
                clock: ScriptedServiceClock([110]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )

        store.current = try serviceCheckpoint(
            sequence: 4,
            previous:
                divergentDirectSuccessor.canonicalSHA256(),
            lastByte: 0x61
        )
        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x93),
                clock: ScriptedServiceClock([111]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.commitPlans.count, 1)
    }

    func testExpiredDelayedRetryGetsFreshReceiptWithoutWrite()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        let original = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        let commitCount = store.commitPlans.count

        let refreshed = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x92),
            clock: ScriptedServiceClock(
                [131, 131, 131, 131]
            )
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )

        XCTAssertNotEqual(refreshed, original)
        XCTAssertEqual(refreshed.checkpoint, candidate)
        XCTAssertEqual(refreshed.issuedAtUnixSeconds, 131)
        XCTAssertEqual(store.commitPlans.count, commitCount)
        XCTAssertEqual(
            store.operations[request.operationID]?
                .immutableInitialReceipt,
            original
        )
    }

    func testExpiredRetryRevalidatesDurableOperationAfterSigning()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        _ = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        let durableOperation = try XCTUnwrap(
            store.operations[request.operationID]
        )
        let commitCount = store.commitPlans.count
        var readCount = 0

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x92),
                clock: ScriptedServiceClock([131, 131, 131])
                    .read,
                sign: harness.signer.provider,
                transactionalRead: { _ in
                    defer { readCount += 1 }
                    if readCount == 0 {
                        return serviceSnapshot(
                            identity: harness.identity,
                            current: candidate,
                            acceptedOperationCount: 1,
                            operation: durableOperation
                        )
                    }
                    return serviceSnapshot(
                        identity: harness.identity,
                        current: initial,
                        acceptedOperationCount: 0
                    )
                },
                commit: store.commit
            )
        )
        XCTAssertEqual(readCount, 2)
        XCTAssertEqual(store.commitPlans.count, commitCount)
    }

    func testCommitCanPersistButExpiredResponseStopsUntilRetry()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100, 100, 131])
                    .read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.current, candidate)
        XCTAssertNotNil(store.operations[request.operationID])

        let refreshed = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x92),
            clock: ScriptedServiceClock(
                [132, 132, 132, 132]
            )
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        XCTAssertEqual(refreshed.issuedAtUnixSeconds, 132)
        XCTAssertEqual(refreshed.checkpoint, candidate)
    }

    func testSlowSignerAndClockRollbackStopBeforeCommit()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )

        for values: [UInt64] in [[100, 131], [100, 99]] {
            let store = FakeDurableWitnessStore(
                identity: harness.identity,
                current: initial
            )
            XCTAssertThrowsError(
                try harness.core.handle(
                    request,
                    callerRole: .advanceWriter,
                    exactAttemptID: serviceBytes32(0x91),
                    clock: ScriptedServiceClock(values).read,
                    sign: harness.signer.provider,
                    transactionalRead: store.transactionalRead,
                    commit: store.commit
                )
            )
            XCTAssertEqual(store.current, initial)
            XCTAssertTrue(store.commitPlans.isEmpty)
        }
    }

    func testClockRollbackAfterCommitStopsTheResponse()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x91),
                clock: ScriptedServiceClock([100, 129, 101])
                    .read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.current, candidate)
        XCTAssertNotNil(store.operations[request.operationID])
    }

    func testClockRollbackWhileRefreshingExpiredReceiptStops()
        throws
    {
        let harness = try ServiceHarness()
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: initial
        )
        _ = try harness.core.handle(
            request,
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        let commitCount = store.commitPlans.count

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x92),
                clock: ScriptedServiceClock([131, 100])
                    .read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.commitPlans.count, commitCount)

        XCTAssertThrowsError(
            try harness.core.handle(
                request,
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x93),
                clock: ScriptedServiceClock(
                    [131, 131, 131, 130]
                )
                    .read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )
        XCTAssertEqual(store.commitPlans.count, commitCount)
    }

    func testSequenceAndOperationCapacityBoundaries()
        throws
    {
        let harness = try ServiceHarness()
        let at4095 = try serviceCheckpoint(
            sequence: 4_095,
            previous: serviceBytes32(0x31),
            lastByte: 0x41
        )
        let at4096 = try serviceCheckpoint(
            sequence: 4_096,
            previous: at4095.canonicalSHA256(),
            lastByte: 0x51
        )
        let store = FakeDurableWitnessStore(
            identity: harness.identity,
            current: at4095,
            acceptedOperationCount: 4_095
        )
        let accepted = try harness.core.handle(
            serviceAdvance(
                current: at4095,
                candidate: at4096
            ),
            callerRole: .advanceWriter,
            exactAttemptID: serviceBytes32(0x91),
            clock: ScriptedServiceClock([100, 100, 100])
                .read,
            sign: harness.signer.provider,
            transactionalRead: store.transactionalRead,
            commit: store.commit
        )
        XCTAssertTrue(accepted.accepted)

        let at4097 = try serviceCheckpoint(
            sequence: 4_097,
            previous: at4096.canonicalSHA256(),
            lastByte: 0x61
        )
        XCTAssertThrowsError(
            try harness.core.handle(
                serviceAdvance(
                    current: at4096,
                    candidate: at4097,
                    operationID: serviceBytes32(0x82),
                    nonce: serviceBytes32(0x72)
                ),
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x92),
                clock: ScriptedServiceClock([101]).read,
                sign: harness.signer.provider,
                transactionalRead: store.transactionalRead,
                commit: store.commit
            )
        )

        let fullStore = FakeDurableWitnessStore(
            identity: harness.identity,
            current: at4095,
            acceptedOperationCount: 4_096
        )
        XCTAssertThrowsError(
            try harness.core.handle(
                serviceAdvance(
                    current: at4095,
                    candidate: at4096,
                    operationID: serviceBytes32(0x83),
                    nonce: serviceBytes32(0x73)
                ),
                callerRole: .advanceWriter,
                exactAttemptID: serviceBytes32(0x93),
                clock: ScriptedServiceClock([102]).read,
                sign: harness.signer.provider,
                transactionalRead:
                    fullStore.transactionalRead,
                commit: fullStore.commit
            )
        )
    }

    func testWrongSignerAliasedIdentityAndEndpointGenerationReuseStop()
        throws
    {
        let key = Curve25519.Signing.PrivateKey()
        let otherKey = Curve25519.Signing.PrivateKey()
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let identity =
            try DurableRemoteWitnessDeploymentIdentityV1(
                witnessID: serviceWitnessID,
                endpointID: serviceEndpointID,
                witnessSignerKeyID: keyID,
                storeGenerationID: serviceStoreGenerationID
            )
        XCTAssertThrowsError(
            try DurableRemoteWitnessServiceCoreV1(
                deploymentIdentity: identity,
                witnessSignerPublicKeyRawRepresentation:
                    Array(otherKey.publicKey.rawRepresentation)
            )
        )
        XCTAssertThrowsError(
            try DurableRemoteWitnessDeploymentIdentityV1(
                witnessID: serviceWitnessID,
                endpointID: serviceWitnessID,
                witnessSignerKeyID: keyID,
                storeGenerationID: serviceStoreGenerationID
            )
        )
        XCTAssertThrowsError(
            try DurableRemoteWitnessDeploymentIdentityV1(
                witnessID: serviceWitnessID,
                endpointID: serviceEndpointID,
                witnessSignerKeyID: keyID,
                storeGenerationID: serviceBytes32(0x67)
            )
        )

        let core = try DurableRemoteWitnessServiceCoreV1(
            deploymentIdentity: identity,
            witnessSignerPublicKeyRawRepresentation:
                Array(key.publicKey.rawRepresentation)
        )
        let signer = CountingServiceSigner(key)
        let initial = try serviceCheckpoint(
            sequence: 1,
            lastByte: 0x31
        )
        let candidate = try serviceCheckpoint(
            sequence: 2,
            previous: initial.canonicalSHA256(),
            lastByte: 0x41
        )
        let request = try serviceAdvance(
            current: initial,
            candidate: candidate
        )
        let store = FakeDurableWitnessStore(
            identity: identity,
            current: initial
        )
        for aliasedAttemptID in [
            request.expectedCheckpointSHA256,
            candidate.canonicalSHA256(),
            request.canonicalSHA256(),
        ] {
            XCTAssertThrowsError(
                try core.handle(
                    request,
                    callerRole: .advanceWriter,
                    exactAttemptID: aliasedAttemptID,
                    clock: ScriptedServiceClock([]).read,
                    sign: signer.provider,
                    transactionalRead:
                        store.transactionalRead,
                    commit: store.commit
                )
            )
        }
        XCTAssertTrue(
            store.transactionalReadOperationIDs.isEmpty
        )
        XCTAssertTrue(store.commitPlans.isEmpty)
        XCTAssertEqual(signer.callCount, 0)
    }
}
