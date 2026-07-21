#!/usr/bin/env node

/**
 * Measure the resource cost of a large NNUE candidate in the production Lazy
 * SMP topology without changing the production loader or live weights.
 *
 * This intentionally mirrors the important ownership boundaries in
 * shogiAiWorkerClient / shogi-ai.worker / shogi-ai-helper.worker:
 *
 * - one private WASM instance per search worker (one main + up to 3 helpers),
 * - one ~32 MiB SharedArrayBuffer TT when more than one worker is requested,
 * - the main worker retains the fetched weights,
 * - the main worker sends that ArrayBuffer to every helper without a transfer
 *   list, so structured clone temporarily creates one helper-local copy.
 *
 * Node worker_threads are used because they expose process RSS and reproduce
 * structured-clone + private-WASM ownership locally. This is not a browser
 * compatibility/performance pass: it emits measurements and deliberately has
 * no invented pass/fail threshold. A promotion decision must pair the output
 * with a real supported-browser run and an agreed device budget.
 *
 * Usage:
 *   node wasm-spike/halfkp-multiworker-resource-gate.mjs \
 *     --wasm wasm-spike/artifacts/shogi-halfkp81-research.wasm \
 *     --weights /absolute/path/to/candidate/weights.bin \
 *     --buckets 81 --max-instances 4 [--settle-ms 500] [--out /tmp/report.json]
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { MessageChannel, Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

export const SHARED_TT_BYTES = (16 + (1 << 20) * 8) * 4;
const ALLOWED_BUCKETS = new Set([1, 6, 81]);
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function strictPositiveInt(raw, flag, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(raw)) throw new Error(`${flag} must be an integer`);
  const value = Number(raw);
  if (value < 1 || value > max) throw new Error(`${flag} must be between 1 and ${max}`);
  return value;
}

export function parseCliArgs(argv) {
  const options = {
    wasm: null,
    weights: null,
    buckets: null,
    maxInstances: 4,
    settleMs: 500,
    out: null,
    caseInstances: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--wasm') options.wasm = requiredValue(argv, i++, arg);
    else if (arg === '--weights') options.weights = requiredValue(argv, i++, arg);
    else if (arg === '--buckets') {
      const buckets = strictPositiveInt(requiredValue(argv, i++, arg), arg, 81);
      if (!ALLOWED_BUCKETS.has(buckets)) throw new Error('--buckets must be 1, 6, or 81');
      options.buckets = buckets;
    } else if (arg === '--max-instances') {
      options.maxInstances = strictPositiveInt(requiredValue(argv, i++, arg), arg, 4);
    } else if (arg === '--settle-ms') {
      const raw = requiredValue(argv, i++, arg);
      if (!/^\d+$/.test(raw)) throw new Error('--settle-ms must be a non-negative integer');
      options.settleMs = Number(raw);
    } else if (arg === '--out') options.out = requiredValue(argv, i++, arg);
    else if (arg === '--case-instances') {
      options.caseInstances = strictPositiveInt(requiredValue(argv, i++, arg), arg, 4);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!options.wasm) throw new Error('--wasm is required');
  if (!options.weights) throw new Error('--weights is required');
  if (!options.buckets) throw new Error('--buckets is required');
  return options;
}

export function deriveTopologyAccounting(instanceCount, weightsBytes, wasmMemoryBytes) {
  if (!Number.isInteger(instanceCount) || instanceCount < 1 || instanceCount > 4) {
    throw new Error('instanceCount must be between 1 and 4');
  }
  if (!Number.isSafeInteger(weightsBytes) || weightsBytes < 1) {
    throw new Error('weightsBytes must be a positive safe integer');
  }
  if (!Number.isSafeInteger(wasmMemoryBytes) || wasmMemoryBytes < 1) {
    throw new Error('wasmMemoryBytes must be a positive safe integer');
  }
  return {
    mainInstances: 1,
    helperInstances: instanceCount - 1,
    privateWasmMemories: instanceCount,
    logicalWasmMemoryBytes: instanceCount * wasmMemoryBytes,
    retainedMainWeightsBytes: weightsBytes,
    helperStructuredCloneBytes: (instanceCount - 1) * weightsBytes,
    sharedTtBytes: instanceCount > 1 ? SHARED_TT_BYTES : 0,
    note:
      'helperStructuredCloneBytes is transient and GC-eligible after each helper copies it into WASM; RSS samples measure the observed process-wide result',
  };
}

function memorySnapshot() {
  const m = process.memoryUsage();
  return {
    rssBytes: m.rss,
    heapUsedBytes: m.heapUsed,
    externalBytes: m.external,
    arrayBuffersBytes: m.arrayBuffers,
  };
}

function wasmImports() {
  return {
    env: {
      abort(_msg, _file, line, col) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  };
}

function instantiateResearchWasm(wasmPath) {
  const started = performance.now();
  const bytes = readFileSync(wasmPath);
  const wasmModule = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(wasmModule, wasmImports());
  const wasm = instance.exports;
  if (!(wasm.memory instanceof WebAssembly.Memory)) throw new Error('WASM does not export memory');
  for (const name of ['setNnueBuckets', 'getNnueWeightsSize', 'getNnueWeightsPtr']) {
    if (typeof wasm[name] !== 'function') throw new Error(`WASM does not export ${name}`);
  }
  return {
    wasm,
    instantiateMs: performance.now() - started,
    initialWasmMemoryBytes: wasm.memory.buffer.byteLength,
  };
}

function copyWeightsIntoWasm(wasm, bytes, buckets) {
  const started = performance.now();
  wasm.setNnueBuckets(buckets);
  const expected = wasm.getNnueWeightsSize();
  if (expected !== bytes.byteLength) {
    throw new Error(`weights size mismatch: file=${bytes.byteLength}, wasm=${expected}, buckets=${buckets}`);
  }
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), bytes.byteLength).set(bytes);
  return {
    loadMs: performance.now() - started,
    expectedWeightsBytes: expected,
    finalWasmMemoryBytes: wasm.memory.buffer.byteLength,
  };
}

async function runWorkerRole() {
  const { role, wasmPath, weightsPath, buckets, helperPorts, helperPort, sharedTt } = workerData;
  // Keep the same shared-TT-sized view alive in every worker, as production does.
  const sharedTtView = sharedTt ? new Int32Array(sharedTt) : null;
  if (sharedTtView && sharedTtView.byteLength !== SHARED_TT_BYTES) {
    throw new Error(`shared TT size mismatch: ${sharedTtView.byteLength}`);
  }

  const { wasm, instantiateMs, initialWasmMemoryBytes } = instantiateResearchWasm(wasmPath);
  parentPort.postMessage({
    type: 'instantiated',
    role,
    instantiateMs,
    initialWasmMemoryBytes,
  });

  if (role === 'helper') {
    helperPort.on('message', (message) => {
      if (!message || message.type !== 'nnueWeights' || !(message.bytes instanceof ArrayBuffer)) return;
      try {
        const receivedAt = performance.now();
        const loaded = copyWeightsIntoWasm(wasm, new Uint8Array(message.bytes), buckets);
        parentPort.postMessage({
          type: 'loaded',
          role,
          cloneBytes: message.bytes.byteLength,
          receiveToLoadMs: performance.now() - receivedAt,
          ...loaded,
        });
      } catch (error) {
        parentPort.postMessage({ type: 'failed', role, error: String(error?.stack ?? error) });
      }
    });
    return;
  }

  let retainedWeights = null;
  parentPort.on('message', (message) => {
    if (!message || message.type !== 'load') return;
    try {
      const readStarted = performance.now();
      retainedWeights = readFileSync(weightsPath);
      const readMs = performance.now() - readStarted;
      if (
        retainedWeights.byteOffset !== 0 ||
        retainedWeights.buffer.byteLength !== retainedWeights.byteLength
      ) {
        retainedWeights = Buffer.from(retainedWeights);
      }
      const loaded = copyWeightsIntoWasm(wasm, retainedWeights, buckets);
      const fanoutStarted = performance.now();
      for (const port of helperPorts) {
        // No transfer list: this is the production HelperRequest behavior.
        port.postMessage({ type: 'nnueWeights', bytes: retainedWeights.buffer });
      }
      parentPort.postMessage({
        type: 'loaded',
        role,
        readMs,
        retainedWeightsBytes: retainedWeights.byteLength,
        fanoutPostMs: performance.now() - fanoutStarted,
        ...loaded,
      });
    } catch (error) {
      parentPort.postMessage({ type: 'failed', role, error: String(error?.stack ?? error) });
    }
  });
}

function waitForWorkerMessages(workers, wantedType, expectedCount) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const cleanups = [];
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      for (const cleanup of cleanups) cleanup();
      if (error) reject(error);
      else resolve(messages);
    };
    for (const worker of workers) {
      const onMessage = (message) => {
        if (message?.type === 'failed') {
          finish(new Error(`${message.role} worker failed: ${message.error}`));
          return;
        }
        if (message?.type !== wantedType) return;
        messages.push(message);
        if (messages.length === expectedCount) finish();
      };
      const onError = (error) => finish(error);
      const onExit = (code) => {
        if (messages.length < expectedCount) {
          finish(new Error(`worker exited ${code} before reporting ${wantedType}`));
        }
      };
      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);
      cleanups.push(() => {
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      });
    }
  });
}

async function runIsolatedCase(options) {
  const instances = options.caseInstances;
  const baseline = memorySnapshot();
  let peakRssBytes = baseline.rssBytes;
  const sampler = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
  }, 5);

  const sharedTt = instances > 1 ? new SharedArrayBuffer(SHARED_TT_BYTES) : null;
  const afterSharedTtAllocation = memorySnapshot();
  const workers = [];
  const mainPorts = [];
  const spawnStarted = performance.now();
  try {
    for (let helperId = 0; helperId < instances - 1; helperId++) {
      const { port1, port2 } = new MessageChannel();
      const helper = new Worker(SCRIPT_PATH, {
        workerData: {
          role: 'helper',
          wasmPath: options.wasm,
          buckets: options.buckets,
          helperPort: port1,
          sharedTt,
        },
        transferList: [port1],
      });
      workers.push(helper);
      mainPorts.push(port2);
    }
    const main = new Worker(SCRIPT_PATH, {
      workerData: {
        role: 'main',
        wasmPath: options.wasm,
        weightsPath: options.weights,
        buckets: options.buckets,
        helperPorts: mainPorts,
        sharedTt,
      },
      transferList: mainPorts,
    });
    workers.push(main);

    const instantiateMessages = await waitForWorkerMessages(
      workers,
      'instantiated',
      instances
    );
    const instantiateWallMs = performance.now() - spawnStarted;
    const afterInstantiate = memorySnapshot();

    const loadStarted = performance.now();
    const loadedPromise = waitForWorkerMessages(workers, 'loaded', instances);
    main.postMessage({ type: 'load' });
    const loadMessages = await loadedPromise;
    const loadWallMs = performance.now() - loadStarted;
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
    const afterLoad = memorySnapshot();

    await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
    const afterSettle = memorySnapshot();
    const finalWasmMemoryBytes = loadMessages.reduce(
      (sum, message) => sum + message.finalWasmMemoryBytes,
      0
    );

    return {
      instances,
      helpers: instances - 1,
      timing: {
        instantiateWallMs,
        loadAndCloneWallMs: loadWallMs,
        settleMs: options.settleMs,
      },
      processMemory: {
        baseline,
        afterSharedTtAllocation,
        afterInstantiate,
        afterLoad,
        afterSettle,
        sampledPeakRssBytes: peakRssBytes,
        sampledPeakRssDeltaBytes: peakRssBytes - baseline.rssBytes,
      },
      workers: {
        instantiate: instantiateMessages,
        load: loadMessages,
      },
      topologyAccounting: deriveTopologyAccounting(
        instances,
        statSync(options.weights).size,
        finalWasmMemoryBytes / instances
      ),
    };
  } finally {
    clearInterval(sampler);
    await Promise.all(workers.map((worker) => worker.terminate().catch(() => undefined)));
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function runChildCase(options, instances) {
  const args = [
    SCRIPT_PATH,
    '--wasm',
    options.wasm,
    '--weights',
    options.weights,
    '--buckets',
    String(options.buckets),
    '--settle-ms',
    String(options.settleMs),
    '--case-instances',
    String(instances),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`instance case ${instances} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`instance case ${instances} returned invalid JSON: ${error}\n${stdout}`));
      }
    });
  });
}

async function runCoordinator(options) {
  for (const [label, path] of [
    ['WASM', options.wasm],
    ['weights', options.weights],
  ]) {
    if (!existsSync(path)) throw new Error(`${label} file does not exist: ${path}`);
  }
  const wasm = realpathSync(options.wasm);
  const weights = realpathSync(options.weights);
  const normalized = { ...options, wasm, weights };
  const cases = [];
  for (let instances = 1; instances <= options.maxInstances; instances++) {
    cases.push(await runChildCase(normalized, instances));
  }
  const report = {
    schema: 'shogi-halfkp-multiworker-resource-measurement-v1',
    decision: 'measurement-only-no-promotion-threshold',
    limitations: [
      'Node worker_threads reproduce private WASM instances and structured-clone ownership but are not a browser compatibility or browser timing result.',
      'RSS is process-wide and sampled every 5ms; a shorter transient clone peak may be missed.',
      'No pass/fail memory or latency threshold is assumed. Agree supported-device budgets and run the same topology in real browsers before promotion.',
    ],
    productionTopologyModeled: {
      instanceOwnership: 'one private WebAssembly.Instance and memory per main/helper worker',
      sharedState: `one ${SHARED_TT_BYTES}-byte SharedArrayBuffer TT when helper count is nonzero`,
      weightOwnership: 'main worker retains the source ArrayBuffer after copying it into its own WASM memory',
      helperFanout:
        'main posts the same ArrayBuffer to each helper without a transfer list; worker_threads structured-clones it, matching the current HelperRequest path',
      sourceFiles: [
        'src/components/game/ShogiImproved/shogiAiWorkerClient.ts',
        'src/components/game/ShogiImproved/shogi-ai.worker.ts',
        'src/components/game/ShogiImproved/shogi-ai-helper.worker.ts',
        'src/components/game/ShogiImproved/sharedTT.ts',
      ],
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCountReported: (await import('node:os')).cpus().length,
    },
    inputs: {
      wasm: { path: wasm, bytes: statSync(wasm).size, sha256: sha256File(wasm) },
      weights: {
        path: weights,
        bytes: statSync(weights).size,
        sha256: sha256File(weights),
        buckets: options.buckets,
      },
    },
    cases,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) writeFileSync(options.out, json);
  process.stdout.write(json);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.caseInstances !== null) {
    const result = await runIsolatedCase(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  await runCoordinator(options);
}

if (!isMainThread) {
  void runWorkerRole().catch((error) => {
    parentPort?.postMessage({ type: 'failed', role: workerData?.role, error: String(error?.stack ?? error) });
  });
} else if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH)) {
  void main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
