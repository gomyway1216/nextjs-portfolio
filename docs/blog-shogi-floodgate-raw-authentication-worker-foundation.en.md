# How much of the 24,000-position authentication can use the whole machine?

> 2026-07-19 update: this document is the historical non-production foundation. See the [production follow-up](./blog-shogi-floodgate-raw-authentication-worker-production.en.md) for the source-closed twelve-worker wiring and real full-pass result.

The short answer is: **some of it can be parallelized**. The earlier statement that the process was inherently almost serial was too strong. Reading 36,349 receipts and checking their stored objects are independent operations. Multiple cores can perform that work as long as the results are merged back in canonical input order.

The complete 24,000-position authentication cannot become fourteen times faster, however. Role allocation incorporates positions used earlier in the canonical sequence. Running that state transition out of order could produce a different training / holdout split from the same input. A faster implementation that changes the proof is not acceptable.

This change isolates that boundary as a non-production foundation. It is not connected to formal v7, teacher generation, training, or the live weight. It uses no AWS, GCP/Firebase, or Vercel compute.

Japanese version: [24,000局面の認証は、どこまでフルパワー化できるか](./blog-shogi-floodgate-raw-authentication-worker-foundation.md)

## Measurements

On the Apple M4 Pro with 14 cores and 51,539,607,552 bytes of RAM, the benchmark used the same fixed 4,000-receipt prefix from the real completed CSA lock. The current serial implementation was the reference. The 1-, 4-, 8-, and 12-worker runs were reordered across three samples each. All twelve runs produced receipt content and input order exactly equal to the serial reference.

A separate mixed-kind check used 90 daily listings, 90 daily ratings, one period inventory, and 24 CSA receipts, for 205 tasks total. Every 1 / 4 / 8 / 12 worker result exactly matched serial, exercising response capture for all four receipt kinds on real data.

|           Path |      Median | Versus current serial | Observed peak RSS |
| -------------: | ----------: | --------------------: | ----------------: |
| Current serial | 2,087.96 ms |                 1.00x |            315 MB |
|       1 worker | 2,559.35 ms |                 0.82x |            354 MB |
|      4 workers | 1,124.14 ms |                 1.86x |            403 MB |
|      8 workers |   859.82 ms |                 2.43x |            468 MB |
|     12 workers |   775.08 ms |                 2.69x |            532 MB |

One worker is slower than the current serial path because it pays worker startup and TypeScript runtime loading costs. Moving from eight to twelve workers improved wall time by about 9.9% while adding about 64 MB of observed RSS. Both eight and twelve therefore advanced to the full comparison; the 36,349-task comparison below selected twelve.

A separate full raw-pass measurement covered all 36,349 tasks through reconstruction. The serial path at that source stage took 33.29 seconds with maximum RSS of 606,666,752 bytes. Four workers took 20.14 seconds with maximum RSS of 727,515,136 bytes. That is a 1.65x wall-time speedup and a 13.15-second saving per pass. This number was measured immediately before parent-side response capture was hardened, so it remains historical evidence and is not used as the accepted current-source result.

The first hardened-source full diagnostic timed only worker verification plus test-core reconstruction: 11.756 / 10.635 / 9.438 seconds at 4 / 8 / 12 workers. Its 35.008-second serial reference also included candidate revalidation and manifest serialization comparison. The initially calculated 3.71x was therefore not a like-for-like production-speed comparison and is withdrawn. The intermediate values remain in the audit JSON.

The final comparison also performs candidate revalidation, reconstruction, and two manifest serializations on the worker path. Test-core deep equality remains as conservative work beyond the production shape; this is still an emulation, not production wiring. With no other heavy repository test running, it measured 4→8→12 and then 12→8→4.

| Production-shape emulation |  Round 1 |  Round 2 |   Median | Versus serial 35.008 s |
| -------------------------: | -------: | -------: | -------: | ---------------------: |
|                  4 workers | 15.765 s | 15.571 s | 15.668 s |                  2.23x |
|                  8 workers | 13.861 s | 13.721 s | 13.791 s |                  2.54x |
|                 12 workers | 12.503 s | 12.334 s | 12.418 s |                  2.82x |

All six runs reconstructed 36,349 receipts successfully. Twelve workers were 9.96% faster than eight. Every observed RSS sample remained below 1 GB, but those are reused-process observations affected by run order, not per-worker allocation limits. Twelve is the non-production recommendation for this raw pass.

One more final-source run retained both serial and 12-worker results in the same process and compared all 36,349 entries. Every receipt, listing / period evidence object, input ordinal, and canonical receipt byte sequence was exactly equal; reconstruction from those results also passed 36,349 / 36,349.

A one-sample regression check after the deadline hardening used 4,000 real CSA receipts. Against the current serial 2,141.96 ms reference, 4 / 8 / 12 workers took 1,113.32 / 885.38 / 793.61 ms; twelve workers were 2.70x faster. Every worker count remained exactly equal to serial in input order. This single sample checks that deadlines did not cause a material regression; it does not replace the full end-to-end rerun after source closure.

## Why this does not turn eighteen minutes into three

The complete authentication performs four raw-verifier passes, or 145,396 receipt validations. If every pass saved the production-shape median difference of 22.590 seconds, the total saving would be about 90.360 seconds. Projecting that onto the historical 1,088.743-second run gives 998.383 seconds: 18.15 minutes becomes 16.64 minutes. The gain is real, but this remains a projection from raw-pass measurements rather than a measured end-to-end authentication.

The larger serial floor is role-semantic replay. A stored-input diagnostic measured one pure replay at 191.86 seconds, and the full bundle performs it twice. Per-position immutable preparation can eventually move to workers, but committing the global blocked set and final roles must retain canonical input order.

The 24,000-row training parser is not the main cost. It took 31 / 82 / 159 ms for 100 / 500 / 1,000 rows. More RAM or SSD capacity does not remove the dominant work. The historical full authentication also reported zero block input and output operations because the raw lock was already page-cached. The roughly 100,624,528 KiB of free storage is ample, but capacity cannot solve CPU work and ordered state transitions.

Duplicating the entire verifier eight times is not a solution either. Each process would independently prove the same input without shortening one completion. Multiplying the historical 5.63 GB peak RSS by eight approaches 45 GB and removes safe headroom on a 48 GiB machine. The useful design is a small persistent pool receiving compact independent tasks.

## What the foundation contains, and where it stops

The non-production worker foundation now provides:

- At most one active task per worker
- An input ordinal on every task and deterministic ordered result merging
- The lowest input-index failure, rather than whichever failure happens first in wall-clock time
- Verified receipts and compact evidence across the thread boundary, never duplicate raw bytes
- Exact 1 / 4 / 8 / 12 worker equivalence, canonical receipt-byte, failure-order, and in-flight-bound tests
- A 60-second task-response deadline and a five-second graceful-shutdown deadline, followed by forced worker termination
- Real-worker injection of startup error, a later worker-constructor failure after an earlier worker was created, task hang, shutdown hang, malformed response, extra message, and reversed failure timing, with zero workers left after every abnormal test
- A 384 MB V8 old-generation limit per worker and an explicit maximum of twelve workers; this is not a process RSS limit

The production verifier imports none of this pool. A worker currently loads its TypeScript entry and the `tsx` runtime by path after spawn. Even if the main verifier has checked a clean commit, that does not yet prove that the worker later reads the same bytes.

Before production connection, a code-pinned manifest must bind the worker entry and its transitive runtime dependencies. The system must recheck the exact-clean revision before spawn and after every worker has finished, and reject symlink or path swaps, a dirty tree, and mid-run source mutation. Authentication source identity is not traded away for speed.

The initial independent review reported zero P0s, zero P1s, and one P2: task response and shutdown / exit had no deadline, so a live but non-responsive worker could wait forever. The same foundation now adds a task deadline, forced termination after the shutdown deadline, and eight real-worker fault-injection scenarios. All 17 focused tests pass, and every abnormal test leaves zero workers. Independent re-review of the deadline-hardened version passed with zero P0, P1, or P2 findings. Production remains disconnected.

## Next sequence

1. Build a self-contained, pinned worker runtime and source closure, then obtain a separate independent review.
2. Remeasure end-to-end 12-worker authentication after source closure and connect the raw verifier to production only after that evidence passes.
3. Pursue the larger gain by moving immutable per-position preparation from role replay into workers while keeping the ordered commit on the main thread.
4. After authentication, continue with the planned twelve teacher engine processes. The current formal v7 work must not restart or wait for this foundation.

This work reduces authentication latency; it does not itself show that the evaluation function is stronger. Stable high-dan strength still depends on teacher labels, retraining, candidate selection, and formal A/B. The live-weight change count remains zero.

The complete samples and claim boundaries are preserved in the [machine-readable audit](./data/floodgate-raw-authentication-worker-foundation-2026-07-19.json).
