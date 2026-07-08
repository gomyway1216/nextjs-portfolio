'use client';

import { useMemo } from 'react';

const AXIS = 'var(--games-route-muted, #64748b)';
const GRID = 'var(--games-route-border, #1e293b)';
const SURFACE = 'var(--games-route-surface-solid, #020617)';
const svgStyle: React.CSSProperties = {
  background: SURFACE,
  borderRadius: 10,
  border: `1px solid ${GRID}`,
  display: 'block',
};

interface UniqueCurveProps {
  curve: number[];
  n: number;
  labelUnique: string;
  labelStart: string;
  labelEnd: string;
  width?: number;
  height?: number;
}

/** Shows how the number of distinct items collected grows with draws — flattens dramatically near n. */
export const UniqueCurveChart = ({
  curve,
  n,
  labelUnique,
  labelStart,
  labelEnd,
  width = 700,
  height = 240,
}: UniqueCurveProps) => {
  if (curve.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xMax = curve.length;
  const xScale = (i: number) => padding.left + (i / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - (v / n) * innerH;

  const path = curve.map((v, i) => `${xScale(i + 1).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={labelUnique}
      style={svgStyle}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill={AXIS} fontSize="10">
              {Math.round(p * n)}
            </text>
          </g>
        );
      })}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={yScale(n)}
        y2={yScale(n)}
        stroke="#f59e0b"
        strokeDasharray="4 4"
        strokeWidth={1.2}
        opacity={0.7}
      />
      <polyline points={path} fill="none" stroke="#38bdf8" strokeWidth={1.9} />
      <text x={padding.left} y={height - 8} fill={AXIS} fontSize="10">
        {labelStart}
      </text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill={AXIS} fontSize="10">
        {labelEnd}
      </text>
      <text x={padding.left + 8} y={padding.top + 12} fill={AXIS} fontSize="11">
        {labelUnique}
      </text>
    </svg>
  );
};

interface HistogramProps {
  values: number[];
  mean: number;
  median: number;
  meanLabel: (v: string) => string;
  medianLabel: (v: string) => string;
  axisLabel: (bin: string) => string;
  bins?: number;
  width?: number;
  height?: number;
}

export const DistributionChart = ({
  values,
  mean,
  median,
  meanLabel,
  medianLabel,
  axisLabel,
  bins = 30,
  width = 700,
  height = 240,
}: HistogramProps) => {
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
  const padding = { top: 14, right: 14, bottom: 40, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  let maxC = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > maxC) maxC = counts[i];
  const barW = innerW / bins;
  const xScale = (v: number) => padding.left + ((v - min) / (max - min || 1)) * innerW;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={axisLabel(binSize.toFixed(1))}
      style={svgStyle}
    >
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
            opacity={0.88}
          />
        );
      })}
      <line
        x1={xScale(mean)}
        x2={xScale(mean)}
        y1={padding.top}
        y2={padding.top + innerH}
        stroke="#f59e0b"
        strokeWidth={1.6}
        strokeDasharray="4 3"
      />
      <text x={xScale(mean) + 4} y={padding.top + 12} fill="#f59e0b" fontSize="10" fontWeight={700}>
        {meanLabel(mean.toFixed(0))}
      </text>
      <line
        x1={xScale(median)}
        x2={xScale(median)}
        y1={padding.top}
        y2={padding.top + innerH}
        stroke="#4ade80"
        strokeWidth={1.6}
        strokeDasharray="4 3"
      />
      <text x={xScale(median) + 4} y={padding.top + 26} fill="#4ade80" fontSize="10" fontWeight={700}>
        {medianLabel(median.toFixed(0))}
      </text>
      <text x={padding.left} y={height - 14} fill={AXIS} fontSize="10">
        {Math.round(min)}
      </text>
      <text x={padding.left + innerW} y={height - 14} textAnchor="end" fill={AXIS} fontSize="10">
        {Math.round(max)}
      </text>
      <text x={padding.left + innerW / 2} y={height - 3} textAnchor="middle" fill={AXIS} fontSize="10">
        {axisLabel(binSize.toFixed(1))}
      </text>
    </svg>
  );
};

interface ConvergenceProps {
  points: { trial: number; mean: number }[];
  theoretical: number;
  theoryLabel: (v: string) => string;
  trialsAxisLabel: string;
  width?: number;
  height?: number;
}

/**
 * Running empirical mean (log-x) converging to the theoretical n·Hₙ dashed line.
 * The y-axis is auto-ranged around the theoretical value so the wobble is visible.
 */
export const ConvergenceChart = ({
  points,
  theoretical,
  theoryLabel,
  trialsAxisLabel,
  width = 700,
  height = 240,
}: ConvergenceProps) => {
  const { yMin, yMax, xMinLog, xMaxLog } = useMemo(() => {
    let lo = theoretical;
    let hi = theoretical;
    for (const p of points) {
      if (p.mean < lo) lo = p.mean;
      if (p.mean > hi) hi = p.mean;
    }
    // Pad the y-range by 8% so lines don't touch the edges.
    const pad = Math.max((hi - lo) * 0.08, theoretical * 0.02, 1);
    const firstTrial = points.length > 0 ? points[0].trial : 1;
    const lastTrial = points.length > 0 ? points[points.length - 1].trial : 1;
    return {
      yMin: lo - pad,
      yMax: hi + pad,
      xMinLog: Math.log(Math.max(1, firstTrial)),
      xMaxLog: Math.log(Math.max(2, lastTrial)),
    };
  }, [points, theoretical]);

  if (points.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 34, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xSpan = xMaxLog - xMinLog || 1;
  const ySpan = yMax - yMin || 1;
  const xScale = (trial: number) =>
    padding.left + ((Math.log(Math.max(1, trial)) - xMinLog) / xSpan) * innerW;
  const yScale = (v: number) => padding.top + innerH - ((v - yMin) / ySpan) * innerH;

  const path = points.map((p) => `${xScale(p.trial).toFixed(1)},${yScale(p.mean).toFixed(1)}`).join(' ');
  const theoryY = yScale(theoretical);

  // A few gridline values across the y-range.
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={theoryLabel(theoretical.toFixed(1))}
      style={svgStyle}
    >
      {yTicks.map((v, i) => {
        const y = yScale(v);
        return (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill={AXIS} fontSize="10">
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}
      {/* theoretical line */}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={theoryY}
        y2={theoryY}
        stroke="#f59e0b"
        strokeWidth={1.6}
        strokeDasharray="6 4"
      />
      <text x={width - padding.right} y={theoryY - 5} textAnchor="end" fill="#f59e0b" fontSize="11" fontWeight={700}>
        {theoryLabel(theoretical.toFixed(1))}
      </text>
      <polyline points={path} fill="none" stroke="#38bdf8" strokeWidth={1.9} />
      <text x={padding.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize="10">
        {trialsAxisLabel}
      </text>
    </svg>
  );
};
