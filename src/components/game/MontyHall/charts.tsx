'use client';

interface ConvergenceChartProps {
  series: { label: string; color: string; values: number[]; reference?: number }[];
  x: number[];
  width?: number;
  height?: number;
  yMax?: number;
}

/**
 * Multi-line convergence chart. Each series shares the same x array (trial counts).
 * Optional `reference` per series draws a dashed horizontal line at the theoretical value.
 */
export const ConvergenceChart = ({ series, x, width = 600, height = 260, yMax = 1 }: ConvergenceChartProps) => {
  if (x.length === 0 || series.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const xMax = x[x.length - 1];
  const xScale = (v: number) => padding.left + (v / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - (v / yMax) * innerH;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {/* y-axis grid + labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{(p * yMax * 100).toFixed(0)}%</text>
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
              opacity={0.55}
            />
          )}
          <polyline
            points={s.values.map((v, i) => `${xScale(x[i]).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={1.7}
          />
        </g>
      ))}

      {/* x-axis */}
      <text x={padding.left} y={height - 8} fill="#64748b" fontSize="10">0</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill="#64748b" fontSize="10">{xMax.toLocaleString()} 試行</text>

      {/* legend */}
      <g transform={`translate(${padding.left + 8}, ${padding.top + 8})`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0, ${i * 16})`}>
            <line x1={0} x2={18} y1={5} y2={5} stroke={s.color} strokeWidth={2.5} />
            <text x={24} y={9} fill="#cbd5e1" fontSize="11">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
};

interface BarCompareProps {
  bars: { label: string; value: number; color: string; reference?: number }[];
  width?: number;
  height?: number;
  yMax?: number;
}

/** Horizontal-label, vertical bars. Each bar can have a dashed reference (theoretical value). */
export const BarCompare = ({ bars, width = 600, height = 200, yMax = 1 }: BarCompareProps) => {
  if (bars.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 36, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const slot = innerW / bars.length;
  const barW = slot * 0.55;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {[0, 0.5, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{(p * yMax * 100).toFixed(0)}%</text>
          </g>
        );
      })}

      {bars.map((b, i) => {
        const x = padding.left + slot * i + (slot - barW) / 2;
        const h = (b.value / yMax) * innerH;
        const y = padding.top + innerH - h;
        return (
          <g key={b.label}>
            <rect x={x} y={y} width={barW} height={h} fill={b.color} opacity={0.9} />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill={b.color} fontSize="11" fontWeight={700}>
              {(b.value * 100).toFixed(1)}%
            </text>
            {b.reference !== undefined && (
              <line
                x1={x - 4}
                x2={x + barW + 4}
                y1={padding.top + innerH - (b.reference / yMax) * innerH}
                y2={padding.top + innerH - (b.reference / yMax) * innerH}
                stroke="#fbbf24"
                strokeDasharray="3 3"
                strokeWidth={1.2}
              />
            )}
            <text x={x + barW / 2} y={height - 18} textAnchor="middle" fill="#cbd5e1" fontSize="11">{b.label}</text>
          </g>
        );
      })}
      <text x={width - padding.right} y={height - 4} textAnchor="end" fill="#fbbf24" fontSize="10" opacity={0.8}>- - 理論値</text>
    </svg>
  );
};
