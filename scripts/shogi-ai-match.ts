import type { Difficulty } from '../src/components/game/common/types';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { ShogiAIImproved } from '../src/components/game/ShogiImproved/ShogiAIImproved';
import { ShogiAIImprovedV3 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV3';
import { GOTE, SENTE } from '../src/components/game/ShogiImproved/types';

type EvalMode = 'v1' | 'v2';
type EngineName = 'v2' | 'v3';

type EngineInstance = {
  getNextTe: (...args: Parameters<ShogiAIImproved['getNextTe']>) => ReturnType<ShogiAIImproved['getNextTe']>;
};

interface MatchConfig {
  games: number;
  maxPlies: number;
  difficulty: Difficulty;
  maxDepth: number;
  maxTimeMs: number;
  quiescenceDepthMax: number;
  engineA: EngineName;
  engineB: EngineName;
  evalA: EvalMode; // "baseline" or "new"
  evalB: EvalMode;
  swapColors: boolean;
  verbose: boolean;
}

function parseIntArg(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseEngineArg(value: string | undefined, fallback: EngineName): EngineName {
  if (value === 'v2' || value === 'v3') return value;
  return fallback;
}

function parseEvalArg(value: string | undefined, fallback: EvalMode): EvalMode {
  if (value === 'v1' || value === 'v2') return value;
  return fallback;
}

function parseArgs(argv: string[]): MatchConfig {
  const argMap = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      argMap.set(key, next);
      i++;
    } else {
      argMap.set(key, 'true');
    }
  }

  const difficulty = (argMap.get('difficulty') as Difficulty) || 'medium';
  const engineA = parseEngineArg(argMap.get('engineA'), 'v2');
  const engineB = parseEngineArg(argMap.get('engineB'), 'v3');
  const evalA = parseEvalArg(argMap.get('evalA'), 'v2');
  const evalB = parseEvalArg(argMap.get('evalB'), 'v2');
  const verboseValue = argMap.get('verbose');
  const verbose =
    verboseValue === 'true' ||
    verboseValue === '1' ||
    verboseValue === 'yes' ||
    verboseValue === 'on';

  return {
    games: parseIntArg(argMap.get('games'), 4),
    maxPlies: parseIntArg(argMap.get('maxPlies'), 120),
    difficulty,
    maxDepth: parseIntArg(argMap.get('maxDepth'), difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6),
    // Default to a small time limit so running the script doesn't take forever.
    maxTimeMs: parseIntArg(argMap.get('maxTimeMs'), 60),
    quiescenceDepthMax: parseIntArg(argMap.get('qDepth'), 6),
    engineA,
    engineB,
    evalA,
    evalB,
    swapColors: argMap.get('swapColors') !== 'false',
    verbose,
  };
}

function otherSide(teban: number): number {
  return teban === SENTE ? GOTE : SENTE;
}

type GameResult =
  | { outcome: 'win'; winner: number; plies: number; reason: 'checkmate' }
  | { outcome: 'draw'; plies: number; reason: 'repetition' | 'maxPlies' | 'stalemate' };

function playOneGame(
  aiSente: { ai: EngineInstance; evalMode: EvalMode },
  aiGote: { ai: EngineInstance; evalMode: EvalMode },
  config: Pick<MatchConfig, 'difficulty' | 'maxDepth' | 'maxTimeMs' | 'quiescenceDepthMax' | 'maxPlies' | 'verbose'>
): GameResult {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  const repetitionCount = new Map<number, number>();

  for (let ply = 0; ply < config.maxPlies; ply++) {
    // Repetition (sennichite): 4 occurrences of the same position+turn => draw.
    repetitionCount.set(k.HashVal, (repetitionCount.get(k.HashVal) ?? 0) + 1);
    if ((repetitionCount.get(k.HashVal) ?? 0) >= 4) {
      return { outcome: 'draw', plies: ply, reason: 'repetition' };
    }

    const side = k.teban;
    const current = side === SENTE ? aiSente : aiGote;

    const move = current.ai.getNextTe(k, ply, {
      difficulty: config.difficulty,
      maxDepth: config.maxDepth,
      maxTimeMs: config.maxTimeMs,
      quiescenceDepthMax: config.quiescenceDepthMax,
      evaluationMode: current.evalMode,
    });

    if (!move) {
      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck) {
        return { outcome: 'win', winner: otherSide(side), plies: ply, reason: 'checkmate' };
      }
      return { outcome: 'draw', plies: ply, reason: 'stalemate' };
    }

    // Apply move to the main game position.
    if (config.verbose) {
      console.log(`${String(ply + 1).padStart(3, ' ')} ${formatSide(side)}: ${move.toString()}`);
    }
    k.move(move);
    k.toggleTeban();
  }

  return { outcome: 'draw', plies: config.maxPlies, reason: 'maxPlies' };
}

function formatSide(side: number): string {
  return side === SENTE ? 'SENTE' : 'GOTE';
}

function createEngine(name: EngineName): EngineInstance {
  switch (name) {
    case 'v2':
      return new ShogiAIImproved();
    case 'v3':
      return new ShogiAIImprovedV3();
    default: {
      const exhaustive: never = name;
      throw new Error(`unknown engine: ${exhaustive}`);
    }
  }
}

function main(): void {
  const config = parseArgs(process.argv.slice(2));

  console.log('[shogi-ai-match] config:', config);

  let aWins = 0;
  let bWins = 0;
  let draws = 0;

  for (let gameIndex = 0; gameIndex < config.games; gameIndex++) {
    const swap = config.swapColors && (gameIndex % 2 === 1);

    const aiA = createEngine(config.engineA);
    const aiB = createEngine(config.engineB);

    const sente = swap ? { ai: aiB, evalMode: config.evalB } : { ai: aiA, evalMode: config.evalA };
    const gote = swap ? { ai: aiA, evalMode: config.evalA } : { ai: aiB, evalMode: config.evalB };

    const result = playOneGame(sente, gote, config);

    const aIsSente = !swap;
    const winnerIsA =
      result.outcome === 'win' && (aIsSente ? result.winner === SENTE : result.winner === GOTE);
    const winnerIsB =
      result.outcome === 'win' && (aIsSente ? result.winner === GOTE : result.winner === SENTE);

    if (winnerIsA) aWins++;
    else if (winnerIsB) bWins++;
    else draws++;

    const labelA = `${config.engineA}/${config.evalA}${swap ? '(GOTE)' : '(SENTE)'}`;
    const labelB = `${config.engineB}/${config.evalB}${swap ? '(SENTE)' : '(GOTE)'}`;

    if (result.outcome === 'win') {
      console.log(
        `game ${gameIndex + 1}/${config.games}: ${labelA} vs ${labelB} => WIN ${formatSide(result.winner)} (${result.reason}) plies=${result.plies}`
      );
    } else {
      console.log(
        `game ${gameIndex + 1}/${config.games}: ${labelA} vs ${labelB} => DRAW (${result.reason}) plies=${result.plies}`
      );
    }
  }

  console.log('\n[shogi-ai-match] summary');
  console.log(`A (engine=${config.engineA}, eval=${config.evalA}) wins: ${aWins}`);
  console.log(`B (engine=${config.engineB}, eval=${config.evalB}) wins: ${bWins}`);
  console.log(`Draws: ${draws}`);
}

main();
