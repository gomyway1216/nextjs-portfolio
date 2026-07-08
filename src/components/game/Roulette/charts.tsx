'use client';

interface BankrollChartProps {
  trajectory: number[];
  initialBankroll: number;
  width?: number;
  height?: number;
  yLabel?: string;
  xLabel?: string;
}

export const BankrollChart = ({ trajectory, initialBankroll, width = 600, height = 240, yLabel, xLabel }: BankrollChartProps) => {
  if (trajectory.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 24, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // Single-pass max so 50k-entry trajectories don't risk a spread-arg stack overflow.
  let trajMax = initialBankroll;
  for (let i = 0; i < trajectory.length; i++) {
    if (trajectory[i] > trajMax) trajMax = trajectory[i];
  }
  const maxY = trajMax * 1.05;
  const minY = 0;
  const xScale = (i: number) => padding.left + (i / Math.max(1, trajectory.length - 1)) * innerW;
  const yScale = (v: number) => padding.top + innerH - ((v - minY) / (maxY - minY)) * innerH;

  const points = trajectory.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');
  const initialY = yScale(initialBankroll);

  const bust = trajectory[trajectory.length - 1] <= 0;
  const lastX = xScale(trajectory.length - 1);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: 'var(--games-route-surface-raised)', borderRadius: 8, border: '1px solid var(--games-route-border)' }}>
      {/* y-axis grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        const val = Math.round(minY + (maxY - minY) * p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--games-route-border)" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="var(--games-route-muted)" fontSize="10">{val}</text>
          </g>
        );
      })}

      {/* initial bankroll reference line */}
      <line x1={padding.left} x2={width - padding.right} y1={initialY} y2={initialY} stroke="#e0a83c" strokeDasharray="4 4" strokeWidth={1} />

      {/* trajectory */}
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth={1.5} />

      {bust && (
        <g>
          <circle cx={lastX} cy={yScale(0)} r={5} fill="#ef4444" />
          <text x={lastX} y={yScale(0) - 8} textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight={700}>BUST</text>
        </g>
      )}

      {yLabel && <text x={padding.left} y={padding.top + 10} fill="var(--games-route-muted)" fontSize="10">{yLabel}</text>}
      {xLabel && <text x={width - padding.right} y={height - 6} textAnchor="end" fill="var(--games-route-muted)" fontSize="10">{xLabel} ({trajectory.length - 1})</text>}
    </svg>
  );
};

interface EdgeChartProps {
  points: { spins: number; edge: number }[];
  /** Theoretical edge to draw as a reference line (e.g. -1/37). */
  theoretical: number;
  width?: number;
  height?: number;
  theoreticalLabel?: string;
}

/**
 * Plots empirical player return (edge) vs. spins on a log-x axis. The line
 * should visibly settle toward the dashed theoretical reference (-2.70%).
 */
export const EdgeChart = ({ points, theoretical, width = 600, height = 260, theoreticalLabel }: EdgeChartProps) => {
  if (points.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 28, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // y-domain: symmetric-ish band around 0 that always includes the data + ref.
  let yMin = theoretical;
  let yMax = 0;
  for (const p of points) {
    if (p.edge < yMin) yMin = p.edge;
    if (p.edge > yMax) yMax = p.edge;
  }
  // pad
  const pad = Math.max(0.02, (yMax - yMin) * 0.15);
  yMin -= pad;
  yMax += pad;

  const logMin = Math.log10(Math.max(1, points[0].spins));
  const logMax = Math.log10(Math.max(10, points[points.length - 1].spins));
  const xScale = (spins: number) =>
    padding.left + ((Math.log10(Math.max(1, spins)) - logMin) / Math.max(1e-9, logMax - logMin)) * innerW;
  const yScale = (v: number) => padding.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.spins).toFixed(1)} ${yScale(p.edge).toFixed(1)}`).join(' ');
  const zeroY = yScale(0);
  const theoY = yScale(theoretical);

  // x gridlines at powers of 10
  const ticks: number[] = [];
  for (let e = Math.ceil(logMin); e <= Math.floor(logMax); e++) ticks.push(10 ** e);

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: 'var(--games-route-surface-raised)', borderRadius: 8, border: '1px solid var(--games-route-border)' }}>
      {/* y grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const val = yMax - (yMax - yMin) * f;
        const y = padding.top + innerH * f;
        return (
          <g key={f}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--games-route-border)" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="var(--games-route-muted)" fontSize="10">{fmtPct(val)}</text>
          </g>
        );
      })}

      {/* x ticks */}
      {ticks.map((tck) => (
        <text key={tck} x={xScale(tck)} y={height - 8} textAnchor="middle" fill="var(--games-route-muted)" fontSize="10">
          {tck >= 1000 ? `${tck / 1000}k` : tck}
        </text>
      ))}

      {/* zero line */}
      <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="var(--games-route-muted)" strokeWidth={1} opacity={0.5} />

      {/* theoretical reference */}
      <line x1={padding.left} x2={width - padding.right} y1={theoY} y2={theoY} stroke="#e0a83c" strokeDasharray="5 4" strokeWidth={1.5} />
      {theoreticalLabel && (
        <text x={width - padding.right} y={theoY - 5} textAnchor="end" fill="#e0a83c" fontSize="10" fontWeight={700}>{theoreticalLabel}</text>
      )}

      {/* empirical line */}
      <path d={line} fill="none" stroke="#38bdf8" strokeWidth={2} />
    </svg>
  );
};

interface HistogramProps {
  values: number[];
  bins?: number;
  width?: number;
  height?: number;
  color?: string;
  xLabel?: string;
}

export const Histogram = ({ values, bins = 24, width = 600, height = 200, color = '#a78bfa', xLabel }: HistogramProps) => {
  if (values.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 28, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // Single-pass min/max so up-to-20k value arrays don't risk a spread-arg
  // stack overflow on some engines.
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    else if (v > max) max = v;
  }
  const range = max - min || 1;
  const binSize = range / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binSize));
    counts[idx]++;
  }
  let maxCount = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > maxCount) maxCount = counts[i];
  }
  const barW = innerW / bins;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: 'var(--games-route-surface-raised)', borderRadius: 8, border: '1px solid var(--games-route-border)' }}>
      {counts.map((c, i) => {
        const h = (c / maxCount) * innerH;
        return (
          <rect
            key={i}
            x={padding.left + i * barW + 0.5}
            y={padding.top + innerH - h}
            width={Math.max(1, barW - 1)}
            height={h}
            fill={color}
            opacity={0.85}
          />
        );
      })}
      {/* x-axis labels (min, mid, max) */}
      <text x={padding.left} y={height - 8} fill="var(--games-route-muted)" fontSize="10">{Math.round(min)}</text>
      <text x={padding.left + innerW / 2} y={height - 8} textAnchor="middle" fill="var(--games-route-muted)" fontSize="10">{Math.round(min + range / 2)}</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill="var(--games-route-muted)" fontSize="10">{Math.round(max)}</text>
      {xLabel && (
        <text x={padding.left + innerW / 2} y={padding.top + 10} textAnchor="middle" fill="var(--games-route-muted)" fontSize="10">{xLabel}</text>
      )}
    </svg>
  );
};
