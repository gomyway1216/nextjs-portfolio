# Shogi evaluator: splitting exact-24,000 safety validation into five parallel jobs

> This is not an evaluator change. It improves how quickly candidates can be checked at the same strictness. It changes no `ml/` implementation, teacher-generation logic, training data, candidate weights, live weights, or production environment. Japanese version: [blog-shogi-floodgate-exact24k-ci-parallel-shards.md](./blog-shogi-floodgate-exact24k-ci-parallel-shards.md)

> **Publication status: LOCAL VALIDATION PASS; AWS SYNC / REVIEW / GITHUB CI PENDING.** All five scanner shards, Teacher, core unit with six heavy files excluded, and exact JSON file/title checks pass locally. The post-merge AWS aggregate edge, PR review, and GitHub CI are not yet complete. This record must not be reported as remote-CI evidence or production authorization.

## 1. Conclusion

The prior sealed-scanner test ran authority, mutation, replay, cleanup, and production-publication scenarios serially inside one Vitest test over 24,000 parents. Improving an individual scenario could not split the job, so one file remained a long serial section of CI.

The same coverage now has five explicit test files. Every file creates its own temporary directory, authenticated 24,000-parent fixture, and deployment-key fixture, then independently advances the **100 → 500 → exact 24,000** gates. The workflow matrix passes exact file paths; it uses neither a title filter (`-t`) nor generic `--shard`.

| Shard      | Fixed scope                                                                      | Local wall |
| ---------- | -------------------------------------------------------------------------------- | ---------: |
| authority  | lease capture, premature terminal handling, key-authority rejection              |    73.98 s |
| mutation   | pass-two sink failure, pathname replacement, seal-MAC corruption                 |   109.28 s |
| replay     | exact two-pass, opaque facade, single-flight, W / WT / WTR / WTRM replay         |   106.27 s |
| cleanup    | descriptor-close failure, sticky cleanup, plan-level aggregate cleanup failure   |   135.12 s |
| production | production-plan rejection, finalize/publish, result/manifest accounting, zeroize |   105.42 s |

With all five launched together on a 14-core, 48-GiB local Mac, the scanner critical path was the cleanup shard's **135.12 seconds**. Individual wall times sum to 530.07 seconds, so this run represents about a 3.92× wall-time reduction versus serial execution. It is not a GitHub-hosted measurement and excludes remote queueing, checkout, and `npm ci`.

## 2. The split preserves exactness

The parent count was not reduced for speed. Fixture construction and cleanup moved into shared test support, but every shard entry point still does the following:

1. requires the authenticated training identity to contain 24,000 records
2. requires the fixed V3 contract to specify 24,000 parents
3. checkpoints and seals fresh work at 100, 500, and 24,000
4. runs its shard-specific adversarial scenarios
5. removes its temporary root and restores mocks after the test

The conceptual scenarios from the old test are classified under 19 stable IDs. Those IDs must be globally unique across all shards; a duplicate or omission fails closed through inventory validation and unit tests.

The Teacher checkpoint file is isolated as a sixth heavy file and runs as its own exact-path job. The core unit job explicitly excludes that one Teacher file and the five scanner files. A machine-readable inventory fixes the exclusion set, five matrix ID/file pairs, 40 direct `it(...)` Teacher titles, and all 49 exact runtime titles.

## 3. A different test cannot impersonate success

CI does not trust only Vitest's exit status. Each heavy job writes a JSON report, and a separate verifier requires:

- exactly the inventory's test-file path
- the scanner's one exact inventory title or all 49 exact Teacher runtime titles
- no duplicate titles
- zero failed, pending, or todo tests
- zero failed or pending suites
- a passed file result and passed status for every assertion
- report-level `success: true`

The inventory validator also fixes its schema, the 24,000-parent count, `[100, 500, 24000]` gates, five shards, 19 conceptual case IDs, 40 direct / 49 runtime Teacher titles, and six core exclusions. It reads workflow wiring to reject a missing or duplicate file, `-t`, `--shard`, or an incomplete required aggregate. Test commands are fixed directly in the workflow, leaving the `package.json` pinned by existing production-identity evidence unchanged.

## 4. The required check remains fail closed

The final aggregate retains the exact name `Test and build` so existing branch protection continues to identify it. Work is split across core, the five-way scanner matrix, Teacher, external trust root, Darwin, and E2E jobs. The aggregate uses `if: always()` and explicitly requires every dependency result to equal `success`; a failed, cancelled, or skipped component cannot leave the aggregate green.

This branch is based on `ec64549e429803d406383376162eaeb9456df9ef`, which does not yet contain the concurrently developed `aws_witness_adapter_contract` job. Referencing a nonexistent job in `needs` would make the workflow invalid. After that PR merges normally, this branch must sync current `main` and add the AWS job to both aggregate `needs` and its result checks. Once the workflow contains the AWS job, the verifier fails unless that aggregate edge is present.

## 5. Local validation and limits

The measurement host is macOS arm64 with 14 physical/logical CPUs, 48 GiB RAM, Node 22.13.0, and npm 11.14.1.

| Validation                                         | Result                                    |
| -------------------------------------------------- | ----------------------------------------- |
| Scanner shards                                     | **5 files / 5 tests PASS**                |
| Scanner JSON exact file/title verification         | **5 / 5 PASS**                            |
| Inventory/adversarial verifier unit tests          | **4 / 4 PASS**                            |
| Teacher exact file / 49-runtime-title verification | **49 / 49 PASS, 101.16 seconds**          |
| Core unit with six explicit exclusions             | **186 files, 3,221 pass, 1 skip, 0 fail** |
| Core unit wall                                     | **80.86 seconds**                         |
| Lint / workflow / evidence validation              | **PASS**                                  |
| Local test-only critical path                      | **135.12 seconds (cleanup shard)**        |
| GitHub Actions                                     | **PENDING — not yet run**                 |
| Production `ml/` source changes                    | **0**                                     |
| Teacher / training / A/B / external calibration    | **0 / 0 / 0 / 0**                         |
| Live-weight changes / production execution         | **0 / 0**                                 |

Intermediate validation exposed two incorrect assumptions. First, the Teacher source has 40 direct `it(...)` declarations but parameter expansion produces 49 runtime assertions; the verifier correctly rejected the initial 40-title inventory. Second, earlier evidence tests conflated pinning historical workflow bytes with requiring the live workflow to remain byte-identical forever, and assumed the entire repository workflow could contain only one `upload-artifact` action. Historical revisions and hashes remain unchanged; the tests now validate the exact live external-trust-root job boundary. The focused 24 tests and the complete core suite pass after that correction.

The measured local test-only critical path is 135.12 seconds. GitHub queueing, checkout, `npm ci`, lint, and build have not yet been measured, so this publication makes no minute-level remote forecast. This candidate is not merge-ready until remote CI, review, and the AWS aggregate edge are complete.

## 6. Next gate

1. preserve separate logical commits and exact-review them
2. merge the AWS adapter-contract PR first under the normal merge policy
3. sync current `main` and add `aws_witness_adapter_contract` to `Test and build`
4. rerun inventory, workflow, evidence, and unit validation
5. open a ready-for-review PR, measure GitHub CI, and address review comments
6. merge normally only after every required check passes

This change does not make the evaluator stronger. It shortens the feedback loop needed to run teacher generation, retraining, candidate selection, formal A/B, and external calibration safely. Stable high-dan strength, candidate superiority, and production readiness all remain unestablished; live weights remain unchanged.
