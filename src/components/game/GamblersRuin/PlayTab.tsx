'use client';

import { useEffect, useRef, useState } from 'react';
import { TrajectoryChart } from './charts';
import { RuinConfig, RunResult, fairExpectedDuration, runRuin, theoreticalRuinProb } from './engine';

const STEP_INTERVAL_MS = 30;
const PLAY_MAX_STEPS = 5000;

const defaultConfig: RuinConfig = { start: 10, target: 20, winProb: 0.5 };

interface SessionStats {
  ruined: number;
  reached: number;
}

export const PlayTab = () => {
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
      const start = key === 'start' ? Number(value) : next.start;
      const target = key === 'target' ? Number(value) : next.target;
      if (start <= 0 || start >= target) return; // refuse invalid combo
    }
    setConfig(next);
    reset(next);
  };

  const playOneStep = () => {
    if (running || result) return;
    const won = Math.random() < config.winProb;
    // Compute next state first, then dispatch the setters sequentially —
    // calling other setters inside a functional updater is an anti-pattern
    // (updaters can re-run in Strict Mode and would dispatch duplicate
    // session-stat increments).
    const nextBankroll = won ? bankroll + 1 : bankroll - 1;
    setBankroll(nextBankroll);
    setTrajectory((t) => [...t, nextBankroll]);
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
    // Pre-compute the rest of the run so we can replay it visually without
    // re-rolling per-tick (which would diverge from a single random walk).
    const full = runRuin(config, PLAY_MAX_STEPS);
    const trail = full.trajectory; // includes start element
    let i = trajectory.length; // continue from current visible step
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
    // Reset visible state to the start point of `full` (since runRuin starts fresh).
    setBankroll(full.trajectory[0]);
    setSteps(0);
    setTrajectory([full.trajectory[0]]);
    i = 1;
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
  const fairE = fairExpectedDuration(config);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.8rem' }}>
          <NumField label="開始 a" value={config.start} min={1} max={config.target - 1} onChange={(v) => updateConfig('start', v)} disabled={running} />
          <NumField label="目標 N" value={config.target} min={config.start + 1} max={200} onChange={(v) => updateConfig('target', v)} disabled={running} />
          <FloatField label="勝率 p" value={config.winProb} min={0.01} max={0.99} step={0.01} onChange={(v) => updateConfig('winProb', v)} disabled={running} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <button onClick={playOneStep} disabled={running || result !== null} style={btn('#22c55e', running || result !== null)}>1回</button>
          {running ? (
            <button onClick={stopAuto} style={btn('#f97316')}>⏸ 停止</button>
          ) : (
            <button onClick={autoPlay} disabled={result !== null} style={btn('#0ea5e9', result !== null)}>▶ オート</button>
          )}
          <button onClick={() => reset()} style={btn('#1e293b', false, '#94a3b8', '#334155')}>リセット</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label="現在の資金" value={`${bankroll}`} color={result?.outcome === 'ruined' ? '#f87171' : result?.outcome === 'reached' ? '#4ade80' : '#67e8f9'} />
          <Stat label="ステップ数" value={`${steps}`} color="#a78bfa" />
        </div>

        {result && (
          <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.8rem', borderRadius: 10, background: result.outcome === 'ruined' ? '#7f1d1d44' : '#15803d44', border: `1px solid ${result.outcome === 'ruined' ? '#f87171' : '#4ade80'}`, color: result.outcome === 'ruined' ? '#fca5a5' : '#4ade80', fontWeight: 700 }}>
            {result.outcome === 'ruined' ? `💥 破産 — ${steps} ステップで $0` : `🏆 目標達成 — ${steps} ステップで $${config.target}`}
          </div>
        )}
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>理論値 & このセッション</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.8rem' }}>
          <Stat label="理論破産確率" value={`${(theoreticalRuin * 100).toFixed(2)}%`} color="#f87171" />
          <Stat label="理論期待ステップ (p=0.5)" value={Number.isFinite(fairE) ? `${fairE}` : '— (p≠0.5)'} color="#fbbf24" />
          <Stat label="セッション破産回数" value={`${sessionStats.ruined}`} color="#f87171" />
          <Stat label="セッション達成回数" value={`${sessionStats.reached}`} color="#4ade80" />
        </div>

        <h4 style={{ margin: '0 0 0.3rem', color: '#cbd5e1', fontSize: '0.95rem' }}>資金の推移</h4>
        <TrajectoryChart trajectories={[trajectory]} start={config.start} target={config.target} height={220} />
        <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5 }}>
          <strong style={{ color: '#cbd5e1' }}>ガンブラーズ・ルイン:</strong> 公平な (p=0.5) ゲームでも、破産する確率は (N - a) / N。
          わずかでも p &lt; 0.5 になると、破産はほぼ確実になります。シミュレーションタブで「何百回も試して、何回破産するか」を測れます。
        </p>
      </div>
    </div>
  );
};

const btn = (bg: string, disabled = false, color = '#fff', border?: string): React.CSSProperties => ({
  background: disabled ? '#1e293b' : bg,
  color: disabled ? '#475569' : color,
  border: border ? `1px solid ${border}` : 'none',
  borderRadius: 10,
  padding: '0.55rem 1.1rem',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.55rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.25rem', fontWeight: 800 }}>{value}</div>
  </div>
);

const NumField = ({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
    <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}
    />
  </label>
);

const FloatField = ({ label, value, min, max, step, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
    <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}
    />
  </label>
);
