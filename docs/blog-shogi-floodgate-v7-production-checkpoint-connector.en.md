# Closing production capabilities into one boundary — the Floodgate v7 checkpoint connector

> The preceding [single-use coordinator handoff](./blog-shogi-floodgate-v7-checkpoint-handoff.en.md) projects checkpoint operations once from the exact production coordinator, while the [opaque key bridge](./blog-shogi-floodgate-v7-checkpoint-key-bridge.en.md) passes a V3-specific key capability to the checkpoint sink without exposing the fixed deployment root. There was still no entry point that placed the active [stage lease](./blog-shogi-floodgate-teacher-stage-authorization.en.md), [authenticated training rows](./blog-shogi-floodgate-training-row-consumer.en.md), [consumer postflight](./blog-shogi-floodgate-consumer-postflight-capability.en.md), and [V3 milestone checkpoint](./blog-shogi-floodgate-v7-checkpoint-v3-milestones.en.md) under the same production ownership. Historical connector v1 composed those owners and first checked metadata-only deployment-key readiness. Current v2 adds a synchronous [approved-enrollment](./blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.en.md) claim before readiness and removes caller-supplied expected-ID authority. Neither revision is a production-gate execution, teacher label, training, weight, live-evaluation-function, match, or playing-strength result. Japanese version: [blog-shogi-floodgate-v7-production-checkpoint-connector.md](./blog-shogi-floodgate-v7-production-checkpoint-connector.md)

---

## 1. Historical v1 boundary and current v2 delta

This connector does not create a new search or evaluation function. Historical PR #456 implemented v1, passed its recorded local validation, resolved both duplicate findings, and was later integrated by regular merge commit `e543eb4`. Those numbers are historical v1 evidence. Current v2 additionally delegates approved-identity minting to the fixed approved-enrollment loader and module-private single-use registry, then lets the connector own exactly one synchronous claim. Its focused, related, and stable full validation, production build, and final independent review are complete, and all 3 / 3 actionable review threads on ready PR #463 are fixed and resolved. CI and merge remain pending. Neither revision establishes production readiness or a successful real run.

| Capability          | Existing owner                                        | Connector action                                                             | Current execution evidence                   |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| Approved enrollment | Fixed private loader + module-private claim registry  | Claim one opaque capability before readiness; capture approved identity only | Temporary fixtures only; 0 production claims |
| Key readiness       | Fixed current-EUID metadata probe                     | Decide `ready`, `not-provisioned`, or `unsafe` before engine / stage startup | Metadata probe only                          |
| Coordinator         | Zero-argument production factory + single-use handoff | Obtain the exact `runBinding` and `produce` / `abortAndDrain` / `close`      | 0 parent operations                          |
| Stage               | Production stage authorizer                           | Acquire an active private lease and own it through terminal cleanup          | 0 production leases                          |
| Deployment key      | Fixed authority + opaque V3 facade                    | Prepare a facade for the exact run / stage / gate and compare key instance   | 0 key bytes read                             |
| Training input      | Production full-bundle verifier + pathless callback   | Pass exactly 24,000 training rows once to the callback                       | 0 real-row callbacks                         |
| Checkpoint          | Production V3 sink                                    | Advance one 100 / 500 / 24,000 gate on the same stream                       | 0 gate executions                            |
| Postflight          | Production consumer postflight registry               | Claim the exact receipt once after checkpoint settlement                     | 0 production postflights                     |
| Combined receipt    | Connector                                             | Return only a metadata projection stripped of capabilities, rows, and paths  | 0 connector success receipts                 |

The v1 article was written against PR #455 merge `4067beec`; its base-main CI and production Vercel state were historical context, not current-v2 evidence. V1 later landed through PR #456 merge `e543eb4`. Current v2 is the separate ready PR #463 delta; its still-unknown CI values are not inferred from either earlier merge.

## 2. Separate readiness, execution, and provisioning

Looking at a key namespace and reporting readiness, creating a key, and reopening the key under authority for actual use are different privileges.

| Boundary  | API / owner                                            | Filesystem action                                                      |               Key bytes | Authority                        |
| --------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------: | -------------------------------- |
| Readiness | `inspectFloodgateV7DeploymentKeyReadiness()`           | Inspect only metadata for the fixed current-user slot                  |                       0 | Advisory only                    |
| Execution | `runFloodgateV7ProductionCheckpointConnector(options)` | Own stage and checkpoint while authority reopens / revalidates the key | Authority-internal only | Exact run / stage / gate         |
| Provision | Separately approved step outside the connector         | Exclusively create a new parent / key without clobbering               |        Exactly 32 bytes | Not implemented in the connector |

The readiness receipt fixes `authoritative_reopen_required: true`. `ready` is not an authorization token and does not close TOCTOU. The connector still prepares the opaque key, rereads it through held descriptors, and completes final metadata revalidation. If the key is deleted or replaced between readiness and execution, the later authority fails closed.

The read-only probe on the actual machine returned `not-provisioned`: the fixed parent was `absent`, the key was `absent`, and `key_bytes_read: false`. The probe creates no directory or file, and the connector never auto-provisions from `not-provisioned`. Any dedicated provisioner remains a separately approved step requiring current EUID, parent `0700`, key `0600`, a regular file, link count 1, exactly 32 random bytes, exclusive create, file / parent fsync, and never-overwrite behavior.

Readiness discloses no key instance ID. Connector v2 no longer accepts a caller-supplied `expectedKeyInstanceId`; it synchronously claims the opaque single-use capability produced by the [approved enrollment control plane](./blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.en.md). That claim pins the expected public ID and deployment identity before readiness. A provisioning receipt intentionally contains no instance ID, and the connector never discovers an instance at execution and silently adopts it.

## 3. Capture the exact request before I/O

The production entry point takes exactly 1 argument, and its top-level request has only these 5 fields.

| Field                | Contract                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| `runId`              | Lowercase 32-byte hex                                                              |
| `gate`               | Exactly one of `durable-prefix-100`, `durable-prefix-500`, or `sealed-final-24000` |
| `keyEnrollment`      | Opaque single-use capability from the fixed approved-enrollment loader             |
| `stageAuthorization` | Existing production stage-authorization options                                    |
| `consumer`           | Existing pinned training-row consumer options                                      |

In `phase = capture`, before enrollment or readiness, the connector rejects Proxies, accessors, symbol keys, unknown / missing fields, sparse `engineArgs`, and strings containing NUL, then captures a fresh frozen projection. It exactly compares the stage and consumer `repositoryRoot`, `rawLockRoot`, `roleLockRoot`, and legacy protected-ID path. Stage `roleBundleRoot` must also equal consumer `outputRoot`. Stage / destination basenames are fixed from `runId`.

A request containing absolute paths is different from returning a path through the public output. Existing stage / consumer owners receive paths under their existing contracts, but the combined receipt and public error project no absolute path, caller-selected path, stage root, or destination root.

The dependency-injected `CoreForTests` takes exactly 2 arguments and fixes the receipt `execution_boundary` to `test-only-injected-capability-composition`. It also returns `test_boundary` as a fresh frozen record with `production_coordinator_origin`, `production_stage_origin`, `production_key_origin`, `production_input_origin`, and `production_checkpoint_origin` all fixed to `false`. A production receipt has `test_boundary: null`. Injected-fixture success therefore cannot be read as production-origin evidence. The production entry point uses only a module-private fixed dependency table; callers cannot inject filesystems, key bytes, signers, callbacks, or runtime facades.

## 4. Capability flow for one invocation

After exact request capture, v2 synchronously claims the opaque approved-enrollment capability. A fake, consumed, or wrong-origin capability fails in `phase = enrollment` before readiness and before any actual-key authority opens. Unless the later readiness result is `ready`, the connector starts neither the coordinator factory nor the stage authorizer. Only after `ready` does it start coordinator and stage concurrently, collect both settlements, and proceed.

```text
exact request capture
            |
            v
opaque approved-enrollment claim
            |
            v
metadata-only key readiness
            |
            v
coordinator factory || stage authorization
            |              |
            +-- all settled+
                    |
                    v
       exact coordinator handoff
                    |
                    v
        opaque gate-key prepare
                    |
                    v
 approved key instance + deployment identity match
                    |
                    v
 full label-free bundle verification
                    |
                    v
 training callback synchronous entry
                    |
                    v
  V3 sink claims lease + rows + key
                    |
                    v
 checkpoint settles -> callback Promise fulfills undefined
                    |
                    v
 consumer postflight + exact claim
                    |
                    v
 key discard/no-op -> lease close || coordinator close/abort
                    |
                    v
       all terminal cleanup settled
                    |
                    v
       metadata-only combined receipt
```

The callback does not retain received rows in module state or a public object. At the first synchronous entry inside the consumer owner's call window, it gives them to the V3 sink. Zero calls, two or more calls, and calls after that window fail closed. The sink claims stage, rows, and derived key through the matching production registries. A connector-owned callback Promise fulfills with exact `undefined` only after checkpoint settlement and receipt validation. Even if the consumer owner resolves or rejects early after invoking the callback, the connector rejoins that same callback Promise outside the owner call and does not proceed to key discard, lease close, or coordinator close / abort before sink settlement. It never leaks the checkpoint receipt as the consumer callback's fulfillment value.

## 5. Bind run, stage, key, and 24,000 rows together

The connector does not combine structurally similar metadata. It carries exact values from existing owners through one request.

| Binding           | Source                        | Connector check / use                                                                                                                              |
| ----------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run ID            | Captured request              | Fix stage basename, HKDF salt, and checkpoint header to one value                                                                                  |
| Gate              | Captured request              | Match key facade and V3 sink across the 100 / 500 / 24,000 request                                                                                 |
| Key ID            | Module-fixed constant         | Accept no caller-selected key ID                                                                                                                   |
| Key enrollment    | Claimed approved capability   | Pin public instance ID, owner UID, and parent/key device+inode before readiness                                                                    |
| Key instance      | Authoritative prepare receipt | Compare exactly with the claimed approved identity; this is public metadata, not a secret constant-time comparison                                 |
| Run binding       | Exact coordinator handoff     | Validate fixed plan bytes / SHA-256, the producer-control contract, and stable / teacher runtime receipt digests before passing them to checkpoint |
| Stage binding     | Active lease receipt          | Fix key authorization and checkpoint to the same private stage identity                                                                            |
| Input binding     | Consumer postflight           | Project manifest / raw bytes, 24,000 parents / 1,000 games, and ID digests as metadata                                                             |
| Checkpoint result | V3 sink receipt               | Drop path / MAC and project gate, sealed state, record / byte count, SHA-256, and durability                                                       |

The 100 and 500 gates do not receive separate 100-row or 500-row datasets. Both receive the same authenticated full 24,000-row input. The gate limits the durable completed prefix, not the training-input identity. The valid transition is 100 → 500 → 24,000, with each later gate resuming the same work stream.

`key_instance_id` is not key bytes or SHA-256. It is the authority's pseudonymous deployment-instance identifier under a separate domain. The combined receipt keeps it for cross-receipt comparison but returns no authorization MAC, root key, V3-derived key, or hash of either key.

An owner receipt is not accepted merely because its shape looks similar. For the coordinator run binding, the connector checks the schema, module-fixed plan bytes / SHA-256, producer-control schema, deadlines, abort drain, fixed max-in-flight / cancel / late-settlement policy, and runtime-receipt digests through data descriptors. For postflight it fixes the schema, claim / execution boundary, training role, callback settlement, filesystem revalidation, descriptor close, and verifier revision, and requires `raw_format` to be exactly `shogi-floodgate-label-free-raw-parent-jsonl-v1`. For checkpoint it matches the request's `run_id` / `key_id` / `gate`, gate contract, status-to-sealed relationship, 24,000 training parents, target / completed parents, and durability before making a fresh projection.

## 6. Ownership-transfer matrix

Resources are tracked by who performs terminal cleanup, not merely by which variable can see them.

| Phase                           | Connector ownership                                                | Sink / consumer ownership                                               | Terminal action                                                                          |
| ------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Capture / readiness             | None                                                               | None                                                                    | Return only a fixed public failure                                                       |
| Coordinator + stage startup     | Fulfilled coordinator and lease                                    | None                                                                    | Observe safely pinnable invalid Promises through settlement and clean acquired resources |
| Handoff                         | Exact handoff lifecycle                                            | None                                                                    | `close` on success, `abortAndDrain` on failure                                           |
| Key prepared                    | Unclaimed opaque facade                                            | None                                                                    | `discard` if the sink is never reached                                                   |
| Consumer callback entry         | Retain no row reference                                            | Consumer owns input claim window and descriptors                        | Invoke sink synchronously from callback                                                  |
| Sink stage-claim failure        | Lease ownership remains with connector                             | Sink discards prepared key                                              | Connector completes lease close                                                          |
| Sink stage-claim success        | Only join the close Promise                                        | Sink claims lease / rows / key and zeroizes / closes                    | Sink cleans on success and failure                                                       |
| Checkpoint + postflight success | Only checkpoint / postflight metadata                              | Consumer mints receipt after snapshot revalidation and descriptor close | Connector claims postflight exactly once                                                 |
| Final cleanup                   | No-op discard for claimed key, lease close join, handoff lifecycle | None                                                                    | Start both lease / coordinator cleanup before their all-settled join                     |

`discardKey` is a safe no-op after the sink has already claimed the capability and zeroizes the stored derived key when it remains unclaimed. `lease.close()` joins the same close Promise started by the sink. The coordinator uses `close()` on success and `abortAndDrain()` whenever a primary or cleanup failure exists. After key discard, the connector starts both lease close and coordinator close / abort instead of awaiting them serially, then collects both through an all-settled join. A hang or rejection on one side therefore does not prevent the other terminal action from starting.

## 7. Failure and all-settled cleanup

The public error returns no raw cause. It carries only operation phase, readiness status, checkpoint-persistence possibility, cleanup-failure count, and retry disposition.

| Phase / case                             | Parent search / checkpoint            | Cleanup                                                   | Public disposition                                        |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `capture` failure                        | 0 / 0                                 | No resource; capability is not claimed                    | `fresh-invocation-required`                               |
| `enrollment` claim / origin failure      | 0 / 0                                 | No runtime resource; no actual key authority opens        | `fresh-invocation-required`                               |
| `readiness`: `not-provisioned`           | 0 / 0                                 | No resource                                               | `provision-required`                                      |
| `readiness`: `unsafe`                    | 0 / 0                                 | No resource                                               | `operator-reconciliation-required`                        |
| `coordinator-stage` failure              | 0 parent searches                     | Close / abort fulfilled or late-captured side             | Always `operator-reconciliation-required`                 |
| `handoff` failure                        | 0 checkpoints                         | Lease close + coordinator abort                           | `fresh-invocation-required` if cleanup succeeds           |
| `key-prepare` failure                    | 0 consumer / checkpoint calls         | Key discard if acquired + lease close + coordinator abort | Operator reconciliation without private details           |
| `key-instance` actual-authority mismatch | 0 consumer / checkpoint calls         | Key discard + lease close + coordinator abort             | Operator reconciliation without mismatch details          |
| `consumer` failure before sink           | 0 checkpoints                         | Key discard + lease close + coordinator abort             | `fresh-invocation-required` if cleanup succeeds           |
| `checkpoint` failure                     | 0 success receipts                    | Sink cleanup + connector close join + coordinator abort   | Fresh / reconciliation depends on persistence possibility |
| `postflight` failure                     | Checkpoint may already have persisted | Settle key / lease / coordinator                          | May become `checkpoint-reconciliation-required`           |
| `cleanup` failure                        | 0 success receipts                    | Attempt every remaining terminal                          | Publish only count; operator / checkpoint reconciliation  |
| `receipt` projection failure             | 0 public success receipts             | Key / lease / coordinator already settled                 | Checkpoint reconciliation                                 |

Only the test core may pass raw primary / cleanup failures to `observeFailureForTests`. That hook exists for fault-injection assertions and is fixed to `undefined` in the production dependency table. The production public error contains no `cause`, `primary`, cleanup Error, path, row, or key material.

The connector and training consumer use the same safe native-Promise boundary. Each internal Promise gets an own `constructor` fixed to a frozen null-prototype holder whose only `Symbol.species` points to the captured native `Promise`; an own frozen `then` delegates to the captured `Promise.prototype.then`. Promises derived from it are pinned recursively, preventing caller changes to constructor / species / then from entering later awaits or cleanup.

Even when its shape is invalid, a genuine native Promise whose own constructor can be safely pinned without a getter or Proxy trap is observed through settlement with the captured native `then` while the public operation still fails closed. If a coordinator, stage lease, or key authorization fulfills, the value is captured only for terminal cleanup—not as success evidence—and drives coordinator abort / close, lease close, or key discard. A shape with a non-configurable unsafe constructor is rejected without executing its getter or trap; the connector does not claim it can recover a resource hidden behind that unobservable boundary.

## 8. Close four public leakage surfaces

Merely omitting a secret-named field is insufficient. Success, failure, callback, and source imports are closed separately.

| Surface           | Allowed                                                                                                           | Forbidden                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Success receipt   | Fixed metadata, counts, digests, gate, key instance ID, lifecycle booleans                                        | Buffer / Uint8Array, key / MAC, rows / SFEN / move, absolute / caller path, facade, function                                  |
| Public error      | Fixed phase / status / boolean / count / retry enum                                                               | Raw cause / primary, cleanup Error, private message, path, row, key                                                           |
| Consumer callback | Give exact rows synchronously to production V3 sink                                                               | Caller callback, module-level retention, returning / serializing rows                                                         |
| Imports           | Approved-enrollment claim, readiness, coordinator, stage, authority prepare/discard, consumer/postflight, V3 sink | `node:fs` / `node:path`, approved-record writer, derived-key claim, raw-root test core, provisioner, selection / holdout APIs |

Readiness, coordinator handoff / run binding, stage lease, key metadata, postflight, and checkpoint metadata returned by owners are not passed directly into the public receipt. At every boundary the connector rejects Proxies and accessors / symbol keys and captures only bounded own enumerable data descriptors. It validates the needed strings, safe integers, booleans, canonical hex, and fixed contract values before projecting fresh records, so it neither invokes metadata getters nor blindly copies a path / function / row canary.

The combined receipt is built from fresh null-prototype records and freezes every nested record. Its top-level projection is:

```text
contract / status / claim_boundary / trust_boundary / execution_boundary / test_boundary
run_id / gate / key_id / key_instance_id
approved_key_enrollment
run_binding / input_binding / checkpoint
lifecycle / holdout_boundary / nonclaims
```

`approved_key_enrollment` projects the fixed claim boundary, claim execution boundary, record bytes/SHA metadata, candidate-receipt bytes/SHA metadata, approval metadata, and approved deployment identity; it contains no capability or key material. Production has `test_boundary: null`; the test core has all five production-origin flags set to `false`. The connector does not copy the checkpoint receipt's stage basename, work filename, milestone MAC, or authorization MAC. It also does not return the original postflight receipt as exact runtime authority; only its input binding is copied. The production connector source itself imports no filesystem and delegates through existing capability APIs to the approved-enrollment, readiness, stage, and consumer owners.

## 9. Distinguish unread labeled holdout from label-free role verification

The connector callback receives only the `training` role and exactly 24,000 rows. The production training consumer nevertheless uses the complete label-free role-bundle verifier. Claims about selection / final must therefore be separated as follows.

| Claim                                                       |      Value | Meaning                                                                 |
| ----------------------------------------------------------- | ---------: | ----------------------------------------------------------------------- |
| Callback role                                               | `training` | Pass no selection / final rows to callback                              |
| Callback parents                                            |     24,000 | Pass only the full training input to V3 sink                            |
| Labeled selection read                                      |    `false` | Open no model-selection labels                                          |
| Labeled final holdout read                                  |    `false` | Open no sealed final labels                                             |
| Label-free selection / final role artifacts may be verified |     `true` | Complete bundle integrity verification may read raw role-artifact bytes |

It is correct to say “no access to labeled / sealed holdout,” but incorrect to say “no final-role file bytes were ever read.” A strict zero-read requirement would need a separate authenticated training-only projection / verifier and open/read instrumentation as evidence.

The 100 / 500 / 24,000 gates measure teacher-data throughput, resume, and durability. They are not selection-score or playing-strength gates. After training, seeds 42 / 43 / 44, QAT, fresh selection, fresh / legacy final, known regressions, production parity, and formal A/B all remain separate.

## 10. Historical v1 evidence and current v2 local validation

Confirmed values and unexecuted work remain separate. This first table records historical v1 state from PR #456; “current” inside its original scope does not mean current v2.

| Validation layer              | Revision / scope                      | Status    | Result                                                        |
| ----------------------------- | ------------------------------------- | --------- | ------------------------------------------------------------- |
| Readiness focused             | Historical v1 readiness / local macOS | `PASS`    | 6 / 6, about `0.17 s`                                         |
| Training consumer focused     | Historical v1 native-Promise consumer | `PASS`    | 61 / 61                                                       |
| Connector focused             | Historical v1 connector               | `PASS`    | 57 / 57                                                       |
| TypeScript                    | Historical PR #456 branch             | `PASS`    | `tsc --noEmit`                                                |
| Scoped ESLint                 | Historical PR #456 branch             | `PASS`    | Connector / consumer / readiness scope                        |
| JA / EN Prettier + diff-check | These two articles                    | `PASS`    | Format / whitespace / structure checked                       |
| Full Vitest                   | Current connector branch              | `PASS`    | 117 files, 2,119 / 2,119, `154.99 s`                          |
| PR review                     | PR #456                               | `PASS`    | 2 duplicate threads fixed, replied, and resolved in `05c1c25` |
| Branch required CI            | Post-review documentation head        | `pending` | Head after documentation fix not yet validated                |
| Base main CI                  | PR #455 merge `4067beec`              | `green`   | Historical base evidence without connector code               |
| Production Vercel             | Current main deployment               | `green`   | Live weight / connector activation unchanged                  |

The readiness suite covers a missing parent / key, safe empty parent, wrong size, wrong mode, symlink, hard link, metadata-only ready state, zero Proxy traps, and the argumentless production probe. Key bytes in the ready fixture match before and after the test, while the receipt exposes neither home path nor key hex.

Connector focused 57 / 57 covers exact composition, metadata capture, Promise pin / invalid settlement, callback join, parallel cleanup, retry disposition, and receipt-leak boundaries. Training consumer focused 61 / 61 also covers constructor / species / then pinning and callback-identity revocation. These are focused regression evidence, not evidence of a real production gate or playing strength.

Historical v1 full regression passed at 117 files and 2,119 / 2,119 tests, and both duplicate PR #456 threads were resolved. Its article-time post-review branch-CI field remained pending; v1 later merged as `e543eb4`. None of that is reinterpreted as current-v2 validation or production-execution evidence.

| Current v2 delta               | Status             | Evidence / measured result                                                                 |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| Approved-enrollment focused    | 21 / 21 PASS       | Canonical bytes/SHA, BOM rejection/reorder/oversize/TOCTOU/poison, and single-use claiming |
| Connector-focused integration  | 111 / 111 PASS     | Capability-only request, UID/byte bounds, identity/layout/algorithm, and gate bounds       |
| Combined focused               | 132 / 132 PASS     | 2 files, duration `0.736 s`; real `1.073 s`                                                |
| Related regression             | 335 / 335 PASS     | 10 files; duration `146.22 s`; real `147.12 s`                                             |
| Stable full Vitest             | 2,245 / 2,245 PASS | 122 / 122 files, 6 workers, duration `150.69 s`                                            |
| Python stdlib                  | 58 / 58 PASS       | Node 22.13 runtime path, suite `0.106 s`                                                   |
| TypeScript                     | PASS               | Revision `599385e6`; real `14.517 s`                                                       |
| Scoped ESLint / format         | PASS               | Revision `599385e6`; scoped lint real `1.739 s`; targeted format / diff-check PASS         |
| Full lint / npm audit          | PASS / 0           | Earlier capture: 0 errors, 157 warnings, real `29.82 s` / 0 vulnerabilities                |
| Production Turbopack build     | PASS               | Earlier capture: real `29.30 s`; compile `8.4 s`; TS `18.3 s`; 193 / 193 with 13 workers   |
| Final independent review       | P0/P1/P2 = 0       | Sealed after fixing two initial P1s and the follow-on P2 findings                          |
| Ready PR / required CI / merge | #463 / Pending     | Actionable threads 3 / 3 resolved; checks and merge remain incomplete                      |

The timed direct-related run of 10 files / 335 tests was captured at revision `a3d16f7880f567ec1f825eba6563ca297cd8f619`. After the identity-validator wording was clarified, focused tests, TypeScript, scoped ESLint, and targeted format / diff-check were rerun at revision `599385e6bd194a71c0382fafe07fa3700d0fc893`, and the final 122-file full suite containing the same 10 files passed 2,245 / 2,245. The related timing is an earlier capture; current-revision overall pass status is bound to the final full run. The build, full-lint, and audit values in the table are successful earlier captures, not reruns at revision 599.

The final 6-worker full run at the current revision took `151.20 s` real time, reached a maximum RSS of 4,228,874,240 bytes, and passed 122 / 122 files and 2,245 / 2,245 tests. The preceding 8-worker attempt reached only 121 / 122 files and 2,244 / 2,245 tests when WASM worker initialization did not complete within 30 seconds (duration `150.44 s`, real `151.10 s`, maximum RSS 4,064,821,248 bytes). The same 53-test file immediately passed 53 / 53 in isolation (duration `14.10 s`, real `14.63 s`, maximum RSS 347,815,936 bytes). This isolated success is diagnostic evidence consistent with transient worker-start contention; it neither converts the 8-worker full attempt into a pass nor establishes the timeout's cause. Only the subsequent 6-worker full pass is the authoritative current-revision local full result.

Separately, an earlier maximum-parallel full attempt also reached 121 / 122 files and 2,244 / 2,245 tests, but because of a USI transcript timeout; that file immediately passed 43 / 43 in isolation. The machine-readable evidence preserves that older USI transient and the new WASM-initialization timeout as separate attempts rather than treating identical aggregate counts as one failure. The checkpoint trailing-line auto-discard message is an expected cleanup diagnostic, not a test failure. All of these are source and temporary-fixture evidence, not execution results for an actual approved record, production connector gate, teacher, training, weight, or playing strength.

## 11. Zero production execution and unchanged live state

The fixed key is not provisioned on the actual machine, so the production connector has not run. Nothing beyond the readiness probe changed live state.

| Item                                         | Current value                 |
| -------------------------------------------- | ----------------------------- |
| Fixed deployment parent / key                | `absent` / `absent`           |
| Readiness status / key bytes read            | `not-provisioned` / 0 bytes   |
| Provision attempts                           | 0                             |
| Production gate executions                   | 100: 0, 500: 0, 24,000: 0     |
| Real Floodgate dataset read by connector     | 0 games / 0 parents / 0 bytes |
| Real stable / teacher search                 | 0 parents                     |
| Teacher labels / teacher JSONL               | 0 / 0 bytes                   |
| Checkpoint entries / milestone / seal        | 0 / 0 / 0                     |
| Optimizer steps / model checkpoints          | 0 / 0                         |
| Candidate-weight generation                  | 0 bytes                       |
| Production-weight overwrite                  | 0 bytes                       |
| Live evaluation-function / weight activation | Unchanged                     |
| Matches / Elo / rating / rank evidence       | 0                             |

Historical connector v1 landed through PR #456 merge `e543eb4`. Current v2 source, local validation, ready PR #463, and its 3 / 3 resolved review threads do not establish that pending CI / merge work has completed. Neither a source merge nor a green application deployment is evidence that the production connector, real dataset, teacher engine, training, or weight activation ran.

It therefore cannot support “the evaluation function became stronger,” “it did not regress,” or “it is stable at high-dan level.” The live weight remains the same bytes.

## 12. 12-worker ETA and the next approval gates

These times are not measurements from a real Floodgate connector run. They are the raw lower estimate obtained by linearly scaling prior real WCSC36 depth-16 teacher evidence to 24,000 parents, plus a planning-only operational budget for stable proposal, an added candidate rescore, startup, checkpoint fsync, and a small variance margin.

| Gate              | New parents at this invocation | Prior raw lower estimate | Planning-only operational budget |
| ----------------- | -----------------------------: | -----------------------: | -------------------------------: |
| 100               |                            100 |               `00:02:52` |                 About `00:03:30` |
| 500 cumulative    |                            400 |               `00:14:20` |                 About `00:17:30` |
| 24,000 cumulative |                         23,500 |                `11.47 h` |                     About `14 h` |

The raw `11.47 h` lower estimate excludes the stable proposer and the extra rescore when the stable move expands the union. The operational `14 h` is a reservation budget, not an SLA or measured throughput. Timeouts, mates, candidate counts, and resumed work can change it.

Because 100 / 500 / 24,000 resume the same work stream, the plan does not generate 24,600 separate parents. The 100 gate adds 100, the 500 gate adds 400, and the final gate adds 23,500. The first 100-parent pilot will measure parents/hour, candidate count, timeouts, score / mate distribution, resume, residual processes, and work bytes, then update the 500 and 24,000 ETAs.

The next execution order is:

1. Preserve the completed current-v2 local validation and 3 / 3 resolved review threads on ready PR #463, then complete required CI and a regular merge
2. Under separate explicit operational approval, provision and inspect the fixed key, separately review the candidate, and create-only install the approved record
3. Load and claim a fresh opaque capability, then confirm that read-only readiness is `ready`
4. Run the holdout-free 100-parent gate and audit the enrollment projection, intermediate receipt, and cleanup
5. Advance to 500 only after user approval and recompute the measured ETA
6. Advance to the 24,000 seal only after another approval
7. Only then run three-seed training, selection / final, regressions, production parity, and formal A/B as separate gates

Merge or readiness never starts a real run automatically. Human confirmation remains between gates, and production weight / live activation stays unchanged until every later gate passes.
