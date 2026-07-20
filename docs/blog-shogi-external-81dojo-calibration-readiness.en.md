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

Before game 1, a separate data-only JSON containing the SHA-256 commitment of the protocol core must be merged to public `main`. The core includes the candidate, runtime, internal-gate receipts, account, time control, pairing, and decision rule. The final protocol binds the public file's path, bytes, SHA-256, merge commit, tree, blob, pull-request number, and GitHub server `merged_at`.

Technical commit `86b1d9e30dda4326bf67fbc1b82f8db23b94f6fb` no longer accepts a local `origin/main` label or a self-asserted time as preregistration proof. Its only network operation is a direct TLS GET to the fixed `api.github.com` host. It verifies that the pull request was merged into this repository's `main`, the server merge time and merge commit, ancestry from the recorded and current `main` heads, the commit tree, and the publication path's blob identity and base64 bytes. The same revision, tree, blob, and bytes must match exact local Git objects, and terminal receipt issuance repeats the live GitHub check. This is public read-only traffic with no token, credential, or GitHub write. No candidate exists yet, so there is currently no such publication.

## Keeping all 200 games without selective replacement

81Dojo game recording remains local-only. Authoritative data is no longer one directly appended JSONL file. It is one read-only file per game inside a private directory. JSONL is only a diagnostic derived view and cannot issue a terminal receipt. The final decision reads every entry under the authoritative-directory lock and proceeds only after building a manifest that binds each file identity. Each manually observed official-client game records:

- the official-side game ID, time, color, and a hash of the opponent's public identity;
- before/after ratings and the account's rated-game counts;
- the official game-record artifact and every move;
- the fixed candidate runtime's trace artifact and per-search receipts; and
- whether the game counted as rated and whether a technical fault occurred.

The candidate trace repeats the protocol SHA-256, candidate, runtime and hardware, server game ID, official record artifact, and normalized-move digest inside the outer trace, nested runtime receipt, and every decision receipt's canonical bytes. Each receipt has a domain-separated digest and exact artifact identity, so relabeling only the outer wrapper cannot reuse it for another candidate, protocol, game, or server record.

Before writing anything for a new game, the verifier joins the existing prefix and candidate row and runs every cross-entry invariant. A repeated game ID, rating or rated-game-count discontinuity, non-increasing timestamp, or hash-chain mismatch fails before a temporary entry exists. Every entry names its predecessor's SHA-256, and filenames must be exactly 1 through 200 without gaps. Game 1 must be later than both the GitHub-server-recorded public `main` merge and final protocol assembly. Normal appends and derived-view reads stay local and consume no GitHub API rate limit.

The ledger path is opened one component at a time from the filesystem root with `dir_fd` and `O_NOFOLLOW`; creation, reads, and postflight checks remain anchored to held descriptors. This prevents an ancestor replacement or intermediate symlink from redirecting the operation, and the verifier stops on a platform without atomic descriptor-relative primitives. During first-time namespace creation it `fsync`s the parent directory, lock file, ledger root, and entries directory in the required order before entry publication can begin.

Entry publication then proceeds as a complete temporary file, file `fsync`, non-overwriting exclusive hard-link publication, and entries-directory `fsync`. A partial temporary file cannot enter the authoritative prefix. An error at link, the first `fsync`, temporary unlink, or the final `fsync` is reconciled under the same lock to exactly one of `committed`, `not-committed-safe-to-retry`, or `indeterminate-stop-and-inspect`. Repeating the same observation after a committed result returns the existing commit idempotently instead of creating another game.

This does not claim a cryptographic attestation from the official server. It combines the public protocol-core commitment, manual-export identities, immutable local entries, and hash chain to materially reduce room for changing conditions or selecting results afterward.

## Separating the primary decision from auxiliary statistics

The primary decision passes only when all of the following hold:

1. Exactly 200 fixed-condition rated games are present.
2. There are no missing games, selected opponents, technical faults, or candidate-trace mismatches.
3. Every post-game rating from game 171 through game 200 is at least 2050.

On the checked date, 2050 is the published 81Dojo five-dan threshold. The 200-game total and the requirement that all final 30 post-game ratings remain above it are project-specific preregistered stability rules, not an official 81Dojo certification. A pass would mean only that the exact candidate maintained that threshold under the bound account, hardware, client, time control, and pairing protocol.

The receipt also reports an opponent-cluster bootstrap, so repeat games against one opponent are not treated as independent opponents. It uses seed `20260720`, 100,000 replicates, and a two-sided 95% interval. After review, each cluster's score total and game count are computed once instead of rescanning its games in every replicate. This statistic is report-only: it cannot override the primary decision or convert a score into a rank.

## Current state and execution gate

| State                                                   |                                      2026-07-20 |
| ------------------------------------------------------- | ----------------------------------------------: |
| Fixed policy                                            |                                        complete |
| Local ledger and public-commit verifier                 |                                        complete |
| Focused Python fixtures                                 |                  23 / 23 PASS in 30.417 seconds |
| Independent bounded rereview                            | 9 / 9 PASS in 15.386 seconds; P0/P1/P2 all zero |
| Candidate selection and runtime binding                 |                                      incomplete |
| Internal formal A/B                                     |                                      incomplete |
| Official `COM_` account, client, and reference hardware |                                       not ready |
| User authorization for external execution               |                                          absent |
| Candidate-core public `main` commitment                 |                                               0 |
| 81Dojo external games                                   |                                         0 / 200 |
| Live-weight changes                                     |                                               0 |

External games must not begin before a candidate passes the internal gates. After selection, the account, official client, reference hardware, current-rules recheck, and explicit user authorization must be fixed in the protocol core. Its data-only commitment must then be merged to public `main`, and the GitHub-server pull request, commit, and objects must pass verification before assembling the final protocol. A person can subsequently relay 200 games through the official client into the local authoritative ledger. A final decision can be issued only when both the complete immutable-entry manifest and the live GitHub recheck pass.

AWS, GCP, Firebase, and Vercel are not used to compute, store, or execute this calibration. Training and internal evaluation remain local, external games use the official 81Dojo client, and ledger appends remain local. The sole network exception is a public read-only GitHub API TLS GET during preregistration assembly and terminal receipt issuance. It sends no authentication token or credential, performs no external write, and sends no game data. Live-weight changes remain zero. The Vercel preview triggered by the repository's existing GitHub integration after ready PR #567 was pushed is delivery CI—not training, a game, or calibration computation.

The exact values and unresolved gates are recorded in the [machine-readable evidence](./data/shogi-external-81dojo-calibration-readiness-2026-07-20.json).
