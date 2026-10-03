'use client';

const AXIS = 'var(--games-route-muted)';
const GRID = 'var(--games-route-border)';
const SURFACE = {
  background: 'var(--games-route-surface-raised)',
  borderRadius: 10,
  border: '1px solid var(--games-route-border)',
  display: 'block',
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface EdgeSeries {
  id: string;
  color: string;
  label: string;
  theory: number;
  points: { hands: number; edge: number }[];
}

/** Observed house edge vs hands dealt (log x), one line per strategy, exact edge dashed. */
export const EdgeChart = ({ series, xLabel, width = 680, height = 300 }: { series: EdgeSeries[]; xLabel: string; width?: number; height?: number }) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxHands = Math.max(...all.map((p) => p.hands));
  const minLog = 2;
  const maxLog = Math.max(3, Math.log10(maxHands));
  const yMin = -0.2;
  const yMax = 0.3;
  const x = (n: number) => pad.left + ((Math.log10(n) - minLog) / (maxLog - minLog)) * innerW;
  const y = (v: number) => pad.top + innerH - ((clamp(v, yMin, yMax) - yMin) / (yMax - yMin)) * innerH;
  const decades: number[] = [];
  for (let e = minLog; e <= Math.floor(maxLog); e++) decades.push(10 ** e);
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={SURFACE}
      role="img"
      aria-label={series.map((s) => `${s.label}: ${(s.theory * 100).toFixed(2)}%`).join(', ')}
    >
      {[-0.2, -0.1, 0, 0.1, 0.2, 0.3].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeDasharray={v === 0 ? undefined : '2 4'} />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {Math.round(v * 100)}%
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
          <line x1={pad.left} x2={width - pad.right} y1={y(s.theory)} y2={y(s.theory)} stroke={s.color} strokeWidth={1} strokeDasharray="6 4" opacity={0.75} />
          <polyline
            points={s.points.map((p) => `${x(p.hands).toFixed(1)},${y(p.edge).toFixed(1)}`).join(' ')}
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

export interface CurveTick {
  /** Index of the first point this label belongs to. */
  index: number;
  label: string;
}

interface EvCurveProps {
  /** EV of playing each hand, weakest hand first. */
  values: number[];
  /** Index of the weakest hand worth playing. */
  threshold: number;
  thresholdLabel: string;
  foldLabel: string;
  xLabel: string;
  ariaLabel: string;
  ticks: CurveTick[];
  width?: number;
  height?: number;
}

/** EV of playing every high-card hand against the flat −1 of folding. */
export const EvCurve = ({ values, threshold, thresholdLabel, foldLabel, xLabel, ariaLabel, ticks, width = 680, height = 280 }: EvCurveProps) => {
  if (values.length < 2) return null;
  const pad = { top: 14, right: 14, bottom: 38, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yMin = -1.25;
  const yMax = 0.75;
  const x = (i: number) => pad.left + (i / (values.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - ((clamp(v, yMin, yMax) - yMin) / (yMax - yMin)) * innerH;
  const cut = x(threshold - 0.5);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={ariaLabel} data-testid="tcp-ev-curve">
      {/* Left of the cut every hand is a fold; right of it, a play. */}
      <rect x={pad.left} y={pad.top} width={cut - pad.left} height={innerH} fill="rgba(239, 68, 68, 0.08)" />
      <rect x={cut} y={pad.top} width={width - pad.right - cut} height={innerH} fill="rgba(22, 163, 74, 0.08)" />
      {[-1, -0.5, 0, 0.5].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeDasharray="2 4" />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {v > 0 ? '+' : v < 0 ? '−' : ''}
            {Math.abs(v).toFixed(1)}
          </text>
        </g>
      ))}
      {ticks.map((tick) => (
        <g key={tick.label}>
          <line x1={x(tick.index)} x2={x(tick.index)} y1={pad.top + innerH} y2={pad.top + innerH + 4} stroke={AXIS} />
          <text x={x(tick.index)} y={height - pad.bottom + 16} textAnchor="middle" fill={AXIS} fontSize={10}>
            {tick.label}
          </text>
        </g>
      ))}
      <text x={pad.left + innerW / 2} y={height - 5} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
      <line x1={pad.left} x2={width - pad.right} y1={y(-1)} y2={y(-1)} stroke="#ef4444" strokeWidth={1.4} strokeDasharray="6 4" />
      <text x={width - pad.right - 4} y={y(-1) + 14} textAnchor="end" fill="#ef4444" fontSize={11} fontWeight={700}>
        {foldLabel}
      </text>
      <line x1={cut} x2={cut} y1={pad.top} y2={pad.top + innerH} stroke="#e9c46a" strokeWidth={1.4} />
      <text x={cut + 6} y={pad.top + 12} fill={AXIS} fontSize={11} fontWeight={700}>
        {thresholdLabel}
      </text>
      <polyline
        points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#22c55e"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
};
