'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getBlackjackStrings, fmt } from './i18n';
import { EdgeBars, MultiTrajectoryChart } from './charts';
import { SimSummary, StrategyName, runBlackjackSimAsync } from './engine';
import styles from './blackjack.module.css';

const LIMITS = {
  hands: { min: 100, max: 200_000 },
  startingBankroll: { min: 100, max: 100_000 },
  baseBet: { min: 1, max: 10_000 },
};
const DEFAULTS = { hands: 20_000, startingBankroll: 1000, baseBet: 1 };

const STRAT_ORDER: { name: StrategyName; color: string }[] = [
  { name: 'basic', color: '#4ade80' },
  { name: 'mimic-dealer', color: '#fbbf24' },
  { name: 'always-stand', color: '#f87171' },
];

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const { language } = useGameLanguage();
  const s = getBlackjackStrings(language);

  const stratLabel = (name: StrategyName) =>
    name === 'basic' ? s.sim.strategyLabels.basic
      : name === 'mimic-dealer' ? s.sim.strategyLabels.mimic
        : s.sim.strategyLabels.stand;
  const stratColor = (name: StrategyName) => STRAT_ORDER.find((x) => x.name === name)?.color ?? '#94a3b8';

  const [hands, setHands] = useState(DEFAULTS.hands);
  const [startingBankroll, setStartingBankroll] = useState(DEFAULTS.startingBankroll);
  const [baseBet, setBaseBet] = useState(DEFAULTS.baseBet);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; strategyIdx: number } | null>(null);
  const [results, setResults] = useState<SimSummary[]>([]);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setResults([]);
    const safeHands = clamp(hands, LIMITS.hands.min, LIMITS.hands.max);
    const safeStart = clamp(startingBankroll, LIMITS.startingBankroll.min, LIMITS.startingBankroll.max);
    const safeBet = clamp(baseBet, LIMITS.baseBet.min, LIMITS.baseBet.max);
    const controller = new AbortController();
    abortRef.current = controller;
    const summaries: SimSummary[] = [];
    try {
      for (let i = 0; i < STRAT_ORDER.length; i++) {
        setProgress({ done: 0, total: safeHands, strategyIdx: i });
        const summary = await runBlackjackSimAsync(STRAT_ORDER[i].name, safeHands, {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (mountedRef.current) setProgress({ done, total, strategyIdx: i });
          },
          startingBankroll: safeStart,
          baseBet: safeBet,
        });
        if (!mountedRef.current || controller.signal.aborted || !summary) return;
        summaries.push(summary);
        if (mountedRef.current) setResults([...summaries]);
      }
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        setProgress(null);
      }
      runningRef.current = false;
      abortRef.current = null;
    }
  };

  const runLabel = running && progress
    ? fmt(s.sim.running, {
        strategy: stratLabel(STRAT_ORDER[progress.strategyIdx].name),
        done: progress.done.toLocaleString(),
        total: progress.total.toLocaleString(),
      })
    : s.sim.runButton;

  const progressPct = progress ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className={styles.felt}>
      <div className={styles.controls}>
        <NumField label={s.sim.handsPerStrategy} value={hands} {...LIMITS.hands} onChange={setHands} />
        <NumField label={s.sim.startingBankroll} value={startingBankroll} {...LIMITS.startingBankroll} onChange={setStartingBankroll} />
        <NumField label={s.sim.betPerHand} value={baseBet} {...LIMITS.baseBet} onChange={setBaseBet} />
      </div>

      <div className={styles.runRow}>
        <button className={styles.runBtn} onClick={run} disabled={running}>{runLabel}</button>
        <span className={styles.runNote}>{s.sim.runNote}</span>
      </div>

      {running && (
        <div className={styles.progressTrack} aria-hidden>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {results.length > 0 ? (
        <Results
          results={results}
          startingBankroll={startingBankroll}
          s={s}
          stratLabel={stratLabel}
          stratColor={stratColor}
        />
      ) : (
        <Intro s={s} />
      )}
    </div>
  );
};

const Intro = ({ s }: { s: ReturnType<typeof getBlackjackStrings> }) => (
  <div className={styles.introCard}>
    <strong>{s.sim.introTitle}</strong> {s.sim.introBody}
    <ul>
      <li><strong style={{ color: '#4ade80' }}>{s.sim.strategyLabels.basic}</strong>: {s.sim.introBasic}</li>
      <li><strong style={{ color: '#fbbf24' }}>{s.sim.strategyLabels.mimic}</strong>: {s.sim.introMimic}</li>
      <li><strong style={{ color: '#f87171' }}>{s.sim.strategyLabels.stand}</strong>: {s.sim.introStand}</li>
    </ul>
    {s.sim.introFooter}
  </div>
);

const Results = ({
  results, startingBankroll, s, stratLabel, stratColor,
}: {
  results: SimSummary[];
  startingBankroll: number;
  s: ReturnType<typeof getBlackjackStrings>;
  stratLabel: (n: StrategyName) => string;
  stratColor: (n: StrategyName) => string;
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
    <div className={styles.simSection}>
      <h3>{s.sim.edgeTitle}</h3>
      <EdgeBars results={results} stratLabel={stratLabel} stratColor={stratColor} s={s} />
      <p className={styles.noteText}>{s.sim.edgeNote}</p>
    </div>

    <div className={styles.simSection}>
      <h4>{s.sim.trajectoryTitle}</h4>
      <MultiTrajectoryChart
        series={results.map((r) => ({
          label: stratLabel(r.strategy),
          color: stratColor(r.strategy),
          values: r.trajectory,
          x: r.trajectoryX,
        }))}
        baseline={startingBankroll}
        baselineLabel={s.sim.baselineLabel}
        handsAxis={s.sim.handsAxis}
      />
    </div>

    <div className={styles.simSection}>
      <h4>{s.sim.detailsTitle}</h4>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{s.sim.table.strategy}</th>
              <th style={{ textAlign: 'right' }}>{s.sim.table.winRate}</th>
              <th style={{ textAlign: 'right' }}>BJ</th>
              <th style={{ textAlign: 'right' }}>RTP</th>
              <th style={{ textAlign: 'right' }}>{s.sim.table.edge}</th>
              <th style={{ textAlign: 'right' }}>{s.sim.table.totalNet}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const decided = r.winCount + r.loseCount; // exclude pushes from win %
              const wr = decided === 0 ? 0 : (r.winCount / decided) * 100;
              return (
                <tr key={r.strategy}>
                  <td style={{ color: stratColor(r.strategy), fontWeight: 700 }}>{stratLabel(r.strategy)}</td>
                  <td style={{ textAlign: 'right' }}>{wr.toFixed(1)}%</td>
                  <td style={{ textAlign: 'right' }}>{r.blackjackCount}</td>
                  <td style={{ textAlign: 'right' }}>{(r.rtp * 100).toFixed(2)}%</td>
                  <td style={{ textAlign: 'right', color: r.edge > 0 ? '#f87171' : '#4ade80' }}>{(r.edge * 100).toFixed(2)}%</td>
                  <td style={{ textAlign: 'right', color: r.totalNet >= 0 ? '#4ade80' : '#f87171' }}>{r.totalNet >= 0 ? '+' : ''}{r.totalNet.toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const NumField = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) => (
  <label className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    <input
      className={styles.fieldInput}
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);
