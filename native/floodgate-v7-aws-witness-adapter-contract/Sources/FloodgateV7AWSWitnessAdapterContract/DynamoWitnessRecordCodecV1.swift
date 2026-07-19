import CryptoKit
import Foundation
import FloodgateV7ExternalTrustRootProtocol

struct DynamoWitnessStateRecordV1:
    Equatable,
    Sendable
{
    let witnessID: CanonicalBytes32
    let endpointID: CanonicalBytes32
    let witnessSignerKeyID: CanonicalBytes32
    let storeGenerationID: CanonicalBytes32
    let currentCheckpoint:
        AuthorityRollbackCheckpointV1
    let acceptedOperationCount: Int

    init(
        witnessID: CanonicalBytes32,
        endpointID: CanonicalBytes32,
        witnessSignerKeyID: CanonicalBytes32,
        storeGenerationID: CanonicalBytes32,
        currentCheckpoint:
            AuthorityRollbackCheckpointV1,
        acceptedOperationCount: Int
    ) throws {
        let identityValues = [
            witnessID,
            endpointID,
            witnessSignerKeyID,
            storeGenerationID,
        ]
        guard
            identityValues.allSatisfy({
                $0 != .zero
            }),
            Set(identityValues).count
                == identityValues.count,
            endpointID
                == DynamoWitnessRecordCodecV1
                .boundEndpointID(
                    witnessID: witnessID,
                    storeGenerationID:
                        storeGenerationID
                ),
            currentCheckpoint.journalSequence
                <= 4_096,
            (0...4_096).contains(
                acceptedOperationCount
            )
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        self.witnessID = witnessID
        self.endpointID = endpointID
        self.witnessSignerKeyID =
            witnessSignerKeyID
        self.storeGenerationID = storeGenerationID
        self.currentCheckpoint = currentCheckpoint
        self.acceptedOperationCount =
            acceptedOperationCount
    }
}

struct DynamoWitnessOperationRecordV1:
    Equatable,
    Sendable
{
    let exactAttemptID: CanonicalBytes32
    let request:
        RemoteMonotonicWitnessRequestV1
    let acceptedCheckpoint:
        AuthorityRollbackCheckpointV1
    let immutableInitialReceipt:
        RemoteMonotonicWitnessReceiptV1

    init(
        exactAttemptID: CanonicalBytes32,
        request:
            RemoteMonotonicWitnessRequestV1,
        acceptedCheckpoint:
            AuthorityRollbackCheckpointV1,
        immutableInitialReceipt:
            RemoteMonotonicWitnessReceiptV1
    ) throws {
        let aliases = [
            request.witnessID,
            request.endpointID,
            request.clientNonce,
            request.operationID,
            request.expectedCheckpointSHA256,
            request.canonicalSHA256(),
            acceptedCheckpoint.canonicalSHA256(),
            immutableInitialReceipt
                .witnessSignerKeyID,
        ]
        guard
            exactAttemptID != .zero,
            !aliases.contains(exactAttemptID),
            request.operation == .advance,
            request.candidateCheckpoint
                == acceptedCheckpoint,
            immutableInitialReceipt.operation
                == .advance,
            immutableInitialReceipt.accepted,
            immutableInitialReceipt.witnessID
                == request.witnessID,
            immutableInitialReceipt.endpointID
                == request.endpointID,
            immutableInitialReceipt.clientNonce
                == request.clientNonce,
            immutableInitialReceipt.operationID
                == request.operationID,
            immutableInitialReceipt.requestSHA256
                == request.canonicalSHA256(),
            immutableInitialReceipt.checkpoint
                == acceptedCheckpoint
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        self.exactAttemptID = exactAttemptID
        self.request = request
        self.acceptedCheckpoint =
            acceptedCheckpoint
        self.immutableInitialReceipt =
            immutableInitialReceipt
    }
}

struct DynamoWitnessAttemptRecordV1:
    Equatable,
    Sendable
{
    let exactAttemptID: CanonicalBytes32
    let operationID: CanonicalBytes32
    let requestSHA256: CanonicalBytes32
    let expectedCheckpointSHA256:
        CanonicalBytes32
    let expectedAcceptedOperationCount: Int
    let replacementCheckpointSHA256:
        CanonicalBytes32
    let commitPlanSHA256: CanonicalBytes32
    let clientRequestToken: String

    init(
        exactAttemptID: CanonicalBytes32,
        operationID: CanonicalBytes32,
        requestSHA256: CanonicalBytes32,
        expectedCheckpointSHA256:
            CanonicalBytes32,
        expectedAcceptedOperationCount: Int,
        replacementCheckpointSHA256:
            CanonicalBytes32,
        commitPlanSHA256: CanonicalBytes32,
        clientRequestToken: String
    ) throws {
        let nonzero = [
            exactAttemptID,
            operationID,
            requestSHA256,
            expectedCheckpointSHA256,
            replacementCheckpointSHA256,
            commitPlanSHA256,
        ]
        guard
            nonzero.allSatisfy({ $0 != .zero }),
            exactAttemptID != operationID,
            expectedCheckpointSHA256
                != replacementCheckpointSHA256,
            (0..<4_096).contains(
                expectedAcceptedOperationCount
            ),
            clientRequestToken
                == DynamoWitnessRecordCodecV1
                .clientRequestToken(
                    for: commitPlanSHA256
                )
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        self.exactAttemptID = exactAttemptID
        self.operationID = operationID
        self.requestSHA256 = requestSHA256
        self.expectedCheckpointSHA256 =
            expectedCheckpointSHA256
        self.expectedAcceptedOperationCount =
            expectedAcceptedOperationCount
        self.replacementCheckpointSHA256 =
            replacementCheckpointSHA256
        self.commitPlanSHA256 = commitPlanSHA256
        self.clientRequestToken =
            clientRequestToken
    }
}

enum DynamoWitnessRecordCodecV1 {
    static let stateProjectionExpression =
        "#pk,#sk,#entity,#version,#witnessID,"
        + "#endpointID,#signerKeyID,#generationID,"
        + "#checkpoint,#checkpointSHA,#count"

    static let operationProjectionExpression =
        "#pk,#sk,#entity,#version,#attemptID,"
        + "#request,#requestSHA,#acceptedCheckpoint,"
        + "#acceptedCheckpointSHA,#receipt"

    static let stateProjectionNames = [
        "#pk": "PK",
        "#sk": "SK",
        "#entity": "entity",
        "#version": "schema_version",
        "#witnessID": "witness_id",
        "#endpointID": "endpoint_id",
        "#signerKeyID": "witness_signer_key_id",
        "#generationID": "store_generation_id",
        "#checkpoint": "current_checkpoint",
        "#checkpointSHA":
            "current_checkpoint_sha256",
        "#count": "accepted_operation_count",
    ]

    static let operationProjectionNames = [
        "#pk": "PK",
        "#sk": "SK",
        "#entity": "entity",
        "#version": "schema_version",
        "#attemptID": "exact_attempt_id",
        "#request": "request_canonical_bytes",
        "#requestSHA": "request_sha256",
        "#acceptedCheckpoint":
            "accepted_checkpoint",
        "#acceptedCheckpointSHA":
            "accepted_checkpoint_sha256",
        "#receipt": "immutable_initial_receipt",
    ]

    private static let stateAttributes: Set<String> =
        Set(stateProjectionNames.values)
    private static let operationAttributes:
        Set<String> =
        Set(operationProjectionNames.values)
    private static let attemptAttributes:
        Set<String> = [
            "PK",
            "SK",
            "entity",
            "schema_version",
            "exact_attempt_id",
            "operation_id",
            "request_sha256",
            "expected_checkpoint_sha256",
            "expected_accepted_operation_count",
            "replacement_checkpoint_sha256",
            "commit_plan_sha256",
            "client_request_token",
        ]

    private static let endpointDomain =
        Array("FGV7DEI1".utf8)

    static func partitionKey(
        witnessID: CanonicalBytes32
    ) -> String {
        "WITNESS#\(hex(witnessID.bytes))"
    }

    static func stateKey(
        witnessID: CanonicalBytes32
    ) -> AWSWitnessPrimaryKeyV1 {
        AWSWitnessPrimaryKeyV1(
            partitionKey:
                partitionKey(witnessID: witnessID),
            sortKey: "STATE"
        )
    }

    static func operationKey(
        witnessID: CanonicalBytes32,
        operationID: CanonicalBytes32
    ) -> AWSWitnessPrimaryKeyV1 {
        AWSWitnessPrimaryKeyV1(
            partitionKey:
                partitionKey(witnessID: witnessID),
            sortKey:
                "OP#\(hex(operationID.bytes))"
        )
    }

    static func attemptKey(
        witnessID: CanonicalBytes32,
        exactAttemptID: CanonicalBytes32
    ) -> AWSWitnessPrimaryKeyV1 {
        AWSWitnessPrimaryKeyV1(
            partitionKey:
                partitionKey(witnessID: witnessID),
            sortKey:
                "ATTEMPT#\(hex(exactAttemptID.bytes))"
        )
    }

    static func encodeState(
        _ record: DynamoWitnessStateRecordV1
    ) -> AWSWitnessItemV1 {
        let checkpoint =
            record.currentCheckpoint.canonicalBytes()
        return [
            "PK": .string(
                partitionKey(
                    witnessID: record.witnessID
                )
            ),
            "SK": .string("STATE"),
            "entity": .string("STATE"),
            "schema_version": .number("1"),
            "witness_id": .binary(
                record.witnessID.bytes
            ),
            "endpoint_id": .binary(
                record.endpointID.bytes
            ),
            "witness_signer_key_id": .binary(
                record.witnessSignerKeyID.bytes
            ),
            "store_generation_id": .binary(
                record.storeGenerationID.bytes
            ),
            "current_checkpoint": .binary(
                checkpoint
            ),
            "current_checkpoint_sha256":
                .binary(sha256(checkpoint).bytes),
            "accepted_operation_count": .number(
                String(record.acceptedOperationCount)
            ),
        ]
    }

    static func decodeState(
        _ item: AWSWitnessItemV1
    ) throws -> DynamoWitnessStateRecordV1 {
        do {
            try requireExactAttributes(
                item,
                stateAttributes
            )
            guard
                try string(item, "entity")
                    == "STATE",
                try number(item, "schema_version")
                    == 1
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let witnessID = try bytes32(
                item,
                "witness_id"
            )
            let checkpointBytes = try binary(
                item,
                "current_checkpoint"
            )
            let checkpoint =
                try AuthorityRollbackCheckpointV1
                .decodeCanonical(checkpointBytes)
            guard
                try string(item, "PK")
                    == partitionKey(
                        witnessID: witnessID
                    ),
                try string(item, "SK") == "STATE",
                try bytes32(
                    item,
                    "current_checkpoint_sha256"
                ) == sha256(checkpointBytes)
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let acceptedCount = try number(
                item,
                "accepted_operation_count"
            )
            guard
                let exactAcceptedCount = Int(
                    exactly: acceptedCount
                )
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            return try DynamoWitnessStateRecordV1(
                witnessID: witnessID,
                endpointID: bytes32(
                    item,
                    "endpoint_id"
                ),
                witnessSignerKeyID: bytes32(
                    item,
                    "witness_signer_key_id"
                ),
                storeGenerationID: bytes32(
                    item,
                    "store_generation_id"
                ),
                currentCheckpoint: checkpoint,
                acceptedOperationCount:
                    exactAcceptedCount
            )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    static func encodeOperation(
        _ record:
            DynamoWitnessOperationRecordV1
    ) -> AWSWitnessItemV1 {
        let request = record.request.canonicalBytes()
        let checkpoint =
            record.acceptedCheckpoint
            .canonicalBytes()
        return [
            "PK": .string(
                partitionKey(
                    witnessID:
                        record.request.witnessID
                )
            ),
            "SK": .string(
                operationKey(
                    witnessID:
                        record.request.witnessID,
                    operationID:
                        record.request.operationID
                ).sortKey
            ),
            "entity": .string("OP"),
            "schema_version": .number("1"),
            "exact_attempt_id": .binary(
                record.exactAttemptID.bytes
            ),
            "request_canonical_bytes":
                .binary(request),
            "request_sha256": .binary(
                sha256(request).bytes
            ),
            "accepted_checkpoint":
                .binary(checkpoint),
            "accepted_checkpoint_sha256":
                .binary(sha256(checkpoint).bytes),
            "immutable_initial_receipt":
                .binary(
                    record.immutableInitialReceipt
                    .canonicalBytes()
                ),
        ]
    }

    static func decodeOperation(
        _ item: AWSWitnessItemV1,
        signerBinding: KMSWitnessKeyBindingV1
    ) throws -> DynamoWitnessOperationRecordV1 {
        do {
            try requireExactAttributes(
                item,
                operationAttributes
            )
            guard
                try string(item, "entity") == "OP",
                try number(item, "schema_version")
                    == 1
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let requestBytes = try binary(
                item,
                "request_canonical_bytes"
            )
            let request =
                try RemoteMonotonicWitnessRequestV1
                .decodeCanonical(requestBytes)
            let checkpointBytes = try binary(
                item,
                "accepted_checkpoint"
            )
            let checkpoint =
                try AuthorityRollbackCheckpointV1
                .decodeCanonical(checkpointBytes)
            let receipt =
                try RemoteMonotonicWitnessReceiptV1
                .decodeCanonical(
                    binary(
                        item,
                        "immutable_initial_receipt"
                    )
                )
            guard
                try string(item, "PK")
                    == partitionKey(
                        witnessID: request.witnessID
                    ),
                try string(item, "SK")
                    == operationKey(
                        witnessID:
                            request.witnessID,
                        operationID:
                            request.operationID
                    ).sortKey,
                try bytes32(
                    item,
                    "request_sha256"
                ) == sha256(requestBytes),
                try bytes32(
                    item,
                    "accepted_checkpoint_sha256"
                ) == sha256(checkpointBytes)
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let record =
                try DynamoWitnessOperationRecordV1(
                exactAttemptID: bytes32(
                    item,
                    "exact_attempt_id"
                ),
                request: request,
                acceptedCheckpoint: checkpoint,
                immutableInitialReceipt: receipt
            )
            guard
                receipt.witnessSignerKeyID
                    == signerBinding.signerKeyID,
                try receipt.verifiedCheckpoint(
                    for: request,
                    publicKeyRawRepresentation:
                        signerBinding
                        .publicKeyRawRepresentation,
                    nowUnixSeconds:
                        receipt.issuedAtUnixSeconds
                ) == checkpoint
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            return record
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    static func encodeAttempt(
        _ record:
            DynamoWitnessAttemptRecordV1,
        witnessID: CanonicalBytes32
    ) -> AWSWitnessItemV1 {
        [
            "PK": .string(
                partitionKey(witnessID: witnessID)
            ),
            "SK": .string(
                attemptKey(
                    witnessID: witnessID,
                    exactAttemptID:
                        record.exactAttemptID
                ).sortKey
            ),
            "entity": .string("ATTEMPT"),
            "schema_version": .number("1"),
            "exact_attempt_id": .binary(
                record.exactAttemptID.bytes
            ),
            "operation_id": .binary(
                record.operationID.bytes
            ),
            "request_sha256": .binary(
                record.requestSHA256.bytes
            ),
            "expected_checkpoint_sha256":
                .binary(
                    record
                        .expectedCheckpointSHA256
                        .bytes
                ),
            "expected_accepted_operation_count":
                .number(
                    String(
                        record
                            .expectedAcceptedOperationCount
                    )
                ),
            "replacement_checkpoint_sha256":
                .binary(
                    record
                        .replacementCheckpointSHA256
                        .bytes
                ),
            "commit_plan_sha256": .binary(
                record.commitPlanSHA256.bytes
            ),
            "client_request_token": .string(
                record.clientRequestToken
            ),
        ]
    }

    static func decodeAttempt(
        _ item: AWSWitnessItemV1,
        witnessID: CanonicalBytes32
    ) throws -> DynamoWitnessAttemptRecordV1 {
        do {
            try requireExactAttributes(
                item,
                attemptAttributes
            )
            guard
                try string(item, "entity")
                    == "ATTEMPT",
                try number(item, "schema_version")
                    == 1
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let attemptID = try bytes32(
                item,
                "exact_attempt_id"
            )
            guard
                try string(item, "PK")
                    == partitionKey(
                        witnessID: witnessID
                    ),
                try string(item, "SK")
                    == attemptKey(
                        witnessID: witnessID,
                        exactAttemptID: attemptID
                    ).sortKey
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let expectedCount = try number(
                item,
                "expected_accepted_operation_count"
            )
            guard
                let exactExpectedCount = Int(
                    exactly: expectedCount
                )
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            return try DynamoWitnessAttemptRecordV1(
                exactAttemptID: attemptID,
                operationID: bytes32(
                    item,
                    "operation_id"
                ),
                requestSHA256: bytes32(
                    item,
                    "request_sha256"
                ),
                expectedCheckpointSHA256:
                    bytes32(
                        item,
                        "expected_checkpoint_sha256"
                    ),
                expectedAcceptedOperationCount:
                    exactExpectedCount,
                replacementCheckpointSHA256:
                    bytes32(
                        item,
                        "replacement_checkpoint_sha256"
                    ),
                commitPlanSHA256: bytes32(
                    item,
                    "commit_plan_sha256"
                ),
                clientRequestToken: string(
                    item,
                    "client_request_token"
                )
            )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    static func boundEndpointID(
        witnessID: CanonicalBytes32,
        storeGenerationID: CanonicalBytes32
    ) -> CanonicalBytes32 {
        sha256(
            endpointDomain
                + witnessID.bytes
                + storeGenerationID.bytes
        )
    }

    static func sha256(
        _ bytes: [UInt8]
    ) -> CanonicalBytes32 {
        try! CanonicalBytes32(
            Array(SHA256.hash(data: Data(bytes)))
        )
    }

    static func clientRequestToken(
        for planSHA256: CanonicalBytes32
    ) -> String {
        let prefix = Array(
            planSHA256.bytes.prefix(20)
        )
        let token = "FGV1" + base32(prefix)
        precondition(token.utf8.count == 36)
        return token
    }

    private static func base32(
        _ bytes: [UInt8]
    ) -> String {
        precondition(bytes.count == 20)
        let alphabet =
            Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".utf8)
        var output: [UInt8] = []
        output.reserveCapacity(32)
        for outputIndex in 0..<32 {
            let bitOffset = outputIndex * 5
            let byteIndex = bitOffset / 8
            let bitIndex = bitOffset % 8
            let first = UInt16(bytes[byteIndex])
            let second =
                byteIndex + 1 < bytes.count
                    ? UInt16(bytes[byteIndex + 1])
                    : 0
            let window = (first << 8) | second
            let index = Int(
                (window >> UInt16(11 - bitIndex))
                    & 0x1f
            )
            output.append(alphabet[index])
        }
        return String(
            decoding: output,
            as: UTF8.self
        )
    }

    private static func hex(
        _ bytes: [UInt8]
    ) -> String {
        let alphabet =
            Array("0123456789abcdef".utf8)
        var output: [UInt8] = []
        output.reserveCapacity(bytes.count * 2)
        for byte in bytes {
            output.append(
                alphabet[Int(byte >> 4)]
            )
            output.append(
                alphabet[Int(byte & 0x0f)]
            )
        }
        return String(
            decoding: output,
            as: UTF8.self
        )
    }

    private static func requireExactAttributes(
        _ item: AWSWitnessItemV1,
        _ expected: Set<String>
    ) throws {
        guard Set(item.keys) == expected else {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    private static func binary(
        _ item: AWSWitnessItemV1,
        _ name: String
    ) throws -> [UInt8] {
        guard
            case let .binary(value)? = item[name]
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        return value
    }

    private static func bytes32(
        _ item: AWSWitnessItemV1,
        _ name: String
    ) throws -> CanonicalBytes32 {
        do {
            return try CanonicalBytes32(
                binary(item, name)
            )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    private static func string(
        _ item: AWSWitnessItemV1,
        _ name: String
    ) throws -> String {
        guard
            case let .string(value)? = item[name]
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        return value
    }

    private static func number(
        _ item: AWSWitnessItemV1,
        _ name: String
    ) throws -> UInt64 {
        guard
            case let .number(value)? = item[name],
            !value.isEmpty,
            !value.hasPrefix("+"),
            !value.hasPrefix("-"),
            let number = UInt64(value),
            String(number) == value
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        return number
    }
}
