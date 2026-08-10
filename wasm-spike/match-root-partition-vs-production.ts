import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GOTE, SENTE, Te } from '../src/components/game/ShogiImproved/types';
import { buildNnueFixedTimeOpening, NNUE_FIXED_TIME_OPENING_PLIES } from './nnue-fixed-time-opening';
import {
  loadProductionWasm,
  RootPartitionPlayer,
  syncProductionWasm,
  type ProductionWasm,
} from './rootPartitionPlayer';
import { teFromWasmKey } from './search-driver';

function argString(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function argNumber(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value)) throw new Error(`${flag} requires an integer`);
  return value;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sameMove(a: Te, b: Te): boolean {
  return a.koma === b.koma && a.from === b.from && a.to === b.to && a.promote === b.promote;
}

const candidatePath = argString('--candidate');
const weightsPath = argString('--weights');
const expectedCandidateSha = argString('--candidate-sha');
const expectedWeightsSha = argString('--weights-sha');
const games = argNumber('--games', 56);
const moveMs = argNumber('--ms', 500);
const seedBase = argNumber('--seed', 26460001);
const startGame = argNumber('--start-game', 0);
const maxPlies = argNumber('--max-plies', 256);
const maxDepth = 32;
const quiescenceDepthMax = 10;

if (games <= 0 || games % 2 !== 0) throw new Error('--games must be a positive even integer');
if (startGame < 0 || startGame >= games || startGame % 2 !== 0) {
  throw new Error('--start-game must be an even game index inside the match');
}
if (moveMs <= 0 || maxPlies < NNUE_FIXED_TIME_OPENING_PLIES) throw new Error('invalid time or ply limit');
if (sha256(candidatePath) !== expectedCandidateSha) throw new Error('candidate SHA mismatch');
if (sha256(weightsPath) !== expectedWeightsSha) throw new Error('weights SHA mismatch');

interface Player {
  name: 'RP2' | 'ST1';
  newGame(): void;
  search(position: KyokumenImproved, tesu: number): Promise<Te>;
}

class RootPartitionMatchPlayer implements Player {
  readonly name = 'RP2';
  technicalFaults = 0;

  constructor(readonly player: RootPartitionPlayer) {}

  newGame(): void {
    this.player.newGame();
  }

  async search(position: KyokumenImproved, tesu: number): Promise<Te> {
    const decision = await this.player.search(position, tesu, moveMs, { maxDepth, quiescenceDepthMax });
    if (decision.fallback || decision.errors.length > 0) {
      this.technicalFaults += 1;
      throw new Error(
        `root partition technical fault fallback=${decision.fallback} errors=${decision.errors.join(';')}`,
      );
    }
    return decision.move;
  }
}

class ProductionMatchPlayer implements Player {
  readonly name = 'ST1';

  constructor(private readonly wasm: ProductionWasm) {}

  newGame(): void {
    this.wasm.clearTT();
  }

  async search(position: KyokumenImproved, tesu: number): Promise<Te> {
    syncProductionWasm(this.wasm, position);
    this.wasm.setRootTesu(tesu);
    const key = this.wasm.searchBestMove(moveMs, maxDepth, quiescenceDepthMax);
    if (key === 0) throw new Error('production returned no move in a position with legal moves');
    return teFromWasmKey(key, position);
  }
}

type GameResult =
  | { outcome: 'win'; winner: number; plies: number; reason: 'checkmate' }
  | { outcome: 'draw'; plies: number; reason: 'repetition' | 'maxPlies' | 'stalemate' };

async function playGame(candidate: Player, production: Player, candidateIsSente: boolean, opening: Te[]): Promise<GameResult> {
  const position = new KyokumenImproved();
  position.initHirate();
  position.setTeban(SENTE);
  for (const openingMove of opening) {
    const move = openingMove.clone();
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }

  const repetition = new Map<number, number>();
  for (let ply = opening.length; ply < maxPlies; ply += 1) {
    const count = (repetition.get(position.HashVal) ?? 0) + 1;
    repetition.set(position.HashVal, count);
    if (count >= 4) return { outcome: 'draw', plies: ply, reason: 'repetition' };

    const legal = GenerateMovesImproved.generateLegalMoves(position);
    if (legal.length === 0) {
      const inCheck = GenerateMovesImproved.isKingInCheck(position, position.teban);
      if (inCheck) {
        return {
          outcome: 'win',
          winner: position.teban === SENTE ? GOTE : SENTE,
          plies: ply,
          reason: 'checkmate',
        };
      }
      return { outcome: 'draw', plies: ply, reason: 'stalemate' };
    }

    const candidateTurn = candidateIsSente ? position.teban === SENTE : position.teban === GOTE;
    const player = candidateTurn ? candidate : production;
    const move = await player.search(position, ply);
    if (!legal.some((entry) => sameMove(entry, move))) {
      throw new Error(`${player.name} returned an illegal move at ply ${ply}: ${move.toString()}`);
    }
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }
  return { outcome: 'draw', plies: maxPlies, reason: 'maxPlies' };
}

async function main(): Promise<void> {
  const rootPartition = new RootPartitionPlayer(candidatePath, weightsPath);
  const candidate = new RootPartitionMatchPlayer(rootPartition);
  const production = new ProductionMatchPlayer(loadProductionWasm(weightsPath));
  let candidateWins = 0;
  let productionWins = 0;
  let draws = 0;
  let legalPlies = 0;

  try {
    await rootPartition.ready();
    console.log(
      `^start games=${games} startGame=${startGame} ms=${moveMs} seed=${seedBase} ` +
        `candidateSha=${expectedCandidateSha} weightsSha=${expectedWeightsSha}`,
    );
    for (let game = startGame; game < games; game += 1) {
      const pair = game >> 1;
      const candidateIsSente = game % 2 === 0;
      const opening = [...buildNnueFixedTimeOpening(seedBase, pair).moves];
      candidate.newGame();
      production.newGame();
      const started = performance.now();
      const result = await playGame(candidate, production, candidateIsSente, opening);
      const elapsedMs = performance.now() - started;
      legalPlies += Math.max(0, result.plies - opening.length);
      let normalized: 'candidate' | 'production' | 'draw';
      if (result.outcome === 'draw') {
        draws += 1;
        normalized = 'draw';
      } else {
        const candidateWon = candidateIsSente ? result.winner === SENTE : result.winner === GOTE;
        if (candidateWon) candidateWins += 1;
        else productionWins += 1;
        normalized = candidateWon ? 'candidate' : 'production';
      }
      console.log(
        `^game index=${game} pair=${pair} candidateSide=${candidateIsSente ? 'sente' : 'gote'} ` +
          `winner=${normalized} reason=${result.reason} plies=${result.plies} elapsedMs=${elapsedMs.toFixed(3)} ` +
          `score=${candidateWins * 2 + draws}/${(game - startGame + 1) * 2} faults=${candidate.technicalFaults}`,
      );
    }
    console.log(
      `^result candidateW=${candidateWins} draws=${draws} productionW=${productionWins} ` +
        `halfpoints=${candidateWins * 2 + draws}/${(games - startGame) * 2} legalPlies=${legalPlies} ` +
        `faults=${candidate.technicalFaults}`,
    );
  } finally {
    await rootPartition.close();
  }
}

void main().catch((error) => {
  console.error(`^fatal ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
