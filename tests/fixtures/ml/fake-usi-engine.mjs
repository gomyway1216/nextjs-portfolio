import fs from 'node:fs';
import readline from 'node:readline';

let multipv = 1;
const traceIndex = process.argv.indexOf('--trace');
const tracePath = traceIndex >= 0 ? process.argv[traceIndex + 1] : null;
const environmentTraceIndex = process.argv.indexOf('--environment-trace');
const environmentTracePath =
  environmentTraceIndex >= 0 ? process.argv[environmentTraceIndex + 1] : null;
if (environmentTracePath) {
  fs.appendFileSync(
    environmentTracePath,
    `${JSON.stringify({
      environment: process.env,
      cwd: process.cwd(),
    })}\n`
  );
}
const stderrBytesIndex = process.argv.indexOf('--stderr-bytes');
if (stderrBytesIndex >= 0) {
  const stderrBytes = Number.parseInt(process.argv[stderrBytesIndex + 1] ?? '0', 10);
  if (stderrBytes > 0) process.stderr.write(`${'x'.repeat(stderrBytes)}\n`);
}
const exitBeforeUsi = process.argv.includes('--exit-before-usi');
const MOVE_SCORES = new Map([
  ['7g7f', 260],
  ['2g2f', 220],
  // Deliberate tie: v4 must rank by move bytes, not proposal/execution order.
  ['6g6f', 220],
  ['5g5f', 180],
  ['3g3f', 140],
]);

function trace(event) {
  if (tracePath) fs.appendFileSync(tracePath, `${JSON.stringify(event)}\n`);
}

function scoreFor(move) {
  const fixed = MOVE_SCORES.get(move);
  if (fixed !== undefined) return fixed;
  let hash = 0;
  for (const byte of Buffer.from(move, 'utf8')) hash = (hash * 131 + byte) % 201;
  return 40 + hash;
}

function compareMoves(left, right) {
  return scoreFor(right) - scoreFor(left) || Buffer.compare(Buffer.from(left), Buffer.from(right));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (line === 'usi') {
    if (exitBeforeUsi) {
      process.stderr.write('intentional startup failure\n', () => process.exit(7));
      return;
    }
    console.log('id name deterministic-fake-usi');
    console.log('usiok');
    return;
  }
  if (line === 'isready') {
    trace({ event: 'ready' });
    console.log('readyok');
    return;
  }
  const multi = line.match(/^setoption name MultiPV value (\d+)$/);
  if (multi) {
    multipv = Number.parseInt(multi[1], 10);
    return;
  }
  if (!line.startsWith('go ')) {
    if (line === 'quit') process.exit(0);
    return;
  }

  const searchmoves = line.match(/\bsearchmoves (.+)$/)?.[1].trim().split(/\s+/) ?? [];
  const requested = searchmoves.length > 0 ? searchmoves : [
    '7g7f',
    '2g2f',
    '5g5f',
    '3g3f',
  ];
  const moves = [...requested].sort(compareMoves).slice(0, multipv);
  const depth = Number.parseInt(line.match(/\bdepth (\d+)/)?.[1] ?? '8', 10);
  trace({ event: 'search', multipv, searchmoves, moves, depth });
  for (let rank = moves.length; rank >= 1; rank--) {
    console.log(
      `info depth ${depth} multipv ${rank} score cp ${scoreFor(moves[rank - 1])} nodes 64 pv ${moves[rank - 1]}`
    );
  }
  console.log(`bestmove ${moves[0]}`);
});
