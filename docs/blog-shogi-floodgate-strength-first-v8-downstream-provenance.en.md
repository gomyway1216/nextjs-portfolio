# The shortest bridge from the v8 teacher to training

As of July 19, 2026, the v8 teacher run is still progressing toward 24,000 parents. The 100- and 500-parent milestones are complete. At 500 parents, 499 produced training groups and one search timeout was quarantined without retaining any label. The observed progress at capture was 690 parents. This does not mean that retraining is complete or that the evaluation function is stronger.

This change adds the narrow bridge needed immediately after teacher completion so the correct dataset can move into three-seed training without another long detour. Teacher labels and retraining are the steps that directly affect playing strength. Training on a partial or internally inconsistent source would waste that compute and could damage the evaluator again, so the bridge performs one admission check at the boundary.

## What it checks

The TypeScript verifier reparses the authenticated source rows and checks the final result, manifest, staged result, 100/500 milestones, every work entry, per-parent completion rows, and training rows as one bound chain. Work is streamed, so all 24,000 parent entries are not loaded into memory at once.

Every parent must have exactly one disposition: an emitted training group, a forced skip with fewer than two legal moves, or a search-timeout quarantine with no label. The one timeout observed at the 500 milestone is included in this accounting. Relabeling its reason or introducing a partial label makes verification stop.

Python receives only safe aggregates: target parents, emitted groups, reason-specific skip counts, and training-row count. Parent identifiers, positions, and private inner-file digests are not published in the plan. The v2 plan pins the outer final result; immediately before training, the runtime rehashes every private inner file bound by that result.

## Validation completed now

- Full TypeScript typecheck: PASS
- Small end-to-end chain tests: 2 PASS, with at most 2 workers
- Shared teacher-generator regressions: 2 PASS, covering normal resume and timeout quarantine
- Focused Python plan, runtime bridge, and pre-selection gates: 89 PASS
- CLI path-override rejection and generic failure output: PASS

The full heavy suite and benchmarks were intentionally not run while the formal teacher consumes the machine. This bridge made zero network, AWS, Firebase/GCP, or Vercel requests and made zero live-weight changes.

## Playing-strength work still remaining

The remaining order is: finish all 24,000 teacher parents, verify the real artifacts, review the v2 plan, retrain seeds 42/43/44, select a candidate, run formal A/B, perform external calibration, and only then consider the gated live switch. Because the first teacher stage is still running, no high-dan or playing-strength improvement claim is justified yet.

The machine-readable record is in the [evidence JSON](./data/floodgate-strength-first-v8-downstream-provenance-2026-07-19.json).
