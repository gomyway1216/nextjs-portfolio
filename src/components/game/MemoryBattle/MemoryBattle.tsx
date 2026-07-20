'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Settings } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  Difficulty,
  DifficultySelector,
  DifficultyOption,
  GameStats,
  GameTopBar,
  InfoModal,
} from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  Card,
  Owner,
  Winner,
  countScores,
  createBoard,
  decideWinner,
  isBoardCleared,
  isMatch,
} from './engine';
import {
  AI_CONFIG,
  AIMemory,
  createMemory,
  forgetMatched,
  observeReveal,
  planTurn,
} from './MemoryBattleAI';
import { getStrings } from './i18n';
import styles from './MemoryBattle.module.css';

type GridKey = 'small' | 'medium' | 'large';
const GRID_SPECS: Record<GridKey, { rows: number; cols: number; pairs: number }> = {
  small: { rows: 3, cols: 4, pairs: 6 },
  medium: { rows: 4, cols: 4, pairs: 8 },
  large: { rows: 4, cols: 6, pairs: 12 },
};

type Phase = 'playing' | 'over';

// Symbols shown on card faces; index by card value.
const FACE_SYMBOLS = ['🍎', '🍋', '🍇', '🍒', '🥝', '🍑', '🍉', '🫐', '🥥', '🍍', '🥭', '🍓'];

const MISMATCH_DELAY = 950; // ms cards stay revealed after a mismatch
const AI_FLIP_DELAY = 750; // pause before AI's first flip
const AI_SECOND_DELAY = 750; // pause before AI's second flip
const MATCH_LINGER = 550; // ms to celebrate a match before continuing

const MemoryBattle = () => {
  useFeatureLifecycle('game.memory-battle');
  const { language } = useGameLanguage();
  const t = useMemo(() => getStrings(language), [language]);

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [gridKey, setGridKey] = useState<GridKey>('medium');
  const [inSetup, setInSetup] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });

  const [board, setBoard] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]); // currently face-up, unmatched
  const [turn, setTurn] = useState<Owner>('player');
  const [phase, setPhase] = useState<Phase>('playing');
  const [message, setMessage] = useState<string>('');
  const [tone, setTone] = useState<'neutral' | 'good' | 'bad'>('neutral');
  const [mismatchIds, setMismatchIds] = useState<number[]>([]);
  const [justMatchedIds, setJustMatchedIds] = useState<number[]>([]);
  const [locked, setLocked] = useState(false); // input locked during animations / AI

  const aiMemory = useRef<AIMemory>(createMemory());
  const timers = useRef<number[]>([]);
  // Refs break the resolveFlip <-> runAiTurn / finishGame declaration cycle.
  const finishGameRef = useRef<(winner: Winner) => void>(() => {});
  const runAiTurnRef = useRef<(b: Card[]) => void>(() => {});
  // Guards the "two cards flipped" resolution effect from scheduling twice.
  const resolvingRef = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    resolvingRef.current = false;
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const spec = GRID_SPECS[gridKey];

  const startGame = useCallback(() => {
    clearTimers();
    const fresh = createBoard(GRID_SPECS[gridKey].pairs);
    aiMemory.current = createMemory();
    setBoard(fresh);
    setFlipped([]);
    setMismatchIds([]);
    setJustMatchedIds([]);
    setTurn('player');
    setPhase('playing');
    setLocked(false);
    setTone('neutral');
    setMessage(t.yourTurn);
    setInSetup(false);
  }, [clearTimers, gridKey, t.yourTurn]);

  const backToSetup = useCallback(() => {
    clearTimers();
    setInSetup(true);
  }, [clearTimers]);

  // Resolve a completed two-card flip. `sel` is exactly two board indices.
  const resolveFlip = useCallback(
    (currentBoard: Card[], sel: number[], mover: Owner) => {
      const [a, b] = sel;
      const cardA = currentBoard[a];
      const cardB = currentBoard[b];
      const cfg = AI_CONFIG[difficulty];

      // AI observes both revealed cards regardless of who flipped them.
      observeReveal(aiMemory.current, cardA, cfg);
      observeReveal(aiMemory.current, cardB, cfg);

      if (isMatch(cardA, cardB)) {
        // Update by position (map index) so we never conflate Card.id with the
        // board index — keeps the code correct even if those diverge.
        const nextBoard = currentBoard.map((c, i) =>
          i === a || i === b ? { ...c, matched: true, matchedBy: mover } : c,
        );
        forgetMatched(aiMemory.current, nextBoard);
        setBoard(nextBoard);
        setFlipped([]);
        setJustMatchedIds([a, b]);
        setTone('good');
        setMessage(mover === 'player' ? t.matchFound : `${t.ai}: ${t.matchFound}`);
        later(() => setJustMatchedIds([]), MATCH_LINGER + 100);

        if (isBoardCleared(nextBoard)) {
          const finalScores = countScores(nextBoard);
          finishGameRef.current(decideWinner(finalScores));
          return;
        }
        // Same player goes again.
        later(() => {
          setTone('neutral');
          setMessage(mover === 'player' ? t.goAgain : t.aiThinking);
          if (mover === 'ai') runAiTurnRef.current(nextBoard);
          else setLocked(false);
        }, MATCH_LINGER);
        return;
      }

      // Mismatch: show both, then flip back and pass turn.
      setMismatchIds([a, b]);
      setTone('bad');
      setMessage(t.noMatch);
      later(() => {
        setMismatchIds([]);
        setFlipped([]);
        const next: Owner = mover === 'player' ? 'ai' : 'player';
        setTurn(next);
        setTone('neutral');
        setMessage(next === 'player' ? t.yourTurn : t.aiTurn);
        if (next === 'ai') runAiTurnRef.current(currentBoard);
        else setLocked(false);
      }, MISMATCH_DELAY);
    },
    [difficulty, later, t],
  );

  const finishGame = useCallback(
    (winner: Winner) => {
      setPhase('over');
      setLocked(true);
      setFlipped([]);
      // Announce the result via the aria-live status line and clear any stale
      // "your turn / no match" message left over from the final move.
      if (winner === 'player') {
        setStats((s) => ({ ...s, wins: s.wins + 1 }));
        setTone('good');
        setMessage(t.youWin);
      } else if (winner === 'ai') {
        setStats((s) => ({ ...s, losses: s.losses + 1 }));
        setTone('bad');
        setMessage(t.aiWins);
      } else {
        setStats((s) => ({ ...s, draws: s.draws + 1 }));
        setTone('neutral');
        setMessage(t.draw);
      }
    },
    [t],
  );

  // Drive a full AI turn (two flips) with visible pauses.
  const runAiTurn = useCallback(
    (currentBoard: Card[]) => {
      setLocked(true);
      setTurn('ai');
      setTone('neutral');
      setMessage(t.aiThinking);
      const cfg = AI_CONFIG[difficulty];
      const plan = planTurn(currentBoard, aiMemory.current, cfg);

      later(() => {
        setFlipped([plan.first]);
        // resolveFlip observes both revealed cards, so no observeReveal here —
        // observing the first flip twice would silently boost the AI's memory.
        later(() => {
          setFlipped([plan.first, plan.second]);
          later(() => resolveFlip(currentBoard, [plan.first, plan.second], 'ai'), 260);
        }, AI_SECOND_DELAY);
      }, AI_FLIP_DELAY);
    },
    [difficulty, later, resolveFlip, t.aiThinking],
  );

  // Keep refs pointing at the latest callbacks so resolveFlip can call them
  // without creating a declaration cycle.
  useEffect(() => {
    finishGameRef.current = finishGame;
    runAiTurnRef.current = runAiTurn;
  }, [finishGame, runAiTurn]);

  const onCardClick = useCallback(
    (index: number) => {
      if (phase !== 'playing' || turn !== 'player' || locked) return;
      if (board[index]?.matched) return;
      // Functional updater so rapid clicks can't overwrite each other through a
      // stale `flipped` closure; also guards against double-flipping one card or
      // exceeding two face-up cards. Resolution is handled by the effect below.
      setFlipped((prev) => {
        if (prev.includes(index) || prev.length >= 2) return prev;
        return [...prev, index];
      });
    },
    [board, locked, phase, turn],
  );

  // Once two cards are face up, lock input and resolve the pair. Driven by an
  // effect (rather than inside onCardClick) so it always reads the committed
  // `flipped` state instead of a possibly stale closure. A ref guards against
  // scheduling twice, and state is only updated inside the deferred timer
  // callback (an external system) — never synchronously in the effect body.
  useEffect(() => {
    if (phase !== 'playing' || turn !== 'player' || locked) return;
    if (flipped.length !== 2 || resolvingRef.current) return;
    resolvingRef.current = true;
    // brief pause so the player sees the second card before resolution
    later(() => {
      resolvingRef.current = false;
      setLocked(true);
      resolveFlip(board, flipped, 'player');
    }, 260);
  }, [flipped, turn, phase, locked, board, resolveFlip, later]);

  // Keyboard: number keys flip the corresponding card (1-indexed, in-play only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'playing' || turn !== 'player' || locked) return;
      // Don't hijack browser/OS shortcuts such as Cmd/Ctrl/Alt + number.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      // Key n maps to fixed board position n-1, matching the "card N" aria
      // labels; matched or already-flipped positions are ignored.
      const target = n - 1;
      if (target < board.length && !board[target].matched && !flipped.includes(target)) {
        e.preventDefault();
        onCardClick(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [board, flipped, locked, onCardClick, phase, turn]);

  const scores = useMemo(() => countScores(board), [board]);
  const pairsLeft = spec.pairs - scores.player - scores.ai;
  const winner: Winner = useMemo(() => decideWinner(scores), [scores]);

  const difficultyOptions: DifficultyOption[] = useMemo(
    () => [
      { value: 'easy', label: t.difficulties.easy.label, description: t.difficulties.easy.description },
      { value: 'medium', label: t.difficulties.medium.label, description: t.difficulties.medium.description },
      { value: 'hard', label: t.difficulties.hard.label, description: t.difficulties.hard.description },
      { value: 'expert', label: t.difficulties.expert.label, description: t.difficulties.expert.description },
      { value: 'master', label: t.difficulties.master.label, description: t.difficulties.master.description },
    ],
    [t],
  );

  const gridOptions: { key: GridKey; label: string }[] = [
    { key: 'small', label: t.grids.small },
    { key: 'medium', label: t.grids.medium },
    { key: 'large', label: t.grids.large },
  ];

  return (
    <div className={styles.root}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      {inSetup ? (
        <div style={{ width: 'min(100%, 560px)' }}>
          <DifficultySelector
            title={t.title}
            subtitle={t.subtitle}
            icon={<span style={{ fontSize: '3rem' }}>🧠</span>}
            selectedDifficulty={difficulty}
            onSelectDifficulty={setDifficulty}
            options={difficultyOptions}
            difficultyTitle={t.difficultyTitle}
            startLabel={t.startLabel}
            kickerLabel={t.gameSetup}
            onStart={startGame}
            setupContent={
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                  }}
                >
                  {t.gridLabel}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {gridOptions.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setGridKey(g.key)}
                      aria-pressed={gridKey === g.key}
                      style={{
                        flex: '1 1 120px',
                        padding: '0.6rem 0.5rem',
                        borderRadius: '0.6rem',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        color: gridKey === g.key ? '#04263c' : '#cbd5e1',
                        background: gridKey === g.key ? '#38bdf8' : 'rgba(15,23,42,0.9)',
                        border:
                          gridKey === g.key
                            ? '2px solid #38bdf8'
                            : '2px solid rgba(100,116,139,0.4)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
        </div>
      ) : (
        <div className={styles.board}>
          <div className={styles.scoreRow}>
            <div
              className={`${styles.scoreCard} ${styles.scorePlayer}`}
              data-active={turn === 'player' && phase === 'playing'}
            >
              <span className={styles.scoreName}>{t.youScore}</span>
              <span className={styles.scoreValue}>{scores.player}</span>
            </div>
            <div className={styles.turnBadge}>
              <span
                className={styles.turnDot}
                data-turn={phase === 'playing' ? turn : undefined}
                aria-hidden
              />
              <span>{pairsLeft} {t.pairsLeft}</span>
            </div>
            <div
              className={`${styles.scoreCard} ${styles.scoreAi}`}
              data-active={turn === 'ai' && phase === 'playing'}
            >
              <span className={styles.scoreName}>{t.aiScore}</span>
              <span className={styles.scoreValue}>{scores.ai}</span>
            </div>
          </div>

          <div className={styles.message} data-tone={tone} role="status" aria-live="polite">
            {message}
          </div>

          <div
            className={styles.grid}
            style={{ gridTemplateColumns: `repeat(${spec.cols}, minmax(0, 1fr))` }}
            role="group"
            aria-label={t.title}
          >
            {board.map((card, index) => {
              const isFaceUp = card.matched || flipped.includes(index);
              const owner = card.matchedBy;
              const clickable =
                phase === 'playing' &&
                turn === 'player' &&
                !locked &&
                !card.matched &&
                !flipped.includes(index) &&
                flipped.length < 2;
              const symbol = FACE_SYMBOLS[card.value] ?? card.value + 1;
              const cellClass = [
                styles.cardCell,
                card.matched ? styles.cardMatched : '',
                card.matched && owner === 'ai' ? styles.byAi : '',
                mismatchIds.includes(index) ? styles.cardMismatch : '',
                justMatchedIds.includes(index) ? styles.cardJustMatched : '',
              ]
                .filter(Boolean)
                .join(' ');

              const ariaLabel = card.matched
                ? t.matchedAria(owner === 'ai' ? t.ai : t.you, card.value)
                : isFaceUp
                  ? String(symbol)
                  : t.cardAria(index + 1);

              return (
                <button
                  key={card.id}
                  type="button"
                  className={cellClass}
                  disabled={!clickable}
                  onClick={() => onCardClick(index)}
                  aria-label={ariaLabel}
                >
                  <span className={styles.cardInner} data-flipped={isFaceUp}>
                    <span className={`${styles.cardFace} ${styles.cardBack}`} aria-hidden>
                      ?
                    </span>
                    <span className={`${styles.cardFace} ${styles.cardFront}`} aria-hidden>
                      {symbol}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {phase === 'over' && (
            <div className={styles.result}>
              <div
                className={`${styles.resultTitle} ${
                  winner === 'player'
                    ? styles.resultWin
                    : winner === 'ai'
                      ? styles.resultLose
                      : styles.resultDraw
                }`}
              >
                {winner === 'player' ? t.youWin : winner === 'ai' ? t.aiWins : t.draw}
              </div>
              <div className={styles.resultSub}>
                {t.youScore} {scores.player} · {t.aiScore} {scores.ai}
              </div>
            </div>
          )}

          <div className={styles.buttonRow}>
            <button type="button" className={styles.primaryBtn} onClick={startGame}>
              <RotateCcw style={{ width: '1.15rem', height: '1.15rem' }} />
              {t.playAgain}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={backToSetup}>
              <Settings style={{ width: '1.15rem', height: '1.15rem' }} />
              {t.changeSettings}
            </button>
          </div>
        </div>
      )}

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.howToTitle}>
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
          <div
            style={{
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '0.5rem',
              padding: '1rem',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
            <h3 style={{ color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>
              {t.objectiveTitle}
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>{t.objectiveBody}</p>
          </div>
          <div
            style={{
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '0.5rem',
              padding: '1rem',
            }}
          >
            <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '0.5rem' }}>
              💡 {t.tipsTitle}
            </div>
            <ul style={{ color: '#d1d5db', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
              {t.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export { MemoryBattle };
export default MemoryBattle;
