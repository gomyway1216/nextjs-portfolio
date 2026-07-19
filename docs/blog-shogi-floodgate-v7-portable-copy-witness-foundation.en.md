# Floodgate v7 portable copy witness foundation: safely carrying authority to new inodes

> Conclusion as of 2026-07-19: the clean-room copy completed with exact bytes. The stop was neither corruption nor a timeout. Two valid safety contracts conflict: the historical semantic receipt correctly pins the original source inodes, while copy-by-value correctly requires fresh destination inodes. This PR adds a filesystem-only foundation for a future transition between them. It neither runs nor authorizes semantic verification, a teacher, training, candidate selection, A/B, or a live-weight change. Japanese version: [blog-shogi-floodgate-v7-portable-copy-witness-foundation.md](./blog-shogi-floodgate-v7-portable-copy-witness-foundation.md)

## What stopped after 522.211 seconds

The second local Mac clean-room preparation completed all four tree copies and the verifier-repository materialization. It then copied the standalone legacy exclusion file. An isolated reproduction against only the copied destination stopped after 522.211 seconds at this sanitized substage:

```text
role-lock-full-replay-watched-directory-closure-binding
```

The successful historical full-replay receipt for the original source pins the role-lock parent, root, and target-file device, inode, and ctime. The clean-room copy does not use hard links or a filesystem clone; it writes every byte into fresh inodes. Even when the destination bytes match exactly, the historical receipt for the original inodes must not be accepted as authority for those new inodes.

Both rules are correct:

1. the generic verifier must not accept different inodes as the historical source receipt;
2. the clean-room copy must not reuse the source inodes.

This PR does not weaken the generic verifier’s inode checks.

## Do not conflate the three measurements

| Measurement                                  |         Time | Scope                                                   | Result                        |
| -------------------------------------------- | -----------: | ------------------------------------------------------- | ----------------------------- |
| historical role-lock full replay             | 14,059.521 s | historical full replay on the original source           | PASS                          |
| current source full role-bundle confirmation |   1,089.52 s | current full-bundle verification on the original source | PASS                          |
| copied-destination isolated verification     |    522.211 s | role-bundle verification on the copy                    | FAIL at inode-closure binding |

The 14,059.521-second measurement is the historical full replay, 1,089.52 seconds is the current source-bundle confirmation, and 522.211 seconds is the isolated copied-destination stop. They do not cover the same work and are not speed comparisons.

The copy audit recorded 72,717 files and 1,227,490,748 bytes across the four reported trees, with zero byte mismatches and zero source/destination inode aliases. Completion of the standalone legacy-file copy was confirmed separately from that tree total. Corrupted copied data was not the cause.

## What this PR adds

The change is confined to [`ml/floodgate-v7-clean-room-copy.ts`](../ml/floodgate-v7-clean-room-copy.ts), unit tests, and documentation. It distinguishes exactly four kinds:

- `raw-lock-tree`
- `role-lock-tree`
- `role-bundle-tree`
- `legacy-file`

Filesystem capabilities have state only in module-private `WeakMap` registries. Each exported value is an empty frozen object with a nominal type. Object spread, cloning, or a structurally similar fake cannot reconstruct its internal state. Production and test registries are separate, so a capability issued by one is rejected by the other.

The transition order is fixed:

```text
source preseal
  → gap for external semantic verification
  → one-shot source filesystem seal
  → by-value copy through the existing copy core
  → one-shot copy witness
  → four-kind composite destination seal
  → serialized pre / callback / post revalidation
  → explicit idempotent revocation
```

The preseal privately retains the exact source path, entry paths and types, mode, uid, nlink, device, inode, ctime, mtime, birthtime, size, and SHA-256. It does not create the destination. A later PR can run the unchanged generic source verifier between the preseal and filesystem seal.

The filesystem seal consumes the preseal once and recaptures the full source before copy authority exists. A copy witness does not trust a second implementation’s self-declared receipt: it binds directly to the existing copy core’s hidden final-revalidation inventory. The existing public copy receipt, acceptance rules, and error shape remain unchanged.

## Why a composite seal is necessary

`raw-lock`, `role-lock`, and `role-bundle` are created in parallel under the same `inputs` parent. Sealing the parent immediately after the first correct copy would make the next correct sibling creation change the parent ctime.

Each copy therefore returns only an individual witness. A composite seal is created only after all four kinds succeed. Composite creation:

1. rejects missing kinds, duplicates, and capability replay;
2. explicitly rejects duplicate or ancestor/descendant destination paths;
3. recaptures every destination root or file;
4. captures the identity and exact immediate entries of each distinct parent;
5. recaptures destinations and parents to reject changes during sealing.

The parent scan does not allocate an unbounded `readdir` array. It uses `opendir.read()` with an at-most-`maxEntries + 1` probe and retains at most `maxEntries` entries. It does not claim that the filesystem never returns the one extra probed entry.

## The callback has pre/post checks, not callback-time namespace exclusivity

A later PR will place meaningful work inside one API:

```text
with...CompositeDestinationRevalidation(seal, operation)
```

Before its first `await`, the API marks the seal in use. It then serializes destination/parent pre-revalidation, the callback, Promise or thenable assimilation, and post-revalidation. Concurrent borrow, synchronous throw, asynchronous rejection, pre/post verification failure, file-descriptor close failure, or active revocation permanently invalidates the seal. This foundation does not self-declare the three-gate success limit; the future session composition owns that limit.

Independent review found that a configurable `length` getter on an ordinary function could execute before pre-revalidation. The fix no longer reads `length` normally. It inspects the own property descriptor and accepts only a data descriptor, without invoking a getter. Regression tests prove zero getter calls for both fake and valid composites.

Copilot review on PR #517 then found that witness-list validation dynamically
depended on mutable `Array.prototype.includes`. Fixing that single call would
not have closed the class of issue. A broader audit showed that replacing
`WeakMap.prototype.get`, `set`, or `delete` after module loading could
substitute genuine private state for a fake capability or defeat one-shot
consumption and enable replay.

Commit `89de568e` captures the required `Array`, `String`, `WeakMap`, and
`WeakSet` methods plus `Reflect.apply` during module initialization. Later
calls go only through that captured `Reflect.apply`. The protected copy and
portable-capability path also eliminates runtime dependence on mutable `Map`
and `Set` instance methods in favor of explicit kind comparisons, linear scans
over short arrays, and pairwise identity checks. The selected collection and
string dynamic-instance-call scan is zero.

Tests that poison those intrinsics after module loading still reject private
state substitution, consumed-witness replay, and destination overlap. They
also detect a destination-byte mutation even when
`Array.prototype.every` is replaced with a function that always returns true.
Commit `11b7c9e6` strengthens the regression order: after a genuine composite
could have exposed raw private state, the poisoned getter returns that state
for a replacement fake witness.
The exact claim is resilience to mutation of the captured intrinsics **after
module initialization**. It does not claim safety in a realm compromised
before module initialization or against arbitrary prototype mutation,
including every Node built-in prototype.

A synthetic private temporary fixture also confirmed the boundary. Inside the callback, it temporarily renamed the destinations’ common ancestor, created and read different bytes at the same absolute path, and restored the original before returning. Post-revalidation then saw the restored original identity and passed. No real private data was read.

A therefore claims exact revalidation **before and after** the callback. It does not claim absolute-path namespace exclusivity during the callback or semantic authenticity of bytes read by the callback. A future B composition must read destination inputs through held directory and file descriptors and bind those exact bytes to the SHA-256 and record identity authenticated by the source verifier.

## Local validation

On Node v22.13.0:

- portable-witness tests: 19 / 19 PASS;
- existing copy regression: 13 / 13 PASS;
- combined: 32 / 32 PASS in 1.51 seconds;
- evidence-pin tests: 4 / 4 PASS;
- all three related test files: 36 / 36 PASS in 1.59 seconds;
- expanded copy-consumer runner/gate/finalizer regression: 7 files, 107 / 107 PASS in 1.81 seconds;
- scoped ESLint: PASS;
- Prettier: PASS;
- `git diff --check`: PASS;
- repository-wide TypeScript: pre-existing baseline failures only, with zero errors in changed files.

Adversarial coverage includes source-byte mutation, same-byte delete/recreate of a tree root and standalone file, destination-byte mutation, same-byte destination-root inode swap, extra and missing entries, shared-parent sibling addition, fake/clone/replay, cross-kind misuse, wrong and overlapping destinations, missing and duplicate kinds, production/test cross-token misuse, callback `length` getters, post-load poisoning of `Array`, `Map`, `Set`, `String`, `WeakMap`, `WeakSet`, and `Reflect`, destination mutation from a thenable getter, synchronous and asynchronous callback failure, concurrent borrow, and idle/active revocation.

Existing copy regression continues to cover symlinks, hard links, modes, single-link destinations, source/destination inode aliases, and copy-descriptor close failures.

Latest `main` `0dd5469cefd88823b9b50c97c0e3531b4323eace`, including the failure-kind intrinsic hardening in PR #516, was integrated through regular merge commit `5fa4e179a86a5873c08be4b2863ae4075f6a059b`. That integration itself did not change the portable implementation and test paths or bytes; the subsequent PR #517 review hardening was added in separate commits. The README retains both the observed second-run verification STOP and the dormant foundation that addresses its cause. History was not rewritten.

## Were AWS, GCP, or Vercel used?

No. The foundation and unit validation use only the local filesystem and CPU.

| Infrastructure                       | Use in this change                      |
| ------------------------------------ | --------------------------------------- |
| local Mac CPU / filesystem           | unit tests and hash/metadata validation |
| AWS                                  | 0; not required                         |
| Firebase Cloud Functions / GCP       | 0                                       |
| Vercel                               | 0                                       |
| foundation/runtime unit-test network | 0                                       |
| GitHub PR/CI network                 | source control and validation only      |
| teacher process                      | 0                                       |
| optimizer training                   | 0                                       |
| live-weight activation               | 0                                       |

Firebase Functions running on GCP and Vercel serving web deployments are separate concerns. There is no reason to introduce AWS for this evaluator-preparation step. GitHub push and CI naturally use the network, but they are source-control and validation transport, not evaluator, teacher, or training compute.

Repository-wide CI has a check named `AWS witness adapter contract (source only)`. It does not start an AWS service; it verifies only the source contract of a future adapter. The Vercel check is the PR’s web-preview deployment, not shogi-teacher or training compute. This foundation invoked AWS services zero times.

## This is not strength evidence

This PR is a dormant foundation. Importing or merging it performs no filesystem I/O. It neither imports nor changes the generic role-lock, role-bundle, or result verifiers, the training consumer, the teacher runner, or the local runner.

New semantic verification on real data, teacher labels, retraining, candidate selection, holdout, formal A/B, external calibration, and live-weight changes all remain at zero. This is a prerequisite for safely verifying a copy in a later change, not evidence of stronger play.

Machine-readable evidence is in [`floodgate-v7-portable-copy-witness-foundation-2026-07-19.json`](./data/floodgate-v7-portable-copy-witness-foundation-2026-07-19.json).

## Next safe step

A separate PR must place the unchanged generic source semantic verifier between source preseal and filesystem seal, then compose its success with the copy witness. It must read destination inputs through held directory and file descriptors and bind those exact bytes to the source verifier’s SHA-256 and record identity. The local teacher session must allow exactly three serialized borrows and revoke the composite seal from `finally` on both success and failure.

That integration must not weaken generic inode verification. Only after review and CI should the retained clean room be safely audited and local teacher preparation retried through the new route. Until semantic verification passes, the pipeline must not advance to teacher generation, training, selection, A/B, or live weights.
