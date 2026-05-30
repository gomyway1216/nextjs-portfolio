'use client';

import { RatePoint } from './engine';

interface SuccessCurveProps {
  points: RatePoint[];
  empiricalBestR: number;
  theoreticalBestR: number;
  width?: number;
  height?: number;
}

/**
 * Plot empirical + theoretical success rate vs r (skip count). The famous
 * single-humped curve peaks near r/n ≈ 1/e ≈ 0.368.
 */
export const SuccessCurveChart = ({ points, empiricalBestR, theoreticalBestR, width = 720, height = 280 }: SuccessCurveProps) => {
  if (points.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 36, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const n = points.length;
  const xScale = (r: number) => padding.left + (r / Math.max(1, n - 1)) * innerW;
  const yScale = (v: number) => padding.top + innerH - v * innerH;

  const empPath = points.map((p) => `${xScale(p.r).toFixed(1)},${yScale(p.successRate).toFixed(1)}`).join(' ');
  const theoPath = points.map((p) => `${xScale(p.r).toFixed(1)},${yScale(p.theoretical).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {[0, 0.1, 0.2, 0.3, 0.4].map((p) => {
        const y = padding.top + innerH * (1 - p / 0.5);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{(p * 100).toFixed(0)}%</text>
          </g>
        );
      })}

      <polyline points={theoPath} fill="none" stroke="#fbbf24" strokeWidth={1.8} opacity={0.95} />
      <polyline points={empPath} fill="none" stroke="#67e8f9" strokeWidth={1.4} opacity={0.85} />

      {/* Vertical markers */}
      <line x1={xScale(theoreticalBestR)} x2={xScale(theoreticalBestR)} y1={padding.top} y2={padding.top + innerH}
            stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={1} opacity={0.7} />
      <text x={xScale(theoreticalBestR) + 4} y={padding.top + 14} fill="#fbbf24" fontSize="10" fontWeight={700}>
        n/e (r={theoreticalBestR})
      </text>

      {empiricalBestR !== theoreticalBestR && (
        <>
          <line x1={xScale(empiricalBestR)} x2={xScale(empiricalBestR)} y1={padding.top} y2={padding.top + innerH}
                stroke="#67e8f9" strokeDasharray="3 3" strokeWidth={1} opacity={0.7} />
          <text x={xScale(empiricalBestR) + 4} y={padding.top + 28} fill="#67e8f9" fontSize="10" fontWeight={700}>
            実測ベスト (r={empiricalBestR})
          </text>
        </>
      )}

      {/* x-axis */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const r = Math.round((n - 1) * p);
        const x = xScale(r);
        return (
          <g key={p}>
            <text x={x} y={height - 18} textAnchor="middle" fill="#64748b" fontSize="10">{r}</text>
            <text x={x} y={height - 6} textAnchor="middle" fill="#475569" fontSize="9">({(p * 100).toFixed(0)}%)</text>
          </g>
        );
      })}

      {/* legend */}
      <g transform={`translate(${width - padding.right - 130}, ${padding.top + 8})`}>
        <rect x={-6} y={-2} width={132} height={36} rx={4} fill="#020617" stroke="#1e293b" />
        <line x1={4} x2={22} y1={8} y2={8} stroke="#fbbf24" strokeWidth={2.5} />
        <text x={28} y={11} fill="#cbd5e1" fontSize="10">理論値</text>
        <line x1={4} x2={22} y1={24} y2={24} stroke="#67e8f9" strokeWidth={2.5} />
        <text x={28} y={27} fill="#cbd5e1" fontSize="10">シミュレーション</text>
      </g>
    </svg>
  );
};
