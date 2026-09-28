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

/** Observed house edge vs hands dealt (log x), one line per bet, exact edge dashed. */
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
  const yMax = 0.4;
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
      {[-0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4].map((v) => (
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
          <line x1={pad.left} x2={width - pad.right} y1={y(s.theory)} y2={y(s.theory)} stroke={s.color} strokeWidth={1} strokeDasharray="6 4" opacity={0.7} />
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

export interface ShoeSeries {
  id: string;
  color: string;
  label: string;
  /** Expected profit per unit before each hand (positive = in the player's favor). */
  values: number[];
}

/** Each bet's exact expectation before every hand of one shoe. */
export const ShoeChart = ({ series, xLabel, width = 680, height = 260 }: { series: ShoeSeries[]; xLabel: string; width?: number; height?: number }) => {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (n < 2) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const lim = 0.3;
  const x = (i: number) => pad.left + (i / (n - 1)) * innerW;
  const y = (v: number) => pad.top + innerH / 2 - (clamp(v, -lim, lim) / lim) * (innerH / 2);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={series.map((s) => s.label).join(', ')}>
      <rect x={pad.left} y={pad.top} width={innerW} height={innerH / 2} fill="rgba(22, 163, 74, 0.08)" />
      {[-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={v === 0 ? 1.5 : 1} strokeDasharray={v === 0 ? undefined : '2 4'} />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {v > 0 ? '+' : ''}
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {[1, Math.round(n / 2), n].map((k) => (
        <text key={k} x={x(k - 1)} y={height - pad.bottom + 16} textAnchor="middle" fill={AXIS} fontSize={10}>
          {k}
        </text>
      ))}
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
      {series.map((s) => (
        <polyline
          key={s.id}
          data-series={s.id}
          points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
};

/** Bars of how often each whole-number value occurred. */
export const CountBars = ({ values, xLabel, width = 680, height = 200 }: { values: number[]; xLabel: string; width?: number; height?: number }) => {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const counts = new Array<number>(max - min + 1).fill(0);
  for (const v of values) counts[v - min]++;
  const pad = { top: 12, right: 12, bottom: 34, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const top = Math.max(...counts);
  const barW = innerW / counts.length;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={xLabel}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH * (1 - f)} y2={pad.top + innerH * (1 - f)} stroke={GRID} strokeDasharray="2 4" />
          <text x={pad.left - 6} y={pad.top + innerH * (1 - f) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {((top * f * 100) / values.length).toFixed(0)}%
          </text>
        </g>
      ))}
      {counts.map((c, i) => {
        const h = (c / top) * innerH;
        return (
          <g key={i}>
            <rect x={pad.left + i * barW + 1} y={pad.top + innerH - h} width={Math.max(1, barW - 2)} height={h} rx={2} fill="#a78bfa" />
            {(counts.length <= 20 || (min + i) % 2 === 0) && (
              <text x={pad.left + i * barW + barW / 2} y={height - pad.bottom + 16} textAnchor="middle" fill={AXIS} fontSize={10}>
                {min + i}
              </text>
            )}
          </g>
        );
      })}
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
    </svg>
  );
};
