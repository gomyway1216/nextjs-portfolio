# Closing candidate bytes into an approved capability — Floodgate v7 key enrollment control plane

> The [deployment-key instance inspector](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.en.md) briefly reads the fixed key and returns a candidate receipt containing a non-secret `key_instance_id`. Candidate observation is not approval. This change adds the source boundary that reads a fixed private approved record bound to the exact candidate bytes and SHA-256, then mints an opaque single-use capability with no public ID among its own properties. The [production checkpoint connector](./blog-shogi-floodgate-v7-production-checkpoint-connector.en.md) is also updated to v2: its public options no longer contain a caller-supplied `expectedKeyInstanceId`, and it synchronously claims only the approved capability. Focused validation is **132 / 132 PASS**, related regression is **335 / 335 PASS**, stable full regression is **2,245 / 2,245 PASS**, and the production build and final independent review are complete. PR, CI, and merge remain pending. Actual key provisioning or inspection, record approval, installation, or loading, connector execution, teacher work, training, weights, live activation, matches, and playing-strength evidence all remain at zero. Japanese version: [blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.md](./blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.md)

## 1. Current status

| Item                                      | Current status                | Meaning                                                                  |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Approved-enrollment module source         | Implemented / source-reviewed | Review fixes the exported contract, loader, factory, and claim APIs      |
| Canonical candidate bytes / SHA binding   | Locally validated             | Compares exact JSONL bytes, byte count, SHA-256, and deployment          |
| Fixed private production loader           | Implemented / source-reviewed | Actual execution of its zero-argument production identity/origin is zero |
| Shared fixed-record reader                | Fixture-validated             | Injected test loader covers fixed paths, metadata, and held reads        |
| Temporary-home loader / synthetic factory | Locally validated             | Separates test shortcuts from the production home                        |
| Opaque single-use capability              | Locally validated             | Public ID is in the private claim, not a capability own field            |
| Connector v2 integration                  | Locally validated             | Public options accept only an approved capability                        |
| Operator preflight source                 | Implemented / source-checked  | Argumentless metadata-only load/claim; actual executions are zero        |
| Focused validation                        | 132 / 132 PASS                | Enrollment tests 21; connector integration tests 111                     |
| Related / stable full validation          | PASS                          | 10 files / 335 tests; 122 files / 2,245 tests                            |
| Local build / static validation           | PASS                          | Production build, TypeScript, lint, formatting, and audit                |
| Independent security review               | P0 / P1 / P2 = 0 / 0 / 0      | Final seal after fixing two initial P1s and follow-on P2s                |
| PR review / CI / merge                    | Pending                       | Uncreated or unexecuted work is not presented as passing                 |
| Real provision / inspection / enrollment  | 0 / 0 / 0                     | No actual key byte or approved record has been handled                   |
| 100 / 500 / 24,000 connector gates        | 0 / 0 / 0                     | No real connector or teacher execution                                   |
| Training / weight / live / strength claim | 0 / 0 / 0 / 0                 | Production evaluation bytes remain unchanged                             |

The completion condition for this change is to validate candidate → approved record → opaque capability → exact connector claim / authority comparison with temporary fixtures. It is not to operate the actual-home key, a real approved record, or the production connector.

## 2. Exact record contract and canonical candidate binding

The source fixes the record contract below.

```text
contract       = shogi-floodgate-v7-approved-key-enrollment-control-plane-record-v1
status         = separately-reviewed-candidate-approved-and-pinned
approval.method= separate-human-review-and-fixed-private-record-persistence-v1
claim_boundary = canonical-candidate-bytes-digest-fixed-deployment-identity-and-public-instance-pinned-in-private-current-euid-record-no-key-material-signature-run-gate-checkpoint-runtime-training-live-or-strength-authority
trust_boundary = trusted-separate-review-fixed-current-euid-private-0700-control-plane-parent-0600-record-and-current-js-realm-intrinsics-without-cryptographic-approval-signature-v1
```

`FloodgateV7ApprovedKeyEnrollmentRecord` accepts only the exact top-level keys `contract`, `status`, `claim_boundary`, `trust_boundary`, `approval`, `key_deployment`, and `nonclaims`. `approval` contains a 64-lowercase-hex `approval_id`, an exact UTC timestamp with milliseconds, the method above, and the candidate envelope. It is a private record asserting that separate human review occurred, not a cryptographic approval signature or MAC.

The candidate envelope binds these three values together:

- `canonical_json`: the exact one-record JSONL string emitted by the candidate inspector;
- `bytes`: its UTF-8 byte count;
- `sha256`: the 64-lowercase-hex SHA-256 of the UTF-8 `canonical_json` bytes.

The loader revalidates the candidate contract, status, claim, trust, algorithm, execution boundary, test boundary, and nonclaims. It also extracts the fixed `key_id`, public `key_instance_id`, owner UID, parent/key device and inode, modes, size, link count, and held-descriptor revalidation, then requires canonical value equality with the approved record's `key_deployment`.

The record itself must be one LF-terminated JSONL record exactly equal to `JSON.stringify(capturedRecord) + "\n"`. Different key order, unknown or duplicate keys, accessors or Proxies, different escapes, noncanonical numbers, CRLF, candidate byte-count or SHA mismatch, and candidate/record deployment mismatch are not repaired. Neither the candidate inspector nor this module approves or installs an actual candidate.

## 3. Fixed private production loader

The production entry point is the zero-argument `loadFloodgateV7ApprovedKeyEnrollment()`. It accepts no caller-provided home, record path, candidate bytes, expected ID, approval flag, or filesystem callback. It derives only this fixed slot from the current effective UID and `os.userInfo()`:

```text
<userinfo home>/Library/Application Support/nextjs-portfolio/
  shogi-floodgate-v7-control-plane-v1/approved-key-instance.json
maximum record bytes = 65,536
```

The production path fails closed through these steps:

1. Confirm POSIX effective-UID support, equality with `os.userInfo().uid`, a nonnegative UID, and a canonical absolute home.
2. Check named metadata and realpaths for the fixed parent and record.
3. Require current-EUID ownership, an exact `0700` directory, an exact `0600` regular file, `nlink = 1`, and a size of 2..65,536 bytes.
4. Open the parent with `O_DIRECTORY | O_NOFOLLOW` and the record with `O_NOFOLLOW`, then match named and held device, inode, and metadata.
5. Read once with captured `readvSync` into one full buffer of the exact stat-fixed size; fail closed on a short read, then require EOF from a one-byte growth probe.
6. Revalidate final named and held identities and metadata before capturing the record bytes.
7. Return the capability to the caller only after both the record and parent descriptors close successfully.

The loader never opens the deployment-key file and never reads key bytes. Success means only that this process read the fixed approved record and verified the candidate binding written into it. It does not prove actual-key continuity, that a real approval procedure occurred, or connector success.

The source decodes record bytes with `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`, rejecting malformed UTF-8 before JSON parsing. It then checks LF/CR rules, the exact parsed shape, and canonical string equality. Adversarial tests for rejecting malformed sequences, a leading BOM, reordered outer-record keys, and an oversized record all **pass**.

The argumentless operator preflight is `npm run --silent shogi:floodgate-v7-key-enrollment-preflight`. It immediately production-claims the capability from `loadFloodgateV7ApprovedKeyEnrollment()` and writes only the key-material-free claim JSONL to stdout. An argument, load, claim, or stdout failure produces a fixed stderr message and a nonzero exit. The command exists in source, but actual execution against the fixed record remains **0**.

## 4. Opaque single-use capability and claim

`FloodgateV7ApprovedKeyEnrollmentCapability` has only these four public own fields and is a frozen null-prototype object:

```text
contract           = shogi-floodgate-v7-approved-key-enrollment-capability-v1
status             = opaque-single-use-approved-key-enrollment-not-claimed
claim_boundary     = <the record's fixed claim boundary>
execution_boundary = production...record or test-only...record
```

The capability itself has no `key_instance_id`, candidate or record bytes, path, descriptor, function, Buffer, or `Uint8Array`. The actual binding is stored in a module-private `WeakMap` keyed by exact object identity. The source uses **one map carrying an exact execution boundary**, not two separate production and test maps.

- `claimFloodgateV7ApprovedKeyEnrollment(capability)` accepts only the production boundary.
- `claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability)` accepts only the test boundary.
- Fake, clone, Proxy, and same-shaped objects cannot be claimed.
- A claim whose API and boundary match deletes the map entry, then returns one frozen claim. A second claim fails.
- The wrong production/test API fails its boundary check without deleting the entry, so the correct API may still claim it later.

The claim result includes record bytes/SHA, candidate bytes/SHA, approval metadata, the fixed `key_id`, public `key_instance_id`, owner UID, and deployment device/inode identity. The public ID is therefore hidden from the capability until an exact successful claim, not hidden forever. Connector v2 consumes this claim synchronously and compares the returned binding with the actual-key authority in the same invocation.

## 5. Temporary-home test boundary

The filesystem test loader is `loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({ effectiveUserId, homeDirectory })`. Before opening the record, it checks the current effective UID, production `userInfo` UID, direct-string equality, realpath equality, and device/inode equality against the production home, rejecting an actual-home alias. It shares the fixed relative components, owner/mode/type checks, and held read with the production loader, but requires the exact test-only execution and test boundaries in the candidate.

`createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(record)` is a synthetic factory that reads no filesystem. It captures only an exact record containing a test-boundary candidate and mints a capability accepted only by the test claim. It does not assert production origin, actual approval, or actual-key continuity.

Unit tests, TypeScript, lint, build, PRs, CI, and module import do not perform actual key provisioning or inspection, approved-record installation or production loading, or connector, checkpoint, runtime, or teacher execution.

## 6. Connector integration boundary

The connector contract is updated to `shogi-floodgate-v7-production-checkpoint-connector-v2`. The exact public `FloodgateV7ProductionCheckpointConnectorOptions` keys are `runId`, `gate`, `keyEnrollment`, `stageAuthorization`, and `consumer`; there is no caller-supplied `expectedKeyInstanceId`.

Before starting asynchronous work, the production entry synchronously calls `claimFloodgateV7ApprovedKeyEnrollment(request.keyEnrollment)` and the test core calls the test claim API. It turns the successful claim's public ID into an internal expected value and, after opening the actual-key authority, compares all of the following exactly:

- `key_instance_id`;
- owner UID;
- parent device/inode;
- key device/inode.

A mismatched claim origin, fake or consumed capability, or wrong production/test claim API fails closed in connector `phase = enrollment` before the actual-key authority opens. Those are not key-instance mismatches. After a successful claim, a difference in the public ID, owner UID, or parent/key device or inode returned by the actual authority fails in `phase = key-instance`. The connector consumes the capability once at entry, so a later readiness, key, or checkpoint failure requires a fresh invocation and fresh capability. Connector v2 also captures fixed gate-receipt status/sealed/target/completed/records, resumed-parent ranges, and maximum total bytes.

Connector-focused integration is **111 / 111 PASS**. Related and stable full regression, the production build, and final independent review also pass. PR, CI, and merge remain pending, and local synthetic evidence alone does not make this connector-ready, production-ready, or gate-ready.

## 7. Failure and retry

| Failure                                         | Capability / claim      | Exact behavior                            |
| ----------------------------------------------- | ----------------------- | ----------------------------------------- |
| Production identity or argument-capture failure | Do not mint             | `phase = capture`                         |
| Test home aliases the actual home               | Do not mint             | `phase = test-boundary`                   |
| Record absent, unsafe, changed, or close fails  | Do not return to caller | `phase = record-read`                     |
| Malformed or noncanonical filesystem record     | Do not return to caller | `phase = record-validation`               |
| Invalid synthetic-factory record                | Do not mint             | `phase = record-validation`               |
| Candidate bytes/count/SHA/deployment mismatch   | Do not mint             | Do not repair or auto-enroll the record   |
| Fake, clone, or Proxy                           | Do not claim            | `phase = claim`                           |
| Wrong production/test claim API                 | Reject / not consumed   | Retry through the correct API is possible |
| Same capability after one successful claim      | Reject / consumed       | Do not revive the capability              |

Every public error reports `capability_issued: false`. Rereading a record does not revive an old capability; it creates a new loader invocation and exact capability. Rotation, revocation, and recovery remain separate explicit operator workflows.

## 8. Validation status — local validation and review complete; PR, CI, and merge pending

| Validation                             | Status             | Evidence / measured result                                                                 |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| Focused approved-enrollment tests      | 21 / 21 PASS       | Exact record, canonical bytes/SHA, loading, and single-use claiming                        |
| Adversarial record / filesystem tests  | PASS               | Malformed UTF-8, BOM rejection, reorder, >64 KiB, alias, ancestor swap, replacement/growth |
| Intrinsic-poison boundary tests        | PASS               | Zero live accesses under Promise/iterator/number/crypto/typed-array poisoning              |
| Connector-focused integration tests    | 111 / 111 PASS     | Capability-only options, UID 0 / byte bounds, identity/layout/algorithm, and gate bounds   |
| Combined focused                       | 132 / 132 PASS     | 2 files, `0.664 s`                                                                         |
| Related regression                     | 335 / 335 PASS     | 10 files, `143.37 s`                                                                       |
| Stable full Vitest                     | 2,245 / 2,245 PASS | 122 / 122 files, 8 workers, duration `152.80 s`                                            |
| Python stdlib                          | 58 / 58 PASS       | Reconfirmed under the Node 22.13 runtime path; suite `0.106 s`                             |
| TypeScript / scoped ESLint / Prettier  | PASS               | Exact current source, test, and document delta                                             |
| Full lint                              | PASS               | 0 errors and 157 pre-existing warnings unrelated to this diff; real `29.82 s`              |
| Production Turbopack build             | PASS               | Real `29.30 s`; compile `8.4 s`; TypeScript `18.3 s`; static 193 / 193 with 13 workers     |
| npm audit                              | PASS               | 0 vulnerabilities                                                                          |
| Independent security review            | P0/P1/P2 = 0       | Final delta sealed after fixing two initial P1s and the follow-on P2 findings              |
| Ready PR / required CI / regular merge | Pending            | No URL, head, check result, or merge commit exists yet                                     |

The final post-P2 stable run took `153.64 s` real time and reached a maximum RSS of 4,129,849,344 bytes. The first maximum-parallel full-suite run had reached 121 / 122 files and 2,244 / 2,245 tests because of an unrelated USI transcript timeout. The same file immediately passed 43 / 43 in isolation. This transient remains recorded as intermediate data; the table treats the final resource-bounded 8-worker run at 122 / 122 files and 2,245 / 2,245 tests as the authoritative local result.

These are local source and temporary-fixture results. They do not validate an actual production record, actual key, real connector gate, teacher, training, live weight, or playing strength.

## 9. Explicit nonclaims

- actual deployment-key provisioning: **0**;
- actual-home key-instance inspection / key bytes read: **0 / 0**;
- approved production-record creation / installation / load: **0 / 0 / 0**;
- production capability mint / claim: **0 / 0**;
- production connector 100 / 500 / 24,000 gates: **0 / 0 / 0**;
- real role-bundle callback / stable proposal / teacher proposal / rescore: **0 / 0 / 0 / 0**;
- published teacher labels / optimizer steps / candidate weights: **0 / 0 / 0**;
- production-weight overwrite / live evaluation activation: **unchanged / unchanged**;
- matches / rating / stable-high-dan evidence: **0 / not established / not established**.

Creating approved-shaped records or capabilities with temporary fixtures does not establish actual control-plane approval, production origin, actual-key continuity, or connector success. At this point, this change proves only its source authority boundary and completed local synthetic validation and review.

## 10. Next order

1. Preserve the completed local evidence: 132 / 132 focused, 335 / 335 related, 2,245 / 2,245 stable full, build, and review.
2. Open a ready PR, address review comments, pass required CI, and regular-merge it.
3. Perform no actual key provisioning or inspection and no record installation or loading without separate explicit approval.
4. Only after approval, separately review the raw candidate bytes and create-only install the approved record.
5. Only after that, treat the 100-parent connector gate as separate execution evidence.

Merge, CI, and application deployment do not automatically execute step 5 or anything after it. An approved-enrollment capability is only one gate-start prerequisite; it is not a teacher label, training, a live weight, or stable-high-dan strength.
