import CryptoKit
import Foundation

private enum TrustRootSignatureAlgorithmV1: UInt8 {
    case ed25519 = 1
}

public enum TrustRootSignatureV1 {
    public static let publicKeyByteCount = 32
    public static let signatureByteCount = 64

    public static func signerKeyID(
        publicKeyRawRepresentation: [UInt8]
    ) throws -> CanonicalBytes32 {
        guard publicKeyRawRepresentation.count == publicKeyByteCount else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let keyID = CanonicalSHA256.digest(publicKeyRawRepresentation)
        guard !keyID.isAllZero else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        return keyID
    }

    static func verify(
        signature: CanonicalBytes64,
        payload: [UInt8],
        signerKeyID: CanonicalBytes32,
        publicKeyRawRepresentation: [UInt8]
    ) throws {
        do {
            guard
                try self.signerKeyID(
                    publicKeyRawRepresentation:
                        publicKeyRawRepresentation
                ) == signerKeyID
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let publicKey = try Curve25519.Signing.PublicKey(
                rawRepresentation: Data(publicKeyRawRepresentation)
            )
            guard publicKey.isValidSignature(
                Data(signature.bytes),
                for: Data(payload)
            ) else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct SignedEnrollmentRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 372

    private static let magic = Array("FGV7SEN1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let signerKeyID: CanonicalBytes32
    public let record: EnrollmentRecord
    public let signature: CanonicalBytes64

    public init(
        signerKeyID: CanonicalBytes32,
        record: EnrollmentRecord,
        signature: CanonicalBytes64
    ) throws {
        guard
            !signerKeyID.isAllZero,
            !signature.isAllZero,
            record.audience == .productionRecovery
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.signerKeyID = signerKeyID
        self.record = record
        self.signature = signature
    }

    public static func signaturePayload(
        record: EnrollmentRecord,
        signerKeyID: CanonicalBytes32
    ) throws -> [UInt8] {
        guard
            record.audience == .productionRecovery,
            !signerKeyID.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        var encoder = CanonicalEncoder()
        encoder.append(magic)
        encoder.append(schemaVersion)
        encoder.append(reserved)
        encoder.append(record.audience.rawValue)
        encoder.append(TrustRootSignatureAlgorithmV1.ed25519.rawValue)
        encoder.append(signerKeyID.bytes)
        encoder.append(record.canonicalSHA256().bytes)
        encoder.append(record.canonicalBytes())
        precondition(
            encoder.bytes.count
                == canonicalByteCount - TrustRootSignatureV1.signatureByteCount
        )
        return encoder.bytes
    }

    public func signaturePayload() -> [UInt8] {
        try! Self.signaturePayload(
            record: record,
            signerKeyID: signerKeyID
        )
    }

    public func canonicalBytes() -> [UInt8] {
        signaturePayload() + signature.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public func verifiedRecord(
        publicKeyRawRepresentation: [UInt8]
    ) throws -> EnrollmentRecord {
        try TrustRootSignatureV1.verify(
            signature: signature,
            payload: signaturePayload(),
            signerKeyID: signerKeyID,
            publicKeyRawRepresentation: publicKeyRawRepresentation
        )
        return record
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
                audience == .productionRecovery,
                try decoder.readByte()
                    == TrustRootSignatureAlgorithmV1.ed25519.rawValue
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let signerKeyID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let recordDigest = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let record = try EnrollmentRecord.decodeCanonical(
                decoder.readBytes(
                    count: EnrollmentRecord.canonicalByteCount
                )
            )
            let signature = try CanonicalBytes64(
                decoder.readBytes(
                    count: TrustRootSignatureV1.signatureByteCount
                )
            )
            guard
                decoder.isAtEnd,
                record.audience == audience,
                record.canonicalSHA256() == recordDigest
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return try Self(
                signerKeyID: signerKeyID,
                record: record,
                signature: signature
            )
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct SignedActivationRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 264

    private static let magic = Array("FGV7SAC1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let signerKeyID: CanonicalBytes32
    public let record: ActivationRecord
    public let signature: CanonicalBytes64

    public init(
        signerKeyID: CanonicalBytes32,
        record: ActivationRecord,
        signature: CanonicalBytes64
    ) throws {
        guard
            !signerKeyID.isAllZero,
            !signature.isAllZero,
            record.audience == .productionRecovery
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.signerKeyID = signerKeyID
        self.record = record
        self.signature = signature
    }

    public static func signaturePayload(
        record: ActivationRecord,
        signerKeyID: CanonicalBytes32
    ) throws -> [UInt8] {
        guard
            record.audience == .productionRecovery,
            !signerKeyID.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        var encoder = CanonicalEncoder()
        encoder.append(magic)
        encoder.append(schemaVersion)
        encoder.append(reserved)
        encoder.append(record.audience.rawValue)
        encoder.append(TrustRootSignatureAlgorithmV1.ed25519.rawValue)
        encoder.append(signerKeyID.bytes)
        encoder.append(record.canonicalSHA256().bytes)
        encoder.append(record.canonicalBytes())
        precondition(
            encoder.bytes.count
                == canonicalByteCount - TrustRootSignatureV1.signatureByteCount
        )
        return encoder.bytes
    }

    public func signaturePayload() -> [UInt8] {
        try! Self.signaturePayload(
            record: record,
            signerKeyID: signerKeyID
        )
    }

    public func canonicalBytes() -> [UInt8] {
        signaturePayload() + signature.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public func verifiedRecord(
        publicKeyRawRepresentation: [UInt8]
    ) throws -> ActivationRecord {
        try TrustRootSignatureV1.verify(
            signature: signature,
            payload: signaturePayload(),
            signerKeyID: signerKeyID,
            publicKeyRawRepresentation: publicKeyRawRepresentation
        )
        return record
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
                audience == .productionRecovery,
                try decoder.readByte()
                    == TrustRootSignatureAlgorithmV1.ed25519.rawValue
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let signerKeyID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let recordDigest = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let record = try ActivationRecord.decodeCanonical(
                decoder.readBytes(
                    count: ActivationRecord.canonicalByteCount
                )
            )
            let signature = try CanonicalBytes64(
                decoder.readBytes(
                    count: TrustRootSignatureV1.signatureByteCount
                )
            )
            guard
                decoder.isAtEnd,
                record.audience == audience,
                record.canonicalSHA256() == recordDigest
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return try Self(
                signerKeyID: signerKeyID,
                record: record,
                signature: signature
            )
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
