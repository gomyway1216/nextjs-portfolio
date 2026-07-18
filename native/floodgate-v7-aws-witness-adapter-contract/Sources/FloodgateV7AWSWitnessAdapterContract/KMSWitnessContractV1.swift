import CryptoKit
import Foundation
import FloodgateV7ExternalTrustRootProtocol

struct KMSWitnessKeyBindingV1:
    Equatable,
    Sendable
{
    /// RFC 8410 SubjectPublicKeyInfo for id-Ed25519.
    private static let ed25519SPKIPrefix: [UInt8] = [
        0x30, 0x2a,
        0x30, 0x05,
        0x06, 0x03, 0x2b, 0x65, 0x70,
        0x03, 0x21, 0x00,
    ]

    private static let ed25519FieldPrime:
        [UInt8] =
        [0xed]
        + Array(repeating: 0xff, count: 30)
        + [0x7f]

    /// The eight canonical encodings of Ed25519's small-order subgroup.
    private static let ed25519SmallOrder:
        [[UInt8]] = [
            [0x01]
                + Array(repeating: 0, count: 31),
            [
                0x26, 0xe8, 0x95, 0x8f,
                0xc2, 0xb2, 0x27, 0xb0,
                0x45, 0xc3, 0xf4, 0x89,
                0xf2, 0xef, 0x98, 0xf0,
                0xd5, 0xdf, 0xac, 0x05,
                0xd3, 0xc6, 0x33, 0x39,
                0xb1, 0x38, 0x02, 0x88,
                0x6d, 0x53, 0xfc, 0x05,
            ],
            Array(repeating: 0, count: 32),
            [
                0xc7, 0x17, 0x6a, 0x70,
                0x3d, 0x4d, 0xd8, 0x4f,
                0xba, 0x3c, 0x0b, 0x76,
                0x0d, 0x10, 0x67, 0x0f,
                0x2a, 0x20, 0x53, 0xfa,
                0x2c, 0x39, 0xcc, 0xc6,
                0x4e, 0xc7, 0xfd, 0x77,
                0x92, 0xac, 0x03, 0x7a,
            ],
            [0xec]
                + Array(repeating: 0xff, count: 30)
                + [0x7f],
            [
                0xc7, 0x17, 0x6a, 0x70,
                0x3d, 0x4d, 0xd8, 0x4f,
                0xba, 0x3c, 0x0b, 0x76,
                0x0d, 0x10, 0x67, 0x0f,
                0x2a, 0x20, 0x53, 0xfa,
                0x2c, 0x39, 0xcc, 0xc6,
                0x4e, 0xc7, 0xfd, 0x77,
                0x92, 0xac, 0x03, 0xfa,
            ],
            Array(repeating: 0, count: 31)
                + [0x80],
            [
                0x26, 0xe8, 0x95, 0x8f,
                0xc2, 0xb2, 0x27, 0xb0,
                0x45, 0xc3, 0xf4, 0x89,
                0xf2, 0xef, 0x98, 0xf0,
                0xd5, 0xdf, 0xac, 0x05,
                0xd3, 0xc6, 0x33, 0x39,
                0xb1, 0x38, 0x02, 0x88,
                0x6d, 0x53, 0xfc, 0x85,
            ],
        ]

    let keyARN: String
    let publicKeyRawRepresentation: [UInt8]
    let signerKeyID: CanonicalBytes32

    static func getPublicKeyRequest(
        pinnedKeyARN: String
    ) throws -> AWSWitnessKMSGetPublicKeyRequestV1 {
        guard validKeyARN(pinnedKeyARN) else {
            throw AWSWitnessContractErrorV1.stop
        }
        return AWSWitnessKMSGetPublicKeyRequestV1(
            keyARN: pinnedKeyARN,
            grantTokens: []
        )
    }

    static func bind(
        pinnedKeyARN: String,
        response:
            AWSWitnessKMSGetPublicKeyResponseV1
    ) throws -> Self {
        guard
            validKeyARN(pinnedKeyARN),
            response.keyARN == pinnedKeyARN,
            response.keySpec
                == .eccNistEdwards25519,
            response.keyUsage == .signVerify,
            response.signingAlgorithms.count == 2,
            response.signingAlgorithms.contains(
                .ed25519SHA512
            ),
            response.signingAlgorithms.contains(
                .ed25519PHSHA512
            ),
            !response.unknownFieldsPresent,
            response.subjectPublicKeyInfoDER.count
                == ed25519SPKIPrefix.count
                    + TrustRootSignatureV1
                    .publicKeyByteCount,
            Array(
                response.subjectPublicKeyInfoDER
                    .prefix(ed25519SPKIPrefix.count)
            ) == ed25519SPKIPrefix
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        let raw = Array(
            response.subjectPublicKeyInfoDER
                .dropFirst(ed25519SPKIPrefix.count)
        )
        guard
            validEd25519PublicKeyEncoding(raw),
            (try? Curve25519.Signing.PublicKey(
                rawRepresentation: Data(raw)
            )) != nil
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        let signerKeyID: CanonicalBytes32
        do {
            signerKeyID =
                try TrustRootSignatureV1.signerKeyID(
                    publicKeyRawRepresentation: raw
                )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
        return Self(
            keyARN: pinnedKeyARN,
            publicKeyRawRepresentation: raw,
            signerKeyID: signerKeyID
        )
    }

    func signRequest(
        exactRawMessage: [UInt8]
    ) throws -> AWSWitnessKMSSignRequestV1 {
        guard
            !exactRawMessage.isEmpty,
            exactRawMessage.count <= 4_096
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        return AWSWitnessKMSSignRequestV1(
            keyARN: keyARN,
            message: Array(exactRawMessage),
            messageType: .raw,
            signingAlgorithm: .ed25519SHA512,
            grantTokens: []
        )
    }

    func validateSignResponse(
        _ response: AWSWitnessKMSSignResponseV1,
        for request: AWSWitnessKMSSignRequestV1
    ) throws -> CanonicalBytes64 {
        guard
            request.keyARN == keyARN,
            !request.message.isEmpty,
            request.message.count <= 4_096,
            request.messageType == .raw,
            request.signingAlgorithm
                == .ed25519SHA512,
            request.grantTokens == [],
            response.keyARN == keyARN,
            response.signingAlgorithm
                == .ed25519SHA512,
            response.signature.count
                == TrustRootSignatureV1
                .signatureByteCount,
            !response.signature.allSatisfy({
                $0 == 0
            }),
            !response.unknownFieldsPresent
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        let publicKey:
            Curve25519.Signing.PublicKey
        do {
            publicKey = try Curve25519.Signing
                .PublicKey(
                    rawRepresentation:
                        Data(
                            publicKeyRawRepresentation
                        )
                )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
        guard publicKey.isValidSignature(
            Data(response.signature),
            for: Data(request.message)
        ) else {
            throw AWSWitnessContractErrorV1.stop
        }
        do {
            return try CanonicalBytes64(
                response.signature
            )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    private static func
        validEd25519PublicKeyEncoding(
            _ raw: [UInt8]
        ) -> Bool
    {
        guard
            raw.count
                == TrustRootSignatureV1
                .publicKeyByteCount,
            !ed25519SmallOrder.contains(raw)
        else {
            return false
        }
        var y = raw
        y[31] &= 0x7f
        for index in stride(
            from: 31,
            through: 0,
            by: -1
        ) {
            if y[index]
                < ed25519FieldPrime[index]
            {
                return true
            }
            if y[index]
                > ed25519FieldPrime[index]
            {
                return false
            }
        }
        return false
    }

    private static func validKeyARN(
        _ value: String
    ) -> Bool {
        let bytes = Array(value.utf8)
        return
            (32...2_048).contains(bytes.count)
            && bytes.allSatisfy {
                $0 >= 0x21 && $0 <= 0x7e
            }
            && value.hasPrefix("arn:")
            && value.contains(":kms:")
            && value.contains(":key/")
            && !value.contains("..")
            && !value.hasSuffix("/")
    }
}
