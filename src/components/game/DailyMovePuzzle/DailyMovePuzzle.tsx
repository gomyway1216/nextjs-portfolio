'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Info, Lightbulb, RotateCcw, Share2, Undo2 } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { InfoModal } from '../common/InfoModal';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import { getDateKey, getPuzzleForDate, type Mark } from './engine';
import styles from './DailyMovePuzzle.module.css';

type Feedback = 'idle' | 'wrong' | 'solved';

const STORAGE_KEY = 'daily-move-puzzle-last-solved';

export const DailyMovePuzzle = () => {
  useFeatureLifecycle('game.daily-move-puzzle');
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // One-time client mount flag to gate hydration-sensitive rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const dateKey = useMemo(() => getDateKey(), []);
  const puzzle = useMemo(() => getPuzzleForDate(dateKey), [dateKey]);

  const [attempts, setAttempts] = useState(0);
  const [wrongPicks, setWrongPicks] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [lastWrong, setLastWrong] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [completedToday, setCompletedToday] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === dateKey;
  });

  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const displayBoard = useMemo<Mark[]>(() => {
    const cells = puzzle.board.slice();
    if (solved) cells[puzzle.correctMove] = puzzle.side;
    return cells;
  }, [puzzle, solved]);

  const handlePick = useCallback(
    (index: number) => {
      if (solved) return;
      if (puzzle.board[index] !== null) return;
      if (wrongPicks.includes(index)) return;

      setCopied(false);
      setShowHint(false);
      setAttempts((prev) => prev + 1);

      if (index === puzzle.correctMove) {
        setSolved(true);
        setFeedback('solved');
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, dateKey);
        }
        setCompletedToday(true);
        return;
      }

      setWrongPicks((prev) => [...prev, index]);
      setLastWrong(index);
      setFeedback('wrong');
    },
    [solved, puzzle.board, puzzle.correctMove, wrongPicks, dateKey],
  );

  const undo = useCallback(() => {
    if (solved || wrongPicks.length === 0) return;
    setWrongPicks((prev) => prev.slice(0, -1));
    setAttempts((prev) => Math.max(0, prev - 1));
    setLastWrong(null);
    setFeedback('idle');
    setCopied(false);
  }, [solved, wrongPicks.length]);

  const reset = useCallback(() => {
    setAttempts(0);
    setWrongPicks([]);
    setSolved(false);
    setFeedback('idle');
    setLastWrong(null);
    setShowHint(false);
    setCopied(false);
  }, []);

  const share = useCallback(async () => {
    const text = t.shareText(dateKey, attempts);
    try {
      // navigator.clipboard is undefined on insecure origins / older browsers.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } else {
        setCopied(false);
      }
    } catch {
      setCopied(false);
    }
  }, [t, dateKey, attempts]);

  const statusText = solved
    ? attempts === 1
      ? t.solvedPerfect
      : t.solvedIn(attempts)
    : copied
      ? t.copied
      : feedback === 'wrong'
        ? t.wrong
        : t.hint;

  const statusClass = solved
    ? styles.statusSuccess
    : feedback === 'wrong'
      ? styles.statusError
      : '';

  const markClass = (mark: Mark) =>
    mark === 'X' ? styles.markX : mark === 'O' ? styles.markO : '';

  // Avoid a hydration mismatch: the date key and localStorage-derived state are
  // client-only, so render nothing until mounted on the client.
  if (!mounted) {
    return null;
  }

  return (
    <div className={styles.page} style={{ background: 'var(--games-route-bg)' }}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            <CalendarDays aria-hidden size={30} /> {t.title}
          </h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </header>

        <div className={styles.pills}>
          <span className={styles.pill}>
            <span className={styles.pillLabel}>{t.date}</span> {dateKey}
          </span>
          <span className={styles.pill}>
            <span className={styles.pillLabel}>{t.side}</span>
            <span className={`${styles.turnMark} ${markClass(puzzle.side)}`} style={{ width: '1.3rem', height: '1.3rem', fontSize: '0.9rem' }}>
              {puzzle.side}
            </span>
          </span>
          <span className={styles.pill}>
            <span className={styles.pillLabel}>{t.par}</span> 1
          </span>
          <span className={styles.pill}>
            <span className={styles.pillLabel}>{t.attempts}</span> {attempts}
          </span>
          {completedToday && (
            <span className={`${styles.pill} ${styles.pillSolved}`}>✓ {t.solvedToday}</span>
          )}
        </div>

        <section className={styles.card} aria-live="polite">
          <p className={styles.prompt}>
            <span className={styles.turnBadge}>
              <span className={`${styles.turnMark} ${markClass(puzzle.side)}`}>{puzzle.side}</span>
              {t.prompt(puzzle.side)}
            </span>
          </p>

          {solved && (
            <div className={styles.celebration}>
              <span className={styles.celebrationTitle}>🎉 {t.celebration}</span>
            </div>
          )}

          <div
            className={styles.board}
            role="grid"
            aria-label={t.boardLabel}
          >
            {displayBoard.map((cell, index) => {
              const row = Math.floor(index / 3) + 1;
              const col = (index % 3) + 1;
              const isWinningCell = solved && puzzle.winningLine.includes(index);
              const isWrong = wrongPicks.includes(index);
              const isHint = showHint && !solved && index === puzzle.correctMove;
              const content =
                cell === 'X' ? 'X' : cell === 'O' ? 'O' : isWrong ? '✕' : t.empty;

              const classes = [
                styles.cell,
                cell === null && !isWrong ? styles.cellEmpty : '',
                cell === 'X' ? styles.cellX : '',
                cell === 'O' ? styles.cellO : '',
                isWinningCell ? styles.cellWin : '',
                isHint ? styles.cellHint : '',
                isWrong && index === lastWrong ? styles.cellWrong : '',
                solved && index === puzzle.correctMove ? styles.placed : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={index}
                  ref={(el) => {
                    cellRefs.current[index] = el;
                  }}
                  type="button"
                  role="gridcell"
                  className={classes}
                  onClick={() => handlePick(index)}
                  disabled={solved || cell !== null || isWrong}
                  aria-label={t.cellLabel(row, col, content)}
                  aria-disabled={solved || cell !== null || isWrong}
                >
                  {cell === 'X' || cell === 'O' ? cell : isWrong ? '✕' : ''}
                </button>
              );
            })}
          </div>

          <p className={`${styles.status} ${statusClass}`}>{statusText}</p>

          <div className={styles.actions}>
            {!solved && (
              <button
                type="button"
                className={styles.btn}
                onClick={undo}
                disabled={wrongPicks.length === 0}
              >
                <Undo2 aria-hidden size={16} /> {t.undo}
              </button>
            )}
            {!solved && (
              <button
                type="button"
                className={styles.btn}
                onClick={() => setShowHint((v) => !v)}
                aria-pressed={showHint}
              >
                <Lightbulb aria-hidden size={16} /> {t.hintBtn}
              </button>
            )}
            <button type="button" className={styles.btn} onClick={reset}>
              <RotateCcw aria-hidden size={16} /> {t.reset}
            </button>
            {solved && (
              <button type="button" className={`${styles.btn} ${styles.btnShare}`} onClick={share}>
                <Share2 aria-hidden size={16} /> {t.share}
              </button>
            )}
          </div>
        </section>

        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setInfoOpen(true)}
            aria-label={t.howToPlay}
          >
            <Info aria-hidden size={16} /> {t.howToPlay}
          </button>
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.infoTitle}>
        <ul className={styles.infoList}>
          {t.infoBody.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </InfoModal>
    </div>
  );
};

export default DailyMovePuzzle;
