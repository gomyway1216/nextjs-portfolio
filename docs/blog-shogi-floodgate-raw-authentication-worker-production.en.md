# Productionizing twelve-core raw authentication without changing the proof

The result first: one observed pass over all 36,349 raw receipts took 31.706 seconds on the current serial path and 15.680 seconds on the source-closed production twelve-worker path. **The ratio in this one run was 2.022x, with a 16.026-second difference per pass.** The serial and parallel reports were deep-strictly equal, the candidate manifest had identical canonical bytes, and the stored raw-manifest bytes were unchanged before and after the run.

This is the production follow-up to the earlier [non-production foundation](./blog-shogi-floodgate-raw-authentication-worker-foundation.en.md). It uses only the local Mac. It uses no AWS, GCP/Firebase, Vercel compute, or network request, and changes no teacher generation, training, formal A/B, or live weight.

Japanese version: [24,000局面の実認証を、証明を変えずに12並列へつないだ](./blog-shogi-floodgate-raw-authentication-worker-production.md)

## Real measurement

The same completed raw lock and candidate manifest were processed exactly once per path, serial first and production twelve-worker second, on Node v22.13.0, an Apple M4 Pro with fourteen cores, and 48 GB of RAM. There was no explicit page-cache warmup, repetition, or counterbalancing. Because the serial path read every receipt first, the later parallel path may have benefited from the warmed page cache; cache and order bias were not removed. The 2.022x value is therefore one observation in that order, not an order-neutral throughput estimate. The clock was `process.hrtime.bigint`; process RSS was sampled every 5 ms.

| Real path                            |    36,349 receipts |  Observed peak RSS | Result                |
| ------------------------------------ | -----------------: | -----------------: | --------------------- |
| Current serial                       |      31,705.588 ms |  355,041,280 bytes | PASS                  |
| Source-closed production, 12 workers |      15,679.927 ms |  754,171,904 bytes | PASS                  |
| Difference                           | **-16,025.661 ms** | +399,130,624 bytes | reports exactly equal |

The observed twelve-worker/serial ratio in this serial-first run is 2.022049x. The observed production peak was about 719 MiB on the 48 GB machine, a modest memory cost for the throughput gained. The 384 MiB × 12 old-generation setting is a V8 configuration ceiling, not reserved memory or measured RSS.

The earlier production-shape emulation observed 2.82x, but the only accepted production-path observation is the serial-first 2.02x single run with the bias limitation above. This measurement includes actual candidate revalidation, a held read of the worker bundle, an exact-clean check of the complete tracked Git tree, and a same-revision recheck after worker exit. A faster number that omits the safety boundary is not reported as production speed.

A reverse-order follow-up completed and still produced equal outputs, but its temporary inline timer computed elapsed time before awaiting the operation. Its 0.003 / 0.005 ms values are clearly invalid and excluded. Intermediate failures are retained rather than selected when convenient.

## Workers do not read a pathname after spawn

The former production blocker was that each worker loaded its TypeScript entry and `tsx` runtime by pathname after spawn. A clean parent revision did not rule out later byte substitution.

The production route now:

- bundles exactly four transitive sources under an esbuild input allowlist;
- rejects every external runtime import except Node builtins;
- pins the tracked 54,297-byte CJS bundle by SHA-256;
- opens a current-user-owned, single-link regular file with `O_NOFOLLOW` and checks mode, size, and digest;
- passes the verified bytes in memory to `Worker(..., { eval: true, execArgv: [] })`;
- holds the bundle, parent-directory, and repository descriptors until every worker exits;
- rejects symlinks, pathname swaps, in-place mutation followed by byte restoration, and parent-directory churn;
- requires the worker to match the parent's Node version, V8 version, module ABI, executable path, platform, and architecture; and
- rebuilds the tracked bundle byte-identically from source during normal unit validation.

No production worker rereads TypeScript, `tsx`, `node_modules`, or the repository bundle pathname after spawn.

## Historical semantic verification and current worker source are separate

Review found one important integration error. The role bundle authenticates fixed historical semantic-verifier revision `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`, while the loaded worker pool lives in the current runner repository. The initial composition incorrectly treated the historical revision as the worker-source revision. That old tree does not contain the new bundle, so the next formal run would have stopped.

The corrected authorities are separate:

- the historical verifier root and revision continue to authenticate role-lock semantics and ancestry;
- the worker source uses the repository containing the currently loaded module, derived from `__dirname`;
- the current HEAD is captured exact-clean immediately before spawn and the same revision is rechecked after every worker exits; and
- the historical semantic revision is never reinterpreted as the current worker revision.

An integration test uses distinct roots and revisions to keep this mistake closed.

## Canonical order and failure order remain unchanged

Tasks receive ordinals in the existing serial order: UTF-8-bytewise listings, daily ratings, period inventory, then UTF-8-bytewise CSA receipts. Completion can occur in any order, but results are merged by ordinal. When multiple tasks fail, the lowest input ordinal wins rather than the earliest wall-clock failure.

The parent recaptures the exact response shape, receipt kind, URL, and body identity. Raw bytes never cross the thread boundary. Tasks have a 60-second deadline, shutdown has a five-second deadline, and a stuck worker is terminated. Existing constructor-failure, hang, malformed-response, extra-message, and reversed-failure-timing tests remain in place.

## Effect on complete authentication and the remaining floor

The historical 1,088.743-second complete authentication performed four raw passes. Projecting the 16.025661-second difference from this single run, whose cache/order bias was not removed, across four passes yields a 64.102646-second difference and a projected 1,024.640 seconds, or about 17.08 minutes.

This is explicitly a **projection, not a measured complete authentication**. The next formal run must perform the same authentication itself and then use twelve teacher engines. A separate 16–18-minute duplicate was deliberately not started because it would contend with that required work.

Even a hypothetical zero-second raw verifier leaves a floor of roughly 961.921 seconds, or 16.03 minutes, when calculated from the same historical run. The next material acceleration target is immutable per-position preparation inside role replay. Committing the global blocked set must remain in canonical order. Merely filling RAM or SSD capacity cannot remove that dependency.

## Validation and claim boundary

At the implementation revision, 25 worker/source/raw-verifier tests and 110 role-lock/bundle/training-consumer tests passed, along with targeted ESLint, byte-identical bundle rebuilding, and the diff check. Independent review and CI are recorded at the PR stage.

This change demonstrates lower authentication latency only. It is not evidence about evaluation-function strength, teacher-label quality, retraining, candidate selection, formal A/B, stable high-dan play, or live deployment. Machine-readable values are preserved in the [production evidence](./data/floodgate-raw-authentication-worker-production-2026-07-19.json).
