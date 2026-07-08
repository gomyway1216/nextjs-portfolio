'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Target, Trophy } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useGameToolbar } from '@/contexts/GameToolbarContext';
import { useHighScore } from '@/hooks/useHighScore';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getUITranslation } from '../constants/gameTranslations';
import { InfoModal } from '../common/InfoModal';
import { getDifficultyColor } from '../common/utils';
import { getTimedButtonCopy } from './i18n';
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_TUNING,
  markerPosition,
  pickTargetCenter,
  scoreRound,
  summarizeRun,
  type Difficulty,
  type HitRating,
  type RoundResult,
} from './gameLogic';
import styles from './TimedButton.module.css';

type Phase = 'setup' | 'running' | 'result' | 'summary';

interface RoundState {
  index: number; // 0-based
  targetCenter: number;
  startTime: number;
}

const RATING_ORDER: HitRating[] = ['perfect', 'great', 'good', 'miss'];

export const TimedButton = () => {
  useFeatureLifecycle('game.timed-button');
  const { setContent } = useGameToolbar();
  const { language } = useGameLanguage();
  const copy = getTimedButtonCopy(language);
  const ui = getUITranslation(language);

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [highScore, updateHighScore] = useHighScore(`timed-button-${difficulty}`);
  const [phase, setPhase] = useState<Phase>('setup');
  const [showInfo, setShowInfo] = useState(false);

  const [round, setRound] = useState<RoundState | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [markerPos, setMarkerPos] = useState(0.5);
  const [runScore, setRunScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);

  const rafRef = useRef<number | null>(null);
  const roundRef = useRef<RoundState | null>(null);
  const phaseRef = useRef<Phase>('setup');
  const resultsRef = useRef<RoundResult[]>([]);
  const timeoutRef = useRef<number | null>(null);

  const tuning = DIFFICULTY_TUNING[difficulty];

  // Keep phaseRef synchronous with `phase` for guards, but note that some
  // handlers below also set it eagerly so a same-tick double-trigger is caught.
  const setPhaseSync = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // ---- Marker animation via rAF + performance.now (no setInterval drift) ----
  useEffect(() => {
    if (phase !== 'running') return;

    let active = true;
    const tick = () => {
      if (!active) return;
      const r = roundRef.current;
      if (r) {
        const elapsed = performance.now() - r.startTime;
        setMarkerPos(markerPosition(elapsed, tuning.periodMs));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [phase, tuning.periodMs]);

  const beginRound = useCallback(
    (index: number) => {
      const targetCenter = pickTargetCenter(tuning.targetHalfWidth);
      const next: RoundState = { index, targetCenter, startTime: performance.now() };
      roundRef.current = next;
      setRound(next);
      setLastResult(null);
      setPhaseSync('running');
    },
    [tuning.targetHalfWidth, setPhaseSync]
  );

  const startRun = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    resultsRef.current = [];
    setResults([]);
    setRunScore(0);
    setLastResult(null);
    setIsNewBest(false);
    setMarkerPos(0);
    beginRound(0);
  }, [beginRound]);

  const stopMarker = useCallback(() => {
    // Synchronous guard: flip the phase ref *before* any work so a same-tick
    // double-trigger (key repeat, tap+key) can't score the round twice or
    // schedule the advance timer more than once.
    if (phaseRef.current !== 'running') return;
    const r = roundRef.current;
    if (!r) return;
    phaseRef.current = 'result';

    // Freeze animation immediately.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const elapsed = performance.now() - r.startTime;
    const pos = markerPosition(elapsed, tuning.periodMs);
    setMarkerPos(pos);

    const result = scoreRound(pos, r.targetCenter, tuning);
    setLastResult(result);

    // Derive the updated results from a ref (no side effects inside a state
    // updater, no stale-closure read of `results`).
    const updated = [...resultsRef.current, result];
    resultsRef.current = updated;
    setResults(updated);
    setRunScore((prev) => prev + result.score);
    setPhase('result');

    const nextIndex = r.index + 1;
    const total = tuning.rounds;
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      if (phaseRef.current !== 'result') return;
      if (nextIndex >= total) {
        const summary = summarizeRun(updated);
        setRunScore(summary.totalScore);
        if (summary.totalScore > highScore) {
          updateHighScore(summary.totalScore);
          setIsNewBest(true);
        }
        setPhaseSync('summary');
      } else {
        beginRound(nextIndex);
      }
    }, 900);
  }, [tuning, beginRound, highScore, updateHighScore, setPhaseSync]);

  // ---- Global keyboard controls ----
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      // Don't hijack keys while a dialog/other control is focused for typing.
      if (showInfo) return;
      const current = phaseRef.current;
      // While NOT in an active round, let a focused button handle Space/Enter
      // natively so keyboard activation of the difficulty / start / play-again /
      // change-difficulty controls keeps working. We only take over the keys to
      // stop the marker during a running round.
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (current !== 'running' && activeEl instanceof HTMLElement && activeEl.tagName === 'BUTTON') {
        return;
      }
      event.preventDefault();
      if (current === 'running') {
        stopMarker();
      } else if (current === 'setup' || current === 'summary') {
        startRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stopMarker, startRun, showInfo]);

  // ---- Toolbar (HUD best score + info button) ----
  const openInfo = useCallback(() => setShowInfo(true), []);
  useEffect(() => {
    setContent({
      center: (
        <div className={styles.toolbarStats}>
          <div className={styles.toolbarPill}>
            <Trophy className={styles.toolbarIcon} />
            <span>
              {copy.best}: {highScore}
            </span>
          </div>
        </div>
      ),
      right: (
        <button
          type="button"
          onClick={openInfo}
          className={styles.toolbarButton}
          aria-label={ui.howToPlay}
        >
          <Info className={styles.toolbarButtonIcon} />
          <span className={styles.toolbarActionLabel}>{ui.howToPlay}</span>
        </button>
      ),
    });
    return () => setContent(null);
  }, [setContent, highScore, copy.best, ui.howToPlay, openInfo]);

  // Cleanup rAF and any pending round-advance timeout on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  const summary = useMemo(() => summarizeRun(results), [results]);

  const displayedPrecision = lastResult?.precision ?? 0;
  const markerState = useMemo(() => {
    if (phase === 'running') return 'moving';
    if (!lastResult) return 'stopped';
    if (lastResult.rating === 'perfect') return 'perfect';
    if (lastResult.rating === 'miss') return 'miss';
    return 'stopped';
  }, [phase, lastResult]);

  const ratingLabel = (rating: HitRating): string => {
    switch (rating) {
      case 'perfect':
        return copy.perfect;
      case 'great':
        return copy.great;
      case 'good':
        return copy.good;
      case 'miss':
        return copy.miss;
    }
  };

  const precisionColor = (p: number): string => {
    if (p >= 0.9) return 'var(--tb-perfect)';
    if (p >= 0.6) return 'var(--tb-target)';
    if (p > 0) return 'var(--tb-accent)';
    return 'var(--tb-miss)';
  };

  const targetHalfWidthPct = tuning.targetHalfWidth * 100;
  const targetCenterPct = (round?.targetCenter ?? 0.5) * 100;

  // The track is a decorative visualisation. The real, labelled control is the
  // action <button> below (and Space/Enter work globally), so we hide the track
  // from assistive tech to avoid presenting a non-focusable element that
  // behaves like a control. The pointer handler stays as a tap-anywhere
  // convenience for touch/mouse users.
  const renderTrack = (interactive: boolean) => (
    <div
      className={styles.trackWrap}
      aria-hidden="true"
      onPointerDown={
        interactive
          ? (e) => {
              e.preventDefault();
              stopMarker();
            }
          : undefined
      }
      style={interactive ? { cursor: 'pointer' } : undefined}
    >
      <div className={styles.trackTicks} />
      <div
        className={styles.targetZone}
        style={{
          left: `${targetCenterPct - targetHalfWidthPct}%`,
          width: `${targetHalfWidthPct * 2}%`,
        }}
      />
      <div className={styles.targetCenter} style={{ left: `${targetCenterPct}%` }} />
      <div
        className={styles.marker}
        data-state={markerState}
        style={{ left: `${markerPos * 100}%` }}
      />
    </div>
  );

  // ---------------- Render ----------------
  if (phase === 'setup') {
    return (
      <div className={styles.shell}>
        <div className={styles.panel}>
          <section className={styles.setup} aria-label={`${copy.title} setup`}>
            <div className={styles.setupHeader}>
              <div className={styles.setupIcon} aria-hidden="true">
                <Target size={26} />
              </div>
              <div>
                <h1 className={styles.title}>{copy.title}</h1>
                <p className={styles.tagline}>{copy.tagline}</p>
              </div>
            </div>

            <p className={styles.sectionLabel}>{copy.selectDifficulty}</p>
            <div className={styles.difficultyGrid}>
              {DIFFICULTY_ORDER.map((diff) => {
                const colors = getDifficultyColor(diff);
                const selected = difficulty === diff;
                return (
                  <button
                    key={diff}
                    type="button"
                    className={styles.difficultyButton}
                    data-selected={selected ? 'true' : 'false'}
                    aria-pressed={selected}
                    onClick={() => setDifficulty(diff)}
                    style={{ ['--diff-color' as string]: colors.border }}
                  >
                    <span className={styles.difficultyLabel}>{copy.difficulties[diff].label}</span>
                    <span className={styles.difficultyDesc}>{copy.difficulties[diff].description}</span>
                  </button>
                );
              })}
            </div>

            <button type="button" className={styles.primaryButton} onClick={startRun}>
              {copy.start}
            </button>
          </section>
        </div>
        {renderInfoModal()}
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className={styles.shell}>
        <div className={styles.panel}>
          <section className={styles.summary} aria-live="polite">
            <h2 className={styles.summaryTitle}>{copy.runComplete}</h2>
            <div className={styles.summaryScore}>{runScore}</div>
            {isNewBest && (
              <span className={styles.newBest}>
                <Trophy size={16} /> {copy.newBest}
              </span>
            )}

            <div className={styles.breakdown}>
              {RATING_ORDER.map((rating) => {
                const count =
                  rating === 'perfect'
                    ? summary.perfects
                    : rating === 'great'
                      ? summary.greats
                      : rating === 'good'
                        ? summary.goods
                        : summary.misses;
                return (
                  <div key={rating} className={styles.breakdownCell}>
                    <span className={styles.breakdownValue}>{count}</span>
                    <span className={styles.breakdownLabel}>{ratingLabel(rating)}</span>
                  </div>
                );
              })}
              <div className={styles.breakdownCell}>
                <span className={styles.breakdownValue}>{Math.round(summary.averagePrecision * 100)}%</span>
                <span className={styles.breakdownLabel}>{copy.avgPrecision}</span>
              </div>
              <div className={styles.breakdownCell}>
                <span className={styles.breakdownValue}>{Math.round(summary.bestPrecision * 100)}%</span>
                <span className={styles.breakdownLabel}>{copy.bestPrecision}</span>
              </div>
            </div>

            <div className={styles.summaryActions}>
              <button type="button" className={styles.primaryButton} onClick={startRun}>
                {copy.playAgain}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setPhaseSync('setup')}
              >
                {copy.changeDifficulty}
              </button>
            </div>
          </section>
        </div>
        {renderInfoModal()}
      </div>
    );
  }

  // running / result
  const interactive = phase === 'running';
  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <div className={styles.hud}>
          <div className={styles.hudCard}>
            <span className={styles.hudLabel}>{copy.round}</span>
            <span className={styles.hudValue}>
              {(round?.index ?? 0) + 1}/{tuning.rounds}
            </span>
          </div>
          <div className={styles.hudCard}>
            <span className={styles.hudLabel}>{copy.score}</span>
            <span className={styles.hudValue}>{runScore}</span>
          </div>
          <div className={styles.hudCard}>
            <span className={styles.hudLabel}>{copy.best}</span>
            <span className={styles.hudValue}>{highScore}</span>
          </div>
        </div>

        <section className={styles.stage}>
          {renderTrack(interactive)}

          <div className={styles.precisionMeter} aria-hidden="true">
            <div className={styles.precisionTrack}>
              <div
                className={styles.precisionFill}
                style={{
                  transform: `scaleX(${displayedPrecision})`,
                  background: precisionColor(displayedPrecision),
                }}
              />
            </div>
            <div className={styles.precisionCaption}>
              <span>{copy.precision}</span>
              <span>{Math.round(displayedPrecision * 100)}%</span>
            </div>
          </div>

          <div
            className={styles.feedback}
            data-rating={lastResult ? lastResult.rating : undefined}
            aria-live="assertive"
          >
            {lastResult ? (
              <>
                {ratingLabel(lastResult.rating)}
                {lastResult.rating !== 'miss' && (
                  <span style={{ fontWeight: 700, opacity: 0.85 }}> +{lastResult.score}</span>
                )}
              </>
            ) : (
              <span className={styles.feedbackHint}>{copy.hitTheTarget}</span>
            )}
          </div>

          <button
            type="button"
            className={styles.actionButton}
            onClick={stopMarker}
            disabled={!interactive}
            aria-label={interactive ? copy.tapToStop : copy.hitTheTarget}
          >
            {interactive ? copy.tapToStop : ratingLabel((lastResult ?? { rating: 'good' }).rating)}
          </button>
          <p className={styles.actionHint}>{copy.controlsHint}</p>
        </section>
      </div>
      {renderInfoModal()}
    </div>
  );

  function renderInfoModal() {
    return (
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={copy.howToPlay}>
        <div className={styles.infoGrid}>
          {copy.infoSections.map((section) => (
            <div key={section.title} className={styles.infoCard}>
              <h3 className={styles.infoCardTitle}>{section.title}</h3>
              <p className={styles.infoCardText}>{section.description}</p>
            </div>
          ))}
        </div>
        <div className={styles.tipsBox}>
          <div className={styles.tipsTitle}>💡 {copy.proTipsTitle}</div>
          <ul className={styles.tipsList}>
            {copy.proTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      </InfoModal>
    );
  }
};

export default TimedButton;
