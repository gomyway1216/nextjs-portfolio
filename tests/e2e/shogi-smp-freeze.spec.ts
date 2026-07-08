import { test, expect } from '@playwright/test';

/**
 * shogi-smp-freeze.spec.ts — faithful Lazy SMP freeze reproduction (gate 1b).
 *
 * Drives the REAL production worker client (real Web Workers + MessageChannel +
 * the COEP cross-origin-isolated optimized bundle) from headless Chromium over
 * hundreds of positions, at hard/expert-class budgets, across game phases
 * (opening/midgame/endgame). This is the closest local proxy to the browser
 * runtime where the historical freeze ("AI Thinking…" forever) occurred — the
 * factor the node worker_threads harness cannot exercise.
 *
 * Requires the page's ?smpharness=1 test hook (ShogiImproved.tsx), which is
 * inert without that query param. Runs against `npm run start` (production
 * build) via playwright.config.ts.
 *
 * Tunables via env:
 *   SMP_MOVES   total searches to run (default 200)
 *   SMP_MS      per-search budget in ms (default 2000 = hard)
 *   SMP_HANG_MS per-search ceiling; exceeding it = freeze observed (default 15000)
 */

const MOVES = Number(process.env.SMP_MOVES ?? 200);
const BUDGET_MS = Number(process.env.SMP_MS ?? 2000);
const HANG_MS = Number(process.env.SMP_HANG_MS ?? 15000);
// Generous overall test timeout: MOVES * (hang ceiling + overhead) + slack.
// Use HANG_MS (not budget) so a run full of near-ceiling stalls still fits.
const TEST_TIMEOUT = MOVES * (HANG_MS + 1000) + 180_000;

interface HarnessResult {
  ran: number;
  isolated: boolean;
  sharedArrayBuffer: boolean;
  hardwareConcurrency: number;
  smpOn: boolean;
  timings: number[];
  hangs: Array<{ index: number; phase: string; ms: number; tesu: number }>;
  timeouts: number;
  illegal: number;
  noMove: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
}

// On-demand stress tool, not part of the default CI smoke run (it drives
// hundreds of multi-second searches). Enable with SMP_STRESS=1.
test.describe('Lazy SMP freeze reproduction (faithful, headless Chromium)', () => {
  test.skip(process.env.SMP_STRESS !== '1', 'set SMP_STRESS=1 to run the long freeze-repro stress');
  test.setTimeout(TEST_TIMEOUT);

  test('drive the production worker client over many positions without freezing', async ({ page }) => {
    const smpConsole: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[SMP]')) smpConsole.push(`${msg.type()}: ${text}`);
      // Stream harness progress + any SMP stall lines live to the test stdout so
      // we get partial output even if the run later times out.
      if (text.includes('[HARNESS]') || /SLOW\/STALL|STALL\?|TIMED OUT/.test(text)) {
        // eslint-disable-next-line no-console
        console.log(text);
      }
    });
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.log(`[PAGEERROR] ${err.message}`);
    });

    await page.goto(`/games/shogi?smpharness=1`);
    // Wait for the test hook to install.
    await page.waitForFunction(
      () => (window as unknown as { __smpHarnessReady?: boolean }).__smpHarnessReady === true,
      { timeout: 30_000 }
    );

    const result: HarnessResult = await page.evaluate(
      async ({ moves, budgetMs, hangMs }) => {
        type K = { teban: number; clone(): K };
        type Te = { koma: number; from: number; to: number; promote: boolean; capture: number };
        const w = window as unknown as {
          __smpHarness: {
            createClient: () => {
              requestBestMoveWithInfo: (
                pos: unknown,
                difficulty: string,
                tesu: number
              ) => Promise<{ move: unknown | null; depth?: number }>;
              terminate: () => void;
              clearTT: () => void;
            };
            serialize: (k: K) => unknown;
            newHirate: () => K;
            legalMoves: (k: K) => Te[];
            cloneK: (k: K) => K;
          };
        };
        const H = w.__smpHarness;

        const isolated = self.crossOriginIsolated;
        const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        const hardwareConcurrency = navigator.hardwareConcurrency || 1;

        // Deterministic random self-play to generate varied positions across
        // phases; snapshot every position and cycle through them.
        function mulberry32(seed: number): () => number {
          let a = seed >>> 0;
          return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }

        const phaseSnapshots = [12, 24, 36, 48, 64, 80];
        const positions: Array<{ k: K; tesu: number; phase: string }> = [];
        for (let game = 0; game < 5; game++) {
          const rnd = mulberry32(0x51b0 + game * 7919);
          const k = H.newHirate();
          const maxPly = phaseSnapshots[phaseSnapshots.length - 1];
          for (let ply = 0; ply < maxPly; ply++) {
            const legal = H.legalMoves(k);
            if (legal.length === 0) break;
            const te = legal[Math.floor(rnd() * legal.length)];
            te.capture = 0;
            // Apply via the same path the game uses. move()+toggleTeban live on
            // KyokumenImproved; call them through the harness clone semantics.
            (k as unknown as { move: (t: Te) => void; toggleTeban: () => void }).move(te);
            (k as unknown as { toggleTeban: () => void }).toggleTeban();
            const tesu = ply + 1;
            if (phaseSnapshots.includes(tesu) && H.legalMoves(k).length > 0) {
              const phase = tesu <= 24 ? 'opening' : tesu <= 48 ? 'midgame' : 'endgame';
              positions.push({ k: H.cloneK(k), tesu, phase });
            }
          }
        }

        console.log(
          `[HARNESS] env: isolated=${isolated} SAB=${sharedArrayBuffer} ` +
            `cores=${hardwareConcurrency} positions=${positions.length}`
        );
        const bootT0 = performance.now();
        const client = H.createClient();
        // Give the workers a beat to boot + spawn helpers before hammering.
        await new Promise((r) => setTimeout(r, 1500));
        console.log(`[HARNESS] client created + booted in ${(performance.now() - bootT0).toFixed(0)}ms`);

        const timings: number[] = [];
        const hangs: Array<{ index: number; phase: string; ms: number; tesu: number }> = [];
        let timeouts = 0;
        let illegal = 0;
        let noMove = 0;
        let smpOn = false;

        // hard = 2000ms budget in production; expert = 4000. Use "hard" so we
        // can fit more moves; a stall is a stall at any budget.
        const difficulty = budgetMs >= 4000 ? 'expert' : 'hard';

        for (let i = 0; i < moves; i++) {
          const pos = positions[i % positions.length];
          // Reset TT occasionally to mimic new games (production keeps TT across
          // moves of one game).
          if (i % 8 === 0) client.clearTT();

          const posSer = H.serialize(pos.k);
          const t0 = performance.now();
          // Race the request against a hard ceiling: if it never resolves, THAT
          // is the freeze — record it and move on (do not hang the whole test).
          let hung = false;
          const info = await Promise.race([
            client.requestBestMoveWithInfo(posSer, difficulty, pos.tesu).catch((e: unknown) => {
              // The client's own 20s watchdog rejects on a true hang.
              return { move: null, __err: String(e) } as { move: null; __err: string };
            }),
            new Promise<{ move: null; __hang: true }>((r) =>
              setTimeout(() => r({ move: null, __hang: true }), hangMs)
            ),
          ]);
          const ms = performance.now() - t0;
          timings.push(ms);

          if ((info as { __hang?: true }).__hang) {
            hung = true;
            hangs.push({ index: i, phase: pos.phase, ms, tesu: pos.tesu });
            console.log(`[HARNESS] !! HANG move ${i} (${pos.phase} tesu${pos.tesu}) exceeded ${hangMs}ms ceiling`);
          } else if ((info as { __err?: string }).__err) {
            timeouts++;
            console.log(`[HARNESS] !! CLIENT-TIMEOUT move ${i} (${pos.phase}) err=${(info as { __err: string }).__err}`);
          } else if (!info.move) {
            noMove++;
          }
          void hung;
          if (i < 3 || (i + 1) % 10 === 0 || ms > budgetMs * 1.8) {
            console.log(
              `[HARNESS] move ${i + 1}/${moves} ${pos.phase} tesu${pos.tesu}: ${ms.toFixed(0)}ms ` +
                `(budget=${budgetMs}ms) depth=${(info as { depth?: number }).depth ?? '?'}`
            );
          }
          // If we just observed a hang, keep going — later moves show whether it
          // recovers or the client is permanently wedged.
        }

        // Detect whether SMP actually turned on from the console is done on the
        // node side; here we approximate via isolation + core count.
        smpOn = isolated && sharedArrayBuffer && Math.min(4, Math.max(1, hardwareConcurrency - 2)) >= 2;

        client.terminate();

        const sorted = [...timings].sort((a, b) => a - b);
        const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
        return {
          ran: timings.length,
          isolated,
          sharedArrayBuffer,
          hardwareConcurrency,
          smpOn,
          timings,
          hangs,
          timeouts,
          illegal,
          noMove,
          median: pct(50),
          p95: pct(95),
          p99: pct(99),
          max: sorted.length ? sorted[sorted.length - 1] : 0,
        };
      },
      { moves: MOVES, budgetMs: BUDGET_MS, hangMs: HANG_MS }
    );

    // ---- Report -------------------------------------------------------------
    const smpOnLines = smpConsole.filter((l) => /SMP is ON|Lazy SMP ENABLED|Lazy SMP spawned/.test(l));
    const stallLines = smpConsole.filter((l) => /SLOW\/STALL|STALL\?|TIMED OUT/.test(l));
    console.log('=== SMP faithful freeze reproduction ===');
    console.log(
      `env: crossOriginIsolated=${result.isolated} SharedArrayBuffer=${result.sharedArrayBuffer} ` +
        `hardwareConcurrency=${result.hardwareConcurrency} smpOn(approx)=${result.smpOn}`
    );
    console.log(`SMP-on console evidence: ${smpOnLines.length ? smpOnLines.slice(0, 3).join(' | ') : '(none)'}`);
    console.log(
      `ran=${result.ran} budget=${BUDGET_MS}ms hangCeiling=${HANG_MS}ms | ` +
        `median=${result.median.toFixed(0)}ms p95=${result.p95.toFixed(0)}ms ` +
        `p99=${result.p99.toFixed(0)}ms max=${result.max.toFixed(0)}ms`
    );
    console.log(
      `hangs(>ceiling)=${result.hangs.length} timeouts(client-watchdog)=${result.timeouts} ` +
        `noMove=${result.noMove} illegal=${result.illegal}`
    );
    if (result.hangs.length) {
      console.log('HANG DETAILS:', JSON.stringify(result.hangs.slice(0, 10)));
    }
    if (stallLines.length) {
      console.log(`STALL/TIMEOUT console lines (${stallLines.length}):`);
      for (const l of stallLines.slice(0, 20)) console.log('  ' + l);
    }

    // ---- Assertions ---------------------------------------------------------
    // Gate: cross-origin isolation must be active (else we are not testing SMP).
    expect(result.isolated, 'page must be cross-origin isolated (COOP/COEP)').toBe(true);
    expect(result.sharedArrayBuffer, 'SharedArrayBuffer must be available').toBe(true);
    expect(result.ran, 'all requested searches must have run').toBe(MOVES);

    // The point of this instrumented run is OBSERVATION: we do NOT fail on a
    // hang here (the raw un-freeze-proofed search is expected to be able to
    // freeze). Instead we surface it loudly. Flip the expectation in the
    // freeze-proofing follow-up (there, hangs MUST be 0).
    if (result.hangs.length > 0 || result.timeouts > 0) {
      console.log(
        `\n*** FREEZE / STALL REPRODUCED: hangs=${result.hangs.length} clientTimeouts=${result.timeouts} ***`
      );
    } else {
      console.log('\nNO FREEZE OBSERVED in this run (all searches returned within the ceiling).');
    }
  });
});
