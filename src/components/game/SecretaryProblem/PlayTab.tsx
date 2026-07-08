'use client';

import { useMemo, useState } from 'react';
import type { GameStats } from '../common';
import { generateCandidates, SUGGESTED_R_RATIO } from './engine';
import type { SecretaryStrings } from './i18n';
import styles from './SecretaryProblem.module.css';

const DEFAULT_N = 20;
const MIN_N = 5;
const MAX_N = 50;

type Phase = 'idle' | 'interviewing' | 'done';

interface RoundState {
  candidates: number[];
  bestValue: number;
  current: number; // index of next reveal
  picked: number | null;
  pickedIndex: number | null;
  forcedLast: boolean;
}

const freshRound = (n: number): RoundState => {
  const candidates = generateCandidates(n);
  return {
    candidates,
    bestValue: Math.max(...candidates),
    current: 0,
    picked: null,
    pickedIndex: null,
    forcedLast: false,
  };
};

interface PlayTabProps {
  t: SecretaryStrings;
  stats: GameStats;
  setStats: React.Dispatch<React.SetStateAction<GameStats>>;
}

export const PlayTab = ({ t, stats, setStats }: PlayTabProps) => {
  const [n, setN] = useState(DEFAULT_N);
  const [round, setRound] = useState<RoundState>(() => freshRound(DEFAULT_N));
  const [phase, setPhase] = useState<Phase>('idle');
  const [showHint, setShowHint] = useState(true);

  const suggestedR = Math.round(n * SUGGESTED_R_RATIO);

  // Best score observed during the (fixed-length) observation phase.
  const skipPhaseMax = useMemo(() => {
    let m = -Infinity;
    for (let i = 0; i < suggestedR; i++) m = Math.max(m, round.candidates[i]);
    return m === -Infinity ? null : m;
  }, [round.candidates, suggestedR]);
  const bestSoFarInSkip = round.current >= suggestedR ? skipPhaseMax : null;

  const start = () => {
    setRound(freshRound(n));
    setPhase('interviewing');
  };

  const onNChange = (next: number) => {
    setN(next);
    setRound(freshRound(next));
    setPhase('idle');
  };

  const revealed = round.candidates.slice(0, round.current);
  const currentVal =
    round.current < round.candidates.length ? round.candidates[round.current] : null;
  const isCurrentBestSoFar =
    currentVal !== null && revealed.every((v) => v < currentVal);
  const totalPlays = stats.wins + stats.losses;

  const recommendation: 'reject' | 'accept' | null = useMemo(() => {
    if (phase !== 'interviewing' || currentVal === null) return null;
    if (round.current < suggestedR) return 'reject';
    return isCurrentBestSoFar ? 'accept' : 'reject';
  }, [phase, round, suggestedR, currentVal, isCurrentBestSoFar]);

  const recordOutcome = (isBest: boolean) =>
    setStats((s) =>
      isBest ? { ...s, wins: s.wins + 1 } : { ...s, losses: s.losses + 1 },
    );

  const accept = () => {
    if (phase !== 'interviewing' || currentVal === null) return;
    const isBest = currentVal === round.bestValue;
    setRound((r) => ({ ...r, picked: currentVal, pickedIndex: r.current }));
    recordOutcome(isBest);
    setPhase('done');
  };

  const reject = () => {
    if (phase !== 'interviewing' || currentVal === null) return;
    const nextCurrent = round.current + 1;
    const reachedEnd = nextCurrent >= round.candidates.length;
    if (reachedEnd) {
      const last = round.candidates[round.candidates.length - 1];
      const isBest = last === round.bestValue;
      setRound((r) => ({
        ...r,
        picked: last,
        pickedIndex: r.candidates.length - 1,
        forcedLast: true,
        current: r.candidates.length,
      }));
      recordOutcome(isBest);
      setPhase('done');
    } else {
      setRound((r) => ({ ...r, current: nextCurrent }));
    }
  };

  const resetStats = () => setStats({ wins: 0, losses: 0, draws: 0 });
  const won =
    phase === 'done' && round.picked !== null && round.picked === round.bestValue;

  return (
    <div className={styles.grid}>
      {/* ---- Left: interview panel ---- */}
      <section className={styles.card} aria-label={t.tabPlay}>
        <label className={styles.field}>
          <span className={styles.fieldHead}>
            <span>{t.candidatesLabel}</span>
            <span className={styles.fieldValue}>n = {n}</span>
          </span>
          <input
            type="range"
            className={styles.range}
            min={MIN_N}
            max={MAX_N}
            value={n}
            onChange={(e) => onNChange(Number(e.target.value))}
            disabled={phase === 'interviewing'}
            aria-label={t.candidatesLabel}
          />
          <span className={styles.fieldNote}>
            {t.suggestedSkip}: <strong>{suggestedR}</strong> (n/e ≈{' '}
            {(SUGGESTED_R_RATIO * 100).toFixed(1)}%)
          </span>
        </label>

        <div className={styles.actions}>
          {phase === 'idle' && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={start}>
              ▶ {t.start}
            </button>
          )}
          {phase === 'interviewing' && (
            <>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={accept}>
                {t.hire} ({currentVal})
                {showHint && recommendation === 'accept' && (
                  <span className={styles.hintDot} aria-hidden="true" />
                )}
              </button>
              <button className={`${styles.btn} ${styles.btnWarn}`} onClick={reject}>
                {t.pass}
                {showHint && recommendation === 'reject' && (
                  <span className={styles.hintDot} aria-hidden="true" />
                )}
              </button>
            </>
          )}
          {phase === 'done' && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={start}>
              ▶ {t.nextRound}
            </button>
          )}
          <button
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => onNChange(n)}
            disabled={phase === 'interviewing'}
          >
            {t.reset}
          </button>
        </div>

        <div className={styles.readout} aria-live="polite">
          <div className={styles.readoutLabel}>{t.currentCandidate}</div>
          {phase === 'interviewing' && currentVal !== null ? (
            <>
              <div className={styles.readoutMain}>
                <span
                  className={`${styles.readoutScore} ${
                    isCurrentBestSoFar ? styles.readoutScoreBest : ''
                  }`}
                >
                  {currentVal}
                </span>
                <span className={styles.readoutMeta}>
                  {t.ofN(round.current + 1, n)}
                  {isCurrentBestSoFar && (
                    <span className={styles.readoutMetaBest}> · {t.bestSoFar}</span>
                  )}
                </span>
              </div>
              {recommendation && showHint && (
                <span
                  className={`${styles.recommend} ${
                    recommendation === 'accept'
                      ? styles.recommendHire
                      : styles.recommendPass
                  }`}
                >
                  💡{' '}
                  {recommendation === 'accept' ? t.recommendHire : t.recommendPass}
                </span>
              )}
              {bestSoFarInSkip !== null && (
                <div className={styles.observeBar}>
                  {t.observePhaseBest}: <strong>{bestSoFarInSkip}</strong> ·{' '}
                  {t.observePhaseHint}
                </div>
              )}
            </>
          ) : (
            <div className={styles.readoutEmpty}>{t.idlePrompt}</div>
          )}
        </div>

        <div>
          <div className={styles.stripLabel}>{t.candidateStrip}</div>
          <div className={styles.strip}>
            {round.candidates.map((v, i) => {
              const inSkip = i < suggestedR;
              const isCurrent = i === round.current && phase === 'interviewing';
              const isPicked = round.pickedIndex === i && phase === 'done';
              const isRevealed =
                i < round.current || isCurrent || isPicked;
              const cls = [styles.cell];
              if (inSkip) cls.push(styles.cellObserve);
              if (isPicked) cls.push(won ? styles.cellPickedWin : styles.cellPickedLose);
              else if (isCurrent) cls.push(styles.cellCurrent);
              else if (i < round.current) cls.push(styles.cellRejected);
              return (
                <span
                  key={i}
                  className={cls.join(' ')}
                  title={`${inSkip ? t.phaseObserve : t.phaseDecide} · #${i + 1}`}
                >
                  {isRevealed ? v : '?'}
                </span>
              );
            })}
          </div>
          <div className={styles.legend}>
            {t.legendObserve} {t.legendHidden}
          </div>
        </div>
      </section>

      {/* ---- Right: results & record ---- */}
      <section className={styles.card} aria-label={t.resultsHeading}>
        <h3 className={styles.cardTitle}>{t.resultsHeading}</h3>

        {phase === 'done' && round.picked !== null && (
          <div className={`${styles.banner} ${won ? styles.bannerWin : styles.bannerLose}`}>
            {won ? '🏆 ' : '😅 '}
            {won ? t.win : t.lose} — {t.youHired(round.picked)}
            {round.forcedLast && t.forcedLast}. {t.actualBest(round.bestValue)}
          </div>
        )}

        <div className={styles.statGrid}>
          <Stat label={t.plays} value={`${totalPlays}`} color="var(--sp-cyan)" />
          <Stat
            label={t.winRate}
            value={totalPlays === 0 ? '—' : `${((stats.wins / totalPlays) * 100).toFixed(1)}%`}
            color="var(--sp-good)"
          />
          <Stat label={t.wins} value={`${stats.wins}`} color="var(--sp-good)" />
          <Stat
            label={t.theoryMax}
            value={`${(SUGGESTED_R_RATIO * 100).toFixed(1)}%`}
            color="var(--sp-accent-strong)"
          />
        </div>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={showHint}
            onChange={(e) => setShowHint(e.target.checked)}
          />
          {t.showHint}
        </label>

        <div style={{ marginTop: '0.9rem' }}>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={resetStats}>
            {t.resetStats}
          </button>
        </div>

        <div className={styles.note}>
          <strong>{t.infoStrategyTitle}:</strong> {t.infoStrategy}
        </div>
      </section>
    </div>
  );
};

const Stat = ({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) => (
  <div className={styles.stat}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>
      {value}
    </div>
  </div>
);
