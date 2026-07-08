'use client';

import { useEffect, useRef, useState } from 'react';
import { TrajectoryChart } from './charts';
import { RuinConfig, RunResult, expectedDuration, runRuin, theoreticalRuinProb } from './engine';
import type { TFn } from './i18n';
import styles from './GamblersRuin.module.css';

const STEP_INTERVAL_MS = 30;
const PLAY_MAX_STEPS = 5000;

const defaultConfig: RuinConfig = { start: 10, target: 20, winProb: 0.5 };

interface SessionStats {
  ruined: number;
  reached: number;
}

export const PlayTab = ({ t }: { t: TFn }) => {
  const [config, setConfig] = useState<RuinConfig>(defaultConfig);
  const [bankroll, setBankroll] = useState(defaultConfig.start);
  const [steps, setSteps] = useState(0);
  const [running, setRunning] = useState(false);
  const [trajectory, setTrajectory] = useState<number[]>([defaultConfig.start]);
  const [sessionStats, setSessionStats] = useState<SessionStats>({ ruined: 0, reached: 0 });
  const [result, setResult] = useState<RunResult | null>(null);

  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

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
    setTrajectory([cfg.start]);
    setResult(null);
    setRunning(false);
  };

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
    setTrajectory((tj) => [...tj, nextBankroll]);
    setSteps((s) => s + 1);
    if (nextBankroll <= 0 || nextBankroll >= config.target) {
      const outcome = nextBankroll <= 0 ? 'ruined' : 'reached';
      setResult({ outcome, steps: steps + 1, finalBankroll: nextBankroll, trajectory: [] });
      setSessionStats((s) => ({
        ruined: s.ruined + (outcome === 'ruined' ? 1 : 0),
        reached: s.reached + (outcome === 'reached' ? 1 : 0),
      }));
    }
  };

  const autoPlay = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelledRef.current = false;
    setRunning(true);
    const full = runRuin(config, PLAY_MAX_STEPS);
    const trail = full.trajectory;
    let i = 1;
    const tick = () => {
      if (cancelledRef.current) {
        runningRef.current = false;
        setRunning(false);
        return;
      }
      if (i >= trail.length) {
        runningRef.current = false;
        setRunning(false);
        setResult(full);
        setSessionStats((s) => ({
          ruined: s.ruined + (full.outcome === 'ruined' ? 1 : 0),
          reached: s.reached + (full.outcome === 'reached' ? 1 : 0),
        }));
        return;
      }
      const v = trail[i];
      setBankroll(v);
      setTrajectory((tj) => [...tj, v]);
      setSteps((s) => s + 1);
      i++;
      timerRef.current = window.setTimeout(tick, STEP_INTERVAL_MS);
    };
    setBankroll(full.trajectory[0]);
    setSteps(0);
    setTrajectory([full.trajectory[0]]);
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

        {result && (
          <div className={`${styles.banner} ${result.outcome === 'ruined' ? styles.bannerRuin : styles.bannerReach}`} role="status">
            {result.outcome === 'ruined'
              ? `💥 ${t('ruinedMsg', { steps })}`
              : `🏆 ${t('reachedMsg', { steps, target: config.target })}`}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <h3 className={styles.sectionHeading}>{t('theoryHeading')}</h3>
        <div className={styles.statGridWide}>
          <Stat label={t('theoRuin')} value={`${(theoreticalRuin * 100).toFixed(2)}%`} color="var(--gr-ruin)" />
          <Stat label={t('theoReach')} value={`${((1 - theoreticalRuin) * 100).toFixed(2)}%`} color="var(--gr-reach)" />
          <Stat label={t('expDuration')} value={expDur.toFixed(1)} color="var(--gr-accent-strong)" />
          <Stat label={t('sessionRuined')} value={`${sessionStats.ruined}`} color="var(--gr-ruin)" />
          <Stat label={t('sessionReached')} value={`${sessionStats.reached}`} color="var(--gr-reach)" />
        </div>

        <h4 className={styles.subHeading} style={{ marginTop: '0.9rem' }}>{t('bankrollTrend')}</h4>
        <TrajectoryChart trajectories={[trajectory]} start={config.start} target={config.target} height={220} />
        <p className={styles.caption}>
          <strong style={{ color: 'var(--gr-text)' }}>{t('title')}:</strong> {t('introBody')}
        </p>
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
