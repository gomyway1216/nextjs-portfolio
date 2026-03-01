'use client';

import { useMemo, useState } from 'react';

type Mark = 'X' | 'O' | null;

interface Puzzle {
  board: Mark[];
  side: 'X' | 'O';
  correctMove: number;
  prompt: string;
  explanation: string;
}

const PUZZLES: Puzzle[] = [
  {
    board: ['X', 'X', null, 'O', 'O', null, null, null, null],
    side: 'X',
    correctMove: 2,
    prompt: 'X to move: win in one.',
    explanation: 'Top row finishes immediately.',
  },
  {
    board: ['X', 'X', null, 'O', 'O', null, 'X', null, null],
    side: 'O',
    correctMove: 5,
    prompt: 'O to move: one-move checkmate.',
    explanation: 'Middle row becomes O-O-O.',
  },
  {
    board: ['X', 'O', null, 'X', 'O', null, null, null, null],
    side: 'X',
    correctMove: 6,
    prompt: 'X to move: find the vertical kill.',
    explanation: 'Left column closes with X-X-X.',
  },
  {
    board: ['X', null, 'X', 'O', 'O', null, 'X', null, null],
    side: 'O',
    correctMove: 5,
    prompt: 'O to move: simple finish.',
    explanation: 'Middle row wins directly.',
  },
  {
    board: ['X', 'O', 'O', null, 'X', null, null, null, null],
    side: 'X',
    correctMove: 8,
    prompt: 'X to move: diagonal strike.',
    explanation: 'Diagonal 0-4-8 completes.',
  },
  {
    board: ['X', 'X', 'O', 'X', 'O', null, null, null, null],
    side: 'O',
    correctMove: 6,
    prompt: 'O to move: opposite diagonal win.',
    explanation: 'Diagonal 2-4-6 completes.',
  },
  {
    board: [null, 'O', 'X', 'O', 'X', null, null, null, null],
    side: 'X',
    correctMove: 6,
    prompt: 'X to move: corner tactic.',
    explanation: 'Diagonal 2-4-6 is the key.',
  },
  {
    board: ['X', null, null, 'O', 'O', null, 'X', 'X', null],
    side: 'O',
    correctMove: 5,
    prompt: 'O to move: punish instantly.',
    explanation: 'Middle row is forced win.',
  },
  {
    board: ['O', 'X', 'O', null, 'X', null, null, null, null],
    side: 'X',
    correctMove: 7,
    prompt: 'X to move: vertical idea.',
    explanation: 'Column 2 (index 1,4,7) finishes.',
  },
  {
    board: ['O', 'X', 'X', null, 'O', null, null, null, null],
    side: 'O',
    correctMove: 8,
    prompt: 'O to move: long diagonal finish.',
    explanation: 'Diagonal 0-4-8 completes.',
  },
  {
    board: ['O', 'O', null, 'X', 'X', null, null, null, 'O'],
    side: 'X',
    correctMove: 5,
    prompt: 'X to move: no hesitation.',
    explanation: 'Middle row ends the game.',
  },
  {
    board: ['O', null, 'X', 'X', 'O', null, null, null, null],
    side: 'O',
    correctMove: 8,
    prompt: 'O to move: close the diagonal.',
    explanation: 'Diagonal 0-4-8 is decisive.',
  },
];

const winningLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const getDateKey = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const hashString = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const getWinnerLine = (board: Mark[], mark: 'X' | 'O'): number[] | null => {
  for (const line of winningLines) {
    if (line.every((index) => board[index] === mark)) {
      return line;
    }
  }
  return null;
};

export const DailyMovePuzzle = () => {
  const dateKey = getDateKey();
  const puzzleIndex = hashString(dateKey) % PUZZLES.length;
  const puzzle = PUZZLES[puzzleIndex];

  const [attempts, setAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [message, setMessage] = useState('Choose the winning square.');
  const [completedToday, setCompletedToday] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem('daily-move-puzzle-last-solved') === dateKey;
  });

  const board = useMemo(() => {
    const cells = [...puzzle.board];
    if (solved) {
      cells[puzzle.correctMove] = puzzle.side;
    }
    return cells;
  }, [puzzle, solved]);

  const winLine = useMemo(() => {
    if (!solved) return null;
    return getWinnerLine(board, puzzle.side);
  }, [board, puzzle.side, solved]);

  const onCellClick = (index: number) => {
    if (solved) return;
    if (puzzle.board[index] !== null) return;

    setAttempts((prev) => prev + 1);

    if (index === puzzle.correctMove) {
      setSolved(true);
      setMessage(`Correct in ${attempts + 1} attempt(s). ${puzzle.explanation}`);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('daily-move-puzzle-last-solved', dateKey);
      }
      setCompletedToday(true);
      return;
    }

    setMessage('Not this square. Try another move.');
  };

  const reset = () => {
    setAttempts(0);
    setSolved(false);
    setMessage('Choose the winning square.');
  };

  const shareResult = async () => {
    const text = `Daily One-Move Puzzle ${dateKey}: solved in ${attempts} attempt(s).`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Result copied to clipboard.');
    } catch {
      setMessage(text);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0f172a, #111827)', color: '#e5e7eb', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Daily One-Move Puzzle</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>毎日1問、1手で勝つマスを当てる短時間パズル。</p>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', background: '#0f172a', padding: '0.35rem 0.8rem' }}>Date: {dateKey}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', background: '#0f172a', padding: '0.35rem 0.8rem' }}>Puzzle #{puzzleIndex + 1}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', background: '#0f172a', padding: '0.35rem 0.8rem' }}>Side: {puzzle.side}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', background: '#0f172a', padding: '0.35rem 0.8rem' }}>Attempts: {attempts}</span>
          {completedToday && <span style={{ border: '1px solid #166534', borderRadius: '999px', background: 'rgba(22, 101, 52, 0.35)', padding: '0.35rem 0.8rem' }}>Solved Today</span>}
        </div>

        <div style={{ border: '1px solid #334155', borderRadius: '12px', background: '#020617', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ marginBottom: '0.55rem', color: '#cbd5e1' }}>{puzzle.prompt}</div>
          <div style={{ color: '#94a3b8', minHeight: '1.4rem' }}>{message}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 110px)', gap: '10px', justifyContent: 'start' }}>
          {board.map((cell, index) => {
            const isWinningCell = winLine?.includes(index);
            return (
              <button
                key={index}
                onClick={() => onCellClick(index)}
                disabled={solved || puzzle.board[index] !== null}
                style={{
                  width: '110px',
                  height: '110px',
                  borderRadius: '10px',
                  border: isWinningCell ? '2px solid #22c55e' : '1px solid #334155',
                  background: isWinningCell ? 'rgba(34, 197, 94, 0.2)' : '#0f172a',
                  color: '#f8fafc',
                  fontSize: '2.2rem',
                  fontWeight: 800,
                  cursor: puzzle.board[index] === null && !solved ? 'pointer' : 'default',
                }}
              >
                {cell ?? ''}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={reset}
            style={{ background: '#22c55e', border: 'none', borderRadius: '10px', padding: '0.62rem 1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Retry Puzzle
          </button>

          {solved && (
            <button
              onClick={shareResult}
              style={{ background: '#38bdf8', color: '#082f49', border: 'none', borderRadius: '10px', padding: '0.62rem 1rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Copy Result
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DailyMovePuzzle;
