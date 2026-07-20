# Shogi AI Strengthening: Post-Selection Execution Is Now Real-Data Ready

Updated: 2026-07-20

## Conclusion

This change alone has not made the AI stronger, and it has not changed the production weights.

It completes the executable path needed immediately after the three-seed retraining selects a candidate. Previously this area was mostly a contract. It can now:

1. authenticate the enrolled selection receipt, recompute its gates, preflight hash, ranking, representative median, and family gate, bind teacher identity/completion to the fixed registry, and then issue one single-use candidate authorization;
2. reproduce production int16 weights from checkpoints and require byte-for-byte equality;
3. evaluate fresh and legacy final holdouts plus general and opening retention with real models;
4. measure the known `P*8f` regression from an exact legal-child fixture through the production-family WASM module; and
5. expose opt-in Worker diagnostics for a later real-browser parity harness without changing ordinary play.

Real browser/Worker parity, formal A/B, and external strength calibration have not run. Formal A/B readiness therefore remains explicitly `false`.

## What was implemented

| Path                    | Result in this change                                                                                                                                                      | Why it matters for strength                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| candidate authorization | recomputes the three runs' gates, preflight hash, ranking/representative median, and family gate, then binds teacher identity/completion before issuing a single-use token | prevents evaluating the wrong checkpoint                         |
| checkpoint → int16      | reproduces the candidate epoch-20 and stable epoch-27 production format and requires exact 1,185,988-byte outputs                                                          | proves training and play use the same weights                    |
| final holdout           | reuses the strict sibling loader and production int16 forward path                                                                                                         | compares unseen pair/top-1 behavior with the same implementation |
| retention               | fail-closed loader for the real legacy general/opening JSONL format                                                                                                        | detects broad and decisive-position regressions                  |
| known regression        | derives every child from the parent and move, then measures static rank and search with WASM NNUE                                                                          | blocks recurrence of the observed `P*8f` failure                 |
| Worker diagnostics      | reports loaded-weight, embedded-WASM, and last search/evaluation-path identity only when explicitly requested                                                              | enables later proof that the browser really used NNUE/WASM       |

## Important findings

### 1. Retention data was not in sibling format

The real general/opening retention files use the historical teacher-generator shape:

```text
{sfen, cp, ply, bestmove, depth}
```

Only mate-score rows add `mate`. Passing these files to the strict sibling loader rejects valid real data. This change adds a dedicated legacy-generator loader.

It stops on any duplicate JSON key, blank line, CRLF, invalid UTF-8, extra or missing field, integer disguised as a boolean or float, SFEN/ply mismatch, invalid USI move, inconsistent mate/cp mapping, or duplicate position. It never skips malformed rows and continues with a favorable subset.

### 2. The reported “46 moves” and the rules-complete “48 moves” are both correct

The production search-optimized generator lists 46 moves in the known position. The rules-complete generator lists 48.

The difference is two legal non-promotion branches intentionally restored by the rules contract:

- `2b7g`
- `8e8g`

The fixture now takes the safer rules-complete path: all 48 moves in USI byte order. Each child SFEN is re-derived from the parent SFEN and move inside the same TypeScript boundary. A missing, additional, duplicate, reordered, or substituted child is rejected.

### 3. A local WASM result is not browser evidence

Running the same 35,597 embedded WASM bytes under Node does not prove that the deployed page used its Worker path.

The local runner therefore reports only `complete-local-wasm-module-probes`. It does not contain a browser/Worker parity pass and cannot open formal A/B readiness. A later Playwright harness must separately collect the opt-in diagnostics and verify:

- fetched weight byte count and SHA-256;
- NNUE loaded and enabled state;
- embedded WASM byte count and SHA-256; and
- last search path `wasm` with evaluation path `nnue-wasm`.

The client rejects contradictory fetch-status, weight-identity, loaded, and enabled fields fail-closed. If SHA-256 collection fails transiently, only that failed promise is discarded so a later explicit diagnostics request can retry. Ordinary best-move requests never trigger the retry and retain their existing response shape.

### 4. A caller-authored authorization path was closed

Review found that an earlier API could accept a caller-authored registry and receipt together. A caller could make their internal hashes agree and mint a branded authorization.

The production entry now takes no caller inputs. It reads the fixed tracked registry and proceeds only when that registry is itself code-pinned by byte count, SHA-256, and schema. The checked-in registry is still all-null and has no ready pin, so production authorization is currently impossible.

Dependency injection remains only in a private test helper. A synthetic test registry cannot mint production authority.

## Focused validation

| Target                                                     | Result         |
| ---------------------------------------------------------- | -------------- |
| downstream registry / authorization / receipt gates        | 49 / 49 passed |
| checkpoint export adapter                                  | 6 / 6 passed   |
| Torch metric / legacy retention adapter                    | 3 / 3 passed   |
| exact fixture / local WASM probe                           | 12 / 12 passed |
| Worker client / NNUE / ponder / diagnostics                | 32 / 32 passed |
| Python compile, Ruff, diff check, and TypeScript typecheck | passed         |

The heavy real-WASM fixed-depth suite and full repository suites are left to remote PR CI so they do not compete with the formal teacher generation currently using the machine.

## Not yet achieved

- a newly selected candidate;
- any final-holdout label read;
- candidate-versus-stable real measurements;
- a candidate `P*8f` probe result;
- real browser/Worker parity;
- formal paired A/B;
- external rating calibration;
- proof of high-dan or stable high-dan strength;
- any production weight update.

No AWS, GCP, Vercel, Firebase, or other cloud service is used by this path. Its boundary is local-only, network false, and live-weight-write false.

## Next execution order

1. Finish the formal teacher generation.
2. Retrain warm seeds 42, 43, and 44.
3. Select the representative candidate using only the preregistered rule.
4. Enroll the receipt and exact input identities, then code-pin the registry identity.
5. Run the export, final, retention, and local WASM adapters implemented here on real data.
6. Add the trusted evidence publisher and real Playwright browser/Worker parity harness.
7. Admit only an all-pass candidate to formal paired A/B.
8. After external calibration also passes, change production weights in a separate PR.

This is not an indefinite safety detour. It is the shortest executable path for rejecting a weak retrained candidate quickly or admitting a valid one to formal games as soon as retraining finishes.
