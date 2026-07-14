# Separating Floodgate v7 deployment-key instance inspection from control-plane enrollment

> The [deployment-key provisioner](./blog-shogi-floodgate-v7-deployment-key-provisioner.en.md) intentionally returns no `key_instance_id`, while the [production checkpoint connector](./blog-shogi-floodgate-v7-production-checkpoint-connector.en.md) requires `expectedKeyInstanceId` before it opens the key authority. This note documents the implemented and validated narrow candidate inspector that derives the same public instance ID as the authority without turning observation into approval. Source, operator CLIs, focused / related / full tests, Python regression, TypeScript, production build, formatting, lint, audit, and independent review are complete. PR, CI, actual-home key-byte inspection, and control-plane pinning remain **pending / 0**. The measured 7 h 51 min full-bundle verifier remains a separate blocker. No real data, teacher, training, weight, live evaluation function, match, or playing-strength claim is created here. Japanese version: [blog-shogi-floodgate-v7-deployment-key-instance-enrollment.md](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.md)

## 1. Current status and the one gap this boundary closes

| Item                                     | Current status         | Meaning                                                       |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| Candidate-inspector contract             | Implemented            | Candidate-only boundary with no approval or persistence       |
| Inspector source / operator CLIs         | Completed              | Import-safe, argumentless, with 0 actual executions           |
| Focused / related tests                  | 9 / 9, 116 / 116 PASS  | Temporary-key cryptography and the actual-home metadata guard |
| TypeScript / Prettier / ESLint           | PASS                   | Local validation of the exact current diff                    |
| Full regression / production build       | PASS                   | 119 files / 2,156 tests and the production build              |
| Python regression / npm audit            | 58 / 58 PASS, 0        | Stdlib suite and dependency audit                             |
| Independent code / test review           | P0 = 0, P1 = 0, P2 = 0 | Two post-fix review seals completed                           |
| Pull request / CI                        | Pending                | No PR or CI result exists yet                                 |
| Actual fixed-home candidate inspection   | 0                      | This inspector has not read any production key byte           |
| Approved control-plane enrollment record | 0                      | No expected instance has been approved or pinned              |
| Production connector gates               | 0                      | 100 / 500 / 24,000 have not run                               |
| Live weight / evaluation-function change | 0                      | Existing production bytes remain unchanged                    |

The metadata-only readiness probe answers whether the fixed slot has a safe-looking file, but reads no key bytes and returns no instance ID. The create-only provisioner may install the secret, but deliberately does not become a cryptographic reader. The connector must not learn an instance during the same execution and silently adopt it as its expectation.

The missing boundary is therefore an explicit two-step process:

1. inspect the fixed key and emit a non-secret **enrollment candidate**;
2. separately review and persist that candidate as an approved trusted control-plane record.

Only the second step may supply `expectedKeyInstanceId` to the connector.

## 2. Candidate-inspector API and authority boundary

The production entry point is the zero-argument `inspectFloodgateV7DeploymentKeyInstance()`. It obtains the effective UID and home from the current process and `os.userInfo()` and has no path, key bytes, expected ID, output path, approval flag, or callback supplied by a caller.

The arity-1 `inspectFloodgateV7DeploymentKeyInstanceCoreForTests(dependencies)` exists only for temporary-home tests. Its result type is `FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt`.

Two dedicated package commands expose the operational order without making either action automatic:

| Command                                                    | Boundary                                     | Actual executions |
| ---------------------------------------------------------- | -------------------------------------------- | ----------------: |
| `npm run --silent shogi:floodgate-v7-key-provision`        | Write: one exclusive fixed-key provision try |                 0 |
| `npm run --silent shogi:floodgate-v7-key-instance-inspect` | Read-only: emit one candidate JSON to stdout |                 0 |

Both command files reject arguments. Provisioning is a write and requires its own explicit operator approval; it must never be invoked while implementing, documenting, testing, reviewing, or merging this candidate inspector. Inspection is read-only but reads the real fixed secret long enough to derive the ID, so it also requires a later separate approval. Unit tests call only the temporary-home core. Test, lint, build, PR creation / merge, CI, application deploy, and module import run neither package command.

The inspector may:

- open the one fixed current-EUID key deployment;
- read exactly 32 held bytes;
- derive the authority-compatible public instance ID;
- revalidate held and named filesystem identity;
- return a deeply frozen candidate receipt containing no secret.

It may not create, overwrite, rotate, delete, back up, or export the key; authorize a run; derive a checkpoint key; sign arbitrary data; write an enrollment record; approve its own result; call the connector; read a dataset; or start a runtime.

This is a candidate-inspection authority, not a provisioning authority, execution authority, or control plane.

## 3. Key-instance derivation must be exactly identical to the authority

The inspector does not invent a second fingerprint scheme. It must use the same constants and byte operations as the existing deployment-key authority:

```text
instance_key = HKDF-SHA256(
  root_key,
  salt = "shogi-floodgate-v7-deployment-key-instance-salt-v1\0",
  info = "shogi-floodgate-v7-deployment-key-instance-key-v1\0",
  length = 32
)

key_instance_id = HMAC-SHA256(
  key = instance_key,
  data = "shogi-floodgate-v7-deployment-key-instance-id-v1\0"
).hex_lowercase
```

The receipt's algorithm is `hkdf-sha256-domain-separated-hmac-sha256-v1`, and the result is exactly 64 lowercase hexadecimal characters. This is neither a raw-key hash nor key material. It is a stable public identifier that lets a later authoritative execution reject different or rotated key material without disclosing the 32-byte root. The ID alone does not prove that identical key bytes were never copied into another inode.

Parity must be tested with synthetic keys by comparing the candidate inspector's ID with `key_deployment.key_instance_id` from the existing authority. A hand-copied constant, different string encoding, omitted NUL terminator, different HKDF argument order, or raw SHA-256 is a failure.

## 4. One held read, final revalidation, and bounded secret lifetime

The production path follows the authority's held-descriptor shape rather than a pathname-only read:

1. Require POSIX effective-UID support, current EUID equal to `os.userInfo().uid`, and one canonical non-root home.
2. Construct only the fixed parent and `root-key.bin` path. Require canonical real paths with no symlink traversal.
3. Snapshot named parent / key metadata. Require current-EUID ownership, exact `0700` directory, exact `0600` regular file, `nlink = 1`, and exactly 32 bytes.
4. Open the parent with `O_DIRECTORY | O_NOFOLLOW` and the key with `O_NOFOLLOW`, then require held `fstat` identity to match the named snapshots.
5. Read exactly 32 bytes from offset zero and require EOF at byte 33. Short and oversized reads fail closed.
6. Derive only the domain-separated instance key and public ID.
7. Synchronously zero and verify the owned root-key, instance-key, and extra-read buffers before the next revalidation or descriptor-close await. The failure path applies the same cleanup rule.
8. Revalidate held and named parent / key identity, owner, modes, link count, and size. Any replacement or metadata change suppresses the receipt.
9. Close both held descriptors. A cleanup failure is not reported as a successful candidate.

`held_descriptors_revalidated: true` means only that this inspection observed one stable fixed deployment across its own read. It is not a future execution lease. The key authority must still reopen and repeat its authoritative checks when the connector eventually runs.

Zeroization covers the buffers explicitly owned by this module. It does not claim physical erasure from the JavaScript heap, kernel page cache, filesystem, SSD, backups, or hardware wear-leveling.

## 5. The test core must never inspect the actual home

Injecting a home into a test helper creates a dangerous shortcut: a test could accidentally point at the real fixed key while still returning a `test-only` receipt. The test boundary therefore needs a guard before any key open or read.

The test core must:

- require the injected UID to equal the current effective UID;
- obtain the production home independently from `os.userInfo()`;
- reject direct string equality with that home;
- resolve both homes and reject canonical-path equality;
- reject a same-device / same-inode alias;
- fail closed if it cannot establish that separation.

Cryptographic success / failure tests use a temporary current-EUID home and synthetic 32-byte secrets only. A separate negative guard test takes metadata-only snapshots of the actual home and a symlink alias, passes them to the test core, and confirms rejection before the key observer, open, or read. It reads no actual key bytes. Test hooks may observe an internal copy solely to prove revalidation and zeroization ordering, but those hooks do not exist on the zero-argument production wrapper. An actual-home key-byte inspection is a separately approved operational action, never a unit-test side effect.

## 6. Receipt shape does not mean approval

The `FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt` has these top-level fields:

```text
contract
status
claim_boundary
trust_boundary
execution_boundary
algorithm
key_deployment
test_boundary
nonclaims
```

`key_deployment` records only the fixed layout and key ID, owner UID, exact modes / size / link count, parent and key device / inode identities, public `key_instance_id`, its algorithm, and held-descriptor revalidation. It contains no absolute home path, root-key byte, derived-key byte, key hash, authorization MAC, checkpoint key, or generic signature.

The status is exactly `fixed-key-instance-candidate-observed-and-held-revalidated-not-approved-or-persisted`. Its nonclaims keep key creation / writing, key-material disclosure, root-key-hash disclosure, key-path disclosure, authorization MAC, run / stage authorization, checkpoint-key capability, control-plane approval, record persistence, connector execution, checkpointing, dataset reads, runtime, labels, training, weights, live activation, and playing strength false. Expected-instance pinning, provisioning, rotation, and matches are likewise outside the claim boundary; they are not silently implied by an omitted field.

An approved enrollment is a later control-plane artifact. That workflow must review the candidate, preserve its exact canonical receipt bytes and digest, bind the approved public ID to the fixed `key_id` and deployment identity, and make the approval auditable. It must not store key bytes. This prospective inspector neither defines nor writes that trusted store, so even a valid actual-home candidate still leaves `control_plane_approval = false`.

The connector then receives the approved public ID as its pre-pinned expectation. Its authoritative prepare derives the ID again and requires exact equality. Different or rotated key material therefore fails instead of becoming the new expectation automatically; same-byte filesystem replacement remains a separate deployment-identity and operational audit concern.

## 7. Failure and retry rules

| Observation                                      | Candidate result | Operational action                                                         |
| ------------------------------------------------ | ---------------- | -------------------------------------------------------------------------- |
| Slot absent or metadata unsafe                   | No receipt       | Return to readiness / provisioning reconciliation                          |
| Symlink, alias, wrong owner / mode / size / link | No receipt       | Stop; do not repair inside the inspector                                   |
| Short or oversized held read                     | No receipt       | Stop; investigate fixed deployment                                         |
| Identity changes during read                     | No receipt       | Stop; treat as a race or replacement                                       |
| Zeroization, revalidation, or close fails        | No receipt       | Stop; do not persist a candidate                                           |
| Valid candidate, no control-plane review         | Unapproved       | Connector remains blocked                                                  |
| Approved record differs from later authority ID  | Connector reject | Investigate rotation / wrong record; never update the expectation in place |

Re-running inspection may produce the same public ID, but repetition is not approval. Rotation and recovery remain separate explicitly authorized workflows.

## 8. The 7 h 51 min full-bundle verifier remains a blocker

The accepted label-free role-bundle verification ran from `2026-07-12T04:20:01Z` to `2026-07-12T12:11:22Z`: `28,281,000 ms`, or **7 h 51 min 21 s**. That measurement belongs to complete input-integrity verification, not key inspection or teacher search.

The current production connector still enters through the complete production full-bundle verifier before its pathless 24,000-row callback. Enrollment removes only the missing trusted expected-instance input. It neither shortens nor bypasses that verifier, and a candidate receipt cannot be used as a cache token for dataset verification.

Before a real 100-parent gate, operations must explicitly close this wall-time issue: either budget and measure the complete verifier at the approved execution boundary, or separately design an authenticated reusable training projection whose freshness and filesystem closure are at least as strong. Silently skipping the verifier is not an optimization. The earlier roughly 3.5-minute teacher estimate for 100 parents must not be presented as end-to-end wall time while this 7 h 51 min boundary remains unresolved.

## 9. Validation status and nonclaims

The nine focused tests passed. They cover deterministic derivation and existing-authority parity; wrong HMAC domains, raw SHA, and authorization-MAC separation; the exact receipt, all nonclaims, deep freezing, and absence of byte views; direct and symlink-alias actual-home rejection; filesystem-root rejection; wrong metadata; an initial symlink; held-versus-named replacement; short and oversized size; zeroization before the next await; success and observer-failure zeroization; sanitized errors; and the CLI import / argument boundary.

The related target of five files / 116 tests, full Vitest at 119 files / 2,156 tests, the Python stdlib suite at 58 / 58, TypeScript, production build, formatting, and npm audit with zero vulnerabilities all passed. Full lint also completed with zero errors and only 157 pre-existing warnings unrelated to this diff. Descriptor-close failure injection and exhaustive zeroization checks for every individual failure phase are not covered individually, so that evidence remains pending. Source review and the implementation's cleanup ordering are not substitutes for those test cases. Two independent post-fix reviews checked secret lifetime, CLI stream failures, and the distinction between candidate observation and control-plane approval, then sealed P0 / P1 / P2 at zero. PR and CI remain pending.

At the current local implementation point:

- metadata-only fixed-home readiness: **`not-provisioned`** (`parent` and `key` are both `absent`; key-bytes-read is false);
- temporary-home inspector-core executions: **test-only**;
- production wrapper / actual-home CLI executions: **0**;
- actual provisioning-command executions: **0**;
- actual production-key inspections: **0**;
- approved / persisted enrollment records and expected-instance pinning: **0**;
- real role-bundle connector callbacks: **0**;
- production 100 / 500 / 24,000 gates: **0**;
- teacher labels, optimizer steps, candidate weights, formal games, and ratings: **0**;
- production weight overwrite and live evaluation activation: **unchanged**.

## 10. Remaining execution order after approval

1. Preserve the completed local full validation and independent review, then complete the ready PR and CI.
2. Under separate operator approval, run `npm run --silent shogi:floodgate-v7-key-provision` if the key is still absent and preserve its non-secret provision receipt. This write command currently has **0 actual executions**.
3. In a fresh separately approved process, run `npm run --silent shogi:floodgate-v7-key-instance-inspect` once and preserve the one-line non-secret candidate JSON emitted to stdout. This read-only actual-home command also has **0 actual executions**.
4. Review and persist an approved enrollment / trusted control-plane record; do not treat step 3 as self-approval.
5. Reconfirm metadata-only readiness and the exact approved expected ID, while separately resolving the 7 h 51 min verifier blocker.
6. Only then request separate approval for the 100-parent connector gate.

None of these steps automatically runs a teacher, trains a model, changes the live weight, or establishes stable high-dan strength.
Merging a PR or deploying the application does not execute steps 2 or 3.
