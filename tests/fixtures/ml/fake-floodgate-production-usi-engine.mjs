#!/usr/bin/env node

/**
 * Synthetic USI peer for the production-teacher runtime tests.
 *
 * The fixture deliberately supports hostile protocol behaviours. It never
 * reads a game, a training row, or a holdout label.
 */

import fs from "node:fs";
import { spawn } from "node:child_process";
import readline from "node:readline";

const argumentsAfterScript = process.argv.slice(2);

function argumentValue(name, fallback = undefined) {
  const index = argumentsAfterScript.indexOf(name);
  return index < 0 ? fallback : argumentsAfterScript[index + 1];
}

const mode = argumentValue("--mode", "normal");
const tracePath = argumentValue("--trace");
const engineId = argumentValue(
  "--engine-id",
  "YaneuraOu NNUE 9.60git 64APPLEM1",
);
const stderrBytes = Number.parseInt(argumentValue("--stderr-bytes", "0"), 10);
const stdoutNoiseBytes = Number.parseInt(
  argumentValue("--stdout-noise-bytes", "0"),
  10,
);
const stdoutLines = Number.parseInt(argumentValue("--stdout-lines", "0"), 10);
const delayMs = Number.parseInt(argumentValue("--delay-ms", "0"), 10);
const poisonMarkerPath = argumentValue("--poison-marker");
const successMarkerPath =
  poisonMarkerPath === undefined ? undefined : `${poisonMarkerPath}.success`;
const descendantPidPath = argumentValue("--descendant-pid-file");

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const MOVE_SCORES = new Map([
  ["7g7f", 260],
  ["2g2f", 220],
  ["6g6f", 220],
  ["5g5f", 180],
  ["3g3f", 140],
  ["4g4f", 120],
]);

let multiPv = 1;
let position = START_SFEN;
let readyCount = 0;
let searchCount = 0;

function trace(event) {
  if (tracePath === undefined) return;
  fs.appendFileSync(
    tracePath,
    `${JSON.stringify({ pid: process.pid, ...event })}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}

function emit(line) {
  if (mode.startsWith("poison-race-")) trace({ event: "stdout", line });
  process.stdout.write(`${line}\n`);
}

function afterMarker(markerPath, label, action, delayAfterMs = 0) {
  if (markerPath === undefined) {
    process.stderr.write(`synthetic ${label} requires a marker path\n`);
    process.exit(21);
  }
  const deadline = Date.now() + 1_000;
  const poll = () => {
    if (fs.existsSync(markerPath)) {
      setTimeout(action, delayAfterMs);
      return;
    }
    if (Date.now() >= deadline) {
      process.stderr.write(`synthetic ${label} marker timed out\n`);
      process.exit(22);
      return;
    }
    setTimeout(poll, 2);
  };
  poll();
}

function leaveDescendantInProcessGroup() {
  if (descendantPidPath === undefined) {
    process.stderr.write("synthetic descendant mode requires a pid path\n");
    process.exit(23);
  }
  const descendant = spawn(
    process.execPath,
    ["-e", "setInterval(() => undefined, 1000)"],
    { detached: false, stdio: "ignore" },
  );
  if (descendant.pid === undefined) {
    process.stderr.write("synthetic descendant had no pid\n");
    process.exit(24);
  }
  fs.writeFileSync(descendantPidPath, `${descendant.pid}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  descendant.unref();
}

function later(action) {
  if (delayMs > 0) setTimeout(action, delayMs);
  else action();
}

function scoreFor(move) {
  const fixed = MOVE_SCORES.get(move);
  if (fixed !== undefined) return fixed;
  let hash = 0;
  for (const byte of Buffer.from(move, "utf8"))
    hash = (hash * 131 + byte) % 201;
  return 40 + hash;
}

function compareMoves(left, right) {
  return (
    scoreFor(right) - scoreFor(left) ||
    Buffer.compare(Buffer.from(left), Buffer.from(right))
  );
}

function advertiseOptions() {
  const options = [
    "option name USI_Hash type spin default 128 min 1 max 1048576",
    "option name Threads type spin default 1 min 1 max 512",
    "option name EvalDir type string default <empty>",
    "option name FV_SCALE type spin default 20 min 1 max 128",
    "option name USI_OwnBook type check default false",
    "option name BookFile type string default no_book",
    "option name NetworkDelay type spin default 0 min 0 max 10000",
    "option name NetworkDelay2 type spin default 0 min 0 max 10000",
    "option name MultiPV type spin default 1 min 1 max 800",
  ];
  for (const option of options) {
    if (mode === "missing-option" && option.includes("name MultiPV ")) continue;
    emit(option);
  }
  if (mode === "duplicate-option") emit(options[0]);
}

trace({
  event: "spawn",
  argv: argumentsAfterScript,
  cwd: process.cwd(),
  env: Object.fromEntries(
    Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b)),
  ),
});

if (Number.isFinite(stderrBytes) && stderrBytes > 0) {
  process.stderr.write("e".repeat(stderrBytes));
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

input.on("line", (line) => {
  trace({ event: "stdin", line });

  if (line === "usi") {
    if (mode === "exit-on-usi") {
      process.stderr.write("synthetic startup exit\n", () => process.exit(17));
      return;
    }
    if (mode === "hang-usi") return;
    emit(
      `id name ${mode === "wrong-id" ? "Synthetic Wrong Engine" : engineId}`,
    );
    emit("id author synthetic-test-only");
    advertiseOptions();
    if (mode === "oversized-line")
      emit(`info string ${"x".repeat(1024 * 1024)}`);
    if (mode === "stdout-flood" && stdoutNoiseBytes > 0) {
      emit(`info string ${"x".repeat(stdoutNoiseBytes)}`);
    }
    if (mode === "line-flood" && stdoutLines > 0) {
      for (let index = 0; index < stdoutLines; index += 1) {
        emit(`id author bounded-line-${index}`);
      }
    }
    if (mode !== "missing-usiok") emit("usiok");
    return;
  }

  if (line === "isready") {
    readyCount += 1;
    if (mode === "exit-on-ready") {
      process.stderr.write("synthetic ready exit\n", () => process.exit(18));
      return;
    }
    if (mode === "hang-ready") return;
    const ready = () => {
      if (mode === "partial-after-ready" && readyCount === 1) {
        process.stdout.write("readyok\npartial");
      } else if (mode === "fatal-between-phases" && readyCount === 1) {
        process.stdout.write("readyok\ninfo string unsolicited-after-ready\n");
      } else emit("readyok");
    };
    later(ready);
    return;
  }

  const option = line.match(/^setoption name (.+?) value (.*)$/);
  if (option !== null) {
    const [, name, value] = option;
    if (name === "MultiPV") multiPv = Number.parseInt(value, 10);
    if (mode === "exit-on-option") {
      process.stderr.write("synthetic option exit\n");
      process.exit(19);
    }
    return;
  }

  const positionMatch = line.match(/^position sfen (.+)$/);
  if (positionMatch !== null) {
    position = positionMatch[1];
    return;
  }

  if (line.startsWith("go ")) {
    searchCount += 1;
    if (mode === "exit-on-go") {
      process.stderr.write("synthetic search exit\n", () => process.exit(20));
      return;
    }
    if (mode === "hang-go") return;

    const requestedDepth = Number.parseInt(
      line.match(/\bdepth (\d+)/)?.[1] ?? "16",
      10,
    );
    const depth =
      mode === "wrong-depth" || mode === "poison-race-failure"
        ? requestedDepth - 1
        : requestedDepth;
    const searchmoves =
      line
        .match(/\bsearchmoves (.+)$/)?.[1]
        .trim()
        .split(/\s+/) ?? [];
    const candidates =
      searchmoves.length > 0
        ? searchmoves
        : ["7g7f", "2g2f", "6g6f", "5g5f", "3g3f", "4g4f"];
    const moves = [...candidates].sort(compareMoves).slice(0, multiPv);
    const respond = () => {
      if (mode === "malformed-info")
        emit("info depth nope score cp broken pv ???");
      const emittedMoves =
        mode === "incomplete-multipv" ? moves.slice(0, 1) : moves;
      for (let rank = emittedMoves.length; rank >= 1; rank -= 1) {
        emit(
          `info depth ${depth} multipv ${rank} score cp ${scoreFor(emittedMoves[rank - 1])} nodes 64 pv ${emittedMoves[rank - 1]}`,
        );
      }
      if (mode === "missing-bestmove") return;
      const bestmove = `bestmove ${
        mode === "invalid-bestmove" ? "???" : (moves[0] ?? "resign")
      }`;
      if (mode === "poison-race-failure") {
        if (poisonMarkerPath === undefined) {
          process.stderr.write(
            "synthetic poison race requires a marker path\n",
          );
          process.exit(21);
        }
        // Publish the synchronization marker before the failing bestmove.
        // The runtime may kill this peer as soon as that line is consumed.
        fs.writeFileSync(poisonMarkerPath, `${process.pid}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
      }
      if (mode === "partial-after-bestmove")
        process.stdout.write(`${bestmove}\npartial`);
      else emit(bestmove);
    };
    if (mode === "poison-race-failure")
      afterMarker(successMarkerPath, "poison race success", respond);
    else later(respond);
    return;
  }

  if (line === "quit") {
    if (mode === "leader-exit-with-descendant") {
      leaveDescendantInProcessGroup();
      process.exit(0);
    }
    if (mode !== "ignore-quit" && mode !== "ignore-eof") process.exit(0);
    return;
  }
});

input.on("close", () => {
  trace({ event: "stdin-close", readyCount, searchCount, position });
  if (mode !== "ignore-eof" && mode !== "ignore-quit") process.exit(0);
});
