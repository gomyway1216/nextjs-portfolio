# Shogi AI Strengthening: Measuring the Real Browser Worker/WASM/NNUE Path

Updated: 2026-07-20

Base revision: `0c0d9715`

## Conclusion

This change adds the harness needed to measure whether a post-selection candidate actually traverses the correct engine path in a real browser. It has not made the AI stronger, and it has not changed the production weights.

The existing local WASM probe proves that the same WASM module can run under Node. It does not prove that the web page starts its dedicated Worker, fetches the intended weights, enables NNUE, and returns a WASM search result. This change closes that measurement gap.

## What the harness measures

Diagnostics run only on a separate, unlinked route. That route returns 404 unless exactly one fixed query parameter is present.

The fixture is the initial bishop-handicap position with Gote, the handicap giver, to move. Focused tests prove that neither the compiled-in opening book nor the shipped external opening-book file has a move for it, so the request cannot pass by silently returning a `book` move.

The first remote E2E run also exposed a real timing distinction: if search is sent immediately after Worker construction, it can begin before the 1.18 MB weight fetch, SHA-256, and load complete, producing the designed temporary `v3-wasm` fallback. Ordinary play has a delay before its first search; the diagnostic harness did not. The corrected harness first waits for read-only startup diagnostics to confirm weight identity/load and WASM readiness, then searches and requires post-search `nnue-wasm`. It does not weaken the gate by accepting fallback; it defines the intended measurement start state.

The aggregate browser result contains only the following checks:

| Check | Pass condition |
| --- | --- |
| document boundary | COOP `same-origin` and COEP `require-corp` |
| parallel runtime | cross-origin isolated with SharedArrayBuffer |
| Worker | a real Worker response is received |
| move | legal in the fixed fixture |
| search path | `wasm` |
| evaluation path | `nnue-wasm` |
| candidate weights | fetched byte count and SHA-256 equal the input candidate |
| NNUE | loaded and enabled |
| runtime WASM | ready, with the production WASM byte count and SHA-256 |

The evidence does not publish the raw board, hand, SFEN, or returned move.

## How it avoids overwriting production

The runner authenticates the candidate as a read-only, repository-local input. It requires a relative path, schema, exactly 1,185,988 bytes, and SHA-256. It rejects repository escapes, symlinks, multiple hard links, and a file changed during the read. Production WASM must also match its fixed path, 35,597-byte size, and pinned SHA-256.

Only when the browser requests the fixed `/shogi-nnue-weights.bin` URL does the runner serve the authenticated candidate from memory. That is the runner's only intercepted URL. It never writes the checked-in `public/shogi-nnue-weights.bin`, and it authenticates both artifacts again after the measurement.

This lets a future selected candidate exercise the production URL contract before any deployment.

The standalone runner requires a server built from the target source to be listening on `127.0.0.1:3000` before it starts. The runner does not itself authenticate which commit produced that already-running server. Its aggregate result therefore always includes `served_app_build_identity_verified: false` and `standalone_result_is_formal_parity_evidence: false`; the standalone output is not formal parity evidence. GitHub CI binds checkout, build, and E2E within the same job, but a trusted evidence publisher is still required for a selected real candidate.

The network boundary treats only HTTP and a development WebSocket on the fixed host and port as local. The `localhost` alias, any other port, HTTPS, and every external origin remain rejected.

## No ordinary-game delivery regression

The first design considered reading the diagnostics query from `/games/shogi` itself. That could make the ordinary route dynamic and change its existing static delivery or cache behavior, so the design was revised.

The canonical game page is restored to its original implementation. It imports neither the harness nor `searchParams`. Diagnostics live at the separate `/games/shogi/engine-parity` route, which receives the same explicit COOP/COEP headers. The ordinary UI contains no link or diagnostics output.

## Validation in this change

Only light local validation ran so it would not contend with the active 13-engine teacher generation.

| Target | Result |
| --- | --- |
| exact query, ordinary-route isolation, out-of-book fixture | 3 / 3 passed |
| request authentication, loopback boundary, and negative observation contracts | 22 / 22 passed |
| machine-evidence and bilingual-article binding | 2 / 2 passed |
| TypeScript no-emit | passed |
| changed-file lint and diff check | passed |
| local production build | not run |
| local Playwright | not run |
| private candidate reads | 0 |
| real candidate browser measurements | 0 |

Remote CI will run the Playwright E2E with the currently shipped weights strictly as an E2E fixture. Those weights are not a newly selected candidate. A passing CI run therefore does not mean that real-candidate parity or strength improvement has been achieved.

## Still pending

- completion of the active teacher generation;
- fresh final holdout;
- three-seed retraining and formal candidate selection;
- this browser parity measurement with the selected real candidate;
- formal paired A/B;
- external strength calibration;
- proof of high-dan or stable high-dan strength; and
- any production weight change.

This harness does not replace retraining. Its purpose is to catch, immediately after a candidate exists, the failure mode where a model works under Node but the real site takes a different path, before that candidate consumes formal A/B games.
