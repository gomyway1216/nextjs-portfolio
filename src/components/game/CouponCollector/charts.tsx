'use client';

import { useMemo } from 'react';

interface UniqueCurveProps {
  curve: number[];
  n: number;
  width?: number;
  height?: number;
}

/** Shows how the number of distinct items collected grows with draws — flattens dramatically near n. */
export const UniqueCurveChart = ({ curve, n, width = 700, height = 240 }: UniqueCurveProps) => {
  if (curve.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xMax = curve.length;
  const xScale = (i: number) => padding.left + (i / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - (v / n) * innerH;

  const path = curve.map((v, i) => `${xScale(i + 1).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{Math.round(p * n)}</text>
          </g>
        );
      })}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={yScale(n)}
        y2={yScale(n)}
        stroke="#fbbf24"
        strokeDasharray="4 4"
        strokeWidth={1.2}
        opacity={0.7}
      />
      <polyline points={path} fill="none" stroke="#67e8f9" strokeWidth={1.7} />
      <text x={padding.left} y={height - 8} fill="#64748b" fontSize="10">0 draws</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill="#64748b" fontSize="10">{xMax.toLocaleString()} draws</text>
      <text x={padding.left + 8} y={padding.top + 12} fill="#94a3b8" fontSize="11">ユニーク数 (上限 n = {n})</text>
    </svg>
  );
};

interface HistogramProps {
  values: number[];
  mean: number;
  median: number;
  bins?: number;
  width?: number;
  height?: number;
}

export const DistributionChart = ({ values, mean, median, bins = 30, width = 700, height = 220 }: HistogramProps) => {
  const { counts, min, max, binSize } = useMemo(() => {
    let mn = values[0];
    let mx = values[0];
    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const range = mx - mn || 1;
    const sz = range / bins;
    const cs = new Array(bins).fill(0);
    for (const v of values) {
      const idx = Math.min(bins - 1, Math.floor((v - mn) / sz));
      cs[idx]++;
    }
    return { counts: cs, min: mn, max: mx, binSize: sz };
  }, [values, bins]);

  if (values.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 32, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  let maxC = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > maxC) maxC = counts[i];
  const barW = innerW / bins;
  const xScale = (v: number) => padding.left + ((v - min) / (max - min || 1)) * innerW;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {counts.map((c, i) => {
        const h = (c / maxC) * innerH;
        return (
          <rect
            key={i}
            x={padding.left + i * barW + 0.5}
            y={padding.top + innerH - h}
            width={Math.max(1, barW - 1)}
            height={h}
            fill="#a78bfa"
            opacity={0.85}
          />
        );
      })}
      {/* mean line */}
      <line x1={xScale(mean)} x2={xScale(mean)} y1={padding.top} y2={padding.top + innerH} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={xScale(mean) + 4} y={padding.top + 12} fill="#fbbf24" fontSize="10" fontWeight={700}>平均 {mean.toFixed(0)}</text>
      {/* median */}
      <line x1={xScale(median)} x2={xScale(median)} y1={padding.top} y2={padding.top + innerH} stroke="#4ade80" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={xScale(median) + 4} y={padding.top + 26} fill="#4ade80" fontSize="10" fontWeight={700}>中央値 {median.toFixed(0)}</text>
      {/* x-axis labels */}
      <text x={padding.left} y={height - 12} fill="#64748b" fontSize="10">{Math.round(min)}</text>
      <text x={padding.left + innerW} y={height - 12} textAnchor="end" fill="#64748b" fontSize="10">{Math.round(max)}</text>
      <text x={padding.left + innerW / 2} y={height - 2} textAnchor="middle" fill="#94a3b8" fontSize="10">完成までの draws (bin {binSize.toFixed(1)})</text>
    </svg>
  );
};
