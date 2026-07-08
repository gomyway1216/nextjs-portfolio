'use client';

interface ConvergenceChartProps {
  series: { label: string; color: string; values: number[]; reference?: number }[];
  x: number[];
  trialsLabelSuffix: string;
  width?: number;
  height?: number;
  yMax?: number;
}

const AXIS = 'var(--games-route-muted, #64748b)';
const GRID = 'var(--games-route-border, rgba(148,163,184,0.25))';
const FG = 'var(--games-route-fg, #cbd5e1)';
const SURFACE = 'var(--games-route-surface-solid, #020617)';

/**
 * Multi-line convergence chart. Each series shares the same x array (trial counts).
 * Optional `reference` per series draws a dashed horizontal line at the theoretical value.
 * Colors come from CSS variables so it works in light & dark mode.
 */
export const ConvergenceChart = ({
  series,
  x,
  trialsLabelSuffix,
  width = 640,
  height = 280,
  yMax = 1,
}: ConvergenceChartProps) => {
  if (x.length === 0 || series.length === 0) return null;
  const padding = { top: 14, right: 14, bottom: 30, left: 46 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const xMax = x[x.length - 1];
  const xScale = (v: number) => padding.left + (v / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - (v / yMax) * innerH;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Convergence chart of running win rates"
      style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${GRID}`, maxWidth: '100%' }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill={AXIS} fontSize="10">
              {(p * yMax * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}

      {series.map((s) => (
        <g key={s.label}>
          {s.reference !== undefined && (
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(s.reference)}
              y2={yScale(s.reference)}
              stroke={s.color}
              strokeDasharray="4 4"
              strokeWidth={1}
              opacity={0.6}
            />
          )}
          <polyline
            points={s.values.map((v, i) => `${xScale(x[i]).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </g>
      ))}

      <text x={padding.left} y={height - 8} fill={AXIS} fontSize="10">
        0
      </text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill={AXIS} fontSize="10">
        {xMax.toLocaleString()} {trialsLabelSuffix}
      </text>

      <g transform={`translate(${padding.left + 10}, ${padding.top + 10})`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0, ${i * 16})`}>
            <line x1={0} x2={18} y1={5} y2={5} stroke={s.color} strokeWidth={3} />
            <text x={24} y={9} fill={FG} fontSize="11">
              {s.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
};

interface BarCompareProps {
  bars: { label: string; value: number; color: string; reference?: number }[];
  referenceLabel: string;
  width?: number;
  height?: number;
  yMax?: number;
}

/** Vertical bars with dashed theoretical reference lines. Theme-aware. */
export const BarCompare = ({ bars, referenceLabel, width = 640, height = 220, yMax = 1 }: BarCompareProps) => {
  if (bars.length === 0) return null;
  const padding = { top: 16, right: 14, bottom: 38, left: 46 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const slot = innerW / bars.length;
  const barW = slot * 0.5;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Bar comparison of empirical win rates versus theory"
      style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${GRID}`, maxWidth: '100%' }}
    >
      {[0, 0.5, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill={AXIS} fontSize="10">
              {(p * yMax * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}

      {bars.map((b, i) => {
        const x = padding.left + slot * i + (slot - barW) / 2;
        const h = (b.value / yMax) * innerH;
        const y = padding.top + innerH - h;
        return (
          <g key={b.label}>
            <rect x={x} y={y} width={barW} height={h} rx={4} fill={b.color} opacity={0.92}>
              <animate attributeName="height" from={0} to={h} dur="0.5s" fill="freeze" />
              <animate attributeName="y" from={padding.top + innerH} to={y} dur="0.5s" fill="freeze" />
            </rect>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" fill={b.color} fontSize="12" fontWeight={700}>
              {(b.value * 100).toFixed(1)}%
            </text>
            {b.reference !== undefined && (
              <line
                x1={x - 6}
                x2={x + barW + 6}
                y1={padding.top + innerH - (b.reference / yMax) * innerH}
                y2={padding.top + innerH - (b.reference / yMax) * innerH}
                stroke="var(--games-route-fg, #fbbf24)"
                strokeDasharray="3 3"
                strokeWidth={1.4}
                opacity={0.8}
              />
            )}
            <text x={x + barW / 2} y={height - 18} textAnchor="middle" fill={FG} fontSize="11">
              {b.label}
            </text>
          </g>
        );
      })}
      <text x={width - padding.right} y={height - 4} textAnchor="end" fill={AXIS} fontSize="10" opacity={0.85}>
        - - {referenceLabel}
      </text>
    </svg>
  );
};
