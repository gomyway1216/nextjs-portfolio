'use client';

import { growthRate, type Wager } from './engine';

const AXIS = 'var(--games-route-muted)';
const GRID = 'var(--games-route-border)';
const SURFACE = {
  background: 'var(--games-route-surface-raised)',
  borderRadius: 10,
  border: '1px solid var(--games-route-border)',
  display: 'block',
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The player's bankroll after every flip, with the Kelly stake on the same flips, on a log scale. */
export const BankrollChart = ({
  you,
  kelly,
  start,
  cap,
  maxFlips,
  ariaLabel,
  youLabel,
  kellyLabel,
  width = 680,
  height = 300,
}: {
  you: readonly number[];
  kelly: readonly number[];
  start: number;
  cap: number;
  maxFlips: number;
  ariaLabel: string;
  youLabel: string;
  kellyLabel: string;
  width?: number;
  height?: number;
}) => {
  const pad = { top: 14, right: 14, bottom: 26, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  // Money is drawn on a log scale; anything under a dollar sits on the floor.
  const floor = 1;
  const logMin = Math.log10(floor);
  const logMax = Math.log10(cap);
  // Show at least 50 flips so the first few do not fill the whole width.
  const span = Math.min(maxFlips, Math.max(50, you.length - 1));
  const x = (i: number) => pad.left + (i / span) * innerW;
  const y = (money: number) => pad.top + innerH - ((Math.log10(clamp(money, floor, cap)) - logMin) / (logMax - logMin)) * innerH;
  const line = (path: readonly number[]) => path.map((money, i) => `${x(i).toFixed(1)},${y(money).toFixed(1)}`).join(' ');
  const ticks = [1, 5, start, 100, cap].filter((v, i, all) => all.indexOf(v) === i && v >= floor && v <= cap);
  const xTicks = [0, Math.round(span / 2), span];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={ariaLabel}>
      {ticks.map((v) => (
        <g key={v}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(v)}
            y2={y(v)}
            stroke={GRID}
            strokeDasharray={v === start || v === cap ? undefined : '2 4'}
          />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            ${v}
          </text>
        </g>
      ))}
      {xTicks.map((i) => (
        <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === span ? 'end' : 'middle'} fill={AXIS} fontSize={10}>
          {i}
        </text>
      ))}
      <polyline points={line(kelly)} fill="none" stroke="#22c55e" strokeWidth={1.6} strokeDasharray="5 4" strokeLinejoin="round" data-line="kelly" />
      <polyline points={line(you)} fill="none" stroke="#e9c46a" strokeWidth={2.4} strokeLinejoin="round" data-line="you" />
      <g fontSize={13} fontWeight={700}>
        <text x={pad.left + 8} y={pad.top + 14} fill="#e9c46a">
          ━ {youLabel}
        </text>
        <text x={pad.left + 8} y={pad.top + 32} fill="#22c55e">
          ┅ {kellyLabel}
        </text>
      </g>
    </svg>
  );
};

/** Long-run growth per bet against the fraction staked, with the Kelly peak and the zero-growth stake marked. */
export const GrowthCurve = ({
  wager,
  kelly,
  zero,
  ariaLabel,
  xLabel,
  kellyLabel,
  zeroLabel,
  width = 680,
  height = 280,
}: {
  wager: Wager;
  kelly: number;
  zero: number | null;
  ariaLabel: string;
  xLabel: string;
  kellyLabel: string;
  zeroLabel: string;
  width?: number;
  height?: number;
}) => {
  const pad = { top: 16, right: 14, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  // Far enough right to show growth going negative, never past staking everything.
  const xMax = Math.min(1, Math.max(0.3, (zero ?? kelly * 2 + 0.2) * 1.35));
  const peak = growthRate(wager, kelly);
  const yMax = Math.max(peak * 1.25, 0.002);
  const yMin = -yMax * 1.1;
  const x = (f: number) => pad.left + (f / xMax) * innerW;
  const y = (g: number) => pad.top + innerH - ((clamp(g, yMin, yMax) - yMin) / (yMax - yMin)) * innerH;
  const steps = 160;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = Math.min((i / steps) * xMax, 0.999999);
    const g = growthRate(wager, f);
    if (g < yMin) break;
    points.push(`${x(f).toFixed(1)},${y(g).toFixed(1)}`);
  }
  const xTicks = [0, xMax / 4, xMax / 2, (3 * xMax) / 4, xMax];
  const yTicks = [yMin / 1.1, 0, peak];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={ariaLabel}>
      {yTicks.map((g, i) => (
        <g key={i}>
          <line x1={pad.left} x2={width - pad.right} y1={y(g)} y2={y(g)} stroke={GRID} strokeDasharray={g === 0 ? undefined : '2 4'} />
          <text x={pad.left - 6} y={y(g) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {g > 0 ? '+' : g < 0 ? '−' : ''}
            {(Math.abs(g) * 100).toFixed(2)}%
          </text>
        </g>
      ))}
      {xTicks.map((f, i) => (
        <text key={i} x={x(f)} y={height - pad.bottom + 16} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} fill={AXIS} fontSize={10}>
          {Math.round(f * 100)}%
        </text>
      ))}
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
      <polyline points={points.join(' ')} fill="none" stroke="#e9c46a" strokeWidth={2.4} strokeLinejoin="round" data-curve="growth" />
      {kelly > 0 && (
        <g data-marker="kelly">
          <line x1={x(kelly)} x2={x(kelly)} y1={y(peak)} y2={y(0)} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" />
          <circle cx={x(kelly)} cy={y(peak)} r={4.5} fill="#22c55e" />
          <text x={x(kelly)} y={y(peak) - 8} textAnchor="middle" fill="#22c55e" fontSize={11} fontWeight={700}>
            {kellyLabel} {(kelly * 100).toFixed(1)}%
          </text>
        </g>
      )}
      {zero !== null && zero <= xMax && (
        <g data-marker="zero">
          <circle cx={x(zero)} cy={y(0)} r={4.5} fill="#ef4444" />
          <text x={x(zero) + 9} y={y(0) - 8} textAnchor="start" fill="#ef4444" fontSize={11} fontWeight={700}>
            {zeroLabel} {(zero * 100).toFixed(1)}%
          </text>
        </g>
      )}
    </svg>
  );
};

export interface GrowthSeries {
  id: string;
  color: string;
  label: string;
  /** The exact long-run growth per bet. */
  exact: number;
  points: { sessions: number; growth: number }[];
}

/** Average growth per bet against sessions simulated (log x), one line per strategy, exact growth dashed. */
export const ConvergenceChart = ({
  series,
  xLabel,
  ariaLabel,
  width = 680,
  height = 300,
}: {
  series: GrowthSeries[];
  xLabel: string;
  ariaLabel: string;
  width?: number;
  height?: number;
}) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 54 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxSessions = Math.max(...all.map((p) => p.sessions));
  const minLog = 1;
  const maxLog = Math.max(2, Math.log10(maxSessions));
  const exacts = series.map((s) => s.exact);
  const top = Math.max(...exacts, 0);
  const bottom = Math.min(...exacts, 0);
  const margin = Math.max((top - bottom) * 0.2, 0.001);
  const yMax = top + margin;
  const yMin = bottom - margin;
  const x = (n: number) => pad.left + ((Math.log10(Math.max(n, 10)) - minLog) / (maxLog - minLog)) * innerW;
  const y = (v: number) => pad.top + innerH - ((clamp(v, yMin, yMax) - yMin) / (yMax - yMin)) * innerH;
  const decades: number[] = [];
  for (let e = minLog; e <= Math.floor(maxLog); e++) decades.push(10 ** e);
  const yTicks = [...new Set([bottom, 0, top])];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={ariaLabel}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeDasharray={v === 0 ? undefined : '2 4'} />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {v > 0 ? '+' : v < 0 ? '−' : ''}
            {(Math.abs(v) * 100).toFixed(2)}%
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
      {series.map((s) => (
        <g key={s.id} data-series={s.id}>
          <line x1={pad.left} x2={width - pad.right} y1={y(s.exact)} y2={y(s.exact)} stroke={s.color} strokeWidth={1} strokeDasharray="6 4" opacity={0.75} />
          <polyline
            points={s.points.map((p) => `${x(p.sessions).toFixed(1)},${y(p.growth).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
};
