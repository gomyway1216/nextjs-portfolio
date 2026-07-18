import Foundation

private let maximumHandoffLifetimeSeconds: UInt64 = 30
private let maximumHandoffLifetimeNanoseconds: UInt64 =
    30_000_000_000

private func validHandoffWindow(
    issuedAtUnixSeconds: UInt64,
    expiresAtUnixSeconds: UInt64
) -> Bool {
    guard
        issuedAtUnixSeconds > 0,
        issuedAtUnixSeconds < expiresAtUnixSeconds
    else {
        return false
    }
    let (maximumExpiry, overflow) =
        issuedAtUnixSeconds.addingReportingOverflow(
            maximumHandoffLifetimeSeconds
        )
    return !overflow && expiresAtUnixSeconds <= maximumExpiry
}

private func validMonotonicHandoffWindow(
    issuedAtNanoseconds: UInt64,
    expiresAtNanoseconds: UInt64
) -> Bool {
    guard
        issuedAtNanoseconds > 0,
        issuedAtNanoseconds < expiresAtNanoseconds
    else {
        return false
    }
    let (maximumExpiry, overflow) =
        issuedAtNanoseconds.addingReportingOverflow(
            maximumHandoffLifetimeNanoseconds
        )
    return !overflow && expiresAtNanoseconds <= maximumExpiry
}

private func assertCurrentHandoffWindow(
    issuedAtUnixSeconds: UInt64,
    expiresAtUnixSeconds: UInt64,
    nowUnixSeconds: UInt64
) throws {
    guard
        validHandoffWindow(
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds
        ),
        nowUnixSeconds >= issuedAtUnixSeconds,
        nowUnixSeconds < expiresAtUnixSeconds
    else {
        throw CanonicalRecordError.invalidCanonicalRecord
    }
}

public struct SupervisorChallengeV1: Equatable, Sendable {
    public static let canonicalByteCount = 437
    public static let maximumLifetimeSeconds =
        maximumHandoffLifetimeSeconds
    public static let maximumLifetimeNanoseconds =
        maximumHandoffLifetimeNanoseconds

    private static let magic = Array("FGV7SCH1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let signatureAlgorithm: UInt8 = 1

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let challengeID: CanonicalBytes32
    public let nonce: CanonicalBytes32
    public let enrollmentID: CanonicalBytes32
    public let activationDigest: CanonicalBytes32
    public let activationHeadSHA256: CanonicalBytes32
    public let sourceManifestSHA256: CanonicalBytes32
    public let targetProcessIdentitySHA256: CanonicalBytes32
    public let supervisorProcessIdentitySHA256: CanonicalBytes32
    public let verifierAnonymousFDChannelBindingSHA256: CanonicalBytes32
    public let signerKeyID: CanonicalBytes32
    public let targetProcessID: UInt32
    public let expectedUID: UInt32
    public let issuedAtUnixSeconds: UInt64
    public let expiresAtUnixSeconds: UInt64
    public let monotonicIssuedAtNanoseconds: UInt64
    public let monotonicExpiresAtNanoseconds: UInt64
    public let signature: CanonicalBytes64

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        challengeID: CanonicalBytes32,
        nonce: CanonicalBytes32,
        enrollmentID: CanonicalBytes32,
        activationDigest: CanonicalBytes32,
        activationHeadSHA256: CanonicalBytes32,
        sourceManifestSHA256: CanonicalBytes32,
        targetProcessIdentitySHA256: CanonicalBytes32,
        supervisorProcessIdentitySHA256: CanonicalBytes32,
        verifierAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        signerKeyID: CanonicalBytes32,
        targetProcessID: UInt32,
        expectedUID: UInt32,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64,
        monotonicIssuedAtNanoseconds: UInt64,
        monotonicExpiresAtNanoseconds: UInt64,
        signature: CanonicalBytes64
    ) throws {
        let requiredDigests = [
            challengeID,
            nonce,
            enrollmentID,
            activationDigest,
            activationHeadSHA256,
            sourceManifestSHA256,
            targetProcessIdentitySHA256,
            supervisorProcessIdentitySHA256,
            verifierAnonymousFDChannelBindingSHA256,
            signerKeyID,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            challengeID != nonce,
            targetProcessID > 0,
            expectedUID > 0,
            validHandoffWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            ),
            validMonotonicHandoffWindow(
                issuedAtNanoseconds: monotonicIssuedAtNanoseconds,
                expiresAtNanoseconds:
                    monotonicExpiresAtNanoseconds
            ),
            !signature.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.challengeID = challengeID
        self.nonce = nonce
        self.enrollmentID = enrollmentID
        self.activationDigest = activationDigest
        self.activationHeadSHA256 = activationHeadSHA256
        self.sourceManifestSHA256 = sourceManifestSHA256
        self.targetProcessIdentitySHA256 =
            targetProcessIdentitySHA256
        self.supervisorProcessIdentitySHA256 =
            supervisorProcessIdentitySHA256
        self.verifierAnonymousFDChannelBindingSHA256 =
            verifierAnonymousFDChannelBindingSHA256
        self.signerKeyID = signerKeyID
        self.targetProcessID = targetProcessID
        self.expectedUID = expectedUID
        self.issuedAtUnixSeconds = issuedAtUnixSeconds
        self.expiresAtUnixSeconds = expiresAtUnixSeconds
        self.monotonicIssuedAtNanoseconds =
            monotonicIssuedAtNanoseconds
        self.monotonicExpiresAtNanoseconds =
            monotonicExpiresAtNanoseconds
        self.signature = signature
    }

    public static func signaturePayload(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        challengeID: CanonicalBytes32,
        nonce: CanonicalBytes32,
        enrollmentID: CanonicalBytes32,
        activationDigest: CanonicalBytes32,
        activationHeadSHA256: CanonicalBytes32,
        sourceManifestSHA256: CanonicalBytes32,
        targetProcessIdentitySHA256: CanonicalBytes32,
        supervisorProcessIdentitySHA256: CanonicalBytes32,
        verifierAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        signerKeyID: CanonicalBytes32,
        targetProcessID: UInt32,
        expectedUID: UInt32,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64,
        monotonicIssuedAtNanoseconds: UInt64,
        monotonicExpiresAtNanoseconds: UInt64
    ) throws -> [UInt8] {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            targetProcessID > 0,
            expectedUID > 0,
            validHandoffWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            ),
            validMonotonicHandoffWindow(
                issuedAtNanoseconds: monotonicIssuedAtNanoseconds,
                expiresAtNanoseconds:
                    monotonicExpiresAtNanoseconds
            )
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        var encoder = CanonicalEncoder()
        encoder.append(magic)
        encoder.append(schemaVersion)
        encoder.append(reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(signatureAlgorithm)
        encoder.append(challengeID.bytes)
        encoder.append(nonce.bytes)
        encoder.append(enrollmentID.bytes)
        encoder.append(activationDigest.bytes)
        encoder.append(activationHeadSHA256.bytes)
        encoder.append(sourceManifestSHA256.bytes)
        encoder.append(targetProcessIdentitySHA256.bytes)
        encoder.append(supervisorProcessIdentitySHA256.bytes)
        encoder.append(verifierAnonymousFDChannelBindingSHA256.bytes)
        encoder.append(signerKeyID.bytes)
        encoder.append(targetProcessID)
        encoder.append(expectedUID)
        encoder.append(issuedAtUnixSeconds)
        encoder.append(expiresAtUnixSeconds)
        encoder.append(monotonicIssuedAtNanoseconds)
        encoder.append(monotonicExpiresAtNanoseconds)
        precondition(
            encoder.bytes.count
                == canonicalByteCount - TrustRootSignatureV1.signatureByteCount
        )
        return encoder.bytes
    }

    public func signaturePayload() -> [UInt8] {
        try! Self.signaturePayload(
            audience: audience,
            purpose: purpose,
            challengeID: challengeID,
            nonce: nonce,
            enrollmentID: enrollmentID,
            activationDigest: activationDigest,
            activationHeadSHA256: activationHeadSHA256,
            sourceManifestSHA256: sourceManifestSHA256,
            targetProcessIdentitySHA256:
                targetProcessIdentitySHA256,
            supervisorProcessIdentitySHA256:
                supervisorProcessIdentitySHA256,
            verifierAnonymousFDChannelBindingSHA256:
                verifierAnonymousFDChannelBindingSHA256,
            signerKeyID: signerKeyID,
            targetProcessID: targetProcessID,
            expectedUID: expectedUID,
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            monotonicIssuedAtNanoseconds:
                monotonicIssuedAtNanoseconds,
            monotonicExpiresAtNanoseconds:
                monotonicExpiresAtNanoseconds
        )
    }

    public func canonicalBytes() -> [UInt8] {
        signaturePayload() + signature.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public func verify(
        publicKeyRawRepresentation: [UInt8],
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64
    ) throws {
        try assertCurrentHandoffWindow(
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            nowUnixSeconds: nowUnixSeconds
        )
        try TrustRootSignatureV1.verify(
            signature: signature,
            payload: signaturePayload(),
            signerKeyID: signerKeyID,
            publicKeyRawRepresentation: publicKeyRawRepresentation
        )
        guard
            nowMonotonicNanoseconds
                >= monotonicIssuedAtNanoseconds,
            nowMonotonicNanoseconds
                < monotonicExpiresAtNanoseconds
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }

    public static func decodeCanonical(_ bytes: [UInt8]) throws -> Self {
        do {
            guard bytes.count == canonicalByteCount else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            var decoder = CanonicalDecoder(bytes)
            guard
                try decoder.readBytes(count: magic.count) == magic,
                try decoder.readByte() == schemaVersion,
                try decoder.readByte() == reserved,
                let audience = TrustRootAudience(
                    rawValue: try decoder.readByte()
                ),
                let purpose = TrustRootPurpose(
                    rawValue: try decoder.readByte()
                ),
                try decoder.readByte() == signatureAlgorithm
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let record = try Self(
                audience: audience,
                purpose: purpose,
                challengeID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                nonce: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                enrollmentID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                activationDigest: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                activationHeadSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                sourceManifestSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                targetProcessIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorProcessIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierAnonymousFDChannelBindingSHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                signerKeyID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                targetProcessID: try decoder.readUInt32(),
                expectedUID: try decoder.readUInt32(),
                issuedAtUnixSeconds: try decoder.readUInt64(),
                expiresAtUnixSeconds: try decoder.readUInt64(),
                monotonicIssuedAtNanoseconds:
                    try decoder.readUInt64(),
                monotonicExpiresAtNanoseconds:
                    try decoder.readUInt64(),
                signature: CanonicalBytes64(
                    try decoder.readBytes(count: 64)
                )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return record
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct VerifierReceiptV1: Equatable, Sendable {
    public static let canonicalByteCount = 461
    public static let maximumLifetimeSeconds =
        maximumHandoffLifetimeSeconds

    private static let magic = Array("FGV7VRC1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let signatureAlgorithm: UInt8 = 1

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let receiptID: CanonicalBytes32
    public let challengeSHA256: CanonicalBytes32
    public let enrollmentID: CanonicalBytes32
    public let activationDigest: CanonicalBytes32
    public let sourceManifestSHA256: CanonicalBytes32
    public let repositoryObservationSHA256: CanonicalBytes32
    public let approvedCommit: CanonicalBytes20
    public let approvedTree: CanonicalBytes20
    public let targetProcessIdentitySHA256: CanonicalBytes32
    public let verifierArtifactSHA256: CanonicalBytes32
    public let verifierProcessIdentitySHA256: CanonicalBytes32
    public let signerKeyID: CanonicalBytes32
    public let targetProcessID: UInt32
    public let expectedUID: UInt32
    public let issuedAtUnixSeconds: UInt64
    public let expiresAtUnixSeconds: UInt64
    public let signature: CanonicalBytes64

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        receiptID: CanonicalBytes32,
        challengeSHA256: CanonicalBytes32,
        enrollmentID: CanonicalBytes32,
        activationDigest: CanonicalBytes32,
        sourceManifestSHA256: CanonicalBytes32,
        repositoryObservationSHA256: CanonicalBytes32,
        approvedCommit: CanonicalBytes20,
        approvedTree: CanonicalBytes20,
        targetProcessIdentitySHA256: CanonicalBytes32,
        verifierArtifactSHA256: CanonicalBytes32,
        verifierProcessIdentitySHA256: CanonicalBytes32,
        signerKeyID: CanonicalBytes32,
        targetProcessID: UInt32,
        expectedUID: UInt32,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64,
        signature: CanonicalBytes64
    ) throws {
        let requiredDigests = [
            receiptID,
            challengeSHA256,
            enrollmentID,
            activationDigest,
            sourceManifestSHA256,
            repositoryObservationSHA256,
            targetProcessIdentitySHA256,
            verifierArtifactSHA256,
            verifierProcessIdentitySHA256,
            signerKeyID,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            !approvedCommit.isAllZero,
            !approvedTree.isAllZero,
            targetProcessID > 0,
            expectedUID > 0,
            validHandoffWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            ),
            !signature.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.receiptID = receiptID
        self.challengeSHA256 = challengeSHA256
        self.enrollmentID = enrollmentID
        self.activationDigest = activationDigest
        self.sourceManifestSHA256 = sourceManifestSHA256
        self.repositoryObservationSHA256 =
            repositoryObservationSHA256
        self.approvedCommit = approvedCommit
        self.approvedTree = approvedTree
        self.targetProcessIdentitySHA256 =
            targetProcessIdentitySHA256
        self.verifierArtifactSHA256 = verifierArtifactSHA256
        self.verifierProcessIdentitySHA256 =
            verifierProcessIdentitySHA256
        self.signerKeyID = signerKeyID
        self.targetProcessID = targetProcessID
        self.expectedUID = expectedUID
        self.issuedAtUnixSeconds = issuedAtUnixSeconds
        self.expiresAtUnixSeconds = expiresAtUnixSeconds
        self.signature = signature
    }

    public static func signaturePayload(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        receiptID: CanonicalBytes32,
        challengeSHA256: CanonicalBytes32,
        enrollmentID: CanonicalBytes32,
        activationDigest: CanonicalBytes32,
        sourceManifestSHA256: CanonicalBytes32,
        repositoryObservationSHA256: CanonicalBytes32,
        approvedCommit: CanonicalBytes20,
        approvedTree: CanonicalBytes20,
        targetProcessIdentitySHA256: CanonicalBytes32,
        verifierArtifactSHA256: CanonicalBytes32,
        verifierProcessIdentitySHA256: CanonicalBytes32,
        signerKeyID: CanonicalBytes32,
        targetProcessID: UInt32,
        expectedUID: UInt32,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64
    ) throws -> [UInt8] {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            targetProcessID > 0,
            expectedUID > 0,
            validHandoffWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            )
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        var encoder = CanonicalEncoder()
        encoder.append(magic)
        encoder.append(schemaVersion)
        encoder.append(reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(signatureAlgorithm)
        encoder.append(receiptID.bytes)
        encoder.append(challengeSHA256.bytes)
        encoder.append(enrollmentID.bytes)
        encoder.append(activationDigest.bytes)
        encoder.append(sourceManifestSHA256.bytes)
        encoder.append(repositoryObservationSHA256.bytes)
        encoder.append(approvedCommit.bytes)
        encoder.append(approvedTree.bytes)
        encoder.append(targetProcessIdentitySHA256.bytes)
        encoder.append(verifierArtifactSHA256.bytes)
        encoder.append(verifierProcessIdentitySHA256.bytes)
        encoder.append(signerKeyID.bytes)
        encoder.append(targetProcessID)
        encoder.append(expectedUID)
        encoder.append(issuedAtUnixSeconds)
        encoder.append(expiresAtUnixSeconds)
        precondition(
            encoder.bytes.count
                == canonicalByteCount - TrustRootSignatureV1.signatureByteCount
        )
        return encoder.bytes
    }

    public func signaturePayload() -> [UInt8] {
        try! Self.signaturePayload(
            audience: audience,
            purpose: purpose,
            receiptID: receiptID,
            challengeSHA256: challengeSHA256,
            enrollmentID: enrollmentID,
            activationDigest: activationDigest,
            sourceManifestSHA256: sourceManifestSHA256,
            repositoryObservationSHA256:
                repositoryObservationSHA256,
            approvedCommit: approvedCommit,
            approvedTree: approvedTree,
            targetProcessIdentitySHA256:
                targetProcessIdentitySHA256,
            verifierArtifactSHA256: verifierArtifactSHA256,
            verifierProcessIdentitySHA256:
                verifierProcessIdentitySHA256,
            signerKeyID: signerKeyID,
            targetProcessID: targetProcessID,
            expectedUID: expectedUID,
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds
        )
    }

    public func canonicalBytes() -> [UInt8] {
        signaturePayload() + signature.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    func verify(
        publicKeyRawRepresentation: [UInt8],
        challenge: SupervisorChallengeV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        expectedActivationHead: ExpectedActivationHeadV1,
        enrollment: EnrollmentRecord,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        nowUnixSeconds: UInt64
    ) throws {
        try assertCurrentHandoffWindow(
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            nowUnixSeconds: nowUnixSeconds
        )
        guard
            audience == challenge.audience,
            purpose == challenge.purpose,
            challengeSHA256 == challenge.canonicalSHA256(),
            enrollmentID == challenge.enrollmentID,
            activationDigest == challenge.activationDigest,
            sourceManifestSHA256 == challenge.sourceManifestSHA256,
            repositoryObservationSHA256
                == observation.canonicalSHA256(),
            targetProcessIdentitySHA256
                == observation.targetProcessIdentitySHA256,
            targetProcessIdentitySHA256
                == challenge.targetProcessIdentitySHA256,
            targetProcessID == observation.targetProcessID,
            targetProcessID == challenge.targetProcessID,
            targetProcessID == supervisorProcessIdentity.processID,
            targetProcessIdentitySHA256
                == supervisorProcessIdentity.canonicalSHA256(),
            expectedUID == challenge.expectedUID,
            expectedUID == observation.effectiveUID,
            challenge.signerKeyID
                == manifest.supervisorAttestationKeyID,
            signerKeyID != challenge.signerKeyID,
            signerKeyID == manifest.verifierAttestationKeyID,
            issuedAtUnixSeconds >= challenge.issuedAtUnixSeconds,
            expiresAtUnixSeconds <= challenge.expiresAtUnixSeconds,
            enrollment.enrollmentID == enrollmentID,
            enrollment.expectedUID == expectedUID,
            approvedCommit == enrollment.approvedCommit,
            approvedTree == enrollment.approvedTree,
            sourceManifestSHA256 == manifest.canonicalSHA256(),
            verifierArtifactSHA256
                == manifest.verifierArtifactSHA256,
            verifierProcessIdentitySHA256
                == verifierProcessIdentity.canonicalSHA256(),
            challenge.supervisorProcessIdentitySHA256
                == supervisorProcessIdentity.canonicalSHA256(),
            manifest.approvedCommit == approvedCommit,
            manifest.approvedTree == approvedTree
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        try manifest.validateEnrollment(enrollment)
        try manifest.validateRuntimeLaunchPolicy(runtimeLaunchPolicy)
        try expectedActivationHead.validateTranscriptActivation(
            challenge.activationDigest,
            expectedHeadSHA256: challenge.activationHeadSHA256,
            manifest: manifest
        )
        try observation.validate(
            manifest: manifest,
            enrollment: enrollment
        )
        try supervisorProcessIdentity.validateSupervisorAgainstManifest(
            manifest,
            expectedUID: enrollment.expectedUID
        )
        try verifierProcessIdentity.validateChildOf(
            supervisorProcessIdentity,
            expectedRole: .verifier,
            expectedExecutableSHA256:
                manifest.verifierArtifactSHA256,
            expectedCodeDirectorySHA256:
                manifest.verifierCodeDirectorySHA256,
            expectedDesignatedRequirementSHA256:
                manifest.verifierDesignatedRequirementSHA256,
            expectedHeldExecutableIdentitySHA256:
                manifest.verifierHeldExecutableIdentitySHA256,
            expectedAnonymousFDChannelBindingSHA256:
                challenge.verifierAnonymousFDChannelBindingSHA256
        )
        try TrustRootSignatureV1.verify(
            signature: signature,
            payload: signaturePayload(),
            signerKeyID: signerKeyID,
            publicKeyRawRepresentation: publicKeyRawRepresentation
        )
    }

    public static func decodeCanonical(_ bytes: [UInt8]) throws -> Self {
        do {
            guard bytes.count == canonicalByteCount else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            var decoder = CanonicalDecoder(bytes)
            guard
                try decoder.readBytes(count: magic.count) == magic,
                try decoder.readByte() == schemaVersion,
                try decoder.readByte() == reserved,
                let audience = TrustRootAudience(
                    rawValue: try decoder.readByte()
                ),
                let purpose = TrustRootPurpose(
                    rawValue: try decoder.readByte()
                ),
                try decoder.readByte() == signatureAlgorithm
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let record = try Self(
                audience: audience,
                purpose: purpose,
                receiptID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                challengeSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                enrollmentID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                activationDigest: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                sourceManifestSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                repositoryObservationSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                approvedCommit: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                approvedTree: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                targetProcessIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierArtifactSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierProcessIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                signerKeyID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                targetProcessID: try decoder.readUInt32(),
                expectedUID: try decoder.readUInt32(),
                issuedAtUnixSeconds: try decoder.readUInt64(),
                expiresAtUnixSeconds: try decoder.readUInt64(),
                signature: CanonicalBytes64(
                    try decoder.readBytes(count: 64)
                )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return record
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct OneShotAttestationV1: Equatable, Sendable {
    public static let canonicalByteCount = 461
    public static let maximumLifetimeSeconds =
        maximumHandoffLifetimeSeconds

    private static let magic = Array("FGV7OSA1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let signatureAlgorithm: UInt8 = 1

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let attestationID: CanonicalBytes32
    public let challengeSHA256: CanonicalBytes32
    public let receiptSHA256: CanonicalBytes32
    public let enrollmentID: CanonicalBytes32
    public let activationDigest: CanonicalBytes32
    public let sourceManifestSHA256: CanonicalBytes32
    public let approvedCommit: CanonicalBytes20
    public let approvedTree: CanonicalBytes20
    public let childProcessIdentitySHA256: CanonicalBytes32
    public let supervisorProcessIdentitySHA256: CanonicalBytes32
    public let nonce: CanonicalBytes32
    public let signerKeyID: CanonicalBytes32
    public let childProcessID: UInt32
    public let expectedUID: UInt32
    public let issuedAtUnixSeconds: UInt64
    public let expiresAtUnixSeconds: UInt64
    public let signature: CanonicalBytes64

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        attestationID: CanonicalBytes32,
        challengeSHA256: CanonicalBytes32,
        receiptSHA256: CanonicalBytes32,
        enrollmentID: CanonicalBytes32,
        activationDigest: CanonicalBytes32,
        sourceManifestSHA256: CanonicalBytes32,
        approvedCommit: CanonicalBytes20,
        approvedTree: CanonicalBytes20,
        childProcessIdentitySHA256: CanonicalBytes32,
        supervisorProcessIdentitySHA256: CanonicalBytes32,
        nonce: CanonicalBytes32,
        signerKeyID: CanonicalBytes32,
        childProcessID: UInt32,
        expectedUID: UInt32,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64,
        signature: CanonicalBytes64
    ) throws {
        let requiredDigests = [
            attestationID,
            challengeSHA256,
            receiptSHA256,
            enrollmentID,
            activationDigest,
            sourceManifestSHA256,
            childProcessIdentitySHA256,
            supervisorProcessIdentitySHA256,
            nonce,
            signerKeyID,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            attestationID != nonce,
            !approvedCommit.isAllZero,
            !approvedTree.isAllZero,
            childProcessID > 0,
            expectedUID > 0,
            validHandoffWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            ),
            !signature.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.attestationID = attestationID
        self.challengeSHA256 = challengeSHA256
        self.receiptSHA256 = receiptSHA256
        self.enrollmentID = enrollmentID
        self.activationDigest = activationDigest
        self.sourceManifestSHA256 = sourceManifestSHA256
        self.approvedCommit = approvedCommit
        self.approvedTree = approvedTree
        self.childProcessIdentitySHA256 =
            childProcessIdentitySHA256
        self.supervisorProcessIdentitySHA256 =
            supervisorProcessIdentitySHA256
        self.nonce = nonce
        self.signerKeyID = signerKeyID
        self.childProcessID = childProcessID
        self.expectedUID = expectedUID
        self.issuedAtUnixSeconds = issuedAtUnixSeconds
        self.expiresAtUnixSeconds = expiresAtUnixSeconds
        self.signature = signature
    }

    public static func signaturePayload(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        attestationID: CanonicalBytes32,
        challengeSHA256: CanonicalBytes32,
        receiptSHA256: CanonicalBytes32,
        enrollmentID: CanonicalBytes32,
        activationDigest: CanonicalBytes32,
        sourceManifestSHA256: CanonicalBytes32,
        approvedCommit: CanonicalBytes20,
        approvedTree: CanonicalBytes20,
        childProcessIdentitySHA256: CanonicalBytes32,
        supervisorProcessIdentitySHA256: CanonicalBytes32,
        nonce: CanonicalBytes32,
        signerKeyID: CanonicalBytes32,
        childProcessID: UInt32,
        expectedUID: UInt32,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64
    ) throws -> [UInt8] {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            childProcessID > 0,
            expectedUID > 0,
            validHandoffWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            )
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        var encoder = CanonicalEncoder()
        encoder.append(magic)
        encoder.append(schemaVersion)
        encoder.append(reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(signatureAlgorithm)
        encoder.append(attestationID.bytes)
        encoder.append(challengeSHA256.bytes)
        encoder.append(receiptSHA256.bytes)
        encoder.append(enrollmentID.bytes)
        encoder.append(activationDigest.bytes)
        encoder.append(sourceManifestSHA256.bytes)
        encoder.append(approvedCommit.bytes)
        encoder.append(approvedTree.bytes)
        encoder.append(childProcessIdentitySHA256.bytes)
        encoder.append(supervisorProcessIdentitySHA256.bytes)
        encoder.append(nonce.bytes)
        encoder.append(signerKeyID.bytes)
        encoder.append(childProcessID)
        encoder.append(expectedUID)
        encoder.append(issuedAtUnixSeconds)
        encoder.append(expiresAtUnixSeconds)
        precondition(
            encoder.bytes.count
                == canonicalByteCount - TrustRootSignatureV1.signatureByteCount
        )
        return encoder.bytes
    }

    public func signaturePayload() -> [UInt8] {
        try! Self.signaturePayload(
            audience: audience,
            purpose: purpose,
            attestationID: attestationID,
            challengeSHA256: challengeSHA256,
            receiptSHA256: receiptSHA256,
            enrollmentID: enrollmentID,
            activationDigest: activationDigest,
            sourceManifestSHA256: sourceManifestSHA256,
            approvedCommit: approvedCommit,
            approvedTree: approvedTree,
            childProcessIdentitySHA256:
                childProcessIdentitySHA256,
            supervisorProcessIdentitySHA256:
                supervisorProcessIdentitySHA256,
            nonce: nonce,
            signerKeyID: signerKeyID,
            childProcessID: childProcessID,
            expectedUID: expectedUID,
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds
        )
    }

    public func canonicalBytes() -> [UInt8] {
        signaturePayload() + signature.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    func verify(
        publicKeyRawRepresentation: [UInt8],
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        expectedActivationHead: ExpectedActivationHeadV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        childProcessIdentity: ProcessIdentityV1,
        expectedChildAnonymousFDChannelBindingSHA256:
            CanonicalBytes32,
        nowUnixSeconds: UInt64
    ) throws {
        try assertCurrentHandoffWindow(
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            nowUnixSeconds: nowUnixSeconds
        )
        guard
            audience == challenge.audience,
            purpose == challenge.purpose,
            challengeSHA256 == challenge.canonicalSHA256(),
            receiptSHA256 == receipt.canonicalSHA256(),
            receipt.challengeSHA256 == challengeSHA256,
            enrollmentID == receipt.enrollmentID,
            activationDigest == receipt.activationDigest,
            sourceManifestSHA256 == receipt.sourceManifestSHA256,
            sourceManifestSHA256 == manifest.canonicalSHA256(),
            approvedCommit == receipt.approvedCommit,
            approvedTree == receipt.approvedTree,
            expectedUID == receipt.expectedUID,
            supervisorProcessIdentity.role == .supervisor,
            supervisorProcessIdentity.effectiveUID == expectedUID,
            supervisorProcessIdentity.executableWholeFileSHA256
                == manifest.supervisorArtifactSHA256,
            childProcessID == childProcessIdentity.processID,
            childProcessIdentitySHA256
                == childProcessIdentity.canonicalSHA256(),
            supervisorProcessIdentitySHA256
                == supervisorProcessIdentity.canonicalSHA256(),
            supervisorProcessIdentitySHA256
                == challenge.supervisorProcessIdentitySHA256,
            signerKeyID != receipt.signerKeyID,
            signerKeyID == manifest.supervisorAttestationKeyID,
            issuedAtUnixSeconds >= receipt.issuedAtUnixSeconds,
            expiresAtUnixSeconds <= receipt.expiresAtUnixSeconds,
            nonce != challenge.nonce
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        try supervisorProcessIdentity.validateSupervisorAgainstManifest(
            manifest,
            expectedUID: expectedUID
        )
        try expectedActivationHead.validateTranscriptActivation(
            activationDigest,
            expectedHeadSHA256: challenge.activationHeadSHA256,
            manifest: manifest
        )
        try childProcessIdentity.validateChildOf(
            supervisorProcessIdentity,
            expectedRole: .diagnosticChild,
            expectedExecutableSHA256:
                manifest.pinnedNodeRuntimeSHA256,
            expectedCodeDirectorySHA256:
                manifest.pinnedNodeCodeDirectorySHA256,
            expectedDesignatedRequirementSHA256:
                manifest.pinnedNodeDesignatedRequirementSHA256,
            expectedHeldExecutableIdentitySHA256:
                manifest.pinnedNodeHeldExecutableIdentitySHA256,
            expectedAnonymousFDChannelBindingSHA256:
                expectedChildAnonymousFDChannelBindingSHA256
        )
        try manifest.validateRuntimeLaunchPolicy(runtimeLaunchPolicy)
        try TrustRootSignatureV1.verify(
            signature: signature,
            payload: signaturePayload(),
            signerKeyID: signerKeyID,
            publicKeyRawRepresentation: publicKeyRawRepresentation
        )
    }

    public static func decodeCanonical(_ bytes: [UInt8]) throws -> Self {
        do {
            guard bytes.count == canonicalByteCount else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            var decoder = CanonicalDecoder(bytes)
            guard
                try decoder.readBytes(count: magic.count) == magic,
                try decoder.readByte() == schemaVersion,
                try decoder.readByte() == reserved,
                let audience = TrustRootAudience(
                    rawValue: try decoder.readByte()
                ),
                let purpose = TrustRootPurpose(
                    rawValue: try decoder.readByte()
                ),
                try decoder.readByte() == signatureAlgorithm
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let record = try Self(
                audience: audience,
                purpose: purpose,
                attestationID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                challengeSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                receiptSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                enrollmentID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                activationDigest: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                sourceManifestSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                approvedCommit: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                approvedTree: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                childProcessIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorProcessIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                nonce: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                signerKeyID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                childProcessID: try decoder.readUInt32(),
                expectedUID: try decoder.readUInt32(),
                issuedAtUnixSeconds: try decoder.readUInt64(),
                expiresAtUnixSeconds: try decoder.readUInt64(),
                signature: CanonicalBytes64(
                    try decoder.readBytes(count: 64)
                )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return record
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
