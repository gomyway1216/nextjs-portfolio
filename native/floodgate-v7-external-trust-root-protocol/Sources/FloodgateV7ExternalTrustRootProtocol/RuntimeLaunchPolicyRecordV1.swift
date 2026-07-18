public struct RuntimeLaunchPolicyRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 220

    private static let magic = Array("FGV7RLP1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let required: UInt8 = 1
    private static let forbidden: UInt8 = 0
    private static let fixedArgvCount: UInt8 = 2

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let recordID: CanonicalBytes32
    public let fixedArgvSHA256: CanonicalBytes32
    public let fixedWorkingDirectorySHA256: CanonicalBytes32
    public let fixedEnvironmentSHA256: CanonicalBytes32
    public let runtimeInstallPolicySHA256: CanonicalBytes32
    public let diagnosticEntryBundleSHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        recordID: CanonicalBytes32,
        fixedArgvSHA256: CanonicalBytes32,
        fixedWorkingDirectorySHA256: CanonicalBytes32,
        fixedEnvironmentSHA256: CanonicalBytes32,
        runtimeInstallPolicySHA256: CanonicalBytes32,
        diagnosticEntryBundleSHA256: CanonicalBytes32
    ) throws {
        let requiredDigests = [
            recordID,
            fixedArgvSHA256,
            fixedWorkingDirectorySHA256,
            fixedEnvironmentSHA256,
            runtimeInstallPolicySHA256,
            diagnosticEntryBundleSHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            requiredDigests.allSatisfy({ !$0.isAllZero })
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.recordID = recordID
        self.fixedArgvSHA256 = fixedArgvSHA256
        self.fixedWorkingDirectorySHA256 =
            fixedWorkingDirectorySHA256
        self.fixedEnvironmentSHA256 = fixedEnvironmentSHA256
        self.runtimeInstallPolicySHA256 =
            runtimeInstallPolicySHA256
        self.diagnosticEntryBundleSHA256 =
            diagnosticEntryBundleSHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        // The external supervisor directly launches the pinned Node image.
        encoder.append(Self.required)
        // The reviewed JXA remains authenticated dormant source and is not run.
        encoder.append(Self.required)
        encoder.append(Self.required) // root-owned runtime
        encoder.append(Self.required) // no writable ancestors
        encoder.append(Self.required) // held no-follow runtime identity
        encoder.append(Self.required) // spawn suspended
        encoder.append(Self.required) // verify actual image before resume
        encoder.append(Self.required) // new process group
        encoder.append(Self.required) // anonymous attestation FD
        encoder.append(Self.required) // bounded stdout
        encoder.append(Self.required) // bounded stderr
        encoder.append(Self.forbidden) // caller arguments
        encoder.append(Self.forbidden) // caller environment
        encoder.append(Self.forbidden) // shell
        encoder.append(Self.forbidden) // intermediary launcher process
        encoder.append(Self.fixedArgvCount)
        encoder.append(recordID.bytes)
        encoder.append(fixedArgvSHA256.bytes)
        encoder.append(fixedWorkingDirectorySHA256.bytes)
        encoder.append(fixedEnvironmentSHA256.bytes)
        encoder.append(runtimeInstallPolicySHA256.bytes)
        encoder.append(diagnosticEntryBundleSHA256.bytes)
        precondition(encoder.bytes.count == Self.canonicalByteCount)
        return encoder.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
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
                )
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            for expected in [
                required,
                required,
                required,
                required,
                required,
                required,
                required,
                required,
                required,
                required,
                required,
                forbidden,
                forbidden,
                forbidden,
                forbidden,
                fixedArgvCount,
            ] {
                guard try decoder.readByte() == expected else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
            }
            let record = try Self(
                audience: audience,
                purpose: purpose,
                recordID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                fixedArgvSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                fixedWorkingDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                fixedEnvironmentSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                runtimeInstallPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                diagnosticEntryBundleSHA256: CanonicalBytes32(
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
