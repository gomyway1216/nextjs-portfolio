import CryptoKit
import Foundation
import FloodgateV7ExternalTrustRootProtocol

struct DynamoWitnessCommitInputV1:
    Equatable,
    Sendable
{
    let tableGeneration:
        AWSWitnessStoreGenerationV1
    let currentState:
        DynamoWitnessStateRecordV1
    let replacementCheckpoint:
        AuthorityRollbackCheckpointV1
    let exactAttemptID: CanonicalBytes32
    let request:
        RemoteMonotonicWitnessRequestV1
    let immutableInitialReceipt:
        RemoteMonotonicWitnessReceiptV1

    init(
        tableGeneration:
            AWSWitnessStoreGenerationV1,
        currentState:
            DynamoWitnessStateRecordV1,
        replacementCheckpoint:
            AuthorityRollbackCheckpointV1,
        exactAttemptID: CanonicalBytes32,
        request:
            RemoteMonotonicWitnessRequestV1,
        immutableInitialReceipt:
            RemoteMonotonicWitnessReceiptV1,
        signerBinding:
            KMSWitnessKeyBindingV1,
        validationUnixSeconds: UInt64
    ) throws {
        let (nextSequence, overflow) =
            currentState.currentCheckpoint
            .journalSequence
            .addingReportingOverflow(1)
        guard
            !overflow,
            currentState.storeGenerationID
                == tableGeneration
                .storeGenerationID,
            currentState.witnessSignerKeyID
                == signerBinding.signerKeyID,
            exactAttemptID
                != currentState.storeGenerationID,
            request.witnessID
                == currentState.witnessID,
            request.endpointID
                == currentState.endpointID,
            request.operation == .advance,
            request.expectedCheckpointSHA256
                == currentState.currentCheckpoint
                .canonicalSHA256(),
            request.candidateCheckpoint
                == replacementCheckpoint,
            currentState.acceptedOperationCount
                < 4_096,
            replacementCheckpoint.journalSequence
                == nextSequence,
            replacementCheckpoint.journalSequence
                <= 4_096,
            replacementCheckpoint.journalID
                == currentState.currentCheckpoint
                .journalID,
            replacementCheckpoint
                .authorityPublicKeyRecordSHA256
                == currentState.currentCheckpoint
                .authorityPublicKeyRecordSHA256,
            replacementCheckpoint
                .journalHeaderSHA256
                == currentState.currentCheckpoint
                .journalHeaderSHA256,
            replacementCheckpoint
                .previousWitnessedCheckpointSHA256
                == currentState.currentCheckpoint
                .canonicalSHA256()
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        do {
            guard
                try immutableInitialReceipt
                .verifiedCheckpoint(
                    for: request,
                    publicKeyRawRepresentation:
                        signerBinding
                        .publicKeyRawRepresentation,
                    nowUnixSeconds:
                        validationUnixSeconds
                ) == replacementCheckpoint
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            _ = try DynamoWitnessOperationRecordV1(
                exactAttemptID: exactAttemptID,
                request: request,
                acceptedCheckpoint:
                    replacementCheckpoint,
                immutableInitialReceipt:
                    immutableInitialReceipt
            )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
        self.tableGeneration = tableGeneration
        self.currentState = currentState
        self.replacementCheckpoint =
            replacementCheckpoint
        self.exactAttemptID = exactAttemptID
        self.request = request
        self.immutableInitialReceipt =
            immutableInitialReceipt
    }
}

struct DynamoWitnessTransactionalReadV1:
    Equatable,
    Sendable
{
    let state: DynamoWitnessStateRecordV1
    let operation:
        DynamoWitnessOperationRecordV1?
}

enum DynamoWitnessCommitDispositionV1:
    Equatable,
    Sendable
{
    case committed
    case definitiveCASLoss
    case transientConflict
    case ambiguous
    case stop
}

enum DynamoWitnessTransactionContractV1 {
    private static let planDomain =
        Array("FGV7DDBPLAN1".utf8)

    private static let stateUpdateNames = [
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

    private static let createOnlyNames = [
        "#pk": "PK",
        "#sk": "SK",
    ]

    private static let stateUpdateExpression =
        "SET #checkpoint = :replacementCheckpoint, "
        + "#checkpointSHA = :replacementCheckpointSHA, "
        + "#count = :replacementCount"

    private static let stateConditionExpression =
        "attribute_exists(#pk) AND "
        + "attribute_exists(#sk) AND "
        + "#entity = :stateEntity AND "
        + "#version = :version AND "
        + "#witnessID = :witnessID AND "
        + "#endpointID = :endpointID AND "
        + "#signerKeyID = :signerKeyID AND "
        + "#generationID = :generationID AND "
        + "#checkpointSHA = :expectedCheckpointSHA AND "
        + "#count = :expectedCount"

    private static let createOnlyCondition =
        "attribute_not_exists(#pk) AND "
        + "attribute_not_exists(#sk)"

    static func buildReadRequest(
        tableGeneration:
            AWSWitnessStoreGenerationV1,
        witnessID: CanonicalBytes32,
        operationID: CanonicalBytes32
    ) throws -> AWSWitnessTransactGetRequestV1 {
        guard
            witnessID != .zero,
            operationID != .zero,
            witnessID != operationID
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        let tableARN =
            tableGeneration.tableIdentity.tableARN
        return AWSWitnessTransactGetRequestV1(
            items: [
                AWSWitnessTransactGetItemV1(
                    tableARN: tableARN,
                    key: DynamoWitnessRecordCodecV1
                        .stateKey(
                            witnessID: witnessID
                        ),
                    projectionExpression:
                        DynamoWitnessRecordCodecV1
                        .stateProjectionExpression,
                    expressionAttributeNames:
                        DynamoWitnessRecordCodecV1
                        .stateProjectionNames
                ),
                AWSWitnessTransactGetItemV1(
                    tableARN: tableARN,
                    key: DynamoWitnessRecordCodecV1
                        .operationKey(
                            witnessID: witnessID,
                            operationID: operationID
                        ),
                    projectionExpression:
                        DynamoWitnessRecordCodecV1
                        .operationProjectionExpression,
                    expressionAttributeNames:
                        DynamoWitnessRecordCodecV1
                        .operationProjectionNames
                ),
            ],
            returnConsumedCapacity: false
        )
    }

    static func decodeReadResponse(
        request: AWSWitnessTransactGetRequestV1,
        response:
            AWSWitnessTransactGetResponseV1,
        tableGeneration:
            AWSWitnessStoreGenerationV1,
        signerBinding: KMSWitnessKeyBindingV1
    ) throws -> DynamoWitnessTransactionalReadV1 {
        do {
            guard
                request.items.count == 2,
                !request.returnConsumedCapacity,
                response.responses.count == 2,
                !response.unknownFieldsPresent,
                let stateItem = response.responses[0]
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let state =
                try DynamoWitnessRecordCodecV1
                .decodeState(stateItem)
            let expected = try buildReadRequest(
                tableGeneration: tableGeneration,
                witnessID: state.witnessID,
                operationID:
                    operationID(
                        from: request.items[1].key
                    )
            )
            guard
                request == expected,
                state.storeGenerationID
                    == tableGeneration
                    .storeGenerationID,
                state.witnessSignerKeyID
                    == signerBinding.signerKeyID
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            let operation =
                try response.responses[1].map {
                    try DynamoWitnessRecordCodecV1
                        .decodeOperation(
                            $0,
                            signerBinding:
                                signerBinding
                        )
                }
            if let operation {
                guard
                    operation.request.witnessID
                        == state.witnessID,
                    operation.request.endpointID
                        == state.endpointID,
                    request.items[1].key
                        == DynamoWitnessRecordCodecV1
                        .operationKey(
                            witnessID:
                                state.witnessID,
                            operationID:
                                operation.request
                                .operationID
                        )
                else {
                    throw AWSWitnessContractErrorV1.stop
                }
            }
            return DynamoWitnessTransactionalReadV1(
                state: state,
                operation: operation
            )
        } catch {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    static func buildWriteRequest(
        _ input: DynamoWitnessCommitInputV1
    ) throws -> AWSWitnessTransactWriteRequestV1 {
        let operation =
            try DynamoWitnessOperationRecordV1(
                exactAttemptID: input.exactAttemptID,
                request: input.request,
                acceptedCheckpoint:
                    input.replacementCheckpoint,
                immutableInitialReceipt:
                    input.immutableInitialReceipt
            )
        let planSHA256 = commitPlanSHA256(input)
        let token =
            DynamoWitnessRecordCodecV1
            .clientRequestToken(for: planSHA256)
        let attempt =
            try DynamoWitnessAttemptRecordV1(
                exactAttemptID: input.exactAttemptID,
                operationID:
                    input.request.operationID,
                requestSHA256:
                    input.request.canonicalSHA256(),
                expectedCheckpointSHA256:
                    input.currentState
                    .currentCheckpoint
                    .canonicalSHA256(),
                expectedAcceptedOperationCount:
                    input.currentState
                    .acceptedOperationCount,
                replacementCheckpointSHA256:
                    input.replacementCheckpoint
                    .canonicalSHA256(),
                commitPlanSHA256: planSHA256,
                clientRequestToken: token
            )
        let tableARN =
            input.tableGeneration
            .tableIdentity.tableARN
        let stateValues:
            [String: AWSWitnessAttributeValueV1] =
            [
                ":stateEntity": .string("STATE"),
                ":version": .number("1"),
                ":witnessID": .binary(
                    input.currentState
                        .witnessID.bytes
                ),
                ":endpointID": .binary(
                    input.currentState
                        .endpointID.bytes
                ),
                ":signerKeyID": .binary(
                    input.currentState
                        .witnessSignerKeyID.bytes
                ),
                ":generationID": .binary(
                    input.currentState
                        .storeGenerationID.bytes
                ),
                ":expectedCheckpointSHA": .binary(
                    input.currentState
                        .currentCheckpoint
                        .canonicalSHA256().bytes
                ),
                ":expectedCount": .number(
                    String(
                        input.currentState
                            .acceptedOperationCount
                    )
                ),
                ":replacementCheckpoint": .binary(
                    input.replacementCheckpoint
                        .canonicalBytes()
                ),
                ":replacementCheckpointSHA":
                    .binary(
                        input.replacementCheckpoint
                            .canonicalSHA256().bytes
                    ),
                ":replacementCount": .number(
                    String(
                        input.currentState
                            .acceptedOperationCount + 1
                    )
                ),
            ]
        return AWSWitnessTransactWriteRequestV1(
            clientRequestToken: token,
            actions: [
                .update(
                    AWSWitnessUpdateActionV1(
                        tableARN: tableARN,
                        key:
                            DynamoWitnessRecordCodecV1
                            .stateKey(
                                witnessID:
                                    input.currentState
                                    .witnessID
                            ),
                        updateExpression:
                            stateUpdateExpression,
                        conditionExpression:
                            stateConditionExpression,
                        expressionAttributeNames:
                            stateUpdateNames,
                        expressionAttributeValues:
                            stateValues
                    )
                ),
                .put(
                    AWSWitnessPutActionV1(
                        tableARN: tableARN,
                        item:
                            DynamoWitnessRecordCodecV1
                            .encodeOperation(operation),
                        conditionExpression:
                            createOnlyCondition,
                        expressionAttributeNames:
                            createOnlyNames
                    )
                ),
                .put(
                    AWSWitnessPutActionV1(
                        tableARN: tableARN,
                        item:
                            DynamoWitnessRecordCodecV1
                            .encodeAttempt(
                                attempt,
                                witnessID:
                                    input.currentState
                                    .witnessID
                            ),
                        conditionExpression:
                            createOnlyCondition,
                        expressionAttributeNames:
                            createOnlyNames
                    )
                ),
            ],
            returnConsumedCapacity: false,
            returnItemCollectionMetrics: false
        )
    }

    static func requireExactWriteRequest(
        _ request:
            AWSWitnessTransactWriteRequestV1,
        input: DynamoWitnessCommitInputV1
    ) throws {
        guard
            request == (try buildWriteRequest(input)),
            (1...36).contains(
                request.clientRequestToken.utf8.count
            ),
            request.actions.count == 3
        else {
            throw AWSWitnessContractErrorV1.stop
        }
    }

    static func classify(
        _ result:
            AWSWitnessTransactWriteInvocationResultV1,
        expectedClientRequestToken: String
    ) -> DynamoWitnessCommitDispositionV1 {
        switch result {
        case let .success(response):
            let requestIDBytes =
                Array(response.requestID.utf8)
            guard
                response.submittedClientRequestToken
                    == expectedClientRequestToken,
                response.httpStatusCode == 200,
                (1...1_024).contains(
                    requestIDBytes.count
                ),
                requestIDBytes.allSatisfy({
                    $0 >= 0x21 && $0 <= 0x7e
                }),
                !response.unknownFieldsPresent
            else {
                return .stop
            }
            return .committed
        case let .failure(failure):
            return classify(failure)
        }
    }

    static func submit(
        _ input: DynamoWitnessCommitInputV1,
        provider:
            AWSWitnessTransactWriteProviderV1
    ) async -> DynamoWitnessCommitDispositionV1 {
        let request:
            AWSWitnessTransactWriteRequestV1
        do {
            request = try buildWriteRequest(input)
            try requireExactWriteRequest(
                request,
                input: input
            )
        } catch {
            return .stop
        }
        do {
            return classify(
                try await provider(request),
                expectedClientRequestToken:
                    request.clientRequestToken
            )
        } catch {
            // An untyped thrown transport result may have committed.
            return .ambiguous
        }
    }

    static func commitPlanSHA256(
        _ input: DynamoWitnessCommitInputV1
    ) -> CanonicalBytes32 {
        var preimage = planDomain
        appendLengthPrefixed(
            Array(
                input.tableGeneration
                    .tableIdentity.tableARN.utf8
            ),
            to: &preimage
        )
        preimage += input.currentState.witnessID.bytes
        preimage += input.currentState.endpointID.bytes
        preimage +=
            input.currentState
            .witnessSignerKeyID.bytes
        preimage +=
            input.currentState.storeGenerationID.bytes
        preimage +=
            input.currentState.currentCheckpoint
            .canonicalBytes()
        append(
            UInt64(
                input.currentState
                    .acceptedOperationCount
            ),
            to: &preimage
        )
        preimage += input.replacementCheckpoint
            .canonicalBytes()
        preimage += input.exactAttemptID.bytes
        preimage += input.request.canonicalBytes()
        preimage += input.immutableInitialReceipt
            .canonicalBytes()
        return DynamoWitnessRecordCodecV1.sha256(
            preimage
        )
    }

    private static func classify(
        _ failure: AWSWitnessProviderFailureV1
    ) -> DynamoWitnessCommitDispositionV1 {
        switch failure {
        case .conditionalCheckFailed:
            return .definitiveCASLoss
        case let .transactionCanceled(reasons):
            guard reasons.count == 3 else {
                return .stop
            }
            if reasons.contains(where: {
                if case .unknown = $0 {
                    return true
                }
                return $0 == .validation
            }) {
                return .stop
            }
            if reasons.contains(
                .conditionalCheckFailed
            ) {
                return .definitiveCASLoss
            }
            if reasons.contains(.transactionConflict)
                || reasons.contains(.throttling)
                || reasons.contains(
                    .provisionedThroughputExceeded
                )
            {
                return .transientConflict
            }
            return .stop
        case .transactionConflict,
            .throttling,
            .provisionedThroughputExceeded,
            .requestLimitExceeded:
            return .transientConflict
        case .requestTimeout,
            .networkUnavailable,
            .internalServerError,
            .transactionInProgress:
            return .ambiguous
        case .accessDenied,
            .resourceNotFound,
            .validation,
            .idempotentParameterMismatch,
            .unknown:
            return .stop
        }
    }

    private static func operationID(
        from key: AWSWitnessPrimaryKeyV1
    ) throws -> CanonicalBytes32 {
        let prefix = "OP#"
        guard
            key.sortKey.hasPrefix(prefix),
            key.sortKey.utf8.count == 67
        else {
            throw AWSWitnessContractErrorV1.stop
        }
        let hex = key.sortKey.dropFirst(prefix.count)
        var bytes: [UInt8] = []
        bytes.reserveCapacity(32)
        var index = hex.startIndex
        for _ in 0..<32 {
            let next = hex.index(
                index,
                offsetBy: 2
            )
            guard
                let byte = UInt8(
                    hex[index..<next],
                    radix: 16
                )
            else {
                throw AWSWitnessContractErrorV1.stop
            }
            bytes.append(byte)
            index = next
        }
        guard index == hex.endIndex else {
            throw AWSWitnessContractErrorV1.stop
        }
        return try CanonicalBytes32(bytes)
    }

    private static func appendLengthPrefixed(
        _ value: [UInt8],
        to output: inout [UInt8]
    ) {
        precondition(value.count <= Int(UInt16.max))
        let count = UInt16(value.count)
        output.append(UInt8(count >> 8))
        output.append(UInt8(truncatingIfNeeded: count))
        output += value
    }

    private static func append(
        _ value: UInt64,
        to output: inout [UInt8]
    ) {
        for shift in stride(
            from: 56,
            through: 0,
            by: -8
        ) {
            output.append(
                UInt8(
                    truncatingIfNeeded:
                        value >> UInt64(shift)
                )
            )
        }
    }
}
