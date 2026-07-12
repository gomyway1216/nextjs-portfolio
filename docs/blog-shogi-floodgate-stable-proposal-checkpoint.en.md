# Durably checkpointing stable proposals in a MAC-authenticated private stage

> The [stable-WASM proposer](./blog-shogi-floodgate-stable-wasm-proposer.en.md) can return a canonical proposal artifact in memory as a synthetic-only, dependency-injected `CoreForTests`. SHA-256 alone cannot detect an actor who rewrites a proposal and its checksum together, however, and it does not determine how much became durable after a process crash. This PR adds a synthetic-only checkpoint primitive that consumes an [authorized private-stage](./blog-shogi-floodgate-teacher-stage-authorization.en.md) active lease once as its first synchronous action, then appends a header, proposal entries, and a seal as an HMAC chain to the exact file set `{work.jsonl}`. Its status stops at a private checkpoint. It is not evidence for a production runner, consumer postflight, publication, engine authentication, teacher labels, learning, or playing strength. Real training data, selection, and both fresh and legacy final holdouts remain unread. Japanese version: [blog-shogi-floodgate-stable-proposal-checkpoint.md](./blog-shogi-floodgate-stable-proposal-checkpoint.md)

---

## Current boundary

| Item                                  | Current status                             | Meaning                                                                                                                                            |
| ------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| active stage-lease claim              | Implemented in `CoreForTests`              | Single-use claims the exact active lease issued by the test-only registry as the first synchronous action                                          |
| dedicated private stage               | Implemented                                | Restricts the stage to exactly `{work.jsonl}` inside a trusted-current-EUID boundary and rejects symlinks, hard links, and mode / owner mismatches |
| authenticated checkpoint chain        | Implemented                                | Binds the header, dense entries, and seal with a run-derived HMAC key and canonical JSON                                                           |
| durability / resume                   | Implemented                                | File / directory sync and an authenticated-prefix scan admit only defined resume states                                                            |
| proposer-artifact timing              | Starts after the in-memory artifact exists | A crash before artifact construction still requires rerunning stable search                                                                        |
| production consumer / stage handoff   | Not implemented                            | No coordinator safely transfers authority from the production-input claim into this test core yet                                                  |
| consumer postflight / publication     | Not implemented                            | Does not prove input close, create a result receipt, exclusively rename, or reopen a published artifact                                            |
| engine / teacher / training / play    | No evidence                                | HMAC does not prove engine execution, a teacher score, a trained checkpoint, accuracy, Elo, or rank                                                |
| real data / selection / final holdout | Unread                                     | Uses only synthetic fixtures and opens no protected label                                                                                          |

“Complete” here means only that a proposal checkpoint in the private stage contains its header, every entry, and its seal, and can be reconstructed from the same key and expected artifact. It does not mean that the production transaction completed or that the evaluation function became stronger.

The prefix status, complete-seal status, and receipt-wide claim boundary are deliberately fixed as long strings.

```text
authenticated-durable-private-checkpoint-prefix-not-complete-not-postflight-not-published
complete-authenticated-private-proposal-checkpoint-not-consumer-postflight-not-published
key-holder-authenticated-checkpoint-integrity-only-not-engine-authentication-teacher-label-or-playing-strength-evidence
```

## 1. Why SHA-256 alone is insufficient

An unkeyed SHA-256 digest can detect accidental corruption and torn writes. An actor who can write the stage can also change a proposal row and calculate its new SHA-256. Rewriting the payload and checksum together is indistinguishable from the intended writer if an unkeyed digest is the only boundary.

This checkpoint derives a run-specific key from root-key bytes synchronously snapshotted from the caller, then gives every record an HMAC-SHA-256 tag. A stage-only writer without the key cannot create a different complete line that continues the existing chain. Verification compares decoded 32-byte tags with a timing-safe comparison.

The boundary must not be read more broadly. An actor holding the root key can construct a valid chain, so HMAC establishes only the integrity of a checkpoint authenticated by that key holder. It does not prove the correct engine, a correct search result, a true teacher label, key secrecy, non-repudiation, or monotonic anti-rollback.

## 2. Dedicated stage and exact file set

Immediately after receiving an authorized stage lease, the checkpoint API consumes the test-only claim as its first synchronous action, before touching a stage path or artifact. A closed lease, an already claimed lease, a clone, a Proxy, or a lease crossing the production / test registry boundary does not pass. It then opens the stage path with `O_NOFOLLOW | O_DIRECTORY` and uses that descriptor plus `lstat` of the path to match the stage device, inode, owner, and exact mode from the lease receipt. The parent identity and basename are bound into the authenticated header.

The only file set admitted in this primitive's dedicated stage is:

```text
{work.jsonl}
```

A fresh start requires an empty stage and creates `work.jsonl` with `O_CREAT | O_EXCL`, then establishes exact mode `0600` with the equivalent of `fchmod(0600)` instead of relying only on the requested create mode. It also verifies current-EUID ownership. Resume requires the existing name to open with `O_NOFOLLOW` as a regular file owned by the current EUID, with exact mode `0600` and link count one. Any other file, temporary file, directory, symlink, hard link, or unknown entry fails closed.

The header MAC binds the stage identity. Copying the same `work.jsonl` bytes to another stage does not make them resumable because the parent and stage identities no longer match. Directory listing, `work.jsonl` open, and final reopen are nevertheless path-based operations with descriptor / path identity rechecks around them; they are not directory-descriptor-relative `openat`-style operations. This is a critical section that trusts current-EUID namespace operations, not an OS sandbox that protects against a malicious same-EUID actor renaming or swapping objects between checks.

## 3. Header, entries, and seal

`work.jsonl` uses schema `shogi-floodgate-stable-proposal-work-v1` and stores one canonical-JSON record per LF-terminated line. Record order is fixed.

```text
header
proposal sequence=0, previous_mac=header_mac
proposal sequence=1, previous_mac=entry[0].entry_mac
...
seal, final_entry_mac=entry[last].entry_mac
```

The header binds at least:

- a 64-character lowercase-hex `run_id` and opaque `key_id`
- the MAC algorithm and narrow claim boundary
- the authorization contract / trust, stage basename, and parent / stage device and inode
- the proposer input's authenticated-training binding, input-row SHA-256, and record count
- the proposal schema, semantic run fingerprint, plan, engine assets, search contract, operational configuration, and proposal receipt

Each entry binds a dense sequence, expected parent ID, `previous_mac`, and that parent's proposal row. Gaps, reordering, duplication, a different parent, or a different proposal are not admitted. The seal binds the entry count, final entry MAC, proposal output bytes / SHA-256 / record count, and the private-checkpoint status. No byte or record may follow the seal.

Resume does more than verify MACs. It revalidates the in-memory proposer artifact supplied by the caller and rederives its canonical JSONL, receipt, semantic fingerprint, input binding, proposal order, parent / child digests, and output identity. A chain can therefore be MAC-valid yet still fail because it is not the exact artifact expected by this invocation. The proposer remains a dependency-injected test core, however, so this check does not upgrade it into engine authentication.

## 4. HKDF and domain separation

The algorithm identifier is fixed to `hmac-sha256-hkdf-sha256-v1`. The root key is not read from a path, environment variable, command-line argument, or stage file. In this PR it is a preloaded byte capability supplied as a synthetic test dependency and copied before the first `await`. The `run_id` is a caller-supplied 32-byte identifier represented as 64 lowercase hexadecimal characters and serves as the HKDF-SHA-256 salt. `CoreForTests` validates only that form; it neither generates nor proves randomness or uniqueness across runs. HKDF info is fixed to:

```text
shogi-floodgate-stable-proposal-checkpoint-key-v1\0
```

Canonical MAC payloads use a separate domain for each record kind.

```text
shogi-floodgate-stable-proposal-work-header-v1\0
shogi-floodgate-stable-proposal-work-entry-v1\0
shogi-floodgate-stable-proposal-work-seal-v1\0
```

`key_id` contains no key material; it is only an opaque identifier for the expected external key slot. Neither the root key nor the derived key is stored in `work.jsonl`, a receipt, or an error. A missing or wrong key, different `run_id`, or different `key_id` is a terminal mismatch and leaves existing bytes unchanged.

## 5. Durability order and indeterminate failure

The fresh-file order is fixed.

1. Synchronously claim the exact active lease
2. Verify the identity of the path-opened stage descriptor and stage path, plus the exact file set
3. Exclusively create `work.jsonl`, establish exact `0600` with `fchmod`, then write the header and final LF
4. Sync the file, then sync the stage-directory descriptor
5. Append proposal entries as complete lines and `datasync` / `sync` the file after each line
6. Advance the in-memory completed sequence only after a successful sync
7. Append the seal, then close with file sync followed by stage-directory sync
8. Reopen `work.jsonl` from the stage path with `O_NOFOLLOW`, match its original file identity, recheck the stage descriptor / path identity, and reconstruct every record and the proposal artifact before returning success

When resuming an existing `work.jsonl`, the implementation syncs the stage-directory descriptor before appending an entry or seal, whether or not it found a torn tail. An exact-private zero-byte file is admitted as a post-create, pre-header crash state; the header is rebuilt after that directory sync.

After a fresh creation may have begun, or after processing of an existing file enters its resume path, a later failure cannot honestly report that nothing persisted. Not only write / truncate / sync failures but also final work / stage descriptor-close failures and a subsequent authorized-lease close failure become typed persistence-indeterminate failures with `mayHavePersisted: true`. The implementation neither deletes stage bytes nor treats the attempt as successful. A subsequent attempt must acquire a new authorized lease and scan under the same run, key, and artifact before resuming.

File sync and directory sync close different durability gaps: the former covers file content / inode state, while the latter covers the namespace update that created the file. This PR closes only a private checkpoint, so published-directory rename durability and destination reopen remain out of scope.

## 6. Resume and corruption matrix

| Observed state                                                 | Action                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Empty authorized stage, no `work.jsonl`                        | Establish exact `0600`, exclusively create a fresh header, and start                                                    |
| Exact-private zero-byte `work.jsonl`                           | Treat as a post-create, pre-header crash state and rebuild the header after directory sync                              |
| Valid header plus authenticated entry prefix                   | Append from the sequence after the last verified entry                                                                  |
| Every entry valid, only seal missing                           | Append only the expected seal                                                                                           |
| Valid complete seal exactly matching the expected artifact     | Reconstruct and succeed without rewriting bytes                                                                         |
| One final fragment without LF                                  | Only if it is a byte prefix of the expected next canonical line, truncate to the last verified offset, sync, and resume |
| Malformed complete line, bad MAC, gap / reorder / duplicate    | Terminal corruption; preserve existing bytes and stop                                                                   |
| Wrong key / run / stage / input / semantic fingerprint         | Terminal mismatch; do not modify existing bytes                                                                         |
| Record / byte after seal, oversized file / line, invalid UTF-8 | Terminal corruption; BOM, NUL, CR, and invalid control bytes are also rejected                                          |
| Symlink, hard link, wrong owner / mode / type, extra entry     | Stop on a stage-contract violation                                                                                      |

Truncation is limited to the single final non-LF fragment. A line already completed by LF is not deleted merely to make a corrupt checkpoint resumable. If the whole stage is rolled back to a shorter authenticated prefix, the missing entries can be recomputed from the same artifact, but the design has no external monotonic counter and therefore does not claim to detect a rollback attack.

The stage-authorization exclusive lease is not a perpetual lock either. If a process crash leaves a stale lease directory, another same-EUID process has no basis to steal it automatically. Work stops until an operator reconciles the stage, lease owner, and process state, then explicitly creates a new authorization.

## 7. When this checkpoint begins persisting

The current API is called only after the stable proposer has searched every parent and completed the canonical proposal artifact and receipt in memory. That completed artifact is the expected transcript against which every resumed line can be semantically rederived. The order has an important limitation.

```text
stable search completes -> in-memory artifact completes -> durable checkpoint begins
```

If the process crashes during search or before artifact construction, `work.jsonl` does not yet contain progress and stable search must restart from the beginning. This PR avoids duplicate work only after checkpoint appending has begun, while appending the seal, or on a rerun of an already completed file. It is not a mid-search progress-resume system. Supporting that later requires another contract through which the proposer hands one authenticated proposal at a time to a stage coordinator, with engine and input authority valid at that point.

## 8. Synthetic-only evidence and non-claims

The verification surface for this PR uses temporary directories, synthetic proposer artifacts, synthetic root keys, and test-only stage authorization. The checkpoint tests pass 18 / 18, the combined stage-authorization and checkpoint target passes 120 / 120, and TypeScript typecheck plus scoped ESLint pass. Regression coverage targets fresh writes, zero-byte recovery, no-rewrite completed resume, valid-prefix resume, one torn-tail truncation, wrong key / run / stage / artifact, MAC tampering, sequence mutation, post-seal bytes, file identity / mode violations, post-durability failpoints, short / zero-progress writes, and descriptor / lease lifetime. It does not claim a seam that injects failures from the actual file or directory `sync()` syscalls. It does not input a real Floodgate parent, real role bundle, selection label, fresh final holdout, or legacy final holdout.

| What this PR establishes                                                    | What this PR does not establish                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Integrity of the expected proposal checkpoint authenticated by a key holder | Authentication of the proposer actor, production consumer, or engine             |
| Resume bound to a run, stage, input, and semantic artifact                  | Correct teacher scores or a completed depth-16 v7 union                          |
| Defined file / directory sync ordering and indeterminate failure            | Consumer postflight, result receipt, exclusive publication, or successful reopen |
| Exact `{work.jsonl}` private-stage contract                                 | A production dataset, trained NNUE, or production-int16 weights                  |
| Synthetic contract / corruption test surface                                | Accuracy, improved loss, Elo, rank, or stable high-dan play                      |

A MAC-valid proposal checkpoint creates no teacher label and updates no model-weight byte. A playing-strength claim must wait until frozen multi-seed training, quantization, sealed holdout, production parity, fixed paired A/B, and external calibration have passed.

## 9. Next steps

The safe order remains:

1. Connect the production consumer callback's exact-input claim, stage-lease authority, stable proposer, and private checkpoint through one coordinator / handoff contract
2. Complete the result receipt only after outer-consumer postflight / close succeeds, then hand it to exclusive directory publication, rename durability, and destination-reopen verification
3. Recover and pin the exact YaneuraOu binary / evaluation assets and close a real-engine contract with synthetic interruption / resume coverage
4. Complete the v7 teacher by unioning YaneuraOu depth-16 MultiPV 12, the strong-game played move, and the stable proposal, then independently rescore every unique candidate at depth 16
5. Only after that complete runner is closed, label real training parents and run frozen seeds 42 / 43 / 44, QAT / production-int16 export, and the static family gate
6. Open selection and sealed final holdout exactly once in the preregistered order, then run production parity, known regressions, and fixed paired A/B
7. Evaluate only a candidate that passes every internal gate in a separately authorized 81Dojo calibration

Existing evaluation-function weights are not overwritten along the way. The pipeline first closes teacher-input and artifact authority, then learns multiple seeds from fresh data under identical conditions and compares them against the stable baseline.

## 10. Conclusion

This PR adds a test-core boundary that durably checkpoints an in-memory stable-proposal artifact into the authorized private stage's exact `{work.jsonl}` with an HMAC chain. The header, dense entries, and seal bind the run, stage, input, and semantic artifact; file / directory sync, zero-byte / valid-prefix resume, narrowly allowed torn-tail truncation, and preservation of terminal corruption are explicit. Filesystem namespace operations use path-based descriptor / path identity rechecks and do not provide protection beyond the trusted-current-EUID boundary.

What exists is still only a private checkpoint. A crash before artifact construction reruns stable search, and a stale lease awaits operator reconciliation. The production coordinator, consumer postflight, publication, engine authentication, depth-16 teacher, learning, holdout, and games remain ahead. There is not yet evidence of stable high-dan strength.
