'use client';

import { SweepPoint } from './engine';
import type { PetersburgStrings } from './i18n';

const CHART_BG = 'var(--games-route-surface-raised, #020617)';
const CHART_BORDER = 'var(--games-route-border, #1e293b)';
const GRID = 'var(--games-route-border, #1e293b)';
const AXIS = 'var(--games-route-muted, #64748b)';
const LABEL = 'var(--games-route-muted, #94a3b8)';
const LEGEND_TEXT = 'var(--games-route-fg, #cbd5e1)';

interface ConvergenceChartProps {
  points: SweepPoint[];
  t: PetersburgStrings;
  width?: number;
  height?: number;
}

/**
 * Plot running mean / median / max / fair-price against log(N). Y is also log
 * because the max grows exponentially.
 */
export const ConvergenceChart = ({ points, t, width = 720, height = 320 }: ConvergenceChartProps) => {
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
  const xScale = (n: number) =>
    padding.left + ((Math.log10(n) - xMin) / Math.max(1e-9, xMax - xMin)) * innerW;
  const yScale = (v: number) => {
    const lv = Math.log10(Math.max(1e-9, v));
    return padding.top + innerH - ((lv - yMinL) / Math.max(1e-9, yMaxL - yMinL)) * innerH;
  };

  const path = (key: keyof SweepPoint) =>
    points.map((p) => `${xScale(p.N).toFixed(1)},${yScale(p[key] as number).toFixed(1)}`).join(' ');

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: CHART_BG, borderRadius: 10, border: `1px solid ${CHART_BORDER}`, minWidth: 480 }}
      role="img"
      aria-label={t.convergence}
    >
      {/* log y gridlines at each decade */}
      {(() => {
        const lines: React.ReactNode[] = [];
        for (let l = Math.ceil(yMinL); l <= Math.floor(yMaxL); l++) {
          const y = yScale(Math.pow(10, l));
          lines.push(
            <g key={`y${l}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeDasharray="2 4" opacity={0.6} />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fill={AXIS} fontSize="10">
                {l === 0 ? '$1' : l > 0 ? `$10^${l}` : `$10⁻${-l}`}
              </text>
            </g>,
          );
        }
        return lines;
      })()}

      <polyline points={path('max')} fill="none" stroke="#ec4899" strokeWidth={1.4} opacity={0.8} />
      <polyline points={path('mean')} fill="none" stroke="#38bdf8" strokeWidth={2.2} />
      <polyline points={path('fairPrice')} fill="none" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="4 3" />
      <polyline points={path('median')} fill="none" stroke="#22c55e" strokeWidth={1.8} />

      {/* x-axis */}
      {(() => {
        const ticks: React.ReactNode[] = [];
        for (let l = Math.ceil(xMin); l <= Math.floor(xMax); l++) {
          const x = xScale(Math.pow(10, l));
          ticks.push(
            <g key={`x${l}`}>
              <line x1={x} x2={x} y1={padding.top + innerH} y2={padding.top + innerH + 4} stroke={AXIS} />
              <text x={x} y={padding.top + innerH + 18} textAnchor="middle" fill={AXIS} fontSize="10">
                {l === 0 ? '1' : `10^${l}`}
              </text>
            </g>,
          );
        }
        return ticks;
      })()}
      <text x={padding.left + innerW / 2} y={height - 6} textAnchor="middle" fill={LABEL} fontSize="10">
        {t.nAxis}
      </text>

      <g transform={`translate(${padding.left + 8}, ${padding.top + 6})`}>
        <rect x={-4} y={-2} width={176} height={66} rx={5} fill={CHART_BG} stroke={CHART_BORDER} />
        <line x1={4} x2={22} y1={8} y2={8} stroke="#38bdf8" strokeWidth={2.4} />
        <text x={28} y={11} fill={LEGEND_TEXT} fontSize="10">{t.legendMean}</text>
        <line x1={4} x2={22} y1={22} y2={22} stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" />
        <text x={28} y={25} fill={LEGEND_TEXT} fontSize="10">{t.legendFair}</text>
        <line x1={4} x2={22} y1={36} y2={36} stroke="#22c55e" strokeWidth={2} />
        <text x={28} y={39} fill={LEGEND_TEXT} fontSize="10">{t.legendMedian}</text>
        <line x1={4} x2={22} y1={50} y2={50} stroke="#ec4899" strokeWidth={2} />
        <text x={28} y={53} fill={LEGEND_TEXT} fontSize="10">{t.legendMax}</text>
      </g>
    </svg>
  );
};

interface HistProps {
  log2Hist: number[];
  total: number;
  t: PetersburgStrings;
  width?: number;
  height?: number;
}

/** Bar chart of log₂(payoff) → frequency. Geometric decay (each bucket is half the previous). */
export const PayoffHistogram = ({ log2Hist, total, t, width = 720, height = 220 }: HistProps) => {
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
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: CHART_BG, borderRadius: 10, border: `1px solid ${CHART_BORDER}`, minWidth: 480 }}
      role="img"
      aria-label={t.distribution}
    >
      {Array.from({ length: buckets }, (_, i) => {
        const c = log2Hist[i];
        const h = (c / Math.max(1, maxCount)) * innerH;
        const expected = total * Math.pow(0.5, i + 1);
        return (
          <g key={i}>
            <rect
              x={padding.left + i * barW + 0.5}
              y={padding.top + innerH - h}
              width={Math.max(1, barW - 1)}
              height={h}
              fill="#a78bfa"
              opacity={0.9}
            />
            {/* Expected count overlay */}
            <line
              x1={padding.left + i * barW + 1}
              x2={padding.left + (i + 1) * barW - 1}
              y1={padding.top + innerH - (expected / Math.max(1, maxCount)) * innerH}
              y2={padding.top + innerH - (expected / Math.max(1, maxCount)) * innerH}
              stroke="#f59e0b"
              strokeWidth={1.4}
              opacity={0.9}
            />
          </g>
        );
      })}
      {/* x-axis labels at every other bucket */}
      {Array.from({ length: buckets }, (_, i) => {
        if (i % Math.max(1, Math.floor(buckets / 12)) !== 0) return null;
        const label = i === 0 ? '$1' : `$2^${i}`;
        return (
          <text
            key={i}
            x={padding.left + i * barW + barW / 2}
            y={height - 14}
            textAnchor="middle"
            fill={AXIS}
            fontSize="10"
          >
            {label}
          </text>
        );
      })}
      <text x={padding.left + innerW / 2} y={height - 2} textAnchor="middle" fill={LABEL} fontSize="10">
        {t.payoutAxis}
      </text>
      <g transform={`translate(${padding.left + 8}, ${padding.top + 6})`}>
        <rect x={-4} y={-2} width={158} height={32} rx={5} fill={CHART_BG} stroke={CHART_BORDER} />
        <rect x={4} y={4} width={14} height={8} fill="#a78bfa" />
        <text x={22} y={11} fill={LEGEND_TEXT} fontSize="10">{t.legendObserved}</text>
        <line x1={4} x2={18} y1={22} y2={22} stroke="#f59e0b" strokeWidth={1.6} />
        <text x={22} y={25} fill={LEGEND_TEXT} fontSize="10">{t.legendTheory}</text>
      </g>
    </svg>
  );
};
