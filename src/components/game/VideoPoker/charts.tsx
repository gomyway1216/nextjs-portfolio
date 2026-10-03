'use client';

import styles from './VideoPoker.module.css';

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
/** Text of the table that carries the histogram's numbers for screen readers. */
export interface HistogramTable {
  /** What the table shows, including the value of the dashed marker. */
  caption: string;
  rangeHeader: string;
  countHeader: string;
  range: (from: number, to: number) => string;
  /** The last bar: everything above the cap. */
  over: string;
  count: (n: number) => string;
}

/**
 * The bars of a histogram of whole-coin results: `bins` equal bars from the
 * lowest value up to `cap`, then one bar for everything above it. `rows`
 * lists the non-empty bars with the whole coins each one covers.
 */
export function histogramBins(values: readonly number[], cap: number, marker: number, bins: number) {
  let min = Infinity;
  for (const v of values) if (v < min) min = v;
  min = Math.min(min, marker, 0);
  const span = cap - min || 1;
  const index = (v: number) => (v > cap ? bins : Math.min(bins - 1, Math.floor(((v - min) / span) * bins)));
  const counts = new Array<number>(bins + 1).fill(0);
  for (const v of values) counts[index(v)]++;
  // The first whole number of coins in each bar, by the same rule that fills the bars.
  const starts: number[] = [];
  for (let i = 0; i < bins; i++) {
    let from = Math.ceil(min + (span * i) / bins);
    while (index(from) < i) from++;
    while (index(from - 1) >= i) from--;
    starts.push(from);
  }
  const rows: { from: number; to: number; count: number }[] = [];
  for (let i = 0; i < bins; i++) {
    if (counts[i] > 0) rows.push({ from: starts[i], to: i < bins - 1 ? starts[i + 1] - 1 : Math.floor(cap), count: counts[i] });
  }
  return { min, span, counts, rows, over: counts[bins] };
}

export const NetHistogram = ({
  values,
  cap,
  marker,
  xLabel,
  table,
  bins = 30,
  width = 680,
  height = 220,
}: {
  values: number[];
  cap: number;
  marker: number;
  xLabel: string;
  table: HistogramTable;
  bins?: number;
  width?: number;
  height?: number;
}) => {
  if (values.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const { min, span, counts, rows, over } = histogramBins(values, cap, marker, bins);
  const top = Math.max(...counts);
  const barW = innerW / (bins + 1);
  const x = (v: number) => pad.left + ((v - min) / span) * (innerW - barW);
  return (
    <figure style={{ margin: 0 }}>
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
      {/* The same distribution as numbers, for screen readers. */}
      <div className={styles.srOnly} data-testid="vp-histogram-table">
        <table>
          <caption>{table.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{table.rangeHeader}</th>
              <th scope="col">{table.countHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.from}>
                <th scope="row">{table.range(r.from, r.to)}</th>
                <td>{table.count(r.count)}</td>
              </tr>
            ))}
            {over > 0 && (
              <tr>
                <th scope="row">{table.over}</th>
                <td>{table.count(over)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
};
