# Shogi AI: allowing 81Dojo calibration only after a public commitment

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

## A self-asserted timestamp is not preregistration proof

Merely writing “created at this time” into a candidate protocol would allow that timestamp to be backdated after seeing game results. The protocol therefore does not treat its own assembly time as proof of preregistration.

Before game 1, a separate data-only JSON containing the SHA-256 commitment of the protocol core must be merged to public `main`. The core includes the candidate, runtime, internal-gate receipts, account, time control, pairing, and decision rule. The final protocol binds the public file's path, byte length, SHA-256, `main` revision and tree, and merge time. The offline verifier checks their structural and digest consistency; it does not independently prove that the remote GitHub merge occurred. A person or independent process must verify the public commit before game 1. No candidate exists yet, so there is currently no such publication.

## Keeping all 200 games without selective replacement

The new verifier is offline-only. Authoritative data is no longer one directly appended JSONL file. It is one read-only file per game inside a private directory; JSONL is only a derived view for verification and the final receipt. Each manually observed official-client game records:

- the official-side game ID, time, color, and a hash of the opponent's public identity;
- before/after ratings and the account's rated-game counts;
- the official game-record artifact and every move;
- the fixed candidate runtime's trace artifact and per-search receipts; and
- whether the game counted as rated and whether a technical fault occurred.

The candidate trace binds the protocol SHA-256, candidate, runtime and hardware, server game ID, official record artifact, and normalized-move digest. Even an identical move list cannot be reused across another candidate, protocol, game, or server record.

Before writing anything for a new game, the verifier joins the existing prefix and candidate row and runs every cross-entry invariant. A repeated game ID, rating or rated-game-count discontinuity, non-increasing timestamp, or hash-chain mismatch fails before a temporary entry exists. Every entry names its predecessor's SHA-256, and filenames must be exactly 1 through 200 without gaps. Game 1 must be later than both the public `main` merge and final protocol assembly.

Publication then proceeds as a complete temporary file, file `fsync`, non-overwriting exclusive hard-link publication, and directory `fsync`. A crash during a partial temporary write cannot enter the authoritative prefix, so the derived view still returns the preceding complete state. Every existing ancestor of the ledger path is inspected with `lstat`; parent-directory symlinks are rejected along with a symlink leaf. The verifier stops on a platform without atomic no-follow support.

This does not claim a cryptographic attestation from the official server. It combines the public protocol-core commitment, manual-export identities, immutable local entries, and hash chain to materially reduce room for changing conditions or selecting results afterward.

## Separating the primary decision from auxiliary statistics

The primary decision passes only when all of the following hold:

1. Exactly 200 fixed-condition rated games are present.
2. There are no missing games, selected opponents, technical faults, or candidate-trace mismatches.
3. Every post-game rating from game 171 through game 200 is at least 2050.

On the checked date, 2050 is the published 81Dojo five-dan threshold. The 200-game total and the requirement that all final 30 post-game ratings remain above it are project-specific preregistered stability rules, not an official 81Dojo certification. A pass would mean only that the exact candidate maintained that threshold under the bound account, hardware, client, time control, and pairing protocol.

The receipt also reports an opponent-cluster bootstrap, so repeat games against one opponent are not treated as independent opponents. It uses seed `20260720`, 100,000 replicates, and a two-sided 95% interval. After review, each cluster's score total and game count are computed once instead of rescanning its games in every replicate. This statistic is report-only: it cannot override the primary decision or convert a score into a rank.

## Current state and execution gate

| State                                                   |   2026-07-20 |
| ------------------------------------------------------- | -----------: |
| Fixed policy                                            |     complete |
| Offline ledger and verifier                             |     complete |
| Focused fixtures                                        | 13 / 13 PASS |
| Article/evidence consistency tests                      |   4 / 4 PASS |
| Candidate selection and runtime binding                 |   incomplete |
| Internal formal A/B                                     |   incomplete |
| Official `COM_` account, client, and reference hardware |    not ready |
| User authorization for external execution               |       absent |
| Candidate-core public `main` commitment                 |            0 |
| 81Dojo external games                                   |      0 / 200 |
| Live-weight changes                                     |            0 |

External games must not begin before a candidate passes the internal gates. After selection, the account, official client, reference hardware, current-rules recheck, and explicit user authorization must be fixed in the protocol core. Its data-only commitment must then be merged to public `main` and independently checked before assembling the final protocol. A person can subsequently relay 200 games through the official client, and only the complete derived ledger can reach the final decision.

AWS, GCP, Firebase, and Vercel are not used for this calibration. Training and internal evaluation remain local; external calibration uses the official 81Dojo client plus a local ledger. Calibration execution performed zero cloud operations, credential reads, external writes, and live deployments. After ready PR #567 was pushed, the repository's existing GitHub integration automatically triggered one normal Vercel preview build. That is delivery CI for the web change—not training, a game, or calibration execution—and it received no game data or credentials.

The exact values and unresolved gates are recorded in the [machine-readable evidence](./data/shogi-external-81dojo-calibration-readiness-2026-07-20.json).
