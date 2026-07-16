# Closing the production verifier over Git source and artifacts — Floodgate v7

> [PR #474](https://github.com/gomyway1216/nextjs-portfolio/pull/474) closes the fixed verifier's tracked source tree and seven pinned receipt/evidence artifacts over Git history before production registry creation and again during prefix-100 preflight. The post-review-fix implementation head is `9f647bef3568634f3b3c7634fb66a79ffa090723`, and the fixed verifier is `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`. This change executed no production registry, gate, teacher, label, training, selection, match, or live activation operation, and it did not change runOp1. Japanese version: [blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.md](./blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.md)

## 1. Result and current position

PR #473 was integrated with regular merge commit `7e4a4a9ffe5960a013d409f886d73e6041c7789e`. PR #474 was then opened ready for review and combines verifier revision, tracked source tree, pinned artifacts, and producer ancestry into one fail-closed readiness boundary. The [machine-readable evidence](./data/floodgate-v7-production-verifier-git-artifact-closure-2026-07-16.json) separately records the implementation head and the evidence-authoring snapshot in which the PR was open, CI was in progress, and review and regular merge were incomplete.

This is not evidence that production has started. A readiness success does not become registry authority, gate authority, a training label, or a playing-strength claim.

## 2. Why the revision had to move

The previous fixed revision did not contain the result receipt and six execution-evidence artifacts required by the production consumer, and it could not have the receipt producer as an ancestor. Creating the create-only registry with that revision risked persisting a configuration that could not satisfy both exact clean HEAD and artifact provenance.

The fixed revision therefore moves to `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`, which contains both the required source and artifacts. No existing registry was overwritten, adopted, or rotated.

## 3. The 313c -> 0f3 -> e8 provenance chain

The closure requires this order through Git ancestry:

```text
313c7699e206332f9d380858d90d0326a0a1fd12
  -> 0f3cadb76ec46eb82d5bc9623277525ce1d2252b
  -> e8a9197608cb48b1160b6707d97b0c4f78f90a1d
```

The first revision is the independent verifier, the middle revision is the pinned receipt/evidence producer, and the final revision is the selected production verifier. Artifact presence in the current worktree is insufficient: each artifact must equal its producer-revision Git blob byte for byte, and the producer must be an ancestor of the selected revision.

## 4. Exact clean tracked source tree

The selected e8 tree contains **1,431 blobs / 21,322,485 bytes**. Readiness requires a clean nonignored status under standard Git ignore rules, exact HEAD revision, no special index flags, and every tracked entry's mode and bytes to match the HEAD tree.

This exact-clean check runs once before and once after artifact verification, so the tracked tree alone reads at least **two passes / 42,644,970 bytes**. Ignored entries are outside the closure. Because every tracked byte is read, this is not a metadata-only check.

## 5. Seven artifacts and a 113,325-byte closure

The bounded set consists of one result receipt plus status, output, and timing evidence for each of publish and verify: **seven artifacts / 37,775 bytes** total. The seven are read twice from the worktree, before and after artifact verification, and once as Git blobs from the producer revision.

The minimum artifact-byte breakdown is therefore **75,550 worktree bytes** plus **37,775 Git-blob bytes**, or **113,325 bytes** total. Readiness is returned only when the before/after snapshot identity and bytes agree and the receipt contents, execution evidence, and fixed ancestry all validate.

## 6. Public privacy and single-use identity binding

The production entry point accepts no operator-supplied repository path or revision override. It privately derives the fixed repository from current OS user information, while the readiness receipt exports no path, user identifier, filesystem identity, private digest value, or private configuration.

The receipt carries a private identity binding that the provisioner or preflight can claim **exactly once per readiness receipt**. Substitution into another user context, replay of the same receipt, and malformed receipts all fail. This does not guarantee isolation from every arbitrary process running with the same user privileges.

## 7. A v1 readiness leaf and v2 consumer boundaries

The new leaf contract is `shogi-floodgate-v7-production-connector-verifier-readiness-v1`. Existing consumers that gain a closure-confirmation field and a `verifier-readiness` failure phase were not left as compatible v1 receipts; these boundaries move to v2:

- registry provisioner success and provisioning CLI failure;
- prefix-100 preflight core and claim boundary;
- preflight under-lock outcome; and
- preflight CLI success and failure.

Current source does not accept an old v1 receipt as a new success. A closure-unaware consumer cannot manufacture partial success, and an old receipt cannot appear to have passed the new check.

## 8. Verification before install and rechecking in preflight

The provisioner verifies readiness before current-key binding, approved enrollment, entropy acquisition, and create-only installation. A failure ends at phase `verifier-readiness`, with zero registry creations and a fresh invocation required.

Prefix-100 preflight reruns readiness after claiming the fixed registry configuration but before inspecting the runs namespace or deployment key. Failure produces a sanitized NO-GO without starting gate invocation, checkpointing, or namespace mutation. A provisioning-time success is not reused as future preflight authority.

## 9. How this differs from the measured full verifier

The accepted existing production full-verifier run measured **1045.52 seconds / 5,629,476,864 bytes maximum RSS**, and its confirmation measured **1089.52 seconds / 5,492,424,704 bytes maximum RSS**. Those heavy boundaries open the external role bundle and validate every role and its content.

After the bounded-read repair, the current read-only closure was repeated three times against the same clean e8 worktree, with exit zero every time. The runs measured **0.68 / 0.53 / 0.53 seconds** and **179,748,864 / 186,564,608 / 186,368,000 bytes maximum RSS**, with zero swap and zero block-output operations in every run. Those are OS measurements and are recorded separately from the source boundary performing zero persistent content or namespace writes. It read zero external role-bundle files and invoked the full verifier zero times. The faster closure is not equivalent to the full verifier: it establishes source/artifact provenance readiness and does not replace complete bundle-content verification. It also does not claim read-time access-time invariance or an atomic snapshot of the filesystem.

## 10. PR #474 validation boundary

At post-review-fix implementation head `9f647bef3568634f3b3c7634fb66a79ffa090723`, exact Git revision checking, the seven-artifact closure, the readiness leaf, and provisioner/preflight/CLI integration remain separate commits. Source regressions cover exact revision, dirty nonignored worktrees, tracked byte/mode differences, artifact and ancestry differences, identity replay, old-v1 shapes, failure before install, and the preflight recheck. Both actionable Copilot comments were fixed, replied to, and resolved with zero unresolved threads; Gemini reported zero actionable findings.

At pre-review validation candidate `5daa3128eedad8f2697af14569cf36c00825c2a4` (validated code revision `4b9a99781c6b20ce8e5365ebbae57ee46eae2890`), full Vitest passed **149 files / 2,794 tests** (155.41-second duration, 155.90-second wall time, 4,373,233,664-byte maximum RSS, zero swap), and the production build passed **193 / 193 pages** (36.60-second wall time, 2,605,105,152-byte maximum RSS, zero swap). The ML standard-library suite passed 58 / 58 and `npm audit` found zero vulnerabilities. At `9f647be`, the focused Git/receipt tests passed 2 files and 29 / 29 tests, TypeScript passed, and the three closure runs above passed. The earlier candidate's full result is not recounted as a current-head full success.

When this article and evidence were authored, [PR #474](https://github.com/gomyway1216/nextjs-portfolio/pull/474) was ready and open, CI was in progress, and review and regular merge were incomplete. Pending work is not reported as passing or merged. CI for the evidence-only head must be judged after it runs.

## 11. Every production execution counter remains zero

PR #474 has performed zero production registry provisions; prefix-100, prefix-500, or final-24000 gates; teacher generations or labels; training or optimizer steps; candidate selections or promotions; formal A/B games; external calibration games; or live activations. It also performed zero external role-bundle reads, zero full-verifier executions, and zero production weight overwrites.

runOp1 remains both the current production evaluator and rollback evaluator, and the live weight is unchanged. The closure therefore cannot be counted as evidence that the engine became stronger or reached stable high-dan strength.

## 12. Safe next order and the strength decision

After review and CI, PR #474 must be integrated with a regular merge. The authenticated 24,000 training-label finalizer then needs its own PR. The create-only registry remains unprovisioned until both have merged. Only then does the sequence continue through registry creation, the reviewed kill drill, prefix-100, prefix-500, final-24000, teacher labels, three-seed training, and selection.

A candidate still does not go directly live. Formal A/B remains **192 color-swapped pairs / 384 games**, followed by **200 external calibration games**. runOp1 stays in place until the safety, quality, playing-strength, and rollback-rehearsal evidence is complete; the final stable-high-dan judgment remains pending.
