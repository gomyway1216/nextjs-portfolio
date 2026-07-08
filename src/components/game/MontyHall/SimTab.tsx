'use client';

import { useEffect, useRef, useState } from 'react';
import { BarCompare, ConvergenceChart } from './charts';
import {
  SimSummary,
  runMontyCarloAsync,
  theoreticalStay,
  theoreticalSwitch,
  theoreticalRandom,
  DEFAULT_DOOR_COUNT,
} from './engine';
import type { MontyHallStrings } from './i18n';
import styles from './MontyHall.module.css';

const TRIAL_LIMITS = { min: 100, max: 1_000_000 };
const DEFAULT_TRIALS = 10_000;
const DOOR_OPTIONS = [3, 4, 5, 8];

const STAY_COLOR = '#94a3b8';
const SWITCH_COLOR = '#22c55e';
const RANDOM_COLOR = '#a78bfa';

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = ({ t }: { t: MontyHallStrings }) => {
  const [trialsInput, setTrialsInput] = useState(String(DEFAULT_TRIALS));
  const [doorCount, setDoorCount] = useState(DEFAULT_DOOR_COUNT);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SimSummary | null>(null);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    },
    [],
  );

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setResult(null);
    const safeTrials = Math.floor(clamp(Number(trialsInput), TRIAL_LIMITS.min, TRIAL_LIMITS.max));
    setTrialsInput(String(safeTrials));
    setProgress({ done: 0, total: safeTrials });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runMontyCarloAsync(safeTrials, {
        doorCount,
        signal: controller.signal,
        onProgress: (done, total) => {
          if (mountedRef.current) setProgress({ done, total });
        },
      });
      if (!mountedRef.current || controller.signal.aborted || !summary) return;
      setResult(summary);
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        setProgress(null);
      }
      runningRef.current = false;
      abortRef.current = null;
    }
  };

  const runLabel =
    running && progress
      ? t.running(progress.done.toLocaleString(), progress.total.toLocaleString())
      : t.runSim;

  const pct = progress ? (progress.done / progress.total) * 100 : 0;

  return (
    <div>
      <div className={styles.simControls}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="mh-sim-doors">
            {t.doorCountLabel}
          </label>
          <select
            id="mh-sim-doors"
            className={styles.select}
            value={doorCount}
            onChange={(e) => setDoorCount(Number(e.target.value))}
            disabled={running}
          >
            {DOOR_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="mh-trials">
            {t.trialsLabel(TRIAL_LIMITS.max.toLocaleString())}
          </label>
          <input
            id="mh-trials"
            className={styles.input}
            type="number"
            value={trialsInput}
            min={TRIAL_LIMITS.min}
            max={TRIAL_LIMITS.max}
            step={1}
            inputMode="numeric"
            onChange={(e) => setTrialsInput(e.target.value)}
            onBlur={() => {
              if (trialsInput.trim() === '') return;
              const safe = Math.floor(clamp(Number(trialsInput), TRIAL_LIMITS.min, TRIAL_LIMITS.max));
              setTrialsInput(String(safe));
            }}
            disabled={running}
          />
        </div>
        <button className={styles.runBtn} onClick={run} disabled={running}>
          {runLabel}
        </button>
      </div>

      {running && (
        <div className={styles.progressTrack} aria-hidden>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      )}

      {result ? <Results summary={result} t={t} /> : <Intro t={t} />}
    </div>
  );
};

const Intro = ({ t }: { t: MontyHallStrings }) => (
  <div className={styles.intro}>
    <strong>{t.introTitle}: </strong>
    {t.introBody}
  </div>
);

const Results = ({ summary, t }: { summary: SimSummary; t: MontyHallStrings }) => {
  const stayRate = summary.stayWins / summary.trials;
  const switchRate = summary.switchWins / summary.trials;
  const randomRate = summary.randomWins / summary.trials;
  const n = summary.doorCount;

  return (
    <div className={styles.resultsStack}>
      <div>
        <h3 className={styles.sectionTitle}>{t.winRateCompare(summary.trials.toLocaleString())}</h3>
        <BarCompare
          referenceLabel={t.theoreticalLine}
          bars={[
            { label: t.labelStay, value: stayRate, color: STAY_COLOR, reference: theoreticalStay(n) },
            { label: t.labelSwitch, value: switchRate, color: SWITCH_COLOR, reference: theoreticalSwitch(n) },
            { label: t.labelRandom, value: randomRate, color: RANDOM_COLOR, reference: theoreticalRandom(n) },
          ]}
        />
        <div className={styles.countRow}>
          <span className={styles.countChip} style={{ color: STAY_COLOR }}>
            {t.labelStay}: <b>{summary.stayWins.toLocaleString()}</b> / {summary.trials.toLocaleString()}
          </span>
          <span className={styles.countChip} style={{ color: SWITCH_COLOR }}>
            {t.labelSwitch}: <b>{summary.switchWins.toLocaleString()}</b> / {summary.trials.toLocaleString()}
          </span>
          <span className={styles.countChip} style={{ color: RANDOM_COLOR }}>
            {t.labelRandom}: <b>{summary.randomWins.toLocaleString()}</b> / {summary.trials.toLocaleString()}
          </span>
        </div>
        <p className={styles.note}>{t.referenceNote}</p>
      </div>

      <div>
        <h3 className={styles.sectionTitle}>{t.convergenceTitle}</h3>
        <ConvergenceChart
          trialsLabelSuffix={t.doors}
          series={[
            {
              label: `${t.labelStay} (${(theoreticalStay(n) * 100).toFixed(1)}%)`,
              color: STAY_COLOR,
              values: summary.stayCurve,
              reference: theoreticalStay(n),
            },
            {
              label: `${t.labelSwitch} (${(theoreticalSwitch(n) * 100).toFixed(1)}%)`,
              color: SWITCH_COLOR,
              values: summary.switchCurve,
              reference: theoreticalSwitch(n),
            },
            {
              label: `${t.labelRandom} (${(theoreticalRandom(n) * 100).toFixed(1)}%)`,
              color: RANDOM_COLOR,
              values: summary.randomCurve,
              reference: theoreticalRandom(n),
            },
          ]}
          x={summary.curveX}
        />
        <p className={styles.note}>{t.convergenceNote}</p>
      </div>
    </div>
  );
};
