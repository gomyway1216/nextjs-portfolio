# Bridging the deployment key authority to the V3 checkpoint without exporting the raw root

> The preceding [deployment key authority](./blog-shogi-floodgate-v7-deployment-key-authority.en.md) authenticates strictly captured run / stage metadata with the fixed deployment root key but passes no key material to a checkpoint. The [V3 milestone checkpoint](./blog-shogi-floodgate-v7-checkpoint-v3-milestones.en.md) closes the 100 / 500 / 24,000 order, resume, and durability rules, but its existing entry point uses a test-only raw-root dependency. This change binds a 32-byte V3 HKDF-derived key inside the authority to an opaque single-use facade and transfers it briefly from an exact claim to a checkpoint sink. It is not evidence of raw deployment-root export, generic signing, real data, teacher labels, training, a weight, live evaluation-function activation, games, or playing strength. Japanese version: [blog-shogi-floodgate-v7-checkpoint-key-bridge.md](./blog-shogi-floodgate-v7-checkpoint-key-bridge.md)

---

## 1. Current boundary

| Item            | Implementation direction                                                                                | What this boundary establishes                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Deployment root | Reads the fixed 32-byte root below the current EUID's `os.userInfo().homedir` through held descriptors  | Authenticates key-deployment metadata and the exact request in one authority operation         |
| V3 key material | Derives 32 bytes inside the authority with `runId` as salt and the fixed V3 HKDF info                   | Prepares only a V3-specific key without passing the raw root to the checkpoint                 |
| Opaque facade   | Uses a frozen null-prototype exact metadata record as a module-private `WeakMap` key                    | A facade clone, receipt copy, or same-shaped object cannot obtain the secret                   |
| Registry        | Separates production and injected-test `WeakMap`s                                                       | Does not promote test capability into production authority                                     |
| Lifecycle       | Owns one derived key through exact `prepare` / `claim` / `discard` operations                           | Explicitly discards an unclaimed key and prevents two claims from one facade                   |
| Checkpoint sink | Synchronously copies the claimed key and immediately zeroizes the claim result                          | Ends caller-owned byte lifetime before the first `await` or producer start                     |
| Executor        | Uses the V3 derived key directly on the authority path and does not derive it again                     | Avoids double derivation or HKDF-info mismatch between authority and checkpoint                |
| Compatibility   | Retains the existing raw-root `CoreForTests`                                                            | Preserves existing synthetic and fault-injection input contracts                               |
| Validation      | Final executable code revalidated locally; historical PR-head CI green; new-head CI pending before push | Pins measured Node 22, Vitest, Python, TypeScript, and build results by revision / environment |

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

The root, authorization-MAC derived key, key-instance key, and oversize-check byte follow the existing authority rule and are zeroized before final revalidation. Only the V3 derived key moves into the module-private registry. The public facade contains no key bytes, root- or V3-derived-key hash, generic signer, absolute filesystem path, or caller-selected path. Its nested authorization receipt does include the fixed deployment `relative_path` metadata. Serializing the facade therefore exposes neither a secret nor a host-specific absolute path, and key bytes remain inside the authority until a valid module claim.

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
8. Run authorization-material-wrapper and facade object allocation / freezing, canonical-binding construction, and registry insertion inside the derived-key ownership guard.
9. Transfer V3 derived-key ownership to the exact facade only after revalidation, cleanup, facade construction, and registry insertion all succeed.

If the material-wrapper object literal / `Object.freeze`, facade `frozenRecord`, or registry transfer fails, prepare returns no facade and the ownership guard zeroizes the prepared V3 derived key. If zeroization itself fails on the invalid-length branch, that failure is retained as the cause of a `cleanup`-phase error. Prepare success means only that a key capability for this exact binding is ready. It does not mean that a checkpoint file, parent entry, milestone, or seal exists.

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

The checkpoint sink is the narrow boundary that closes ownership across the stage, authenticated rows, authority claim, and checkpoint capture.

1. Synchronously claim the lease with the matching production / test stage API.
2. Claim the authenticated full 24,000-row input with the matching training API, then synchronously capture the lease, rows, run binding, two-key producer controller, and gate options.
3. Build the exact key request from the captured binding and claim an owned V3 derived `Uint8Array` with the matching production / test authority API.
4. Synchronously copy the derived key into a sink-owned `Buffer`, zeroizing that Buffer on a partial-copy failure. Immediately zeroize the claim result in `finally` whether the copy succeeds or fails.
5. If the stage claim itself fails, discard the prepared key facade but do not close a lease the sink never claimed; it remains caller-owned. After a successful stage claim, a rows, capture, or key failure discards / zeroizes the key and closes the claimed lease.
6. Return a checkpoint Promise and begin I/O / producer work only after successful capture; executor cleanup zeroizes the sink-owned copy and closes the claimed lease.

The captured key kind on the authority path is `v3-derived`. The executor uses these bytes directly for the HMAC chain, milestones, and seal; it does not run HKDF again. A second HKDF would place the checkpoint on a different key domain from the authority's authorization and make resume MACs incompatible.

Claim-result zeroization must occur before the first `await`. During a long checkpoint, only the one copy owned by the checkpoint invocation remains; the public facade, connector, and authority registry retain no key bytes. The lease transfers into the sink only after a successful stage claim; the caller retains cleanup responsibility for earlier failures.

## 7. Compatibility with the existing raw-root `CoreForTests`

The existing `checkpointFloodgateV7TeacherParentsV3CoreForTests(...)` retains its contract accepting a test lease, test authenticated rows, and raw `dependencies.rootKey`. That path synchronously copies the raw root and derives the V3 key once inside the executor with the same V3 HKDF info and run ID.

| Path                     | Input key                                                       | HKDF location                                 | Registry origin                        |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| Existing raw-root core   | Exact 32-byte root supplied by the test caller                  | Once inside the checkpoint executor           | Test stage / rows registry             |
| Opaque test bridge       | V3 derived key held by authority test prepare                   | Once inside authority, zero times in executor | Test key / stage / rows registry       |
| Opaque production bridge | V3 derived key held by authority from the fixed deployment root | Once inside authority, zero times in executor | Production key / stage / rows registry |

This split retains existing failpoint, short-read / write, torn-tail, resume, and corruption tests on the raw-root core while closing only the production path over opaque key authority. Success of the test core must not be interpreted as production origin or production-key evidence.

## 8. Failure matrix and validation targets

| Case                                                  | Expected result                         | Key / capability outcome                                                          |
| ----------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| Prepare arity mismatch                                | Reject before request capture / key I/O | No capability                                                                     |
| Invalid request / Proxy / accessor                    | Pre-I/O reject with no trap execution   | No capability                                                                     |
| Key path / mode / owner / size / identity drift       | Fail closed                             | Zeroize root / derived copies and return no facade                                |
| Material-wrapper / facade allocation / freeze failure | Fail closed before transfer             | Return no facade and zeroize the owned V3 derived key inside the guard            |
| Invalid derived-key length + zeroize failure          | Cleanup failure                         | Retain the zeroize failure as the `cleanup`-phase cause and return no facade      |
| Exact-facade clone / fake                             | Reject claim / discard                  | Never obtain a valid registry entry through structural comparison                 |
| Wrong production / test registry                      | Boundary reject                         | Expose no key and never promote test into production                              |
| Claim arity mismatch                                  | Pre-capture reject                      | Preserve prepared entry                                                           |
| Exact facade + wrong binding                          | Reject                                  | Consume entry and zeroize stored key                                              |
| Authority claim-copy failure                          | Reject and consume entry                | Zeroize both the stored key and partial claim output                              |
| Exact facade + valid binding                          | Return one owned 32-byte derived key    | Zeroize stored key before return                                                  |
| Second claim                                          | Reject                                  | Never reissue key material                                                        |
| Discard before claim                                  | Succeed                                 | Zeroize stored key                                                                |
| Repeated exact discard                                | Harmless no-op                          | No key remains                                                                    |
| Stage-claim failure                                   | Start no checkpoint                     | Discard prepared key; do not close the unclaimed, caller-owned lease              |
| Post-stage rows / capture failure                     | Start no checkpoint                     | Discard prepared key and close the claimed lease                                  |
| Checkpoint owned-buffer copy failure                  | Start no checkpoint                     | Zeroize claim result and partial internal copy, then close the claimed lease      |
| Executor / cleanup failure                            | Return no success receipt               | Zeroize invocation-owned key, preserve primary / cleanup failure, and close lease |
| Raw-root test core                                    | Preserve existing behavior              | Derive V3 key inside checkpoint and zeroize root / derived bytes                  |

Focused tests cover exact keys / descriptors, zero Proxy traps, arity-before-capture, production / test registry separation, clones, double claims, wrong-binding consumption, idempotent exact discard, stored / claimed / captured key zeroization, no re-HKDF on the derived path, and existing raw-root receipt compatibility. No test-only injection seam was added to induce direct material / facade allocation OOM or captured native-set failure. A seam that intercepts secret-bearing allocation / copy or replaces a captured intrinsic would re-expand the boundary this change closes. The closest validation for those paths is source-level ownership audit plus focused / full tests; this article does not claim that OOM or native-set failure was actually injected.

## 9. Local / CI validation and review remediation by revision

The pre-review bridge source commit is `2dbcdae55b22907daedb95f65db8bfe517ffac6d`; the bridge test commit is `758f235095e3cecc2a4c35992c6b7d5984e8a530`; and the pre-review test-isolation revision is `df740ac0f790e0f8c095d15ac7831f288430ecff`. The pre-review article / historical Linux CI head is `af227e5ae004a86f307199564212d7ebf7491039`, the first Gemini-finding fix is `fab4138f3c1cdf5fec3dbaf9ad3edac6951cc82e`, and the final executable code revision after review remediation is `2c1e48f1766fb3a75cfb429617813072957ca38e`. Final local validation used Node `v22.13.0`.

| Validation layer                  | Revision / environment                       | Status                 | Measured result                                                           |
| --------------------------------- | -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Deployment key authority focused  | `2c1e48f` / local macOS                      | `PASS`                 | 1 file, 16 / 16 tests in `0.291 s`                                        |
| V3 checkpoint boundary focused    | `2c1e48f` / local macOS                      | `PASS`                 | Boundary 1 / 1                                                            |
| V3 checkpoint exact-24k focused   | `2c1e48f` / local macOS                      | `PASS`                 | Exact-24k 1 / 1; test `132.80 s`                                          |
| Full Vitest                       | `2c1e48f` / local macOS                      | `PASS`                 | 115 / 115 files, 2,056 passed, `maxWorkers=12`, `155.07 s`                |
| Python ML regression              | `2c1e48f` / local macOS                      | `PASS`                 | `npm run test:ml:stdlib`: 58 / 58; unittest body `0.123 s`                |
| TypeScript                        | `2c1e48f` / local macOS                      | `PASS`                 | `npx tsc --noEmit`                                                        |
| Scoped lint / format / diff-check | Final code + JA / EN articles / local        | `PASS`                 | Changed source / tests / articles, exit 0                                 |
| Next production build             | `2c1e48f` / local macOS                      | `PASS`                 | `npm run build`, 13 workers, `25.51 s`                                    |
| Historical full Vitest            | `af227e5` / Linux CI                         | `PASS`                 | 115 files, 2,042 passed + 14 skipped = 2,056 discovered, `259.72 s`       |
| Historical required checks        | `af227e5` / PR #455                          | `green`                | Every check on that head succeeded                                        |
| Source security re-audit          | `2c1e48f` / read-only                        | Code P0 / P1 = `0 / 0` | No direct OOM / native-set injection; source audit + focused / full tests |
| Gemini / Copilot review threads   | After local remediation, before push / reply | `pending`              | Fixes exist locally, but the threads are not recorded as resolved         |
| Post-review new-head CI           | `2c1e48f`, before push                       | `pending`              | Rerun required checks after push                                          |
| Production fixed-key smoke        | Live production                              | `not executed`         | No secret value read/logged and zero production-gate executions           |

The findings and remediation history remain visible rather than being collapsed into the final result.

| Source                 | Finding                                                                                                  | Remediation                                                                    | Revision  | Thread state              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- | ------------------------- |
| Gemini security-high   | A native-set failure during authority claim could leave a partial output                                 | Zero-fill and discard the owned output on primary / cleanup failure            | `fab4138` | Before reply / resolution |
| Copilot                | Stage claim sat outside the capture cleanup guard and skipped prepared-key discard on failure            | Move it under a `stageClaimed` guard and split unclaimed / claimed cleanup     | `2c1e48f` | Before reply / resolution |
| Copilot P2             | Test-helper `binding as never` hid a type mismatch                                                       | Replace it with a cast limited to the exact authority run-binding type         | `2c1e48f` | Before reply / resolution |
| Follow-up source audit | Material-return / facade allocation failure sat outside the derived-key guard                            | Move material assignment and facade creation under `try` / `finally` ownership | `2c1e48f` | Local re-audit complete   |
| Follow-up source audit | Invalid-length zeroize failure was not retained, and a partial checkpoint internal copy was not scrubbed | Retain the cause and zeroize the partial Buffer on copy failure                | `2c1e48f` | Local re-audit complete   |

The full-power runs retain their intermediate findings. The first two pre-review attempts reached 2,055 / 2,056 tests before an existing coordinator test kept the global `Promise.prototype` poisoned until `setImmediate` even after the operation had settled, catching parallel-runner communication (`166.08 s` and `154.77 s`). The same 35-test file passed 35 / 35 alone, so the test now restores the intrinsic immediately in the operation-settlement callback. On attempt three, a separate real-child fixture exceeded its 20,000ms startup limit by about 0.3 seconds under saturated CPU and ended at 2,055 / 2,056 (`152.70 s`). Its isolated measurement was `0.261 s`; the production timeout was left unchanged while only the test fixture limit increased to 60,000ms. Attempt four at `df740ac` passed 2,056 / 2,056 in `153.60 s`.

Full runs continued after review. Attempt five at the Gemini fix `fab4138` completed 115 / 115 files with 2,056 passed in `154.29 s`; final executable code `2c1e48f` completed 115 / 115 files with 2,056 passed in `155.07 s`. In contrast, historical Linux CI at `af227e5` records 2,042 passed and 14 skipped separately; its green result is not evidence for the newer `2c1e48f` revision.

The final local build passed with 13 workers in `25.51 s`. The existing edge-runtime static-generation notice, build-phase Firebase Admin rejection, and dynamic-route message caused by `cookies` are neither new bridge warnings nor production-data access. Post-review new-head CI remains `pending` before push, and the Gemini / Copilot threads remain before reply / resolution.

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

Review remediation and local / CI validation touched only code, synthetic fixtures, and builds. They ran no production checkpoint, dataset, training, weight, or live activation, so the zero executions and unchanged live state above remain unchanged after review.

The bridge therefore changes no evaluation function and makes no claim that the engine became stronger, avoided regression, or reached stable high-dan strength. It closes only the code boundary that transfers a V3 derived key once for an exact run / stage / gate into a checkpoint sink without exporting the fixed deployment root.

## 11. Next production connector

The next trusted connector closes the existing [single-use coordinator handoff](./blog-shogi-floodgate-v7-checkpoint-handoff.en.md) and this key bridge under one ownership boundary.

1. Claim the exact coordinator facade once and obtain its `runBinding` and `{ produce, abortAndDrain }`.
2. Authorize an active private-stage lease through the production boundary.
3. Prepare an opaque V3 key facade for the exact gate / run / stage / binding.
4. Invoke the checkpoint sink inside the synchronous callback of the authenticated full 24,000-row training consumer.
5. On every failure path that never reaches the sink, discard the prepared facade and close the stage lease still owned by the connector.
6. If the stage claim inside the sink fails, the sink discards the prepared key but does not close the unclaimed lease; cleanup responsibility for the supplied lease capability remains with the caller.
7. After a successful stage claim, the sink owns key cleanup and lease close across every capture / execution success or failure path.
8. Return a combined success receipt only after checkpoint, training postflight, and coordinator cleanup all succeed.
9. With manual approval between them, advance 100, 500, and 24,000 as separate invocations over the same run / stage / input / key instance.

Even the 100 and 500 gates receive all 24,000 rows; they create neither separate slices nor holdout access. These are teacher-data durability gates, not playing-strength gates. Labels, training, weight selection, production activation, and formal A/B remain separate explicitly authorized validation stages.
