'use client';

import { SweepPoint } from './engine';

interface CurveChartProps {
  points: SweepPoint[];
  annotations?: { n: number; label: string; color: string }[];
  legendTheoretical: string;
  legendSimulation: string;
  axisLabel: string;
  ariaLabel: string;
  width?: number;
  height?: number;
}

const AMBER = '#f59e0b';
const CYAN = '#06b6d4';

export const CurveChart = ({
  points,
  annotations = [],
  legendTheoretical,
  legendSimulation,
  axisLabel,
  ariaLabel,
  width = 720,
  height = 320,
}: CurveChartProps) => {
  if (points.length === 0) return null;
  const padding = { top: 18, right: 18, bottom: 36, left: 46 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xMax = points[points.length - 1].n;
  const xScale = (n: number) => padding.left + (n / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - v * innerH;

  const empiricalLine = points.map((p) => `${xScale(p.n).toFixed(1)},${yScale(p.empirical).toFixed(1)}`).join(' ');
  const theoreticalLine = points.map((p) => `${xScale(p.n).toFixed(1)},${yScale(p.theoretical).toFixed(1)}`).join(' ');
  // Filled area under the theoretical curve for depth.
  const areaPath =
    `${xScale(points[0].n).toFixed(1)},${yScale(0).toFixed(1)} ` +
    theoreticalLine +
    ` ${xScale(xMax).toFixed(1)},${yScale(0).toFixed(1)}`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{
        background: 'var(--games-route-surface-solid, #fff)',
        borderRadius: 12,
        border: '1px solid var(--games-route-border, rgba(0,0,0,0.1))',
      }}
    >
      <defs>
        <linearGradient id="bp-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={AMBER} stopOpacity="0.22" />
          <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--games-route-border, rgba(0,0,0,0.1))"
              strokeDasharray="2 4"
            />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="var(--games-route-muted, #6e6e73)" fontSize="10">
              {(p * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}

      <polygon points={areaPath} fill="url(#bp-area)" />
      <polyline points={theoreticalLine} fill="none" stroke={AMBER} strokeWidth={2.4} />
      <polyline points={empiricalLine} fill="none" stroke={CYAN} strokeWidth={1.5} opacity={0.9} />

      {annotations.map((a) => {
        const x = xScale(a.n);
        return (
          <g key={a.label}>
            <line x1={x} x2={x} y1={padding.top} y2={padding.top + innerH} stroke={a.color} strokeDasharray="3 3" strokeWidth={1} opacity={0.75} />
            <text x={x + 4} y={padding.top + 12} fill={a.color} fontSize="10" fontWeight={700}>
              n={a.n} ({a.label})
            </text>
          </g>
        );
      })}

      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const v = Math.round(xMax * p);
        const x = xScale(v);
        return (
          <text key={p} x={x} y={height - 16} textAnchor="middle" fill="var(--games-route-muted, #6e6e73)" fontSize="10">
            {v}
          </text>
        );
      })}
      <text x={width / 2} y={height - 3} textAnchor="middle" fill="var(--games-route-muted, #6e6e73)" fontSize="10">
        {axisLabel}
      </text>

      <g transform={`translate(${padding.left + 8}, ${padding.top + 6})`}>
        <line x1={0} x2={18} y1={5} y2={5} stroke={AMBER} strokeWidth={2.6} />
        <text x={24} y={9} fill="var(--games-route-fg, #1d1d1f)" fontSize="11">{legendTheoretical}</text>
        <line x1={0} x2={18} y1={21} y2={21} stroke={CYAN} strokeWidth={2.6} />
        <text x={24} y={25} fill="var(--games-route-fg, #1d1d1f)" fontSize="11">{legendSimulation}</text>
      </g>
    </svg>
  );
};
