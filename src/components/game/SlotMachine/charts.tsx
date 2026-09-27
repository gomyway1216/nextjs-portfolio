'use client';

import type { ConvergencePoint } from './engine';

const AXIS = 'var(--games-route-muted)';
const GRID = 'var(--games-route-border)';
const SURFACE = {
  background: 'var(--games-route-surface-raised)',
  borderRadius: 10,
  border: '1px solid var(--games-route-border)',
  display: 'block',
} as const;

interface ConvergenceChartProps {
  points: ConvergencePoint[];
  rtp: number;
  /** Per-spin standard deviation, for the ±1.96σ/√n band. */
  stdDev: number;
  theoreticalLabel: string;
  bandLabel: string;
  xLabel: string;
  width?: number;
  height?: number;
}

/** Observed return vs spins (log x) with the theoretical RTP and its 95% band. */
export const ConvergenceChart = ({
  points,
  rtp,
  stdDev,
  theoreticalLabel,
  bandLabel,
  xLabel,
  width = 640,
  height = 280,
}: ConvergenceChartProps) => {
  if (points.length === 0) return null;
  const pad = { top: 14, right: 14, bottom: 34, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxN = points[points.length - 1].spins;
  const minLog = 1;
  const maxLog = Math.max(2, Math.log10(maxN));
  const yMin = Math.max(0, rtp - 0.5);
  const yMax = rtp + 0.5;
  const x = (n: number) => pad.left + ((Math.log10(n) - minLog) / (maxLog - minLog)) * innerW;
  const y = (v: number) => pad.top + innerH - ((Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * innerH;

  const bandNs: number[] = [];
  for (let e = minLog; e <= maxLog + 1e-9; e += 0.05) bandNs.push(10 ** e);
  const half = (n: number) => (1.96 * stdDev) / Math.sqrt(n);
  const band = [
    ...bandNs.map((n) => `${x(n).toFixed(1)},${y(rtp + half(n)).toFixed(1)}`),
    ...[...bandNs].reverse().map((n) => `${x(n).toFixed(1)},${y(rtp - half(n)).toFixed(1)}`),
  ].join(' ');
  const line = points
    .filter((p) => p.spins >= 10)
    .map((p) => `${x(p.spins).toFixed(1)},${y(p.rtp).toFixed(1)}`)
    .join(' ');

  const yTicks = [yMin, (yMin + rtp) / 2, rtp, (rtp + yMax) / 2, yMax];
  const decades: number[] = [];
  for (let e = minLog; e <= Math.floor(maxLog); e++) decades.push(10 ** e);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={SURFACE}
      role="img"
      aria-label={`${theoreticalLabel}: ${(rtp * 100).toFixed(2)}%`}
    >
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeDasharray="2 4" />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {(v * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      {decades.map((n) => (
        <text key={n} x={x(n)} y={height - pad.bottom + 16} textAnchor="middle" fill={AXIS} fontSize={10}>
          {n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : n}
        </text>
      ))}
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
      <polygon points={band} fill="rgba(251, 191, 36, 0.18)" stroke="none">
        <title>{bandLabel}</title>
      </polygon>
      <line x1={pad.left} x2={width - pad.right} y1={y(rtp)} y2={y(rtp)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 4" />
      <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
};

interface HistogramProps {
  values: number[];
  /** Draw a marker at this value (e.g. the starting bankroll). */
  marker?: number;
  bins?: number;
  xLabel?: string;
  width?: number;
  height?: number;
}

export const Histogram = ({ values, marker, bins = 24, xLabel, width = 640, height = 220 }: HistogramProps) => {
  if (values.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (marker !== undefined) {
    min = Math.min(min, marker);
    max = Math.max(max, marker);
  }
  const span = max - min || 1;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++;
  const top = Math.max(...counts);
  const barW = innerW / bins;
  const x = (v: number) => pad.left + ((v - min) / span) * innerW;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={xLabel}>
      {counts.map((c, i) => {
        const h = (c / top) * innerH;
        return (
          <rect
            key={i}
            x={pad.left + i * barW + 1}
            y={pad.top + innerH - h}
            width={Math.max(1, barW - 2)}
            height={h}
            rx={2}
            fill="#a78bfa"
          />
        );
      })}
      {marker !== undefined && (
        <line x1={x(marker)} x2={x(marker)} y1={pad.top} y2={pad.top + innerH} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" />
      )}
      {[min, (min + max) / 2, max].map((v, i) => (
        <text key={i} x={x(v)} y={height - pad.bottom + 16} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fill={AXIS} fontSize={10}>
          {Math.round(v)}
        </text>
      ))}
      {xLabel && (
        <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
          {xLabel}
        </text>
      )}
    </svg>
  );
};

interface TrajectoryChartProps {
  trajectory: number[];
  start: number;
  xLabel: string;
  width?: number;
  height?: number;
}

export const TrajectoryChart = ({ trajectory, start, xLabel, width = 640, height = 220 }: TrajectoryChartProps) => {
  if (trajectory.length < 2) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  let max = start;
  for (const v of trajectory) if (v > max) max = v;
  max *= 1.05;
  const x = (i: number) => pad.left + (i / (trajectory.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - (Math.max(0, v) / max) * innerH;
  const points = trajectory.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={xLabel}>
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={pad.left} x2={width - pad.right} y1={y(max * p)} y2={y(max * p)} stroke={GRID} strokeDasharray="2 4" />
          <text x={pad.left - 6} y={y(max * p) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {Math.round(max * p)}
          </text>
        </g>
      ))}
      <line x1={pad.left} x2={width - pad.right} y1={y(start)} y2={y(start)} stroke="#f59e0b" strokeDasharray="5 4" />
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth={1.6} strokeLinejoin="round" />
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel} ({trajectory.length - 1})
      </text>
    </svg>
  );
};
