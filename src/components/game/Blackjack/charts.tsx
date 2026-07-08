'use client';

import { SimSummary, StrategyName } from './engine';
import { fmt, type BlackjackStrings } from './i18n';

interface MultiTrajectoryProps {
  series: { label: string; color: string; values: number[]; x: number[] }[];
  baseline: number;
  baselineLabel: string;
  handsAxis: string;
  ariaLabel: string;
  width?: number;
  height?: number;
}

export const MultiTrajectoryChart = ({
  series, baseline, baselineLabel, handsAxis, ariaLabel, width = 720, height = 280,
}: MultiTrajectoryProps) => {
  if (series.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 32, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  let xMax = 0;
  let yMin = baseline;
  let yMax = baseline;
  for (const s of series) {
    if (s.x[s.x.length - 1] > xMax) xMax = s.x[s.x.length - 1];
    for (const v of s.values) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (xMax === 0) return null;
  const yPad = (yMax - yMin) * 0.05 || 10;
  yMin -= yPad;
  yMax += yPad;
  const xScale = (n: number) => padding.left + (n / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ background: 'rgba(6,20,16,0.8)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        const v = yMin + (yMax - yMin) * p;
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#9fb3c8" fontSize="10">{v.toFixed(0)}</text>
          </g>
        );
      })}
      <line x1={padding.left} x2={width - padding.right} y1={yScale(baseline)} y2={yScale(baseline)} stroke="#f5c451" strokeDasharray="4 4" strokeWidth={1} opacity={0.65} />
      <text x={padding.left + 4} y={yScale(baseline) - 4} fill="#f5c451" fontSize="10">{baselineLabel} {baseline}</text>

      {series.map((s) => (
        <polyline
          key={s.label}
          points={s.values.map((v, i) => `${xScale(s.x[i]).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth={1.8}
        />
      ))}

      <text x={padding.left} y={height - 8} fill="#9fb3c8" fontSize="10">0 {handsAxis}</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill="#9fb3c8" fontSize="10">{xMax.toLocaleString()} {handsAxis}</text>

      <g transform={`translate(${padding.left + 8}, ${padding.top + 8})`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0, ${i * 16})`}>
            <line x1={0} x2={18} y1={5} y2={5} stroke={s.color} strokeWidth={2.5} />
            <text x={24} y={9} fill="#e8eef5" fontSize="11">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
};

interface EdgeBarsProps {
  results: SimSummary[];
  stratLabel: (n: StrategyName) => string;
  stratColor: (n: StrategyName) => string;
  s: BlackjackStrings;
}

export const EdgeBars = ({ results, stratLabel, stratColor, s }: EdgeBarsProps) => {
  if (results.length === 0) return null;
  let maxAbs = 0.01;
  for (const r of results) if (Math.abs(r.edge) > maxAbs) maxAbs = Math.abs(r.edge);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {results.map((r) => {
        const w = `${(Math.abs(r.edge) / maxAbs) * 100}%`;
        const isPlayer = r.edge < 0;
        return (
          <div key={r.strategy} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 130, color: stratColor(r.strategy), fontWeight: 700, fontSize: '0.85rem' }}>{stratLabel(r.strategy)}</div>
            <div style={{ flex: 1, position: 'relative', height: 24, background: 'rgba(6,20,16,0.8)', borderRadius: 5, border: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ width: w, height: '100%', background: isPlayer ? '#4ade80' : '#f87171', borderRadius: 5, opacity: 0.85 }} />
            </div>
            <div style={{ width: 110, textAlign: 'right', color: isPlayer ? '#4ade80' : '#f87171', fontWeight: 700, fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}>
              {isPlayer
                ? fmt(s.sim.edgeGain, { value: Math.abs(r.edge * 100).toFixed(2) })
                : fmt(s.sim.edgeLoss, { value: (r.edge * 100).toFixed(2) })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
