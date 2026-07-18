public struct AuthorityPublicKeyRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 76

    private static let magic = Array("FGV7APK1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let authorityPublicKeyRawRepresentation: [UInt8]
    public let authoritySignerKeyID: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        authorityPublicKeyRawRepresentation: [UInt8],
        authoritySignerKeyID: CanonicalBytes32
    ) throws {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            authorityPublicKeyRawRepresentation.count
                == TrustRootSignatureV1.publicKeyByteCount,
            !authorityPublicKeyRawRepresentation.allSatisfy({
                $0 == 0
            }),
            try TrustRootSignatureV1.signerKeyID(
                publicKeyRawRepresentation:
                    authorityPublicKeyRawRepresentation
            ) == authoritySignerKeyID
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.authorityPublicKeyRawRepresentation = Array(
            authorityPublicKeyRawRepresentation
        )
        self.authoritySignerKeyID = authoritySignerKeyID
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(authorityPublicKeyRawRepresentation)
        encoder.append(authoritySignerKeyID.bytes)
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
            let record = try Self(
                audience: audience,
                purpose: purpose,
                authorityPublicKeyRawRepresentation:
                    try decoder.readBytes(
                        count: TrustRootSignatureV1.publicKeyByteCount
                    ),
                authoritySignerKeyID: CanonicalBytes32(
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

public struct ActivationHeadJournalHeaderV1: Equatable, Sendable {
    public static let canonicalByteCount = 112
    public static let requiredEntryByteCount: UInt32 = 200

    private static let magic = Array("FGV7AJH1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let entryByteCount: UInt32
    public let journalID: CanonicalBytes32
    public let authoritySignerKeyID: CanonicalBytes32
    public let authorityPublicKeyRecordSHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        entryByteCount: UInt32,
        journalID: CanonicalBytes32,
        authoritySignerKeyID: CanonicalBytes32,
        authorityPublicKeyRecordSHA256: CanonicalBytes32
    ) throws {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            entryByteCount == Self.requiredEntryByteCount,
            !journalID.isAllZero,
            !authoritySignerKeyID.isAllZero,
            !authorityPublicKeyRecordSHA256.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.entryByteCount = entryByteCount
        self.journalID = journalID
        self.authoritySignerKeyID = authoritySignerKeyID
        self.authorityPublicKeyRecordSHA256 =
            authorityPublicKeyRecordSHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(entryByteCount)
        encoder.append(journalID.bytes)
        encoder.append(authoritySignerKeyID.bytes)
        encoder.append(authorityPublicKeyRecordSHA256.bytes)
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
            let header = try Self(
                audience: audience,
                purpose: purpose,
                entryByteCount: try decoder.readUInt32(),
                journalID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                authoritySignerKeyID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                authorityPublicKeyRecordSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return header
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct ActivationHeadJournalEntryV1: Equatable, Sendable {
    public static let canonicalByteCount = 200

    private static let magic = Array("FGV7AJE1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let journalSequence: UInt64
    public let previousJournalRecordSHA256: CanonicalBytes32
    public let expectedActivationHead: ExpectedActivationHeadV1

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        journalSequence: UInt64,
        previousJournalRecordSHA256: CanonicalBytes32,
        expectedActivationHead: ExpectedActivationHeadV1
    ) throws {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            journalSequence > 0,
            !previousJournalRecordSHA256.isAllZero,
            journalSequence
                == expectedActivationHead.latestActivationSequence,
            audience == expectedActivationHead.audience,
            purpose == expectedActivationHead.purpose
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.journalSequence = journalSequence
        self.previousJournalRecordSHA256 =
            previousJournalRecordSHA256
        self.expectedActivationHead = expectedActivationHead
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(journalSequence)
        encoder.append(previousJournalRecordSHA256.bytes)
        encoder.append(expectedActivationHead.canonicalBytes())
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
            let entry = try Self(
                audience: audience,
                purpose: purpose,
                journalSequence: try decoder.readUInt64(),
                previousJournalRecordSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                expectedActivationHead:
                    try ExpectedActivationHeadV1.decodeCanonical(
                        decoder.readBytes(
                            count:
                                ExpectedActivationHeadV1
                                .canonicalByteCount
                        )
                    )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return entry
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
