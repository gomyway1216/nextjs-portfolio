# Provisioning the fixed deployment key without overwrite — Floodgate v7 provisioner design

> The preceding [metadata-only readiness probe](./blog-shogi-floodgate-v7-production-checkpoint-connector.en.md) confirmed without reading key bytes that the fixed key slot on the real machine is `not-provisioned`. The authority to observe absence and the authority to create a 32-byte secret are separate. This article records the implementation and verification results for a dedicated provisioner that forbids manual shell redirection and performs one exclusive create in the private deployment bound to the current EUID. Source, focused / related / full tests, Python regression, static checks, build, code / test review, and initial branch CI for ready [PR #458](https://github.com/gomyway1216/nextjs-portfolio/pull/458) are complete. Final docs-only-head CI, merge, actual provisioning, and production connector execution remain **pending / 0**; the production weight and live evaluation function are unchanged. Japanese version: [blog-shogi-floodgate-v7-deployment-key-provisioner.md](./blog-shogi-floodgate-v7-deployment-key-provisioner.md)

> **Historical correction (2026-07-14):** This article preserves the provisioner's original exact-`0700`-for-every-component design and its then-current validation status. A later real attempt showed that applying that rule to the pre-existing macOS home was a bug: a canonical current-user `0755` home with no group or other write bit is a safe anchor. Only the old provisioner directly rejected that home; the other four key-lifecycle paths received consistency and full-prefix defense hardening in the follow-up. See [Accepting a safe macOS home without weakening the key namespace](./blog-shogi-floodgate-v7-macos-home-anchor-hardening.en.md) for the corrected contract and evidence.

---

## 1. Current position and the single responsibility of this PR

The only responsibility of this prospective PR is to create exactly 32 random bytes in the following fixed slot **only when it does not exist**, verify durability and identity, and return a provision receipt containing no secret.

```text
<os.userInfo().homedir>/Library/Application Support/nextjs-portfolio/
  shogi-floodgate-v7-deployment-key-v1/root-key.bin
```

Readiness, provisioning, and execution do not become one function.

| boundary      | what it may do                                                                       | what it may not do                            |                         executions now |
| ------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------: |
| readiness     | metadata-only inspection of the fixed path                                           | read / create / write the key                 |     latest real-machine probe complete |
| provisioner   | exclusive create in a missing slot, fsync, receipt                                   | overwrite / rotate / auto-start the connector | production 0; temp test core exercised |
| key authority | authoritatively reopen from a held descriptor and bind the key to run / stage / gate | provision                                     |                           0 production |
| connector     | execute the 100 / 500 / 24,000 gates in order                                        | auto-create a key or activate a weight        |                                      0 |

Completing source, tests, and review does not by itself authorize creating a key at the actual fixed path. Actual provisioning requires separate, explicit operator approval and is never triggered by PR merge or deploy.

## 2. Why manual shell redirection is forbidden

The procedure will not pipe output from `head`, `openssl`, `dd`, or a similar tool through `>` into `root-key.bin`. Shell redirection opens the destination before starting the generator, normally truncates an existing file, and follows a symlink. Even with `umask 077`, it cannot establish “the final component did not exist,” current-EUID ownership, regular-file / nlink-1 identity, an exact 32-byte full write, held-parent identity, file / directory fsync, and failure-path zeroization as one transaction.

In particular, readiness cannot reconstruct these differences afterward.

| manual-operation gap                      | possible result                                                      | fixed provisioner control                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `>` truncates an existing file            | silently rotates or destroys a valid key                             | `O_CREAT` + `O_EXCL`; always reject an existing entry                     |
| final symlink is followed                 | writes the secret outside the fixed slot                             | `O_NOFOLLOW` plus pre / held / post identity checks                       |
| short write / full disk                   | poisoned slot containing 0–31 bytes                                  | full-write loop, exact size, no success receipt on failure                |
| power loss immediately after process exit | bytes or directory entry are not durable                             | file `fsync`, then parent-directory `fsync`                               |
| command / clipboard / log exposure        | secret remains in argv, terminal, or a temporary file                | generate directly from the OS CSPRNG into a module-private buffer         |
| ad-hoc retry                              | overwrites existing 32 bytes or treats unknown durability as success | retries also use exclusive create; existing state requires reconciliation |

Manual shell creation is therefore not merely discouraged; it is **forbidden** by this production contract. Even emergency handling must use the same audited provisioner or a separately reviewed reconciler.

## 3. Production API and the test boundary

The production entry point is the arity-0 `provisionFloodgateV7DeploymentKey()`. It accepts no caller-selected path, key bytes, mode, UID, random generator, or filesystem adapter and derives the slot only from the current EUID and `os.userInfo().homedir`.

Only the arity-1 test core `provisionFloodgateV7DeploymentKeyCoreForTests(dependencies)` may inject a temporary canonical home, the same effective UID, a deterministic 32-byte random source, and fault / observation hooks. Dependencies and hooks are restricted to exact own data properties, non-Proxy values, and synchronous `undefined` returns; thenable / asynchronous hooks are rejected. Its receipt carries the `test-only-injected-current-euid-home-key-provisioning` boundary, fixes `production_home_origin` / `production_effective_uid_origin` to false, and sets `entropy_may_be_test_injected` / `test_hooks_may_observe_key_copy` true. The production wrapper exposes neither hooks nor dependencies.

The source / test contract fixes contract `shogi-floodgate-v7-deployment-key-provisioner-v1`, success status `new-csprng-key-no-clobber-published-durable-and-revalidated`, and algorithm `node-crypto-random-bytes-32-staged-fsync-hard-link-no-clobber-directory-fsync-v1`. Source implementation and temporary-home test evidence are complete; production execution evidence remains zero.

The public success receipt contains this metadata.

| metadata                               | meaning                                                                                                  | deliberately excluded                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| contract / status / execution boundary | exact kind of provision transaction                                                                      | arbitrary signer capability            |
| fixed layout                           | same slot contract as the authority                                                                      | absolute / relative key path           |
| owner UID, parent `0700`, key `0600`   | verified metadata contract                                                                               | username or environment-selected home  |
| parent / key dev and ino               | identity verified by this invocation                                                                     | open descriptor                        |
| bytes `32`, nlink `1`                  | exact key-file contract                                                                                  | root key or key hash                   |
| publication                            | `staged-file-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1` | rename / replacement / rotation        |
| durability                             | `key-published-and-staging-removal-durable`                                                              | a guarantee against every future crash |
| nonclaims                              | dataset / checkpoint / training remain zero                                                              | playing-strength claim                 |

## 4. Fixing the path and parent first

Argument count and production identity are fixed before the first filesystem effect. Absence of `process.geteuid()`, an unsafe-integer UID, disagreement with `os.userInfo().uid`, an empty or non-absolute home, or `realpath(home) !== home` all cause rejection. `HOME`, the current working directory, and CLI flags are not authorities.

Parent creation is distinct from key creation. Every path component from home through the fixed deployment parent is processed one level at a time. An existing component is held-open with `O_NOFOLLOW` and verified as an exact `0700` current-EUID-owned real directory. Only a missing component is mkdir'd as `0700`, followed by synchronization of the new child directory and its parent directory. Existing components are never “repaired” with chmod. A symlink, non-directory, wrong owner, wrong mode, or noncanonical realpath is unsafe.

Read-only intermediate data from the real machine says that the first three components already exist as exact `0700` directories and only the final `shogi-floodgate-v7-deployment-key-v1` parent is missing. No mkdir has run yet.

The parent is pinned with a held descriptor opened using `O_RDONLY | O_DIRECTORY | O_NOFOLLOW`. Pathname `lstat`, held `fstat`, and canonical `realpath` capture dev / ino / type / UID / mode, and the same identity is revalidated after key creation and durability work. This is not a sandbox beyond Node's path-based filesystem and same-EUID processes, so the trust boundary explicitly includes the current EUID, current JS realm, and local-filesystem semantics.

## 5. Exact no-overwrite algorithm

The implementation follows this order. “Success” means that every step completed and a receipt was minted.

1. Capture exact argument count, production EUID / userInfo home, and fixed components before effects.
2. Inspect the existing prefix of the path chain read-only, canonically, and without following links. If the final parent exists, inspect the final / fixed-staging namespace first; if either name exists, generate no entropy and return a no-touch error.
3. Fill a module-private 32-byte view directly with `crypto.randomFillSync`; validate test injection for exact ordinary byte-view type / length before copying it internally. Production accepts no caller bytes or seed, and invalid test entropy creates no missing directory.
4. Held-open every directory component, mkdir / child-sync / parent-sync only a missing component, obtain the final parent's held descriptor and pre identity, and recheck final / staging absence.
5. Open the fixed private staging name in the same parent with `O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW` and requested mode `0600`.
6. Write all 32 bytes to the held staging descriptor with an offset-tracking partial-write loop, then read back exactly from the held descriptor and require equality with the original copy.
7. Verify by `fstat` a current-EUID regular file with mode `0600`, nlink 1, and size 32, then complete file `fsync` and held / pathname revalidation.
8. Publish the same inode under the final name with POSIX `link(staging, root-key.bin)`. If a race creates the final first, lose atomically with `EEXIST` without changing the competitor. Never use rename or direct-final create.
9. Require staging / final to identify the same held dev / ino with nlink 2, then `fsync` the held parent directory.
10. Unlink only the staging name, require the held inode to become nlink 1, and `fsync` the held parent a second time. Never unlink the final key.
11. Revalidate final held / pathname identity, bytes, type / UID / mode / nlink / size, and parent identity.
12. Synchronously zero-fill secret buffers, immediately verify every byte is zero, then attempt every descriptor close sequentially. Return no success receipt if any cleanup fails.
13. Return only a deep-frozen, null-prototype receipt with absolute / relative paths, secrets, hashes, key-instance IDs, and capabilities removed.

This algorithm never exposes a partial final key. It never opens an existing key for writing, never replaces it through rename, and never rotates it automatically. It exposes no `force`, `overwrite`, or `repair` option. Direct-final `O_EXCL` create was rejected because a crash can leave a 0–31-byte partial final.

## 6. Identity, mode, and durability conditions

Each receipt flag becomes true only if all corresponding checks pass, rather than merely recording that an API was called.

| target             | required invariant                                       | check points                                           |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------ |
| home               | canonical absolute userInfo home                         | before effects / final                                 |
| parent             | current EUID, directory, exact `0700`, matching realpath | before / after create, held pre / post, final pathname |
| key                | current EUID, regular, exact `0600`, nlink 1, size 32    | held after write / after fsync, final pathname         |
| identity           | parent / key dev and ino match held and pathname views   | pre / post / final                                     |
| contents           | 32 OS-CSPRNG bytes matching staging write / readback     | before file fsync                                      |
| file durability    | held staging / final inode-descriptor `fsync` succeeded  | before final link                                      |
| name durability    | held-parent `fsync` after final hard link succeeded      | before staging unlink                                  |
| cleanup durability | held-parent `fsync` after staging unlink succeeded       | before receipt minting                                 |
| cleanup            | file / parent close settled successfully                 | before receipt minting                                 |

An `fsync` success is the durability boundary reported by the local filesystem; it does not claim immunity to hardware failure, filesystem bugs, backup loss, or lack of cross-machine replication. The key authority still reopens the file authoritatively for every execution and repeats held pre / post metadata and byte checks. A provision receipt is not a future execution token.

## 7. Entropy, public metadata, and zeroization

In production, `crypto.randomFillSync` generates key material directly into a fresh module-private 32-byte view. A test random view remains caller-owned and unchanged; only the internal copy is zeroized. The random-byte and write / readback internal copies are zeroized on both success and failure. A secret is never converted to a string, JSON, Error message, log, metric, test snapshot, or command-line value.

The provision receipt returns neither `key_instance_id` nor key hash. This is an intentional boundary that keeps a create-only provisioner from becoming a key-reading or cryptographic-enrollment authority. The receipt records only publication method, UID, modes, byte count, nlink, file fsync, post-final-link directory fsync, staging cleanup, post-cleanup directory fsync, and held revalidation.

Consequently, this provision receipt alone cannot supply the connector's required `expectedKeyInstanceId`. After actual provisioning, a separate audited enrollment step must obtain the ID in the same domain as the existing key authority and pin it in a trusted control-plane record. The production connector does not start until that step is implemented and approved.

Zeroization runs synchronously through captured intrinsics immediately after final byte revalidation and before the next await, followed immediately by an all-zero verification. A test-only observer can verify zeroization of an internal copy but does not exist in the production wrapper. This does not claim complete physical erasure from the JavaScript heap, kernel page cache, or SSD wear leveling.

## 8. Crash, failure, and retry matrix

Exclusive create prevents overwrite but deliberately does not auto-repair a slot left midway through a crash. Ambiguous state is never treated as “write another 32 bytes.”

| terminal point                             | state that may be visible on disk               | readiness                    | retry of the same provisioner                                              |
| ------------------------------------------ | ----------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| before parent create                       | parent / key absent                             | `not-provisioned`            | safe retry after removing the cause                                        |
| after parent create, before key create     | safe `0700` parent, key absent                  | `not-provisioned`            | validate the same parent and safely retry                                  |
| after random generation, `O_EXCL` fails    | existing entry remains unchanged                | depends on existing metadata | never overwrite; reconcile                                                 |
| after staging create, before final link    | final absent, 0–32-byte staging file            | key is `absent`              | safe retry only after identity-checked owned-stage unlink + directory sync |
| after hard-link start, before link fsync   | final / staging presence and durability unknown | `unsafe` or `ready`          | always reconcile names / inode                                             |
| after link fsync, before staging unlink    | final / staging share inode, nlink 2            | `unsafe`                     | treat as committed and finish staging cleanup                              |
| after staging unlink, before cleanup fsync | final-only same inode, nlink 1                  | may look `ready` by metadata | treat as committed and finish sync / revalidation                          |
| after cleanup fsync, before receipt        | durable final without receipt                   | `ready`                      | do not reprovision; use receipt-recovery procedure                         |
| after receipt                              | durable key plus non-secret metadata            | `ready`                      | no rerun; rotation / enrollment are separate workflows                     |

Same-process failure and retry reconcile against the held staging inode. If final and staging are the same held inode with nlink 2, the transaction is committed and finishes staging unlink plus directory sync. If final alone is the same held inode with nlink 1, it finishes sync / final revalidation. If final is absent and staging alone is the same held inode with nlink 1, it is not committed and staging is cleaned up. Even when a competing final is a different inode, only this invocation's held staging may be identity-checked, unlinked, and followed by a parent sync. Identity drift or an unclassifiable state is left untouched for manual reconciliation; a published or competing final is never automatically deleted and replaced by another key.

The public error fixes its own fields to `name`, `message`, a sanitized fixed `stack`, `phase`, `durability`, `may_have_committed`, and `retry_disposition`. It contains no `cause`, raw filesystem error / code, absolute path, or key bytes. Test-only `observeFailureForTests` can inspect the raw failure, but production exposes no such hook.

## 9. Readiness before / after and the test-production boundary

The real-machine read-only probe on 2026-07-13 reported the following.

| probe               | status            | parent      | key         |                bytes read | create / write |
| ------------------- | ----------------- | ----------- | ----------- | ------------------------: | -------------: |
| before provisioning | `not-provisioned` | `absent`    | `absent`    |                         0 |              0 |
| after provisioning  | **pending**       | **pending** | **pending** | provisioner facts pending |   actual run 0 |

Provisioner implementation tests use only a temporary home and synthetic entropy. Even when after-readiness is `ready` there, the receipt has a test-only boundary and is not evidence about the actual userInfo home, production entropy, or production key instance. After actual provisioning, a separate process / fresh invocation must confirm metadata-only `ready`, and this still never replaces the key authority's authoritative reopen. The provision receipt itself has no instance ID.

Source-boundary tests include that tests cannot invoke the production provisioner, that the test core cannot reach the fixed real home, and that the production wrapper accepts no injected dependency. No unit test, PR CI job, or deploy hook may trigger actual key creation.

## 10. Findings, intermediate data, and incomplete evidence

| finding / evidence                               | what is known now                                                    | what is not yet established              |
| ------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------- |
| real-machine readiness is `not-provisioned`      | parent / key absent and read / write count 0                         | provisioner success                      |
| `O_EXCL` also changes retry semantics            | prevents overwrite but does not auto-repair ambiguous existing state | completed crash recovery                 |
| file fsync alone is insufficient                 | parent fsync is required after final link and staging cleanup        | zero hardware failures                   |
| staged hard link hides a partial final           | a pre-publication short write remains confined to staging            | crash-orphan reconciliation              |
| a 32-byte exact file can still lose its receipt  | metadata-ready and transaction evidence are distinct                 | trusted expected-key-instance enrollment |
| manual redirection cannot construct the contract | dedicated code, tests, and sealed review are complete                | production execution                     |
| live weight activations 0 and games 0            | the current live evaluation function is unchanged                    | playing-strength gain                    |

| delivery check                                        | status                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| provisioner source implementation                     | **completed**                                                                        |
| focused provisioner unit tests                        | **27 / 27 PASS**                                                                     |
| related authority / readiness / provisioner Vitest    | **49 / 49 PASS; 3 files**                                                            |
| full Vitest                                           | **2,146 / 2,146 PASS; 118 files; 162.76s; 12 workers**                               |
| Python ML regression                                  | **58 / 58 PASS**                                                                     |
| TypeScript / ESLint / Prettier / diff-check / build   | **PASS**                                                                             |
| sealed code / test review                             | **P0 = 0; P1 = 0; P2 = 0**                                                           |
| ready-for-review PR / review comments                 | **#458 OPEN / ready; Gemini and Copilot actionable 0; unresolved threads 0**         |
| branch CI on head `89ef381`                           | **PASS: Test/build 8m07s; E2E 3m53s; Darwin 49s; audit 18s; Vercel / Preview green** |
| final docs-only-head CI / merge                       | **pending / pending**                                                                |
| actual fixed-path provisioning                        | **0 / pending explicit approval**                                                    |
| production connector execution                        | **0**                                                                                |
| training / candidate weight / live activation / games | **0 / 0 / 0 / 0**                                                                    |

The build completed with Next compilation in 20.1s, TypeScript in 18.2s, and static generation of 193 pages with 13 workers. Its only output warnings were the existing Firebase / cookies warnings; there was no new build error. The focused 27 tests cover success, unsafe namespace states, races, stale staging, exclusion of the real production home, zeroization, and 11 failpoints. Pending final-head CI, merge, and actual provisioning entries must not be read as PASS.

GitHub initial CI run `29299536980` succeeded on head `89ef381`: Test/build in 8m07s, E2E in 3m53s, and Darwin in 49s. Security Audit run `29299536976` also succeeded in 18s, and Vercel / Preview Comments were green. Gemini and Copilot returned summary reviews with zero inline / actionable comments and zero review threads. The docs-only evidence-reconciliation head that adds this paragraph must pass the same required checks before merge.

## 11. Provisioning does not skip 100 → 500 → 24,000

A successful provision is a metadata prerequisite that enables teacher-data production; it does not make the evaluation function stronger. The order remains fixed.

1. Complete required CI on the docs-only final head of ready PR #458, then integrate it with a regular merge commit.
2. With separate explicit approval, execute the production wrapper once and preserve its non-secret provision receipt.
3. Confirm `ready` through fresh readiness, then use a separate audited enrollment to pin `key_instance_id` in a trusted record before supplying the expected instance to the connector.
4. Without opening holdout data, execute the 100-parent durable prefix and audit throughput, candidate count, timeout, score / mate distribution, resume behavior, residual processes, and durability.
5. Proceed to cumulative 500 only after human approval of the 100 gate, then update the measured ETA and failure rate.
6. Proceed only after approval of the 500 gate, resuming the same work stream through the 24,000 authenticated seal.
7. Only then run three-seed QAT, fresh selection / final holdout, regression, production parity, and formal color-swapped A/B as separate gates.
8. Handle candidate weight and live activation in a separate PR / rollout only if every preregistered promotion rule passes.

The 100 / 500 / 24,000 milestones are not playing-strength evidence. A stable high-dan claim requires the final formal A/B and independent post-rollout game evidence. Key provisioning, PR merge, and application deploy do not overwrite the production weight; the live environment remains unchanged today.
