# Pinning real assets before starting the production teacher

> Through [explicit finalization resume](./blog-shogi-floodgate-stable-proposal-finalization-resume.en.md), runtime composition can close a synthetic stable proposal from fresh authority into private publication. A production depth-16 teacher still needs its actual YaneuraOu binary, evaluation asset, and stable runOp1 assets bound to a fixed private deployment registry rather than “some available file path.” Read-only recovery found that the YaneuraOu binary used by the prior WCSC36 teacher exactly matches the expected binary identity in the tracked engine receipt, and that the existing evaluation tree matches the exact hash in the prior manifest. This PR does not disclose personal source paths. It adds a registry under a fixed private deployment root and an argumentless production preflight. This is asset-authority preflight; it neither runs nor establishes an engine process, teacher labels, training, selection / holdout, or playing strength. Japanese version: [blog-shogi-floodgate-production-teacher-asset-authority.md](./blog-shogi-floodgate-production-teacher-asset-authority.md)

---

## Current boundary

| Item                            | Current status                | Meaning                                                                                                        |
| ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Real engine recovery            | Exact identity found          | The local binary matches the YaneuraOu binary SHA-256 recorded by the tracked receipt                          |
| Real eval recovery              | Exact identity found          | The local eval tree matches the eval-tree SHA-256 recorded by the existing teacher manifest                    |
| Private deployment root         | Implemented as fixed registry | Verifies only the exact relative file set below a current-EUID private root, accepting no caller-selected path |
| Production preflight API        | Argumentless                  | Exposes only `verifyPinnedFloodgateProductionTeacherAssets()` with no path or hash override                    |
| Engine execution                | Not implemented or run        | Does not spawn the binary or establish USI handshake, search, depth, MultiPV, or score                         |
| Teacher / training / strength   | Not implemented; no evidence  | Establishes no candidate union, label, weight update, selection, Elo, rank, or stable high-dan strength        |
| Real data / selection / holdout | Unused and unread             | Passes no Floodgate row, fresh selection, or fresh / legacy final holdout into preflight                       |

Here, `production` means only that the boundary uses a fixed registry and real asset identities rather than a dependency-injected fixture. It does not mean that a production teacher has run or that a model has been promoted.

## 1. Discovery: recovering a missing asset does not make its source path a contract

The earlier preflight had a tracked receipt and stable assets but no YaneuraOu binary or eval `nn.bin` at the planned location. A later read-only recovery found the real assets used by the prior clean WCSC36 teacher run elsewhere on the local machine.

| Recovered identity       | Exact evidence                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------- |
| YaneuraOu binary SHA-256 | `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1`                    |
| Engine receipt           | 654 bytes; SHA-256 `a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e` |
| Eval-tree SHA-256        | `639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568`                    |

The important fact is byte identity, not the discovery location. Publishing an absolute path under a personal home directory, old worktree, or download directory as provenance would not reproduce on another machine and would disclose private layout. The assets are instead copied explicitly into the fixed deployment root and rechecked for exact hash and metadata after copying. Personal absolute source paths do not enter the article, receipt, or error.

Matching the binary SHA expected by the receipt proves recovery of the same binary bytes as the prior run. It does not prove that the engine is strong, correct, or safe.

## 2. Fixed private deployment registry

The article represents the machine-specific root only as `<fixed-private-deployment-root>`. The public contract exposes this exact direct-child layout.

```text
<fixed-private-deployment-root>/
  engine/
    yaneuraou
    yaneuraou-receipt.json
  eval/
    nn.bin
  stable/
    floodgate-plan.json
    shogi.wasm
    shogi-nnue-weights.bin
    floodgate-stable-wasm-worker.mjs
```

A relative name is a registry key, not an alias. Extra entries, another basename, a symlink, wrong directory/file type, hardlink, wrong owner / mode, or traversal outside the root are rejected. The root plus `engine`, `eval`, and `stable` must be current-EUID-owned private directories. Preflight does not fill missing assets from the caller's current working directory or an environment path search.

The exact tree does not exempt `.DS_Store`. If a system-generated file enters the private deployment, preflight fails instead of silently ignoring it and requires explicit cleanup followed by revalidation.

The registry fixes these logical identities.

| Registry file                             | Exact identity                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `engine/yaneuraou`                        | Binary SHA-256 `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1`            |
| `engine/yaneuraou-receipt.json`           | 654 bytes; SHA-256 `a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e`        |
| `eval/nn.bin`                             | 64,217,066 bytes; SHA-256 `1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782` |
| `stable/floodgate-plan.json`              | 10,890 bytes; SHA-256 `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af`     |
| `stable/shogi.wasm`                       | 35,597 bytes; SHA-256 `e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c`     |
| `stable/shogi-nnue-weights.bin`           | 1,185,988 bytes; SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`  |
| `stable/floodgate-stable-wasm-worker.mjs` | 19,216 bytes; SHA-256 `d21e347268fa0830882a7f8fb40893aeeed0425f8d92519b26a13444efc467e3`     |

Embedded WASM is not a deployment file. The downstream stable runtime separately requires its tracked bundle snapshot to equal `stable/shogi.wasm` byte for byte.

The eval-tree identity is canonically rederived from the `nn.bin` path, byte count, and SHA-256, then matched to `639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568`. Preflight does not merely copy the tree hash written in the registry into a success receipt.

## 3. Argumentless production preflight

The only public API is:

```text
verifyPinnedFloodgateProductionTeacherAssets()
```

The API accepts no options, dependencies, root path, expected hash, or engine argument. It selects the fixed root and registry constants inside the module. A test-only core may exist, but production API and registry remain separate so test injection cannot issue a production success receipt.

Independent audit also showed that zero-argument alone does not make a root fixed. The first implementation used `os.homedir()`, which a `HOME` environment variable could redirect to another root. The final implementation obtains the home directory from the OS effective-user account and requires that account UID to equal the process EUID. A real-asset smoke with `HOME=/tmp` still verified the same fixed deployment.

Because this registry's engine receipt pins an `APPLEM1` binary, the production API also fails closed outside `darwin/arm64`. It does not redirect the same contract automatically to a standard Linux data directory. A binary and root for another platform require a separately reviewed registry identity.

Preflight verifies assets in this order.

1. Capture the canonical real path, owner, private mode, device / inode, and exact entry sets for the fixed deployment root and three subdirectories.
2. Open every registry file from its exact relative path with `O_NOFOLLOW`.
3. Confirm that the pathname and held file-descriptor identities match.
4. Check owner, type, mode, link count, and bounded size.
5. Stable-read each held descriptor and verify unchanged metadata before and after the read.
6. Match every file's bytes / SHA-256 to the registry.
7. Strict-parse the engine receipt and cross-bind its binary identity to the held engine file.
8. Bind the eval file to the exact eval-tree identity.
9. Revalidate directory and file pathname identities, owners, modes, and exact entry sets.
10. Return a deeply frozen receipt only after every file descriptor closes successfully.

Argumentlessness narrows authority rather than merely simplifying use. A CLI flag or environment variable selecting another engine, eval, or root would let different assets execute under the same production contract name. A different asset set requires a separately reviewed registry / contract.

## 4. Preflight receipt and runtime handoff

The successful receipt exposes only verified identities, not secrets or open handles.

```text
contract
status
claim_boundary
trust_boundary
execution_boundary
deployment
assets.engine
assets.eval
assets.stable
engine
runtime
postverification
```

Each file evidence record contains a registry-relative name, bytes, SHA-256, device / inode, and mode. Current-EUID owner verification is summarized in deployment evidence. The whole receipt has exact keys and is deeply frozen, with no source-discovery path, root key, raw file bytes, or file descriptor.

This receipt is not an engine-execution capability. The next PR's hardened fixed USI runtime must reopen the same fixed registry, reverify identity, copy assets into a private runtime snapshot, rehash after copying, remove write bits, and pass only those copies to spawn. Copying receipt fields must never authorize an arbitrary binary.

The next PR's runtime execution contract must fix at least:

- binding YaneuraOu binary, receipt, and eval into one registry generation;
- a fixed engine-argument list with no caller input or inline path;
- a private working directory and read-only runtime snapshot;
- Threads 1, book off, network delay 0, and Hash 64 MiB;
- bounded stdout / stderr, USI handshake, options, timeout, and shutdown;
- `isready` and TT reset before proposal and every candidate; and
- no inference of search success from preflight success alone.

## 5. Failures and threat boundary

Preflight fails closed on:

| Condition                                     | Handling                                            |
| --------------------------------------------- | --------------------------------------------------- |
| Missing fixed root / subdirectory             | Issue no success receipt                            |
| Extra / missing / renamed registry entry      | Reject without automatic fallback                   |
| Symlink / hardlink / wrong type / owner/mode  | Reject without pathname cleanup                     |
| File size / SHA-256 mismatch                  | Reject without falling back to the discovery source |
| Malformed receipt / binary identity mismatch  | Engine authority is not established                 |
| Eval identity mismatch                        | Teacher eval authority is not established           |
| Metadata mutation during read or before close | Issue no receipt                                    |
| Descriptor-close failure                      | Fail without issuing a receipt                      |

If a held read and cleanup close fail together, close is best-effort and the original verification failure is preserved. A close failure with no primary failure stops receipt issuance on its own.

This boundary prevents a wrong asset, accidental path drift, registry-external fallback, or pathname replacement during inspection from being admitted as the production-teacher identity.

A failing preflight also reads private asset bytes into temporary buffers. Embedded WASM is bounded by its expected encoded length before decoding, and optional hooks are validated before decoding. File-read scratch, the extra-byte probe, and any retained buffer that is not returned are zero-filled on both success and failure paths. This does not claim erasure of all process memory.

It explicitly does not prevent:

- a hostile same-EUID process, root, ACL actor, or pre-existing open capability;
- malice in the pinned binary or compiler / source supply-chain compromise;
- rollback to an older valid registry set;
- process-memory compromise after runtime starts;
- the absence of an OS sandbox, code signing, notarization, or remote attestation; or
- false engine scores or weak play.

SHA-256 equality is evidence of identical bytes; it does not create a reason to trust those bytes automatically.

## 6. Local real-asset smoke evidence

The local smoke in this PR successfully read-only verifies seven real assets totaling 66,169,459 bytes through the argumentless public API. It does not spawn the binary.

| Validation                                | Current result                        |
| ----------------------------------------- | ------------------------------------- |
| Engine file vs tracked receipt identity   | PASS                                  |
| Eval raw file vs derived eval-tree        | PASS                                  |
| Stable four-file registry                 | PASS                                  |
| Fixed-root metadata / exact entry set     | PASS                                  |
| Argumentless production-preflight receipt | PASS                                  |
| `HOME=/tmp` root-injection resistance     | PASS                                  |
| Targeted adversarial suite                | 11 / 11 PASS                          |
| Related asset / stage / proposer suites   | 259 / 259 PASS                        |
| Full Vitest / Python stdlib audit         | 1,769 / 1,769; 58 / 58 PASS           |
| TypeScript / ESLint / Prettier / build    | PASS (ESLint: 0 errors, 157 warnings) |

Smoke evidence records only registry-relative identities, receipt cross-binding, eval digest, stable-file identities, and descriptor lifecycle. There is no engine stdout, USI handshake, bestmove, depth, nodes, or score.

## 7. Explicit non-claims

| What preflight success establishes                               | What it does not establish                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Verification of the exact file set in the fixed private registry | Starting, handshaking, or searching a YaneuraOu process                        |
| Recovered engine bytes match the tracked receipt                 | The engine binary is correct, benign, or strong                                |
| Recovered eval matches the pinned existing eval identity         | The eval is teacher truth or the current strongest                             |
| Stable plan / WASM / weights / worker identities are all present | Stable proposals, v7 union, or depth-16 independent rescore are complete       |
| An argumentless fixed production boundary exists                 | Teacher labels, training-row output, or model-weight updates                   |
| Only the asset registry was checked by a real local smoke        | Selection, fresh / legacy final holdout, accuracy, Elo, rank, or high-dan play |

Preflight reads no real Floodgate training row, selection label, fresh final holdout, or legacy final holdout. It runs no engine and creates no teacher cp, candidate union, training JSONL, checkpoint, model, A/B match, or 81Dojo calibration. It changes no existing production weight and keeps runOp1 in production.

`Production asset authority complete` applies only to this fixed-registry preflight. It does not mean that the production teacher, a stronger evaluation function, or stable high-dan strength is complete.

## 8. Next: a hardened fixed USI runtime, then the v7 union

The next PR adds a hardened fixed USI runtime that consumes this registry without arbitrary arguments. It starts the real engine only from a private snapshot and verifies bounded USI handshake, fixed options, `isready` / TT reset, timeout, stderr, exit, and cleanup with synthetic positions and real assets. It still creates no teacher label.

Only then does the project join exact training-role input with authenticated stable proposals and implement the v7 union: YaneuraOu MultiPV 12, the strong-game played move, and the stable move, deduplicated in UTF-8 byte order. Every unique candidate is independently rescored through MultiPV 1, `searchmoves` with exactly one move, and fixed depth 16 before durable teacher work / train / result / manifest are produced.

Real labeling of 24,000 training parents begins only after asset authority, fixed USI runtime, v7 union, resume, and publication boundaries all close. Fresh selection remains closed until three final checkpoints; fresh and legacy final holdouts remain closed until the static family gate passes.

What was recovered here is the identity of real assets required by the production teacher, not labels or playing strength.
