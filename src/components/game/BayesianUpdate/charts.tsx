'use client';

import { Posterior, betaPdf } from './engine';

interface PosteriorChartProps {
  posterior: Posterior;
  /** Optional prior curve drawn faintly behind the posterior. */
  prior?: Posterior | null;
  /** Optional truth marker. */
  trueP?: number | null;
  /** Optional credible interval [lo, hi]. */
  credInterval?: [number, number] | null;
  /** Posterior mean marker. */
  mean?: number | null;
  width?: number;
  height?: number;
}

const N = 240;

function sampleCurve(post: Posterior): { pdf: number[]; max: number } {
  const pdf = new Array<number>(N + 1);
  let max = 0;
  for (let i = 0; i <= N; i++) {
    const v = betaPdf(i / N, post);
    pdf[i] = Number.isFinite(v) ? v : 0;
    if (pdf[i] > max) max = pdf[i];
  }
  return { pdf, max };
}

/** Plot the Beta(α, β) posterior PDF over [0, 1] (theme-aware). */
export const PosteriorChart = ({
  posterior,
  prior,
  trueP,
  credInterval,
  mean,
  width = 720,
  height = 280,
}: PosteriorChartProps) => {
  const padding = { top: 18, right: 16, bottom: 32, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const post = sampleCurve(posterior);
  const priorCurve = prior ? sampleCurve(prior) : null;

  let yMax = Math.max(post.max, priorCurve?.max ?? 0);
  if (!Number.isFinite(yMax) || yMax === 0) yMax = 1;
  yMax *= 1.08;

  const xScale = (x: number) => padding.left + x * innerW;
  const yScale = (y: number) => padding.top + innerH - (y / yMax) * innerH;

  const toLine = (pdf: number[]) =>
    pdf.map((y, i) => `${xScale(i / N).toFixed(1)},${yScale(y).toFixed(1)}`).join(' ');

  const fillPath =
    `M ${xScale(0)},${yScale(0)} ` +
    post.pdf.map((y, i) => `L ${xScale(i / N).toFixed(1)},${yScale(y).toFixed(1)}`).join(' ') +
    ` L ${xScale(1)},${yScale(0)} Z`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Posterior Beta(${posterior.alpha.toFixed(1)}, ${posterior.beta.toFixed(1)})`}
      style={{ background: 'var(--muted)', borderRadius: 12, border: '1px solid var(--border)' }}
    >
      {/* horizontal baseline */}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={padding.top + innerH}
        y2={padding.top + innerH}
        stroke="var(--border)"
      />

      {credInterval && (
        <rect
          x={xScale(credInterval[0])}
          y={padding.top}
          width={Math.max(0, xScale(credInterval[1]) - xScale(credInterval[0]))}
          height={innerH}
          fill="var(--primary)"
          opacity={0.08}
        />
      )}

      {/* prior curve (faint dashed) */}
      {priorCurve && (
        <polyline
          points={toLine(priorCurve.pdf)}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      )}

      {/* posterior fill + line */}
      <path d={fillPath} fill="var(--primary)" opacity={0.16} />
      <polyline points={toLine(post.pdf)} fill="none" stroke="var(--primary)" strokeWidth={2.4} />

      {credInterval && (
        <>
          {[credInterval[0], credInterval[1]].map((c, i) => (
            <line
              key={i}
              x1={xScale(c)}
              x2={xScale(c)}
              y1={padding.top}
              y2={padding.top + innerH}
              stroke="var(--primary)"
              strokeDasharray="3 3"
              strokeWidth={1}
              opacity={0.6}
            />
          ))}
        </>
      )}

      {/* posterior mean */}
      {mean !== null && mean !== undefined && (
        <line
          x1={xScale(mean)}
          x2={xScale(mean)}
          y1={padding.top}
          y2={padding.top + innerH}
          stroke="var(--primary)"
          strokeWidth={1.5}
          strokeDasharray="1 3"
          opacity={0.9}
        />
      )}

      {/* truth marker */}
      {trueP !== null && trueP !== undefined && (
        <>
          <line
            x1={xScale(trueP)}
            x2={xScale(trueP)}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke="#f59e0b"
            strokeWidth={2}
          />
          <text x={xScale(trueP) + 4} y={padding.top + 12} fill="#f59e0b" fontSize="11" fontWeight={700}>
            p={trueP.toFixed(2)}
          </text>
        </>
      )}

      {/* x ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <g key={p}>
          <line
            x1={xScale(p)}
            x2={xScale(p)}
            y1={padding.top + innerH}
            y2={padding.top + innerH + 4}
            stroke="var(--muted-foreground)"
          />
          <text
            x={xScale(p)}
            y={padding.top + innerH + 18}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize="10"
          >
            {p}
          </text>
        </g>
      ))}

      <text x={padding.left + 4} y={padding.top + 12} fill="var(--muted-foreground)" fontSize="10">
        Beta(α={posterior.alpha.toFixed(1)}, β={posterior.beta.toFixed(1)})
      </text>
    </svg>
  );
};

interface MultiTrajProps {
  trajectories: number[][];
  trueP: number;
  axisLabel?: string;
  startLabel?: string;
  endLabel?: string;
  width?: number;
  height?: number;
}

/** Plot many independent posterior-mean trajectories overlaid; they all converge to trueP. */
export const MultiTrajectoryChart = ({
  trajectories,
  trueP,
  axisLabel,
  startLabel,
  endLabel,
  width = 720,
  height = 300,
}: MultiTrajProps) => {
  if (trajectories.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const T = trajectories[0].length;
  const xScale = (i: number) => padding.left + (i / Math.max(1, T - 1)) * innerW;
  const yScale = (v: number) => padding.top + innerH - v * innerH;

  const step = Math.max(1, Math.floor(T / 220));

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Posterior mean trajectories converging to ${trueP.toFixed(3)}`}
      style={{ background: 'var(--muted)', borderRadius: 12, border: '1px solid var(--border)' }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padding.top + innerH * (1 - p);
        return (
          <g key={p}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="10">
              {p.toFixed(2)}
            </text>
          </g>
        );
      })}

      {trajectories.map((traj, idx) => {
        const pts: string[] = [];
        for (let i = 0; i < traj.length; i += step) pts.push(`${xScale(i).toFixed(1)},${yScale(traj[i]).toFixed(1)}`);
        if ((traj.length - 1) % step !== 0)
          pts.push(`${xScale(traj.length - 1).toFixed(1)},${yScale(traj[traj.length - 1]).toFixed(1)}`);
        return (
          <polyline key={idx} points={pts.join(' ')} fill="none" stroke="var(--primary)" strokeWidth={0.8} opacity={0.3} />
        );
      })}

      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={yScale(trueP)}
        y2={yScale(trueP)}
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      <text x={width - padding.right - 4} y={yScale(trueP) - 6} textAnchor="end" fill="#f59e0b" fontSize="11" fontWeight={700}>
        p = {trueP.toFixed(3)}
      </text>

      <text x={padding.left} y={height - 6} fill="var(--muted-foreground)" fontSize="10">
        {startLabel ?? '0'}
      </text>
      <text x={width - padding.right} y={height - 6} textAnchor="end" fill="var(--muted-foreground)" fontSize="10">
        {endLabel ?? (T - 1).toLocaleString()}
      </text>
      {axisLabel && (
        <text x={padding.left + 4} y={padding.top + 12} fill="var(--muted-foreground)" fontSize="10">
          {axisLabel}
        </text>
      )}
    </svg>
  );
};
