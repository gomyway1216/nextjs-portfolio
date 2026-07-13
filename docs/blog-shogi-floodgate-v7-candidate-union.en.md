# Separating the v7 candidate union from label generation

> The fixed production USI runtime can now run a depth-16 / up-to-12-MultiPV proposal and independent one-move rescores. Proposal ranks alone can still omit the move actually played in a strong game or the stable evaluator's move. This PR adds a pure synchronous core that combines `up to 12 proposal moves + one played move + one stable move` into at most 14 candidates for one training parent. It is a test-only core for structural and semantic consistency; it authenticates none of its inputs and produces neither teacher scores nor labels. Japanese version: [blog-shogi-floodgate-v7-candidate-union.md](./blog-shogi-floodgate-v7-candidate-union.md)

---

## Boundary as of 2026-07-13

| Item                             | State in this PR | Meaning                                                         |
| -------------------------------- | ---------------- | --------------------------------------------------------------- |
| Candidate-union pure core        | Implementation   | Unions proposal / played / stable over the legal-move set       |
| Rules-complete legal derivation  | Inside the core  | Recomputes from SFEN instead of trusting caller count / moves   |
| Candidate bound                  | At most 14       | Unique union of MultiPV 12, played 1, and stable 1              |
| Independent rescore              | Not run          | Returns every candidate as `required-not-yet-run`               |
| Input authentication             | None             | A production-shaped plain object is not a production capability |
| Per-parent HMAC checkpoint       | Next P1          | No durable proposal / rescore / seal is created yet             |
| Real data / engine execution     | Untouched        | The core calls neither a real game record nor a real engine     |
| Selection / final holdout / play | Untouched        | Establishes no selection, sealed holdout, A/B result, or rank   |

## 1. Why the maximum is 14 moves

The production proposal returns `MultiPV = min(12, legalMoveCount)`. v7 always adds the strong-game played move and the stable-policy move to those root moves.

```text
candidate_set = unique(
  production_proposal[0..11]
  + strong_game_played_move
  + stable_policy_move
)
maximum_unique_candidates = 12 + 1 + 1 = 14
```

If played or stable is already in the proposal, it adds no duplicate. If played and stable are the same move, they remain one candidate. The bound of 14 is not a new configurable search width; it is a safety bound derived from the fixed proposal contract.

Proposal rank does not become final teacher rank at this stage. Proposal discovers candidates; a later stage searches every unique candidate independently with MultiPV 1 and `searchmoves` containing exactly one move.

## 2. The core rederives the legal-move set

The caller supplies the legal-move projection observed by a later production coordinator. The core does not accept that array as teacher truth: it parses the parent SFEN and reruns `rulesCompleteLegalMoves`.

| Checked value           | Core verification                                                 |
| ----------------------- | ----------------------------------------------------------------- |
| Parent SFEN             | Rederives canonical SFEN, move number, ply, and position ID       |
| Caller legal count      | Requires exact equality with the core-recomputed count            |
| Caller legal moves      | Checks set equality, then core-normalizes by UTF-8 byte order     |
| Played / stable move    | Requires both to belong to the recomputed legal-move set          |
| Proposal root moves     | Requires legal canonical USI, no duplicates, and contiguous ranks |
| Proposal legal evidence | Requires the caller-origin count to equal the core-derived count  |

This rederivation fails closed if a caller lies that there are 12 legal moves to alter MultiPV width, omits optional non-promotion, or injects an illegal played / stable move into the candidate set.

## 3. One-move and zero-move parents stay distinct

A position with exactly one legal move does not need a proposal-engine call. The core accepts only `runtime: null`, confirms that played and stable both equal the sole forced move, and returns a label-free skip receipt.

```text
legal moves = 1  -> the next-P1 authenticated runner skips proposal and records forced skip
legal moves = 0  -> fail closed as an invalid training parent
legal moves >= 2 -> require a production-shaped proposal and build the candidate union
```

The skip does not mean “adopt the forced move as a strong teacher label.” The sibling ranking loss needs at least two moves, so it records that this parent emitted no label.

Zero moves are not accepted as an ordinary training parent. Combining a terminal position, corrupt SFEN, or wrong-ply extraction into the same skip would hide a source error, so zero is an explicit failure.

## 4. UTF-8 bytewise deduplication and provenance

Candidates are ordered by ascending UTF-8 bytes of the USI move, independent of locale or proposal completion order. Map insertion order and engine MultiPV rank do not determine candidate execution order.

| Provenance field      | Condition that makes it true                                  |
| --------------------- | ------------------------------------------------------------- |
| `production_proposal` | The move appears in the input's fixed-runtime-shaped proposal |
| `strong_game_played`  | It is the input parent's played move                          |
| `stable_policy`       | It is the stable move stated by the input stable row          |

When one move has multiple sources, they merge into one record of boolean provenance. For example, if proposal rank 4 is both played and stable, there is one candidate with all three flags true.

Proposal rank remains evidence of the discovery path, not a score or final rank. A move added only by stable or played has `proposal_rank: null` and still requires the same independent rescore as every other candidate.

## 5. Rederiving child positions and digests

The core captures the parent, stable row, runtime receipt, and proposal result as exact-key plain data. For every candidate it applies the USI move to parent SFEN and rederives child SFEN and the semantic child-position ID.

| Digest                  | Domain-separated projection                                        |
| ----------------------- | ------------------------------------------------------------------ |
| Parent payload SHA-256  | Canonical parent identity and played move                          |
| Legal-moves SHA-256     | Core-rederived rules-complete move list                            |
| Runtime-receipt SHA-256 | Fixed engine / eval / option / search-contract projection          |
| Proposal-result SHA-256 | Depth, MultiPV, root moves, score metadata, and nodes projection   |
| Stable-row SHA-256      | Parent binding, stable move, rederived child, and stable search    |
| Candidate-union SHA-256 | The bindings, bytewise-unique candidates, provenance, and children |

JSON projections use `SHA-256(domain + NUL + canonical JSON)`; legal and proposal-root lists use `SHA-256(domain + NUL + LF-joined USI + terminal LF)`. Separate domains prevent a fragment moved to another artifact type from preserving its identity.

A digest is not authentication. An attacker without a secret key can recompute SHA-256 after modification. This PR detects internal inconsistency and mistaken joins, and fixes the semantic projection that the next HMAC checkpoint will use to close production origin and durable history.

## 6. What the pure core intentionally does not do

The only public surface is `buildFloodgateV7CandidateUnionCoreForTests`. Keeping it synchronous captures caller-owned values before control returns and rejects Proxies, accessors, sparse arrays, symbol keys, extra fields, and non-finite numbers.

A plain object remains forgeable. An object can carry a production contract name, correct engine ID, and correct binary digest without proving that the argumentless runtime issued it. The receipt states this unauthenticated boundary explicitly.

The core spawns no engine, performs no rescore, finalizes no CP, creates no teacher rank, and emits no train / val JSONL. A non-forced receipt marks every candidate `required-not-yet-run`, completed rescores 0, and teacher labels 0.

## 7. Checkpoint design learned from the source audit

The v6 generator had useful candidate semantics, but its work persistence uses an unkeyed checksum, append, and a final whole-file rewrite, so it cannot serve as production resume authority. The stable-proposal checkpoint has strong HMAC and durability, but it begins with a complete artifact and cannot directly persist previously unknown v7 rescores one by one.

The next P1 checkpoint is planned to combine two chains in one `work.jsonl`.

```text
global append chain: header -> every physical record -> final work seal
parent chain: parent-begin -> candidate[0] -> ... -> candidate[n-1] -> parent-seal
```

Parents may interleave across the 12-engine pool, but each parent's candidates are accepted only in UTF-8 bytewise order. The final work seal digests parent seals in canonical parent order to produce a schedule-independent semantic identity.

Exact-once here applies to an entry accepted into the authenticated checkpoint. Search completion and file fsync cannot form one atomic transaction, so a crash after search but before append reruns that candidate search. Engine execution is therefore at-least-once while accepted checkpoint entries are exact-once; the boundary will state both.

Update: the later [HMAC work checkpoint](./blog-shogi-floodgate-v7-hmac-work-checkpoint.en.md) implementation audit selected a dense parent entry containing every canonical rescore instead of one physical entry per candidate. The global HMAC chain, strict parent order, and final seal express the same semantic binding with fewer fsyncs and less resume state. The retry transaction remains one parent, but the rolling window starts up to 12 parents ahead; a process crash may therefore rerun up to 12 parents that the producer completed but did not persist. Exact-once applies only to durably accepted parent entries, while engine execution remains at least once.

The measured dense entry for a synthetic maximum-14-candidate fixture is 17,338 bytes. Arithmetically repeating that entry 24,000 times projects to 416,185,154 bytes, leaving 173,712,000 bytes below the 589,897,154-byte cap. All 23 focused cases for the later implementation passed: 10 completed-parent cases and 13 checkpoint cases. The current test-core resume scanner nevertheless allocates the entire stream into one `Buffer` through `readWholeFile`. This is a capacity calculation, not a 24,000-parent load test, and no production-scale scanner-readiness claim applies until it becomes incremental scan / HMAC.

## 8. The next P1 and explicit non-claims

At the time of this candidate-union PR, the next P1 was planned to close synthetic crash / resume through a completed-parent semantic core and per-parent HMAC checkpoint. Although the later PR described in the update above implements that test core, an argumentless coordinator still needs to claim the production training-row capability, HMAC verification of complete stable work, and the fixed runtime capability together.

This PR reads no real Floodgate game, invokes no real engine, and consumes no real training row. It opens neither selection data nor the sealed fresh-final or legacy-final holdout, and creates no weight, teacher JSONL, A/B result, Elo, or rank.

Candidate-union consistency is not evidence of high-dan play. Strength can be claimed only after authenticated real labeling, three-seed training, fresh selection, sealed final holdouts, a 200-game A/B, and external 81Dojo calibration.
