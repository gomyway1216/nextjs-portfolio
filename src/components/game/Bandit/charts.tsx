'use client';

interface SeriesProps {
  series: { label: string; color: string; values: number[] }[];
  height?: number;
  width?: number;
  yLabel?: string;
  /** Optional dashed reference line at y. */
  reference?: { value: number; label: string };
}

/**
 * Multi-line chart with shared x-axis (step index). Each series should have
 * the same length. Downsamples to ≤200 points to keep the SVG cheap.
 */
export const MultiLineChart = ({ series, height = 280, width = 720, yLabel, reference }: SeriesProps) => {
  if (series.length === 0 || series[0].values.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 32, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const T = series[0].values.length;

  let yMax = reference?.value ?? 0;
  let yMin = 0;
  for (const s of series) {
    for (const v of s.values) {
      if (v > yMax) yMax = v;
      if (v < yMin) yMin = v;
    }
  }
  if (yMax === yMin) yMax = yMin + 1;
  const pad = (yMax - yMin) * 0.05;
  yMin -= pad;
  yMax += pad;

  const step = Math.max(1, Math.floor(T / 200));
  const xScale = (i: number) => padding.left + (i / Math.max(1, T - 1)) * innerW;
  const yScale = (v: number) => padding.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        const v = yMin + (yMax - yMin) * p;
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{v.toFixed(1)}</text>
          </g>
        );
      })}
      {reference && (
        <g>
          <line x1={padding.left} x2={width - padding.right} y1={yScale(reference.value)} y2={yScale(reference.value)} stroke="#fbbf24" strokeDasharray="4 4" strokeWidth={1.2} opacity={0.8} />
          <text x={padding.left + 4} y={yScale(reference.value) - 4} fill="#fbbf24" fontSize="10">{reference.label}</text>
        </g>
      )}
      {series.map((s) => {
        const pts: string[] = [];
        for (let i = 0; i < T; i += step) {
          pts.push(`${xScale(i).toFixed(1)},${yScale(s.values[i]).toFixed(1)}`);
        }
        if ((T - 1) % step !== 0) pts.push(`${xScale(T - 1).toFixed(1)},${yScale(s.values[T - 1]).toFixed(1)}`);
        return <polyline key={s.label} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={1.6} />;
      })}
      <text x={padding.left} y={height - 8} fill="#64748b" fontSize="10">step 0</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill="#64748b" fontSize="10">step {(T - 1).toLocaleString()}</text>
      {yLabel && <text x={padding.left + 8} y={padding.top + 12} fill="#94a3b8" fontSize="11">{yLabel}</text>}

      <g transform={`translate(${width - padding.right - 156}, ${padding.top + 8})`}>
        <rect x={-6} y={-2} width={158} height={series.length * 14 + 8} rx={4} fill="#020617" stroke="#1e293b" />
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0, ${i * 14})`}>
            <line x1={4} x2={22} y1={8} y2={8} stroke={s.color} strokeWidth={2.5} />
            <text x={28} y={11} fill="#cbd5e1" fontSize="10">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
};
