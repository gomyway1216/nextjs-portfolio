'use client';

import { SweepPoint } from './engine';

interface ConvergenceChartProps {
  points: SweepPoint[];
  width?: number;
  height?: number;
}

/**
 * Plot running mean / median / max / fair-price against log(N). Y also log
 * because the max grows exponentially.
 */
export const ConvergenceChart = ({ points, width = 720, height = 320 }: ConvergenceChartProps) => {
  if (points.length === 0) return null;
  const padding = { top: 18, right: 16, bottom: 36, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xMin = Math.log10(points[0].N);
  const xMax = Math.log10(points[points.length - 1].N);
  let yMax = 0;
  let yMin = Infinity;
  for (const p of points) {
    if (p.max > yMax) yMax = p.max;
    if (p.median > 0 && p.median < yMin) yMin = p.median;
  }
  if (!Number.isFinite(yMin) || yMin <= 0) yMin = 1;
  const yMinL = Math.log10(yMin);
  const yMaxL = Math.log10(yMax);
  const xScale = (n: number) => padding.left + ((Math.log10(n) - xMin) / Math.max(1e-9, xMax - xMin)) * innerW;
  const yScale = (v: number) => {
    const lv = Math.log10(Math.max(1e-9, v));
    return padding.top + innerH - ((lv - yMinL) / Math.max(1e-9, yMaxL - yMinL)) * innerH;
  };

  const path = (key: keyof SweepPoint) =>
    points.map((p) => `${xScale(p.N).toFixed(1)},${yScale(p[key] as number).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {/* log y gridlines at each decade */}
      {(() => {
        const lines: React.ReactNode[] = [];
        for (let l = Math.ceil(yMinL); l <= Math.floor(yMaxL); l++) {
          const y = yScale(Math.pow(10, l));
          lines.push(
            <g key={`y${l}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{l === 0 ? '$1' : l > 0 ? `$10^${l}` : `$10⁻${-l}`}</text>
            </g>,
          );
        }
        return lines;
      })()}

      <polyline points={path('max')} fill="none" stroke="#f472b6" strokeWidth={1.4} opacity={0.75} />
      <polyline points={path('mean')} fill="none" stroke="#67e8f9" strokeWidth={2} />
      <polyline points={path('fairPrice')} fill="none" stroke="#fbbf24" strokeWidth={1.6} strokeDasharray="4 3" />
      <polyline points={path('median')} fill="none" stroke="#4ade80" strokeWidth={1.6} />

      {/* x-axis */}
      {(() => {
        const ticks: React.ReactNode[] = [];
        for (let l = Math.ceil(xMin); l <= Math.floor(xMax); l++) {
          const x = xScale(Math.pow(10, l));
          ticks.push(
            <g key={`x${l}`}>
              <line x1={x} x2={x} y1={padding.top + innerH} y2={padding.top + innerH + 4} stroke="#475569" />
              <text x={x} y={padding.top + innerH + 18} textAnchor="middle" fill="#64748b" fontSize="10">{l === 0 ? '1' : `10^${l}`}</text>
            </g>,
          );
        }
        return ticks;
      })()}
      <text x={padding.left + innerW / 2} y={height - 6} textAnchor="middle" fill="#94a3b8" fontSize="10">N (試行回数, log scale)</text>

      <g transform={`translate(${padding.left + 8}, ${padding.top + 6})`}>
        <rect x={-4} y={-2} width={148} height={66} rx={4} fill="#020617" stroke="#1e293b" />
        <line x1={4} x2={22} y1={8} y2={8} stroke="#67e8f9" strokeWidth={2} /><text x={28} y={11} fill="#cbd5e1" fontSize="10">実測 平均</text>
        <line x1={4} x2={22} y1={22} y2={22} stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 2" /><text x={28} y={25} fill="#cbd5e1" fontSize="10">「公正な価格」 log₂(N)/2</text>
        <line x1={4} x2={22} y1={36} y2={36} stroke="#4ade80" strokeWidth={2} /><text x={28} y={39} fill="#cbd5e1" fontSize="10">実測 中央値</text>
        <line x1={4} x2={22} y1={50} y2={50} stroke="#f472b6" strokeWidth={2} /><text x={28} y={53} fill="#cbd5e1" fontSize="10">実測 最大</text>
      </g>
    </svg>
  );
};

interface HistProps {
  log2Hist: number[];
  total: number;
  width?: number;
  height?: number;
}

/** Bar chart of log₂(payoff) → frequency. Geometric decay (each bucket is half the previous). */
export const PayoffHistogram = ({ log2Hist, total, width = 720, height = 220 }: HistProps) => {
  if (log2Hist.length === 0) return null;
  const padding = { top: 16, right: 12, bottom: 32, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // Truncate at last non-zero + a bit.
  let lastIdx = 0;
  for (let i = 0; i < log2Hist.length; i++) if (log2Hist[i] > 0) lastIdx = i;
  const buckets = Math.min(log2Hist.length, lastIdx + 1);
  const barW = innerW / buckets;
  let maxCount = 0;
  for (let i = 0; i < buckets; i++) if (log2Hist[i] > maxCount) maxCount = log2Hist[i];

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {Array.from({ length: buckets }, (_, i) => {
        const c = log2Hist[i];
        const h = (c / Math.max(1, maxCount)) * innerH;
        const expected = total * Math.pow(0.5, i + 1);
        return (
          <g key={i}>
            <rect x={padding.left + i * barW + 0.5} y={padding.top + innerH - h} width={Math.max(1, barW - 1)} height={h} fill="#a78bfa" opacity={0.85} />
            {/* Expected count overlay */}
            <line
              x1={padding.left + i * barW + 1}
              x2={padding.left + (i + 1) * barW - 1}
              y1={padding.top + innerH - (expected / Math.max(1, maxCount)) * innerH}
              y2={padding.top + innerH - (expected / Math.max(1, maxCount)) * innerH}
              stroke="#fbbf24"
              strokeWidth={1.3}
              opacity={0.85}
            />
          </g>
        );
      })}
      {/* x-axis labels at every other bucket */}
      {Array.from({ length: buckets }, (_, i) => {
        if (i % Math.max(1, Math.floor(buckets / 12)) !== 0) return null;
        const label = i === 0 ? '$1' : `$2^${i}`;
        return (
          <text key={i} x={padding.left + i * barW + barW / 2} y={height - 14} textAnchor="middle" fill="#64748b" fontSize="10">
            {label}
          </text>
        );
      })}
      <text x={padding.left + innerW / 2} y={height - 2} textAnchor="middle" fill="#94a3b8" fontSize="10">配当 (log₂ buckets)</text>
      <g transform={`translate(${padding.left + 8}, ${padding.top + 6})`}>
        <rect x={-4} y={-2} width={120} height={32} rx={4} fill="#020617" stroke="#1e293b" />
        <rect x={4} y={4} width={14} height={8} fill="#a78bfa" />
        <text x={22} y={11} fill="#cbd5e1" fontSize="10">実測度数</text>
        <line x1={4} x2={18} y1={22} y2={22} stroke="#fbbf24" strokeWidth={1.5} />
        <text x={22} y={25} fill="#cbd5e1" fontSize="10">理論度数 (1/2ⁿ × total)</text>
      </g>
    </svg>
  );
};
