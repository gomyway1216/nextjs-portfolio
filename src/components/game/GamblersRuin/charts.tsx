'use client';

import styles from './GamblersRuin.module.css';

/* Colors reference CSS variables defined on .root so charts follow the theme. */
const C = {
  grid: 'var(--gr-grid)',
  faint: 'var(--gr-text-faint)',
  dim: 'var(--gr-text-dim)',
  accent: 'var(--gr-accent)',
  ruin: 'var(--gr-ruin)',
  reach: 'var(--gr-reach)',
  info: 'var(--gr-info)',
  surface: 'var(--gr-surface-2)',
} as const;

interface TrajectoryChartProps {
  trajectories: number[][];
  start: number;
  target: number;
  width?: number;
  height?: number;
  legend?: { ruin: string; reach: string; cap: string };
}

/** Plots many bankroll trajectories on the same axes, colored by outcome. */
export const TrajectoryChart = ({
  trajectories,
  start,
  target,
  width = 700,
  height = 280,
  legend,
}: TrajectoryChartProps) => {
  if (trajectories.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  let xMax = 0;
  for (const t of trajectories) if (t.length > xMax) xMax = t.length;
  if (xMax === 0) return null;
  const xScale = (i: number) => padding.left + (i / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - (v / target) * innerH;
  const startY = yScale(start);

  return (
    <svg
      className={styles.chart}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Bankroll trajectories over time"
    >
      {[0, 0.5, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={C.grid} strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill={C.faint} fontSize="10">{Math.round(p * target)}</text>
          </g>
        );
      })}
      <line x1={padding.left} x2={width - padding.right} y1={startY} y2={startY} stroke={C.accent} strokeDasharray="4 4" strokeWidth={1} opacity={0.7} />
      <text x={padding.left + 4} y={startY - 4} fill={C.accent} fontSize="10">start = {start}</text>

      {trajectories.map((tr, idx) => {
        const last = tr[tr.length - 1];
        const stroke = last <= 0 ? C.ruin : last >= target ? C.reach : C.dim;
        const opacity = trajectories.length > 30 ? 0.28 : 0.6;
        const step = Math.max(1, Math.floor(tr.length / 1000));
        const pts: string[] = [];
        for (let i = 0; i < tr.length; i += step) {
          pts.push(`${xScale(i).toFixed(1)},${yScale(tr[i]).toFixed(1)}`);
        }
        if ((tr.length - 1) % step !== 0) {
          pts.push(`${xScale(tr.length - 1).toFixed(1)},${yScale(tr[tr.length - 1]).toFixed(1)}`);
        }
        return <polyline key={idx} points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={1.3} opacity={opacity} />;
      })}

      <text x={padding.left} y={height - 8} fill={C.faint} fontSize="10">0 steps</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill={C.faint} fontSize="10">{xMax.toLocaleString()} steps</text>

      {legend && (
        <g transform={`translate(${width - padding.right - 124}, ${padding.top + 4})`}>
          <rect x={0} y={0} width={122} height={48} rx={5} fill={C.surface} stroke={C.grid} />
          <line x1={8} x2={22} y1={13} y2={13} stroke={C.ruin} strokeWidth={2} /> <text x={27} y={16} fill={C.dim} fontSize="10">{legend.ruin}</text>
          <line x1={8} x2={22} y1={27} y2={27} stroke={C.reach} strokeWidth={2} /> <text x={27} y={30} fill={C.dim} fontSize="10">{legend.reach}</text>
          <line x1={8} x2={22} y1={41} y2={41} stroke={C.dim} strokeWidth={2} /> <text x={27} y={44} fill={C.dim} fontSize="10">{legend.cap}</text>
        </g>
      )}
    </svg>
  );
};

interface ProbBarsProps {
  empirical: { ruin: number; reach: number; capped: number };
  theoretical: number;
}

export const OutcomeBars = ({ empirical, theoretical }: ProbBarsProps) => (
  <div style={{ display: 'flex', height: 38, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gr-border)', position: 'relative' }}>
    <div style={{ flex: empirical.ruin || 0.0001, background: 'var(--gr-ruin)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }} title={`ruin ${(empirical.ruin * 100).toFixed(2)}%`}>
      {empirical.ruin > 0.06 ? `${(empirical.ruin * 100).toFixed(1)}%` : ''}
    </div>
    <div style={{ flex: empirical.reach || 0.0001, background: 'var(--gr-reach)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }} title={`reach ${(empirical.reach * 100).toFixed(2)}%`}>
      {empirical.reach > 0.06 ? `${(empirical.reach * 100).toFixed(1)}%` : ''}
    </div>
    {empirical.capped > 0 && (
      <div style={{ flex: empirical.capped, background: 'var(--gr-text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }} title={`undecided ${(empirical.capped * 100).toFixed(2)}%`}>
        {empirical.capped > 0.06 ? `${(empirical.capped * 100).toFixed(1)}%` : ''}
      </div>
    )}
    <div
      style={{ position: 'absolute', top: -4, bottom: -4, left: `${Math.min(100, theoretical * 100)}%`, width: 2, background: 'var(--gr-accent)' }}
      title={`theoretical ruin ${(theoretical * 100).toFixed(2)}%`}
    />
  </div>
);

interface HistogramProps {
  bins: { binStart: number; binEnd: number; count: number }[];
  theoreticalMean?: number;
  width?: number;
  height?: number;
}

/** Distribution of steps-to-absorption. */
export const StepHistogram = ({ bins, theoreticalMean, width = 700, height = 200 }: HistogramProps) => {
  if (bins.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 26, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const lo = bins[0].binStart;
  const hi = bins[bins.length - 1].binEnd;
  const span = hi - lo || 1;
  const barGap = 1.5;
  const barW = innerW / bins.length;

  return (
    <svg
      className={styles.chart}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Histogram of steps until absorption"
    >
      {[0, 0.5, 1].map((f) => {
        const y = padding.top + innerH * (1 - f);
        return (
          <g key={f}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={C.grid} strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fill={C.faint} fontSize="9">{Math.round(f * maxCount)}</text>
          </g>
        );
      })}
      {bins.map((b, i) => {
        const h = (b.count / maxCount) * innerH;
        const x = padding.left + i * barW;
        const y = padding.top + innerH - h;
        return <rect key={i} x={x + barGap / 2} y={y} width={Math.max(0.5, barW - barGap)} height={h} fill={C.info} opacity={0.85} rx={1} />;
      })}
      {theoreticalMean !== undefined && Number.isFinite(theoreticalMean) && theoreticalMean >= lo && theoreticalMean <= hi && (
        <g>
          <line
            x1={padding.left + ((theoreticalMean - lo) / span) * innerW}
            x2={padding.left + ((theoreticalMean - lo) / span) * innerW}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke={C.reach}
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        </g>
      )}
      <text x={padding.left} y={height - 8} fill={C.faint} fontSize="10">{Math.round(lo)}</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill={C.faint} fontSize="10">{Math.round(hi)} steps</text>
    </svg>
  );
};

interface ConvergenceProps {
  points: { trial: number; ruinProb: number }[];
  theoretical: number;
  width?: number;
  height?: number;
}

/** Running empirical ruin estimate closing in on the theoretical value. */
export const ConvergenceChart = ({ points, theoretical, width = 700, height = 200 }: ConvergenceProps) => {
  if (points.length < 2) return null;
  const padding = { top: 12, right: 12, bottom: 26, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxTrial = points[points.length - 1].trial || 1;
  // y-range: center around theoretical with a little headroom, clamped to [0,1].
  const vals = points.map((p) => p.ruinProb).concat(theoretical);
  let yLo = Math.max(0, Math.min(...vals) - 0.05);
  let yHi = Math.min(1, Math.max(...vals) + 0.05);
  if (yHi - yLo < 0.1) { yLo = Math.max(0, yLo - 0.05); yHi = Math.min(1, yHi + 0.05); }
  const ySpan = yHi - yLo || 1;
  const xScale = (t: number) => padding.left + (t / maxTrial) * innerW;
  const yScale = (v: number) => padding.top + innerH - ((v - yLo) / ySpan) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.trial).toFixed(1)},${yScale(p.ruinProb).toFixed(1)}`).join(' ');
  const theoY = yScale(theoretical);

  return (
    <svg
      className={styles.chart}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Empirical ruin estimate converging on theory"
    >
      {[0, 0.5, 1].map((f) => {
        const y = padding.top + innerH * (1 - f);
        const v = yLo + f * ySpan;
        return (
          <g key={f}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={C.grid} strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fill={C.faint} fontSize="9">{(v * 100).toFixed(0)}%</text>
          </g>
        );
      })}
      <line x1={padding.left} x2={width - padding.right} y1={theoY} y2={theoY} stroke={C.accent} strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={width - padding.right} y={theoY - 4} textAnchor="end" fill={C.accent} fontSize="10">theory {(theoretical * 100).toFixed(1)}%</text>
      <path d={line} fill="none" stroke={C.info} strokeWidth={1.8} />
      <text x={padding.left} y={height - 8} fill={C.faint} fontSize="10">0</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill={C.faint} fontSize="10">{maxTrial.toLocaleString()} trials</text>
    </svg>
  );
};
