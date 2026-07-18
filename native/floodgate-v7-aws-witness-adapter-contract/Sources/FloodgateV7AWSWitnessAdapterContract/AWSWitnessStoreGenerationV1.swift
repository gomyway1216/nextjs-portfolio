import CryptoKit
import Foundation
import FloodgateV7ExternalTrustRootProtocol

struct AWSWitnessTableIdentityV1:
    Equatable,
    Sendable
{
    let tableARN: String
    let tableID: String

    init(
        tableARN: String,
        tableID: String
    ) throws {
        guard
            Self.validTableARN(tableARN),
            Self.validTableID(tableID)
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        self.tableARN = tableARN
        self.tableID = tableID
    }

    static func validTableARN(
        _ value: String
    ) -> Bool {
        let bytes = Array(value.utf8)
        return
            (32...2_048).contains(bytes.count)
            && bytes.allSatisfy {
                $0 >= 0x21 && $0 <= 0x7e
            }
            && value.hasPrefix("arn:")
            && value.contains(":dynamodb:")
            && value.contains(":table/")
            && !value.contains("..")
            && !value.hasSuffix("/")
    }

    private static func validTableID(
        _ value: String
    ) -> Bool {
        let bytes = Array(value.utf8)
        guard bytes.count == 36 else {
            return false
        }
        let hyphenIndexes: Set<Int> = [8, 13, 18, 23]
        for (index, byte) in bytes.enumerated() {
            if hyphenIndexes.contains(index) {
                guard byte == 0x2d else {
                    return false
                }
            } else {
                let hexadecimal =
                    (0x30...0x39).contains(byte)
                    || (0x61...0x66).contains(byte)
                guard hexadecimal else {
                    return false
                }
            }
        }
        return true
    }
}

struct AWSWitnessStoreGenerationV1:
    Equatable,
    Sendable
{
    private static let domain =
        Array("FGV7AWSGEN1".utf8)

    let tableIdentity: AWSWitnessTableIdentityV1
    let storeGenerationID: CanonicalBytes32

    static func bind(
        pinnedTableARN: String,
        preflight:
            AWSWitnessDescribeTableResponseV1,
        postflight:
            AWSWitnessDescribeTableResponseV1
    ) throws -> Self {
        guard
            preflight.tableARN == pinnedTableARN,
            postflight.tableARN == pinnedTableARN,
            preflight.tableID == postflight.tableID,
            preflight.tableStatus == "ACTIVE",
            postflight.tableStatus == "ACTIVE",
            !preflight.unknownFieldsPresent,
            !postflight.unknownFieldsPresent
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        let identity = try AWSWitnessTableIdentityV1(
            tableARN: pinnedTableARN,
            tableID: preflight.tableID
        )
        return Self(
            tableIdentity: identity,
            storeGenerationID:
                try generationID(for: identity)
        )
    }

    func requireUnchanged(
        _ observation:
            AWSWitnessDescribeTableResponseV1
    ) throws {
        guard
            observation.tableARN
                == tableIdentity.tableARN,
            observation.tableID
                == tableIdentity.tableID,
            observation.tableStatus == "ACTIVE",
            !observation.unknownFieldsPresent
        else {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    static func describeRequest(
        pinnedTableARN: String
    ) throws -> AWSWitnessDescribeTableRequestV1 {
        guard
            AWSWitnessTableIdentityV1
            .validTableARN(pinnedTableARN)
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        return AWSWitnessDescribeTableRequestV1(
            tableARN: pinnedTableARN
        )
    }

    private static func generationID(
        for identity: AWSWitnessTableIdentityV1
    ) throws -> CanonicalBytes32 {
        let arn = Array(identity.tableARN.utf8)
        let tableID = Array(identity.tableID.utf8)
        var preimage = domain
        appendLengthPrefixed(arn, to: &preimage)
        appendLengthPrefixed(tableID, to: &preimage)
        return try CanonicalBytes32(
            Array(SHA256.hash(data: Data(preimage)))
        )
    }

    private static func appendLengthPrefixed(
        _ value: [UInt8],
        to output: inout [UInt8]
    ) {
        precondition(value.count <= Int(UInt16.max))
        let count = UInt16(value.count)
        output.append(UInt8(count >> 8))
        output.append(UInt8(truncatingIfNeeded: count))
        output.append(contentsOf: value)
    }
}
