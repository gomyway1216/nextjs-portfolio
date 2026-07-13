# Separating the production-teacher USI runtime from a general wrapper

> **Digest-authority update (current boundary):** The production and test teacher-runtime factories now register their exact frozen facades in separate module-private `WeakMap` registries, and only the matching exactly-one-argument getter returns the receipt digest. A clone, Proxy, plain receipt, or facade from the other registry is rejected without invoking Proxy traps or starting a search. A plain receipt hash alone does not prove production origin. The existing runtime contract and `shogi-floodgate-v7-runtime-receipt-v1\0` domain remain unchanged and compatible with the candidate union's existing digest. See the [runtime digest authority](./blog-shogi-floodgate-production-runtime-digest-authority.en.md). This is code evidence for digest authority, not evidence for a production coordinator / adapter, checkpoint wiring, a key, real labels, training, a weight, live deployment, or playing strength. The body below remains historical.

> **v2 update (current boundary):** The current runtime contract is `shogi-floodgate-production-teacher-usi-runtime-v2`. In the pool lifecycle, the first call to either `close()` or `abortAndReap()` fixes the sole cleanup Promise (first-call-wins). That Promise fulfills only after every process group has been boundedly reaped and the private snapshot has been removed. This v2 lifecycle evidence is from the test-only / injected boundary and is not wired into the production coordinator or live teacher. The body below remains a historical record of its original point in time and makes no claim about teacher labels, training, weight / live updates, holdout, or playing strength.

> [Production asset authority](./blog-shogi-floodgate-production-teacher-asset-authority.en.md) fixed the real bytes of the YaneuraOu binary, eval, and stable assets in a private registry. Identical assets still do not produce an identical teacher search when a process wrapper lets callers change paths, environment, options, and timeouts. This PR keeps the existing `UsiTeacherEngine` as a development/test surface and adds a separate contract for an argumentless production factory, a shared private snapshot, a fixed 12-engine pool, and a bounded USI state machine. This is an engine-execution boundary, not evidence of teacher labels, training, selection / holdout, or playing strength. Japanese version: [blog-shogi-floodgate-production-teacher-usi-runtime.md](./blog-shogi-floodgate-production-teacher-usi-runtime.md)

---

## Current boundary

| Item                           | Current status             | Meaning                                                                   |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------- |
| Fixed asset authority          | Completed in the prior PR  | Checks binary / receipt / eval / stable identities without arguments      |
| Production USI factory         | Implemented; real verified | Accepts no caller-selected path / args / env / option                     |
| Process pool                   | Implemented; real verified | Fixes 12 workers, Threads 1, and Hash 64 MiB                              |
| Proposal / rescore             | Implemented; real verified | Fixes depth 16, proposal MultiPV cap 12, and rescore MultiPV 1 / one move |
| Synthetic adversarial evidence | Complete                   | Exercises protocol, races, and cleanup with a hostile fake engine         |
| Real-engine smoke              | Complete                   | Used only a fixed initial position and read no game record                |
| Teacher / training / strength  | Not run; no evidence       | Establishes no label, weight update, A/B result, Elo, or rank             |
| Selection / holdout            | Unused and unread          | Opens no fresh or legacy final label                                      |

## 1. Discovery: the existing wrapper is useful but is not production authority

The existing `UsiTeacherEngine` remains useful for tests and the earlier generator. Audit found that its authority surface is too broad for the production teacher.

| Existing surface                             | Production problem                                                  |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `engineBin` / `engineArgs` / `evalDir`       | A caller can choose another binary, eval, or argument               |
| `env ?? process.env`                         | The child inherits ambient shell and dynamic-loader environment     |
| Configurable Hash / timeout / cwd            | Execution conditions can change under the same contract name        |
| Registering a waiter after `isready`         | A fast `readyok` can be lost in a race                              |
| Rejecting only the Promise on timeout        | The child can continue searching and survive later work or shutdown |
| Unbounded stdout partial line / line / total | Hostile output can consume unbounded memory                         |
| Reuse after protocol failure                 | Stale output or poisoned state can enter the next search            |
| Concatenating SFEN directly into a command   | A newline or control character can break the command boundary       |

The project therefore does not gradually turn the existing class into production through more options. A separate module holds the production factory and injected test core, and `execution_boundary` separates production and test receipts in both types and runtime values.

## 2. Argumentless production factory

The only production API is this zero-argument factory.

```text
createFloodgateProductionTeacherUsiRuntime()
```

The factory completes asset preflight, snapshot creation, initialization of all 12 workers, USI ID / option advertisement checks, fixed option setup, and the first `readyok` before it returns. If any worker is not ready, it returns no runtime and attempts bounded reclamation of every process group that started. Failure to confirm reclamation within the bound fails the factory itself.

A production caller cannot supply:

- engine or eval paths;
- engine arguments, shell, cwd, or environment;
- engine count, Threads, Hash, FV scale, book, or network delay;
- proposal / rescore depth, MultiPV cap, or timeout; or
- stdout / stderr / line / command bounds.

The test-only core can inject small synthetic assets and a fake process, but its success receipt has a `test-only` boundary and cannot become a production receipt. The concrete class and constructor are not exported. A caller receives only a frozen null-prototype façade with `receipt / poisoned / propose / rescore / close`; it exposes no runtime property leading to internal engines, snapshot paths, or lease APIs.

## 3. One shared private snapshot

The runtime shares one private snapshot instead of duplicating the 64 MB eval for every worker.

```text
<private-runtime-snapshot>/
  engine/yaneuraou
  eval/nn.bin
  workers/worker-00/
  ...
  workers/worker-11/
```

Snapshot creation does not treat the asset-authority success receipt as a pathname capability. It reopens the fixed root and revalidates source identity. A source requires an `O_NOFOLLOW` held read, current EUID, one link, exact size / SHA-256, and unchanged metadata around the read. The destination is rehashed after copying. The engine is 0500 and eval is 0400; snapshot root / engine / eval / workers directories are 0500, while each worker-specific root / cwd / HOME / TMPDIR is 0700.

Workers share the same read-only engine and eval snapshot but have separate working directories. On pool close, the runtime revalidates snapshot identity after bounded process-group termination and attempts to remove only the run directory it created. Cleanup is attempted on intermediate failure without hiding the original failure behind a cleanup failure.

This is not a same-EUID sandbox. The trust boundary includes the pinned engine, the same Node process, runtime builtins, and the current-EUID account. Modes 0500 / 0400 reduce accidental or cross-account modification and the final rehash fails closed on mutation, but they do not defend against a hostile same-EUID process, root / ACL actor, pre-existing open capability, or compromised engine.

## 4. Fixed spawn and USI handshake

The production child is spawned from the absolute snapshot binary with no arguments, `shell: false`, and a worker-specific cwd. It inherits no ambient environment and receives only six variables: worker-specific `HOME / TMPDIR` and fixed `LANG / LC_ALL / PATH / TZ`.

Handshake registers its waiter before writing `usi` or `isready`, so an immediate response is not lost. It requires the exact engine ID from the tracked receipt and unique advertisement of every required option.

The fixed option transcript is:

```text
setoption name EvalDir value <private-snapshot-eval>
setoption name FV_SCALE value 20
setoption name USI_Hash value 64
setoption name Threads value 1
setoption name USI_OwnBook value false
setoption name BookFile value no_book
setoption name NetworkDelay value 0
setoption name NetworkDelay2 value 0
```

A missing or duplicate option, wrong engine ID, unexpected exit, or stdin failure prevents factory success.

## 5. Proposal and independent rescore

The runtime exposes only two search operations.

```text
propose(parentSfen, legalMoveCount)
rescore(parentSfen, exactlyOneCandidateMove)
```

`propose` requires `legalMoveCount >= 2` and selects `MultiPV = min(12, legalMoveCount)` and depth 16 internally. An endgame with fewer than 12 legal moves can therefore still require an exact completed snapshot. Legal-move generation and count cross-checking belong to the later v7 coordinator; this runtime alone does not call a caller-supplied count teacher truth.

`rescore` accepts one candidate and internally constructs MultiPV 1, `go depth 16`, and `searchmoves` with exactly one move. It normally requires exact final updates at depth 16; the only shallower success is a terminal exact mate from the forced single-move search. SFEN and move inputs are checked for byte length, whitespace, and control characters before invalid input can reach stdin.

Before a proposal and every rescore, the runtime itself always:

1. registers the phase waiter;
2. sends `isready`;
3. waits for exact `readyok`;
4. sends `usinewgame`; and
5. sends fixed MultiPV, position, and depth-16 go commands.

No API lets a caller omit the reset.

After receiving `bestmove`, the runtime also passes an `isready → readyok → usinewgame` barrier to confirm quiescence from the compliant pinned engine. It rejects structured delayed search output and discards bounded `info string` diagnostics during ready. The real-engine smoke discovered that YaneuraOu legitimately emits `info string USI_Hash ...` during reset. This is not a temporal sandbox guarantee against a compromised engine that emits at an arbitrary time after `readyok`.

## 6. Bounded protocol and poison

Merely draining USI stdout / stderr is insufficient. The runtime bounds phase timeouts, stdout bytes and line count per phase, stderr bytes across the process lifetime, bytes per line, the partial-line buffer, and stdin command bytes.

Any one of these conditions poisons the whole pool instead of retrying one worker:

- handshake / ready / search timeout;
- stdout / stderr / line / command limit overflow;
- invalid UTF-8, malformed option, or unexpected idle output;
- malformed structured info, non-safe integers, invalid engine-output USI moves, parser inconsistency, or missing / mismatched bestmove;
- child / stdin error or unexpected exit; or

Even if another worker concurrently constructs a locally valid result, it rechecks global poison immediately before return and converges the whole pool on the same failure. After poison, the runtime accepts no new work, sends TERM immediately to every worker process group, sends KILL only if needed, and confirms bounded reclamation. Orderly close first sends `quit`, escalating to TERM / KILL only if required. A full queue and use after close reject the work but do not themselves poison the pool. Automatic retry would blur label provenance, so a later coordinator must resume from a durable checkpoint with a new pool.

## 7. Synthetic evidence

The fake engine writes spawn argv / cwd / env and the complete stdin transcript to a 0600 JSONL trace and can reproduce:

- immediate `readyok`;
- wrong ID and missing / duplicate options;
- handshake / ready / search hangs;
- oversized lines and stdout / stderr floods;
- exits during init / option / ready / search;
- malformed info and missing / mismatched bestmove; and
- a concurrent global-poison race and a child left after its process-group leader exits; and
- ignored quit / EOF and an immediate operation / close race.

The synthetic boundary was closed before the real check, and findings from the post-smoke audit were returned to regression tests. Final validation counts become fixed when every suite completes.

| Validation                             | Current result               |
| -------------------------------------- | ---------------------------- |
| Focused runtime suite                  | 36 tests pass                |
| Related USI / asset / stage suites     | 395 tests pass               |
| Full Vitest / Python audit             | 1814 / 58 pass               |
| TypeScript / ESLint / Prettier / build | pass / 0E-157W / pass / pass |

## 8. How to read the real-engine smoke

Only after the synthetic boundary closed did the PR start a production 12-worker pool from fixed private assets. It used no sealed data, only the public initial position, to verify ID, options, eval loading, ready, a depth-16 proposal, and a one-move rescore. Proposal produced 12 lines and rescore one; two concurrent executions of each produced matching digests. After close, the fixed runtime parent remained mode 0700 under the current EUID with zero run entries. No CP value or PV was recorded or treated as strength evidence.

```text
executed_at=2026-07-13T03:33:33.625Z
platform=darwin/arm64
position_sfen_sha256=7ff40af0b0fa49d8459d68bf06204d3b4f73bc424a50c58b2e9f4bfc6505f658
proposal=depth:16,lines:12,requested_multipv:12,parallel_digest_equal:true
proposal_sha256=0dd7aa0ca34face91d51ad6c88033d4cd6d92b7ee5a86671137939434b53b008
rescore=depth:16,lines:1,searchmoves:1,parallel_digest_equal:true
rescore_sha256=b60d93c3b9bd048d2a4d0e7853c7f495d45e4c7631034bba55a85a960e11946a
cleanup=remaining_run_entries:0,parent_mode:0700,parent_uid_matches_euid:true
```

Even when that smoke succeeds, it establishes only that the fixed real engine can initialize and search reproducibly under fixed conditions. It does not establish correct teacher labels, a stronger model, or stable high-dan play.

## 9. Explicit non-claims and next stage

This PR reads no real Floodgate training row, fresh selection, or fresh / legacy final holdout. It creates no teacher JSONL, checkpoint, weight, A/B match, or 81Dojo rating. It does not change the production runOp1 weight.

Next, the v7 union joins a training-role parent, strong-game played move, and authenticated stable move with this fixed runtime's MultiPV proposal. Real labeling of 24,000 parents starts only after every unique candidate is independently rescored in canonical order and closed into HMAC-bound work checkpoints.

Progress toward the high-dan goal is not measured by “the engine ran.” Playing strength is claimed only after three seeds, fresh selection, static family gates, sealed final holdouts, a 200-game A/B, and external 81Dojo calibration.
