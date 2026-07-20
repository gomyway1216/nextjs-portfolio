# Shogi evaluation: connecting formal A/B v2 to real dual-WASM matches

> As of 2026-07-20, the production formal A/B result is still **0 / 768 games**, and live weights are unchanged. This change is executable match code rather than another STOP document: once a reviewed candidate is enrolled, it can load candidate and stable weights into separate real browser/WASM engines and run 384 same-opening, color-swapped pairs locally. Japanese version: [blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.md](./blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.md)

## Conclusion

Formal A/B v2 already had its statistical decoder, opening schedule, durable journal, and ready-registry validation. It did not have an implementation that loaded an arbitrary candidate int16 weight and the current stable weight into two real engines and played the registered games.

This change adds that missing path:

1. authenticate the exact candidate and stable weight files;
2. load each file into a production browser/WASM engine in its own Node child process;
3. play the same opening once with candidate as sente and once as gote;
4. close and reap both engines, then reauthenticate both weight files; and
5. publish only a fully completed pair to the existing formal v2 journal and decoder.

No code-pinned ready registry is enrolled yet, so no real candidate is enrolled and no production formal run has started. This change alone is not a strength claim.

## What one pair actually executes

| Item         | Fixed contract                                                                               |
| ------------ | -------------------------------------------------------------------------------------------- |
| engine       | production browser/WASM V20                                                                  |
| weights      | candidate and stable are distinct paths and SHA-256 identities, each exactly 1,185,988 bytes |
| process      | candidate and stable are isolated in separate processes                                      |
| NNUE         | `K = 600`                                                                                    |
| search       | fixed depth 11, quiescence depth 10                                                          |
| cache        | clear the private TT before every decision                                                   |
| forbidden    | book, fallback, shared engine state, network, cloud, and live-weight writes                  |
| schedule     | one candidate-sente game plus one candidate-gote game                                        |
| adjudication | no legal move, fourfold repetition, perpetual check, and a 512-ply cap                       |

The child does not trust only the identity captured by its parent. Each child independently rereads its weight file, verifies the exact byte count and SHA-256, and then copies it into its own WASM memory. Candidate and stable share no module globals, WASM memory, TT, or NNUE bytes.

For every decision, the browser-side complete legal-move vector must exactly match the child-side vector. A move outside that set, a search that does not complete depth 11, or a shallow result outside the permitted early winning-mate band withholds the pair receipt.

## Color swap and result direction

Every opening is used in this order:

1. game 0: candidate sente, stable gote;
2. game 1: stable sente, candidate gote.

Every outcome is converted to candidate-perspective `win / draw / loss`. Using the same opening with both colors reduces first-move and opening-specific bias within the pair. Game and opening IDs are rederived from the existing v2 domain-separated rules, so a different opening or color order cannot be substituted.

## Executing and resuming 384 pairs / 768 games

The upper launcher reuses the existing reviewed ready-registry validator, append-only hash-chain journal, game-receipt validator, and formal v2 decoder. It does not modify the historically published launcher file.

The new launcher accepts exactly 384 pairs / 768 games and at most two pair workers. Each pair uses two processes, so at most four engine processes run concurrently.

Each pair leaves private `0600` artifacts containing:

- `pair-started`;
- two `game-completed` events with transcript SHA-256 values;
- `pair-completed` with cleanup and pair-receipt SHA-256 values; and
- a canonical sidecar containing all moves, final SFEN, adjudication, and cleanup.

On resume, both the journal and sidecar reauthenticate the contiguous completed prefix, and completed pairs are never replayed. A crash after pair start is a terminal technical fault, preventing selective retries of an unfavorable result. Any drift in a sidecar, transcript, weight file, or enrolled registry artifact stops the run.

## What the tests actually establish

There are two distinct test layers:

- Executable-path tests create two distinct 1,185,988-byte files, really load them into two isolated child processes, search moves through the production browser/WASM engine, verify the color-swapped two-game receipt, and reap both processes. The canonical-stdin entry used by Python also runs through real processes.
- Full-accounting tests exercise all 384 pairs / 768 games, journals, sidecars, two-worker cap, completed-prefix resume, terminal crash, and artifact drift using fast injected receipts.

The second layer is not 768 games of real WASM strength computation. These tests therefore do not prove a formal A/B win or high-dan playing strength. The machine-readable boundary and validation results are fixed in the [real WASM match runtime evidence](./data/floodgate-formal-paired-ab-v2-real-wasm-match-runtime-2026-07-20.json).

## What is needed next

Opening the production path requires a separate review that enrolls the selected candidate weight, stable weight, 384 openings, and match binding as a ready registry and updates the existing launcher's code pin. After that, only `run_pinned_ready_wasm_pairs` can execute the code-pinned registry.

The remaining sequence is the formal 384-pair / 768-game run, retention and regression checks, external calibration, and rollback verification. Live weights remain unchanged until those results exist.
