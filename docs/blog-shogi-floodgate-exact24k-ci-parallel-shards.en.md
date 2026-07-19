# Shogi evaluator: splitting exact-24,000 safety validation into five parallel jobs

> This is not an evaluator change. It improves how quickly candidates can be checked at the same strictness. It changes no `ml/` implementation, teacher-generation logic, training data, candidate weights, live weights, or production environment. Japanese version: [blog-shogi-floodgate-exact24k-ci-parallel-shards.md](./blog-shogi-floodgate-exact24k-ci-parallel-shards.md)

> **Publication status: LOCAL VALIDATION PASS; AWS PR #508 MERGED; POST-MERGE MAIN CI PASS; CURRENT-BRANCH GITHUB CI PENDING.** The AWS source-only contract entered `main` through regular merge commit `42d8757dde054f969942b9995f6b254c845839c5`, and this branch merged that `main` at `2a9031513b190382f2fcfd5717fb8c87f4e92bdd`. Post-merge main CI run `29672131794` passed 5 / 5 and security run `29672131782` passed 1 / 1. This exact-24k branch has not yet run its own GitHub CI or PR review. The AWS job remains source-only and unconnected to production credentials, networks, services, or live weights.

## 1. Conclusion

The prior sealed-scanner test ran authority, mutation, replay, cleanup, and production-publication scenarios serially inside one Vitest test over 24,000 parents. Improving an individual scenario could not split the job, so one file remained a long serial section of CI.

The same coverage now has five explicit test files. Every file creates its own temporary directory, authenticated 24,000-parent fixture, and deployment-key fixture, then independently advances the **100 → 500 → exact 24,000** gates. The workflow matrix passes exact file paths; it uses neither a title filter (`-t`) nor generic `--shard`.

| Shard      | Fixed scope                                                                      | Local wall |
| ---------- | -------------------------------------------------------------------------------- | ---------: |
| authority  | lease capture, premature terminal handling, key-authority rejection              |    75.74 s |
| mutation   | pass-two sink failure, pathname replacement, seal-MAC corruption                 |   112.35 s |
| replay     | exact two-pass, opaque facade, single-flight, W / WT / WTR / WTRM replay         |   108.69 s |
| cleanup    | descriptor-close failure, sticky cleanup, plan-level aggregate cleanup failure   |   138.54 s |
| production | production-plan rejection, finalize/publish, result/manifest accounting, zeroize |   107.60 s |

With all five launched together on a 14-core, 48-GiB local Mac, the scanner critical path was **138.589 seconds**. Individual wall times sum to 542.92 seconds, so this run represents about a 3.917× wall-time reduction versus serial execution. It is not a GitHub-hosted measurement and excludes remote queueing, checkout, and `npm ci`.

## 2. The split preserves exactness

The parent count was not reduced for speed. Fixture construction and cleanup moved into shared test support, but every shard entry point still does the following:

1. requires the authenticated training identity to contain 24,000 records
2. requires the fixed V3 contract to specify 24,000 parents
3. checkpoints and seals fresh work at 100, 500, and 24,000
4. runs its shard-specific adversarial scenarios
5. removes its temporary root and restores mocks after the test

The conceptual scenarios from the old test are classified under 19 stable IDs. After independent audit, those IDs are no longer inventory-only descriptions. Each scenario appends its ID to an ordered runtime receipt only after its checks finish, and the receipt cannot seal unless the exact ordered set is complete. The five Vitest reports now expose authority 3, mutation 3, replay 6, cleanup 3, and production 4 as 19 actual runtime tests. Invented IDs, wrong order, duplicates, and omissions fail closed.

The Teacher checkpoint file is isolated as a sixth heavy file and runs as its own exact-path job. The core unit job explicitly excludes that one Teacher file and the five scanner files. A machine-readable inventory fixes the exclusion set, five matrix ID/file pairs, 40 direct `it(...)` Teacher titles, and all 49 exact runtime titles.

## 3. A different test cannot impersonate success

CI does not trust only Vitest's exit status. Each heavy job writes a JSON report, and a separate verifier requires:

- exactly the inventory's test-file path
- each scanner's immutable runtime-case set (3 / 3 / 6 / 3 / 4) or all 49 exact Teacher runtime titles
- no duplicate titles
- zero failed, pending, or todo tests
- exactly two passing suites per target, with nonnegative integer and internally consistent suite/test counters
- an `assertionResults` count, title set, and statuses consistent with those counters
- a passed file result and passed status for every assertion
- report-level `success: true`

The inventory validator also fixes its schema, the 24,000-parent count, `[100, 500, 24000]` gates, five shards, 19 runtime case IDs, 40 direct / 49 runtime Teacher titles, and six core exclusions. A checked-in strict parser reads the workflow as jobs, matrices, steps, `run` blocks, and `needs`, rather than searching raw strings. Commented-out wiring, decoy text, duplicates, disabled steps, and missing result checks cannot impersonate success. Scanner and Teacher reports must upload from hidden `.artifacts` paths with `include-hidden-files: true` and `if-no-files-found: error`. Commands remain fixed directly in the workflow, while `package.json` and `package-lock.json` retain the exact bytes pinned by production-identity evidence.

## 4. The required check remains fail closed

The final aggregate retains the exact name `Test and build` so existing branch protection continues to identify it. Work is split across core, the five-way scanner matrix, Teacher, external trust root, the AWS source-only contract, Darwin, and E2E jobs. The aggregate uses `if: always()` and explicitly requires every dependency result to equal `success`; a failed, cancelled, or skipped component cannot leave the aggregate green.

The initial base `ec64549e429803d406383376162eaeb9456df9ef` did not contain the AWS job. [PR #508](https://github.com/gomyway1216/nextjs-portfolio/pull/508) was subsequently merged normally as `42d8757d`, and this branch merged that `main` at `2a903151`. The current workflow unconditionally fixes `aws_witness_adapter_contract` as one of seven required jobs. The verifier rejects a mutation that removes the AWS job together with its aggregate need and result check, rather than silently shrinking the required set.

Making the job required does not connect AWS to production. As its name says, it checks an SDK-free source contract plus public-surface and isolation properties. No AWS SDK client, credential, endpoint, network call, or production connector is wired.

## 5. Local validation and limits

The measurement host is macOS arm64 with 14 physical/logical CPUs, 48 GiB RAM, Node 22.13.0, and npm 11.14.1.

| Validation                                         | Result                                          |
| -------------------------------------------------- | ----------------------------------------------- |
| Scanner shards                                     | **5 files / 19 tests / 10 suites PASS**         |
| Scanner JSON exact file/runtime-case verification  | **5 / 5 PASS**                                  |
| Inventory/adversarial verifier unit tests          | **13 / 13 PASS (Node 22)**                      |
| Teacher exact file / 49-runtime-title verification | **49 / 49 PASS, 101.16 seconds**                |
| Core unit with six explicit exclusions             | **187 files, 3,229 pass, 1 skip, 0 fail**       |
| Core unit wall                                     | **81.54 seconds**                               |
| Lint / workflow / evidence validation              | **PASS**                                        |
| Dependency-free ML contracts                       | **119 / 119 PASS, 11.59 seconds**               |
| Production build                                   | **PASS, 28.87 seconds**                         |
| Local test-only critical path                      | **138.589 seconds (five concurrent shards)**    |
| First-rereview focused validation                  | **5 files / 37 tests PASS**                     |
| Final integrated rereview validation               | **5 files / 37 tests PASS (Node 22)**           |
| Post-merge `main` CI / security                    | **29672131794: 5 / 5; 29672131782: 1 / 1 PASS** |
| Current exact-24k branch GitHub Actions            | **PENDING — not yet run**                       |
| Production `ml/` source changes                    | **0**                                           |
| Teacher / training / A/B / external calibration    | **0 / 0 / 0 / 0**                               |
| Live-weight changes / production execution         | **0 / 0**                                       |

Intermediate validation exposed three incorrect assumptions. First, the Teacher source has 40 direct `it(...)` declarations but parameter expansion produces 49 runtime assertions; the verifier correctly rejected the initial 40-title inventory. Second, earlier evidence tests conflated pinning historical workflow bytes with requiring the live workflow to remain byte-identical forever, and assumed the entire repository workflow could contain only one `upload-artifact` action. Historical revisions and hashes remain unchanged while tests validate the exact live external-trust-root job boundary. Third, the first plan to add a general YAML package directly was rejected by the production-identity regression test. It was replaced with a dependency-free strict structural parser, restoring `package.json` and the lockfile to their exact original bytes.

Independent rereview ran in two rounds. The first found **one P1 and two P2s**. The P1 required exact allowed keys on every required job and rejection of job-level `if` / `continue-on-error`; the P2s covered exact scanner/Teacher ordered-step and upload contracts, plus own-property shard IDs and prototype-safe YAML mappings. Commit `4c923ccb` remediated them and added adversarial negative tests. The second found **one P1 and one P2**. Its P1 was that the required set could still shrink with AWS job presence after the merge; its P2 was stale pre-merge wording in the bilingual articles and evidence. Commit `a34b76fe` makes AWS unconditionally required and rejects the deletion mutation; this section and the machine-readable evidence correct the P2.

The measured local test-only critical path is 138.589 seconds. Post-merge `main` CI and security passed, but GitHub queueing, checkout, `npm ci`, lint, and build have not yet been measured on the current exact-24k branch head. The AWS source contract also remains unconnected to production. This candidate is not merge-ready until current-branch remote CI and review complete.

## 6. Next gate

1. final-exact-review the separate code and evidence commits
2. rerun inventory, workflow, evidence, and unit validation under Node 22
3. open a ready-for-review PR and measure current-branch GitHub CI
4. fix only actionable review comments and CI failures
5. merge normally only after every required check passes

This change does not make the evaluator stronger. It shortens the feedback loop needed to run teacher generation, retraining, candidate selection, formal A/B, and external calibration safely. Stable high-dan strength, candidate superiority, and production readiness all remain unestablished; live weights remain unchanged.
