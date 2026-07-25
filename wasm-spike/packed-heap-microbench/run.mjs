import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const ASSEMBLYSCRIPT_VERSION = "0.28.19";
const BUILD_FLAGS = [
  "-O3",
  "--runtime",
  "stub",
  "--noAssert",
  "--enable",
  "simd",
];
const MINIMUM_BLOCK_MS = 100;
const CALIBRATION_TARGET_MS = 150;
const TIMING_ROUNDS = 3;
const TIMING_ORDER = [
  "current",
  "packed",
  "packed",
  "current",
  "packed",
  "current",
  "current",
  "packed",
];
const CHECKSUM_SEED = 0x811c9dc5;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptDir, "bench.ts");
const outputPath = resolve(process.argv[2] ?? join(scriptDir, "result.json"));
const tempRoot = mkdtempSync(join(tmpdir(), "packed-heap-microbench-"));
const wasmPath = join(tempRoot, "bench.wasm");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: scriptDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} failed with exit ${result.status}${details ? `\n${details}` : ""}`,
    );
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}

function elapsedTimeReductionPct(currentMs, packedMs) {
  return ((currentMs - packedMs) / currentMs) * 100;
}

function equalWorkThroughputGainPct(currentMs, packedMs) {
  return (currentMs / packedMs - 1) * 100;
}

function mixChecksum(checksum, value) {
  return (Math.imul(checksum, 16_777_619) ^ value) >>> 0;
}

if (Number(process.versions.node.split(".")[0]) !== 22) {
  throw new Error(
    `Node 22 is required for comparable evidence; got ${process.version}`,
  );
}

try {
  run("npx", [
    "-y",
    "-p",
    `assemblyscript@${ASSEMBLYSCRIPT_VERSION}`,
    "asc",
    sourcePath,
    "--outFile",
    wasmPath,
    ...BUILD_FLAGS,
  ]);

  const wasm = await WebAssembly.instantiate(readFileSync(wasmPath), {
    env: {
      abort(message, file, line, column) {
        throw new Error(
          `AssemblyScript abort at ${file}:${line}:${column} (${message})`,
        );
      },
    },
  });
  const { verify, verifySignedBoundaries, benchCurrent, benchPacked } =
    wasm.instance.exports;

  const ns = [48, 64, 96, 128];
  const modes = [
    { name: "partial8", pops: () => 8 },
    { name: "partial25pct", pops: (n) => n >> 2 },
    { name: "full", pops: (n) => n },
  ];

  const verification = [];
  const signedBoundaryVerification = [];
  for (const n of ns) {
    for (const mode of modes) {
      const pops = mode.pops(n);
      const vectors = 1_500;
      const failures = verify(n, vectors, pops, 0x51f15e + n + pops);
      verification.push({ n, mode: mode.name, vectors, pops, failures });
      if (failures !== 0) {
        throw new Error(
          `verification failed: n=${n} mode=${mode.name} failures=${failures}`,
        );
      }

      const boundaryVectors = 1_024;
      const boundaryFailures = verifySignedBoundaries(
        n,
        boundaryVectors,
        pops,
        0x7f4a7c15 + n + pops,
      );
      signedBoundaryVerification.push({
        n,
        mode: mode.name,
        vectors: boundaryVectors,
        pops,
        failures: boundaryFailures,
      });
      if (boundaryFailures !== 0) {
        throw new Error(
          `signed-boundary verification failed: n=${n} mode=${mode.name} ` +
            `failures=${boundaryFailures}`,
        );
      }
    }
  }

  // Compile/JIT warm-up is deliberately separate from calibration and timing.
  for (const n of ns) {
    benchCurrent(n, 2_000, 8, 123 + n);
    benchPacked(n, 2_000, 8, 123 + n);
    benchCurrent(n, 500, n, 456 + n);
    benchPacked(n, 500, n, 456 + n);
  }

  function measure(arm, n, vectors, pops, seed) {
    const fn = arm === "current" ? benchCurrent : benchPacked;
    const startedAt = performance.now();
    const checksum = fn(n, vectors, pops, seed);
    const elapsedMs = performance.now() - startedAt;
    return { arm, elapsedMs, checksum };
  }

  function calibrate(n, pops, seed) {
    let vectors = 4_096;
    const probes = [];
    while (true) {
      const current = measure("current", n, vectors, pops, seed);
      const packed = measure("packed", n, vectors, pops, seed);
      probes.push({
        vectors,
        currentMs: current.elapsedMs,
        packedMs: packed.elapsedMs,
        checksumsMatch: current.checksum === packed.checksum,
      });
      if (current.checksum !== packed.checksum) {
        throw new Error(
          `calibration checksum mismatch: n=${n} pops=${pops} vectors=${vectors}`,
        );
      }
      const shorterMs = Math.min(current.elapsedMs, packed.elapsedMs);
      if (shorterMs >= CALIBRATION_TARGET_MS) return { vectors, probes };
      const multiplier = Math.max(
        2,
        Math.ceil((CALIBRATION_TARGET_MS / Math.max(shorterMs, 0.01)) * 1.1),
      );
      vectors *= multiplier;
      if (!Number.isSafeInteger(vectors) || vectors > 100_000_000) {
        throw new Error(`calibration exceeded safe vector count: ${vectors}`);
      }
    }
  }

  const results = [];
  let currentChecksum = CHECKSUM_SEED;
  let packedChecksum = CHECKSUM_SEED;
  for (const n of ns) {
    for (const mode of modes) {
      const pops = mode.pops(n);
      const seed = (0xc0ffee + n * 131 + pops) >>> 0;
      const calibration = calibrate(n, pops, seed);
      const rounds = [];
      const blocks = [];
      let expectedBlockChecksum;
      for (let round = 0; round < TIMING_ROUNDS; round++) {
        const roundBlocks = [];
        for (
          let blockIndex = 0;
          blockIndex < TIMING_ORDER.length;
          blockIndex++
        ) {
          const arm = TIMING_ORDER[blockIndex];
          const block = measure(arm, n, calibration.vectors, pops, seed);
          expectedBlockChecksum ??= block.checksum;
          if (block.checksum !== expectedBlockChecksum) {
            throw new Error(
              `block checksum mismatch: n=${n} mode=${mode.name} ` +
                `round=${round} block=${blockIndex}`,
            );
          }
          if (arm === "current") {
            currentChecksum = mixChecksum(currentChecksum, block.checksum);
          } else {
            packedChecksum = mixChecksum(packedChecksum, block.checksum);
          }
          const record = { round, blockIndex, ...block };
          roundBlocks.push(record);
          blocks.push(record);
        }
        const currentMs = roundBlocks
          .filter((block) => block.arm === "current")
          .reduce((sum, block) => sum + block.elapsedMs, 0);
        const packedMs = roundBlocks
          .filter((block) => block.arm === "packed")
          .reduce((sum, block) => sum + block.elapsedMs, 0);
        rounds.push({
          round,
          currentMs,
          packedMs,
          elapsedTimeReductionPct: elapsedTimeReductionPct(currentMs, packedMs),
          equalWorkThroughputGainPct: equalWorkThroughputGainPct(
            currentMs,
            packedMs,
          ),
        });
      }

      const currentBlocks = blocks.filter((block) => block.arm === "current");
      const packedBlocks = blocks.filter((block) => block.arm === "packed");
      const currentMs = currentBlocks.reduce(
        (sum, block) => sum + block.elapsedMs,
        0,
      );
      const packedMs = packedBlocks.reduce(
        (sum, block) => sum + block.elapsedMs,
        0,
      );
      const minimumObservedBlockMs = Math.min(
        ...blocks.map((block) => block.elapsedMs),
      );
      if (minimumObservedBlockMs < MINIMUM_BLOCK_MS) {
        throw new Error(
          `timed block below ${MINIMUM_BLOCK_MS} ms: n=${n} ` +
            `mode=${mode.name} observed=${minimumObservedBlockMs}`,
        );
      }
      if (currentBlocks.length !== packedBlocks.length) {
        throw new Error(`unequal block count: n=${n} mode=${mode.name}`);
      }

      const roundElapsedReductions = rounds.map(
        (round) => round.elapsedTimeReductionPct,
      );
      const roundThroughputGains = rounds.map(
        (round) => round.equalWorkThroughputGainPct,
      );
      results.push({
        n,
        mode: mode.name,
        pops,
        seed,
        vectorsPerBlock: calibration.vectors,
        blocksPerArm: currentBlocks.length,
        equalWorkVectorsPerArm: calibration.vectors * currentBlocks.length,
        calibration,
        timingOrder: TIMING_ORDER,
        rounds,
        blocks,
        currentTotalMs: currentMs,
        packedTotalMs: packedMs,
        minimumObservedBlockMs,
        elapsedTimeReductionPct: elapsedTimeReductionPct(currentMs, packedMs),
        equalWorkThroughputGainPct: equalWorkThroughputGainPct(
          currentMs,
          packedMs,
        ),
        roundElapsedTimeReductionPct: {
          minimum: Math.min(...roundElapsedReductions),
          median: median(roundElapsedReductions),
          maximum: Math.max(...roundElapsedReductions),
        },
        roundEqualWorkThroughputGainPct: {
          minimum: Math.min(...roundThroughputGains),
          median: median(roundThroughputGains),
          maximum: Math.max(...roundThroughputGains),
        },
      });
    }
  }

  const checksumsMatch = currentChecksum === packedChecksum;
  const checksumsNontrivial =
    currentChecksum !== CHECKSUM_SEED && packedChecksum !== CHECKSUM_SEED;
  if (!checksumsMatch || !checksumsNontrivial) {
    throw new Error(
      `checksum validation failed: current=${currentChecksum} ` +
        `packed=${packedChecksum} seed=${CHECKSUM_SEED}`,
    );
  }

  const report = {
    schema: 2,
    runtime: {
      nodeTargetMajor: 22,
      node: process.version,
      arch: process.arch,
      platform: process.platform,
      cpu: cpus()[0]?.model ?? "unknown",
      wasmSimd: true,
    },
    build: {
      compiler: "AssemblyScript",
      compilerVersion: ASSEMBLYSCRIPT_VERSION,
      flags: BUILD_FLAGS,
      wasmWrittenOnlyToTemporaryDirectory: true,
    },
    design: {
      scoreCardinality: 11,
      stableOrder: "score descending, original ordinal ascending",
      current: "move i32 + score i32 + ordinal i32; all three swapped",
      packed: "move i32 + packed u64 key; both swapped",
      timedWork:
        "input generation + representation setup + heap build + requested pops",
      minimumBlockMs: MINIMUM_BLOCK_MS,
      calibrationTargetMs: CALIBRATION_TARGET_MS,
      timingRounds: TIMING_ROUNDS,
      timingOrder: TIMING_ORDER,
      sameWorkAndSeedWithinCondition: true,
      elapsedTimeReductionFormula:
        "(current_elapsed_ms - packed_elapsed_ms) / current_elapsed_ms * 100",
      equalWorkThroughputGainFormula:
        "(current_elapsed_ms / packed_elapsed_ms - 1) * 100",
    },
    verification,
    signedBoundaryVerification,
    results,
    checksums: {
      current: currentChecksum,
      packed: packedChecksum,
      match: checksumsMatch,
      nontrivial: checksumsNontrivial,
    },
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${outputPath}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
