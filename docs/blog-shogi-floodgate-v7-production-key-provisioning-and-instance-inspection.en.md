# Provisioning the production key exactly once and observing a pre-approval instance candidate — Floodgate v7 production key operation

> After [the macOS home-anchor hardening](./blog-shogi-floodgate-v7-macos-home-anchor-hardening.en.md) regular-merged as PR #465, the production provisioner was run exactly once from merge commit `1849a675c4b2bbf2fa9e38431baa48ba1b6414ed` under Node v22.13.0. A new 32-byte CSPRNG key was published create-only and no-clobber, made durable, and revalidated. A fresh metadata probe returned `ready`, and the read-only inspector returned one candidate. Candidate observation is not approval: with no approved record, preflight correctly failed closed without a receipt. Implementation revision `c2ffbb85a93ee3a95a670b14e3e6cc42e11bb0fa` then added a create-only installer and CLI that persist digest-bound operator input once in the fixed private record. The initial head of ready PR #466 passed 6 / 6 checks, and revision `f2b3cb4ec28a18e0dc29cb4e927f0abca5f27471` fixes both review comments. Post-fix focused 42 / 42, related 89 / 89, authoritative full 2,340 / 2,340, build, TypeScript, lint, formatting, Python 58 / 58, audit, and independent security/functional review all pass. Public evidence omits the candidate ID, UID, paths, device/inode identities, digests, and key material. Approved-record installation, connector execution, real parent records, teacher work, training, weights, live evaluation, matches, and playing-strength claims remain zero; the review-fix head push, final CI, and merge have not happened yet. Japanese version: [blog-shogi-floodgate-v7-production-key-provisioning-and-instance-inspection.md](./blog-shogi-floodgate-v7-production-key-provisioning-and-instance-inspection.md)

## 1. Result

| Item                      | Observed result                                                       | Meaning                                                                                                        |
| ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| prerequisite              | PR #465, 6 / 6 checks successful, regular merge                       | the actual macOS namespace fix is on the default branch                                                        |
| production provisioner    | one successful invocation                                             | created a new key; it was not retried, overwritten, adopted, or rotated                                        |
| public status             | `new-csprng-key-no-clobber-published-durable-and-revalidated`         | staging fsync, no-clobber publication, directory fsync, and reopen validation completed                        |
| key shape                 | private `0700` parent, `0600` key, 32 bytes, `nlink=1`                | key content, fingerprint, and path remain private                                                              |
| fresh readiness           | `ready` on both observations                                          | metadata-only; no key bytes read and an authoritative reopen remains required                                  |
| instance inspection       | one candidate on all three observations, held descriptors revalidated | initial operation, evidence recapture, and serializer probe used bounded reads without approval or persistence |
| approved record           | absent on both checks                                                 | initial operation and evidence recapture both failed closed with fixed error and exit 1                        |
| installer implementation  | `c2ffbb85` + review fix `f2b3cb4e`                                    | create-only/no-clobber and does not generate approval                                                          |
| focused / related tests   | 42 / 42 and 89 / 89 PASS                                              | includes CLI, loader round trip, races, and failpoints                                                         |
| full / build / static     | 2,340 / 2,340, PASS / PASS                                            | authoritative Node 22 rerun, build 193 / 193, zero errors                                                      |
| independent review        | P0 / P1 / P2 = 0 / 0 / 0                                              | final frozen security and functional reviews                                                                   |
| review feedback           | 2 / 2 fixed at a local revision                                       | strong-durability boundary and CLI listener cleanup                                                            |
| installer PR / CI / merge | `#466 READY` / initial 6 / 6 / `PENDING`                              | review-fix head push and final CI follow this capture                                                          |
| connector / real parent   | 0 / 0                                                                 | possessing a key does not confer run authority                                                                 |
| training / live weight    | 0 / unchanged                                                         | the evaluation function has not changed                                                                        |
| strength evidence         | 0                                                                     | there is no match evidence supporting a high-dan claim yet                                                     |

## 2. What the provisioner established

The invocation used the merged production wrapper for the fixed current-user home and key slot. It accepts neither a secret nor a caller-selected path, deriving the namespace from the current effective UID and `os.userInfo()`. Its successful public receipt establishes only the following:

- Node's CSPRNG generated exactly 32 bytes.
- A private `0600` staging inode was created, written exactly, and file-fsynced.
- A hard link published the final name as the no-clobber commit point. An existing final was never opened, adopted, replaced, or removed.
- The final directory and the post-cleanup directory state were fsynced.
- The final key was authoritatively reopened and revalidated as a current-EUID regular `0600` file with 32 bytes, `nlink=1`, and matching held identity.
- The home and managed chain remained held open and identity/metadata drift was rejected before completion.

The receipt contains no key bytes, fingerprint, path, instance ID, or key authority. Success means only that a new private key was safely created in the fixed slot; it is not connector or checkpoint authorization.

## 3. Fresh metadata probe

The zero-argument post-provisioning readiness probe returned:

```text
status                        = ready
parent                        = present-current-euid-exact-0700-directory
key                           = present-current-euid-exact-0600-regular-nlink-1-32-bytes
authoritative_reopen_required = true
```

This is an advisory path-metadata observation at two sampled points. Key-byte reads/writes, an instance ID, authority, checkpoint, training, weight, and playing strength remain nonclaims. Every downstream owner must authoritatively reopen its fixed namespace instead of treating readiness as a reusable handle.

## 4. Separating candidate observation from approval

The read-only instance inspector then read the fixed key within its 32-byte bound and derived a pseudonymous `key_instance_id` using domain-separated HKDF/HMAC. Public evidence omits the raw ID and records only that its required 64-lowercase-hex format was validated. The inspection receipt fixes parent mode `0700`, key mode `0600`, 32 bytes, `nlink=1`, and held-descriptor revalidation.

That same receipt explicitly keeps these values false:

- `control_plane_approval`
- `record_persisted`
- `connector_execution`
- `training`
- `weight`
- `live_evaluation_activation`
- `playing_strength`

“Observed a candidate from the production key” and “separately reviewed, approved, and pinned that candidate” are distinct events. The process that observes a candidate must not silently approve itself.

## 5. Why preflight exit 1 is correct

The current preflight is not a record-creation diagnostic. It is a success-only command that read-only loads the fixed private control-plane record, validates the self-consistency of its exact candidate bytes/digest and embedded deployment identity, and immediately claims the resulting single-use capability. This command does not reread deployment-key bytes or revalidate the current key inode; the downstream connector compares a freshly opened authority with the approved identity. With no record installed, preflight emitted only:

```text
Floodgate v7 approved key enrollment preflight failed without a receipt
```

The exit code was 1 and capability issuance remained zero. No raw path or absence cause is disclosed. This failure cannot be reinterpreted as permission to start the connector.

## 6. Closing the writer gap with a create-only installer

At the time of the production operation, the repository had a strict approved-record reader/validator and preflight but no safe production writer. Shell redirection, `cp`, or a hand-composed `mkdir` / `chmod` sequence cannot jointly guarantee canonical bytes, no-clobber publication, fsync durability, symlink/hardlink/race rejection, and ambiguous-failure reconciliation.

Implementation revision `c2ffbb85a93ee3a95a670b14e3e6cc42e11bb0fa` adds a narrow installer that:

1. accepts only exact candidate JSONL plus candidate-specific operator approval bound to its SHA-256;
2. shares the loader's canonical candidate/record validation;
3. holds and validates the actual-home four-component managed chain as current-EUID, canonical, exact `0700` directories;
4. bounded-writes a `0600` staging record, file-fsyncs it, publishes no-clobber, directory-fsyncs, and durably cleans up;
5. reopens and revalidates the final record without ever overwriting, adopting, or rotating an existing record;
6. removes paths, candidate ID, approval ID, digest, UID, and filesystem identities from its public receipt; and
7. fixes pre/post-publication failure behavior with failpoint tests and explicit retry/reconciliation classifications.

The installer is not the approving actor. It persists, exactly once, a digest-bound assertion from an operator who separately inspected the exact candidate.

The operator CLI accepts no arguments and only one canonical strict-UTF-8 JSONL request of at most 65,536 bytes on stdin. Its five fields are the contract, approval ID, UTC-millisecond timestamp, approved candidate SHA-256, and exact candidate JSONL. Success stdout is a sanitized receipt without stable IDs or paths; failure stderr is fixed. Eight invalid-input classes fail closed without reaching the production installer.

Adversarial tests pin existing-final and stale-staging behavior, EEXIST, symlink/hardlink, unsafe home/managed modes, UID/boundary mismatch, reordered/duplicate/CRLF/digest-invalid candidates, every pre/post-commit failpoint, staging replacement, and final mode/size/nlink tampering. Review found and fixed paths that could have overstated strong durability after a competing staging entry and paths that could have called a created managed prefix “no change.” Ambiguous states now require manual reconciliation.

Ready PR #466 produced two review findings. First, a descriptor-close failure after successful final revalidation could be reported with weaker durability than was established. The fix does not trust `cleanupDirectorySynced` alone: only a dedicated state proving both completed final revalidation and the immediately following close failure receives strong/do-not-retry classification, tested with a hook that closes the real handle before returning an error. Second, the CLI's temporary `error` listener could accumulate if the same output stream were reused after failure. The fix absorbs a paired error in the same event-loop turn, detaches, and only then rejects; success, synchronous throw, paired error, and 20 repeated failures are covered. The fix revision is `f2b3cb4ec28a18e0dc29cb4e927f0abca5f27471`, and independent security/functional review leaves zero P0/P1/P2 findings.

The initial implementation's authoritative validation was focused 37 / 37, related 84 / 84, and full 2,335 / 2,335. Post-review-fix validation is focused 2 files / 42 tests, related 4 files / 89 tests, full 125 files / 2,340 tests, production build 193 / 193, TypeScript, scoped/full lint, Prettier 3.6.2, Python 58 tests, and zero dependency vulnerabilities. The full-only Node 22 run took 146.03 seconds, 146.49 seconds wall time, a maximum RSS of 4,283,318,272 bytes, and zero swaps. A nonauthoritative initial-implementation run under simultaneous build/full-lint load had one transient unrelated teacher-asset failure and retained a worker, so it was terminated and excluded. The post-fix 2,340 / 2,340 full-only run is the current authority.

## 7. Privacy and nonclaims

[Machine-readable evidence](./data/floodgate-v7-production-key-provisioning-and-instance-inspection-2026-07-15.json) excludes the raw key, root hash, derived key, MAC, candidate ID, candidate digest, approval ID, UID, absolute path, device/inode values, and descriptor numbers. Private record loading later compares exact identities, but the public article does not need another stable identifier.

This operation does not claim that:

- key backup, export, rotation, or recovery is complete;
- the candidate is approved or persisted;
- preflight, connector, checkpoint, dataset read, or teacher request/label succeeded;
- any real 100 / 500 / 24,000 parents were processed;
- an optimizer, candidate weight, live activation, or weight overwrite occurred; or
- formal A/B, Elo, rank, or stable high-dan strength was observed.

## 8. Next sequence

1. Push the review-fix revision and updated note to ready PR #466, pass final review and CI, and regular-merge it.
2. Have a human review the exact fresh candidate bytes and SHA in a candidate-specific act.
3. Run the merged installer exactly once to install the approved record.
4. Rerun preflight and verify that a fresh capability succeeds.
5. Run the connector's real durable-prefix-100 and record failure, durability, and cleanup evidence.
6. Only after 100 passes, proceed through 500, 24,000, three-seed training, holdout selection, color-swapped A/B, and staged live rollout.

Safe production-key creation plus local create-only-installer implementation, review fixes, and validation are complete. No strength-changing step has occurred yet. The next meaningful boundary is regular-merging the PR, then handing the observed candidate to candidate-specific human review without silently adopting it.
