# Keeping fresh Floodgate QAT selection closed until all three runs are complete

> As of 2026-07-17, real teacher generation, three-seed fresh QAT training, and candidate selection have not started. This change adds a fresh-only preflight that makes the future selection reader unreachable until all three `result.json` and `final.pt` artifacts have passed exact identity and content validation. Every bytes and SHA-256 field in the tracked registry remains `null`. The final holdout, production state, and live weights are unchanged. [日本語版](./blog-shogi-floodgate-fresh-qat-selection-preflight.md)

## Why this is separate from the WCSC36 audit

The failed WCSC36 QAT run is deliberately sealed to its historical plan, result, checkpoint, and selection-audit schemas. Extending that audit to understand a fresh experiment would also change how old artifacts are interpreted.

The fresh path therefore has distinct schemas:

| Artifact | Fresh-only schema |
| --- | --- |
| training contract | `shogi-floodgate-fresh-qat-training-experiment-v1` |
| result | `shogi-floodgate-fresh-qat-training-result-v1` |
| final checkpoint | `shogi-floodgate-fresh-qat-final-checkpoint-v1` |
| selection registry | `shogi-floodgate-fresh-qat-selection-preflight-registry-v1` |
| preflight receipt | `shogi-floodgate-fresh-qat-selection-preflight-v1` |

Training emits artifact schemas only after the verified binding contains either the exact historical plan/contract pair or the exact fresh plan/contract pair. A hybrid pair is rejected. The historical `qat_protocol.py`, `qat_selection_audit.py`, and WCSC36 artifacts are unchanged, and a training integration test still checks their original output schemas.

## Binding replay isolation to content, not names

The earlier fresh plan named the replay-exclusion components `legacy`, `fresh_final_holdout`, and `fresh_selection`, but names alone do not prove their membership. One missing position, one extra position, a same-count substitution, or membership shared by two components could leak a selection or final position into replay training.

The new contract fixes the format, byte length, file SHA-256, count, and canonical identifier-set SHA-256 of each component:

1. the historical WCSC36 replay exclusion;
2. fresh final-holdout protected position IDs; and
3. fresh selection protected position IDs.

Each file accepts only ASCII `sha256:` followed by 64 lowercase hex digits, bytewise sorted and unique, with no CR and exactly one final LF. The identifier-set digest matches production: sorted IDs joined by LF and hashed **without a trailing LF**. The three sets must be pairwise disjoint, and the real replay-exclusion file must be their exact union. Failure messages expose counts only, never protected semantic position IDs.

The legacy component is an existing generated artifact. It is verified against its exact bytes and digests but is intentionally not passed to the Git tracking verifier because being untracked is its valid state. The fresh plan, fresh identities, and union remain fully verified.

## The fixed order before a selection read

The fresh registry lives at
[`floodgate-q1-2026-fresh-qat-selection-preflight-registry.json`](../ml/protocols/floodgate-q1-2026-fresh-qat-selection-preflight-registry.json)
and is currently closed:

| Field | Current value |
| --- | --- |
| status | `awaiting-exact-fresh-plan-and-three-final-run-identities` |
| execution-plan bytes / SHA-256 | `null` / `null` |
| seed 42 result / checkpoint identity | `null` / `null` |
| seed 43 result / checkpoint identity | `null` / `null` |
| seed 44 result / checkpoint identity | `null` / `null` |
| selection preflight ready | `false` |

In this state, verification stops immediately after validating the selection registry. It does not read the training registry, plan, result, checkpoint, Torch, or any label source. A future reviewed data-only registry opening still follows this order:

```text
closed selection registry
  -> STOP

ready selection registry
  -> exact training registry + plan
  -> capture the exact bytes of all 3 results + all 3 checkpoints
  -> strict-parse and validate all 3 captured result byte strings
  -> Torch strict-load all 3 captured checkpoint byte strings and every model
  -> recheck registry, plan, and all 6 artifacts
  -> issue an opaque one-shot receipt
  -> allow one selection-reader call
```

The public preflight API accepts only the exact audit revision. Callers cannot replace its checkpoint loader or model validator; it always uses the fixed Torch loader and strict `DistillNet` validator. Injectable callbacks exist only on the private synthetic-test helper.

Checkpoints are not reopened by path after hashing. The preflight first retains all three immutable byte strings that match the registered identities, then passes those same bytes to Torch through `BytesIO`. A temporary path swap followed by restoration therefore cannot change what is strict-loaded. Results are likewise parsed only from their captured bytes.

The receipt has no writable state fields and no `__dict__`. Its unused state lives in a module-private weak map and is atomically removed when the reader claims it. Forged objects, field writes, a second reader call, and reading a consumed receipt are rejected. Even a valid receipt states that the final holdout was not opened and that production promotion is false.

## Synthetic validation and fixes

Temporary synthetic artifacts verify that:

- a closed registry never reaches artifact readers, Torch, or model validation;
- one absent checkpoint prevents even the first checkpoint load;
- selection cannot run before all three checkpoint and model strict-loads finish;
- old WCSC36 and hybrid schemas, bool-as-integer values, and malformed results fail;
- wrong seed, output, plan, pipeline, contract, runtime, history, or model fails;
- any cross-run pipeline or runtime difference, including MPS/CUDA flags, fails;
- duplicate JSON keys, mid-verification changes, and missing or extra artifacts fail;
- a temporary result or checkpoint path swap cannot replace captured parse/load bytes;
- union omissions, additions, same-count swaps, duplicate or overlapping components, and noncanonical IDs fail;
- protected IDs never appear in error messages;
- the public API cannot replace the loader or validator;
- opaque receipt mutation, forgery, and replay fail; and
- historical training still emits historical schemas while a fresh binding emits fresh schemas.

| Suite | Result |
| --- | ---: |
| focused fresh stdlib tests | 26 passed |
| complete Python stdlib ML suite | 84 passed |
| complete Torch ML suite | 73 passed |
| legacy/fresh emitted-schema integration | 1 passed (one synthetic run each) |
| related TypeScript tests | 5 passed |
| `py_compile`, Ruff, Black, and diff check | passed |

The exact validation record and scope boundary are in
[`floodgate-fresh-qat-selection-preflight-2026-07-17.json`](./data/floodgate-fresh-qat-selection-preflight-2026-07-17.json).

## Playing strength remains unchanged

- real teacher or partition generation: incomplete;
- exact fresh execution plan: absent;
- three-seed QAT training: zero runs;
- fresh selection reads: zero;
- final-holdout reads: zero;
- preregistered paired A/B: zero games;
- external high-dan calibration: zero games;
- live-weight writes: zero; and
- playing-strength evidence: none.

After the teacher and three role bundles are complete, a data-only PR can register the exact replay-component identities and execution plan. Both training and selection registries remain closed until that review passes. Once all three final artifacts exist, this preflight permits one fresh-selection read; the selected candidate must still pass the sealed final holdout, known regressions, quantized search/browser validation, preregistered paired A/B, and external calibration in order.
