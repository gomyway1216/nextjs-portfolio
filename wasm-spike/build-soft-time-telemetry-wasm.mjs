/**
 * build-soft-time-telemetry-wasm.mjs — research-only build of the production
 * engine with iterative-deepening telemetry.
 *
 * The shipped engine tells you the move, the final score and the final depth.
 * It does not tell you WHERE THE TIME WENT, which is the only question a time
 * management change is about. This build adds one record per COMPLETED
 * iteration (depth, score, best move, elapsed ms at completion) and the total
 * elapsed time, so `soft-time-trace-collect.ts` can dump real traces and a
 * policy can be replayed offline instead of guessed at.
 *
 * Nothing here ships. The transform is applied to a temp copy; the repository
 * source and the production WASM are untouched.
 *
 * The two anchors are deliberately chosen to exist in BOTH the pre- and
 * post-soft-limit source, so the same tool can trace the old engine (check out
 * the older revision) and the new one and the two runs stay comparable.
 *
 * usage: node wasm-spike/build-soft-time-telemetry-wasm.mjs <outFile> [repoRoot]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outFile = process.argv[2];
const repo = process.argv[3] ?? join(scriptDir, '..');
if (!outFile) throw new Error('usage: build-soft-time-telemetry-wasm.mjs <outFile> [repoRoot]');

const srcPath = join(repo, 'wasm-spike', 'assembly', 'index-halfkp64-rki16.ts');
let src = readFileSync(srcPath, 'utf8');

function once(anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error(`anchor not found: ${label}`);
  if (src.indexOf(anchor, i + anchor.length) >= 0) throw new Error(`anchor not unique: ${label}`);
  src = src.slice(0, i) + replacement + src.slice(i + anchor.length);
}

once(
  'let lastSearchDepth: i32 = 0;',
  `let lastSearchDepth: i32 = 0;

// --- research telemetry (never shipped) ---
const TRACE_MAX: i32 = 48;
const traceDepth = new StaticArray<i32>(TRACE_MAX);
const traceScore = new StaticArray<i32>(TRACE_MAX);
const traceMove = new StaticArray<i32>(TRACE_MAX);
const traceEndMs = new StaticArray<f64>(TRACE_MAX);
let traceN: i32 = 0;
let traceTotalMs: f64 = 0;
let traceRootN: i32 = 0;`,
  'trace storage',
);

once(
  '  let completedDepth = 0;\n',
  '  let completedDepth = 0;\n  traceN = 0;\n  traceTotalMs = 0;\n  traceRootN = rootN;\n',
  'trace reset',
);

once(
  `    if (rootBestKey != 0) {
      bestMoveKey = rootBestKey;
      bestScore = score;
      completedDepth = depth;
    }
`,
  `    if (rootBestKey != 0) {
      bestMoveKey = rootBestKey;
      bestScore = score;
      completedDepth = depth;
    }

    if (traceN < TRACE_MAX) {
      unchecked(traceDepth[traceN] = depth);
      unchecked(traceScore[traceN] = bestScore);
      unchecked(traceMove[traceN] = bestMoveKey);
      unchecked(traceEndMs[traceN] = hostNow() - searchStartTime);
      traceN++;
    }
`,
  'iteration record',
);

once(
  '  lastSearchScore = bestScore;\n  lastSearchDepth = completedDepth;\n  return bestMoveKey;',
  '  traceTotalMs = hostNow() - searchStartTime;\n  lastSearchScore = bestScore;\n  lastSearchDepth = completedDepth;\n  return bestMoveKey;',
  'total elapsed',
);

src += `

// --- research telemetry exports (never shipped) ---
export function getTraceCount(): i32 { return traceN; }
export function getTraceDepth(i: i32): i32 { return i >= 0 && i < traceN ? unchecked(traceDepth[i]) : -1; }
export function getTraceScore(i: i32): i32 { return i >= 0 && i < traceN ? unchecked(traceScore[i]) : 0; }
export function getTraceMove(i: i32): i32 { return i >= 0 && i < traceN ? unchecked(traceMove[i]) : 0; }
export function getTraceEndMs(i: i32): f64 { return i >= 0 && i < traceN ? unchecked(traceEndMs[i]) : 0; }
export function getTraceTotalMs(): f64 { return traceTotalMs; }
export function getTraceRootN(): i32 { return traceRootN; }
`;

const tmp = mkdtempSync(join(tmpdir(), 'shogi-soft-time-telemetry-'));
mkdirSync(join(tmp, 'wasm-spike', 'assembly'), { recursive: true });
writeFileSync(join(tmp, 'wasm-spike', 'assembly', 'index.ts'), src);
for (const f of ['tables.ts', 'as-ambient.d.ts']) {
  copyFileSync(join(repo, 'wasm-spike', 'assembly', f), join(tmp, 'wasm-spike', 'assembly', f));
}
execFileSync(
  'npx',
  ['-y', '-p', 'assemblyscript@0.28.19', 'asc', 'wasm-spike/assembly/index.ts',
   '--outFile', 'out.wasm', '-O3', '--runtime', 'stub', '--noAssert', '--enable', 'simd'],
  { cwd: tmp, stdio: 'inherit' },
);
copyFileSync(join(tmp, 'out.wasm'), outFile);
console.log(`telemetry wasm -> ${outFile}`);
