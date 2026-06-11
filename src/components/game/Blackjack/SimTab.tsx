'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EdgeBars, MultiTrajectoryChart } from './charts';
import { SimSummary, StrategyName, runBlackjackSimAsync } from './engine';

const LIMITS = {
  hands: { min: 100, max: 200_000 },
  startingBankroll: { min: 100, max: 100_000 },
  baseBet: { min: 1, max: 10_000 },
};
const DEFAULTS = { hands: 20_000, startingBankroll: 1000, baseBet: 1 };

const STRATEGIES: { name: StrategyName; label: string; color: string }[] = [
  { name: 'basic', label: 'Basic Strategy', color: '#4ade80' },
  { name: 'mimic-dealer', label: 'Mimic Dealer (≤16 hit)', color: '#fbbf24' },
  { name: 'always-stand', label: 'Always Stand', color: '#f87171' },
];

const STRAT_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  STRATEGIES.map((s) => [s.name, { label: s.label, color: s.color }]),
);

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const { t } = useTranslation();
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
      for (let i = 0; i < STRATEGIES.length; i++) {
        setProgress({ done: 0, total: safeHands, strategyIdx: i });
        const summary = await runBlackjackSimAsync(STRATEGIES[i].name, safeHands, {
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
    ? t('games.blackjack.sim.runningLabel', {
        strategy: STRATEGIES[progress.strategyIdx].label,
        done: progress.done.toLocaleString(),
        total: progress.total.toLocaleString(),
      })
    : t('games.blackjack.sim.runButton');

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <NumField label={t('games.blackjack.sim.handsPerStrategy')} value={hands} {...LIMITS.hands} onChange={setHands} />
        <NumField label={t('games.blackjack.sim.startingBankroll')} value={startingBankroll} {...LIMITS.startingBankroll} onChange={setStartingBankroll} />
        <NumField label={t('games.blackjack.sim.betPerHand')} value={baseBet} {...LIMITS.baseBet} onChange={setBaseBet} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <button
          onClick={run}
          disabled={running}
          style={{
            background: running ? '#1e293b' : '#22c55e',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '0.65rem 1.4rem',
            fontWeight: 800,
            cursor: running ? 'wait' : 'pointer',
            fontSize: '1rem',
            minWidth: 280,
          }}
        >
          {runLabel}
        </button>
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
          {t('games.blackjack.sim.runNote')}
        </span>
      </div>

      {results.length > 0 ? <Results results={results} startingBankroll={startingBankroll} /> : <Intro />}
    </div>
  );
};

const Intro = () => {
  const { t } = useTranslation();
  return (
  <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
    <strong style={{ color: '#fbbf24' }}>{t('games.blackjack.sim.introTitle')}</strong> {t('games.blackjack.sim.introBody')}
    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.2rem' }}>
      <li><strong style={{ color: '#4ade80' }}>Basic Strategy</strong>: {t('games.blackjack.sim.introBasic')}</li>
      <li><strong style={{ color: '#fbbf24' }}>Mimic Dealer</strong>: {t('games.blackjack.sim.introMimic')}</li>
      <li><strong style={{ color: '#f87171' }}>Always Stand</strong>: {t('games.blackjack.sim.introStand')}</li>
    </ul>
    {t('games.blackjack.sim.introFooter')}
  </div>
  );
};

const Results = ({ results, startingBankroll }: { results: SimSummary[]; startingBankroll: number }) => {
  const { t } = useTranslation();
  return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
    <div>
      <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>{t('games.blackjack.sim.edgeTitle')}</h3>
      <EdgeBars results={results} labels={STRAT_META} />
      <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
        {t('games.blackjack.sim.edgeNote')}
      </p>
    </div>

    <div>
      <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>{t('games.blackjack.sim.trajectoryTitle')}</h4>
      <MultiTrajectoryChart
        series={results.map((r) => ({
          label: STRAT_META[r.strategy].label,
          color: STRAT_META[r.strategy].color,
          values: r.trajectory,
          x: r.trajectoryX,
        }))}
        baseline={startingBankroll}
      />
    </div>

    <div>
      <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>{t('games.blackjack.sim.detailsTitle')}</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
            <th style={{ padding: '0.3rem 0.5rem' }}>{t('games.blackjack.sim.table.strategy')}</th>
            <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{t('games.blackjack.sim.table.winRate')}</th>
            <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>BJ</th>
            <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>RTP</th>
            <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{t('games.blackjack.sim.table.edge')}</th>
            <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{t('games.blackjack.sim.table.totalNet')}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const meta = STRAT_META[r.strategy];
            const wr = (r.winCount / r.hands) * 100;
            return (
              <tr key={r.strategy} style={{ borderTop: '1px solid #1e293b' }}>
                <td style={{ padding: '0.45rem 0.5rem', color: meta.color, fontWeight: 700 }}>{meta.label}</td>
                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{wr.toFixed(1)}%</td>
                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{r.blackjackCount}</td>
                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{(r.rtp * 100).toFixed(2)}%</td>
                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: r.edge > 0 ? '#f87171' : '#4ade80' }}>{(r.edge * 100).toFixed(2)}%</td>
                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: r.totalNet >= 0 ? '#4ade80' : '#f87171' }}>{r.totalNet >= 0 ? '+' : ''}{r.totalNet.toFixed(0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
  );
};

const NumField = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
    <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
    />
  </label>
);
