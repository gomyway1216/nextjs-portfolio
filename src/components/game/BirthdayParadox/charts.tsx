'use client';

import { SweepPoint } from './engine';

interface CurveChartProps {
  points: SweepPoint[];
  annotations?: { n: number; label: string; color: string }[];
  width?: number;
  height?: number;
}

export const CurveChart = ({ points, annotations = [], width = 700, height = 300 }: CurveChartProps) => {
  if (points.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 32, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xMax = points[points.length - 1].n;
  const xScale = (n: number) => padding.left + (n / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - v * innerH;

  const empiricalLine = points.map((p) => `${xScale(p.n).toFixed(1)},${yScale(p.empirical).toFixed(1)}`).join(' ');
  const theoreticalLine = points.map((p) => `${xScale(p.n).toFixed(1)},${yScale(p.theoretical).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{(p * 100).toFixed(0)}%</text>
          </g>
        );
      })}

      <polyline points={theoreticalLine} fill="none" stroke="#fbbf24" strokeWidth={1.8} opacity={0.95} />
      <polyline points={empiricalLine} fill="none" stroke="#67e8f9" strokeWidth={1.4} opacity={0.85} />

      {annotations.map((a) => {
        const x = xScale(a.n);
        return (
          <g key={a.label}>
            <line x1={x} x2={x} y1={padding.top} y2={padding.top + innerH} stroke={a.color} strokeDasharray="3 3" strokeWidth={1} opacity={0.7} />
            <text x={x + 4} y={padding.top + 12} fill={a.color} fontSize="10" fontWeight={700}>n={a.n} ({a.label})</text>
          </g>
        );
      })}

      {/* x-axis */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const v = Math.round(xMax * p);
        const x = xScale(v);
        return (
          <text key={p} x={x} y={height - 14} textAnchor="middle" fill="#64748b" fontSize="10">{v}</text>
        );
      })}
      <text x={width / 2} y={height - 2} textAnchor="middle" fill="#94a3b8" fontSize="10">グループ人数 n</text>

      {/* legend */}
      <g transform={`translate(${padding.left + 8}, ${padding.top + 8})`}>
        <line x1={0} x2={18} y1={5} y2={5} stroke="#fbbf24" strokeWidth={2.5} />
        <text x={24} y={9} fill="#cbd5e1" fontSize="11">理論値</text>
        <line x1={0} x2={18} y1={21} y2={21} stroke="#67e8f9" strokeWidth={2.5} />
        <text x={24} y={25} fill="#cbd5e1" fontSize="11">シミュレーション</text>
      </g>
    </svg>
  );
};
