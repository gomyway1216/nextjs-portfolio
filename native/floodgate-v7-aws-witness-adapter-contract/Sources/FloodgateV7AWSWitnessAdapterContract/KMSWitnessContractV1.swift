import CryptoKit
import Foundation
import FloodgateV7ExternalTrustRootProtocol

/// Fixed-width arithmetic used only to fail closed while decoding an
/// untrusted RFC 8032 Ed25519 compressed point. Values are always reduced
/// modulo p = 2^255 - 19.
private struct Ed25519FieldElementV1:
    Equatable
{
    private static let modulus = Self(
        0xffff_ffff_ffff_ffed,
        0xffff_ffff_ffff_ffff,
        0xffff_ffff_ffff_ffff,
        0x7fff_ffff_ffff_ffff
    )

    static let zero = Self(0, 0, 0, 0)
    static let one = Self(1, 0, 0, 0)
    static let curveD = Self(
        0x75eb_4dca_1359_78a3,
        0x0070_0a4d_4141_d8ab,
        0x8cc7_4079_7779_e898,
        0x5203_6cee_2b6f_fe73
    )
    static let squareRootOfMinusOne = Self(
        0xc4ee_1b27_4a0e_a0b0,
        0x2f43_1806_ad2f_e478,
        0x2b4d_0099_3dfb_d7a7,
        0x2b83_2480_4fc1_df0b
    )
    static let inverseExponent = Self(
        0xffff_ffff_ffff_ffeb,
        0xffff_ffff_ffff_ffff,
        0xffff_ffff_ffff_ffff,
        0x7fff_ffff_ffff_ffff
    )
    static let squareRootExponent = Self(
        0xffff_ffff_ffff_fffe,
        0xffff_ffff_ffff_ffff,
        0xffff_ffff_ffff_ffff,
        0x0fff_ffff_ffff_ffff
    )

    private let limb0: UInt64
    private let limb1: UInt64
    private let limb2: UInt64
    private let limb3: UInt64

    private init(
        _ limb0: UInt64,
        _ limb1: UInt64,
        _ limb2: UInt64,
        _ limb3: UInt64
    ) {
        self.limb0 = limb0
        self.limb1 = limb1
        self.limb2 = limb2
        self.limb3 = limb3
    }

    static func canonicalLittleEndian(
        _ bytes: [UInt8]
    ) -> Self? {
        guard bytes.count == 32 else {
            return nil
        }
        func limb(_ offset: Int) -> UInt64 {
            bytes[offset..<(offset + 8)]
                .enumerated()
                .reduce(UInt64(0)) {
                    $0
                        | (
                            UInt64($1.element)
                                << UInt64(
                                    $1.offset * 8
                                )
                        )
                }
        }
        let value = Self(
            limb(0),
            limb(8),
            limb(16),
            limb(24)
        )
        return value.isLessThan(modulus)
            ? value
            : nil
    }

    var isZero: Bool {
        self == Self.zero
    }

    var isOdd: Bool {
        limb0 & 1 == 1
    }

    func addingModulo(
        _ other: Self
    ) -> Self {
        let (sum0, carry0) =
            limb0.addingReportingOverflow(
                other.limb0
            )
        let (partial1, carry1a) =
            limb1.addingReportingOverflow(
                other.limb1
            )
        let (sum1, carry1b) =
            partial1.addingReportingOverflow(
                carry0 ? 1 : 0
            )
        let carry1 = carry1a || carry1b
        let (partial2, carry2a) =
            limb2.addingReportingOverflow(
                other.limb2
            )
        let (sum2, carry2b) =
            partial2.addingReportingOverflow(
                carry1 ? 1 : 0
            )
        let carry2 = carry2a || carry2b
        let (partial3, carry3a) =
            limb3.addingReportingOverflow(
                other.limb3
            )
        let (sum3, carry3b) =
            partial3.addingReportingOverflow(
                carry2 ? 1 : 0
            )
        precondition(
            !(carry3a || carry3b),
            "reduced Ed25519 field addition overflowed"
        )
        let sum = Self(
            sum0,
            sum1,
            sum2,
            sum3
        )
        return sum.isLessThan(Self.modulus)
            ? sum
            : sum.subtractingWithoutUnderflow(
                Self.modulus
            )
    }

    func subtractingModulo(
        _ other: Self
    ) -> Self {
        if !isLessThan(other) {
            return subtractingWithoutUnderflow(
                other
            )
        }
        return Self.modulus
            .subtractingWithoutUnderflow(
                other
                    .subtractingWithoutUnderflow(
                        self
                    )
            )
    }

    func multipliedModulo(
        by other: Self
    ) -> Self {
        var result = Self.zero
        var addend = self
        for bitIndex in 0..<255 {
            if other.bit(at: bitIndex) {
                result = result.addingModulo(
                    addend
                )
            }
            addend = addend.addingModulo(
                addend
            )
        }
        return result
    }

    func raised(
        to exponent: Self
    ) -> Self {
        var result = Self.one
        var base = self
        for bitIndex in 0..<255 {
            if exponent.bit(at: bitIndex) {
                result = result
                    .multipliedModulo(by: base)
            }
            base = base.multipliedModulo(
                by: base
            )
        }
        return result
    }

    func negatedModulo() -> Self {
        isZero
            ? self
            : Self.modulus
                .subtractingWithoutUnderflow(self)
    }

    private func bit(
        at index: Int
    ) -> Bool {
        let shift = UInt64(index % 64)
        switch index / 64 {
        case 0:
            return (limb0 >> shift) & 1 == 1
        case 1:
            return (limb1 >> shift) & 1 == 1
        case 2:
            return (limb2 >> shift) & 1 == 1
        default:
            return (limb3 >> shift) & 1 == 1
        }
    }

    private func isLessThan(
        _ other: Self
    ) -> Bool {
        if limb3 != other.limb3 {
            return limb3 < other.limb3
        }
        if limb2 != other.limb2 {
            return limb2 < other.limb2
        }
        if limb1 != other.limb1 {
            return limb1 < other.limb1
        }
        return limb0 < other.limb0
    }

    private func subtractingWithoutUnderflow(
        _ other: Self
    ) -> Self {
        let (difference0, borrow0) =
            limb0.subtractingReportingOverflow(
                other.limb0
            )
        let (partial1, borrow1a) =
            limb1.subtractingReportingOverflow(
                other.limb1
            )
        let (difference1, borrow1b) =
            partial1.subtractingReportingOverflow(
                borrow0 ? 1 : 0
            )
        let borrow1 = borrow1a || borrow1b
        let (partial2, borrow2a) =
            limb2.subtractingReportingOverflow(
                other.limb2
            )
        let (difference2, borrow2b) =
            partial2.subtractingReportingOverflow(
                borrow1 ? 1 : 0
            )
        let borrow2 = borrow2a || borrow2b
        let (partial3, borrow3a) =
            limb3.subtractingReportingOverflow(
                other.limb3
            )
        let (difference3, borrow3b) =
            partial3.subtractingReportingOverflow(
                borrow2 ? 1 : 0
            )
        precondition(
            !(borrow3a || borrow3b),
            "Ed25519 field subtraction underflowed"
        )
        return Self(
            difference0,
            difference1,
            difference2,
            difference3
        )
    }
}

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
        let sign = raw[31] & 0x80 != 0
        var y = raw
        y[31] &= 0x7f
        guard let fieldY =
            Ed25519FieldElementV1
                .canonicalLittleEndian(y)
        else {
            return false
        }

        // RFC 8032 section 5.1.3: recover x from the complete curve
        // equation and reject a non-square, including x = 0 with sign = 1.
        let ySquared = fieldY
            .multipliedModulo(by: fieldY)
        let numerator = ySquared
            .subtractingModulo(.one)
        let denominator =
            Ed25519FieldElementV1.curveD
                .multipliedModulo(
                    by: ySquared
                )
                .addingModulo(.one)
        guard !denominator.isZero else {
            return false
        }
        let xSquared = numerator
            .multipliedModulo(
                by: denominator.raised(
                    to:
                        Ed25519FieldElementV1
                        .inverseExponent
                )
            )
        if xSquared.isZero {
            return !sign
        }
        var x = xSquared.raised(
            to:
                Ed25519FieldElementV1
                .squareRootExponent
        )
        if x.multipliedModulo(by: x)
            != xSquared
        {
            x = x.multipliedModulo(
                by:
                    Ed25519FieldElementV1
                    .squareRootOfMinusOne
            )
        }
        guard x.multipliedModulo(by: x)
            == xSquared
        else {
            return false
        }
        if x.isOdd != sign {
            x = x.negatedModulo()
        }
        return !x.isZero
            && x.isOdd == sign
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
