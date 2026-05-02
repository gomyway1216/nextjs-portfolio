'use client';

import { useEffect, useMemo, useState } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
type Phase = 'menu' | 'preview' | 'playing' | 'won' | 'lost';

interface Position {
  x: number;
  y: number;
}

interface GameState {
  phase: Phase;
  stage: number;
  size: number;
  grid: number[][];
  player: Position;
  goal: Position;
  previewMs: number;
  timerSec: number;
  moves: number;
  visited: boolean[][];
  bestStage: number;
  message: string;
}

const createVisited = (size: number): boolean[][] => {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  visited[0][0] = true;
  return visited;
};

const hasPath = (grid: number[][]): boolean => {
  const size = grid.length;
  const queue: Position[] = [{ x: 0, y: 0 }];
  const seen = Array.from({ length: size }, () => Array(size).fill(false));
  seen[0][0] = true;

  const dirs: Position[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.x === size - 1 && current.y === size - 1) {
      return true;
    }

    for (const dir of dirs) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (seen[ny][nx]) continue;
      if (grid[ny][nx] === 1) continue;
      seen[ny][nx] = true;
      queue.push({ x: nx, y: ny });
    }
  }

  return false;
};

const generateGrid = (size: number, wallRate: number): number[][] => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => (Math.random() < wallRate ? 1 : 0)),
    );
    grid[0][0] = 0;
    grid[size - 1][size - 1] = 0;

    if (hasPath(grid)) {
      return grid;
    }
  }

  const fallback = Array.from({ length: size }, () => Array(size).fill(0));
  return fallback;
};

const setupStage = (stage: number, bestStage: number): GameState => {
  const size = Math.min(15, 7 + stage);
  const wallRate = Math.min(0.34, 0.2 + stage * 0.018);
  const grid = generateGrid(size, wallRate);
  const timerSec = Math.max(16, 45 - stage * 2);

  return {
    phase: 'preview',
    stage,
    size,
    grid,
    player: { x: 0, y: 0 },
    goal: { x: size - 1, y: size - 1 },
    previewMs: 3200,
    timerSec,
    moves: 0,
    visited: createVisited(size),
    bestStage,
    message: 'Memorize the map...'
  };
};

const createInitial = (): GameState => ({
  phase: 'menu',
  stage: 1,
  size: 0,
  grid: [],
  player: { x: 0, y: 0 },
  goal: { x: 0, y: 0 },
  previewMs: 0,
  timerSec: 0,
  moves: 0,
  visited: [],
  bestStage: 1,
  message: 'Start game',
});

export const MemoryMaze = () => {
  useFeatureLifecycle('game.memory-maze');
  const [game, setGame] = useState<GameState>(createInitial);

  const start = () => {
    setGame((prev) => setupStage(1, prev.bestStage));
  };

  const startNextStage = () => {
    setGame((prev) => setupStage(prev.stage + 1, Math.max(prev.bestStage, prev.stage + 1)));
  };

  useEffect(() => {
    if (game.phase !== 'preview') return;

    const timer = window.setInterval(() => {
      setGame((prev) => {
        if (prev.phase !== 'preview') return prev;

        const nextMs = prev.previewMs - 100;
        if (nextMs <= 0) {
          return {
            ...prev,
            phase: 'playing',
            previewMs: 0,
            message: 'Maze hidden. Reach the goal!',
          };
        }

        return { ...prev, previewMs: nextMs };
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [game.phase]);

  useEffect(() => {
    if (game.phase !== 'playing') return;

    const timer = window.setInterval(() => {
      setGame((prev) => {
        if (prev.phase !== 'playing') return prev;

        const nextTimer = prev.timerSec - 1;
        if (nextTimer <= 0) {
          return {
            ...prev,
            timerSec: 0,
            phase: 'lost',
            message: 'Time up!',
          };
        }

        return {
          ...prev,
          timerSec: nextTimer,
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [game.phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (game.phase !== 'playing') return;

      let dx = 0;
      let dy = 0;

      if (event.code === 'ArrowLeft' || event.code === 'KeyA') dx = -1;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') dx = 1;
      if (event.code === 'ArrowUp' || event.code === 'KeyW') dy = -1;
      if (event.code === 'ArrowDown' || event.code === 'KeyS') dy = 1;
      if (dx === 0 && dy === 0) return;

      event.preventDefault();

      setGame((prev) => {
        if (prev.phase !== 'playing') return prev;

        const nx = prev.player.x + dx;
        const ny = prev.player.y + dy;

        if (nx < 0 || ny < 0 || nx >= prev.size || ny >= prev.size) {
          return prev;
        }

        if (prev.grid[ny][nx] === 1) {
          return {
            ...prev,
            message: 'Wall!',
          };
        }

        const visited = prev.visited.map((row) => [...row]);
        visited[ny][nx] = true;

        const reachedGoal = nx === prev.goal.x && ny === prev.goal.y;
        if (reachedGoal) {
          return {
            ...prev,
            player: { x: nx, y: ny },
            visited,
            moves: prev.moves + 1,
            phase: 'won',
            bestStage: Math.max(prev.bestStage, prev.stage),
            message: `Stage ${prev.stage} clear!`,
          };
        }

        return {
          ...prev,
          player: { x: nx, y: ny },
          visited,
          moves: prev.moves + 1,
          message: 'Keep going',
        };
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [game.phase]);

  const previewSeconds = Math.ceil(game.previewMs / 1000);

  const cellSize = useMemo(() => {
    if (game.size <= 9) return 36;
    if (game.size <= 12) return 30;
    return 24;
  }, [game.size]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0b1120, #020617)', color: '#e5e7eb', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '940px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Memory Maze</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>最初の3秒で迷路を記憶して、暗闇の中でゴールを探す。</p>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>Stage: {game.stage}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>Timer: {game.timerSec}s</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>Moves: {game.moves}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#0f172a' }}>Best Stage: {game.bestStage}</span>
          {game.phase === 'preview' && <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem', background: '#1e293b' }}>Hide in: {previewSeconds}s</span>}
        </div>

        <div style={{ marginBottom: '0.8rem', minHeight: '1.3rem', color: '#cbd5e1' }}>{game.message}</div>

        {game.phase !== 'menu' && game.grid.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${game.size}, ${cellSize}px)`,
              gap: '4px',
              width: 'fit-content',
              border: '1px solid #334155',
              borderRadius: '14px',
              padding: '0.7rem',
              background: '#020617',
            }}
          >
            {game.grid.flatMap((row, y) =>
              row.map((cell, x) => {
                const isPlayer = game.player.x === x && game.player.y === y;
                const isGoal = game.goal.x === x && game.goal.y === y;
                const dist = Math.abs(game.player.x - x) + Math.abs(game.player.y - y);
                const nearPlayer = dist <= 1;
                const revealWalls = game.phase !== 'playing' || nearPlayer;

                let background = '#0f172a';
                if (cell === 1 && revealWalls) background = '#475569';
                if (cell === 1 && !revealWalls) background = '#020617';
                if (cell === 0 && game.visited[y]?.[x]) background = '#1d4ed8';
                if (isGoal) background = '#22c55e';
                if (isPlayer) background = '#f59e0b';

                return (
                  <div
                    key={`${x}-${y}`}
                    style={{
                      width: `${cellSize}px`,
                      height: `${cellSize}px`,
                      borderRadius: '6px',
                      border: '1px solid rgba(148, 163, 184, 0.15)',
                      background,
                    }}
                  />
                );
              }),
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={start}
            style={{ background: '#22c55e', border: 'none', borderRadius: '10px', padding: '0.62rem 1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {game.phase === 'menu' ? 'Start' : 'Restart'}
          </button>

          {game.phase === 'won' && (
            <button
              onClick={startNextStage}
              style={{ background: '#38bdf8', border: 'none', borderRadius: '10px', padding: '0.62rem 1rem', fontWeight: 700, cursor: 'pointer', color: '#082f49' }}
            >
              Next Stage
            </button>
          )}
        </div>

        <p style={{ marginTop: '0.8rem', color: '#94a3b8' }}>操作: 矢印キー または WASD</p>
      </div>
    </div>
  );
};

export default MemoryMaze;
