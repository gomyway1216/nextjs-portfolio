# Composing three gates before production authority — Floodgate v7 offline connector gate contract composition

> This article records the **implementation and local validation** that composed the 100 / 500 / 24,000 gates against fixed in-memory fixtures without actual production authority. There was exactly one synthetic `CoreForTests` composition per gate and **0 / 0 / 0** production-gate executions. Actual approved-record / deployment-key / dataset / checkpoint application-data I/O was **0 / 0 / 0 / 0**; runner-application network requests / `child_process` launches / training runs / matches were **0 / 0 / 0 / 0**. Module-source code loading and test-harness infrastructure are excluded from those application-data / application-operation counts and are recorded separately below. The live evaluation function and weight are **unchanged**, and stable high-dan strength is **not established**. The focused, three-file, related, and full Vitest suites, production build, TypeScript, full ESLint, Prettier, Python stdlib, npm audit, and independent review passed locally. PR, CI, and merge results remain unclaimed and `PENDING`; offline-fixture success is not production execution or playing-strength improvement. Japanese version: [blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.md](./blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.md)

## 1. Current status

| Item                                           | Current value                                                              | Meaning                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Document                                       | Implemented / local validation complete                                    | PR / CI / merge are not included in this result             |
| Implementation revision                        | `04f6dad7cd35737c9d7e9f67e85cb98afd418f43`                                 | Revision covered by source, tests, and local evidence       |
| Fixed synthetic fixture execution              | One composition each for 100 / 500 / 24,000                                | Exactly three cases completed                               |
| Deterministic fresh-process capture            | 4 / 4 PASS                                                                 | All four exited 0 with byte-identical output                |
| Production-gate execution                      | 0 / 0 / 0                                                                  | The production connector entrypoint did not run             |
| Actual record / key / dataset / checkpoint I/O | 0 / 0 / 0 / 0                                                              | Count application-data I/O only                             |
| Production-entrypoint named import / call      | 0 / 0                                                                      | Distinct from shared-module code loading                    |
| Shared-module source loading                   | Excluded from I/O counts                                                   | Production-wrapper definitions are transitively code-loaded |
| Runner network / child / training / match      | 0 / 0 / 0 / 0                                                              | Application-operation count excluding the harness           |
| Live weight / stable high-dan                  | Unchanged / not established                                                | Generate no playing-strength claim                          |
| Completed validation                           | Focused 11 / 11, three-file 73 / 73, related 449 / 449, full 2,257 / 2,257 | Every listed local check passed                             |
| PR / CI / merge                                | `PENDING` / `PENDING` / `PENDING`                                          | Infer no URL or check result                                |

This change closes only one gap: whether the three gate contracts can be composed deterministically under one fixed fixture family and one test-only ownership policy. Production readiness, actual connector success, teacher throughput, training, and playing strength remain separate execution evidence.

## 2. Why compose offline before operational authority

The production connector combines approved enrollment, readiness, coordinator ownership, a stage lease, deployment-key authority, authenticated training rows, the checkpoint sink, and postflight in one invocation. Opening real keys or datasets first would mix contract mismatches with operational failures, and a cleanup defect could affect actual state.

Offline composition first checks that:

- the cumulative 100 → 500 → 24,000 record contracts agree;
- each gate has fixed sealed state, resume delta, and receipt projection;
- capability origin, single use, sequencing, and cleanup can be checked without production I/O;
- no path, row, key, MAC, function, or raw error cause reaches public JSON; and
- a failure changes no actual record, key, dataset, or checkpoint.

This is not a substitute for production authority. A passing offline fixture proves neither actual-key continuity, legitimacy of an approved record, real-row integrity, nor checkpoint durability.

## 3. Zero-argument API and prohibited routes

The implemented operator entry is:

```text
public API exact export name = runFloodgateV7OfflineConnectorGateContractComposition
public API arguments         = 0
CLI                          = npm run shogi:floodgate-v7-offline-connector-gates
CLI positional arguments    = 0
CLI environment authority   = none
```

The API contract is zero-argument. The caller cannot supply a gate, path, home, record, key ID, key bytes, rows, checkpoint root, clock, random source, filesystem facade, network client, child-process launcher, or production capability. The CLI rejects extra arguments and runs only the internal fixed three-gate suite. It checks `argv` before lazy-loading the runner, so import-only execution does nothing and an extra argument is rejected before the runner graph loads.

Prohibited routes are:

- do not call the production approved-record loader or preflight;
- do not call the deployment-key provisioner, inspector, readiness probe, or authority;
- do not call the production connector entry, real coordinator, stage authorizer, row consumer, or checkpoint sink;
- do not reach production external state from runner-application execution through `node:fs`, networking, or `child_process`;
- do not start teacher work, training, selection, matches, or weight activation through import side effects; and
- do not mix a caller-injected production facade into test-only success.

This boundary does not mean that the production-related module graph is absent. The runner's only executable named imports and calls from shared modules are `createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests` and `runFloodgateV7ProductionCheckpointConnectorCoreForTests`; it neither named-imports nor calls the production loader, production claim, or production connector entrypoint. Those shared modules also contain production wrappers and production dependency definitions, so their source is code-loaded and their transitive dependencies may include `node:fs`, `node:os`, `node:path`, and `node:child_process`. This article therefore does not claim zero production-module imports or a zero transitive filesystem / child-process import graph. Module-source loading is excluded from application-data I/O counts. The fresh-process trap checked an enumerated set of application-facing public APIs during code loading and execution and observed **0** unexpected calls across that set. Separate instrumentation positively observed nonzero TSX-loader source reads, config reads, `Worker` construction, effective-ID lookup, and parent IPC as required harness infrastructure. This is an enumerated API-level trap result, not a general syscall sandbox or a claim of zero operating-system activity.

To remove an import-time identity access found during this check, the training-row consumer now captures only the `process.getuid` function reference and does not invoke it while importing the module. It calls the captured function exactly once when opening each real snapshot and reuses that UID for the root and raw-snapshot checks. A fresh-module regression fixes the behavior at zero calls on import, one per snapshot, two cumulatively for two snapshots, and the correct `this` binding.

## 4. Fixed synthetic fixtures

Fixtures consist only of module-owned fixed in-memory data. No public factory lets the caller select gate values, and every dependency passed to the test-only core is fresh, frozen, and exact-shaped.

| Fixture field                | Fixed rule                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Execution boundary           | `test-only-fixed-in-memory-no-production-capability-composition`                                                                 |
| Gate order                   | 100, 500, 24,000                                                                                                                 |
| Composition count            | Exactly one per gate                                                                                                             |
| Approved-enrollment origin   | Test-only; mint no production claim origin                                                                                       |
| Readiness                    | Fixed synthetic `ready` metadata; probe no actual home                                                                           |
| Coordinator / stage / key    | Test-only single-use capability; register in no production registry                                                              |
| Training rows                | One fixed synthetic row; its internal SFEN / move is absent from the public projection, and it contains no label or real dataset |
| Checkpoint / postflight      | In-memory receipt owner; use no file, directory, or fsync                                                                        |
| Time / randomness            | Use no dynamic timestamp or random ID                                                                                            |
| Paths / secrets / byte views | Include none in public fixture, receipt, or error fields                                                                         |

Unknown keys, symbol keys, accessors, Proxies, sparse arrays, strings containing NUL, unsafe integers, and wrong origins fail closed. The receipt field `dynamic_identifiers_are_synthetic: true` applies only to the fixed test constants `run_id`, `key_instance_id`, and `approval_id`. The `key_id` is a shared public contract identifier, not a synthetic dynamic ID, but it is not itself production authority or a capability.

## 5. The 100 → 500 → 24,000 gate matrix

The three fixtures represent cumulative contracts over one logical stream. They do not mean generating 24,600 independent records.

| Gate contract        | Before |  Added |  After | Sealed | Synthetic composition execution | Production execution |
| -------------------- | -----: | -----: | -----: | :----: | ------------------------------: | -------------------: |
| `durable-prefix-100` |      0 |    100 |    100 | false  |                               1 |                    0 |
| `durable-prefix-500` |    100 |    400 |    500 | false  |                               1 |                    0 |
| `sealed-final-24000` |    500 | 23,500 | 24,000 |  true  |                               1 |                    0 |

Each case exactly compares its target, completed-parent count, resume boundary, record count, sealed flag, gate-specific bytes, and checkpoint status. The fixed `records / bytes` values are `102 / 1,791,893`, `503 / 8,948,379`, and `24,004 / 429,247,143`, respectively. Success in one case does not imply success in another. All three are checked separately before producing the ordered aggregate.

## 6. Capability, sequence, and cleanup

The implemented sequence for one gate is:

1. Capture the fixed fixture with exact shape.
2. Mint one test-only approved-enrollment capability.
3. Claim it exactly once through the test-only claim API; never use the production claim API.
4. Obtain synthetic readiness, coordinator, stage, key, input, checkpoint, and postflight owners.
5. Compose the connector's injected `CoreForTests` exactly once.
6. Validate the gate receipt, ownership transitions, and public projection.
7. On success and failure, revoke unclaimed capabilities and drive the lease, key, and coordinator to terminal states.
8. Validate resource counts and cleanup results before moving to the next gate.

Every capability requires exact object identity, test-only origin, and single use. Clones, same-shaped objects, wrong-origin capabilities, and consumed capabilities are rejected. A failed invocation cannot reuse its capability and needs a fresh fixture invocation.

Cleanup starts and settles every terminal action separately from the primary failure. Public failure exposes no raw cause, path, row, key, MAC, or capability. A test that rejects the second gate's checkpoint after resource acquisition confirms exactly one key discard, lease close, and coordinator abort, calls the failure observer, and starts neither the postflight claim nor the third gate. On success, key, lease, and coordinator cleanup completes before the next fresh capability is created.

## 7. Deterministic JSON

Success uses these exact public values:

```text
schema             = shogi-floodgate-v7-offline-connector-gate-contract-composition-v1
status             = complete-fixed-in-memory-three-gate-test-only-contract-composition
execution_boundary = test-only-fixed-in-memory-no-production-capability-composition
encoding           = UTF-8
records            = exact 1 pretty-printed JSON document + final LF
```

`status = complete...` means only that the fixed in-memory three-gate composition completed inside that CLI invocation. It does not mean completion of a production connector, actual checkpoint, training, or playing strength.

JSON field order, gate order, booleans, safe integers, lowercase hexadecimal strings, and string ceilings are fixed. It includes no timestamp, hostname, absolute path, random ID, process ID, descriptor, function, Buffer / `Uint8Array`, row, SFEN, move, label, key material, MAC, or raw error. Canonical bytes must be repeatable for the same fixture and implementation revision. Stdout is one JSON document pretty-printed with two-space indentation and a final LF, not one-line JSONL. Stderr is only a fixed sanitized failure. A stdout write or close failure cannot return success.

The top-level public keys, in order, are `schema`, `status`, `claim_boundary`, `trust_boundary`, `execution_boundary`, `connector`, `synthetic_fixture`, `gates`, `cross_gate`, `operation_counts`, and `nonclaims`.

The saved protocol is [`ml/protocols/floodgate-v7-offline-connector-gate-contract-composition-04f6dad-result.json`](../ml/protocols/floodgate-v7-offline-connector-gate-contract-composition-04f6dad-result.json). It exactly matches CLI stdout at 6,254 bytes with SHA-256 `f66f1b6745626a22d22c1e2e484b4bb674e6d57f65ae7138e60f621a0be6505f`. All four fresh processes exited 0, and 4 / 4 had identical bytes and digests.

## 8. Validation, review, and intermediate attempts

The following are the confirmed local results for implementation revision `04f6dad7cd35737c9d7e9f67e85cb98afd418f43`.

| Evidence                              | Status    | Measured value                                                                                                                                       |
| ------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic CLI capture             | PASS      | 4 / 4 fresh processes, exit 0, 6,254 bytes, exactly byte-identical                                                                                   |
| Focused contract / CLI tests          | PASS      | Node v22.13.0, 1 file, 11 / 11 tests, Vitest 1.49s, real 1.85s, maximum RSS 316,293,120 bytes                                                        |
| 100 / 500 / 24,000 composition cases  | PASS      | One test-only composition per gate; production invocations 0 / 0 / 0                                                                                 |
| Failure / cleanup / poison tests      | PASS      | Includes resource-acquired second-gate checkpoint failure                                                                                            |
| Row-consumer three-file regression    | PASS      | 3 files, 73 / 73 tests, Vitest 2.02s; wall time / RSS were not recorded                                                                              |
| Connector-related regression          | PASS      | Node v22.13.0 / npm 11.14.1, 12 files, 449 / 449 tests, Vitest 154.26s, real 154.88s, maximum RSS 4,280,254,464 bytes, exit 0                        |
| Authoritative full Vitest             | PASS      | Node v22.13.0 / npm 11.14.1, 123 files, 2,257 / 2,257 tests, Vitest 179.26s, real 179.92s, maximum RSS 3,310,829,568 bytes, exit 0                   |
| Production build                      | PASS      | real 34.13s, maximum RSS 2,549,137,408 bytes, one edge-runtime warning, handled build-time Firebase / `DYNAMIC_SERVER_USAGE` logs, 0 terminal errors |
| TypeScript                            | PASS      | 0 diagnostics, real 3.16s, maximum RSS 1,082,179,584 bytes, exit 0                                                                                   |
| Full ESLint                           | PASS      | 0 errors, 157 warnings, real 28.75s, maximum RSS 1,343,275,008 bytes                                                                                 |
| Prettier                              | PASS      | real 1.39s, maximum RSS 161,300,480 bytes                                                                                                            |
| Python stdlib                         | PASS      | 58 / 58 tests, real 0.89s, maximum RSS 65,011,712 bytes                                                                                              |
| npm audit                             | PASS      | 0 vulnerabilities at every severity, real 0.97s, maximum RSS 134,791,168 bytes                                                                       |
| Enumerated public-API security trap   | PASS      | 0 unexpected calls; nonzero TSX-loader / `Worker` / effective-ID / parent-IPC infrastructure observed separately; not a general syscall sandbox      |
| Independent review                    | PASS      | Final P0 / P1 / P2 = 0 / 0 / 0                                                                                                                       |
| Ready-PR review / required CI / merge | `PENDING` | No result is claimed                                                                                                                                 |

The Node permission-model check is not gating evidence. Its first three attempts failed before the runner started, respectively at TSX cache write, case-sensitive source read, and esbuild worker permission. A fourth attempt exited 0 but carried Node's warning that `--allow-worker` can weaken the permission model, so it remains supporting-only. The fresh-process trap test and normal unit / regression results are the gating evidence instead.

Runtime pinning also mattered. The machine default, Node v20.14.0, is outside the package's supported range of `>=22.13.0 <24`, so every attempt under that runtime is non-gating. An earlier wrong-runtime full-suite attempt reached a `structuredClone` failure and was aborted after 266.71s real with maximum RSS 3,891,511,296 bytes. A later initial related-suite invocation also accidentally fell through to Node v20.14.0; it was discarded and restarted. Only the final Node v22.13.0 / npm 11.14.1 results in the table are counted.

## 9. Explicit nonclaims and unchanged live state

- production approved-record load / claim: **0 / 0**;
- actual deployment-key open / key bytes read: **0 / 0 bytes**;
- real-dataset read / production training-row callback: **0 / 0**;
- fixed synthetic in-memory row callback: **exactly one per gate**;
- actual checkpoint write / fsync / seal: **0 / 0 / 0**;
- production connector 100 / 500 / 24,000 gates: **0 / 0 / 0**;
- runner-application network request / `child_process` launch / teacher label: **0 / 0 / 0**;
- training run / optimizer step / candidate weight: **0 / 0 / 0**;
- production-weight overwrite / live activation: **0 / unchanged**;
- match / Elo / rating / rank evidence: **0 / 0 / not established / not established**;
- stable high-dan strength: **not established**; and
- production readiness: **not established**.

The execution count of one synthetic fixture per gate is not a production-execution count. This offline runner and the listed local checks open no actual key, record, dataset, or checkpoint and start no teacher work, training, matches, or weight activation. The same zero-operation result is not yet claimed for unexecuted remote CI.

## 10. Next safe step

1. Make the local evidence pinned to revision `04f6dad7cd35737c9d7e9f67e85cb98afd418f43` reviewable in a ready PR, then record review comments, required CI, and a regular merge separately after they are observed.
2. If source or tests change, rerun the affected focused / related checks and authoritative full validation before claiming the same PASS results.
3. Keep production execution for this offline change at zero after merge.
4. Treat actual-record / key / dataset I/O and the real 100-parent gate as a separate run with its own operational approval and execution record.

The current result is **three fixed test-only compositions that matched deterministically in 4 / 4 fresh processes with observed production I/O at zero, plus passing listed local validation and independent review**. The nearest remaining endpoint is to observe and record the ready PR, required CI, and regular merge separately; none is claimed here. Even then, this is not achievement of high-dan strength; it is the contract boundary before a real 100-parent gate.
