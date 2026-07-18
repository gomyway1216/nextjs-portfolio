# A read-only current-state boundary that does not accept authority keys from callers — Floodgate v7

> The preceding external supervisor / verifier source verifies signed enrollments and activations, but its security stages still exposed surfaces that could receive an authority public key and `ExpectedActivationHeadV1` from a caller. This article records a read-only Swift source boundary that fresh-loads both from a fixed state root outside the repository. It is not a writer, provisioner, installed trust root, or production inspector. Japanese version: [blog-shogi-floodgate-v7-authority-current-state.md](./blog-shogi-floodgate-v7-authority-current-state.md)

## 1. Result

The source fixes the production authority-state root to one path:

`/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/state`

It read-only loads a 76-byte authority public-key record, a 112-byte activation-head journal header, and contiguous 200-byte journal entries. Challenge, receipt, attestation, and final-consume stages require an unchanged state before returning. Public stage entrypoints no longer accept a raw authority key or expected head supplied by their caller.

| Subject                           | Current state                  |
| --------------------------------- | ------------------------------ |
| canonical record source           | in scope                       |
| fixed-path read-only store source | in scope                       |
| real root-owned state             | not created / not read         |
| writer / provisioner              | absent / absent                |
| production inspector              | absent / 0 runs                |
| supervisor / verifier executable  | unchanged fixed `exit 78` STOP |
| teacher / training / A/B          | 0 / 0 / 0                      |
| live weights                      | 0 changes                      |
| operational decision              | `UNAVAILABLE / STOP`           |

This boundary closes one path: a repository caller choosing arbitrary current authority state. It does not close attacks by root or offline access, artifact installation, real-state creation, or rollback across process restarts.

## 2. The three canonical records

Every integer is big-endian. Schema version 1, reserved 0, audience 1, and purpose 1 are fixed.

| Record                          | bytes | Fixed layout                                                                                                  |
| ------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------- |
| `AuthorityPublicKeyRecordV1`    |    76 | `FGV7APK1` 8 + domain 4 + raw Ed25519 key 32 + `SHA-256(raw key)` 32                                          |
| `ActivationHeadJournalHeaderV1` |   112 | `FGV7AJH1` 8 + domain 4 + entry size `UInt32BE` 4 + journal ID 32 + key ID 32 + key-record SHA-256 32         |
| `ActivationHeadJournalEntryV1`  |   200 | `FGV7AJE1` 8 + domain 4 + sequence `UInt64BE` 8 + previous-record SHA-256 32 + `ExpectedActivationHeadV1` 148 |

Entry 1 binds its previous digest to the canonical header's SHA-256. Each later entry binds to the preceding canonical entry's SHA-256. An entry's sequence must equal its embedded `ExpectedActivationHeadV1.latestActivationSequence`, and the embedded head's authority key ID must equal the header key ID.

The separate [floodgate-v7-authority-current-state-golden-v1.json](../tests/fixtures/floodgate-v7-authority-current-state-golden-v1.json) fixture byte-for-byte reuses the synthetic authority public key and 148-byte expected head from the earlier cross-parser fixture. Its journal ID is the SHA-256 of the UTF-8 synthetic domain `shogi-floodgate-v7-authority-current-state-journal-v1`; it is not an operational identifier.

## 3. What the read-only store checks

The production configuration in `TrustRootAuthorityStateStoreV1.swift` does not accept a caller path. It traverses the fixed root and every ancestor with held file descriptors. Only an internal test initializer can point at a temporary root.

The source boundary fails closed on:

- exact owner / group / mode for production ancestors, plus same-device and local-filesystem requirements below the state root;
- `O_NOFOLLOW`, agreement between pathname and opened-FD metadata, and unchanged `fstat` identity before and after reads;
- exact type, size, mode, owner, group, and `nlink == 1` for committed regular files;
- no extended ACL object at all on every node the reader can open, including all ancestors and committed leaves; the metadata-only `pending` directory is not opened, so its ACL is not inspected by the non-root reader;
- exact visible namespace sets for the state root, journal, and committed entries, while treating the root-only `0700` pending directory as metadata-only and never reading its private contents;
- gap-free 20-digit entry names beginning at `00000000000000000001.bin`;
- exact 76 / 112 / 200-byte records, double-`pread` equality, canonical decode, and every key / header / entry cross-link; and
- a maximum of 4,096 journal entries.

This is a source-level reader policy, not a result for a signed, notarized, or installed artifact. The change does not create the fixed root. Tests use temporary directories only.

## 4. A fresh load for each security stage

Challenge issue, receipt issue, attestation issue, and final consume each start with a fresh snapshot. The stage holds a token containing the sequence, key-record digest, header digest, and last-entry digest, then reloads and requires an exact match before returning. A head advance during a stage causes STOP; there is no automatic rebase onto the newer state.

The supervisor session and one-shot consumer retain a store instance within their process. The public symbol-graph gate rejects security-stage callable surfaces that inject a raw authority public key, `ExpectedActivationHeadV1`, authority store, authority path, or authority provider. The two canonical data constructors intentionally remain public: `AuthorityPublicKeyRecordV1.init` accepts the key it validates and encodes, and `ActivationHeadJournalEntryV1.init` accepts the head it validates and encodes. Neither constructor is a security-stage handoff. Internal test helpers are not production APIs.

This does not make every other protocol input trusted. Enrollment and activation envelopes, repository manifests, observations, and artifact closure must still pass their existing signature and transcript checks.

## 5. The exact anti-rollback limit

The reader keeps a high-water mark for the lifetime of one store instance. After observing sequence 2, it rejects a return to sequence 1. It also rejects a different last-entry digest at the same sequence. The journal chain rejects gaps, reordering, corruption, and partial replacement within the namespace being observed.

This is **not durable anti-rollback across a restart**. The in-memory high-water mark disappears when the process exits. If root or offline access restores the key, header, and entries to an internally consistent older snapshot, a new process has no external anchor proving the newer state existed. Restart-persistent protection against root/offline rollback therefore remains unestablished.

`flock` is equally limited. The reader uses a nonblocking shared lock on one exact lock inode; contention causes STOP. It coordinates only with cooperating writers that use that inode, and is advisory and inode-scoped. It is not a security boundary against a privileged writer that ignores the lock. Owner, mode, ACL, and link policies constrain ordinary unprivileged mutation, but do not exclude malicious root.

## 6. The future writer contract is design only

The machine record freezes a per-entry exclusive publication contract for any future writer:

1. Acquire an exclusive `flock` on the reader's exact lock inode.
2. Revalidate the key, header, every committed entry, and namespace while holding the lock.
3. Derive only the next contiguous sequence and the preceding canonical digest.
4. Create one file exclusively and without following links in the root-only `pending` directory, write exactly 200 bytes, and `fsync` the file.
5. Publish to the 20-digit final entry name with an atomic no-replace operation.
6. `fsync` the entries directory, revalidate the full state, and only then unlock.

This is a **frozen future contract**, not a successful writer implementation. This PR has no writer source, private key, provisioning command, root mutation, or writer test run. Implementation requires a separate PR, negative tests, and release-artifact review.

## 7. Golden parser and current validation

The independent Node/Vitest parser calls no Swift decoder. It reloads the public key and expected head from the earlier fixture, then reconstructs every byte, offset, length, SHA-256, key ID, header binding, entry chain, and sequence / authority cross-link in all three records. It rejects fixed-field drift, truncation, trailing bytes, zero IDs, broken hashes, and sequence drift. It also flips one bit at a time across all 388 exact synthetic transcript bytes and rejects every case.

Under Node 22.13.0, the focused golden parser recorded **1 file / 7 tests PASS**. The dependency-free Swift package recorded **82 / 82 tests PASS** and a successful release build. The isolated full Vitest run recorded **183 files PASS, 3,245 tests PASS, 1 skipped, and 0 failures** in 313.30 seconds with four workers. The ML standard-library suite recorded **101 / 101 PASS**; ESLint recorded zero errors; and the Next production build succeeded. The measured merge base is `985a09cf957af7b86fde6e8e0857dcd31f8b9d1b`. Implementation commit `5b7f0281811532ebb06d5c1c1f3bea2240e05b86` (tree `fbe47f96f06a946bc4ec44c04aadddded069c4d8`) and publication commit `59cca9876b7114d2a728166aa6850ef58e452786` (tree `ce63b5fd023d4c5cf89dbeab9437fee25501172f`) each received two exact reviews with P0 / P1 / P2 all zero. The PR, CI, remote / CI symbol-graph confirmation, and target Mac compatibility probe are `PENDING` at this snapshot; this article does not pre-claim their results.

The locally measured public symbol graph under Xcode 15.3 / Apple Swift 5.10 has 516 symbols, 570 relationships, normalized SHA-256 `879f1001337dafa13f078756220990a8cb5eb106153189468f2b9ab249e1a59a`, and a passing semantic gate. Applying only the previously observed toolchain transform derives an Xcode 26.5 / Swift 6.3.2 profile of 516 / 609 with SHA-256 `1d2cc49fc73fb21b1b99dd8bc8d68288bebbae30c907df56436767eb0150f7ce`, but that value is **derived / remote confirmation pending** and is not counted as remotely measured CI evidence.

The repository evidence test pins `Package.swift` and both `main.swift` blobs to the merge base. The presence of this source therefore leaves supervisor and verifier as dependency-free fixed STOP executables and does not execute production authority.

## 8. Work not performed

This change has not performed:

- canonical-root creation, ownership / mode setup, or authority-key / journal provisioning;
- a writer, rotation, key replacement, or restart-persistent rollback anchor;
- signing, notarization, Gatekeeper acceptance, or outside-repository installation;
- a zero-argument read-only production inspector or fresh incident inspection;
- production supervisor / verifier execution or incident-state read, reconciliation, or mutation;
- teacher generation, retraining, candidate selection, formal A/B, or external calibration; or
- a live evaluation-weight overwrite or activation.

There is consequently no claim that playing strength improved, stable high-dan performance exists, or production can safely resume. The concrete gain is narrower: authority current-state input moves from repository callers into one fixed-filesystem reader boundary.

## 9. Safe next order

1. Review the source, negative tests, golden parser, and public surface at an exact commit, then regular-merge only after all CI passes.
2. Design and implement a root provisioner / writer plus a restart-persistent rollback anchor in a separate PR.
3. Build, sign, notarize, and install the release artifact at the fixed path under a separate gate.
4. Review a separate zero-argument read-only inspector that stops on every mismatch or indeterminate result.
5. Only an exactly matching fresh inspection may open review of the next production-recovery gate.
6. Retrain separate candidates from complete teacher data without overwriting the current live weight.
7. Complete candidate selection, formal A/B, external calibration, and a rollback rehearsal.
8. Consider live activation only after playing-strength, safety, and rollback evidence all exist.

The current decision is **`UNAVAILABLE / STOP`**. The [machine-readable record](./data/floodgate-v7-authority-current-state-2026-07-18.json) separates the source-level read-only and process-lifetime guarantees that exist from the writer, restart-persistent, operational, and playing-strength claims that do not.
