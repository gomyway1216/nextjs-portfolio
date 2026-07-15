# Reviewing and enrolling the exact key candidate without public disclosure — Floodgate v7 private human enrollment

> PR #466 regular-merged the create-only approved-record installer at merge `6344ceaac6e6485e205f610fdbf612a7d5450d56`. Implementation commit `76e0a7e46b5837118d228db80427fd7dc021abae` on `codex/floodgate-v7-private-enrollment-orchestrator` now connects a private macOS AppKit/JXA review, exact 64-character digest typeback, fresh candidate reinspection, create-only installation, exact loaded-record postflight, and a fresh approved-record-to-current-key binding check. Candidate JSON, its digest, the approval identifier and timestamp, filesystem identities, candidate-specific or control-plane paths, and key material stay out of arguments, environment variables, TTYs, temporary files, the clipboard, logs, and public stdout/stderr; argv contains only the fixed system executable options and fixed helper-script path. Related validation is 136 / 136, authoritative full validation is 2,434 / 2,434, build is 193 / 193, Python is 58 / 58, and TypeScript, ESLint, Prettier, direct JXA syntax validation, and dependency audit pass. Independent security review reports P0 / P1 / P2 = 0 / 0 / 0. This is implementation evidence only: the production UI, human approval, record installation, connector, training, live activation, and strength evaluation have not run. Japanese version: [blog-shogi-floodgate-v7-private-human-key-enrollment-orchestrator.md](./blog-shogi-floodgate-v7-private-human-key-enrollment-orchestrator.md)

## 1. Result

| Item                          | Current evidence                                                                                                           | Meaning                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| prerequisite                  | PR #466 regular-merged at `6344cea`                                                                                        | the supported approved-record writer is on the default branch                        |
| implementation branch         | `codex/floodgate-v7-private-enrollment-orchestrator`                                                                       | the private review and postflight workflow is not merged yet                         |
| review surface                | native AppKit alert launched by a fixed JXA helper                                                                         | the exact candidate is shown locally instead of being copied into chat or a terminal |
| displayed evidence            | canonical JSONL including its terminal LF, UTF-8 byte count, `final byte = 0A`, `terminal LF count = 1`, and full SHA-256  | the human reviews the exact bytes that installation will bind                        |
| approval act                  | all 64 lowercase hexadecimal SHA-256 characters must be re-entered exactly                                                 | clicking the approval button alone is insufficient                                   |
| post-review checks            | fresh exact candidate reinspection, create-only install, exact loaded-claim comparison, fresh current-binding verification | stale review or a mismatched installed/current identity fails closed                 |
| existing-record handling      | valid existing record stops; only held, revalidated fixed-path absence permits a new review                                | a loader error is never treated as proof of absence                                  |
| failure contract              | typed phase, durability, possible-commit, and retry disposition; conservative output failure                               | ambiguous states do not invite a destructive retry                                   |
| local validation              | related 136 / 136; UI 22 / 22; TypeScript, ESLint, Prettier, and JXA PASS                                                  | covers the implementation boundary, not a production approval ceremony               |
| full / build / Python / audit | 2,434 / 2,434; 193 / 193; 58 / 58; zero vulnerabilities                                                                    | Node 22 full validation, production build, Python, and dependency audit pass         |
| independent security review   | P0 / P1 / P2 = 0 / 0 / 0                                                                                                   | final result after absence-race, UI-stderr, and typed-durability fixes               |
| production approval / install | 0 / 0                                                                                                                      | no human decision or production record write has occurred                            |
| connector / training / live   | 0 / 0 / unchanged                                                                                                          | the evaluation function has not changed                                              |
| strength evidence             | 0                                                                                                                          | no match result supports a rank or stable high-dan claim                             |

## 2. The gap after the create-only installer

The merged installer accepts exact candidate JSONL plus candidate-specific approval metadata and publishes the approved record create-only/no-clobber. That deliberately does not answer a different question: how can a human inspect and approve the private candidate without disclosing it through an operator shell, a chat transcript, process metadata, or public evidence?

Passing the candidate as a command-line argument would expose it in process inspection. Environment variables and terminal input would create different disclosure surfaces. Copying the digest through the clipboard or writing an intermediate request file would introduce persistent or ambient state that the approval does not need. Reusing the inspector's ordinary output would also put stable identifiers and filesystem identity into a public stream.

The new entry point therefore accepts no arguments or stdin from the operator. It obtains the candidate from the fixed production inspector in memory and delegates only the private review act to a native local window.

## 3. The private exact-candidate review

The UI launcher starts `/usr/bin/osascript` with only the language selector and a fixed helper path. Candidate-specific data is absent from argv and from a small fixed environment. A bounded, strict request travels to the helper over its stdin pipe; a bounded decision travels back over stdout. Neither stream is forwarded to the terminal, logs, or the article. The helper uses AppKit directly and does not create a temporary file or use the clipboard.

Before displaying anything, both the Node boundary and JXA helper validate the canonical single-line JSON request, the candidate's terminal LF, byte length, lowercase SHA-256 shape, and size limits. The window then displays:

- the exact canonical candidate JSONL, with the final blank row representing its terminal LF;
- the UTF-8 byte count, final byte `0A`, and exactly one terminal LF;
- the complete lowercase SHA-256; and
- a secure text field requiring all 64 lowercase hexadecimal characters to be re-entered.

Cancel returns no approval. A malformed response, reordered or additional response field, non-lowercase digest, partial digest, or mismatch also returns no approval. The typeback is compared exactly and its temporary byte copies are cleared. The successful public receipt reports only that exact review and typeback occurred; it does not return the candidate or approval metadata.

## 4. From one human decision to one installed record

After a successful local review, the orchestrator performs the following sequence:

1. Capture a millisecond-precision UTC approval time.
2. Inspect the fixed deployment-key candidate again and require its canonical JSONL bytes to match the reviewed candidate exactly.
3. Generate a fresh 32-byte CSPRNG approval identifier in memory.
4. Call the merged installer directly with the reviewed candidate, its digest, and the new approval metadata.
5. Reload and claim the installed record, then compare its approval method, identifier, timestamp, candidate byte count and digest, key identity, owner, and filesystem identities against the values held by the orchestrator.
6. Run a fresh read-only binding verifier that independently loads the approved record, freshly inspects the current key, and requires the complete approved/current deployment identity to match.

The first reinspection prevents an approval for candidate A from being used when the inspector already sees candidate B. The loaded-claim check proves that the record recovered through the supported loader is the one the orchestrator expected to install. The final binding verifier does not return a connector capability: it establishes only that the separately approved record still names the freshly inspected current key at that sampled point.

The approval identifier is generated only after the fresh candidate comparison. Its entropy buffer and digest-comparison buffers are cleared after use. The sanitized success receipt contains booleans and contract boundaries, not candidate JSON, digests, stable IDs, timestamps, UIDs, paths, or device/inode values.

## 5. Absence is established, not guessed

A pre-existing approved record must never be silently adopted or replaced. If the strict loader returns a valid record, the orchestrator stops before opening the review UI. More importantly, a loader failure is not a catch-all definition of “absent”: the same public loader failure can represent corruption, an unsafe namespace, I/O failure, or a descriptor-close failure.

The fallback absence probe walks only the fixed current-user home and managed record namespace. It holds each traversed directory open, requires the expected owner and modes, rejects aliases and unsafe types, recognizes only an actual `ENOENT`, and then revalidates the held and named identities before closing them. It proceeds to review only when that bounded traversal establishes that a required namespace component or the final record name is absent. An existing, unsafe, changed, or indeterminate namespace requires manual reconciliation.

This preserves the installer's create-only rule at the orchestration layer. It also avoids presenting a fresh approval dialog when a record might already exist.

## 6. Durability, retry, and output failures

Failures before installation are classified as establishing no approved-record change. Cancellation and a clean pre-install failure can restart only with a fresh private review; an existing record is a do-not-retry condition.

Installer failures preserve its typed phase, durability, possible-commit state, and retry disposition. An unknown installation failure is conservatively classified as “the final link may exist” and must not be retried. Once installation succeeds, an exact-record or current-binding postflight mismatch requires manual reconciliation.

Known orchestration failures emit only sanitized reconciliation metadata. If serialization or stdout/stderr itself fails after the process could have committed, the CLI uses a fixed warning: the installation may have committed, so the operator must not retry before the sanitized binding preflight. Stream listeners are detached on success and after paired callback/error failures so repeated output failures do not accumulate handlers.

## 7. Trust boundary and explicit nonclaims

The supported key writer and approved-record installer are both create-only/no-clobber. This workflow nevertheless does **not** claim an atomic deployment-key-and-approved-record commit. The key and record occupy separate namespaces and are observed at multiple points. Fresh reinspection and two postflights turn a detected mismatch into failure; they do not make an out-of-band rotation atomic.

The trust boundary therefore requires supported create-only key writers and excludes concurrent out-of-band key rotation during the ceremony. If that excluded event occurs and a postflight observes it, manual reconciliation is required. The orchestrator never overwrites, rotates, removes, or adopts an existing final record to recover automatically.

[Machine-readable evidence](./data/floodgate-v7-private-human-key-enrollment-orchestrator-2026-07-15.json) is designed to contain only sanitized counts, contracts, validation results, and nonclaims. It excludes the candidate JSON, candidate digest, key instance ID, approval ID and timestamp, UID, absolute paths, filesystem identities, key material, and UI response.

The implementation does not claim that:

- a production human reviewed or approved the candidate;
- an approved production record was installed or current-binding preflight succeeded in production;
- connector or stage authority was issued;
- a checkpoint, dataset read, teacher label, or real 100 / 500 / 24,000-parent run completed;
- training, candidate-weight selection, live activation, or weight overwrite occurred; or
- formal A/B, Elo, rank, or stable high-dan strength was observed.

The authoritative Node v22.13.0 full run used four file workers and passed 130 files / 2,434 tests in 141.15 seconds wall time, with a 4,287,922,176-byte maximum RSS and zero swaps. The production build generated 193 / 193 pages in 24.39 seconds; all 58 Python tests and the zero-vulnerability dependency audit also passed. Two default-worker full attempts each reached 2,433 / 2,434 but failed different pre-existing resource-sensitive tests: finalization resume once and stable-WASM worker startup once. Immediate isolated reruns passed 11 / 11 and 53 / 53 respectively. Because the four-worker full run passed both tests in the complete suite, it is the adopted authority. Independent review reached P0 / P1 / P2 = 0 / 0 / 0 after fixes for unsafe-prefix absence, exact missing-path revalidation, bounded macOS stderr, late-buffer clearing, and installer durability mapping.

## 8. Next sequence

1. Freeze the implementation and evidence, pass review and CI, and regular-merge this branch.
2. Open the merged private native UI for one exact candidate and complete one human digest typeback.
3. Let the orchestrator perform exactly one create-only install, loaded-record postflight, and fresh current-binding preflight.
4. Build and regular-merge the separately audited production connector runner.
5. Run the real durable prefixes in order: 100, then 500, then the final 24,000-parent corpus.
6. Train multiple seeded candidates, select only on sealed evidence, run color-swapped A/B evaluation, and stage live activation with rollback.

The branch closes the private human-review wiring gap, but it does not yet make the engine stronger. The strength-changing path begins only after the merged ceremony succeeds, the audited connector produces real evidence, and trained candidates beat the frozen baseline under the predetermined evaluation protocol.
