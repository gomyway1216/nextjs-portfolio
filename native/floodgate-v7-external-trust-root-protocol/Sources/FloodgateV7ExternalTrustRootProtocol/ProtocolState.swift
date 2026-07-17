public enum ProtocolStateError: Error, Equatable, Sendable {
    case duplicateEnrollment
    case duplicateActivation
    case invalidSequence
    case invalidPreviousActivationDigest
    case nonMonotonicIssuedAt
    case unknownEnrollment
    case revokedEnrollment
    case alreadyRevoked
    case alreadyActivated
    case rollbackTargetNeverActivated
    case enrollmentNotYetValid
    case enrollmentExpired
    case sameEnrollmentAlreadyActive
}

public struct ProtocolStateSnapshot: Equatable, Sendable {
    public let enrollmentCount: Int
    public let activationCount: Int
    public let activeEnrollmentID: CanonicalBytes32?
    public let revokedEnrollmentIDs: [CanonicalBytes32]
    public let lastSequence: UInt64
    public let lastActivationDigest: CanonicalBytes32?
}

public struct ProtocolState: Sendable {
    private var enrollments: [CanonicalBytes32: EnrollmentRecord] = [:]
    private var activationIDs: Set<CanonicalBytes32> = []
    private var activatedEnrollmentIDs: Set<CanonicalBytes32> = []
    private var revokedEnrollmentIDs: Set<CanonicalBytes32> = []
    private var activeEnrollmentID: CanonicalBytes32?
    private var lastSequence: UInt64 = 0
    private var lastActivationDigest: CanonicalBytes32?
    private var lastIssuedAtUnixSeconds: UInt64 = 0

    public init() {}

    public var snapshot: ProtocolStateSnapshot {
        ProtocolStateSnapshot(
            enrollmentCount: enrollments.count,
            activationCount: activationIDs.count,
            activeEnrollmentID: activeEnrollmentID,
            revokedEnrollmentIDs: revokedEnrollmentIDs.sorted(),
            lastSequence: lastSequence,
            lastActivationDigest: lastActivationDigest
        )
    }

    public mutating func registerEnrollment(_ record: EnrollmentRecord) throws {
        guard enrollments[record.enrollmentID] == nil else {
            throw ProtocolStateError.duplicateEnrollment
        }
        enrollments[record.enrollmentID] = record
    }

    public mutating func applyActivation(_ record: ActivationRecord) throws {
        guard !activationIDs.contains(record.activationID) else {
            throw ProtocolStateError.duplicateActivation
        }
        guard lastSequence < UInt64.max, record.sequence == lastSequence + 1 else {
            throw ProtocolStateError.invalidSequence
        }
        let expectedPreviousDigest = lastActivationDigest ?? .zero
        guard record.previousActivationDigest == expectedPreviousDigest else {
            throw ProtocolStateError.invalidPreviousActivationDigest
        }
        guard record.issuedAtUnixSeconds > lastIssuedAtUnixSeconds else {
            throw ProtocolStateError.nonMonotonicIssuedAt
        }
        guard let target = enrollments[record.targetEnrollmentID] else {
            throw ProtocolStateError.unknownEnrollment
        }

        switch record.action {
        case .activate:
            try validateUsable(target, at: record.issuedAtUnixSeconds)
            guard !activatedEnrollmentIDs.contains(target.enrollmentID) else {
                throw ProtocolStateError.alreadyActivated
            }
            activeEnrollmentID = target.enrollmentID
            activatedEnrollmentIDs.insert(target.enrollmentID)

        case .revoke:
            guard !revokedEnrollmentIDs.contains(target.enrollmentID) else {
                throw ProtocolStateError.alreadyRevoked
            }
            revokedEnrollmentIDs.insert(target.enrollmentID)
            if activeEnrollmentID == target.enrollmentID {
                activeEnrollmentID = nil
            }

        case .rollback:
            try validateUsable(target, at: record.issuedAtUnixSeconds)
            guard activeEnrollmentID != target.enrollmentID else {
                throw ProtocolStateError.sameEnrollmentAlreadyActive
            }
            guard activatedEnrollmentIDs.contains(target.enrollmentID) else {
                throw ProtocolStateError.rollbackTargetNeverActivated
            }
            activeEnrollmentID = target.enrollmentID
        }

        activationIDs.insert(record.activationID)
        lastSequence = record.sequence
        lastActivationDigest = record.canonicalSHA256()
        lastIssuedAtUnixSeconds = record.issuedAtUnixSeconds
    }

    private func validateUsable(
        _ enrollment: EnrollmentRecord,
        at issuedAtUnixSeconds: UInt64
    ) throws {
        guard !revokedEnrollmentIDs.contains(enrollment.enrollmentID) else {
            throw ProtocolStateError.revokedEnrollment
        }
        guard issuedAtUnixSeconds >= enrollment.notBeforeUnixSeconds else {
            throw ProtocolStateError.enrollmentNotYetValid
        }
        guard issuedAtUnixSeconds < enrollment.expiresAtUnixSeconds else {
            throw ProtocolStateError.enrollmentExpired
        }
    }
}
