# Binding production execution to exact application source — Floodgate v7

> PR #479 was integrated with regular merge commit `4c71e664dae67ccd4afdb369a666bcdb4d4bbb37`. An independent post-merge audit then found a P1 blocker: the verifier was fixed, but the **application source executing production commands was not**. This PR #480 candidate (PR number, implementation head, validation, CI, review, and merge are all PENDING) closes that gap with an exact-clean Git closure, a create-only registry V2, and an outer-gate public receipt V3. It has executed no production registry, gate, teacher, label, training, selection, formal A/B, external calibration, or live-activation operation. It has not changed the live weight or runOp1. Japanese version: [blog-shogi-floodgate-v7-production-application-source-provenance.md](./blog-shogi-floodgate-v7-production-application-source-provenance.md)

## 1. Result and current position

The next required step was not retraining from strong games. It was making the source that creates production data reproducible. Starting the 24,000-position teacher run without that property would leave the provenance of the teacher data, checkpoint, and candidate weight ambiguous. Even a stronger candidate could not safely be adopted from such evidence.

This candidate permits one fixed application worktree:

```text
~/.codex/worktrees/shogi-floodgate-v7-production-application
```

It captures that worktree's exact-clean 40-character Git revision once in the private registry. Every later mutation may proceed only when the current tracked source bytes and modes match the registry binding.

This remains a **candidate implementation**. Local validation, GitHub CI, review, and regular merge are PENDING. The fixed worktree has not been aligned to the eventual merge revision, and the registry has not been provisioned. The production decision is therefore explicitly **NO-GO**.

## 2. The P1 blocker found after PR #479

PR #479 serialized prefix-100, prefix-500, final-24000, and training-label finalization under one common OS lock and purpose-bound durable leases. That boundary checked the registry, deployment key, verifier, and lease, but the application tree loaded by Node still depended on the current working directory.

The fixed verifier revision could therefore be correct while a production gate was launched from a different, stale, or dirty application checkout. The receipt also carried no binding to that application revision, so it could not establish that the same implementation produced the production evidence. This was a P1 blocker before playing strength and had to be closed before create-only registry provisioning.

## 3. Capturing source once in registry record V2

The new private registry contract is `shogi-floodgate-v7-production-connector-registry-record-v2`. Its canonical record contains this source binding:

```json
{
  "layout": "fixed-current-euid-userinfo-home-production-application-v1",
  "revision": "<exact-clean 40 lowercase hex Git object id>"
}
```

The provisioner checks the fixed application worktree and captures the binding before current-key verification, entropy, or create-only installation. The installer uses a staged write, fsync, no-clobber hard link, directory fsync, reopen, and postflight revalidation. It never adopts, overwrites, or rotates an existing registry.

Legacy record V1 remains strictly parseable for inspection, but it cannot issue a current production capability or mutation authority. There is no automatic V1-to-V2 migration, overwrite, or adoption. Because no registry has been created yet, V2 provisioning remains a separate, explicit operational step after merge.

## 4. Exact order before any mutation

All four mutation purposes now share this order:

```text
acquire the OS-lifetime lock while holding the registry file descriptor
  -> read the application binding from canonical locked V2 bytes
  -> verify exact HEAD, tracked bytes, tracked modes, and clean status
     in the fixed application worktree
  -> revalidate the held/named registry bytes, SHA-256, device, and inode
  -> only then enter the control namespace, authenticated lease, and operation
```

A revision, byte, mode, clean-status, or registry-anchor mismatch fails closed in phase `application-source`. On this failure path, control-directory creation, active-lease publication, gate operation, checkpointing, and label finalization all remain zero, and `authenticated_lease_published` remains false.

The registry file descriptor and OS lock remain held while source is checked, and the same registry anchor is revalidated afterward. This rejects a straightforward race that substitutes a different registry between observation and mutation authority.

## 5. Public outer receipt V3, private persisted lease V2

The public receipt advances to `shogi-floodgate-v7-production-outer-gate-lease-v3` and adds three success conditions:

- the application-source binding was read from the locked registry;
- the exact-clean application closure was verified before persistent mutation; and
- the registry anchor was revalidated after source verification and before mutation.

The private persisted HMAC lease record remains V2 so the established crash-evidence and reconciliation semantics do not change unnecessarily. The public receipt version and private on-disk lease format are deliberately separate concepts.

Public outer, connector, and training-label receipts disclose no application revision, path, or digest. Those values remain inside private registry bytes and held-lock comparisons.

## 6. Rejecting a CLI launched from a stale checkout

The affected production CLIs require Node `v22.13.0`, zero operator arguments, `node -r tsx/cjs`, a current working directory equal to the fixed application root, the exact entrypoint path, and a matching `require.main.filename`. Launching a script with the same name from another or stale checkout fails before production modules are lazily loaded and before authority can be created.

The candidate also adds an argumentless, read-only source-readiness inspector. It observes only a point-in-time exact-clean closure of the fixed worktree. It neither creates, loads, nor modifies the registry and claims no gate authority, checkpoint, teacher label, training, weight, match, or playing strength. Its public output includes no revision, path, or digest.

## 7. Rechecking in prefix-100 preflight V3

A provisioning-time source success is not reusable as future execution authority. Fresh prefix-100 read-only preflight V3 claims private registry V2 under the common OS lock and matches its binding against the current exact-clean application closure before checking the verifier, runs namespace, deployment key, and approved/current bindings.

Preflight `GO` means only that read-only core preconditions were observed at that point in time; it does not authorize a gate invocation. The receipt is not reusable, and a source mismatch returns sanitized `NO-GO`. Preflight itself performs no namespace or file-content mutation.

## 8. What this closure does not guarantee

The candidate does not claim:

- isolation from every hostile process running under the same UID;
- byte closure over ignored or untracked content, especially `node_modules`;
- detection of a transient modification that is perfectly restored between observations;
- an atomic snapshot of the entire filesystem;
- invariance of every read-related metadata field, including access time;
- automatic migration, reconciliation, deletion, adoption, or overwrite of registry V1; or
- registry, gate, human-approval, or playing-strength authority from source readiness alone.

Every tracked Git entry is checked by full bytes and mode, but this is not an OS sandbox or same-UID adversary-isolation boundary. The remaining assumptions stay explicit for later production approval.

## 9. Validation is still PENDING

This evidence does not report results before they exist.

| Check                                               | State   | Final value |
| --------------------------------------------------- | ------- | ----------- |
| Focused source / registry / outer / preflight tests | PENDING | PENDING     |
| Related production regression tests                 | PENDING | PENDING     |
| Full Vitest                                         | PENDING | PENDING     |
| TypeScript / lint / Prettier                        | PENDING | PENDING     |
| Production build                                    | PENDING | PENDING     |
| ML stdlib / npm audit                               | PENDING | PENDING     |
| GitHub CI                                           | PENDING | PENDING     |
| Review / unresolved threads                         | PENDING | PENDING     |
| Regular merge                                       | PENDING | PENDING     |

The table will be updated only after an exact validation revision is known. A partial focused result will not be rewritten as a full-suite pass or production readiness.

## 10. Every production and playing-strength counter remains zero

For this change, production commands, registry provisions, kill drills, prefix-100 / 500 / final-24000 gates, teacher generation, label finalization, training, optimizer steps, candidate selection or promotion, formal A/B, external calibration, weight overwrite, and live activation all remain zero.

runOp1 remains both the current and rollback evaluator, and the live weight is unchanged. Application provenance is therefore not evidence that the engine became stronger or reached high-dan strength. It is safety infrastructure that makes later strength evidence trustworthy.

## 11. Safe next order

The order remains:

1. validate and review this application-source provenance candidate, then integrate it with a regular merge;
2. complete operator guards in the next PR: exact invocation for the approved-current-binding CLI and standalone verifier readiness, without claiming unimplemented reconciliation authority;
3. align the fixed application worktree to this PR's merge revision and the fixed verifier worktree to `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`;
4. provision create-only registry V2 exactly once;
5. run the reviewed disposable kill drill;
6. run a fresh standalone read-only preflight;
7. run prefix-100 exactly once, STOP, obtain independent evidence review and informed human approval;
8. run prefix-500, STOP, review, and obtain another informed human approval;
9. run sealed final-24000, inspect terminal evidence, and finalize training labels;
10. retrain, select candidates, run 192 color-swapped pairs / 384 formal A/B games, then 200 external calibration games; and
11. consider live activation only after every safety, quality, strength, and rollback-rehearsal gate passes.

Any stale, quarantined, or indeterminate state means STOP: no retry and no next gate. A broad prior permission does not substitute for the still-unimplemented reconciliation authority or for evidence-dependent approval after prefixes 100 and 500.

## 12. Current decision

The P1 cause was not the evaluator formula itself. It was an open production-application provenance boundary before teacher generation. This candidate closes that specific gap, but fixed-worktree alignment and registry provisioning remain **NO-GO** until validation and regular merge complete.

The [machine-readable evidence](./data/floodgate-v7-production-application-source-provenance-2026-07-16.json) keeps established facts, PENDING work, zero production counters, nonclaims, and stop points separate.
