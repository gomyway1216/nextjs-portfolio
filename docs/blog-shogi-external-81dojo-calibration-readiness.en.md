# Shogi AI: preregistering 81Dojo external calibration before execution

> As of 2026-07-20, the measured result is **zero external games, no selected candidate, and no execution authorization**. This change does not train or directly strengthen the AI. It only prepares a fixed test for whether a future selected candidate can stably maintain the 81Dojo five-dan rating region. [Japanese version](./blog-shogi-external-81dojo-calibration-readiness.md)

## This is measurement, not strength work

Teacher generation, retraining, candidate selection, and formal A/B are the path that creates and selects a stronger engine. 81Dojo calibration is a final bridge from a candidate that passes those gates to a known human rating pool. It cannot replace training, and this readiness work is not a reason to pause local training.

The bridge is needed because an internal engine-versus-engine win rate and a human rank are different scales. A formal A/B can establish improvement over the current engine without establishing a human rank. Conversely, starting external games before selecting the candidate, or changing the time control or opponents after seeing results, would make the external measurement unreliable too.

## Conditions fixed before game 1

| Item               | Fixed value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Venue              | 81Dojo through the official client only                                                                    |
| Account            | established rated account with the required `COM_` prefix                                                  |
| Games              | 200 rated hirate games at 10 minutes + 30 seconds                                                          |
| Pairing            | official auto-match with no selected opponents                                                             |
| Relay              | manual operation of the official client                                                                    |
| Forbidden          | server API access, external server/UI automation, credential capture                                       |
| Candidate runtime  | production Worker / WASM / NNUE, master, 5 seconds per move, depth 32, quiescence 12, opening book enabled |
| Candidate identity | repository, weights, Worker, WASM, book, hardware, and client fixed before game 1                          |

The [81Dojo terms](https://81dojo.com/jp/terms.html) address software play under a `COM_` identity while prohibiting server access by external tools or scripts. The repository therefore contains no 81Dojo connection, browser controller, or official-client automation. On 2026-07-20, the project also rechecked the official [rank table](https://system.81dojo.com/pages/ranks), [rating-threshold announcement](https://81dojo.com/announcements/260411.html), [time-control coefficient announcement](https://81dojo.com/announcements/260517.html), and [rating-system description](https://81dojo.com/documents/Rating_System).

## Keeping all 200 games without selective replacement

The new verifier is offline-only. For each game manually observed through the official client, it appends one row to a local JSONL ledger containing:

- the official-side game ID, time, color, and a hash of the opponent's public identity;
- before/after ratings and the account's rated-game counts;
- the official game-record artifact and every move;
- the fixed candidate runtime's trace artifact and per-search receipts; and
- whether the game counted as rated and whether a technical fault occurred.

Every row names the SHA-256 of its predecessor, and the sequence must be exactly 1 through 200. The verifier also checks uniqueness and continuity across game IDs, timestamps, ratings, and rated-game counts. Every candidate move in the runtime trace must match the same ply and USI move in the observed game record. Deleting, reordering, or rewriting a previously published prefix fails.

This does not claim a cryptographic attestation from the official server. It fixes manual-export identities and a local hash chain so that the project has materially less room to select or replace results.

## Separating the primary decision from auxiliary statistics

The primary decision passes only when all of the following hold:

1. Exactly 200 fixed-condition rated games are present.
2. There are no missing games, selected opponents, technical faults, or candidate-trace mismatches.
3. Every post-game rating from game 171 through game 200 is at least 2050.

On the checked date, 2050 is the published 81Dojo five-dan threshold. The 200-game total and the requirement that all final 30 post-game ratings remain above it are project-specific preregistered stability rules, not an official 81Dojo certification. A pass would mean only that the exact candidate maintained that threshold under the bound account, hardware, client, time control, and pairing protocol.

The receipt also reports an opponent-cluster bootstrap, so repeat games against one opponent are not treated as independent opponents. It uses seed `20260720`, 100,000 replicates, and a two-sided 95% interval. This statistic is report-only: it cannot override the primary decision or convert a score into a rank.

## Current state and execution gate

| State                                                   | 2026-07-20 |
| ------------------------------------------------------- | ---------: |
| Fixed policy                                            |   complete |
| Offline ledger and verifier                             |   complete |
| Focused fixtures                                        | 8 / 8 PASS |
| Article/evidence consistency tests                      | 4 / 4 PASS |
| Candidate selection and runtime binding                 | incomplete |
| Internal formal A/B                                     | incomplete |
| Official `COM_` account, client, and reference hardware |  not ready |
| User authorization for external execution               |     absent |
| 81Dojo external games                                   |    0 / 200 |
| Live-weight changes                                     |          0 |

External games must not begin before a candidate passes the internal gates. After selection, the account, official client, reference hardware, current-rules recheck, and explicit user authorization still have to be bound into one protocol receipt before game 1. A person can then relay 200 games through the official client, and only the complete ledger can reach the final decision.

AWS, GCP, Firebase, and Vercel are not used for this calibration. Training and internal evaluation remain local; external calibration uses the official 81Dojo client plus a local ledger. Calibration execution performed zero cloud operations, credential reads, external writes, and live deployments. After ready PR #567 was pushed, the repository's existing GitHub integration automatically triggered one normal Vercel preview build. That is delivery CI for the web change—not training, a game, or calibration execution—and it received no game data or credentials.

The exact values and unresolved gates are recorded in the [machine-readable evidence](./data/shogi-external-81dojo-calibration-readiness-2026-07-20.json).
