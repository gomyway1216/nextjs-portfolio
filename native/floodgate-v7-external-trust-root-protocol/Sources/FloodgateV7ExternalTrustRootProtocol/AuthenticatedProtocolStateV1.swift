public struct AuthenticatedProtocolStateSnapshotV1: Equatable, Sendable {
    public let activeEnrollment: EnrollmentRecord
    public let activeEnrollmentEnvelopeSHA256: CanonicalBytes32
    public let lastActivationEnvelopeSHA256: CanonicalBytes32
    public let authoritySignerKeyID: CanonicalBytes32
    public let enrollmentCount: Int
    public let activationCount: Int
}

public enum AuthenticatedProtocolStateV1 {
    public static func replay(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        authorityPublicKeyRawRepresentation: [UInt8],
        nowUnixSeconds: UInt64
    ) throws -> AuthenticatedProtocolStateSnapshotV1 {
        do {
            guard
                !enrollmentEnvelopes.isEmpty,
                !activationEnvelopes.isEmpty,
                nowUnixSeconds > 0
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let authoritySignerKeyID =
                try TrustRootSignatureV1.signerKeyID(
                    publicKeyRawRepresentation:
                        authorityPublicKeyRawRepresentation
                )
            var state = ProtocolState()
            var verifiedEnrollments:
                [CanonicalBytes32: (
                    record: EnrollmentRecord,
                    envelopeSHA256: CanonicalBytes32
                )] = [:]

            for envelope in enrollmentEnvelopes {
                guard envelope.signerKeyID == authoritySignerKeyID else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
                let record = try envelope.verifiedRecord(
                    publicKeyRawRepresentation:
                        authorityPublicKeyRawRepresentation
                )
                try state.registerEnrollment(record)
                verifiedEnrollments[record.enrollmentID] = (
                    record,
                    envelope.canonicalSHA256()
                )
            }

            var lastActivationEnvelopeSHA256:
                CanonicalBytes32?
            for envelope in activationEnvelopes {
                guard envelope.signerKeyID == authoritySignerKeyID else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
                let record = try envelope.verifiedRecord(
                    publicKeyRawRepresentation:
                        authorityPublicKeyRawRepresentation
                )
                try state.applyActivation(record)
                lastActivationEnvelopeSHA256 =
                    envelope.canonicalSHA256()
            }

            let snapshot = state.snapshot
            guard
                let activeEnrollmentID = snapshot.activeEnrollmentID,
                !snapshot.revokedEnrollmentIDs.contains(activeEnrollmentID),
                let active = verifiedEnrollments[activeEnrollmentID],
                nowUnixSeconds >= active.record.notBeforeUnixSeconds,
                nowUnixSeconds < active.record.expiresAtUnixSeconds,
                let lastActivationEnvelopeSHA256
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return AuthenticatedProtocolStateSnapshotV1(
                activeEnrollment: active.record,
                activeEnrollmentEnvelopeSHA256:
                    active.envelopeSHA256,
                lastActivationEnvelopeSHA256:
                    lastActivationEnvelopeSHA256,
                authoritySignerKeyID: authoritySignerKeyID,
                enrollmentCount: snapshot.enrollmentCount,
                activationCount: snapshot.activationCount
            )
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
