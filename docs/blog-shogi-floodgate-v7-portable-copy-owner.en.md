# Floodgate v7 portable copy owner: binding source A, copy B, and destination C to one lifecycle

> Conclusion as of 2026-07-19: PR #517 added a dormant foundation that preseals the original source filesystem closure, copies by value into fresh inodes, and revalidates the copied destination before and after a callback. Letting a caller assemble those low-level capabilities individually still leaves an owner-level risk: valid A, B, and C components from different sessions could be confused. This change privately snapshots the exact four-kind source-to-destination mapping and prevents PR #517's preseal, seal, witness, and composite from escaping through this owner path. It does not prove semantic authenticity of verified bytes, callback-time namespace exclusivity, teacher work, training, live weights, or playing strength. Japanese version: [blog-shogi-floodgate-v7-portable-copy-owner.md](./blog-shogi-floodgate-v7-portable-copy-owner.md)

## Why an owner follows PR #517

PR #517 prepared this filesystem-only transition for the conflict between a historical receipt that correctly pins original inodes and a clean-room copy that correctly requires fresh inodes.

```text
source preseal
  → gap for external semantic verification
  → one-shot source filesystem seal
  → by-value copy plus one-shot witness
  → four-kind composite destination seal
  → destination revalidation before and after a callback
  → revocation
```

Correctness of each stage does not by itself prove ownership of one operation. A design could otherwise mix a valid source closure A, a valid copy witness B from another session, and a valid destination closure C from a third session. Rejecting structural fakes is insufficient because confusion between **genuine capabilities from different operations** is a separate threat.

This owner does not ask the caller to assemble low-level capabilities. It advances A, B, and C as one private lifecycle and exposes only an opaque bridge or lifecycle capability bound to that owner.

The existing PR #517 low-level exports remain unchanged. This change does not
claim that they became unreachable across the repository. Its narrower claim
is that the new owner path does not disclose an underlying capability through
an argument, result, callback, or public receipt.

The opaque owner and verification pause returned by owner preseal refer to
staged state that keeps all four underlying A preseals in a module-private
`WeakMap`. The caller can run
an external generic source verifier during that pause and then pass the same
fixed-order mapping to a one-shot bind. Only an exact match lets bind perform
seal → copy → composite internally and return an opaque bound bridge associated
with the owner. The pause does not turn a self-reported verifier result into
authority, and bind neither accepts an external verifier receipt nor proves
that the verifier succeeded. The real verifier execution count in this change
remains zero.

## What A, B, and C mean

This document names the boundaries as follows.

| Symbol | Boundary                  | What it covers                                                                                                      | What it does not establish alone                                                                                   |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A      | source filesystem closure | the canonical source path and exact inventory did not change after preseal                                          | dataset semantics or success of a generic verifier                                                                 |
| B      | by-value copy transition  | a source-inventory-bound copy enters fresh destination inodes and obtains a witness from the hidden final inventory | same-operation identity with a caller-selected A or C                                                              |
| C      | destination closure       | exact pre/post revalidation of all four destinations and their shared parents                                       | callback-time absolute-path namespace exclusivity or semantic authenticity of bytes actually read by the operation |

The owner therefore closes **cross-session confusion among A, B, and C**. It does not silently promote C's documented nonclaim into semantic verification. “Source A” means the source filesystem closure captured by PR #517, not shorthand for a semantically verified source.

## Four staged-owner operations form the public API

The production wrapper exposes four capability operations.

| API                                            | Public input                                                 | Public result or effect                                                           |
| ---------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `presealFloodgateV7PortableCopyOwner`          | four fixed-order bindings plus owner-local safe dependencies | `{ owner, verificationPause }`; both tokens are empty, frozen, and null-prototype |
| `bindFloodgateV7PortableCopyOwnerBridge`       | exact owner, pause, and the same fixed-order exact bindings  | an empty opaque bound bridge after internal seal, copy, and composite             |
| `withFloodgateV7PortableCopyOwnerRevalidation` | exact owner, bound bridge, and zero-argument callback        | callback result within serialized pre/callback/post revalidation                  |
| `revokeFloodgateV7PortableCopyOwner`           | exact owner                                                  | invalidates the private lifecycle and underlying composite authority              |

The `CoreForTests` forms exercise the same mechanics through a disjoint
registry. They add no dependency injection to the production wrapper, and a
test capability cannot be used in production. An owner error exposes a fixed
name, message, and contract, an operation among `preseal`, `bind`, `borrow`,
and `revoke`, and `sensitive_values_disclosed = false`; it does not forward
nested error text or a configured path.

To prevent automatic retries, owner errors also expose a conservative recovery
classification for each operation.

| Operation | `destination_write_may_have_started` | `consumer_callback_may_have_started` | `retry_disposition`                                      |
| --------- | ------------------------------------ | ------------------------------------ | -------------------------------------------------------- |
| `preseal` | `false`                              | `false`                              | `fresh-preseal-allowed`                                  |
| `bind`    | `true`                               | `false`                              | `manual-clean-room-reconciliation-required`              |
| `borrow`  | `true`                               | `true`                               | `manual-consumer-and-clean-room-reconciliation-required` |
| `revoke`  | `true`                               | `true`                               | `manual-owner-reconciliation-required`                   |

This is not a receipt proving whether a destination write or public borrow
consumer callback actually started in one failure. It is an operation-level
over-approximation that avoids becoming an oracle for the exact lifecycle
phase. No operation except `preseal` is thereby authorized for unconditional
automatic retry.

Production binding dependencies admit only the own data keys
`effectiveUserId`, optional `maxEntries`, and optional `maxTotalBytes`. A Proxy
or accessor is rejected. `maxConcurrencyForTests` and the four `*ForTests`
callback keys are rejected at runtime as well as excluded from the production
TypeScript type. Only the `CoreForTests` preseal accepts a separate
`FloodgateV7PortableCopyOwnerBindingForTests` with full
`FloodgateV7CleanRoomCopyDependencies`.

## Exact four-kind mapping

The owner admits exactly four kinds.

- `raw-lock-tree`
- `role-lock-tree`
- `role-bundle-tree`
- `legacy-file`

The first three are trees; `legacy-file` alone is a standalone file. The owner stores each canonical source and canonical destination in one private snapshot. Binding checks all four mappings exactly and rejects missing, duplicate, or unknown kinds, ordering-based substitution, and source/destination confusion.

The caller supplies B binding with exactly four entries in fixed order. The
owner rejects a Proxy and captures data descriptors without invoking getters,
then strictly compares that snapshot with the owner-private kinds, sources,
and destinations. Only an exact match can consume the composite once.

Before any underlying preseal starts, an all-pairs namespace preflight checks
all four sources against one another, all four destinations against one
another, and every destination against every source. Any equal, ancestor, or
descendant relationship is rejected. This prevents one kind's copy
destination from entering and mutating another kind's source during copy.

The caller supplies source and destination paths as preseal and bind inputs,
but they appear in no opaque owner, pause, or bound bridge, successful result,
or sanitized error. Mapping and foundation capabilities remain in owner-private
state. Cloning, spreading, or reconstructing a plain object cannot recover
authority.

## Opaque, replay, and revocation boundaries

The owner path does not return any of these PR #517 capabilities as raw values to its caller.

- source preseal
- source filesystem seal
- copy witness
- composite destination seal

An exposed bridge or lifecycle value is opaque: a lookalike object is insufficient without exact identity in the owner's private registry. Double binding, replay of a consumed value, and cross-use between another owner instance or production/test registry fail closed.

Production and `CoreForTests` wrappers use disjoint registries. The underlying
nominal capability types—source preseal, source filesystem seal, copy witness,
and composite destination seal—appear in no public owner-API parameter or
result. After bind, the public capability values are the opaque owner,
verification pause, and bound bridge.
Borrow and revocation go through top-level owner APIs rather than methods on a
raw composite; revocation accepts the exact owner.

Revocation is not merely a caller assertion that a value will no longer be used. An explicit `revoke` invalidates the private owner lifecycle. A stale bridge cannot be treated as a way to recover the foundation composite after failure or explicit revocation. A success-count limit and an exact three-gate session are not yet complete teacher authorization in this owner alone.

If revocation or failure occurs after bind has started seal or copy work, owner
authority is invalidated immediately and no bound bridge is issued. Already
started filesystem Promises are not claimed to be cancelled, and partial
destinations are not rolled back. The existing copy contract can preserve a
partial destination, so the caller must conservatively reconcile or remove all
four configured destinations before a fresh run restarts from the
fresh-absent condition.

## Scope of post-module intrinsic checks

A plain Node child replaces built-ins after module initialization and checks
exactly four modes: `array-string`, `weak-collections`, `reflect`, and
`promise-resolve-preseal`.
`array-string` replaces `Array.isArray`, `Array.prototype.map` / `some` /
`includes`, and `String.prototype.includes` / `startsWith`; `weak-collections`
replaces `WeakMap.prototype.get` / `set` / `delete` and
`WeakSet.prototype.has` / `add`; `reflect` replaces `Reflect.apply` /
`Reflect.ownKeys`. `promise-resolve-preseal` replaces only post-initialization
`Promise.resolve`, then stops after preseal and revocation. It does not run
bind, copy, or borrow.

A control experiment using the old captured `Promise.allSettled` plus native
`Promise` pattern consulted a substituted `Promise.resolve` after a genuine
native Promise had already been created and produced
`OLD_PATTERN_REJECTED=substituted Promise.resolve consulted`. The new
`settleFour` synchronously attaches a `settleOne` rejection handler to all four
started operations before awaiting the first. A regression where the later
three reject first records zero `unhandledRejection` events.

These checks do not prove resistance to `Promise.prototype.then` or arbitrary
global `Promise` / `Object` poisoning. Nor does this change claim that the
whole underlying PR #517 low-level module completes its full lifecycle safely
under arbitrary poisoning.

## C still has an explicit nonclaim

PR #517's synthetic fixture temporarily renamed the destination's common ancestor during the callback, installed and read different bytes at the same absolute path, and restored the original before return. Post-revalidation then passed. That is a documented nonclaim, and this owner does not hide it.

Even when C is owner-bound, its inspection scope remains **before and after** the callback. A later composition must read destinations through held directory and file descriptors and bind the exact bytes used by the operation to the SHA-256 and record identity authenticated by the source verifier. Until that exists, all of these counts remain zero.

- real source semantic verification
- semantic input authenticity
- teacher authorization
- teacher generation or labels
- training, selection, or holdout
- A/B or external calibration
- live-weight activation

## A local-only candidate

Validation here exercises the owner contract and synthetic temporary fixtures. It is not an operation over the real private dataset. Importing or merging the code does not start a copy, generic semantic verifier, teacher, optimizer, or match.

| Infrastructure                         | Use by this owner validation                |
| -------------------------------------- | ------------------------------------------- |
| local Mac CPU and temporary filesystem | unit tests, hashes, and Git identity checks |
| AWS                                    | zero; not required                          |
| Firebase Cloud Functions / GCP         | zero                                        |
| Vercel evaluator compute               | zero                                        |
| real private source or destination     | zero                                        |
| teacher, optimizer, or live activation | zero                                        |

A later GitHub push, CI run, or Vercel PR web preview is source-control or web-deployment validation, not shogi teacher or training compute. The repository-wide `AWS witness adapter contract (source only)` check also starts no AWS service.

## This is not strength evidence

This owner is a dormant ownership boundary. It has not retrained from game records, produced a candidate weight, played a match, or measured Elo or rank. It makes zero “stronger” or “stable high-dan” claims and issues no authority to change live weights.

Machine-readable evidence is in [`floodgate-v7-portable-copy-owner-2026-07-19.json`](./data/floodgate-v7-portable-copy-owner-2026-07-19.json).

The owner-introduction revision is
`ab9ac4d8363682776fc0e8518ec3f8b539f3566b`. Promise-settlement hardening and
the final freeze revision are
`dff9ee445686693e852afafb9ac0f593027bca27`
(`Harden owner promise settlement`). Its three files have these identities.

- `ml/floodgate-v7-portable-copy-owner.ts`: 32,309 bytes; SHA-256 `040798583c6cb56e6fe461d51179a2ff5c289effc7d2ca1966be88f1ea931b3c`; Git blob `391c08cf3551086a2a2e398cfcc03096dab82e23`
- `tests/unit/ml/floodgateV7PortableCopyOwner.test.ts`: 30,117 bytes; SHA-256 `9560dd70a2ba6b285f7fae8d32a9d39300b8841cd64c9bddbb94704d82034a75`; Git blob `9a0ab95d552b20938bd7876bec4ecf067de7b364`
- `tests/unit/ml/floodgateV7PortableCopyOwnerPoisoning.child.ts`: 6,921 bytes; SHA-256 `6610f685ad19fc6b527bd48c75090706fc194709868ead6f67b233ea3e539c6d`; Git blob `a008fee38008c12ebc7031fe2b7c3072e2783d62`

The focused Node v22.13.0 owner validation passes 25 functional plus 5 evidence
tests, 30 / 30. Five repeated functional runs pass 125 / 125. The related
regression passes clean-room copy 13, portable witness 19, foundation evidence
4, owner 25, and owner evidence 5: five files and 66 / 66 tests with
`maxWorkers=4` (Vitest duration 1.83 seconds; aggregate test duration 5.73
seconds). TypeScript has zero changed-file diagnostics against the repository
baseline of 21; ESLint, Prettier, and diff errors are also zero.
Final security review is P0 / P1 / P2 / P3 = 0 / 0 / 0 / 0 with zero
unresolved findings.

## Next safe step

The next composition must run the unchanged generic source semantic verifier between source preseal and filesystem seal and bring its authenticated SHA-256 and record identity into the owner session. C must then compare that same identity with the exact bytes read through held directory and file descriptors and build a bounded, exact three-gate session.

Real teacher preparation must not restart until that implementation, independent review, and CI all pass. Even after semantic verification, held-read binding, and session revocation are complete, the existing 100 → review → 500 → review → 24,000 safety gates remain mandatory.
