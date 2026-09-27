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
  points: { rolls: number; edge: number }[];
}

interface EdgeChartProps {
  series: EdgeSeries[];
  xLabel: string;
  width?: number;
  height?: number;
}

/** Observed house edge vs rolls (log x), one line per strategy, theory dashed. */
export const EdgeChart = ({ series, xLabel, width = 680, height = 300 }: EdgeChartProps) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxRolls = Math.max(...all.map((p) => p.rolls));
  const minLog = 2;
  const maxLog = Math.max(3, Math.log10(maxRolls));
  const yMin = -0.1;
  const yMax = 0.3;
  const x = (n: number) => pad.left + ((Math.log10(n) - minLog) / (maxLog - minLog)) * innerW;
  const y = (v: number) => pad.top + innerH - ((Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * innerH;
  const decades: number[] = [];
  for (let e = minLog; e <= Math.floor(maxLog); e++) decades.push(10 ** e);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={series.map((s) => `${s.label}: ${(s.theory * 100).toFixed(2)}%`).join(', ')}>
      {[-0.1, 0, 0.1, 0.2, 0.3].map((v) => (
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
            points={s.points
              .filter((p) => Number.isFinite(p.edge))
              .map((p) => `${x(p.rolls).toFixed(1)},${y(p.edge).toFixed(1)}`)
              .join(' ')}
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

interface HistogramProps {
  values: number[];
  marker?: number;
  bins?: number;
  xLabel?: string;
  width?: number;
  height?: number;
}

export const Histogram = ({ values, marker, bins = 24, xLabel, width = 680, height = 220 }: HistogramProps) => {
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
        return <rect key={i} x={pad.left + i * barW + 1} y={pad.top + innerH - h} width={Math.max(1, barW - 2)} height={h} rx={2} fill="#a78bfa" />;
      })}
      {marker !== undefined && <line x1={x(marker)} x2={x(marker)} y1={pad.top} y2={pad.top + innerH} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" />}
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

export const TrajectoryChart = ({ trajectory, start, xLabel, width = 680, height = 200 }: TrajectoryChartProps) => {
  if (trajectory.length < 2) return null;
  const pad = { top: 12, right: 12, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  let max = start;
  for (const v of trajectory) if (v > max) max = v;
  max *= 1.05;
  const x = (i: number) => pad.left + (i / (trajectory.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - (Math.max(0, v) / max) * innerH;
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
      <polyline points={trajectory.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth={1.6} />
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel} ({trajectory.length - 1})
      </text>
    </svg>
  );
};

interface HandsChartProps {
  /** Simulated share of hands lasting exactly n rolls, n = 1…maxRolls. */
  simulated: number[];
  /** Exact probability of the same. */
  exact: number[];
  xLabel: string;
  simulatedLabel: string;
  exactLabel: string;
  width?: number;
  height?: number;
}

/** Hand-length distribution: simulated bars vs the exact Markov-chain curve. */
export const HandsChart = ({ simulated, exact, xLabel, simulatedLabel, exactLabel, width = 680, height = 220 }: HandsChartProps) => {
  const n = exact.length;
  const pad = { top: 12, right: 12, bottom: 34, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const top = Math.max(...exact, ...simulated) * 1.1;
  const barW = innerW / n;
  const x = (i: number) => pad.left + i * barW;
  const y = (p: number) => pad.top + innerH - (p / top) * innerH;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={`${simulatedLabel} / ${exactLabel}`}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={width - pad.right} y1={y(top * f)} y2={y(top * f)} stroke={GRID} strokeDasharray="2 4" />
          <text x={pad.left - 6} y={y(top * f) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {((top * f) * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      {simulated.map((p, i) => (
        <rect key={i} x={x(i) + 1} y={y(p)} width={Math.max(1, barW - 2)} height={pad.top + innerH - y(p)} rx={1.5} fill="#38bdf8" opacity={0.75} />
      ))}
      <polyline points={exact.map((p, i) => `${(x(i) + barW / 2).toFixed(1)},${y(p).toFixed(1)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2} />
      {[1, 10, 20, 30, 40].filter((k) => k <= n).map((k) => (
        <text key={k} x={x(k - 1) + barW / 2} y={height - pad.bottom + 16} textAnchor="middle" fill={AXIS} fontSize={10}>
          {k}
        </text>
      ))}
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
    </svg>
  );
};
