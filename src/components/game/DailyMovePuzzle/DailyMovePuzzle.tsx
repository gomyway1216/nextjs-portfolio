'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Info, Lightbulb, RotateCcw, Share2, Undo2 } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { InfoModal } from '../common/InfoModal';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import { getDateKey, getPuzzleForDate, type Mark } from './engine';
import {
  createStatsSession,
  recordHint,
  recordSolve,
  recordWrongPick,
  summarize,
  type StatsSession,
  type StatsStore,
} from './stats';
import styles from './DailyMovePuzzle.module.css';

type Feedback = 'idle' | 'wrong' | 'solved';

const STORAGE_KEY = 'daily-move-puzzle-last-solved';
const STATS_KEY = 'daily-move-puzzle-stats';

const openStatsSession = (): StatsSession => {
  let storage: Storage | null = null;
  try {
    // Reading the property itself throws when storage is blocked.
    storage = typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    storage = null;
  }
  return createStatsSession(storage, STATS_KEY);
};

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
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [completedToday, setCompletedToday] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === dateKey;
  });

  const [statsSession] = useState(openStatsSession);
  const [stats, setStats] = useState<StatsStore>(() => statsSession.current());

  const updateStats = useCallback(
    (apply: (store: StatsStore) => StatsStore) => {
      setStats(statsSession.update(apply));
    },
    [statsSession],
  );

  const summary = useMemo(() => summarize(stats, dateKey), [stats, dateKey]);
  const todayResult = stats.results[dateKey];
  const distributionMax = Math.max(1, summary.hinted, ...summary.distribution);

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

      setShareStatus('idle');
      setShowHint(false);
      setAttempts((prev) => prev + 1);

      if (index === puzzle.correctMove) {
        setSolved(true);
        setFeedback('solved');
        setCompletedToday(true);
        updateStats((store) => recordSolve(store, dateKey));
        try {
          window.localStorage.setItem(STORAGE_KEY, dateKey);
        } catch {
          // Storage is full or blocked: the solved badge lasts for this visit only.
        }
        return;
      }

      updateStats((store) => recordWrongPick(store, dateKey, index));
      setWrongPicks((prev) => [...prev, index]);
      setLastWrong(index);
      setFeedback('wrong');
    },
    [solved, puzzle.board, puzzle.correctMove, wrongPicks, dateKey, updateStats],
  );

  const toggleHint = useCallback(() => {
    if (!showHint) updateStats((store) => recordHint(store, dateKey));
    setShowHint(!showHint);
  }, [showHint, dateKey, updateStats]);

  const undo = useCallback(() => {
    if (solved || wrongPicks.length === 0) return;
    setWrongPicks((prev) => prev.slice(0, -1));
    setAttempts((prev) => Math.max(0, prev - 1));
    setLastWrong(null);
    setFeedback('idle');
    setShareStatus('idle');
  }, [solved, wrongPicks.length]);

  const reset = useCallback(() => {
    setAttempts(0);
    setWrongPicks([]);
    setSolved(false);
    setFeedback('idle');
    setLastWrong(null);
    setShowHint(false);
    setShareStatus('idle');
  }, []);

  const share = useCallback(async () => {
    const text = t.shareText(dateKey, attempts);
    try {
      // navigator.clipboard is undefined on insecure origins / older browsers.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareStatus('copied');
      } else {
        setShareStatus('failed');
      }
    } catch {
      setShareStatus('failed');
    }
  }, [t, dateKey, attempts]);

  const statusText = solved
    ? shareStatus === 'copied'
      ? t.copied
      : shareStatus === 'failed'
        ? t.copyFailed
        : attempts === 1
          ? t.solvedPerfect
          : t.solvedIn(attempts)
    : feedback === 'wrong'
      ? t.wrong
      : t.hint;

  const statusClass =
    shareStatus === 'failed'
      ? styles.statusError
      : solved
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
                onClick={toggleHint}
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

        <section className={styles.stats} aria-labelledby="daily-move-puzzle-stats-title">
          <h2 id="daily-move-puzzle-stats-title" className={styles.statsTitle}>
            {t.statsTitle}
          </h2>
          <p className={styles.statsToday}>
            {todayResult ? t.todayResult(todayResult.attempts, todayResult.hinted) : t.todayPending}
          </p>
          <dl className={styles.statTiles}>
            {(
              [
                [t.statSolved, summary.solved],
                [t.statCurrent, summary.currentStreak],
                [t.statBest, summary.bestStreak],
                [t.statFirstTry, summary.firstTry],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className={styles.statTile}>
                <dt className={styles.statLabel}>{label}</dt>
                <dd className={styles.statValue}>{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className={styles.distTitle}>{t.distTitle}</h3>
          <ul className={styles.distList}>
            {summary.distribution.map((days, i) => (
              <li key={i} className={styles.distRow}>
                <span className={styles.srOnly}>{t.distRow(i + 1, days)}</span>
                <span aria-hidden className={styles.distLabel}>{i + 1}</span>
                <span aria-hidden className={styles.distTrack}>
                  <span
                    className={styles.distFill}
                    style={{ width: `${(days / distributionMax) * 100}%` }}
                  />
                </span>
                <span aria-hidden className={styles.distCount}>{days}</span>
              </li>
            ))}
            <li className={styles.distRow}>
              <span className={styles.srOnly}>{t.distHintRow(summary.hinted)}</span>
              <span aria-hidden className={styles.distLabel}>{t.distHint}</span>
              <span aria-hidden className={styles.distTrack}>
                <span
                  className={`${styles.distFill} ${styles.distFillHint}`}
                  style={{ width: `${(summary.hinted / distributionMax) * 100}%` }}
                />
              </span>
              <span aria-hidden className={styles.distCount}>{summary.hinted}</span>
            </li>
          </ul>
          <p className={styles.statsNote}>{t.statsNote}</p>
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
