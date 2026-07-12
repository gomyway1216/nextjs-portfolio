# Do not hand 15 MB of JSONL directly to the teacher: the Floodgate training-row consumer

> The [label-free role-bundle execution log](./blog-shogi-floodgate-fresh-sibling-run.en.md) separated training, selection, and final, fixing 24,000 parents from 1,000 training games. Verifying the right manifest is not the same as ensuring that a downstream process reads only the verified file without a race. This note documents a consumer that holds the pinned `training.raw.jsonl` descriptor while authenticating it and passes only the minimum rows to a callback with no input path. The targeted adversarial suite is 33/33, but this stage has not run the production entry point's full verifier or any teacher search. This is an input-integrity result, not a playing-strength result. 日本語版: [blog-shogi-floodgate-training-row-consumer.md](./blog-shogi-floodgate-training-row-consumer.md)

---

## Current status

| Item                         | Status      | What this stage establishes                                                                                              |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| pinned training identity     | fixed       | the tracked result receipt contains exact bytes, SHA-256, and aggregate digests                                          |
| training-row consumer        | implemented | 33/33 targeted tests with synthetic fixtures and a dependency-injected verifier                                          |
| production full verification | not run     | the production API is wired to the pinned bundle verifier, but no completed run against the real bundle is recorded here |
| teacher / stable proposer    | not run     | the next separate stage will implement and execute pathless cores                                                        |
| selection / final labels     | unread      | the consumer accepts neither a role selector nor a selection/final label path                                            |
| strength claim               | none        | there are no teacher values, candidate checkpoints, static scores, or match results yet                                  |

Here, “implemented” means that the API and adversarial unit contract exist. It does not mean that the full verifier has completed against the real bundle, that teacher data exists, or that the evaluator is stronger.

## 1. The pinned input identity

The only production input this consumer may accept is the training identity inside the tracked role-bundle result receipt. A self-consistent training file from some other manifest is not an acceptable substitute.

| Field                 |                                                       Pinned value |
| --------------------- | -----------------------------------------------------------------: |
| file                  |                                               `training.raw.jsonl` |
| format                |                   `shogi-floodgate-label-free-raw-parent-jsonl-v1` |
| bytes                 |                                                         15,369,952 |
| SHA-256               | `c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62` |
| parent rows           |                                                             24,000 |
| games                 |                                                              1,000 |
| semantic position IDs |                                                             24,000 |
| game-ID digest        | `97609ce53a9dee1fffd8faadcf408d79bc3e0724c17d52d8a2ac095bc607e3d7` |
| parent-ID digest      | `6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f` |
| position-ID digest    | `a97788b608a6687c078b7fbe2172a5c4068c57a42ed322c3997692f697e73b5c` |

These 24,000 rows are not labels. Each row carries a parent SFEN, the legal move played in the strong game, and game, parent, and semantic-position identities. The played move is one proposal candidate, not a teacher target. It receives a score only when the next stage searches every candidate independently.

## 2. Why receipt verification alone is insufficient

The unsafe shape is “verify a manifest, return a path to the teacher, and let the teacher open it later.” A rename or in-place write between verification and open can make the verified inode differ from the trained bytes. A generic path plus a role string also creates an API through which a caller can accidentally select `selection` or `final`.

The production entry point is `withVerifiedPinnedFloodgateTrainingRows(...)`. Its order is fixed.

1. Capture the caller's options, callback, and dependency before I/O; require exact keys, plain non-Proxy data, normalized absolute paths, and a valid revision; then freeze the captured values
2. Open the bundle root as a mode-0700, current-user-owned non-symlink directory, and open only `training.raw.jsonl` with `O_NOFOLLOW` as a mode-0600, same-owner, single-hard-link regular file no larger than 64 MiB
3. Match the pathname and open descriptor by device, inode, mode, link count, owner, size, and nanosecond timestamps, then snapshot the raw bytes once through the descriptor
4. Keep both descriptors open while running the pinned role-bundle verifier, checking root and training-file identity around that verification
5. Canonically serialize the full current and result manifests returned by the verifier, match both to the pinned manifest text, bytes, and SHA-256, and only then extract the training identity
6. Verify snapshot bytes and SHA-256, UTF-8 and JSONL framing, every row's schema, identities, and legality, and all set aggregates
7. Invoke exactly one callback with a pathless, deeply frozen training capability
8. Recheck descriptor and pathname identity after the callback, and fail closed on postflight or close errors

The callback does not directly publish a final artifact. It writes to staging first; only after the entire consumer resolves through postflight and close may the outer layer publish a final manifest. A callback that finishes before postflight detects a mutation therefore cannot leave a complete result.

## 3. The capability received by the callback

Conceptually, the callback receives only this shape.

```text
{
  schema: "shogi-authenticated-floodgate-training-rows-v1",
  role: "training",
  binding: { receipt / manifest / revision / raw aggregate identities },
  rows: [{ game_id, parent_id, position_id, parent_sfen, ply, played_move }]
}
```

It receives no pathname, file descriptor, mutable bytes, raw JSONL text, role selector, `source_url`, `game_sha256`, or selection/final artifact identity. The parser uses the source URL and CSA-body digest to check per-game source consistency, then projects both fields out of the exposed row. The binding, array, and every row are frozen. The callback must return a native `Promise<void>`; synchronous values, custom thenables, and value-bearing promises are rejected. A teacher keeps required state in private staging and publishes it from the outer layer only after the entire consumer succeeds.

This is a narrow capability to use authenticated training rows. It is not a general file-opening authority constrained only by a comment.

## 4. Closing shogi semantics as well as bytes

For the production file, a matching SHA-256 fixes the bytes. A separate strict parser is still necessary: a future identity update or a test-injected identity must not promote self-consistent but malformed JSONL into semantic rows.

The parser requires all of the following.

- Fatal-valid UTF-8, no BOM, NUL, or CR, exactly one final LF, and no blank line
- Exact keys on every line and byte-for-byte equality with compact canonical JSON whose keys use UTF-8 byte order
- Schema version 1, source `floodgate`, and a game ID rederived from the canonical HTTPS URL
- `parent_id = H(game_id, ply)`, an SFEN move number equal to `ply + 1`, and a `position_id` rederived from the SFEN
- A `played_move` contained in the rules-complete legal-move generator
- Strict UTF-8-bytewise `parent_id` row order and zero duplicate parent or semantic-position IDs
- Consistent source URL and CSA digest for each game ID, plus game, parent, and position counts and set digests equal to the manifest

None of these checks requires opening selection or final labels. This stage handles only the pinned, label-free training parents.

## 5. Boundary gaps found by adversarial tests

The targeted suite is 33/33. Individual cases also contain mutation matrices for BOM, CRLF, NUL, invalid UTF-8, unknown fields, identity mismatches, and Promise-prototype poisoning. This is unit evidence from synthetic fixtures and dependency injection; it is not evidence that the production full verifier has completed on the real bundle.

Two defects that ordinary happy-path tests tend to miss were found while building the suite.

### Checking for a BOM only after decode is too late

`TextDecoder("utf-8", { fatal: true })` rejects invalid UTF-8, but ordinary decoding can consume a leading UTF-8 BOM. An implementation that only checks whether decoded text starts with `U+FEFF` can therefore admit BOM-prefixed raw bytes. The fix rejects the leading raw bytes `EF BB BF` before decode and retains the decoded-text check. The bytes hashed by SHA-256 and the bytes whose framing the parser recognizes are now the same bytes.

### `JSON.parse` does not report noncanonical object-key order

Semantic parsing turns the same key/value pairs in a different order into the same object. This artifact contract, however, includes canonical key order in its exact bytes. After parsing a line, the fixed code reserializes it as canonical JSON with keys sorted by UTF-8 bytes and requires an exact match with the original line. It relies on neither JavaScript's default sort nor insertion order. Key reordering, extra whitespace, duplicate-key overwrite, and noncanonical number framing therefore cannot pass as “semantically equivalent.”

Additional adversarial cases cover caller mutation of options immediately after I/O starts; callback poisoning of `fs.promises.lstat` and `FileHandle.stat`; `Promise.reject(undefined)`; symlink, directory, and hard-link substitutions; and rename or in-place writes during verification and during the callback. Promise-, Object-, and Array-prototype `then` poisoning is reproduced in an isolated child process. Capturing options and required intrinsics first, and tracking failure with a boolean separate from the rejection value, prevents these cases from bypassing postflight.

### Parseable SFEN is not necessarily canonical SFEN

A move number such as `03` or `3junk` can still parse as 3 when checked only with `Number.parseInt`. The consumer now parses each SFEN and serializes it again with the same move number, requiring the resulting bytes to equal the original SFEN exactly. A string that is numerically consistent with `ply + 1` but not canonical is rejected.

### Protect the settlement value, not only the Promise brand

The adversarial review reproduced three distinct attacks: early resolution through `Symbol.species`, forged postflight through `Promise.prototype.then`, and reinterpretation of real `BigIntStats` or close-error arrays as thenables through `Object.prototype.then` or `Array.prototype.then`. The fixed implementation obtains object-valued postflight stats through captured callback-style `fstat/lstat` calls and immediately projects them to primitive filesystem identities. Fulfilled values from internal promises are placed in null-prototype boxes before being awaited, and the public API completes with `void` only. Separate regressions now pin hostile species, prototype poisoning, and an `undefined` rejection.

## 6. What this boundary does and does not protect

It protects the **identity between the pinned receipt's training bytes and the semantic rows observed by the callback**. It detects path substitution and in-place mutation around verification and callback execution, and it removes role selection and raw-file authority from the callback argument. Selection and final labels cannot be mixed into this training API.

It is not an OS sandbox. It cannot prevent a malicious callback in the same process from importing `node:fs` on its own, and it does not neutralize every process outside trusted private storage. Nor does this consumer alone authenticate the teacher engine binary or eval, `isready` and TT resets, search results, the output publisher, training code, a candidate checkpoint, or the match harness.

The claim boundary is therefore `input-integrity-only`. No teacher has run, and this stage makes zero claims about evaluation values, selection or final scores, win rate, Elo, or rank.

## 7. Next: a pathless teacher core and stable proposer

The teacher generator core will also take no input path. Inside the consumer callback it will receive `AuthenticatedFloodgateTrainingRows` directly, with an engine runner and staging sink supplied as explicit capabilities. The design will not return to a CLI that reopens the input file.

The preregistered proposal union for each parent remains exactly:

1. YaneuraOu MultiPV 12
2. The strong game's `played_move`
3. The stable move selected by current runOp1 production int16 at fixed depth 11

The stable proposer will be an independent capability that binds its initializer/eval identity and production-int16 path into a receipt and returns one legal move. Candidate-QAT moves will not be added to proposals. Every proposal will then receive an independent MultiPV-1, one-move `searchmoves`, fixed-depth-16 search. The contract retains `isready` and a TT reset before proposal and every candidate, UTF-8-bytewise candidate order, 12 one-thread processes, 64 MiB Hash, and a 600-second timeout per search. Missing, timed-out, incomplete, or provenance-mismatched parents fail closed, and partial work is never blended into a teacher produced under different conditions.

Three-seed training remains locked until that core and stable proposer exist and the real-bundle consumer, verifier, and teacher complete with a closed receipt.

## 8. Expand the match harness to 768 games before using it

The current v1 plan's 192 color-swapped pairs, or 384 games, have a worst-case 95% error half-width of about 7.1 percentage points. That is too wide for the intended five-point margin, so v1 will not be used as the strength gate unchanged.

A separate PR is planned for v2; it has not been implemented or run. Its stopping and acceptance contract will be fixed first:

- Complete a fixed 384 color-swapped opening pairs, 768 games total
- Declare neither early success nor early failure from valid partial results, and make no adoption decision before every pair completes
- Run a pair-stratified bootstrap that preserves each opening/color pair as one block
- Require a one-sided 95% lower bound above 45% for safety
- Say “stronger than stable” only when the two-sided 95% interval's lower bound is above 50%
- Require zero technical faults; any technical fault prevents the run from passing

The match remains locked if the earlier static family gate, fresh final, unopened WCSC36 final, known regressions, or production parity/browser checks fail. Even a passing v2 A/B does not prove a human rank. External high-dan calibration remains a separate stage after rechecking the then-current official rules and rank table and obtaining user approval.

The conclusion at this point is deliberately narrow: **we have not prepared to overwrite stable with strong games; we have built a safer entrance through which only the pinned training rows can reach downstream work.** The next boundary to close is the teacher capability. Strength evaluation comes much later.
