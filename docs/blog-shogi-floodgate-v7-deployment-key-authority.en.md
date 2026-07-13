# MAC-authorizing a v7 teacher run with the fixed deployment key

> The preceding [production parent coordinator](./blog-shogi-floodgate-v7-production-parent-coordinator.en.md) closes the fixed plan / producer policy and production-runtime receipt digests into a `run_binding`. A caller can still construct an object with the same shape, so that value alone does not show that the deployment key holder authenticated the run. This change adds the smallest metadata authority that reads a current-EUID-bound private 32-byte key through held descriptors and issues a domain-separated HMAC over strictly captured run / stage metadata. It is not evidence of real production-key provisioning or production-API execution, active-stage or coordinator origin, a checkpoint, a real label, training, a weight, live evaluation-function activation, games, or playing strength. Japanese version: [blog-shogi-floodgate-v7-deployment-key-authority.md](./blog-shogi-floodgate-v7-deployment-key-authority.md)

---

## Current boundary

| Item               | Current implementation / validation                                                                                                                         | What this change establishes                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Production API     | One argument to `authorizeFloodgateV7DeploymentTeacherRun(request)`; no dependency injection                                                                | Closes the surface that MACs caller-supplied exact metadata with the fixed key slot       |
| Test API           | `authorizeFloodgateV7DeploymentTeacherRunCoreForTests(request, dependencies)`                                                                               | Temporary-home / synthetic-key filesystem fault tests, not production origin              |
| Key slot           | `floodgate-v7-teacher-checkpoint-root-v1`, 32 bytes                                                                                                         | Accepts neither a caller-selected key ID nor caller key bytes                             |
| Fixed deployment   | `Library/Application Support/nextjs-portfolio/shogi-floodgate-v7-deployment-key-v1/root-key.bin` below the current EUID's `os.userInfo().homedir`           | Does not trust the `HOME` environment variable as production authority                    |
| Filesystem         | Canonical path, exact-`0700` parent, exact-`0600` regular / nlink-1 / 32-byte key, `O_NOFOLLOW`, held pre/post identity                                     | Fails closed on path / descriptor identity and metadata drift within one invocation       |
| Authorization      | HKDF-SHA-256 salted by run ID, then a separate-domain canonical HMAC-SHA-256                                                                                | Any exact receipt-metadata change changes the MAC                                         |
| Key instance       | `key_instance_id` from separate salt / info / HMAC domains                                                                                                  | Lets downstream compare different key instances without exposing the root key or its hash |
| Secret lifetime    | Zero-fills root, authorization-derived, instance-derived, and oversized-read bytes immediately after the MAC, before the final hook, revalidation, or close | Does not make secret lifetime depend on hook or filesystem-await progress                 |
| Execution evidence | Node v22.13.0, temporary filesystem / synthetic key focused **11 / 11 PASS**                                                                                | Not evidence of production-key provisioning or production-wrapper execution               |
| Live / strength    | Weight activation 0, games 0                                                                                                                                | Zero claim that the engine became stronger or stable at high-dan level                    |

## 1. Why a run binding alone is insufficient

The coordinator's `run_binding` combines the fixed plan, producer timeout / cancellation policy, and stable / teacher runtime receipt SHA-256 values. That is necessary to fix checkpoint-resume semantics, but a plain object's structure does not prove either that it came from the exact production coordinator or that the deployment key holder allowed it.

This authority handles only the latter boundary. It reads the fixed key slot from the current-EUID private deployment and issues a MAC over exact metadata supplied by its caller. It does not claim that a caller-supplied digest came from an exact runtime facade or that a stage receipt belongs to a currently active lease. Its status is therefore `mac-issued-for-strictly-captured-caller-supplied-run-and-stage-metadata-not-checkpointed`, and its claim boundary explicitly says `not-coordinator-origin-active-stage-authority`.

The next connector must not promote this MAC receipt into production-origin evidence by itself. Under one ownership boundary, it must claim the exact coordinator facade / run binding and the active stage lease, then pass those values exactly once to both the authority request and checkpoint invocation.

## 2. APIs and exact capture before the first I/O

The production API request has exactly four keys.

```text
runId
keyId
runBinding
stageAuthorizationReceipt
```

`runId` is 64 lowercase hexadecimal characters, and every `keyId` except the fixed literal is rejected. `runBinding` is fixed to schema `shogi-floodgate-v7-teacher-run-binding-v2` and plan identity 10,890 bytes / SHA-256 `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af`. Producer control accepts only this exact policy.

| Field                | Exact value                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| schema               | `shogi-floodgate-v7-teacher-producer-control-v2`                                                  |
| `parent_deadline_ms` | `1,800,000`                                                                                       |
| `abort_drain_ms`     | `30,000`                                                                                          |
| `max_in_flight`      | `12`                                                                                              |
| cancellation         | `first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2` |
| late settlement      | `observe-from-start-consume-after-terminal-without-validation-or-append-v2`                       |

The two runtime receipt digests must be lowercase SHA-256, but this module does not authenticate their production origin. The request, run binding, producer control, plan, stage receipt, identities, and allowed-entry array must be ordinary non-Proxy objects / dense arrays with exact own enumerable data keys. Accessors are never evaluated. Everything is copied into fresh frozen values before production identity or filesystem work begins. An invalid request starts no key-file I/O.

Only the test core accepts `effectiveUserId`, `homeDirectory`, and two optional hooks. The production wrapper exposes no dependency and requires agreement between `process.geteuid()` and the UID from `os.userInfo()`. The authority-owned key copy observable through a test hook belongs only to the test boundary; the production wrapper fixes that hook to `undefined`.

## 3. Fixed deployment and held-descriptor checks

Production deployment is fixed to:

```text
<os.userInfo().homedir>/Library/Application Support/nextjs-portfolio/
  shogi-floodgate-v7-deployment-key-v1/root-key.bin
```

The `realpath` of the home, key parent, and key file must equal the constructed absolute path. The key parent must be a current-EUID-owned exact-`0700` directory. The key must be a current-EUID-owned exact-`0600` regular file with link count one and size 32 bytes. The authority opens the parent with `O_RDONLY | O_DIRECTORY | O_NOFOLLOW` and the key with `O_RDONLY | O_NOFOLLOW`.

The order is pathname `lstat`, held `fstat`, an exact 32-byte positional read, EOF at byte 33, final held `fstat`, and final pathname `lstat`. Device, inode, mode, link count, UID, size, mtime, and ctime are compared across pre / held / post snapshots; a difference prevents receipt return. The signed `key_deployment` omits the absolute home / key path and key hash. It contains only the relative path, owner UID, mode / byte / link contract, decimal parent / key dev and ino, `key_instance_id`, and the held-revalidation flag.

This is not a sandbox against every same-EUID process or remote attestation. Its trust boundary is `trusted-current-euid-private-0700-key-deployment-and-current-js-realm-intrinsics-v1`; correct operator provisioning and the current process / realm remain trusted.

## 4. Run binding and durable stage binding

The stage-authorization receipt is strictly captured with its exact contract / trust boundary / status, exact allowed entries, parent / stage / lease identities, and safe stage / destination basenames. The authority then projects the following MAC-covered `stage_binding`:

```text
authorization_contract / authorization_trust_boundary / authorization_status
allowed_entries
parent_dev / parent_ino
stage_dev / stage_ino
stage_basename / destination_basename
lease_inode_included = false
```

Including a retry-specific lease inode in the MAC would prevent a safe resume over the same private stage with a fresh lease. The input receipt's lease identity is therefore structurally validated but explicitly excluded from the durable stage binding. Parent / stage identities and both basenames remain bound.

This is still a structural projection of a caller-supplied receipt. The authority claims no active lease registry, opens no stage path, and reads no staged entry content. `stage_receipt_origin`, `active_stage_lease`, `stage_lease_origin`, and `input_authentication` are all `false` in the receipt nonclaims.

## 5. HKDF, canonical HMAC, and key instance ID

The authorization path does not use the 32-byte root directly as its HMAC key. It derives 32 bytes with the run-ID bytes as salt and `shogi-floodgate-v7-deployment-run-authorization-key-v1\0` as HKDF info. It then feeds `shogi-floodgate-v7-deployment-run-authorization-v1\0` followed by the canonical unsigned receipt into HMAC-SHA-256. The algorithm literal is `hkdf-sha256-then-domain-separated-canonical-hmac-sha256-v1`.

Canonical JSON uses UTF-8 bytewise key order, rejects nonfinite numbers and negative zero, and accepts only dense exact arrays and enumerable data properties. The MAC covers contract / status / claim / trust / execution boundary, run / key ID, run binding, stage binding, key deployment, test boundary, and nonclaims. Only `authorization_mac` is appended afterward; the root and every nested record are null-prototype and frozen.

A fixed `keyId` alone does not let receipt comparison distinguish an operator replacing the file in the same slot. A deterministic `key_instance_id` is therefore derived through a different fixed salt, HKDF info, and HMAC domain, then included in the signed key deployment. It is a domain-separated pseudonymous identifier, not the root bytes or their SHA-256. This module reads no historical receipt or rotation registry, so `cross_invocation_key_rotation_detection` remains `false`; the next boundary must compare instance IDs and fail closed.

## 6. Returning no key and zeroizing after the MAC, before the next await

The public receipt returns no root key, key hash, derived key, or generic signer callback. The source imports no dataset, checkpoint implementation, production coordinator, or runtime, and accesses no `train.jsonl`, `work.jsonl`, or weight path.

Authority-owned byte buffers comprise the 32-byte root, 32-byte authorization-derived key, 32-byte instance-derived key, and one oversized-read byte. On the success path, immediately after computing both HMAC values, the authority synchronously zero-fills them through the captured `Buffer.prototype.fill` and verifies every byte is zero. This occurs before **every subsequent await**: the test-only final hook, held / pathname final `fstat` / `lstat`, and descriptor close. A path that fails before MAC completion zeroizes the same buffers again at the start of `finally`, before close. A stalled hook or filesystem operation therefore cannot extend secret lifetime. Zeroization and descriptor-cleanup failures remain separate from the primary failure, and a successful body with failed cleanup returns no receipt.

The test-only observer may synchronously retain the internal root copy solely so tests can prove that it is all-zero after resolution or rejection. It does not exist on the production execution boundary.

## 7. Findings and intermediate data

| Finding / intermediate value                                                             | Current meaning                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `os.userInfo().homedir` plus EUID agreement is required instead of `HOME`                | Does not grant production key-root authority to an environment override                    |
| Both parent and key are held while paths and descriptors are compared before / after     | Fails closed on symlink, mode, owner, link, size, and identity drift within one invocation |
| A fixed key ID cannot by itself distinguish file replacement in receipt comparison       | Added a separately domain-separated, signed `key_instance_id`                              |
| Even with an instance ID, this module reads no history                                   | Cross-invocation rotation detection / policy enforcement remains next-stage work           |
| The stage lease inode is retry-specific                                                  | Validates it in input but excludes it from the durable signed stage binding                |
| Exact-shape stage / run objects are not production origin                                | Fixes coordinator / runtime / active-stage origin as explicit nonclaims                    |
| Zeroization after the final hook / revalidation / close would retain keys during a stall | Moved zero-fill immediately after the MAC and before the next await                        |
| Synthetic focused tests pass 11 / 11                                                     | Not a measurement of production keys, real data, teacher throughput, or playing strength   |
| Formal A/B remains preregistered at 192 color-swapped pairs / 384 games                  | This metadata authority executes zero games                                                |

## 8. Test evidence and explicit nonclaims

On 2026-07-13, using the repository-specified Node v22.13.0, the following was observed.

| Check                                                | Result                                         | Boundary                                                          |
| ---------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Focused deployment-key authority                     | **PASS: 11 / 11**                              | Temporary filesystem / synthetic 32-byte key / injected test core |
| Related authority / stage / checkpoint (three files) | **PASS: 157 / 157**                            | Imported stage contract and checkpoint regression                 |
| Full Vitest                                          | **PASS: 115 / 115 files; 2,037 / 2,037 tests** | Repository regression                                             |
| Python ML stdlib                                     | **PASS: 58 / 58**                              | Regression of the unchanged training verifier                     |
| TypeScript `--noEmit`                                | **PASS**                                       | Source / test type closure                                        |
| Scoped ESLint / Prettier / diff-check                | **PASS**                                       | Changed source / test / both articles                             |
| Next production build                                | **PASS: exit 0; 13 workers**                   | Existing Firebase build-phase / dynamic-route warnings only       |
| Production-key provisioning                          | **0**                                          | Created or changed no secret at the fixed real path               |
| Production-API execution                             | **0**                                          | Only the injected test execution boundary ran                     |
| Real parent / label / checkpoint                     | **0**                                          | No dataset or checkpoint I/O                                      |

The 11 tests cover a golden HKDF / HMAC, deeply frozen null records, exact records / arrays, zero Proxy traps, no accessor evaluation, pre-I/O rejection of v1 / plan / policy / digest / run / key / stage mutations, MAC sensitivity, unsafe mode / link / size / directory / ownership / symlink / noncanonical paths, post-read replacement, success / failure zeroization, and the source import surface. Because they use a synthetic key, they establish neither the presence nor correctness of the production secret.

Receipt nonclaims are `key_export`, `key_hash_disclosure`, `generic_signing`, `coordinator_origin`, `runtime_origin`, `active_stage_lease`, `stage_lease_origin`, `stage_receipt_origin`, `input_authentication`, `cross_invocation_key_rotation_detection`, `checkpoint_connector`, `dataset_read`, `checkpoint`, `runtime`, `teacher_label`, `training`, `selection_or_holdout_access`, `weight`, `live_evaluation_activation`, `match`, and `playing_strength`, all fixed to `false`.

Real Floodgate labels, optimizer steps, candidate weights, production-weight overwrite, live evaluation-function / weight activation, games, Elo, rating, and rank therefore remain zero. A future application-code merge / deployment is separate from weight activation; this article makes no claim of a live-weight change.

## 9. Next: exact connector, 100 / 500 durable prefixes, and the 24,000 seal

The next stage composes exact authorities in a separate trusted connector instead of adding more responsibility here.

1. Single-use claim the exact production parent coordinator and obtain its exact `run_binding`.
2. Single-use claim the active stage lease and use its exact authorization receipt.
3. Compare the authority receipt's run / stage / key instance exactly with the checkpoint invocation.
4. Project only the exact two-operation checkpoint controller `{ produce, abortAndDrain }` from the coordinator.
5. Pass synthetic connector tests that fail closed on timeout, simultaneous failure, late settlement, close stall, resume, and key / instance mismatch.
6. Without opening holdouts, run a 100-parent production pilot and audit its durable authenticated prefix, fsync, resume, failures, throughput, and residual processes.
7. Pass the same fixed-policy 500-parent durable prefix, then and only then complete all 24,000 training parents through a full authenticated seal.

The 100 / 500 prefixes and 24,000 seal are teacher-data production / durability gates, not playing-strength results. Seed-42 / 43 / 44 QAT, fresh selection, fresh / legacy final, known regressions, production parity, and the formal 192-pair / 384-game A/B all remain afterward. Only a candidate that passes every internal gate may proceed to 81Dojo calibration under separate explicit authorization.
