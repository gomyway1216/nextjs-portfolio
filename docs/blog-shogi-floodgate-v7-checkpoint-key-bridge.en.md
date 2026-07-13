# Bridging the deployment key authority to the V3 checkpoint without exporting the raw root

> The preceding [deployment key authority](./blog-shogi-floodgate-v7-deployment-key-authority.en.md) authenticates strictly captured run / stage metadata with the fixed deployment root key but passes no key material to a checkpoint. The [V3 milestone checkpoint](./blog-shogi-floodgate-v7-checkpoint-v3-milestones.en.md) closes the 100 / 500 / 24,000 order, resume, and durability rules, but its existing entry point uses a test-only raw-root dependency. This change binds a 32-byte V3 HKDF-derived key inside the authority to an opaque single-use facade and transfers it briefly from an exact claim to a checkpoint sink. It is not evidence of raw deployment-root export, generic signing, real data, teacher labels, training, a weight, live evaluation-function activation, games, or playing strength. Japanese version: [blog-shogi-floodgate-v7-checkpoint-key-bridge.md](./blog-shogi-floodgate-v7-checkpoint-key-bridge.md)

---

## 1. Current boundary

| Item            | Implementation direction                                                                               | What this boundary establishes                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Deployment root | Reads the fixed 32-byte root below the current EUID's `os.userInfo().homedir` through held descriptors | Authenticates key-deployment metadata and the exact request in one authority operation |
| V3 key material | Derives 32 bytes inside the authority with `runId` as salt and the fixed V3 HKDF info                  | Prepares only a V3-specific key without passing the raw root to the checkpoint         |
| Opaque facade   | Uses a frozen null-prototype exact metadata record as a module-private `WeakMap` key                   | A facade clone, receipt copy, or same-shaped object cannot obtain the secret           |
| Registry        | Separates production and injected-test `WeakMap`s                                                      | Does not promote test capability into production authority                             |
| Lifecycle       | Owns one derived key through exact `prepare` / `claim` / `discard` operations                          | Explicitly discards an unclaimed key and prevents two claims from one facade           |
| Checkpoint sink | Synchronously copies the claimed key and immediately zeroizes the claim result                         | Ends caller-owned byte lifetime before the first `await` or producer start             |
| Executor        | Uses the V3 derived key directly on the authority path and does not derive it again                    | Avoids double derivation or HKDF-info mismatch between authority and checkpoint        |
| Compatibility   | Retains the existing raw-root `CoreForTests`                                                           | Preserves existing synthetic and fault-injection input contracts                       |
| Validation      | Local validation complete; PR / CI pending                                                             | Pins measured Node 22, full Vitest, Python, TypeScript, and build results              |

This bridge alone proves neither an active stage lease, authenticated training rows, nor production coordinator origin. A trusted connector must claim each production capability and close all of them over the same run / stage / gate binding.

## 2. Why an opaque V3 derived key instead of the raw root

Passing the raw deployment root into the checkpoint module expands the key-material surface so it could be reused outside the V3 domain. A generic signing callback similarly creates room to process caller-selected payloads with authority-held material. Both expand the metadata-only authority boundary farther than required.

The prepare path derives exactly one V3-specific key from the held root:

```text
HKDF-SHA256(
  ikm  = fixed deployment root,
  salt = 32-byte runId,
  info = "shogi-floodgate-v7-teacher-checkpoint-key-v3\0",
  len  = 32
)
```

The root, authorization-MAC derived key, key-instance key, and oversize-check byte follow the existing authority rule and are zeroized before final revalidation. Only the V3 derived key moves into the module-private registry. The public facade contains no bytes, hash, signer, or filesystem path. Serializing the facade therefore exposes no secret, and key bytes remain inside the authority until a valid module claim.

## 3. Exact request and opaque facade

The V3 prepare / claim request has exactly five keys.

| Request field               | Binding                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `gate`                      | Exactly one of `durable-prefix-100`, `durable-prefix-500`, or `sealed-final-24000`    |
| `keyId`                     | Fixed `floodgate-v7-teacher-checkpoint-root-v1`                                       |
| `runBinding`                | Pinned plan, producer control, and stable / teacher runtime receipt digests           |
| `runId`                     | 32 bytes of lowercase hexadecimal                                                     |
| `stageAuthorizationReceipt` | Exact stage boundary, allowed entries, parent / stage / lease identity, and basenames |

Request capture evaluates neither Proxies nor accessors. It copies ordinary exact own data properties into fresh frozen values. Prepare stores the canonical captured request in hidden registry state; claim repeats the same capture and compares canonical equality.

The public facade has exactly these five fields:

| Facade field     | Meaning                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| `contract`       | V3 deployment checkpoint key authorization contract                               |
| `status`         | An opaque single-use V3 derived key is prepared and no checkpoint is claimed      |
| `claim_boundary` | A run / stage / gate-bound key capability, not root export or checkpoint evidence |
| `gate`           | The exact one gate authorized by this capability                                  |
| `authorization`  | The existing deployment teacher-run authorization receipt                         |

Facade metadata contains no key bytes, and a clone containing the same field values carries no authority. Only the exact object identity registered in the module-private registry can be claimed or discarded.

## 4. Prepare lifecycle

Prepare fixes this order:

1. Check exact arity before request capture: one argument for production and two for the test core.
2. Strictly capture the exact gate-bearing request and the dependencies accepted only by the test core.
3. In production, require the current EUID to match `os.userInfo().uid` / home.
4. Validate canonical paths, ownership, mode, link count, and size, then hold parent / key descriptors.
5. Read exactly 32 root bytes and produce the authorization MAC, key-instance ID, and V3 derived key from the same held root.
6. Zeroize every owned key copy except the V3 derived key before the next `await`.
7. Finally revalidate held / pathname metadata and close descriptors.
8. Register the exact facade and V3 derived key in the matching registry only after revalidation and cleanup both succeed.

On any intermediate failure, prepare returns no facade and zeroizes any prepared V3 derived key. Prepare success means only that a key capability for this exact binding is ready. It does not mean that a checkpoint file, parent entry, milestone, or seal exists.

## 5. Claim / discard and single-use rules

Claim uses separate APIs and registries for production and test. Its critical order is:

1. Check exact arity before facade / request capture. An arity error does not consume the prepared capability.
2. Reject a non-object, Proxy, clone, or unknown facade.
3. After finding the exact facade in the matching registry, delete the prepared entry before request capture.
4. Strictly capture the claim request and compare it with the canonical prepare binding.
5. Only on equality, copy into a fresh owned 32-byte `Uint8Array`.
6. Zeroize the registry's stored derived key on success, binding failure, and copy failure alike.

An exact facade claimed with a wrong binding is therefore **consumed**. A caller cannot fix a gate, run, key ID, runtime digest, or stage-identity error and retry the same secret-bearing facade. A wrong-registry lookup, such as submitting a production facade to the test claim, rejects without exposing the key and does not promote the matching boundary.

`discard` accepts only an exact known facade. It zeroizes the stored key while still unclaimed; the same exact facade is a harmless no-op after claim or an earlier discard. A fake or clone is not a known identity and is rejected. The connector must discard on every training-verification, stage, coordinator, cancellation, or other failure path that occurs before the checkpoint sink is reached.

## 6. Checkpoint sink and executor key lifetime

The checkpoint sink is the narrow boundary between authority claim and checkpoint capture.

1. Synchronously obtain an owned V3 derived `Uint8Array` from the matching production / test claim API.
2. Pass the stage lease, authenticated full 24,000-row input, run binding, two-key producer controller, and gate options into the same synchronous capture.
3. Synchronously copy the derived key into a sink-owned `Buffer`.
4. Immediately zeroize the claim result in `finally`, regardless of capture success or failure.
5. Return a checkpoint Promise and begin I/O / producer work only after successful capture.
6. Zeroize the sink-owned copy during executor cleanup.

The captured key kind on the authority path is `v3-derived`. The executor uses these bytes directly for the HMAC chain, milestones, and seal; it does not run HKDF again. A second HKDF would place the checkpoint on a different key domain from the authority's authorization and make resume MACs incompatible.

Claim-result zeroization must occur before the first `await`. During a long checkpoint, only the one copy owned by the checkpoint invocation remains; the public facade, connector, and authority registry retain no key bytes.

## 7. Compatibility with the existing raw-root `CoreForTests`

The existing `checkpointFloodgateV7TeacherParentsV3CoreForTests(...)` retains its contract accepting a test lease, test authenticated rows, and raw `dependencies.rootKey`. That path synchronously copies the raw root and derives the V3 key once inside the executor with the same V3 HKDF info and run ID.

| Path                     | Input key                                                       | HKDF location                                 | Registry origin                        |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| Existing raw-root core   | Exact 32-byte root supplied by the test caller                  | Once inside the checkpoint executor           | Test stage / rows registry             |
| Opaque test bridge       | V3 derived key held by authority test prepare                   | Once inside authority, zero times in executor | Test key / stage / rows registry       |
| Opaque production bridge | V3 derived key held by authority from the fixed deployment root | Once inside authority, zero times in executor | Production key / stage / rows registry |

This split retains existing failpoint, short-read / write, torn-tail, resume, and corruption tests on the raw-root core while closing only the production path over opaque key authority. Success of the test core must not be interpreted as production origin or production-key evidence.

## 8. Failure matrix and validation targets

| Case                                            | Expected result                         | Key / capability outcome                                            |
| ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Prepare arity mismatch                          | Reject before request capture / key I/O | No capability                                                       |
| Invalid request / Proxy / accessor              | Pre-I/O reject with no trap execution   | No capability                                                       |
| Key path / mode / owner / size / identity drift | Fail closed                             | Zeroize root / derived copies and return no facade                  |
| Exact-facade clone / fake                       | Reject claim / discard                  | Never obtain a valid registry entry through structural comparison   |
| Wrong production / test registry                | Boundary reject                         | Expose no key and never promote test into production                |
| Claim arity mismatch                            | Pre-capture reject                      | Preserve prepared entry                                             |
| Exact facade + wrong binding                    | Reject                                  | Consume entry and zeroize stored key                                |
| Exact facade + valid binding                    | Return one owned 32-byte derived key    | Zeroize stored key before return                                    |
| Second claim                                    | Reject                                  | Never reissue key material                                          |
| Discard before claim                            | Succeed                                 | Zeroize stored key                                                  |
| Repeated exact discard                          | Harmless no-op                          | No key remains                                                      |
| Sink capture failure                            | Start no checkpoint                     | Zeroize claimed / partial internal copies and close the lease       |
| Executor / cleanup failure                      | Return no success receipt               | Zeroize invocation-owned key and preserve primary / cleanup failure |
| Raw-root test core                              | Preserve existing behavior              | Derive V3 key inside checkpoint and zeroize root / derived bytes    |

Focused tests cover exact keys / descriptors, zero Proxy traps, arity-before-capture, production / test registry separation, clones, double claims, wrong-binding consumption, idempotent exact discard, stored / claimed / captured key zeroization, no re-HKDF on the derived path, and existing raw-root receipt compatibility. The measured results are pinned below.

## 9. Local validation results and remaining CI

The bridge source commit is `2dbcdae55b22907daedb95f65db8bfe517ffac6d`; the bridge test commit is `758f235095e3cecc2a4c35992c6b7d5984e8a530`. The final local-validation revision, including high-load test isolation fixes, is `df740ac0f790e0f8c095d15ac7831f288430ecff`, using Node `v22.13.0`.

| Validation layer                       | Status         | Measured result                                                               |
| -------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| Deployment key authority focused tests | `PASS`         | 1 file / 16 tests in `0.273 s`                                                |
| V3 checkpoint focused tests            | `PASS`         | Boundary 1 / 1; exact-24k 1 / 1 (`145.97 s`, independent rerun `143.70 s`)    |
| Key bridge cross-boundary tests        | `PASS`         | 6 / 6 new tests covering prepare / claim / discard / sink / no-re-HKDF        |
| Related Vitest files                   | `PASS`         | Authority + checkpoint: 2 files / 64 tests inside the full run                |
| Full Vitest                            | `PASS`         | 115 / 115 files, 2,056 / 2,056 tests, 12 workers, `153.60 s`                  |
| Python ML regression                   | `PASS`         | `npm run test:ml:stdlib`: 58 / 58; unittest body `0.123 s`                    |
| TypeScript                             | `PASS`         | `npx tsc --noEmit`                                                            |
| Scoped ESLint / Prettier / diff-check  | `PASS`         | Changed source / tests / JA+EN articles, exit 0                               |
| Next production build                  | `PASS`         | `npm run build`, 13 workers, `25.97 s`                                        |
| Independent security audit             | `PASS`         | Final unresolved P0 / P1 / P2 = `0 / 0 / 0`                                   |
| PR / CI                                | `pending`      | Add ready-PR URL, required checks, and merge commit after they exist          |
| Production fixed-key smoke             | `not executed` | Real production execution is outside this PR; no secret value was read/logged |

The full-power run also retains its intermediate findings. The first two attempts reached 2,055 / 2,056 tests before an existing coordinator test kept the global `Promise.prototype` poisoned until `setImmediate` even after the operation had settled, catching parallel-runner communication (`166.08 s` and `154.77 s`). The same 35-test file passed 35 / 35 alone, so the test now restores the intrinsic immediately in the operation-settlement callback. On attempt three, a separate real-child fixture exceeded its 20,000ms startup limit by about 0.3 seconds under saturated CPU and ended at 2,055 / 2,056 (`152.70 s`). Its isolated measurement was `0.261 s`; the production timeout was left unchanged while only the test fixture limit increased to 60,000ms. The fourth and final attempt is the 2,056 / 2,056 result above.

The build passed while reproducing the existing edge-runtime static-generation notice, build-phase Firebase Admin rejection, and dynamic-route message caused by `cookies`. They are neither new bridge warnings nor production-data access. PR / CI remains `pending` because it did not exist when this article commit was prepared.

## 10. Explicit nonclaims and live state

Execution and state changes at this code / documentation boundary are:

- Production 100 / 500 / 24,000 checkpoint gates: **0 executions**
- Real Floodgate dataset reads: **0 games / 0 parents / 0 bytes**
- Real stable / teacher searches: **0 parents**
- Teacher labels / teacher JSONL: **0**
- Training / optimizer steps / model checkpoints: **0**
- Holdout / final-selection access: **0**
- Candidate-weight generation: **0 bytes**
- Production-weight overwrite: **0 bytes**
- Live evaluation-function / weight activation: **unchanged**
- Matches / Elo / rating / rank / playing-strength evidence: **0**
- Formal A/B: **0 / 192 color-swapped pairs, 0 / 384 games**

The bridge therefore changes no evaluation function and makes no claim that the engine became stronger, avoided regression, or reached stable high-dan strength. It closes only the code boundary that transfers a V3 derived key once for an exact run / stage / gate into a checkpoint sink without exporting the fixed deployment root.

## 11. Next production connector

The next trusted connector closes the existing [single-use coordinator handoff](./blog-shogi-floodgate-v7-checkpoint-handoff.en.md) and this key bridge under one ownership boundary.

1. Claim the exact coordinator facade once and obtain its `runBinding` and `{ produce, abortAndDrain }`.
2. Authorize an active private-stage lease through the production boundary.
3. Prepare an opaque V3 key facade for the exact gate / run / stage / binding.
4. Invoke the checkpoint sink inside the synchronous callback of the authenticated full 24,000-row training consumer.
5. Discard the prepared facade on every failure path that never reaches the sink.
6. Return a combined success receipt only after checkpoint, training postflight, and coordinator cleanup all succeed.
7. With manual approval between them, advance 100, 500, and 24,000 as separate invocations over the same run / stage / input / key instance.

Even the 100 and 500 gates receive all 24,000 rows; they create neither separate slices nor holdout access. These are teacher-data durability gates, not playing-strength gates. Labels, training, weight selection, production activation, and formal A/B remain separate explicitly authorized validation stages.
