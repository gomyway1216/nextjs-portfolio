# Standalone authentication of complete stable-proposal work

> The [preceding checkpoint](./blog-shogi-floodgate-stable-proposal-checkpoint.en.md) durably stored a completed stable-proposal artifact as an HMAC-chained `work.jsonl` in a private stage. The next result / manifest finalizer, however, must be able to ignore the checkpoint writer's in-memory state and prove from received bytes alone that the header, every proposal, and the seal form a complete stream under the same run / key / stage / producer contract. This PR adds the high-level `verifyAuthenticatedFloodgateStableProposalWork` API for that purpose. The parser, producer-receipt reconstruction, and MAC scanner remain module-private, and only a complete in-memory stream is accepted. This is a synthetic-only content verifier—not evidence of consumer postflight, publication, a teacher label, training, or playing strength. It reads no real training data, selection label, or fresh / legacy final holdout. 日本語版: [blog-shogi-floodgate-stable-proposal-work-verifier.md](./blog-shogi-floodgate-stable-proposal-work-verifier.md)

---

## Current boundary

| Item                          | Current status      | Meaning                                                                                                                     |
| ----------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| standalone verifier           | Implemented         | Verifies received complete `work.jsonl` bytes without touching the filesystem or writer state                               |
| public surface                | High-level API only | Exposes the entrypoint and contract types / constants while keeping low-level parsing, reconstruction, and scanning private |
| exact evidence                | Implemented         | Returns the exact work SHA-256 and byte count, run, key ID, stage binding, and authenticated header / seal                  |
| semantic binding              | Implemented         | Domain-separates and hashes a producer input / output projection without stage, run, key, or operational settings           |
| active runtime authority      | Out of scope        | Structurally checks a stage-authorization receipt but neither claims an active lease nor reopens the current directory      |
| partial-checkpoint recovery   | Out of scope        | Rejects prefixes and torn tails instead of repairing them; resume belongs to the checkpoint writer                          |
| postflight / publication      | Not implemented     | Does not prove consumer close, result / manifest creation, exclusive rename, or destination reopen                          |
| teacher / training / strength | No evidence         | Does not prove teacher scores, weight updates, loss, Elo, rank, or stable high-dan play                                     |
| real data / holdout           | Unread              | Uses only temporary directories and synthetic artifacts / keys                                                              |

The verifier status and claim boundary are fixed as:

```text
verified-complete-authenticated-stable-proposal-work
key-holder-authenticated-complete-work-content-only-not-consumer-postflight-publication-teacher-label-or-playing-strength-evidence
```

## 1. Complete-stream verification independent of the writer

The checkpoint writer handles valid prefixes and one narrowly allowed torn tail so that it can resume. A verification receipt passed to the next stage must not treat “correct so far” as success. The standalone verifier synchronously copies a bounded, non-shared `Uint8Array`, then reparses strict UTF-8, canonical JSON, one LF-terminated record per line, and the complete header → dense proposal entries → seal shape.

It rejects an empty input, missing final LF, an intermediate fragment, empty or oversized lines, BOM, NUL, CR, invalid UTF-8, too many records, and every record after a seal. It neither truncates nor appends the input and never touches the filesystem. Partial recovery and durability repair belong to the writer; complete content verification belongs to this verifier.

## 2. Supplying run, key, and stage externally

In addition to work bytes, the API requires a 32-byte root key, a 64-character lowercase-hex `runId`, an opaque `keyId`, and a stage-authorization receipt. It does not let self-declared fields inside the work choose the authentication context: the caller supplies the expected run, key slot, and stage externally.

The verifier derives the checkpoint's HKDF-SHA-256 key from the root key and `runId`, then recalculates the HMAC chain for the header, every entry, and the seal under the same domain separation. A wrong root key, run, key ID, or different stage receipt fails. A stage-only writer can rewrite a payload and unkeyed checksum together, but cannot produce a chain matching the external key context.

A key holder can still construct a valid chain. This is key-holder-authenticated content integrity, not proof of non-repudiation, key secrecy, engine-process identity, or anti-rollback.

## 3. Reconstructing the producer receipt from bytes

Passing MACs is insufficient if nested proposal semantics or the producer receipt no longer correspond. The verifier reconstructs a canonical stable-proposal artifact from the header's `producer`, header input, every entry's `proposal`, and seal output.

It sends the reconstructed rows, JSONL, proposal receipt, and receipt JSON through the existing strict artifact capture. It then regenerates the expected header, all entries, and seal from that artifact plus the external run / key / stage context. Finally, it compares the received and expected bytes exactly, including length, with a timing-safe comparison. Consequently, even correctly re-signed edits to parent linkage, seal output, semantic fingerprint, proposal-receipt identity, or nested proposal shape fail.

The low-level line parser, artifact reconstruction, and MAC scan are not exported, preventing a partial check or intermediate state from becoming an accidental success contract. The public surface is one high-level entrypoint that accepts a complete stream and returns a narrow receipt.

## 4. The exact-evidence layer

The success receipt's `evidence` preserves the verified physical and authentication context:

- exact `work.bytes` and work SHA-256
- externally supplied `run_id` and `key_id`
- authorization contract / trust boundary, stage basename, and parent / stage device and inode
- the complete MAC-authenticated header and seal

The complete receipt is deeply frozen. Its header and seal come from strict parsing and capture rather than retaining references to input objects. This layer answers which bytes were authenticated under which run / key / stage context. Changing the stage, run, or key changes the header MAC and work bytes, so it also changes the exact work SHA-256.

## 5. The operational-free semantic-binding layer

The verifier separately returns `semantic_binding` so that the same proposal meaning can be matched across stages or runs. Its projection includes only:

- the semantic-binding schema and checkpoint schema
- the producer proposal schema, status, claim boundary, and semantic run fingerprint
- authenticated producer input
- sealed proposal output

Worker count, watchdog values, Node version, other operational fields, stage device / inode, run ID, key ID, and HMAC tags are excluded. This carries forward the stable proposer's existing contract: its semantic run fingerprint already binds the plan, engine assets, required search contract, and captured parents while deliberately excluding operational configuration. The projection is hashed as canonical JSON under a dedicated domain plus NUL separator.

The two layers therefore distinguish byte-level custody from the same producer input / output meaning across operational widths and stages. The latter still does not expand into engine authentication or teacher correctness.

## 6. Why work SHA-256 cannot be the semantic ID

In the synthetic test, placing the same proposal meaning under a different stage, run, key context, or operational worker setting produced five distinct exact work SHA-256 values. The header binds stage identity, run ID, key ID, and the producer operational receipt, and its MAC changes with context, so those differences are required.

All five semantic-binding SHA-256 values were identical because the proposal's input / output meaning was unchanged. Using work SHA-256 as a semantic identity would make the same search result appear different after a mere operational relocation. Conversely, a semantic digest alone cannot identify which stage bytes were verified. The result / manifest finalizer must bind both, without mixing their purposes.

## 7. Root-key handling and zeroization

The verifier does not retain the caller's root-key view directly. It synchronously copies it into an internal 32-byte buffer and uses dedicated buffers for the run salt and derived key. Whether verification succeeds or throws, a `finally` block zeroizes the internal root-key copy, salt, and derived key. The verifier itself adds neither key to its result or errors, and tests confirm that normal synthetic writer output contains no key bytes. This is not a redaction contract for a caller that deliberately embeds the same string inside authenticated payload data.

The caller-owned original `Uint8Array` is not zeroized. The external key provider must separately manage that buffer's lifetime after the call. Nor does this contract prove that every historical copy vanished from the JavaScript runtime. It guarantees best-effort cleanup of the key-material buffers explicitly created by the verifier.

## 8. Structural receipt versus runtime authority

The verifier strictly checks the `stageAuthorizationReceipt`'s exact keys, authorization contract / trust / status, allowed-entry list, safe basenames, nonnegative devices, and positive inodes. It regenerates the work header's stage binding from that receipt, so bytes prepared for another stage fail.

The standalone verifier does not accept an active `FloodgateTeacherStageLease`, claim the lease registry, or reopen the stage directory or `work.jsonl`. A receipt is data describing a prior authorization structure, not exclusive runtime authority at this moment. Current path identity, mode, owner, file set, durability, and namespace exclusivity remain separate checkpoint / publication contracts.

## 9. Synthetic evidence and non-claims

The standalone-verifier tests pass 5 / 5; together with the existing checkpoint tests, the target passes 23 / 23. Coverage includes the exact deeply frozen receipt, stability across fresh receipts for the same stage, wrong key / run / key ID / stage, torn bytes, missing final LF, a post-seal record, fully re-signed semantic tampering, and the exact-versus-semantic distinction after changing stage / run / key / operational-only settings. Every case uses a synthetic artifact, synthetic key, and temporary stage. No real Floodgate data or protected label is an input.

| What this PR establishes                                                    | What this PR does not establish                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Standalone revalidation of a complete work HMAC chain and canonical content | Active lease, current filesystem identity, durability, or publication  |
| Exact bytes / run / key / stage evidence                                    | Consumer-callback success or postflight / close                        |
| A separate operational-free semantic binding                                | Completed result / manifest or correct teacher scores                  |
| Rejection of partial, torn, and re-signed semantic corruption               | Real-engine authentication, a real training dataset, or weight updates |
| Synthetic evidence from five tests and 23 / 23 combined checkpoint tests    | Accuracy, improved loss, Elo, rank, or stable high-dan play            |

A complete HMAC-valid proposal remains a candidate-search artifact, not a teacher label. It updates no model-weight byte and does not overwrite the existing evaluation function.

## 10. Next: the result / manifest finalizer

The next stage is to close the result / manifest finalizer using this verification receipt as an input. Its expected crash states are `{work}`, `{work,result}`, and `{work,result,manifest}`. It must write and file-sync the result, directory-sync it, then write the manifest and make it durable in the same order. The manifest must bind the work's exact evidence and semantic binding, result bytes, consumer binding, proposal / checkpoint receipts, and successful postflight plus descriptor closes.

Only then can the stage enter the exclusive publication transaction and revalidate the published namespace through a destination reopen. The production coordinator, pinned YaneuraOu depth-16 v7 teacher, real training, three seeds, QAT / int16, selection, sealed final holdout, paired A/B, and 81Dojo calibration follow.

This PR reaches standalone revalidation of complete authenticated work and a receipt that does not confuse exact custody with semantic identity. Consumer postflight, publication, teacher, training, and playing strength remain unproved. There is still no evidence of stable high-dan strength.
