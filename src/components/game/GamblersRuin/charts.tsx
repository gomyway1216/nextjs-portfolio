'use client';

interface TrajectoryChartProps {
  trajectories: number[][];
  start: number;
  target: number;
  width?: number;
  height?: number;
}

/** Plots many bankroll trajectories on the same axes, colored by outcome. */
export const TrajectoryChart = ({ trajectories, start, target, width = 700, height = 280 }: TrajectoryChartProps) => {
  if (trajectories.length === 0) return null;
  const padding = { top: 12, right: 12, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  let xMax = 0;
  for (const t of trajectories) if (t.length > xMax) xMax = t.length;
  if (xMax === 0) return null;
  const xScale = (i: number) => padding.left + (i / xMax) * innerW;
  const yScale = (v: number) => padding.top + innerH - (v / target) * innerH;
  const startY = yScale(start);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {[0, 0.5, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{Math.round(p * target)}</text>
          </g>
        );
      })}
      {/* start reference */}
      <line x1={padding.left} x2={width - padding.right} y1={startY} y2={startY} stroke="#fbbf24" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
      <text x={padding.left + 4} y={startY - 4} fill="#fbbf24" fontSize="10">start = {start}</text>

      {trajectories.map((tr, idx) => {
        const last = tr[tr.length - 1];
        const stroke = last <= 0 ? '#f87171' : last >= target ? '#4ade80' : '#94a3b8';
        const opacity = trajectories.length > 30 ? 0.25 : 0.55;
        // Downsample very long trajectories before serializing — at 30 paths
        // × 200k pts the raw string is multi-megabyte and slows the DOM badly.
        const step = Math.max(1, Math.floor(tr.length / 1000));
        const pts: string[] = [];
        for (let i = 0; i < tr.length; i += step) {
          pts.push(`${xScale(i).toFixed(1)},${yScale(tr[i]).toFixed(1)}`);
        }
        // Always include the last point so endpoint colors land correctly.
        if ((tr.length - 1) % step !== 0) {
          pts.push(`${xScale(tr.length - 1).toFixed(1)},${yScale(tr[tr.length - 1]).toFixed(1)}`);
        }
        return <polyline key={idx} points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={1} opacity={opacity} />;
      })}

      <text x={padding.left} y={height - 8} fill="#64748b" fontSize="10">0 steps</text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fill="#64748b" fontSize="10">{xMax.toLocaleString()} steps</text>

      <g transform={`translate(${width - padding.right - 110}, ${padding.top + 4})`}>
        <rect x={0} y={0} width={108} height={42} rx={4} fill="#020617" stroke="#1e293b" />
        <line x1={6} x2={20} y1={12} y2={12} stroke="#f87171" strokeWidth={2} /> <text x={24} y={15} fill="#cbd5e1" fontSize="10">破産</text>
        <line x1={6} x2={20} y1={24} y2={24} stroke="#4ade80" strokeWidth={2} /> <text x={24} y={27} fill="#cbd5e1" fontSize="10">目標達成</text>
        <line x1={6} x2={20} y1={36} y2={36} stroke="#94a3b8" strokeWidth={2} /> <text x={24} y={39} fill="#cbd5e1" fontSize="10">未決着 (上限)</text>
      </g>
    </svg>
  );
};

interface ProbBarsProps {
  empirical: { ruin: number; reach: number; capped: number };
  theoretical: number;
}

export const OutcomeBars = ({ empirical, theoretical }: ProbBarsProps) => (
  <div style={{ display: 'flex', height: 36, borderRadius: 8, overflow: 'hidden', border: '1px solid #334155', position: 'relative' }}>
    <div style={{ flex: empirical.ruin, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }} title={`破産 ${(empirical.ruin * 100).toFixed(2)}%`}>
      {empirical.ruin > 0.06 ? `${(empirical.ruin * 100).toFixed(1)}%` : ''}
    </div>
    <div style={{ flex: empirical.reach, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }} title={`目標達成 ${(empirical.reach * 100).toFixed(2)}%`}>
      {empirical.reach > 0.06 ? `${(empirical.reach * 100).toFixed(1)}%` : ''}
    </div>
    {empirical.capped > 0 && (
      <div style={{ flex: empirical.capped, background: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }} title={`未決着 ${(empirical.capped * 100).toFixed(2)}%`}>
        {empirical.capped > 0.06 ? `${(empirical.capped * 100).toFixed(1)}%` : ''}
      </div>
    )}
    {/* theoretical ruin marker */}
    <div
      style={{ position: 'absolute', top: -4, bottom: -4, left: `${theoretical * 100}%`, width: 2, background: '#fbbf24' }}
      title={`理論上の破産確率 ${(theoretical * 100).toFixed(2)}%`}
    />
  </div>
);
