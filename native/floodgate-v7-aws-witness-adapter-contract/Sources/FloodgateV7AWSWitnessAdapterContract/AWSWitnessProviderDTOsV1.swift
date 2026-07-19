import Foundation

enum AWSWitnessContractErrorV1:
    Error,
    Equatable,
    Sendable
{
    case stop
}

enum AWSWitnessAttributeValueV1:
    Equatable,
    Sendable
{
    case binary([UInt8])
    case boolean(Bool)
    case number(String)
    case string(String)
}

typealias AWSWitnessItemV1 =
    [String: AWSWitnessAttributeValueV1]

struct AWSWitnessPrimaryKeyV1:
    Equatable,
    Sendable
{
    let partitionKey: String
    let sortKey: String

    var item: AWSWitnessItemV1 {
        [
            "PK": .string(partitionKey),
            "SK": .string(sortKey),
        ]
    }
}

struct AWSWitnessTransactGetItemV1:
    Equatable,
    Sendable
{
    let tableARN: String
    let key: AWSWitnessPrimaryKeyV1
    let projectionExpression: String
    let expressionAttributeNames: [String: String]
}

struct AWSWitnessTransactGetRequestV1:
    Equatable,
    Sendable
{
    let items: [AWSWitnessTransactGetItemV1]
    let returnConsumedCapacity: Bool
}

struct AWSWitnessTransactGetResponseV1:
    Equatable,
    Sendable
{
    /// Provider response order must exactly match request order.
    let responses: [AWSWitnessItemV1?]
    let unknownFieldsPresent: Bool
}

struct AWSWitnessUpdateActionV1:
    Equatable,
    Sendable
{
    let tableARN: String
    let key: AWSWitnessPrimaryKeyV1
    let updateExpression: String
    let conditionExpression: String
    let expressionAttributeNames: [String: String]
    let expressionAttributeValues:
        [String: AWSWitnessAttributeValueV1]
}

struct AWSWitnessPutActionV1:
    Equatable,
    Sendable
{
    let tableARN: String
    let item: AWSWitnessItemV1
    let conditionExpression: String
    let expressionAttributeNames: [String: String]
}

enum AWSWitnessTransactWriteActionV1:
    Equatable,
    Sendable
{
    case update(AWSWitnessUpdateActionV1)
    case put(AWSWitnessPutActionV1)
}

struct AWSWitnessTransactWriteRequestV1:
    Equatable,
    Sendable
{
    let clientRequestToken: String
    let actions: [AWSWitnessTransactWriteActionV1]
    let returnConsumedCapacity: Bool
    let returnItemCollectionMetrics: Bool
}

struct AWSWitnessTransactWriteResponseV1:
    Equatable,
    Sendable
{
    /// The adapter copies the submitted token into the response envelope.
    let submittedClientRequestToken: String
    let httpStatusCode: Int
    let requestID: String
    let unknownFieldsPresent: Bool
}

enum AWSWitnessCancellationReasonV1:
    Equatable,
    Sendable
{
    case none
    case conditionalCheckFailed
    case transactionConflict
    case throttling
    case provisionedThroughputExceeded
    case validation
    case unknown(String)
}

enum AWSWitnessProviderFailureV1:
    Equatable,
    Sendable
{
    case conditionalCheckFailed
    case transactionCanceled(
        [AWSWitnessCancellationReasonV1]
    )
    case transactionConflict
    case throttling
    case provisionedThroughputExceeded
    case requestLimitExceeded
    case requestTimeout
    case networkUnavailable
    case internalServerError
    case transactionInProgress
    case accessDenied
    case resourceNotFound
    case validation
    case idempotentParameterMismatch
    case unknown(String)
}

enum AWSWitnessTransactWriteInvocationResultV1:
    Equatable,
    Sendable
{
    case success(AWSWitnessTransactWriteResponseV1)
    case failure(AWSWitnessProviderFailureV1)
}

struct AWSWitnessDescribeTableRequestV1:
    Equatable,
    Sendable
{
    let tableARN: String
}

struct AWSWitnessDescribeTableResponseV1:
    Equatable,
    Sendable
{
    let tableARN: String
    let tableID: String
    let tableStatus: String
    let unknownFieldsPresent: Bool
}

enum AWSWitnessKMSKeySpecV1:
    String,
    Equatable,
    Sendable
{
    case eccNistEdwards25519 =
        "ECC_NIST_EDWARDS25519"
    case rsa2048 = "RSA_2048"
}

enum AWSWitnessKMSKeyUsageV1:
    String,
    Equatable,
    Sendable
{
    case signVerify = "SIGN_VERIFY"
    case encryptDecrypt = "ENCRYPT_DECRYPT"
}

enum AWSWitnessKMSSigningAlgorithmV1:
    String,
    Equatable,
    Sendable
{
    case ed25519SHA512 = "ED25519_SHA_512"
    case ed25519PHSHA512 =
        "ED25519_PH_SHA_512"
    case ecdsaSHA256 = "ECDSA_SHA_256"
}

enum AWSWitnessKMSMessageTypeV1:
    String,
    Equatable,
    Sendable
{
    case raw = "RAW"
    case digest = "DIGEST"
}

struct AWSWitnessKMSGetPublicKeyRequestV1:
    Equatable,
    Sendable
{
    let keyARN: String
    let grantTokens: [String]
}

struct AWSWitnessKMSGetPublicKeyResponseV1:
    Equatable,
    Sendable
{
    let keyARN: String
    let keySpec: AWSWitnessKMSKeySpecV1
    let keyUsage: AWSWitnessKMSKeyUsageV1
    let signingAlgorithms:
        [AWSWitnessKMSSigningAlgorithmV1]
    let subjectPublicKeyInfoDER: [UInt8]
    let unknownFieldsPresent: Bool
}

struct AWSWitnessKMSSignRequestV1:
    Equatable,
    Sendable
{
    let keyARN: String
    let message: [UInt8]
    let messageType: AWSWitnessKMSMessageTypeV1
    let signingAlgorithm:
        AWSWitnessKMSSigningAlgorithmV1
    let grantTokens: [String]
}

struct AWSWitnessKMSSignResponseV1:
    Equatable,
    Sendable
{
    let keyARN: String
    let signingAlgorithm:
        AWSWitnessKMSSigningAlgorithmV1
    let signature: [UInt8]
    let unknownFieldsPresent: Bool
}

typealias AWSWitnessTransactGetProviderV1 =
    @Sendable (
        AWSWitnessTransactGetRequestV1
    ) async throws -> AWSWitnessTransactGetResponseV1

typealias AWSWitnessTransactWriteProviderV1 =
    @Sendable (
        AWSWitnessTransactWriteRequestV1
    ) async throws
        -> AWSWitnessTransactWriteInvocationResultV1

typealias AWSWitnessDescribeTableProviderV1 =
    @Sendable (
        AWSWitnessDescribeTableRequestV1
    ) async throws -> AWSWitnessDescribeTableResponseV1

typealias AWSWitnessKMSGetPublicKeyProviderV1 =
    @Sendable (
        AWSWitnessKMSGetPublicKeyRequestV1
    ) async throws -> AWSWitnessKMSGetPublicKeyResponseV1

typealias AWSWitnessKMSSignProviderV1 =
    @Sendable (
        AWSWitnessKMSSignRequestV1
    ) async throws -> AWSWitnessKMSSignResponseV1
