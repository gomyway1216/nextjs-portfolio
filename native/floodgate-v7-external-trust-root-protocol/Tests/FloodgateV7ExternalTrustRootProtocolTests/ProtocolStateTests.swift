import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func stateBytes20(start: UInt8) -> CanonicalBytes20 {
    try! CanonicalBytes20(
        (0..<20).map { start &+ UInt8($0) }
    )
}

private func stateBytes32(start: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        (0..<32).map { start &+ UInt8($0) }
    )
}

private func makeEnrollment(
    idStart: UInt8,
    expectedUID: UInt32 = 501,
    notBefore: UInt64 = 100,
    expiresAt: UInt64 = 1_000
) throws -> EnrollmentRecord {
    try EnrollmentRecord(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        expectedUID: expectedUID,
        enrollmentID: stateBytes32(start: idStart),
        approvedCommit: stateBytes20(start: idStart &+ 1),
        approvedTree: stateBytes20(start: idStart &+ 2),
        sourceManifestSHA256: stateBytes32(start: idStart &+ 3),
        supervisorArtifactSHA256: stateBytes32(start: idStart &+ 4),
        childArtifactSHA256: stateBytes32(start: idStart &+ 5),
        runtimeClosureSHA256: stateBytes32(start: idStart &+ 6),
        notBeforeUnixSeconds: notBefore,
        expiresAtUnixSeconds: expiresAt
    )
}

private func makeActivation(
    action: ActivationAction,
    sequence: UInt64,
    activationIDStart: UInt8,
    target: CanonicalBytes32,
    previousDigest: CanonicalBytes32,
    issuedAt: UInt64
) throws -> ActivationRecord {
    try ActivationRecord(
        audience: .productionRecovery,
        action: action,
        sequence: sequence,
        activationID: stateBytes32(start: activationIDStart),
        targetEnrollmentID: target,
        previousActivationDigest: previousDigest,
        issuedAtUnixSeconds: issuedAt
    )
}

private func assertStateError(
    _ expected: ProtocolStateError,
    _ body: () throws -> Void,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertThrowsError(try body(), file: file, line: line) { error in
        XCTAssertEqual(
            error as? ProtocolStateError,
            expected,
            file: file,
            line: line
        )
    }
}

final class ProtocolStateTests: XCTestCase {
    func testEnrollmentRegistrationIsCreateOnly() throws {
        let enrollment = try makeEnrollment(idStart: 0x10)
        let conflictingEnrollment = try makeEnrollment(
            idStart: 0x10,
            expectedUID: 502,
            notBefore: 500
        )
        var state = ProtocolState()

        XCTAssertEqual(state.snapshot.enrollmentCount, 0)
        try state.registerEnrollment(enrollment)
        let registered = state.snapshot
        XCTAssertEqual(registered.enrollmentCount, 1)
        XCTAssertEqual(registered.activationCount, 0)
        XCTAssertNil(registered.activeEnrollmentID)
        XCTAssertEqual(registered.revokedEnrollmentIDs, [])
        XCTAssertEqual(registered.lastSequence, 0)
        XCTAssertNil(registered.lastActivationDigest)

        assertStateError(.duplicateEnrollment) {
            try state.registerEnrollment(conflictingEnrollment)
        }
        XCTAssertEqual(state.snapshot, registered)

        let activation = try makeActivation(
            action: .activate,
            sequence: 1,
            activationIDStart: 0x80,
            target: enrollment.enrollmentID,
            previousDigest: .zero,
            issuedAt: 110
        )
        try state.applyActivation(activation)
        XCTAssertEqual(state.snapshot.activeEnrollmentID, enrollment.enrollmentID)
    }

    func testActivationChainAndRollbackToAnyHistoricalEnrollment() throws {
        let enrollmentA = try makeEnrollment(idStart: 0x10)
        let enrollmentB = try makeEnrollment(idStart: 0x40)
        let enrollmentC = try makeEnrollment(idStart: 0x70)
        var state = ProtocolState()
        try state.registerEnrollment(enrollmentA)
        try state.registerEnrollment(enrollmentB)
        try state.registerEnrollment(enrollmentC)

        let activateA = try makeActivation(
            action: .activate,
            sequence: 1,
            activationIDStart: 0xa0,
            target: enrollmentA.enrollmentID,
            previousDigest: .zero,
            issuedAt: 110
        )
        try state.applyActivation(activateA)

        let activateB = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0xc0,
            target: enrollmentB.enrollmentID,
            previousDigest: activateA.canonicalSHA256(),
            issuedAt: 120
        )
        try state.applyActivation(activateB)

        let activateC = try makeActivation(
            action: .activate,
            sequence: 3,
            activationIDStart: 0xe0,
            target: enrollmentC.enrollmentID,
            previousDigest: activateB.canonicalSHA256(),
            issuedAt: 130
        )
        try state.applyActivation(activateC)

        let rollbackA = try makeActivation(
            action: .rollback,
            sequence: 4,
            activationIDStart: 0x01,
            target: enrollmentA.enrollmentID,
            previousDigest: activateC.canonicalSHA256(),
            issuedAt: 140
        )
        try state.applyActivation(rollbackA)

        XCTAssertEqual(state.snapshot.activeEnrollmentID, enrollmentA.enrollmentID)
        XCTAssertEqual(state.snapshot.activationCount, 4)
        XCTAssertEqual(state.snapshot.lastSequence, 4)
        XCTAssertEqual(
            state.snapshot.lastActivationDigest,
            rollbackA.canonicalSHA256()
        )

        let rollbackB = try makeActivation(
            action: .rollback,
            sequence: 5,
            activationIDStart: 0x22,
            target: enrollmentB.enrollmentID,
            previousDigest: rollbackA.canonicalSHA256(),
            issuedAt: 150
        )
        try state.applyActivation(rollbackB)
        XCTAssertEqual(state.snapshot.activeEnrollmentID, enrollmentB.enrollmentID)

        let rollbackCurrent = try makeActivation(
            action: .rollback,
            sequence: 6,
            activationIDStart: 0x42,
            target: enrollmentB.enrollmentID,
            previousDigest: rollbackB.canonicalSHA256(),
            issuedAt: 160
        )
        let beforeFailure = state.snapshot
        assertStateError(.sameEnrollmentAlreadyActive) {
            try state.applyActivation(rollbackCurrent)
        }
        XCTAssertEqual(state.snapshot, beforeFailure)
    }

    func testRegisteredEnrollmentMayBeRevokedOutsideValidityWithoutActivation() throws {
        let futureEnrollment = try makeEnrollment(
            idStart: 0x10,
            notBefore: 500,
            expiresAt: 1_000
        )
        let expiredEnrollment = try makeEnrollment(
            idStart: 0x40,
            notBefore: 1,
            expiresAt: 2
        )
        var state = ProtocolState()
        try state.registerEnrollment(futureEnrollment)
        try state.registerEnrollment(expiredEnrollment)

        let revokeFuture = try makeActivation(
            action: .revoke,
            sequence: 1,
            activationIDStart: 0x80,
            target: futureEnrollment.enrollmentID,
            previousDigest: .zero,
            issuedAt: 1
        )
        try state.applyActivation(revokeFuture)
        let revokeExpired = try makeActivation(
            action: .revoke,
            sequence: 2,
            activationIDStart: 0xa0,
            target: expiredEnrollment.enrollmentID,
            previousDigest: revokeFuture.canonicalSHA256(),
            issuedAt: 3
        )
        try state.applyActivation(revokeExpired)
        XCTAssertNil(state.snapshot.activeEnrollmentID)
        XCTAssertEqual(
            state.snapshot.revokedEnrollmentIDs,
            [futureEnrollment.enrollmentID, expiredEnrollment.enrollmentID].sorted()
        )

        let activate = try makeActivation(
            action: .activate,
            sequence: 3,
            activationIDStart: 0xc0,
            target: futureEnrollment.enrollmentID,
            previousDigest: revokeExpired.canonicalSHA256(),
            issuedAt: 600
        )
        let beforeFailure = state.snapshot
        assertStateError(.revokedEnrollment) {
            try state.applyActivation(activate)
        }
        XCTAssertEqual(state.snapshot, beforeFailure)
    }

    func testSequenceDigestTimeIdentityAndTargetFailuresAreAtomic() throws {
        let enrollmentA = try makeEnrollment(idStart: 0x10)
        let enrollmentB = try makeEnrollment(idStart: 0x40)
        var state = ProtocolState()
        try state.registerEnrollment(enrollmentA)
        try state.registerEnrollment(enrollmentB)
        let initial = state.snapshot

        let gap = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0x80,
            target: enrollmentA.enrollmentID,
            previousDigest: .zero,
            issuedAt: 120
        )
        assertStateError(.invalidSequence) {
            try state.applyActivation(gap)
        }
        XCTAssertEqual(state.snapshot, initial)

        let wrongInitialDigest = try makeActivation(
            action: .activate,
            sequence: 1,
            activationIDStart: 0x81,
            target: enrollmentA.enrollmentID,
            previousDigest: stateBytes32(start: 0xf0),
            issuedAt: 119
        )
        assertStateError(.invalidPreviousActivationDigest) {
            try state.applyActivation(wrongInitialDigest)
        }
        XCTAssertEqual(state.snapshot, initial)

        let activateA = try makeActivation(
            action: .activate,
            sequence: 1,
            activationIDStart: 0x81,
            target: enrollmentA.enrollmentID,
            previousDigest: .zero,
            issuedAt: 110
        )
        try state.applyActivation(activateA)
        let afterFirst = state.snapshot

        let duplicateID = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0x81,
            target: enrollmentB.enrollmentID,
            previousDigest: activateA.canonicalSHA256(),
            issuedAt: 120
        )
        assertStateError(.duplicateActivation) {
            try state.applyActivation(duplicateID)
        }
        XCTAssertEqual(state.snapshot, afterFirst)

        let wrongDigest = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0xa0,
            target: enrollmentB.enrollmentID,
            previousDigest: .zero,
            issuedAt: 120
        )
        assertStateError(.invalidPreviousActivationDigest) {
            try state.applyActivation(wrongDigest)
        }
        XCTAssertEqual(state.snapshot, afterFirst)

        let nonMonotonic = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0xa1,
            target: enrollmentB.enrollmentID,
            previousDigest: activateA.canonicalSHA256(),
            issuedAt: 110
        )
        assertStateError(.nonMonotonicIssuedAt) {
            try state.applyActivation(nonMonotonic)
        }
        XCTAssertEqual(state.snapshot, afterFirst)

        let unknown = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0xa2,
            target: stateBytes32(start: 0xf0),
            previousDigest: activateA.canonicalSHA256(),
            issuedAt: 115
        )
        assertStateError(.unknownEnrollment) {
            try state.applyActivation(unknown)
        }
        XCTAssertEqual(state.snapshot, afterFirst)

        let activateB = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0xa3,
            target: enrollmentB.enrollmentID,
            previousDigest: activateA.canonicalSHA256(),
            issuedAt: 115
        )
        try state.applyActivation(activateB)
        XCTAssertEqual(state.snapshot.activeEnrollmentID, enrollmentB.enrollmentID)
        XCTAssertEqual(state.snapshot.lastSequence, 2)
    }

    func testValidityAndPreviouslyActivatedRulesAreFailClosedAndAtomic() throws {
        let enrollmentA = try makeEnrollment(
            idStart: 0x10,
            notBefore: 200,
            expiresAt: 300
        )
        let enrollmentB = try makeEnrollment(idStart: 0x40)
        var state = ProtocolState()
        try state.registerEnrollment(enrollmentA)
        try state.registerEnrollment(enrollmentB)

        let tooEarly = try makeActivation(
            action: .activate,
            sequence: 1,
            activationIDStart: 0x80,
            target: enrollmentA.enrollmentID,
            previousDigest: .zero,
            issuedAt: 199
        )
        let initial = state.snapshot
        assertStateError(.enrollmentNotYetValid) {
            try state.applyActivation(tooEarly)
        }
        XCTAssertEqual(state.snapshot, initial)

        let expired = try makeActivation(
            action: .activate,
            sequence: 1,
            activationIDStart: 0x81,
            target: enrollmentA.enrollmentID,
            previousDigest: .zero,
            issuedAt: 300
        )
        assertStateError(.enrollmentExpired) {
            try state.applyActivation(expired)
        }
        XCTAssertEqual(state.snapshot, initial)

        let rollbackNeverActivated = try makeActivation(
            action: .rollback,
            sequence: 1,
            activationIDStart: 0x82,
            target: enrollmentB.enrollmentID,
            previousDigest: .zero,
            issuedAt: 150
        )
        assertStateError(.rollbackTargetNeverActivated) {
            try state.applyActivation(rollbackNeverActivated)
        }
        XCTAssertEqual(state.snapshot, initial)

        let activateA = try makeActivation(
            action: .activate,
            sequence: 1,
            activationIDStart: 0x83,
            target: enrollmentA.enrollmentID,
            previousDigest: .zero,
            issuedAt: 200
        )
        try state.applyActivation(activateA)

        let activateAAgain = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0xa0,
            target: enrollmentA.enrollmentID,
            previousDigest: activateA.canonicalSHA256(),
            issuedAt: 201
        )
        let afterActivate = state.snapshot
        assertStateError(.alreadyActivated) {
            try state.applyActivation(activateAAgain)
        }
        XCTAssertEqual(state.snapshot, afterActivate)

        let activateB = try makeActivation(
            action: .activate,
            sequence: 2,
            activationIDStart: 0xa1,
            target: enrollmentB.enrollmentID,
            previousDigest: activateA.canonicalSHA256(),
            issuedAt: 250
        )
        try state.applyActivation(activateB)
        XCTAssertEqual(state.snapshot.activeEnrollmentID, enrollmentB.enrollmentID)

        let rollbackExpired = try makeActivation(
            action: .rollback,
            sequence: 3,
            activationIDStart: 0xa2,
            target: enrollmentA.enrollmentID,
            previousDigest: activateB.canonicalSHA256(),
            issuedAt: 300
        )
        let afterActivateB = state.snapshot
        assertStateError(.enrollmentExpired) {
            try state.applyActivation(rollbackExpired)
        }
        XCTAssertEqual(state.snapshot, afterActivateB)

        let revokeA = try makeActivation(
            action: .revoke,
            sequence: 3,
            activationIDStart: 0xa3,
            target: enrollmentA.enrollmentID,
            previousDigest: activateB.canonicalSHA256(),
            issuedAt: 301
        )
        try state.applyActivation(revokeA)
        XCTAssertEqual(state.snapshot.activeEnrollmentID, enrollmentB.enrollmentID)

        let revokeAgain = try makeActivation(
            action: .revoke,
            sequence: 4,
            activationIDStart: 0xa4,
            target: enrollmentA.enrollmentID,
            previousDigest: revokeA.canonicalSHA256(),
            issuedAt: 302
        )
        let afterRevoke = state.snapshot
        assertStateError(.alreadyRevoked) {
            try state.applyActivation(revokeAgain)
        }
        XCTAssertEqual(state.snapshot, afterRevoke)

        let rollbackRevoked = try makeActivation(
            action: .rollback,
            sequence: 4,
            activationIDStart: 0xa5,
            target: enrollmentA.enrollmentID,
            previousDigest: revokeA.canonicalSHA256(),
            issuedAt: 303
        )
        assertStateError(.revokedEnrollment) {
            try state.applyActivation(rollbackRevoked)
        }
        XCTAssertEqual(state.snapshot, afterRevoke)
    }
}
