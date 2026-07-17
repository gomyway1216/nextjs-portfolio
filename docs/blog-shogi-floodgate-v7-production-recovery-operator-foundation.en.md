# Returning the production recovery operator to a non-operational contract — Floodgate v7

> The former head of [PR #486](https://github.com/gomyway1216/nextjs-portfolio/pull/486), `6466c6f6f02c11ac8d2085304ca11d2c5c5b5a61`, passed every remote check, but an independent post-green audit found a circular bootstrap: repository code under verification executed before its checks. Implementation commit `33a1ebee795b16bc38e8b98fb99ad2b31a2544a7` therefore removes the production package command, repository JXA, `tsx/cjs` preload, source authorizer, capability issuer, and CLI. Only an import-free `UNAVAILABLE / STOP` contract remains. It has neither an entrypoint nor authority to read production state. Japanese version: [blog-shogi-floodgate-v7-production-recovery-operator-foundation.md](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.md)

## 1. Result

This PR is not a recovery operator. It is a **non-operational design contract** that fixes the external trust requirements for a future operator and records that no operator is currently available.

| Decision subject                             | Current established value                  |
| -------------------------------------------- | ------------------------------------------ |
| foundation delivery                          | PR #486, OPEN / ready for review           |
| non-operational redesign                     | `33a1ebee795b16bc38e8b98fb99ad2b31a2544a7` |
| package recovery command                     | absent                                     |
| repository JXA / native launcher             | absent                                     |
| production `-r tsx/cjs` preload              | absent                                     |
| production authorizer / issuer / capability  | absent                                     |
| production CLI / entrypoint                  | absent                                     |
| fixed contract decision                      | `UNAVAILABLE / STOP`                       |
| production-state inspections                 | 0                                          |
| registry / lease / stage / work / key access | 0 / 0 / 0 / 0 / 0                          |
| persistent mutations / live changes          | 0 / 0                                      |

This change has not read the stale active lease or three-parent partial checkpoint recorded in the [first prefix-100 stop article](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.en.md). It has not deleted, quarantined, resumed, or retried them.

## 2. Why green CI was not enough

The former tests checked launch arguments, nonce, process lineage, and tracked source after startup. The trust decision nevertheless came after these components had already run:

1. `package.json` passed a repository JXA file directly to `osascript`, so its bytes were interpreted before the helper could inspect itself.
2. The JXA launched Node with `-r tsx/cjs`, so Git-ignored `node_modules/tsx` ran before the entrypoint and attestation modules.
3. Source capture accepted any clean 40-hex HEAD and did not require equality with an externally approved commit and tree.

The old article and JSON also claimed closure over source ownership and mode plus the absolute Git, common, and object directories even though the implementation did not establish that closure.

More tests inside the same bootstrap cannot remove this circularity. The redesign deletes the operational path and authority instead. Green CI at the old head remains useful regression history, but it is not merge authority for the new design.

## 3. The remaining pure STOP contract

The only remaining source is [`ml/floodgate-v7-production-recovery-operator-foundation.ts`](../ml/floodgate-v7-production-recovery-operator-foundation.ts). It has no imports and no filesystem, process, Git, network, or production-module reference. No package script reaches it.

| Field                                                   | Fixed value                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `contract`                                              | `shogi-floodgate-v7-production-recovery-operator-non-operational-foundation-v1` |
| `status` / `decision`                                   | `UNAVAILABLE` / `STOP`                                                          |
| `future_purpose`                                        | `inspect-stale-prefix-100`                                                      |
| `operational_entrypoint_available`                      | `false`                                                                         |
| `production_issuer_available`                           | `false`                                                                         |
| `repository_self_authorization_available`               | `false`                                                                         |
| `external_trust_root_installed`                         | `false`                                                                         |
| `approved_revision_enrolled` / `approved_tree_enrolled` | `false` / `false`                                                               |
| `source_authorized`                                     | `false`                                                                         |
| state access / mutation / live / disclosure             | all `false`                                                                     |

This is not a receipt-emitting CLI or a source-authentication API. Tests or explanatory code may directly import and read the same frozen marker, but no function can turn it into production authority.

## 4. External trust root required in a later PR

Before a read-only inspector exists, a separate PR must implement and review at least:

- a native or single-bundle launcher installed outside the repository;
- no JXA self-attestation and no untracked loader execution;
- authenticated, create-only enrollment of an approved commit and tree digest;
- exact equality between HEAD and that approved revision;
- owner, mode, link count, and canonical identity closure for the launcher, runtime, bundle, required source, and every ancestor;
- Git control closure including `--absolute-git-dir`, `--git-common-dir`, the object directory, and alternates; and
- negative tests for a clean but unapproved commit, an ignored-loader canary, external common/object stores, and group-writable or foreign-owner source.

Repository code must never mint a production capability except from the opaque one-shot attestation issued by that external root. This PR neither installs nor simulates that root.

## 5. Progress from the same twelve-candidate diagnostic

[PR #487](https://github.com/gomyway1216/nextjs-portfolio/pull/487) separately records the read-only diagnostic of the same twelve candidates on PR #485's exact final head.

| Subject                                 | Observation                                                      |
| --------------------------------------- | ---------------------------------------------------------------- |
| final head                              | `6a804a7954a9685361944aeb2be32494638fae2e`                       |
| run-start bounds                        | 2026-07-17 08:10:33Z–08:27:23.026Z                               |
| regular merge                           | 2026-07-17 08:27:59Z                                             |
| run-finish bounds                       | 2026-07-17 08:38:57.974Z–08:55:48Z                               |
| chronology                              | began before merge, continued across merge, recorded after merge |
| post-merge deployment start established | no                                                               |
| outcome                                 | 7 fulfilled / 5 rejected                                         |
| first pool failure safe kind            | `search-timeout`                                                 |
| timeout                                 | 600,000 ms                                                       |
| production gate / mutation              | 0 / 0                                                            |

The five rejections received the first genuine `search-timeout` through pool-wide poison broadcast. This does not establish five independent timeouts or the first triggering input. It advances failure classification, not the timeout fix, optimal worker count, partial-checkpoint resolution, or playing strength.

## 6. Validation and open gates

For the non-operational redesign itself, the focused tests passed 5 / 5, as did TypeScript, changed-file ESLint, and the Git whitespace check. The new final head still requires the full suite, GitHub CI, and fresh independent review; old-head results cannot substitute.

| Validation                               | Current state |
| ---------------------------------------- | ------------- |
| non-operational contract focused test    | PASS, 5 / 5   |
| TypeScript                               | PASS          |
| changed-file ESLint                      | PASS          |
| Git diff whitespace                      | PASS          |
| full Vitest on redesign head             | PENDING       |
| redesigned final-head GitHub CI          | PENDING       |
| redesigned final-head independent review | PENDING       |
| regular merge                            | PENDING       |

## 7. Work not performed

| Operation                                           |         Count |
| --------------------------------------------------- | ------------: |
| recovery operator / production inspector invocation |         0 / 0 |
| retry / cleanup / quarantine / resume               | 0 / 0 / 0 / 0 |
| 4 / 6 / 8 / 12-worker comparison                    |             0 |
| teacher generation / label finalization             |         0 / 0 |
| retraining / optimizer step                         |         0 / 0 |
| candidate selection / promotion                     |         0 / 0 |
| formal A/B / external calibration                   |         0 / 0 |
| production-weight overwrite / live activation       |         0 / 0 |

One exact-final-head twelve-candidate read-only diagnostic completed, but it began before the merge. It is not counted as post-merge deployment execution or a production incident-state operator invocation.

## 8. Safe next order

1. Complete the full suite, final-head CI, and fresh independent review for redesigned PR #486, then regular-merge it.
2. Do not deploy or execute PR #486 as an operator; treat it only as a non-operational contract.
3. Compare 4, 6, 8, and 12 workers under the same privacy boundary and measure tail latency, timeout, and throughput.
4. Select a runtime fix that preserves playing quality and treat the changed binding as a new run.
5. Implement the external trust root, approved commit/tree enrollment, and no-preload bundle in a separate PR.
6. Only after that trust root passes review, CI, and regular merge, implement a zero-argument read-only inspector in another PR.
7. After the inspector is reviewed and merged, perform exactly one fresh inspection; any mismatch, authentication failure, or indeterminate result means STOP.
8. Only matching fresh evidence may open review of human-confirmed quarantine or a separately approved fresh restart.
9. Retrain, select, run formal A/B, and calibrate externally only after complete teacher data; consider live activation only after playing-strength and rollback evidence.

## 9. Current decision

The unsafe bootstrap and issuer were removed instead of merging the green old design. PR #486 cannot operate production, and neither an external trust root nor an approved revision exists yet. The production decision therefore remains **STOP**, with live weights unchanged. The [machine-readable evidence](./data/floodgate-v7-production-recovery-operator-foundation-2026-07-17.json) separates removed authority, the corrected PR #487 chronology, zero production access, and open gates.
