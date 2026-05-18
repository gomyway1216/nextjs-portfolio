'use client';

interface BankrollChartProps {
  trajectory: number[];
  initialBankroll: number;
  width?: number;
  height?: number;
}

export const BankrollChart = ({ trajectory, initialBankroll, width = 600, height = 240 }: BankrollChartProps) => {
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
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {/* y-axis grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        const val = Math.round(minY + (maxY - minY) * p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{val}</text>
          </g>
        );
      })}

      {/* initial bankroll reference line */}
      <line x1={padding.left} x2={width - padding.right} y1={initialY} y2={initialY} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />

      {/* trajectory */}
      <polyline points={points} fill="none" stroke="#67e8f9" strokeWidth={1.5} />

      {bust && (
        <g>
          <circle cx={lastX} cy={yScale(0)} r={5} fill="#f87171" />
          <text x={lastX} y={yScale(0) - 8} textAnchor="middle" fill="#f87171" fontSize="11" fontWeight={700}>BUST</text>
        </g>
      )}

      <text x={padding.left} y={padding.top + 10} fill="#94a3b8" fontSize="10">資金</text>
      <text x={width - padding.right} y={height - 6} textAnchor="end" fill="#94a3b8" fontSize="10">スピン数 ({trajectory.length - 1})</text>
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
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
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
      <text x={padding.left} y={height - 8} fill="#64748b" fontSize="10">{Math.round(min)}</text>
      <text x={padding.left + innerW / 2} y={height - 8} textAnchor="middle" fill="#64748b" fontSize="10">{Math.round(min + range / 2)}</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill="#64748b" fontSize="10">{Math.round(max)}</text>
      {xLabel && (
        <text x={padding.left + innerW / 2} y={padding.top + 10} textAnchor="middle" fill="#94a3b8" fontSize="10">{xLabel}</text>
      )}
    </svg>
  );
};
