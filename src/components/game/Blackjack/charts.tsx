'use client';

const AXIS = 'var(--games-route-muted)';
const GRID = 'var(--games-route-border)';
const SURFACE = {
  background: 'var(--games-route-surface-raised)',
  borderRadius: 10,
  border: '1px solid var(--games-route-border)',
  display: 'block',
} as const;

export interface EdgeSeries {
  id: string;
  color: string;
  label: string;
  theory: number;
  points: { rounds: number; edge: number }[];
}

/** Observed house edge vs rounds played (log x), one line per strategy, exact edge dashed. */
export const EdgeChart = ({ series, xLabel, width = 680, height = 300 }: { series: EdgeSeries[]; xLabel: string; width?: number; height?: number }) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxRounds = Math.max(...all.map((p) => p.rounds));
  const minLog = 2;
  const maxLog = Math.max(3, Math.log10(maxRounds));
  const yMin = -0.1;
  const yMax = 0.2;
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
      aria-label={series.map((s) => `${s.label}: ${(s.theory * 100).toFixed(2)}%`).join(', ')}
    >
      {[-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2].map((v) => (
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
            points={s.points.map((p) => `${x(p.rounds).toFixed(1)},${y(p.edge).toFixed(1)}`).join(' ')}
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
