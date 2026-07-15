# Accepting a safe macOS home without weakening the key namespace — Floodgate v7 home-anchor hardening

> This article records a local implementation and audit at revision `635f94515a47d2d453133fe05bed9250f6bafffa`. PR #464, which established the offline connector-gate contract, is already merged. The next real Node v22.13.0 deployment-key provisioning attempt then failed safely in the namespace phase because the existing macOS home was mode `0755`, while the old provisioner incorrectly required the home itself to be exact `0700`. The attempt stopped before entropy, directory creation, or key publication; it reported `no-deployment-change-established` and `may_have_committed = false`. No deployment key, live evaluation function, or weight changed. This revision fixes that provisioner bug, separates the policy for the existing home anchor from the exact-`0700` policy for all four application-managed directories, and consistently hardens the complete namespace prefix across all five deployment-key paths. Focused 5 files / 121 tests, related 10 files / 339 tests, full 123 files / 2,298 tests, and all revision-bound local validation passed. PR, remote CI, and merge remain `PENDING`. Japanese version: [blog-shogi-floodgate-v7-macos-home-anchor-hardening.md](./blog-shogi-floodgate-v7-macos-home-anchor-hardening.md)

## 1. Current status

| Item                                         | Result                                                           | What it establishes                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Baseline connector work                      | PR #464 merged                                                   | The fixed offline 100 / 500 / 24,000 connector-gate composition is on the default branch                         |
| Actual provisioning attempt                  | Safe failure under Node v22.13.0                                 | Failure occurred in `namespace`, before entropy, `mkdir`, or any key commit                                      |
| Failure reconciliation                       | `no-deployment-change-established`; `may_have_committed = false` | No deployment change was established by the attempt                                                              |
| Key-instance inspection after that failure   | No candidate                                                     | There was no provisioned key instance to enroll                                                                  |
| Root cause                                   | Confirmed                                                        | Only the old provisioner directly rejected the canonical current-user `0755` macOS home as unsafe                |
| Implementation                               | `635f94515a47d2d453133fe05bed9250f6bafffa`                       | Fixed source, test, and local-validation revision                                                                |
| Post-fix real metadata-only probe            | `not-provisioned`; parent absent; key absent                     | The real home anchor is accepted, and the still-empty deployment namespace is reported without reading key bytes |
| Actual key reads / writes in the real probes | 0 / 0 bytes                                                      | Neither the failure investigation nor the metadata-only readiness probe touched key material                     |
| Focused local tests                          | 5 files, 121 / 121 PASS                                          | Includes namespace and terminal-race regressions                                                                 |
| Static / formatting checks                   | TypeScript and Prettier PASS                                     | The changed source and tests pass the recorded local checks                                                      |
| Independent code review                      | P0 / P1 / P2 = 0 / 0 / 0                                         | No remaining severity-ranked code finding in the final local review                                              |
| Related / full regression                    | 339 / 339 PASS; 2,298 / 2,298 PASS                               | Separate authoritative runs against the final revision                                                           |
| Production build                             | PASS                                                             | The production artifact compiled and all 193 static pages completed                                              |
| Repository-wide ESLint                       | PASS, 0 errors / 157 warnings                                    | The full lint command completed without an error                                                                 |
| Python regression / npm audit                | 58 / 58 PASS; 0 vulnerabilities                                  | The Python standard-library regression and dependency security audit passed locally                              |
| Current hardening PR / CI / merge            | `PENDING` / `PENDING` / `PENDING`                                | This implementation revision is not yet claimed as merged                                                        |
| Live evaluation / weight / playing strength  | Unchanged / unchanged / not remeasured                           | This was namespace hardening, not training or activation                                                         |

The important distinction is that the code defect made a legitimate machine configuration unusable, but it did not corrupt a key or weaken a live deployment. The fail-closed behavior worked: the first real attempt made no deployment change. The work here corrects the false rejection while retaining the security properties that matter below the home directory.

## 2. What the real attempt revealed

After PR #464 merged, the next operational step was to provision the Floodgate v7 deployment key with the repository-supported Node v22.13.0 runtime. The public failure was deliberately sanitized, but its reconciliation fields were sufficient to localize the boundary:

```text
error class       = FloodgateV7DeploymentKeyProvisionerError
phase             = namespace
durability        = no-deployment-change-established
may_have_committed = false
retry disposition = manual-reconciliation-required
```

The inspector subsequently found no key-instance candidate. Metadata checks confirmed that the deployment-key parent and final key had not been created. The failure happened before the provisioner requested random key bytes, before it created a managed directory, and before it attempted no-clobber key publication. Consequently, the attempt generated, read, and wrote zero actual key bytes.

The machine's canonical home directory was mode `0755`. That is a normal macOS configuration: other users may traverse or read the home according to those mode bits, but they cannot write it. The old provisioner applied the managed-private-directory rule—current owner and exact `0700`—to every component including this pre-existing operating-system-managed anchor. It therefore rejected the real home before reaching the private application namespace. The other four key-lifecycle paths did not directly reject this `0755` home under the same exact-mode rule; their follow-up changes close policy and prefix-validation gaps rather than explain the provisioning failure.

Changing the home to `0700` would have hidden the code defect and altered a user-level operating-system setting. The correct boundary is to validate the home as a safe anchor, then enforce exact private modes on every directory the application owns.

## 3. Two directory policies, one fail-closed chain

The revised policy is intentionally asymmetric.

### Existing home anchor

The home is accepted only when all of the following remain true:

- it is an absolute, canonical real directory, not a symlink or alias;
- it is owned by the current effective user ID;
- its owner has read, write, and execute permission;
- neither group nor other has a write bit;
- no setuid, setgid, or sticky special bit is present; and
- its identity and complete mode remain unchanged when the operation revalidates it.

The focused suite exercises accepted `0700`, `0750`, and `0755` homes. Those examples are not a three-value allowlist; they demonstrate the rule above. Group-readable or traversable homes can be safe anchors, but group-writable and other-writable homes fail closed. A safe-to-safe mode change also fails revalidation—for example, changing `0755` to `0700` while an operation is in flight is treated as a metadata race rather than silently accepted.

### Four application-managed directories

Every one of the four fixed descendants under that anchor still must be:

- a canonical real directory owned by the current effective user ID;
- exact mode `0700`, including no special bits; and
- the same device, inode, and metadata object observed by the operation.

The final key contract is unchanged: it remains an exact-`0600` regular file, owned by the current user, with one hard link and the fixed expected byte length. Accepting a safe `0755` home therefore does not make the key directory or the key world-readable. The home is only the anchor; the complete application-managed chain below it remains private.

## 4. Consistency across the whole key lifecycle

Only the old provisioner directly rejected the legitimate `0755` home. The readiness, authority, key-instance enrollment, and approved-key enrollment paths did not share that exact-`0700` home rejection; instead, they previously validated a less complete view of the namespace prefix. Fixing only the provisioner would therefore unblock creation but leave downstream paths capable of accepting namespace states that the provisioner rejects, including unsafe writable anchors or intermediate components. Revision `635f94515a47d2d453133fe05bed9250f6bafffa` gives all five areas the same explicit prefix policy and race checks:

| Area                       | Responsibility after the change                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment-key provisioner | Hold the home and full managed-directory chain, create or open only exact-`0700` managed directories, publish without overwrite, and revalidate before returning |
| Readiness probe            | Read metadata only, recheck the existing managed prefix, then match a present-key snapshot or observe the exact absent terminal as `ENOENT` again                |
| Deployment-key authority   | Snapshot and revalidate the full anchored chain while holding the final managed parent and key during authoritative byte access                                  |
| Key-instance enrollment    | Hold the home and full managed-directory chain while binding the candidate to the validated namespace and key identity                                           |
| Approved-key enrollment    | Hold the home and full managed-directory chain while validating the approved instance at the production claim boundary                                           |

Descriptor retention is deliberately specific to each operation. The provisioner, key-instance enrollment, and approved-key enrollment retain descriptors for the home and complete managed-directory chain while they operate. The authority snapshots the complete chain but retains descriptors only for the final managed parent and key during byte access. The metadata-only readiness path retains no directory-descriptor chain. It compares path-based metadata snapshots for the home and every existing managed component, then rechecks the terminal state before returning a non-unsafe advisory result. A present key must match its first snapshot at the second observation and still resolve canonically; an absent key or first missing managed component must produce `ENOENT` again at the same fixed path. Canonical checks apply to existing entries, while absence is an exact-path observation rather than a canonical object. These sampled checks detect the covered metadata races without claiming continuous or atomic identity, held identity, or authoritative key access.

No public receipt, error, or JSON schema changed. The implementation alters internal namespace validation and race resistance; callers do not receive a new field, a less-sanitized error, an absolute path, a descriptor, a fingerprint, or key material.

## 5. Additional findings from the audit

The home-mode fix prompted a broader adversarial review of the path walk. That review found and fixed two defense-in-depth issues before a real key was created.

First, fixed path construction previously relied on array-backed component handling that could encounter an inherited numeric setter on `Array.prototype`. A hostile setter could attempt to replace a fixed component or redirect an intermediate path. The revised code appends each fixed component directly with the captured platform separator. Regression tests install a redirecting numeric setter and verify that none of the protected path values reaches it, while unrelated array assignment still proves the trap is active.

Second, the provisioner used ordinary array insertion to track opened directory descriptors. The same kind of inherited numeric setter could interfere with placing an opened handle into the cleanup list. The provisioner now creates each numeric tracking slot as an own data property. This keeps every successfully opened descriptor visible to final revalidation and cleanup even when the ambient array prototype is poisoned.

These were audit findings, not evidence that either attack occurred on the machine. They matter because key provisioning is a rare, high-authority operation: a path redirect or an untracked descriptor is worth eliminating before the first actual key commit.

## 6. Regression coverage and intermediate evidence

The final focused total is 5 files / 121 tests. The five key-namespace suites include:

- canonical current-EUID homes at `0700`, `0750`, and `0755`;
- symlink homes and wrong or changing identities;
- group-writable, other-writable, owner-incomplete, and special-bit home modes;
- unsafe mode changes and safe-to-safe mode changes during final revalidation;
- all four managed directories remaining exact `0700` under a `0755` anchor;
- altered managed prefixes, symlink swaps, and late metadata races;
- replacement of a present key before final readiness revalidation;
- removal of a present key before final readiness revalidation;
- appearance of a previously absent key before absence revalidation;
- appearance of the first missing managed component before absence revalidation;
- the inherited numeric-array-setter path-redirection attempt;
- descriptor tracking and cleanup under prototype poisoning; and
- unchanged sanitized receipts with no path or key disclosure.

The final local status for implementation revision `635f94515a47d2d453133fe05bed9250f6bafffa` is:

| Check                             | Result                         |
| --------------------------------- | ------------------------------ |
| Five focused key-lifecycle suites | PASS, 121 / 121                |
| TypeScript                        | PASS                           |
| Prettier                          | PASS                           |
| Final independent code review     | PASS, P0 / P1 / P2 = 0 / 0 / 0 |
| Related regression suite          | PASS, 339 / 339                |
| Authoritative full suite          | PASS, 2,298 / 2,298            |
| Production build                  | PASS                           |
| Repository-wide ESLint            | PASS, 0 errors / 157 warnings  |
| Python standard-library tests     | PASS, 58 / 58                  |
| npm audit                         | PASS, 0 vulnerabilities        |
| Ready PR review and required CI   | `PENDING`                      |
| Regular merge                     | `PENDING`                      |

The post-fix real check was deliberately metadata-only. It returned `not-provisioned`, with the deployment parent absent and the key absent, while reading and writing zero key bytes. That result is useful because it shows the real `0755` home no longer collapses to `unsafe`; it is not a provisioning success and does not authorize creating or enrolling a key by itself.

## 7. Timeline

1. PR #464 merged the offline three-gate connector-contract composition.
2. The actual Node v22.13.0 key-provision command failed with a sanitized namespace error.
3. Reconciliation metadata established `may_have_committed = false`; a follow-up inspector found no candidate, and metadata confirmed no key namespace had been created.
4. The real home metadata exposed the old provisioner's exact-`0700` assumption: the canonical current-user home was safely non-writable by group and other, but mode `0755`.
5. The audit separated the home-anchor policy from the four managed-directory policies and traced every subsequent security reader.
6. During that trace, the numeric-array-setter path-redirection and descriptor-tracking issues were found and fixed.
7. At revision `635f94515a47d2d453133fe05bed9250f6bafffa`, focused 121 / 121, related 339 / 339, full 2,298 / 2,298, the production build, and static validation passed.
8. A real metadata-only probe reported the truthful current state—`not-provisioned`, parent absent, key absent—with zero key-byte reads or writes.
9. Ready PR review, remote CI, and regular merge remain to be observed and recorded.

## 8. Explicit nonclaims

- No deployment key was created, replaced, read, or activated by the real attempts recorded here.
- No approved control-plane record was created or self-approved.
- No real 100-parent connector gate ran.
- No teacher labeling, model training, optimizer step, candidate selection, match, or promotion ran.
- No production weight was overwritten, and the live evaluation function is unchanged.
- No Elo, rank, high-dan, or stability improvement is established by namespace hardening.
- Local validation success is not a claim that remote CI or merge passed.
- A `not-provisioned` metadata receipt is not a provisioning receipt and contains no key-instance candidate.
- Descriptor-free readiness establishes only two sampled path-based observations. It does not establish continuous or atomic absence or identity, held identity, or key-content integrity; authoritative reopen remains required.

## 9. Next safe steps

1. Publish revision `635f94515a47d2d453133fe05bed9250f6bafffa` in a ready-for-review PR, address actionable comments, observe required CI, and merge with a regular merge commit.
2. From the merged default branch, rerun the real provisioner once and capture only its public, pathless receipt. Reconcile any ambiguous durability result before retrying.
3. Run the key-instance inspector after successful provisioning, then keep human approval of the control-plane record separate from key creation.
4. Only after key and approved-record continuity is established should the real durable-prefix-100 pilot run. Training, promotion, and stable high-dan measurement remain later stages with their own evidence.

The current outcome is therefore narrow but necessary: **the first real operation exposed a macOS home-anchor bug without changing deployment state; revision `635f94515a47d2d453133fe05bed9250f6bafffa` fixes that bug and its lifecycle inconsistencies while keeping every application-managed directory exact `0700` and leaving the live model untouched.**
