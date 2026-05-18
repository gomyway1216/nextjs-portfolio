'use client';

import { Posterior, betaPdf } from './engine';

interface PosteriorChartProps {
  posterior: Posterior;
  /** Optional truth marker. */
  trueP?: number | null;
  /** Optional credible interval [lo, hi]. */
  credInterval?: [number, number] | null;
  width?: number;
  height?: number;
}

/** Plot the Beta(α, β) posterior PDF over [0, 1]. */
export const PosteriorChart = ({ posterior, trueP, credInterval, width = 720, height = 260 }: PosteriorChartProps) => {
  const padding = { top: 18, right: 16, bottom: 30, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const N = 200;
  const pdf: number[] = new Array(N + 1);
  let yMax = 0;
  for (let i = 0; i <= N; i++) {
    const x = i / N;
    pdf[i] = betaPdf(x, posterior);
    if (pdf[i] > yMax) yMax = pdf[i];
  }
  if (!Number.isFinite(yMax) || yMax === 0) yMax = 1;
  yMax *= 1.05;

  const xScale = (x: number) => padding.left + x * innerW;
  const yScale = (y: number) => padding.top + innerH - (y / yMax) * innerH;

  const fillPath = `M ${xScale(0)},${yScale(0)} ` +
    pdf.map((y, i) => `L ${xScale(i / N).toFixed(1)},${yScale(y).toFixed(1)}`).join(' ') +
    ` L ${xScale(1)},${yScale(0)} Z`;
  const linePath = pdf.map((y, i) => `${xScale(i / N).toFixed(1)},${yScale(y).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      <path d={fillPath} fill="#67e8f933" />
      <polyline points={linePath} fill="none" stroke="#67e8f9" strokeWidth={2} />

      {credInterval && (
        <>
          <line x1={xScale(credInterval[0])} x2={xScale(credInterval[0])} y1={padding.top} y2={padding.top + innerH} stroke="#a78bfa" strokeDasharray="3 3" strokeWidth={1} />
          <line x1={xScale(credInterval[1])} x2={xScale(credInterval[1])} y1={padding.top} y2={padding.top + innerH} stroke="#a78bfa" strokeDasharray="3 3" strokeWidth={1} />
          <rect x={xScale(credInterval[0])} y={padding.top} width={xScale(credInterval[1]) - xScale(credInterval[0])} height={innerH} fill="#a78bfa11" />
          <text x={xScale((credInterval[0] + credInterval[1]) / 2)} y={padding.top + 12} fill="#a78bfa" fontSize="10" textAnchor="middle">95% CI</text>
        </>
      )}

      {trueP !== null && trueP !== undefined && (
        <>
          <line x1={xScale(trueP)} x2={xScale(trueP)} y1={padding.top} y2={padding.top + innerH} stroke="#fbbf24" strokeWidth={2} />
          <text x={xScale(trueP) + 4} y={padding.top + 12} fill="#fbbf24" fontSize="11" fontWeight={700}>真値 p={trueP.toFixed(2)}</text>
        </>
      )}

      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <g key={p}>
          <line x1={xScale(p)} x2={xScale(p)} y1={padding.top + innerH} y2={padding.top + innerH + 4} stroke="#475569" />
          <text x={xScale(p)} y={padding.top + innerH + 18} textAnchor="middle" fill="#64748b" fontSize="10">{p}</text>
        </g>
      ))}

      <text x={padding.left + 6} y={padding.top + 12} fill="#94a3b8" fontSize="10">Beta(α={posterior.alpha.toFixed(0)}, β={posterior.beta.toFixed(0)})</text>
    </svg>
  );
};

interface MultiTrajProps {
  trajectories: number[][];
  trueP: number;
  width?: number;
  height?: number;
}

/** Plot many independent posterior-mean trajectories overlaid; they all converge to trueP. */
export const MultiTrajectoryChart = ({ trajectories, trueP, width = 720, height = 280 }: MultiTrajProps) => {
  if (trajectories.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const T = trajectories[0].length;
  const xScale = (i: number) => padding.left + (i / Math.max(1, T - 1)) * innerW;
  const yScale = (v: number) => padding.top + innerH - v * innerH;

  // Downsample if a trajectory has too many steps.
  const step = Math.max(1, Math.floor(T / 200));

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{p.toFixed(2)}</text>
          </g>
        );
      })}

      {trajectories.map((traj, idx) => {
        const pts: string[] = [];
        for (let i = 0; i < traj.length; i += step) pts.push(`${xScale(i).toFixed(1)},${yScale(traj[i]).toFixed(1)}`);
        if ((traj.length - 1) % step !== 0) pts.push(`${xScale(traj.length - 1).toFixed(1)},${yScale(traj[traj.length - 1]).toFixed(1)}`);
        return <polyline key={idx} points={pts.join(' ')} fill="none" stroke="#67e8f9" strokeWidth={0.8} opacity={0.35} />;
      })}

      <line x1={padding.left} x2={width - padding.right} y1={yScale(trueP)} y2={yScale(trueP)} stroke="#fbbf24" strokeWidth={2} strokeDasharray="4 4" />
      <text x={width - padding.right - 4} y={yScale(trueP) - 6} textAnchor="end" fill="#fbbf24" fontSize="11" fontWeight={700}>真値 p = {trueP.toFixed(3)}</text>

      <text x={padding.left} y={height - 6} fill="#64748b" fontSize="10">0 flips</text>
      <text x={width - padding.right} y={height - 6} textAnchor="end" fill="#64748b" fontSize="10">{(T - 1).toLocaleString()} flips</text>
      <text x={padding.left + 4} y={padding.top + 12} fill="#94a3b8" fontSize="10">posterior mean / trial ({trajectories.length} 試行)</text>
    </svg>
  );
};
