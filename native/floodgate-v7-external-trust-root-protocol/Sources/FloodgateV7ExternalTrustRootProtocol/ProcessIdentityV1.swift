public enum TrustRootProcessRoleV1: UInt8, Equatable, Sendable {
    case supervisor = 1
    case verifier = 2
    case diagnosticChild = 3
}

public struct ProcessIdentityV1: Equatable, Sendable {
    public static let canonicalByteCount = 264

    private static let magic = Array("FGV7PID1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let role: TrustRootProcessRoleV1
    public let processID: UInt32
    public let parentProcessID: UInt32
    public let effectiveUID: UInt32
    public let processUniqueID: UInt64
    public let startTimeNanoseconds: UInt64
    public let executableWholeFileSHA256: CanonicalBytes32
    public let codeDirectorySHA256: CanonicalBytes32
    public let designatedRequirementSHA256: CanonicalBytes32
    public let auditTokenSHA256: CanonicalBytes32
    public let parentProcessIdentitySHA256: CanonicalBytes32
    public let anonymousFDChannelBindingSHA256: CanonicalBytes32
    public let heldExecutableIdentitySHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        role: TrustRootProcessRoleV1,
        processID: UInt32,
        parentProcessID: UInt32,
        effectiveUID: UInt32,
        processUniqueID: UInt64,
        startTimeNanoseconds: UInt64,
        executableWholeFileSHA256: CanonicalBytes32,
        codeDirectorySHA256: CanonicalBytes32,
        designatedRequirementSHA256: CanonicalBytes32,
        auditTokenSHA256: CanonicalBytes32,
        parentProcessIdentitySHA256: CanonicalBytes32,
        anonymousFDChannelBindingSHA256: CanonicalBytes32,
        heldExecutableIdentitySHA256: CanonicalBytes32
    ) throws {
        guard
            audience == .productionRecovery,
            processID > 0,
            effectiveUID > 0,
            processUniqueID > 0,
            startTimeNanoseconds > 0,
            !executableWholeFileSHA256.isAllZero,
            !codeDirectorySHA256.isAllZero,
            !designatedRequirementSHA256.isAllZero,
            !auditTokenSHA256.isAllZero,
            !heldExecutableIdentitySHA256.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        switch role {
        case .supervisor:
            guard
                parentProcessID > 0,
                parentProcessID != processID,
                !parentProcessIdentitySHA256.isAllZero,
                anonymousFDChannelBindingSHA256.isAllZero
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
        case .verifier, .diagnosticChild:
            guard
                parentProcessID > 0,
                parentProcessID != processID,
                !parentProcessIdentitySHA256.isAllZero,
                !anonymousFDChannelBindingSHA256.isAllZero
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
        }
        self.audience = audience
        self.role = role
        self.processID = processID
        self.parentProcessID = parentProcessID
        self.effectiveUID = effectiveUID
        self.processUniqueID = processUniqueID
        self.startTimeNanoseconds = startTimeNanoseconds
        self.executableWholeFileSHA256 =
            executableWholeFileSHA256
        self.codeDirectorySHA256 = codeDirectorySHA256
        self.designatedRequirementSHA256 =
            designatedRequirementSHA256
        self.auditTokenSHA256 = auditTokenSHA256
        self.parentProcessIdentitySHA256 =
            parentProcessIdentitySHA256
        self.anonymousFDChannelBindingSHA256 =
            anonymousFDChannelBindingSHA256
        self.heldExecutableIdentitySHA256 =
            heldExecutableIdentitySHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(role.rawValue)
        encoder.append(processID)
        encoder.append(parentProcessID)
        encoder.append(effectiveUID)
        encoder.append(processUniqueID)
        encoder.append(startTimeNanoseconds)
        encoder.append(executableWholeFileSHA256.bytes)
        encoder.append(codeDirectorySHA256.bytes)
        encoder.append(designatedRequirementSHA256.bytes)
        encoder.append(auditTokenSHA256.bytes)
        encoder.append(parentProcessIdentitySHA256.bytes)
        encoder.append(anonymousFDChannelBindingSHA256.bytes)
        encoder.append(heldExecutableIdentitySHA256.bytes)
        precondition(encoder.bytes.count == Self.canonicalByteCount)
        return encoder.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public func validateChildOf(
        _ supervisor: ProcessIdentityV1,
        expectedRole: TrustRootProcessRoleV1,
        expectedExecutableSHA256: CanonicalBytes32,
        expectedCodeDirectorySHA256: CanonicalBytes32,
        expectedDesignatedRequirementSHA256: CanonicalBytes32,
        expectedHeldExecutableIdentitySHA256: CanonicalBytes32,
        expectedAnonymousFDChannelBindingSHA256: CanonicalBytes32
    ) throws {
        guard
            role == expectedRole,
            supervisor.role == .supervisor,
            audience == supervisor.audience,
            parentProcessID == supervisor.processID,
            parentProcessIdentitySHA256
                == supervisor.canonicalSHA256(),
            effectiveUID == supervisor.effectiveUID,
            executableWholeFileSHA256
                == expectedExecutableSHA256,
            codeDirectorySHA256 == expectedCodeDirectorySHA256,
            designatedRequirementSHA256
                == expectedDesignatedRequirementSHA256,
            heldExecutableIdentitySHA256
                == expectedHeldExecutableIdentitySHA256,
            anonymousFDChannelBindingSHA256
                == expectedAnonymousFDChannelBindingSHA256
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
                let role = TrustRootProcessRoleV1(
                    rawValue: try decoder.readByte()
                )
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let record = try Self(
                audience: audience,
                role: role,
                processID: try decoder.readUInt32(),
                parentProcessID: try decoder.readUInt32(),
                effectiveUID: try decoder.readUInt32(),
                processUniqueID: try decoder.readUInt64(),
                startTimeNanoseconds: try decoder.readUInt64(),
                executableWholeFileSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                codeDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                designatedRequirementSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                auditTokenSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                parentProcessIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                anonymousFDChannelBindingSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                heldExecutableIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
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
