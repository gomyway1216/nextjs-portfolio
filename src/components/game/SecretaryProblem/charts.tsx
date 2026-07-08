'use client';

import { RatePoint } from './engine';
import type { SecretaryStrings } from './i18n';

interface SuccessCurveProps {
  points: RatePoint[];
  empiricalBestR: number;
  theoreticalBestR: number;
  t: SecretaryStrings;
  width?: number;
  height?: number;
}

/**
 * Plot empirical + theoretical success rate vs r (skip count). The famous
 * single-humped curve peaks near r/n ≈ 1/e ≈ 0.368.
 *
 * Colors use the local CSS accent variables so the chart tracks light/dark mode.
 */
export const SuccessCurveChart = ({
  points,
  empiricalBestR,
  theoreticalBestR,
  t,
  width = 720,
  height = 300,
}: SuccessCurveProps) => {
  if (points.length === 0) return null;
  const padding = { top: 18, right: 16, bottom: 46, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const n = points.length;
  const xScale = (r: number) => padding.left + (r / Math.max(1, n - 1)) * innerW;
  // Clamp to padding.top so noisy Monte-Carlo points above the 50% axis cap
  // flatline at the top of the chart instead of clipping outside the viewport.
  const yScale = (v: number) => Math.max(padding.top, padding.top + innerH - (v / 0.5) * innerH);

  const empPath = points
    .map((p) => `${xScale(p.r).toFixed(1)},${yScale(p.successRate).toFixed(1)}`)
    .join(' ');
  const theoPath = points
    .map((p) => `${xScale(p.r).toFixed(1)},${yScale(p.theoretical).toFixed(1)}`)
    .join(' ');

  const accent = 'var(--sp-accent-strong)';
  const cyan = 'var(--sp-cyan)';
  const grid = 'var(--sp-border)';
  const muted = 'var(--sp-muted)';

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${t.chartYAxis} vs ${t.chartXAxis}`}
      style={{
        background: 'var(--sp-surface-solid)',
        borderRadius: 12,
        border: '1px solid var(--sp-border)',
        maxWidth: '100%',
      }}
    >
      {[0, 0.1, 0.2, 0.3, 0.4].map((p) => {
        const y = yScale(p);
        return (
          <g key={p}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke={grid}
              strokeDasharray="2 4"
            />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill={muted} fontSize="10">
              {(p * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}

      <polyline points={theoPath} fill="none" stroke={accent} strokeWidth={2} opacity={0.95} />
      <polyline points={empPath} fill="none" stroke={cyan} strokeWidth={1.6} opacity={0.9} />

      {/* Vertical marker at n/e */}
      <line
        x1={xScale(theoreticalBestR)}
        x2={xScale(theoreticalBestR)}
        y1={padding.top}
        y2={padding.top + innerH}
        stroke={accent}
        strokeDasharray="3 3"
        strokeWidth={1}
        opacity={0.7}
      />
      <text
        x={xScale(theoreticalBestR) + 4}
        y={padding.top + 12}
        fill={accent}
        fontSize="10"
        fontWeight={700}
      >
        n/e (r={theoreticalBestR})
      </text>

      {empiricalBestR !== theoreticalBestR && (
        <>
          <line
            x1={xScale(empiricalBestR)}
            x2={xScale(empiricalBestR)}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke={cyan}
            strokeDasharray="3 3"
            strokeWidth={1}
            opacity={0.7}
          />
          <text
            x={xScale(empiricalBestR) + 4}
            y={padding.top + 26}
            fill={cyan}
            fontSize="10"
            fontWeight={700}
          >
            {t.empiricalBest} (r={empiricalBestR})
          </text>
        </>
      )}

      {/* x-axis ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const r = Math.round((n - 1) * p);
        const x = xScale(r);
        return (
          <g key={p}>
            <text x={x} y={height - 26} textAnchor="middle" fill={muted} fontSize="10">
              {r}
            </text>
            <text x={x} y={height - 15} textAnchor="middle" fill={muted} fontSize="9" opacity={0.75}>
              ({(p * 100).toFixed(0)}%)
            </text>
          </g>
        );
      })}
      <text x={padding.left + innerW / 2} y={height - 2} textAnchor="middle" fill={muted} fontSize="10">
        {t.chartXAxis}
      </text>

      {/* legend */}
      <g transform={`translate(${width - padding.right - 138}, ${padding.top + 6})`}>
        <rect x={-6} y={-2} width={140} height={38} rx={6} fill="var(--sp-surface-raised)" stroke={grid} />
        <line x1={4} x2={24} y1={9} y2={9} stroke={accent} strokeWidth={2.5} />
        <text x={30} y={12} fill="var(--sp-fg)" fontSize="10">
          {t.legendTheory}
        </text>
        <line x1={4} x2={24} y1={26} y2={26} stroke={cyan} strokeWidth={2.5} />
        <text x={30} y={29} fill="var(--sp-fg)" fontSize="10">
          {t.legendSim}
        </text>
      </g>
    </svg>
  );
};
