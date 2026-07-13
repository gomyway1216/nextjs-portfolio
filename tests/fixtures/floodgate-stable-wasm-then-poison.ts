import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createFloodgateStableWasmReusableProposalPool,
  runFloodgateStableWasmWorkerPoolCoreForTests,
} from "../../ml/floodgate-stable-wasm-proposer";

const repositoryRoot = process.argv[2];
if (typeof repositoryRoot !== "string" || repositoryRoot === "") {
  throw new Error("repository root argument is required");
}

const board = new Array<number>(81).fill(0);
const boardIndex = (file: number, rank: number) => (file - 1) * 9 + rank - 1;
board[boardIndex(5, 1)] = 40;
board[boardIndex(4, 3)] = 21;
board[boardIndex(5, 5)] = 31;
board[boardIndex(5, 9)] = 24;
const hands = new Array<number>(23).fill(0);
hands[0] = 3;

const assets = {
  wasmBytes: readFileSync(
    join(
      repositoryRoot,
      "src",
      "components",
      "game",
      "ShogiImproved",
      "wasm",
      "shogi.wasm",
    ),
  ),
  weightsBytes: readFileSync(
    join(repositoryRoot, "public", "shogi-nnue-weights.bin"),
  ),
  workerSourceBytes: readFileSync(
    join(repositoryRoot, "ml", "floodgate-stable-wasm-worker.mjs"),
  ),
};
const requests = [
  {
    index: 0,
    board,
    hands,
    side_to_move: 16,
    root_tesu: 0,
  },
];
const options = {
  workers: 1,
  startupTimeoutMilliseconds: 20_000,
  searchTimeoutMilliseconds: 20_000,
};
const reusableOptions = {
  workers: 1,
  queueBound: 2,
  startupTimeoutMilliseconds: 20_000,
  searchTimeoutMilliseconds: 20_000,
  closeTimeoutMilliseconds: 5_000,
};
const parentSfen = "4k4/9/5G3/9/4+R4/9/9/9/4K4 b 3P 1";
const stableMove = "4c5b";
const parentPly = 0;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const gameId = `sha256:${sha256("isolated-reusable-then-poison")}`;
const parent = {
  schema_version: 1 as const,
  game_id: gameId,
  parent_id: `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${parentPly}`)}`,
  position_id: `sha256:${sha256(`sfen-v1\0${parentSfen.slice(0, parentSfen.lastIndexOf(" "))}`)}`,
  parent_sfen: parentSfen,
  ply: parentPly,
  played_move: stableMove,
};

function restoreThen(inherited: PropertyDescriptor | undefined): void {
  if (inherited === undefined) {
    delete (Object.prototype as { then?: unknown }).then;
  } else {
    Object.defineProperty(Object.prototype, "then", inherited);
  }
}

async function main(): Promise<void> {
  const reusablePool = await createFloodgateStableWasmReusableProposalPool(
    assets,
    reusableOptions,
  );
  const inherited = Object.getOwnPropertyDescriptor(Object.prototype, "then");
  let poisonCalls = 0;
  Object.defineProperty(Object.prototype, "then", {
    configurable: true,
    enumerable: false,
    writable: true,
    value() {
      poisonCalls += 1;
      throw new Error("Object.prototype.then was consulted by the real pool");
    },
  });

  try {
    const box = await runFloodgateStableWasmWorkerPoolCoreForTests(
      requests,
      assets,
      options,
    );
    const resultCount = box.results.length;
    const packedMove = box.results[0]?.packed_move;
    const reusableMove = (await reusablePool.propose(parent)).stable_move;
    restoreThen(inherited);
    if (poisonCalls !== 0) throw new Error(`then poison calls: ${poisonCalls}`);
    if (resultCount !== 1 || packedMove !== 1_347_797) {
      throw new Error(
        `unexpected real-pool result: ${resultCount}/${packedMove}`,
      );
    }
    if (reusableMove !== stableMove) {
      throw new Error(`unexpected reusable-pool move: ${reusableMove}`);
    }
    await reusablePool.close();
    process.stdout.write("real-and-reusable-pool-then-isolation-pass");
  } catch (error) {
    restoreThen(inherited);
    try {
      await reusablePool.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "then isolation and reusable-pool cleanup both failed",
      );
    }
    throw error;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(String(error instanceof Error ? error.stack : error));
  process.exitCode = 1;
});
