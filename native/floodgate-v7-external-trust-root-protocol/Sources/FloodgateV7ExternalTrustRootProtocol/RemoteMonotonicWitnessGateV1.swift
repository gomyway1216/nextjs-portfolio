import Foundation

/// Pure fail-closed comparison around one nonce-bound witness query.
///
/// The fetch closure is internal and test-only. No production endpoint,
/// transport, key, or caller-selected provider is made public by this layer.
enum RemoteMonotonicWitnessGateV1 {
    static func requireFreshCurrentAuthorityState(
        store: TrustRootAuthorityStateStoreV1,
        witnessID: CanonicalBytes32,
        endpointID: CanonicalBytes32,
        witnessPublicKeyRawRepresentation: [UInt8],
        clientNonce: CanonicalBytes32,
        operationID: CanonicalBytes32,
        trustedUnixClock: () throws -> UInt64,
        fetch:
            (
                RemoteMonotonicWitnessRequestV1
            ) throws -> RemoteMonotonicWitnessReceiptV1
    ) throws -> TrustRootAuthorityStateSnapshotV1 {
        do {
            let requestStartedAtUnixSeconds =
                try trustedUnixClock()
            let before = try store.freshSnapshot()
            let request = try RemoteMonotonicWitnessRequestV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: .query,
                witnessID: witnessID,
                endpointID: endpointID,
                clientNonce: clientNonce,
                operationID: operationID,
                expectedCheckpointSHA256:
                    try CanonicalBytes32(Array(repeating: 0, count: 32)),
                candidateCheckpoint: nil
            )
            let receipt = try fetch(request)
            let receiptReceivedAtUnixSeconds =
                try trustedUnixClock()
            guard
                receiptReceivedAtUnixSeconds
                    >= requestStartedAtUnixSeconds
            else {
                throw RemoteMonotonicWitnessErrorV1
                    .invalidWitnessState
            }
            let checkpoint = try receipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation:
                    witnessPublicKeyRawRepresentation,
                nowUnixSeconds: receiptReceivedAtUnixSeconds
            )
            guard
                receipt.accepted,
                checkpoint.journalID == before.token.journalID,
                checkpoint.journalSequence
                    == before.token.journalSequence,
                checkpoint.authorityPublicKeyRecordSHA256
                    == before.token
                    .authorityPublicKeyRecordSHA256,
                checkpoint.journalHeaderSHA256
                    == before.token.journalHeaderSHA256,
                checkpoint.lastJournalEntrySHA256
                    == before.token.lastJournalEntrySHA256,
                checkpoint.expectedActivationHeadSHA256
                    == before.token
                    .expectedActivationHeadSHA256
            else {
                throw RemoteMonotonicWitnessErrorV1
                    .invalidWitnessState
            }
            let unchanged =
                try store.requireUnchanged(before.token)
            let completedAtUnixSeconds =
                try trustedUnixClock()
            guard
                completedAtUnixSeconds
                    >= receiptReceivedAtUnixSeconds
            else {
                throw RemoteMonotonicWitnessErrorV1
                    .invalidWitnessState
            }
            _ = try receipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation:
                    witnessPublicKeyRawRepresentation,
                nowUnixSeconds: completedAtUnixSeconds
            )
            return unchanged
        } catch {
            throw RemoteMonotonicWitnessErrorV1.invalidWitnessState
        }
    }
}
