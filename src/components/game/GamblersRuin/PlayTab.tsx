'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { TrajectoryChart } from './charts';
import { Outcome, RuinConfig, RunResult, expectedDuration, theoreticalRuinProb } from './engine';
import {
  EMPTY_SESSION,
  PlaySession,
  RUN_LOG_LIMIT,
  RunReview,
  continueRun,
  formatChance,
  oddsFrom,
  recordRun,
  reviewRun,
} from './liveOdds';
import type { TFn } from './i18n';
import styles from './GamblersRuin.module.css';

const STEP_INTERVAL_MS = 30;
const PLAY_MAX_STEPS = 5000;

const defaultConfig: RuinConfig = { start: 10, target: 20, winProb: 0.5 };

interface PlayTabProps {
  t: TFn;
  /** Owned by the parent so the record survives a visit to the Simulate tab. */
  session: PlaySession;
  onSessionChange: Dispatch<SetStateAction<PlaySession>>;
}

export const PlayTab = ({ t, session, onSessionChange }: PlayTabProps) => {
  const [config, setConfig] = useState<RuinConfig>(defaultConfig);
  const [bankroll, setBankroll] = useState(defaultConfig.start);
  const [steps, setSteps] = useState(0);
  const [running, setRunning] = useState(false);
  const [trajectory, setTrajectory] = useState<number[]>([defaultConfig.start]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [review, setReview] = useState<RunReview | null>(null);

  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // Mirrors `trajectory` so a finished run can be reviewed from inside a timer callback.
  const trajRef = useRef<number[]>([defaultConfig.start]);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const reset = (next?: RuinConfig) => {
    cancelledRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    runningRef.current = false;
    const cfg = next ?? config;
    setBankroll(cfg.start);
    setSteps(0);
    trajRef.current = [cfg.start];
    setTrajectory(trajRef.current);
    setResult(null);
    setReview(null);
    setRunning(false);
  };

  const pushPoint = (v: number) => {
    trajRef.current = [...trajRef.current, v];
    setTrajectory(trajRef.current);
  };

  const finishRun = (outcome: Outcome, finalBankroll: number) => {
    const done = reviewRun(config, trajRef.current, outcome);
    setResult({ outcome, steps: done.steps, finalBankroll, trajectory: [] });
    setReview(done);
    onSessionChange((s) => recordRun(s, config, done));
  };

  const clearSession = () => onSessionChange(EMPTY_SESSION);

  const updateConfig = <K extends keyof RuinConfig>(key: K, value: RuinConfig[K]) => {
    const next: RuinConfig = { ...config, [key]: value };
    if (key === 'start' || key === 'target') {
      // Keep 0 < start < target by nudging the sibling if needed.
      if (next.start >= next.target) {
        if (key === 'start') next.target = Math.min(200, next.start + 1);
        else next.start = Math.max(1, next.target - 1);
      }
    }
    setConfig(next);
    reset(next);
  };

  const playOneStep = () => {
    if (running || result) return;
    const won = Math.random() < config.winProb;
    const nextBankroll = won ? bankroll + 1 : bankroll - 1;
    setBankroll(nextBankroll);
    pushPoint(nextBankroll);
    setSteps((s) => s + 1);
    if (nextBankroll <= 0 || nextBankroll >= config.target) {
      finishRun(nextBankroll <= 0 ? 'ruined' : 'reached', nextBankroll);
    }
  };

  const autoPlay = () => {
    if (runningRef.current || result) return;
    runningRef.current = true;
    cancelledRef.current = false;
    setRunning(true);
    // Carry on from the current bankroll, so steps already played (by hand or
    // before a Stop) stay part of this run.
    const full = continueRun(config, bankroll, steps, PLAY_MAX_STEPS);
    const trail = full.trajectory;
    let i = 1;
    const tick = () => {
      if (cancelledRef.current) {
        runningRef.current = false;
        setRunning(false);
        return;
      }
      if (i < trail.length) {
        const v = trail[i];
        setBankroll(v);
        pushPoint(v);
        setSteps((s) => s + 1);
        i++;
      }
      // Settle in the same tick as the last point, so a Stop can never land
      // between the bankroll hitting a boundary and the run being recorded.
      if (i >= trail.length) {
        timerRef.current = null;
        runningRef.current = false;
        setRunning(false);
        finishRun(full.outcome, full.finalBankroll);
        return;
      }
      timerRef.current = window.setTimeout(tick, STEP_INTERVAL_MS);
    };
    tick();
  };

  const stopAuto = () => {
    cancelledRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    runningRef.current = false;
    setRunning(false);
  };

  const theoreticalRuin = theoreticalRuinProb(config);
  const expDur = expectedDuration(config);
  const live = oddsFrom(config, bankroll);
  const liveRuinText = formatChance(live.ruinProb, live.settled);
  const liveReachText = formatChance(live.reachProb, live.settled);
  const outcomeLabel = (o: Outcome) =>
    o === 'ruined' ? t('legendRuin') : o === 'reached' ? t('legendReach') : t('legendCap');
  const bankrollColor = result?.outcome === 'ruined'
    ? 'var(--gr-ruin)'
    : result?.outcome === 'reached'
      ? 'var(--gr-reach)'
      : 'var(--gr-info)';

  return (
    <div className={styles.playGrid}>
      <div className={styles.panel}>
        <div className={styles.controls}>
          <Slider label={t('start')} value={config.start} min={1} max={config.target - 1} onChange={(v) => updateConfig('start', v)} disabled={running} />
          <Slider label={t('target')} value={config.target} min={config.start + 1} max={200} onChange={(v) => updateConfig('target', v)} disabled={running} />
          <Slider label={t('winProb')} value={config.winProb} min={0.01} max={0.99} step={0.01} onChange={(v) => updateConfig('winProb', v)} disabled={running} format={(v) => v.toFixed(2)} />
        </div>

        <div className={styles.btnRow}>
          <button onClick={playOneStep} disabled={running || result !== null} className={`${styles.btn} ${styles.btnGreen}`}>{t('step1')}</button>
          {running ? (
            <button onClick={stopAuto} className={`${styles.btn} ${styles.btnOrange}`}>⏸ {t('stop')}</button>
          ) : (
            <button onClick={autoPlay} disabled={result !== null} className={`${styles.btn} ${styles.btnBlue}`}>▶ {t('auto')}</button>
          )}
          <button onClick={() => reset()} className={`${styles.btn} ${styles.btnGhost}`}>{t('reset')}</button>
        </div>

        <div className={styles.statGrid}>
          <Stat label={t('bankroll')} value={`${bankroll}`} color={bankrollColor} />
          <Stat label={t('stepsLabel')} value={`${steps}`} color="var(--gr-purple)" />
        </div>

        <h4 className={`${styles.subHeading} ${styles.liveHeading}`}>{t('liveHeading')}</h4>
        <div
          className={styles.liveBar}
          role="img"
          aria-label={t('liveBarLabel', { bankroll, ruin: liveRuinText, reach: liveReachText })}
        >
          <div className={styles.liveBarReach} style={{ width: `${live.reachProb * 100}%` }} />
        </div>
        <div className={styles.liveStats}>
          <Stat label={t('liveRuin')} value={liveRuinText} color="var(--gr-ruin)" />
          <Stat label={t('liveReach')} value={liveReachText} color="var(--gr-reach)" />
          <Stat label={t('liveSteps')} value={live.expectedSteps.toFixed(1)} color="var(--gr-accent-strong)" />
        </div>
        <p className={`${styles.caption} ${styles.liveShift}`}>
          {t('liveShift', { from: formatChance(1 - theoreticalRuin), to: liveReachText })}
          <br />
          {t('liveNote')}
        </p>

        <div className={styles.resultArea}>
          {!result && <p className={styles.resultPlaceholder}>{t('reviewPlaceholder')}</p>}
          {result && (
            <div
              className={`${styles.banner} ${
                result.outcome === 'ruined'
                  ? styles.bannerRuin
                  : result.outcome === 'reached'
                    ? styles.bannerReach
                    : styles.bannerCap
              }`}
              role="status"
            >
              {result.outcome === 'ruined'
                ? `💥 ${t('ruinedMsg', { steps })}`
                : result.outcome === 'reached'
                  ? `🏆 ${t('reachedMsg', { steps, target: config.target })}`
                  : `⏱️ ${t('cappedMsg', { steps })}`}
            </div>
          )}
          {review && (
            <ul className={styles.reviewList}>
              {review.outcome !== 'reached' && (
                <li>
                  {t(review.peakStep === 0 ? 'reviewPeakAtStart' : 'reviewPeak', {
                    peak: review.peak,
                    step: review.peakStep,
                    chance: formatChance(review.reachProbAtPeak),
                  })}
                </li>
              )}
              {review.outcome !== 'ruined' && (
                <li>
                  {t(review.lowStep === 0 ? 'reviewLowAtStart' : 'reviewLow', {
                    low: review.low,
                    step: review.lowStep,
                    chance: formatChance(review.ruinProbAtLow),
                  })}
                </li>
              )}
              <li>
                {t('reviewLuck', {
                  wins: review.wins,
                  losses: review.losses,
                  expected: review.expectedWins.toFixed(1),
                  p: config.winProb.toFixed(2),
                })}
              </li>
            </ul>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <h3 className={styles.sectionHeading}>{t('theoryHeading')}</h3>
        <div className={styles.statGridWide}>
          <Stat label={t('theoRuin')} value={formatChance(theoreticalRuin)} color="var(--gr-ruin)" />
          <Stat label={t('theoReach')} value={formatChance(1 - theoreticalRuin)} color="var(--gr-reach)" />
          <Stat label={t('expDuration')} value={expDur.toFixed(1)} color="var(--gr-accent-strong)" />
          <Stat label={t('sessionRuined')} value={`${session.ruined}`} color="var(--gr-ruin)" />
          <Stat label={t('sessionReached')} value={`${session.reached}`} color="var(--gr-reach)" />
        </div>

        <h4 className={styles.subHeading} style={{ marginTop: '0.9rem' }}>{t('bankrollTrend')}</h4>
        <TrajectoryChart trajectories={[trajectory]} start={config.start} target={config.target} height={220} />
        <p className={styles.caption}>
          <strong style={{ color: 'var(--gr-text)' }}>{t('title')}:</strong> {t('introBody')}
        </p>

        <div className={styles.logHeader}>
          <h4 className={styles.subHeading}>{t('logHeading', { n: RUN_LOG_LIMIT })}</h4>
          <button
            type="button"
            onClick={clearSession}
            disabled={session.runCount === 0}
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}
          >
            {t('logClear')}
          </button>
        </div>
        {session.log.length === 0 ? (
          <p className={`${styles.caption} ${styles.logEmpty}`}>{t('logEmpty')}</p>
        ) : (
          <div className={styles.logScroll} role="region" aria-label={t('logRegionLabel')} tabIndex={0}>
            <ol className={styles.logList}>
              {session.log.map((entry) => (
                <li key={entry.id} className={styles.logRow}>
                  <span
                    className={`${styles.logOutcome} ${
                      entry.review.outcome === 'ruined'
                        ? styles.logRuin
                        : entry.review.outcome === 'reached'
                          ? styles.logReach
                          : styles.logCap
                    }`}
                  >
                    #{entry.id} {outcomeLabel(entry.review.outcome)}
                  </span>
                  <span className={styles.logDetail}>
                    {t('logSteps', { steps: entry.review.steps })}
                    {' · '}
                    {t('logRange', { peak: entry.review.peak, low: entry.review.low })}
                  </span>
                  <span className={styles.logSettings}>
                    {t('logSettings', {
                      a: entry.config.start,
                      n: entry.config.target,
                      p: entry.config.winProb.toFixed(2),
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className={styles.stat} style={{ borderColor: `color-mix(in srgb, ${color} 40%, var(--gr-border))` }}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>{value}</div>
  </div>
);

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  format?: (v: number) => string;
}

const Slider = ({ label, value, min, max, step = 1, onChange, disabled, format }: SliderProps) => (
  <label className={`${styles.field} ${disabled ? styles.disabled : ''}`}>
    <span className={styles.fieldLabel}>
      {label}
      <span className={styles.fieldValue}>{format ? format(value) : value}</span>
    </span>
    <input
      type="range"
      className={styles.slider}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);
