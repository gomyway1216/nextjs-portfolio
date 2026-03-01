'use client';

import { useEffect, useMemo, useState } from 'react';

type Cell = -1 | 0 | 1;
type Phase = 'menu' | 'playing' | 'gameover';

type Result = 'player' | 'ai' | 'draw' | null;

interface Point {
  x: number;
  y: number;
}

interface GameState {
  phase: Phase;
  board: Cell[][];
  currentColor: Cell;
  validMoves: Point[];
  turnCount: number;
  message: string;
  result: Result;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
}

const SIZE = 8;
const PLAYER: Cell = 1;
const AI: Cell = -1;
const EMPTY: Cell = 0;
const MIRROR_INTERVAL = 4;

const DIRECTIONS: Point[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

const inside = (x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

const createInitialBoard = (): Cell[][] => {
  const board: Cell[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY) as Cell[]);
  board[3][3] = AI;
  board[4][4] = AI;
  board[3][4] = PLAYER;
  board[4][3] = PLAYER;
  return board;
};

const getFlips = (board: Cell[][], x: number, y: number, color: Cell): Point[] => {
  if (board[y][x] !== EMPTY) return [];

  const flips: Point[] = [];

  for (const dir of DIRECTIONS) {
    const line: Point[] = [];
    let cx = x + dir.x;
    let cy = y + dir.y;

    while (inside(cx, cy) && board[cy][cx] === -color) {
      line.push({ x: cx, y: cy });
      cx += dir.x;
      cy += dir.y;
    }

    if (line.length > 0 && inside(cx, cy) && board[cy][cx] === color) {
      flips.push(...line);
    }
  }

  return flips;
};

const getValidMoves = (board: Cell[][], color: Cell): Point[] => {
  const moves: Point[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (getFlips(board, x, y, color).length > 0) {
        moves.push({ x, y });
      }
    }
  }
  return moves;
};

const applyMove = (board: Cell[][], x: number, y: number, color: Cell): Cell[][] => {
  const flips = getFlips(board, x, y, color);
  if (flips.length === 0) return board;

  const next = board.map((row) => [...row]) as Cell[][];
  next[y][x] = color;
  for (const point of flips) {
    next[point.y][point.x] = color;
  }
  return next;
};

const mirrorHorizontally = (board: Cell[][]): Cell[][] => {
  return board.map((row) => [...row].reverse() as Cell[]);
};

const countDiscs = (board: Cell[][]) => {
  let black = 0;
  let white = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === PLAYER) black += 1;
      if (cell === AI) white += 1;
    }
  }
  return { black, white };
};

const pickAIMove = (board: Cell[][], moves: Point[]): Point => {
  let best = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const flips = getFlips(board, move.x, move.y, AI).length;
    const cornerBonus = (move.x === 0 || move.x === 7) && (move.y === 0 || move.y === 7) ? 20 : 0;
    const edgeBonus = move.x === 0 || move.x === 7 || move.y === 0 || move.y === 7 ? 4 : 0;

    const nextBoard = applyMove(board, move.x, move.y, AI);
    const playerMobility = getValidMoves(nextBoard, PLAYER).length;
    const score = flips * 3 + cornerBonus + edgeBonus - playerMobility;

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
};

const cellLabel = (x: number, y: number): string => `${String.fromCharCode(97 + x)}${y + 1}`;

const createInitialState = (): GameState => {
  const board = createInitialBoard();
  return {
    phase: 'menu',
    board,
    currentColor: PLAYER,
    validMoves: getValidMoves(board, PLAYER),
    turnCount: 0,
    message: 'Start game',
    result: null,
    stats: {
      wins: 0,
      losses: 0,
      draws: 0,
    },
  };
};

const playMove = (prev: GameState, point: Point, color: Cell): GameState => {
  const flips = getFlips(prev.board, point.x, point.y, color);
  if (flips.length === 0) {
    return prev;
  }

  let board = applyMove(prev.board, point.x, point.y, color);
  const turnCount = prev.turnCount + 1;
  let message = `${color === PLAYER ? 'You' : 'AI'} played ${cellLabel(point.x, point.y)}.`;

  if (turnCount % MIRROR_INTERVAL === 0) {
    board = mirrorHorizontally(board);
    message += ' Board mirrored!';
  }

  const nextColor = -color as Cell;
  const nextMoves = getValidMoves(board, nextColor);

  if (nextMoves.length > 0) {
    return {
      ...prev,
      board,
      currentColor: nextColor,
      validMoves: nextMoves,
      turnCount,
      message,
    };
  }

  const sameColorMoves = getValidMoves(board, color);
  if (sameColorMoves.length > 0) {
    return {
      ...prev,
      board,
      currentColor: color,
      validMoves: sameColorMoves,
      turnCount,
      message: `${message} ${nextColor === PLAYER ? 'You' : 'AI'} pass.`,
    };
  }

  const counts = countDiscs(board);
  let result: Result = 'draw';
  if (counts.black > counts.white) result = 'player';
  if (counts.white > counts.black) result = 'ai';
  const nextStats = { ...prev.stats };
  if (result === 'player') nextStats.wins += 1;
  if (result === 'ai') nextStats.losses += 1;
  if (result === 'draw') nextStats.draws += 1;

  return {
    ...prev,
    board,
    currentColor: EMPTY,
    validMoves: [],
    turnCount,
    phase: 'gameover',
    result,
    message: `Game Over: You ${counts.black} - ${counts.white} AI`,
    stats: nextStats,
  };
};

export const MirrorOthello = () => {
  const [game, setGame] = useState<GameState>(createInitialState);

  const start = () => {
    setGame((prev) => {
      const board = createInitialBoard();
      return {
        phase: 'playing',
        board,
        currentColor: PLAYER,
        validMoves: getValidMoves(board, PLAYER),
        turnCount: 0,
        message: 'Your turn',
        result: null,
        stats: prev.stats,
      };
    });
  };

  useEffect(() => {
    if (game.phase !== 'playing' || game.currentColor !== AI) return;
    if (game.validMoves.length === 0) return;

    const timer = window.setTimeout(() => {
      setGame((prev) => {
        if (prev.phase !== 'playing' || prev.currentColor !== AI || prev.validMoves.length === 0) return prev;
        const move = pickAIMove(prev.board, prev.validMoves);
        return playMove(prev, move, AI);
      });
    }, 460);

    return () => window.clearTimeout(timer);
  }, [game.phase, game.currentColor, game.validMoves]);

  const counts = useMemo(() => countDiscs(game.board), [game.board]);

  const onCellClick = (x: number, y: number) => {
    if (game.phase !== 'playing' || game.currentColor !== PLAYER) return;
    setGame((prev) => {
      if (prev.phase !== 'playing' || prev.currentColor !== PLAYER) return prev;
      return playMove(prev, { x, y }, PLAYER);
    });
  };

  const isValidMove = (x: number, y: number): boolean => {
    return game.validMoves.some((move) => move.x === x && move.y === y);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #020617, #0f172a)', color: '#e2e8f0', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Mirror Othello</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>4手ごとに盤面が左右反転。角取り戦略が突然崩れるオセロ。</p>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>You: {counts.black}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>AI: {counts.white}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>Turn: {game.turnCount}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>Stats {game.stats.wins}W-{game.stats.losses}L-{game.stats.draws}D</span>
        </div>

        <div style={{ marginBottom: '0.75rem', minHeight: '1.4rem', color: '#cbd5e1' }}>{game.message}</div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, minmax(38px, 56px))`, gap: '6px', maxWidth: '520px' }}>
          {game.board.flatMap((row, y) =>
            row.map((cell, x) => {
              const canPlay = game.phase === 'playing' && game.currentColor === PLAYER && isValidMove(x, y);
              return (
                <button
                  key={`${x}-${y}`}
                  onClick={() => onCellClick(x, y)}
                  disabled={!canPlay}
                  style={{
                    aspectRatio: '1 / 1',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    background: '#065f46',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: canPlay ? 'pointer' : 'default',
                    position: 'relative',
                    padding: 0,
                  }}
                >
                  {cell !== EMPTY && (
                    <span
                      style={{
                        width: '75%',
                        height: '75%',
                        borderRadius: '999px',
                        background: cell === PLAYER ? '#111827' : '#f8fafc',
                        border: cell === PLAYER ? '1px solid #6b7280' : '1px solid #94a3b8',
                        display: 'block',
                      }}
                    />
                  )}
                  {cell === EMPTY && canPlay && (
                    <span style={{ width: '26%', height: '26%', borderRadius: '999px', background: 'rgba(251, 191, 36, 0.95)' }} />
                  )}
                </button>
              );
            }),
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={start}
            style={{ background: '#22c55e', border: 'none', borderRadius: '10px', padding: '0.62rem 1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {game.phase === 'playing' ? 'Restart' : game.phase === 'gameover' ? 'Play Again' : 'Start'}
          </button>
          {game.phase === 'gameover' && game.result && (
            <div style={{ alignSelf: 'center', color: game.result === 'player' ? '#86efac' : game.result === 'ai' ? '#fda4af' : '#fde68a' }}>
              {game.result === 'player' ? 'You Win' : game.result === 'ai' ? 'AI Wins' : 'Draw'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MirrorOthello;
