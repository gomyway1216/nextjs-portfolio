# Recording 100 / 500 as unsealed milestones and sealing only 24,000 in the v7 checkpoint v3

> The earlier [v7 HMAC work checkpoint](./blog-shogi-floodgate-v7-hmac-work-checkpoint.en.md) created a v2 stream that stores completed parents in input order on an HMAC chain and reuses durable parents after a crash. The [valid 24,000-parent scan-load](./blog-shogi-floodgate-v7-valid-24k-scan-load.en.md) measured that v2 stream with holdout-free synthetic input. It did not define a contract that advances the same full training input through 100, 500, and 24,000 parents while recording only durability gates without making a prefix look like a completed dataset. This change keeps v2 and adds a separate test-only v3 entry point. It fixes 100 / 500 as domain-separated HMAC milestones and permits only 24,000 to seal. The source revision, v3 measurements, and validation results will be filled after source freeze, so this report marks them `[TBD]`. It is not evidence of production execution, a deployment key, a real dataset, teacher labels, training, weights, live evaluation-function / weight activation, matches, or playing strength. 日本語版: [blog-shogi-floodgate-v7-checkpoint-v3-milestones.md](./blog-shogi-floodgate-v7-checkpoint-v3-milestones.md)

---

## 1. Current boundary

The current source retains the existing `checkpointFloodgateV7TeacherParentsCoreForTests` and its public contract, and adds a separate `checkpointFloodgateV7TeacherParentsV3CoreForTests`. V3 fixes the following identifiers:

- schema: `shogi-floodgate-v7-teacher-work-v3`
- algorithm: `hmac-sha256-hkdf-sha256-v7-parent-gated-milestone-chain-v3`
- gate contract: `shogi-floodgate-v7-teacher-gate-contract-v1`
- gates: `durable-prefix-100`, `durable-prefix-500`, and `sealed-final-24000`

| Boundary                             | Status                            | What this change establishes                             |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------- |
| v2 checkpoint API / schema / format  | Preserved                         | Leaves existing v2 callers and historical streams intact |
| v2 valid 24,000 scan-load            | Historical accepted baseline      | Retains it only for comparison, not as a v3 measurement  |
| v3 gate contract / scanner / receipt | Implemented in the current source | Source revision and validation are `[TBD]`               |
| Real 100 / 500 / 24,000 teacher run  | 0                                 | Runs no production data or engine in this change         |
| Weight / live / match / strength     | 0                                 | Makes no stable-high-dan or strength-improvement claim   |

V3 is a private test-only checkpoint. It is not a zero-argument production path reached from a production coordinator or deployment key authority. It remains a core that validates an authenticated training-row capability, an authorized private stage lease, a run binding, a producer controller, and test dependencies supplied by its caller.

## 2. Preserve v2 and bind the same full 24,000-parent input

V2 and v3 use the same `work.jsonl` filename but do not share semantics. The current source retains the v2 schema, algorithm, HKDF info, header / entry / seal domains, and public function signature. V3 receives a separate schema, HKDF info, domains, and receipt union. Its new `after-milestone-durable` failpoint and `durable-prefix-final` read policy are isolated in `FloodgateV7TeacherCheckpointV3Dependencies`, so the v2 dependency-hook types do not expand.

| Item           | v2                                                | v3                                                                                               |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| public core    | `checkpointFloodgateV7TeacherParentsCoreForTests` | `checkpointFloodgateV7TeacherParentsV3CoreForTests`                                              |
| schema         | `shogi-floodgate-v7-teacher-work-v2`              | `shogi-floodgate-v7-teacher-work-v3`                                                             |
| chain          | header → parent entries → seal                    | header → parent entries → milestone 100 → parent entries → milestone 500 → parent entries → seal |
| prefix success | None                                              | Exact unsealed receipts at 100 / 500                                                             |
| migration      | None                                              | Does not re-sign, upgrade, or resume v2 bytes in place                                           |

Before persistence begins, each v3 invocation requires the authenticated training input to contain **exactly 24,000 parents**. The 100 gate and the 500 gate both receive all 24,000 rows; neither receives a 100-row or 500-row slice. The header HMAC covers the full training binding, record count, digest of every parent ID, and digest of every canonical parent. It also covers the run binding—including the plan, producer-control policy, stable-runtime receipt digest, and teacher-USI-runtime receipt digest—plus the run ID, key ID, and stage identity.

The three valid invocations therefore use the same authenticated 24,000 rows, run binding, run ID, key ID, and stage stream. A one-byte difference prevents exact reconstruction of the existing header and fails before the producer runs. Refusing separate 100 / 500 datasets closes the possibility that a pilot forks onto an identity that no longer binds to the final run.

## 3. Put two milestones in one HMAC chain

The v3 stream has exactly one canonical shape.

```text
header
  -> completed-parent[0..99]
  -> durable-prefix-100 milestone
  -> completed-parent[100..499]
  -> durable-prefix-500 milestone
  -> completed-parent[500..23999]
  -> seal
```

| Endpoint | Parent entries | Milestone lines | Seal lines | Total JSONL lines |
| -------: | -------------: | --------------: | ---------: | ----------------: |
|      100 |            100 |               1 |          0 |               102 |
|      500 |            500 |               2 |          0 |               503 |
|   24,000 |         24,000 |               2 |          1 |            24,004 |

These line counts are contractual consequences of the current source's exact gate structure, not measurements. Each parent entry binds the preceding header, entry, or milestone MAC through `previous_mac`. The 100 milestone's `milestone_mac` becomes the chain head for entry 100, and the 500 milestone's `milestone_mac` becomes the chain head for entry 500.

Each milestone has its own HMAC domain and authenticates all of the following together:

- the gate literal and exact `completed_parents`
- the chain MAC immediately before the milestone
- the digest of parent IDs in the completed prefix
- the parent-ID digest of the full 24,000-parent training input
- the canonical-parent digest of the full 24,000-parent training input
- the prefix status containing `not-sealed-not-published`

The header, parent entry, 100 milestone, 500 milestone, and seal are all domain-separated. Plain JSON containing a marker name and count, a prefix carrying only SHA-256, or a valid marker imported from another run cannot become chain authority.

## 4. Keep 100 / 500 unsealed and seal only 24,000

The three gates do not return one undifferentiated kind of success. The receipt union separates the literal `gate`, `sealed`, `target_parents`, `completed_parents`, and the presence of milestone MACs.

| Gate                 | Target / completed | Receipt status                                                                             | Sealed  | Milestone receipt          |
| -------------------- | -----------------: | ------------------------------------------------------------------------------------------ | ------- | -------------------------- |
| `durable-prefix-100` |          100 / 100 | `complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published` | `false` | 100 present; 500 is `null` |
| `durable-prefix-500` |          500 / 500 | `complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published` | `false` | Both 100 and 500 present   |
| `sealed-final-24000` |    24,000 / 24,000 | `complete-authenticated-private-v7-teacher-parent-checkpoint-not-published`                | `true`  | Both 100 and 500 present   |

The `training_parents` value in both the 100 and 500 receipts is 24,000, not 100 or 500. It means “a durable prefix bound to the full input,” not “a 100-row dataset” or “a completed 500-row teacher dataset.” On final reopen, the prefix scanner also requires `sealed=false`, the exact line count and target, and no extra tail.

The seal payload authenticates exactly 24,000 entries, the final-entry MAC, both the 100 and 500 milestone MACs, the full parent-ID digest, and the full canonical-parent digest. It cannot be valid when either marker is missing, the entry count is below or above 24,000, or the chain after a marker differs. The receipt therefore makes it difficult to confuse passing a durability / resume gate with sealing the final private checkpoint.

## 5. Fail closed on gate skips, lower targets, and malformed transitions

The only valid state transition is `fresh → 100 → 500 → 24,000`. The scanner authenticates all existing bytes before checking whether the requested gate may own that state. A skipped, lower, or ambiguous request fails before producer execution, append, or truncation.

| Durable state       | Requested gate | Result                                                 |
| ------------------- | -------------- | ------------------------------------------------------ |
| fresh               | 100            | Creates the header, 100 entries, and the 100 milestone |
| fresh               | 500 / 24,000   | Rejects a skipped gate                                 |
| exact milestone 100 | 100            | Same-gate retry; producer / append / truncate are 0    |
| exact milestone 100 | 500            | Appends entries 100..499 and the 500 milestone         |
| exact milestone 100 | 24,000         | Rejects a skipped 500 gate                             |
| exact milestone 500 | 100            | Rejects a lower target                                 |
| exact milestone 500 | 500            | Same-gate retry; producer / append / truncate are 0    |
| exact milestone 500 | 24,000         | Appends entries 500..23999 and the seal                |
| exact final seal    | 100 / 500      | Rejects a lower target                                 |
| exact final seal    | 24,000         | Same-gate retry; producer / append / truncate are 0    |

A same-gate retry still performs authenticated scans, native sync, and a final reopen. It does not mean that all filesystem operations are zero. The zero counts apply specifically to new producer calls, line appends, and tail truncations.

The stream also fails closed on an early, late, or duplicate milestone; crossing entry 100 without the 100 marker; crossing entry 500 without the 500 marker; sealing without both markers; appending beyond 24,000; or adding a complete line after the seal. A complete line with incorrect canonical JSON, exact keys, parent identity, semantic evidence, or MAC is corruption. The scanner rejects it instead of rolling back to a convenient prefix.

## 6. Recover a torn tail only inside the current unfinished gate

An incomplete final fragment is different from a complete invalid line terminated by LF. The scanner retains the byte offset of the last authenticated complete line, but truncates to it only when the requested gate owns that torn tail.

| Durable authenticated prefix                   | Requested gate | Torn-tail treatment                            |
| ---------------------------------------------- | -------------- | ---------------------------------------------- |
| header through before the 100 marker           | 100            | May truncate / resume inside the current gate  |
| exact 100 marker plus a fragment               | 100            | Rejects because the 500 gate may have begun    |
| exact 100 marker through before the 500 marker | 500            | May truncate / resume inside the current gate  |
| exact 500 marker plus a fragment               | 500            | Rejects because the 24,000 gate may have begun |
| exact 500 marker through before the seal       | 24,000         | May truncate / resume inside the current gate  |
| exact seal plus a fragment                     | 24,000         | Rejects post-seal corruption                   |

For example, the 100 gate can recover a partial write of entry 99 or the 100 marker. Once the 100 marker is durable, however, letting the 100 gate erase the next fragment could destroy valid bytes started by the 500 gate. The next gate alone therefore owns an incomplete tail after a completed marker. The same rule applies to the 500 marker and final seal.

Search execution can be at least once depending on the crash point, while a parent or milestone durably accepted into the HMAC stream is exact once. Complete-line MAC revalidation, current-gate-only truncation, and strict input-index append distinguish repeated search from duplicate acceptance.

## 7. Separate the v2 baseline from v3 measurement placeholders

The accepted v2 24,000-parent scan-load remains a historical baseline for comparison. It is not a successful v3 value.

| v2 historical identity / measurement | Accepted value                                                     |
| ------------------------------------ | ------------------------------------------------------------------ |
| source commit                        | `017692c7a076babbd40e7be0b14ea27d9988fa6c`                         |
| harness SHA-256                      | `23578cbf11deafb49cd288f38d9f3ec081e76d0f41a5b2948b3ccf08fabfb9a2` |
| wall time                            | `435.60 s`                                                         |
| valid stream                         | `429,245,287 bytes`                                                |
| stream SHA-256                       | `8039ec02f3421d934d0a9f1d10b47a97f273e397ad414e64db50bded13c498ac` |
| maximum RSS                          | `483,491,840 bytes`                                                |
| new temporary roots after exit       | `0`                                                                |

V3 changes the header, HKDF / MAC domains, two milestone lines, and final-validation policy. Adding two estimated marker-line sizes to the v2 byte count would not be a v3 measurement. After source freeze, each gate and the full resume must be measured under one fixed machine and runtime configuration.

| v3 evidence                                  | 100 gate | 500 gate | 24,000 gate |
| -------------------------------------------- | -------: | -------: | ----------: |
| source revision                              |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| expected total JSONL lines                   |      102 |      503 |      24,004 |
| actual bytes                                 |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| wall time                                    |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| maximum RSS                                  |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| maximum line / read request                  |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| producer / completed / resumed               |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| same-gate retry producer / append / truncate |  `[TBD]` |  `[TBD]` |     `[TBD]` |

Validation numbers also remain unset until the source and tests are final.

| Validation                            | Result  |
| ------------------------------------- | ------- |
| focused v3 checkpoint tests           | `[TBD]` |
| v2 compatibility regression tests     | `[TBD]` |
| 24,000 scan-load / evidence validator | `[TBD]` |
| full Vitest                           | `[TBD]` |
| TypeScript / scoped ESLint / Prettier | `[TBD]` |
| Next production build                 | `[TBD]` |

## 8. Validation boundary and explicit non-claims

Even passing the source contract and synthetic tests would not make this a production run or a strength result. The current explicit counts are:

| Subject                                       | Execution, change, or claim in this change |
| --------------------------------------------- | -----------------------------------------: |
| production coordinator invocation             |                                          0 |
| deployment key-authority / production key use |                                          0 |
| real Floodgate dataset / holdout read         |                                          0 |
| teacher labels produced                       |                                          0 |
| training runs                                 |                                          0 |
| QAT seed 42 / 43 / 44 runs                    |                                  0 / 0 / 0 |
| model checkpoint / weight exports or changes  |                                          0 |
| live evaluation-function / weight activation  |                                          0 |
| matches / 81Dojo games                        |                                          0 |
| formal A/B pairs                              |                              0 / 192 pairs |
| formal A/B games                              |                              0 / 384 games |
| playing-strength claims                       |                                          0 |

The 32-byte root key and `key_id` supplied as test dependencies do not establish that the deployment key authority ran. A `key_id` proves neither key truth, key secrecy, nor production origin. The source accepts no real-dataset path, holdout reader, teacher-JSONL writer, training process, weight path, browser deployment, or match runner.

The HMAC establishes only that bytes produced by a trusted key holder remain bound to the run, stage, full input, runtime receipts, and chain, and that persisted-byte tampering by a non-key-holder is detectable. It does not establish engine-binary identity, runtime execution, label quality, non-repudiation, anti-rollback, or isolation from hostile same-process mutation. Neither a 100 / 500 prefix, a 24,000 seal, nor synthetic validation supports the claim that the evaluation function became stronger or reached stable high-dan strength.

## 9. Strength gates that remain after 24,000

After source freeze and validation, the execution order is 100 → 500 → 24,000 over the same full authenticated input and run identity. Each prefix audits throughput, timeout, failure, bounded abort / drain, resume, durability, and score distribution. There is no separate slice or dataset identity for 100 / 500, and no holdout opens before the 24,000 seal.

Even a sealed 24,000-parent teacher checkpoint only begins the strength-evaluation path. Fixed QAT seeds 42 / 43 / 44 must then run exactly as preregistered, without substituting a seed after seeing results. Fresh selection, fresh final, legacy final, known regressions, and production parity follow in that order.

Only a candidate that passes every internal gate may enter the **formal 192-pair / 384-game A/B**. The current counts are **0 / 192 pairs and 0 / 384 games**. Only after that A/B passes may separately authorized 81Dojo calibration begin. The completion condition for this change is therefore “close the v3 durability contract,” not “reach stable high-dan strength.”
