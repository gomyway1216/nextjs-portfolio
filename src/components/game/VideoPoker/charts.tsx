'use client';

const AXIS = 'var(--games-route-muted)';
const GRID = 'var(--games-route-border)';
const SURFACE = {
  background: 'var(--games-route-surface-raised)',
  borderRadius: 10,
  border: '1px solid var(--games-route-border)',
  display: 'block',
} as const;

export interface PaybackSeries {
  id: string;
  color: string;
  label: string;
  exact: number;
  points: { hands: number; payback: number }[];
}

/** Observed payback vs hands played (log x), one line per strategy, exact payback dashed. */
export const PaybackChart = ({ series, xLabel, width = 680, height = 300 }: { series: PaybackSeries[]; xLabel: string; width?: number; height?: number }) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxHands = Math.max(...all.map((p) => p.hands));
  const minLog = 2;
  const maxLog = Math.max(3, Math.log10(maxHands));
  const yMin = 0.5;
  const yMax = 1.3;
  const x = (n: number) => pad.left + ((Math.log10(n) - minLog) / (maxLog - minLog)) * innerW;
  const y = (v: number) => pad.top + innerH - ((Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * innerH;
  const decades: number[] = [];
  for (let e = minLog; e <= Math.floor(maxLog); e++) decades.push(10 ** e);
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={SURFACE}
      role="img"
      aria-label={series.map((s) => `${s.label}: ${(s.exact * 100).toFixed(2)}%`).join(', ')}
    >
      {[0.5, 0.7, 0.9, 1, 1.1, 1.3].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={v === 1 ? 1.5 : 1} strokeDasharray={v === 1 ? undefined : '2 4'} />
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
          <line x1={pad.left} x2={width - pad.right} y1={y(s.exact)} y2={y(s.exact)} stroke={s.color} strokeWidth={1} strokeDasharray="6 4" opacity={0.75} />
          <polyline
            points={s.points.map((p) => `${x(p.hands).toFixed(1)},${y(p.payback).toFixed(1)}`).join(' ')}
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

/**
 * Histogram of session results. Values above `cap` are gathered in the last
 * bar, so one royal flush doesn't flatten everything else.
 */
export const NetHistogram = ({
  values,
  cap,
  marker,
  xLabel,
  bins = 30,
  width = 680,
  height = 220,
}: {
  values: number[];
  cap: number;
  marker: number;
  xLabel: string;
  bins?: number;
  width?: number;
  height?: number;
}) => {
  if (values.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  let min = Infinity;
  for (const v of values) if (v < min) min = v;
  min = Math.min(min, marker, 0);
  const span = cap - min || 1;
  const counts = new Array<number>(bins + 1).fill(0);
  for (const v of values) counts[v > cap ? bins : Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++;
  const top = Math.max(...counts);
  const barW = innerW / (bins + 1);
  const x = (v: number) => pad.left + ((v - min) / span) * (innerW - barW);
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
            fill={i === bins ? '#f59e0b' : '#a78bfa'}
            data-bar={i === bins ? 'over' : undefined}
          />
        );
      })}
      <line x1={x(0)} x2={x(0)} y1={pad.top} y2={pad.top + innerH} stroke={AXIS} strokeWidth={1.2} />
      <line x1={x(marker)} x2={x(marker)} y1={pad.top} y2={pad.top + innerH} stroke="#22c55e" strokeWidth={2} strokeDasharray="5 4" />
      {[min, 0].map((v, i) => (
        <text key={i} x={x(v)} y={height - pad.bottom + 16} textAnchor={i === 0 ? 'start' : 'middle'} fill={AXIS} fontSize={10}>
          {v < 0 ? '−' : ''}
          {Math.abs(Math.round(v))}
        </text>
      ))}
      {/* The last bar holds everything above the cap. */}
      <text x={width - pad.right} y={height - pad.bottom + 16} textAnchor="end" fill={AXIS} fontSize={10}>
        &gt;+{Math.round(cap)}
      </text>
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
    </svg>
  );
};
