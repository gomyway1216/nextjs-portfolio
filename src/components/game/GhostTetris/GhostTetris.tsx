'use client';

import { useEffect, useMemo, useState } from 'react';

type GamePhase = 'menu' | 'playing' | 'gameover';

interface Piece {
  shape: number[][];
  x: number;
  y: number;
  color: number;
}

interface GameState {
  phase: GamePhase;
  board: number[][];
  lockedAt: number[][];
  current: Piece;
  next: Piece;
  score: number;
  lines: number;
}

const BOARD_W = 10;
const BOARD_H = 20;
const LOCK_VISIBILITY_MS = 2000;

const SHAPES: number[][][] = [
  [
    [1, 1, 1, 1],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
];

const COLORS = ['#000000', '#22d3ee', '#facc15', '#a78bfa', '#fb7185', '#38bdf8', '#34d399', '#f97316'];

const emptyBoard = (): number[][] => Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(0));
const emptyLockedAt = (): number[][] => Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(0));

const rotateClockwise = (shape: number[][]): number[][] => {
  const h = shape.length;
  const w = shape[0].length;
  const rotated: number[][] = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      rotated[x][h - 1 - y] = shape[y][x];
    }
  }
  return rotated;
};

const randomPiece = (): Piece => {
  const index = Math.floor(Math.random() * SHAPES.length);
  return {
    shape: SHAPES[index],
    x: 3,
    y: 0,
    color: index + 1,
  };
};

const canPlace = (board: number[][], piece: Piece, x: number, y: number, shape = piece.shape): boolean => {
  for (let sy = 0; sy < shape.length; sy += 1) {
    for (let sx = 0; sx < shape[sy].length; sx += 1) {
      if (!shape[sy][sx]) continue;
      const tx = x + sx;
      const ty = y + sy;
      if (tx < 0 || tx >= BOARD_W || ty < 0 || ty >= BOARD_H) {
        return false;
      }
      if (board[ty][tx] !== 0) {
        return false;
      }
    }
  }
  return true;
};

const clearLines = (board: number[][], lockedAt: number[][]): { board: number[][]; lockedAt: number[][]; cleared: number } => {
  const keptBoard: number[][] = [];
  const keptLockedAt: number[][] = [];

  for (let y = 0; y < BOARD_H; y += 1) {
    if (board[y].every((cell) => cell !== 0)) {
      continue;
    }
    keptBoard.push([...board[y]]);
    keptLockedAt.push([...lockedAt[y]]);
  }

  const cleared = BOARD_H - keptBoard.length;
  while (keptBoard.length < BOARD_H) {
    keptBoard.unshift(Array(BOARD_W).fill(0));
    keptLockedAt.unshift(Array(BOARD_W).fill(0));
  }

  return {
    board: keptBoard,
    lockedAt: keptLockedAt,
    cleared,
  };
};

const lockCurrent = (state: GameState): GameState => {
  const now = Date.now();
  const board = state.board.map((row) => [...row]);
  const lockedAt = state.lockedAt.map((row) => [...row]);

  for (let y = 0; y < state.current.shape.length; y += 1) {
    for (let x = 0; x < state.current.shape[y].length; x += 1) {
      if (!state.current.shape[y][x]) continue;
      const tx = state.current.x + x;
      const ty = state.current.y + y;
      if (ty < 0 || ty >= BOARD_H || tx < 0 || tx >= BOARD_W) continue;
      board[ty][tx] = state.current.color;
      lockedAt[ty][tx] = now;
    }
  }

  const { board: clearedBoard, lockedAt: clearedAt, cleared } = clearLines(board, lockedAt);
  const lineScore = [0, 100, 300, 500, 800][cleared] ?? 0;

  const spawned = {
    ...state.next,
    x: 3,
    y: 0,
  };

  if (!canPlace(clearedBoard, spawned, spawned.x, spawned.y, spawned.shape)) {
    return {
      ...state,
      board: clearedBoard,
      lockedAt: clearedAt,
      score: state.score + lineScore,
      lines: state.lines + cleared,
      phase: 'gameover',
    };
  }

  return {
    ...state,
    board: clearedBoard,
    lockedAt: clearedAt,
    current: spawned,
    next: randomPiece(),
    score: state.score + lineScore,
    lines: state.lines + cleared,
  };
};

const moveDown = (state: GameState, bonusScore = 0): GameState => {
  if (canPlace(state.board, state.current, state.current.x, state.current.y + 1)) {
    return {
      ...state,
      current: { ...state.current, y: state.current.y + 1 },
      score: state.score + bonusScore,
    };
  }
  return lockCurrent({
    ...state,
    score: state.score + bonusScore,
  });
};

const initialGameState = (): GameState => ({
  phase: 'menu',
  board: emptyBoard(),
  lockedAt: emptyLockedAt(),
  current: randomPiece(),
  next: randomPiece(),
  score: 0,
  lines: 0,
});

export const GhostTetris = () => {
  const [game, setGame] = useState<GameState>(initialGameState);
  const [now, setNow] = useState(0);

  const dropMs = useMemo(() => {
    const level = Math.floor(game.lines / 8);
    return Math.max(130, 650 - level * 40);
  }, [game.lines]);

  const start = () => {
    setGame({ ...initialGameState(), phase: 'playing' });
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 180);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (game.phase !== 'playing') return;
    const timer = window.setInterval(() => {
      setGame((prev) => {
        if (prev.phase !== 'playing') return prev;
        return moveDown(prev);
      });
    }, dropMs);

    return () => window.clearInterval(timer);
  }, [game.phase, dropMs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (game.phase !== 'playing') return;

      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        setGame((prev) => {
          if (prev.phase !== 'playing') return prev;
          const nextX = prev.current.x - 1;
          if (canPlace(prev.board, prev.current, nextX, prev.current.y)) {
            return { ...prev, current: { ...prev.current, x: nextX } };
          }
          return prev;
        });
      }

      if (event.code === 'ArrowRight') {
        event.preventDefault();
        setGame((prev) => {
          if (prev.phase !== 'playing') return prev;
          const nextX = prev.current.x + 1;
          if (canPlace(prev.board, prev.current, nextX, prev.current.y)) {
            return { ...prev, current: { ...prev.current, x: nextX } };
          }
          return prev;
        });
      }

      if (event.code === 'ArrowDown') {
        event.preventDefault();
        setGame((prev) => (prev.phase === 'playing' ? moveDown(prev, 1) : prev));
      }

      if (event.code === 'ArrowUp' || event.code === 'KeyZ') {
        event.preventDefault();
        setGame((prev) => {
          if (prev.phase !== 'playing') return prev;
          const rotated = rotateClockwise(prev.current.shape);
          if (canPlace(prev.board, prev.current, prev.current.x, prev.current.y, rotated)) {
            return { ...prev, current: { ...prev.current, shape: rotated } };
          }
          return prev;
        });
      }

      if (event.code === 'Space') {
        event.preventDefault();
        setGame((prev) => {
          if (prev.phase !== 'playing') return prev;
          let y = prev.current.y;
          let dropped = 0;
          while (canPlace(prev.board, prev.current, prev.current.x, y + 1)) {
            y += 1;
            dropped += 1;
          }
          return moveDown({
            ...prev,
            current: { ...prev.current, y },
          }, dropped * 2);
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [game.phase]);

  const displayBoard = game.board.map((row) => [...row]);
  if (game.phase === 'playing') {
    for (let y = 0; y < game.current.shape.length; y += 1) {
      for (let x = 0; x < game.current.shape[y].length; x += 1) {
        if (!game.current.shape[y][x]) continue;
        const tx = game.current.x + x;
        const ty = game.current.y + y;
        if (tx < 0 || tx >= BOARD_W || ty < 0 || ty >= BOARD_H) continue;
        displayBoard[ty][tx] = game.current.color;
      }
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1rem', background: 'linear-gradient(180deg, #111827, #020617)', color: '#e5e7eb' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto', display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(280px, 340px) minmax(280px, 1fr)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Ghost Tetris</h1>
          <p style={{ color: '#94a3b8' }}>置いたブロックが2秒後にほぼ透明化。記憶を頼りにラインを消す。</p>
          <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>Score: {game.score}</div>
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>Lines: {game.lines}</div>
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>Drop Interval: {dropMs}ms</div>
          </div>

          <button
            onClick={start}
            style={{
              width: '100%',
              padding: '0.7rem 1rem',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              background: '#14b8a6',
              color: '#032a2a',
            }}
          >
            {game.phase === 'playing' ? 'Restart' : game.phase === 'gameover' ? 'Play Again' : 'Start'}
          </button>

          {game.phase === 'gameover' && <p style={{ marginTop: '0.75rem', color: '#fda4af' }}>Game Over: 新しいピースを置けませんでした。</p>}

          <p style={{ marginTop: '1rem', fontSize: '0.92rem', color: '#94a3b8', lineHeight: 1.7 }}>
            操作: ←→移動 / ↓ソフトドロップ / ↑回転 / Spaceハードドロップ
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ border: '1px solid #334155', borderRadius: '14px', padding: '0.75rem', background: '#020617' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD_W}, 24px)`, gap: '2px' }}>
              {displayBoard.flatMap((row, y) =>
                row.map((cell, x) => {
                  const isLockedCell = game.board[y][x] !== 0;
                  const lockedAt = game.lockedAt[y][x];
                  const ghostOpacity = isLockedCell
                    ? Math.max(0.15, 1 - Math.max(0, now - lockedAt - LOCK_VISIBILITY_MS) / 500)
                    : 1;
                  return (
                    <div
                      key={`${x}-${y}`}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        background: cell === 0 ? 'rgba(15, 23, 42, 0.8)' : COLORS[cell],
                        opacity: cell === 0 ? 1 : ghostOpacity,
                        transition: 'opacity 120ms linear',
                      }}
                    />
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GhostTetris;
