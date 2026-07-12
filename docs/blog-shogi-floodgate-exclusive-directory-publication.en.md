# Publishing a directory without replacement after postflight — Darwin exclusive directory publication primitive

> The [preceding pathless staging core](./blog-shogi-floodgate-pathless-teacher-staging.en.md) separated the candidate stage created inside the consumer callback from final publication, which may occur only after consumer postflight. The v1 review showed that a parent FD alone did not adequately close either the source inode's move outcome or the helper execution boundary. This PR's v2 primitive requires a caller-held source FD inherited as FD 4, checks current-EUID ownership and exact `0700`, pins the helper by SHA, validates root-owned system Python, bounds subprocesses, performs read-only reconciliation, and then calls Darwin `renameatx_np(RENAME_EXCL | RENAME_NOFOLLOW_ANY)` with no plain-rename fallback. Success returns a frozen verified receipt. A production runner, consumer integration, content integrity, the fsync / durability transaction, a teacher result receipt, real data, and teacher search remain outside this PR. Selection and final holdout remain unread, and there is no strength evidence. Japanese version: [blog-shogi-floodgate-exclusive-directory-publication.md](./blog-shogi-floodgate-exclusive-directory-publication.md)

---

## Current status

| Item                                     | Status          | Boundary checked by v2                                                                                      |
| ---------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| Darwin exclusive directory rename        | Implemented     | Calls `renameatx_np` with `RENAME_EXCL \| RENAME_NOFOLLOW_ANY`                                              |
| held parent / source FDs                 | Implemented     | Binds basenames and inodes to the parent as FD 3 and caller-held source as FD 4                             |
| ownership / mode                         | Implemented     | Checks parent and source as current-EUID-owned exact `0700` before and after                                |
| helper / interpreter boundary            | Implemented     | Places only pinned helper bytes and OS-managed `/usr/bin/python3` inside the execution boundary             |
| bounded helper / reconciliation          | Implemented     | Waits for `close` after a 5-second / 4096-byte cap, then reconciles the held inode with read-only `inspect` |
| existing destination non-replacement     | Implemented     | Does not replace any existing entry, including an empty directory                                           |
| typed outcome / receipt gate             | Implemented     | Separates verified receipt, NotCommitted, and Indeterminate                                                 |
| plain `rename` fallback                  | None            | Fails closed when the Darwin primitive is unavailable                                                       |
| content integrity / fsync / durability   | Caller-owned    | This primitive does not guarantee artifact contents or crash durability                                     |
| production runner / consumer integration | Not implemented | A higher-level trusted writer that calls this after consumer postflight is a separate PR                    |
| real data / teacher / search             | Not run         | This PR reads no training rows, engine, or teacher labels                                                   |
| selection / final holdout                | Unread          | The API receives neither a role selector nor selection / final paths                                        |
| strength claim                           | None            | This is a namespace primitive, not evidence about teacher values or playing strength                        |

Here, “implemented” means that the primitive reconciles the namespace move of a caller-held source inode inside a trusted-writer critical section and returns either a success receipt or an error carrying commit possibility. It does not mean that a complete teacher artifact has been generated and published or that consumer postflight has run against a real bundle.

## 1. Why plain rename is insufficient

The B2 boundary is: do not expose the final pathname until the private stage is complete and the entire consumer postflight succeeds, then publish the complete directory in one step. Directory rename itself is atomic when source and destination are on the same filesystem, but plain rename has a separate problem.

Plain rename can replace an existing empty directory at the destination. The following precheck is therefore insufficient:

```text
lstat(final) -> ENOENT
attacker or competing publisher creates final/
rename(stage, final)
```

A competitor can act between the check and rename. An API that can reject an existing file or symlink yet still replace an empty directory is not no-clobber publication.

This PR passes `RENAME_EXCL` to the rename syscall itself. It does not replace an existing destination, whether that entry is a file, symlink, empty directory, or non-empty directory. There is no fallback to Node's plain `fs.rename`. In addition, v2 does not infer commitment from the rename child's exit code alone; it reconciles the outcome through the source FD held by the caller and a subsequent read-only `inspect`.

## 2. Exact `0700` does not replace the trust assumption

The explicit trust boundary is `trusted-current-euid-writer-private-0700-parent-v1`. Before rename, the wrapper and helper require the held parent, parent pathname, caller-held source, and source pathname to be directories owned by the current EUID with permission bits exactly `0700`. After rename, the held parent, parent pathname, held source, and destination pathname must still satisfy the same ownership and mode conditions.

Exact `0700` is not a sandbox. It does not stop access or mutation by another process running as the same UID, root, an actor authorized through ACLs, or an actor that already holds an FD or other capability. Nor does this contract claim to resist a compromised root.

The caller must therefore own a trusted-writer critical section in which no untrusted actor with same-UID / root / ACL-based access or a pre-existing capability can race the parent or source. In an environment where that assumption cannot be made, passing the mode checks does not make this primitive a sufficient publication boundary.

## 3. Held parent FD 3 and caller-held source FD 4

Source and destination must be canonical absolute paths and distinct siblings with the same parent.

```text
/private/publish-parent/
├── teacher-stage-<token>/   source
└── teacher-final/           destination; absent before rename
```

The wrapper requires the parent's `realpath` to equal the requested path, opens it with `O_NOFOLLOW | O_DIRECTORY`, and holds that descriptor. For source, the caller must supply an already-open directory `FileHandle` and keep it open and unmodified until the promise settles. The wrapper compares each descriptor's `fstat` with pathname `lstat`, checking the expected `dev / ino`, ownership, exact `0700`, and the source `realpath`.

The rename and reconciliation children receive only:

1. the held parent directory descriptor as FD 3
2. the caller-held source directory descriptor as FD 4
3. distinct source / destination basenames that reject `/`, NUL, control characters, `.`, and `..`
4. the held source's expected `dev / ino`

The helper also `fstat`s FD 3 and FD 4 and rechecks current-EUID-owned exact `0700` plus the expected source identity. Conceptually, rename uses the same parent FD for both sides:

```text
renameatx_np(parent_fd, source_basename,
             parent_fd, destination_basename,
             RENAME_EXCL | RENAME_NOFOLLOW_ANY)
```

Combining the same-parent sibling constraint with a held parent and held source avoids making the result decision depend only on reinterpretation of absolute pathnames.

## 4. Helper bytes and the system-Python execution boundary

The production wrapper launches only the fixed `/usr/bin/python3`. Before launch it verifies that the path is canonical and traverses no symlink, names a real regular file, is root-owned, has at least one execute bit, and is not group- or other-writable. This contract places OS-managed system Python inside the trust boundary; it does not claim resilience against root compromise.

The Python helper source is not executed directly from its pathname either. The wrapper opens it with `O_NOFOLLOW` and requires one current-EUID-owned, exact-`0644` regular inode with link count 1 and a size from 1 through 65536 bytes. It verifies that descriptor and pathname stats describe the same stable inode before and after reading, that the byte count equals the size, that SHA-256 exactly matches the value pinned in source, and that the bytes decode as strict UTF-8 in fatal mode.

It executes the verified decoded source as in-memory code without reopening the helper pathname:

```text
/usr/bin/python3 -I -S -c <decoded pinned helper source> ...
```

The child working directory is `/`; `LANG` and `LC_ALL` are fixed to `C`, and `PYTHONHASHSEED` is `0`. The helper passes `RENAME_EXCL | RENAME_NOFOLLOW_ANY` to Darwin libc's `renameatx_np`. There is no switch to plain rename when the platform, required flags, pinned helper, system Python, or syscall contract is unavailable.

## 5. Bounded children and read-only reconciliation

Each rename or `inspect` child has a 5-second timeout and a 4096-byte combined stdout / stderr capture limit. Crossing either bound sends `SIGKILL`, and the wrapper waits for the child's `close` event before proceeding. It therefore does not return while a child that inherited FD 3 / FD 4 remains alive.

After the rename helper spawns, its exit code, signal, timeout, output, or diagnostic alone does not decide commit versus non-commit. The wrapper launches the same pinned source in `inspect` mode as a separate process and reconciles the held source inode's location. `inspect` mode makes no rename syscall. It only performs `fstat` on FD 3 / FD 4 and non-following stats of source / destination relative to the held parent, returning exactly one of:

| `inspect` result | Meaning and wrapper treatment                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `source`         | The held source inode exists only at source. Treat as NotCommitted                                       |
| `destination`    | The held source inode exists only at destination and source is absent. Continue to additional postchecks |
| `other`          | The location cannot be determined uniquely. Treat as Indeterminate                                       |

Failure to spawn `inspect`, a timeout / output-cap breach, or non-strict output is also Indeterminate. For example, when a race creates an existing empty directory, rename returns `EEXIST`, and `inspect` confirms the held inode at `source`, the outcome is NotCommitted. Conversely, if the rename child spawned but reconciliation fails, the caller must not infer non-commit from its diagnostics.

After receiving `destination`, the wrapper rechecks identity, ownership, and exact `0700` for the parent descriptor / pathname and source descriptor / destination pathname, and it verifies that the source pathname is absent. Only then does it construct a verified receipt.

## 6. Only a verified receipt may gate consumption

The success receipt has this shape:

```text
contract: darwin-renameatx-np-excl-nofollow-any-held-parent-source-v2
trust_boundary: trusted-current-euid-writer-private-0700-parent-v1
status: verified-committed
parent_identity: { dev, ino }
destination_identity: { dev, ino }
```

The receipt and its nested identities are frozen. `destination_identity` is the same inode as the caller-held source. This is a receipt for a verified namespace move, distinct from observing that a pathname exists.

| Outcome                                      | `mayHaveCommitted` | Caller treatment                                                        |
| -------------------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| frozen verified receipt                      | —                  | The only outcome that authorizes consumer use of destination            |
| `FloodgateExclusiveRenameNotCommittedError`  | `false`            | The primitive established non-commit. Do not treat it as success        |
| `FloodgateExclusiveRenameIndeterminateError` | `true`             | Commit remains possible. Escalate to higher-level recovery / quarantine |

NotCommitted covers a rename helper that did not start or a post-spawn `inspect` that establishes the held inode at `source`. Indeterminate includes `other`, inability to inspect, or failure to finish postchecks / cleanup after the move to destination. An unclassified failure after the rename helper spawned is normalized to Indeterminate without discarding commit possibility. A parent-handle `close` failure on an otherwise successful path is also Indeterminate. A NotCommitted outcome that already reconciled the held inode at `source` does not become a commit merely because later handle cleanup fails.

Consumption must never be gated on destination pathname existence alone. On Indeterminate, it is also forbidden to look at the path and declare success, retry blindly, delete destination, or consume it as-is. The higher-level caller must require the verified receipt. That receipt, however, is not evidence of directory contents, file bytes, fsync, or crash durability.

## 7. The caller must complete fsync and artifact closure

Atomic namespace rename, content integrity, and post-crash durability are different guarantees. This primitive does not parse or hash files inside the directory and does not fsync staged files, the stage directory, or the parent directory.

The higher-level trusted publisher must preserve the critical section and own at least this ordering:

1. generate the stage inside the consumer callback and seal stage file FDs / inodes / bytes
2. after callback return, establish that consumer postflight and descriptor `close` succeeded
3. revalidate that the stage and protected inputs such as engine / eval did not change across postflight
4. verify the exact artifact set and each file's content, then fsync every file
5. fsync the stage directory
6. call this primitive while keeping the caller-held source FD open and unmodified, and require the verified receipt
7. fsync the parent directory
8. reopen final and verify root inode, exact entries, modes, bytes, SHA-256, and manifest / result-receipt cross-binding

The caller remains responsible for authorizing B1's `train.jsonl`, `val.jsonl`, `manifest.json`, and `work.jsonl`, plus a future `result.json`, as one complete set. Missing files, extra temporary files, same-byte inode replacement, in-place rewrite, manifest mismatch, fsync, and durability are outside this primitive's guarantee. A teacher production result receipt must likewise be constructed by the higher-level transaction and remains distinct from this namespace rename receipt.

## 8. Verification snapshot

| Validation                      | Result            | Scope checked by this PR                                         |
| ------------------------------- | ----------------- | ---------------------------------------------------------------- |
| Local Darwin adversarial Vitest | 28/28 PASS        | Real syscall, race, inode swap, modes, helper, abnormal recovery |
| Full Vitest                     | 1,487/1,487       | All 97 repository test files                                     |
| Python ML stdlib                | 58/58 PASS        | Existing ML protocol / audit regression                          |
| TypeScript                      | PASS              | `tsc --noEmit --incremental false`                               |
| ESLint                          | 0 errors          | 157 existing repository warnings                                 |
| Next production build           | PASS              | 193 pages                                                        |
| CI platform gate                | Configured        | All 28 on macOS; 15 portable plus SHA / `py_compile` on Ubuntu   |
| Independent final audit         | No P0–P2 findings | Read-only post-fix comparison of code, helper, tests, and docs   |

The targeted suite uses only temporary directories, synthetic sentinel bytes, and test-only SHA-pinned helpers. It covers a real `RENAME_EXCL` race that creates an existing empty destination after precheck, replacement of the caller-held source inode, a hook that throws after moving it, `0755` / `01700` directories, a `01644` helper, and helper symlink / SHA mismatch. It also tests both directions: pre-rename nonzero / timeout / output cap become NotCommitted, while the same three abnormalities after rename recover a frozen receipt following destination reconciliation. Real training rows, an engine, selection, and final holdout are not test inputs.

GitHub Actions now includes a targeted `macos-latest` job that runs all 28 cases, including the 13 Darwin cases, plus helper `py_compile`. The normal Ubuntu job still runs 15 portable cases, an unconditional helper-bytes versus pinned-SHA check, and `py_compile` inside `test:ml:stdlib`. “Configured” records that the workflow gate exists; the PASS counts in this table are the local Darwin snapshot.

## 9. What this PR neither reads nor claims

This module accepts only source / destination directory paths and a caller-held source directory handle. It receives no role bundle, training JSONL, engine binary, evaluation tree, teacher score, or model checkpoint.

| Established                                                                                | Not established                                                                   |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| A primitive exclusively renames a directory over held parent / source FDs on Darwin        | It has been called from production consumer postflight                            |
| It does not replace an existing destination, including an empty directory                  | A runner has established the trusted-writer critical section                      |
| It validates pinned helper bytes and system Python and never falls back to plain rename    | It guarantees complete artifact contents or crash durability                      |
| After spawn it performs read-only inspection and returns a typed outcome or frozen receipt | A complete result receipt or teacher manifest has been published in production    |
| Its API has no selector or path for selection / final holdout                              | It read real training data or ran teacher search                                  |
| It rechecks the parent / destination identities represented by the receipt                 | It demonstrated teacher values, accuracy, Elo, rank, or improved playing strength |

Selection and final holdout remain unread. This primitive also reads no training rows. There are no real-data results, and it generates no teacher labels. This change is not strength evidence.

## 10. Conclusion

This independent PR closes one narrow Darwin namespace primitive. It combines caller-held source FD 4, held parent FD 3, same-parent siblings, current-EUID-owned exact `0700`, pinned helper bytes, root-owned system Python, bounded children, `RENAME_EXCL | RENAME_NOFOLLOW_ANY`, read-only reconciliation, typed outcomes, and a frozen verified receipt in one contract. It does not replace an existing empty directory and has no plain-rename fallback.

At the same time, the contract assumes a trusted-writer critical section. Exact `0700` does not exclude same-UID, root, ACL-based access, or pre-existing capabilities. Nothing except a verified receipt may gate consumption, and that receipt does not guarantee content integrity, fsync, or durability.

The next-stage runner must call this primitive only after successful consumer postflight and own the critical section, artifact closure, file / stage / parent fsync, final verification, and production result receipt. Until that is implemented and executed, atomic teacher publication is not complete. This PR is evidence for the namespace primitive, not for a runner, consumer execution, real data, teacher search, teacher labels, or playing strength.
