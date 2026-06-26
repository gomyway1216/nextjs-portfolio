'use client';

import type { CSSProperties } from 'react';
import type { TrafficGranularity, TrafficSeries } from '@/services/activityLogService';

const CHART_COLORS = [
  '#5aa2ff', '#34d399', '#ef4444', '#f59e0b',
  '#55d6be', '#8b9cff', '#f472b6', '#14b8a6',
  '#facc15',
];

const chartText = 'var(--admin-text)';
const chartTextMuted = 'var(--admin-text-muted)';
const chartTextSubtle = 'var(--admin-text-subtle)';
const chartGrid = 'var(--admin-chart-grid)';

function formatBucketLabel(label: string, granularity: TrafficGranularity): string {
  if (granularity === 'day') return label.slice(5);          // "MM-DD"
  if (granularity === 'week') return `wk ${label.slice(5)}`;
  if (granularity === 'month') return label.slice(0, 7);     // "YYYY-MM"
  return label.slice(0, 4);                                  // "YYYY"
}

interface Props {
  buckets: Array<{ key: string; label: string }>;
  granularity: TrafficGranularity;
  series: TrafficSeries[];
  height?: number;
}

export default function TrafficLineChart({ buckets, granularity, series, height = 240 }: Props) {
  const width = 720;
  const padding = { top: 12, right: 16, bottom: 48, left: 36 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...series.flatMap((s) => s.points.map((p) => p.count)), 1);

  const getX = (i: number) =>
    buckets.length <= 1
      ? padding.left + chartWidth / 2
      : padding.left + (i / (buckets.length - 1)) * chartWidth;
  const getY = (v: number) => padding.top + chartHeight - (v / maxValue) * chartHeight;
  const ticks = Array.from({ length: 4 }, (_, i) => Math.round((maxValue / 3) * i));

  const wrap: CSSProperties = { overflowX: 'auto', width: '100%' };
  const svg: CSSProperties = { minWidth: 600, display: 'block' };

  return (
    <div style={wrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={svg} role="img">
        {ticks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={`tick-${tick}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke={chartGrid}
                strokeDasharray="3 3"
              />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill={chartTextSubtle}>
                {tick}
              </text>
            </g>
          );
        })}

        {buckets.map((bucket, i) => {
          const x = getX(i);
          const y = padding.top + chartHeight + 12;
          return (
            <text
              key={`label-${bucket.key}`}
              x={x}
              y={y}
              textAnchor="end"
              fontSize="10"
              fill={chartTextSubtle}
              transform={`rotate(-45 ${x} ${y})`}
            >
              {formatBucketLabel(bucket.label, granularity)}
            </text>
          );
        })}

        {series.map((item, sIdx) => {
          const color = CHART_COLORS[sIdx % CHART_COLORS.length];
          const path = item.points
            .map((p, pIdx) => `${pIdx === 0 ? 'M' : 'L'} ${getX(pIdx)} ${getY(p.count)}`)
            .join(' ');
          return (
            <g key={item.key}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {item.points.map((p, pIdx) => (
                <circle
                  key={`${item.key}-${p.bucket}`}
                  cx={getX(pIdx)}
                  cy={getY(p.count)}
                  r="2.5"
                  fill={color}
                >
                  <title>{`${item.label}: ${p.count} on ${p.bucket}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
        {series.map((item, sIdx) => {
          const color = CHART_COLORS[sIdx % CHART_COLORS.length];
          return (
            <div
              key={`legend-${item.key}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: chartTextMuted }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span>{item.label}</span>
              <span style={{ color: chartText, fontWeight: 600 }}>{item.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
