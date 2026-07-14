# Composing three gates before production authority — Floodgate v7 offline connector gate contract composition

> This article is the **design draft** for the next PR: compose the 100 / 500 / 24,000 gates against fixed in-memory fixtures without actual production authority. The contract target is exactly one synthetic `CoreForTests` composition per gate and **0 / 0 / 0** production-gate executions. Actual approved-record / deployment-key / dataset / checkpoint application-data I/O remains **0 / 0 / 0 / 0**; network requests / child processes / training runs / matches remain **0 / 0 / 0 / 0**. Module-source code loading is excluded from those application-data I/O counts. The live evaluation function and weight are **unchanged**, and stable high-dan strength is **not established**. Implementation, tests, review, PR, CI, and merge remain explicitly `PENDING`; fixture targets are not execution evidence. Japanese version: [blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.md](./blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.md)

## 1. Current status

| Item                                           | Current value                               | Meaning                                             |
| ---------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Document                                       | Design draft                                | Not evidence of completed implementation            |
| Fixed synthetic fixture target                 | One composition each for 100 / 500 / 24,000 | Exactly three cases; execution result is `PENDING`  |
| Production-gate execution                      | 0 / 0 / 0                                   | Do not call the real connector                      |
| Actual record / key / dataset / checkpoint I/O | 0 / 0 / 0 / 0                               | Count application-data I/O only                     |
| Production-entrypoint named import / call      | 0 / 0                                       | Distinct from shared-module code loading            |
| Shared-module source loading                   | Excluded from I/O counts                    | Production-wrapper definitions are also code-loaded |
| Network / child / training / match             | 0 / 0 / 0 / 0                               | Start no teacher, optimizer, or match               |
| Live weight / stable high-dan                  | Unchanged / not established                 | Generate no playing-strength claim                  |
| Implementation / validation / review           | `PENDING`                                   | Do not write PASS before completion                 |
| PR / CI / merge                                | `PENDING` / `PENDING` / `PENDING`           | Infer no URL or check result                        |

This PR closes only one gap: whether the three gate contracts can be composed deterministically under one fixed fixture family and one test-only ownership policy. Production readiness, actual connector success, teacher throughput, training, and playing strength remain separate execution evidence.

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

The planned operator entry is:

```text
public API exact export name = PENDING
public API arguments         = 0
CLI                          = npm run shogi:floodgate-v7-offline-connector-gates
CLI positional arguments    = 0
CLI environment authority   = none
```

The exact export name remains `PENDING` until implementation fixes it, but the API contract is zero-argument. The caller cannot supply a gate, path, home, record, key ID, key bytes, rows, checkpoint root, clock, random source, filesystem facade, network client, child-process launcher, or production capability. The CLI rejects extra arguments and runs only the internal fixed three-gate suite.

Prohibited routes are:

- do not call the production approved-record loader or preflight;
- do not call the deployment-key provisioner, inspector, readiness probe, or authority;
- do not call the production connector entry, real coordinator, stage authorizer, row consumer, or checkpoint sink;
- do not reach external state through `node:fs`, networking, or `child_process`;
- do not start teacher work, training, selection, matches, or weight activation through import side effects; and
- do not mix a caller-injected production facade into test-only success.

This boundary does not mean that the production-related module graph is absent. The runner's only executable named imports and calls from shared modules are a test-only factory and injected `CoreForTests` seams; it neither named-imports nor calls the production loader, production claim, or production connector entrypoint. Those shared modules also contain production wrappers and production dependency definitions, so their source is code-loaded and their transitive dependencies may include `node:fs`, `node:os`, `node:path`, and `node:child_process`. This article therefore does not claim zero production-module imports or a zero transitive filesystem / child-process import graph. Module-source loading is excluded from application-data I/O counts, while tests separately establish that code-load side effects start neither a production entrypoint nor external-state access.

Section 8 remains `PENDING` until source, dependency-table inspection, and tests establish these prohibitions.

## 4. Fixed synthetic fixtures

Fixtures consist only of module-owned fixed in-memory data. No public factory lets the caller select gate values, and every dependency passed to the test-only core is fresh, frozen, and exact-shaped.

| Fixture field                | Fixed rule                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution boundary           | `test-only-fixed-in-memory-no-production-capability-composition`                                                                                    |
| Gate order                   | 100, 500, 24,000                                                                                                                                    |
| Composition count            | Exactly one per gate                                                                                                                                |
| Approved-enrollment origin   | Test-only; mint no production claim origin                                                                                                          |
| Readiness                    | Fixed synthetic `ready` metadata; probe no actual home                                                                                              |
| Coordinator / stage / key    | Test-only single-use capability; register in no production registry                                                                                 |
| Training rows                | One fixed synthetic row; it contains SFEN / move internally but exposes neither through the public projection and contains no label or real dataset |
| Checkpoint / postflight      | In-memory receipt owner; use no file, directory, or fsync                                                                                           |
| Time / randomness            | Use no dynamic timestamp or random ID                                                                                                               |
| Paths / secrets / byte views | Include none in public fixture, receipt, or error fields                                                                                            |

Unknown keys, symbol keys, accessors, Proxies, sparse arrays, strings containing NUL, unsafe integers, and wrong origins fail closed. The planned receipt field `dynamic_identifiers_are_synthetic: true` applies only to the fixed test constants `run_id`, `key_instance_id`, and `approval_id`. The `key_id` is a shared public contract identifier, not a synthetic dynamic ID, but it is not itself production authority or a capability.

## 5. The 100 → 500 → 24,000 gate matrix

The three fixtures represent cumulative contracts over one logical stream. They do not mean generating 24,600 independent records.

| Gate contract        | Before |  Added |  After | Sealed | Synthetic composition target | Production execution |
| -------------------- | -----: | -----: | -----: | :----: | ---------------------------: | -------------------: |
| `durable-prefix-100` |      0 |    100 |    100 | false  |                            1 |                    0 |
| `durable-prefix-500` |    100 |    400 |    500 | false  |                            1 |                    0 |
| `sealed-final-24000` |    500 | 23,500 | 24,000 |  true  |                            1 |                    0 |

Each case exactly compares its target, completed-record count, resume boundary, sealed flag, gate-specific byte ceiling, and checkpoint status. Final byte ceilings and receipt constants remain `PENDING` until implementation source and tests fix them; this draft does not invent values. Success in one case does not imply success in another. All three are checked separately before producing the ordered aggregate.

## 6. Capability, sequence, and cleanup

The planned sequence for one gate is:

1. Capture the fixed fixture with exact shape.
2. Mint one test-only approved-enrollment capability.
3. Claim it exactly once through the test-only claim API; never use the production claim API.
4. Obtain synthetic readiness, coordinator, stage, key, input, checkpoint, and postflight owners.
5. Compose the connector's injected `CoreForTests` exactly once.
6. Validate the gate receipt, ownership transitions, and public projection.
7. On success and failure, revoke unclaimed capabilities and drive the lease, key, and coordinator to terminal states.
8. Validate resource counts and cleanup results before moving to the next gate.

Every capability requires exact object identity, test-only origin, and single use. Clones, same-shaped objects, wrong-origin capabilities, and consumed capabilities are rejected. A failed invocation cannot reuse its capability and needs a fresh fixture invocation.

Cleanup starts and settles every terminal action separately from the primary failure. Public failure exposes no raw cause, path, row, key, MAC, or capability. The intended bounded projection contains only a cleanup-failure count and fixed retry disposition; implementation and fault-injection coverage remain `PENDING`.

## 7. Deterministic JSON

The successful target schema uses these exact public values:

```text
schema             = shogi-floodgate-v7-offline-connector-gate-contract-composition-v1
status             = complete-fixed-in-memory-three-gate-test-only-contract-composition
execution_boundary = test-only-fixed-in-memory-no-production-capability-composition
encoding           = UTF-8
records            = exact 1 pretty-printed JSON document + final LF
```

`status = complete...` means only that the fixed in-memory three-gate composition completed inside that CLI invocation. It does not mean completion of a production connector, actual checkpoint, training, or playing strength. At the current pre-implementation point, evidence of emitting this status is itself `PENDING`.

JSON field order, gate order, booleans, safe integers, lowercase hexadecimal strings, and string ceilings are fixed. It includes no timestamp, hostname, absolute path, random ID, process ID, descriptor, function, Buffer / `Uint8Array`, row, SFEN, move, label, key material, MAC, or raw error. Canonical bytes must be repeatable for the same fixture and implementation revision. Stdout is one JSON document pretty-printed with two-space indentation and a final LF, not one-line JSONL. Stderr is only a fixed sanitized failure. A stdout write or close failure cannot return success.

The planned top-level projection is `schema`, `status`, `execution_boundary`, ordered `gate_compositions`, and aggregate `nonclaims`. The final exact key set, field order, canonical sample bytes, and digest remain `PENDING` until implementation tests fix them.

## 8. Validation, review, and intermediate attempts

Implementation is incomplete, so none of these values is predeclared as passing.

| Evidence                                 | Status    | Measured value                                          |
| ---------------------------------------- | --------- | ------------------------------------------------------- |
| Focused contract / CLI tests             | `PENDING` | `PENDING`                                               |
| 100 / 500 / 24,000 composition cases     | `PENDING` | `PENDING`                                               |
| Failure / cleanup / poison tests         | `PENDING` | Add a resource-acquired checkpoint-failure cleanup test |
| Connector-related regression             | `PENDING` | `PENDING`                                               |
| Full Vitest                              | `PENDING` | `PENDING`                                               |
| Python stdlib                            | `PENDING` | `PENDING`                                               |
| TypeScript                               | `PENDING` | `PENDING`                                               |
| Scoped / full lint, Prettier, diff check | `PENDING` | `PENDING`                                               |
| Production build / npm audit             | `PENDING` | `PENDING`                                               |
| Independent code / test review P0/P1/P2  | `PENDING` | `PENDING`                                               |
| Ready-PR review / required CI / merge    | `PENDING` | `PENDING`                                               |

If an intermediate attempt fails, preserve its runtime, revision, worker count, file / test counts, duration, wall time, maximum RSS, and failure phase. An isolated rerun that passes does not convert the whole run into a pass; record a later authoritative full run separately. Do not call the cause `resource contention`, `flaky`, or `unrelated` until evidence establishes it. Every numeric result remains `PENDING` until measured.

## 9. Explicit nonclaims and unchanged live state

- production approved-record load / claim: **0 / 0**;
- actual deployment-key open / key bytes read: **0 / 0 bytes**;
- real-dataset read / production training-row callback: **0 / 0**;
- fixed synthetic in-memory row callback: **one target per gate**;
- actual checkpoint write / fsync / seal: **0 / 0 / 0**;
- production connector 100 / 500 / 24,000 gates: **0 / 0 / 0**;
- network request / child process / teacher label: **0 / 0 / 0**;
- training run / optimizer step / candidate weight: **0 / 0 / 0**;
- production-weight overwrite / live activation: **0 / unchanged**;
- match / Elo / rating / rank evidence: **0 / 0 / not established / not established**;
- stable high-dan strength: **not established**; and
- production readiness: **not established**.

The target of one synthetic fixture per gate is not a production-execution count. The offline CLI, unit tests, CI, merge, and application deployment open no actual key, record, dataset, or checkpoint and do not automatically start teacher work, training, matches, or weight activation.

## 10. Next safe step

1. Implement the exact export name, fixed dependency table, three fixtures, and deterministic projection.
2. Add unit tests for the gate matrix, origin and single use, resource-acquired checkpoint-failure cleanup, leak boundaries, and CLI argument / stream failures.
3. Measure focused, related, full, and static validation, replacing section 8's `PENDING` values only with exact results.
4. Run independent code and test review, fix findings, and obtain a final seal.
5. Open a ready PR and record review comments, required CI, and a regular merge separately.
6. Keep production execution at zero after merge.
7. Do not begin actual-record / key / dataset I/O or the 100-parent gate without separate explicit operational approval outside this offline PR.

The nearest safe endpoint is **reviewable evidence that all three fixed test-only compositions pass deterministically while production I/O remains zero**. That is not achievement of high-dan strength; it is the contract boundary before a real 100-parent gate.
