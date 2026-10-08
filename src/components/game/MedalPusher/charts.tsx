'use client';

import { CHECKERS, FIELD, MEDAL_RADIUS, PUSHER } from './engine';
import type { MarkerShape, RatePoint } from './sim';

const AXIS = 'var(--games-route-muted)';
const GRID = 'var(--games-route-border)';
const SURFACE = {
  background: 'var(--games-route-surface-raised)',
  borderRadius: 10,
  border: '1px solid var(--games-route-border)',
  display: 'block',
} as const;

/** A small filled shape that identifies a series without relying on its colour. */
export const Marker = ({ shape, x, y, color, size = 4 }: { shape: MarkerShape; x: number; y: number; color: string; size?: number }) => {
  if (shape === 'square') return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={color} />;
  if (shape === 'triangle') return <path d={`M${x} ${y - size * 1.2} L${x + size * 1.15} ${y + size} L${x - size * 1.15} ${y + size} Z`} fill={color} />;
  if (shape === 'diamond') return <path d={`M${x} ${y - size * 1.3} L${x + size * 1.3} ${y} L${x} ${y + size * 1.3} L${x - size * 1.3} ${y} Z`} fill={color} />;
  return <circle cx={x} cy={y} r={size} fill={color} />;
};

export interface RateSeries {
  id: string;
  color: string;
  /** Drawn along the line, so the series can be told apart without its colour. */
  marker: MarkerShape;
  points: RatePoint[];
}

/** A marker on every eighth checkpoint keeps the shapes readable along a line. */
const MARKER_EVERY = 8;

/** Medals won per medal dropped against medals dropped, one line per aim, with break-even dashed. */
export const ReturnChart = ({
  series,
  xLabel,
  ariaLabel,
  formatCount,
  width = 680,
  height = 300,
}: {
  series: RateSeries[];
  xLabel: string;
  ariaLabel: string;
  formatCount: (n: number) => string;
  width?: number;
  height?: number;
}) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const pad = { top: 12, right: 14, bottom: 34, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xMax = Math.max(...all.map((p) => p.medals));
  // The axis covers every point, so an early stretch far from the rest is drawn where it is.
  const yMax = Math.max(1.1, ...all.map((p) => p.rate)) * 1.05;
  const x = (n: number) => pad.left + (n / xMax) * innerW;
  const y = (v: number) => pad.top + innerH - (v / yMax) * innerH;
  const yTicks = [0, 0.5, 1, ...(yMax >= 1.6 ? [1.5] : []), ...(yMax >= 2.2 ? [2] : [])];
  const xTicks = [0, xMax / 2, xMax];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={SURFACE} role="img" aria-label={ariaLabel}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={v === 1 ? AXIS : GRID} strokeDasharray={v === 1 ? '6 4' : v === 0 ? undefined : '2 4'} />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fill={AXIS} fontSize={10}>
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {xTicks.map((n) => (
        <text key={n} x={x(n)} y={height - pad.bottom + 16} textAnchor={n === 0 ? 'start' : n === xMax ? 'end' : 'middle'} fill={AXIS} fontSize={10}>
          {formatCount(Math.round(n))}
        </text>
      ))}
      <text x={pad.left + innerW / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize={10}>
        {xLabel}
      </text>
      {series.map((s) => (
        <g key={s.id} data-series={s.id}>
          <polyline
            points={s.points.map((p) => `${x(p.medals).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          {s.points.map((p, i) =>
            i % MARKER_EVERY === MARKER_EVERY - 1 || i === s.points.length - 1 ? (
              <Marker key={i} shape={s.marker} x={x(p.medals)} y={y(p.rate)} color={s.color} />
            ) : null,
          )}
        </g>
      ))}
    </svg>
  );
};

const TABLE = 'var(--mp-d-table)';
const PUSHER_FILL = 'var(--mp-d-pusher)';
const PANEL = 'var(--mp-d-panel)';
const LINE = 'var(--mp-d-line)';
const LOST = 'var(--mp-d-lost)';
const WON = 'var(--mp-d-won)';
const GATE = 'var(--mp-d-gate)';

/** Where each numbered badge of the diagram sits, in field units (depth may be negative: on the back panel). */
const BADGES: { x: number; depth: number }[] = [
  { x: 50, depth: -13 },
  { x: 88, depth: -3.5 },
  { x: 14, depth: 20 },
  { x: 50, depth: 62 },
  { x: 88, depth: 89 },
  { x: 50, depth: 108 },
];

/** A few medals lying about, so the diagram reads as a table and not as a floor plan. */
const SAMPLE_MEDALS: { x: number; depth: number }[] = [
  { x: 30, depth: 12 },
  { x: 38, depth: 24 },
  { x: 62, depth: 18 },
  { x: 72, depth: 30 },
  { x: 24, depth: 56 },
  { x: 34, depth: 72 },
  { x: 68, depth: 66 },
  { x: 78, depth: 80 },
  { x: 60, depth: 90 },
  { x: 20, depth: 88 },
];

/** The field from above, with a numbered badge on each part the list beside it explains. */
export const FieldDiagram = ({ ariaLabel }: { ariaLabel: string }) => {
  const scale = 2.4;
  const left = 30;
  const top = 46;
  const width = left * 2 + FIELD.width * scale;
  const height = top + FIELD.depth * scale + 40;
  const X = (x: number) => left + x * scale;
  const Y = (depth: number) => top + depth * scale;
  const front = (PUSHER.min + PUSHER.max) / 2;
  const right = FIELD.width;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} style={{ display: 'block', width: '100%', maxWidth: 300, margin: '0 auto', height: 'auto' }}>
      {/* The back panel, seen edge on, with the chute above it */}
      <rect x={X(0)} y={Y(-9)} width={FIELD.width * scale} height={9 * scale} fill={PANEL} stroke={LINE} strokeWidth={1.2} />
      <path d={`M${X(44)} ${Y(-17)} L${X(56)} ${Y(-17)} L${X(52.5)} ${Y(-10)} L${X(47.5)} ${Y(-10)} Z`} fill={PUSHER_FILL} stroke={LINE} strokeWidth={1.2} />
      {CHECKERS.positions.map((center) => (
        <rect
          key={center}
          x={X(center - MEDAL_RADIUS - CHECKERS.halfWidth)}
          y={Y(-7)}
          width={(MEDAL_RADIUS + CHECKERS.halfWidth) * 2 * scale}
          height={7 * scale}
          fill="none"
          stroke={GATE}
          strokeWidth={2.4}
        />
      ))}
      {/* The lower table and the pusher on top of its back half */}
      <rect x={X(0)} y={Y(0)} width={FIELD.width * scale} height={FIELD.depth * scale} fill={TABLE} />
      <rect x={X(0)} y={Y(0)} width={FIELD.width * scale} height={front * scale} fill={PUSHER_FILL} stroke={LINE} strokeWidth={1.2} />
      {/* How far the pusher's lip travels */}
      <line x1={X(0)} x2={X(right)} y1={Y(PUSHER.min)} y2={Y(PUSHER.min)} stroke={LINE} strokeWidth={1} strokeDasharray="3 4" />
      <line x1={X(0)} x2={X(right)} y1={Y(PUSHER.max)} y2={Y(PUSHER.max)} stroke={LINE} strokeWidth={1} strokeDasharray="3 4" />
      <path
        d={`M${X(26)} ${Y(PUSHER.min + 1.5)} L${X(26)} ${Y(PUSHER.max - 1.5)} M${X(24)} ${Y(PUSHER.min + 4.5)} L${X(26)} ${Y(PUSHER.min + 1.5)} L${X(28)} ${Y(PUSHER.min + 4.5)} M${X(24)} ${Y(PUSHER.max - 4.5)} L${X(26)} ${Y(PUSHER.max - 1.5)} L${X(28)} ${Y(PUSHER.max - 4.5)}`}
        fill="none"
        stroke={LINE}
        strokeWidth={1.6}
      />
      {SAMPLE_MEDALS.map((medal, index) => (
        <circle key={index} cx={X(medal.x)} cy={Y(medal.depth)} r={MEDAL_RADIUS * scale} fill={WON} fillOpacity={0.35} stroke={WON} strokeWidth={1.2} />
      ))}
      {/* Side walls, and the stretch near the front where there are none */}
      {[0, right].map((x) => (
        <g key={x}>
          <line x1={X(x)} x2={X(x)} y1={Y(-9)} y2={Y(FIELD.sideOpenFrom)} stroke={LINE} strokeWidth={3.5} />
          <line x1={X(x)} x2={X(x)} y1={Y(FIELD.sideOpenFrom)} y2={Y(FIELD.depth)} stroke={LOST} strokeWidth={2.4} strokeDasharray="5 4" />
          <path
            d={
              x === 0
                ? `M${X(-2)} ${Y(89)} L${X(-9)} ${Y(89)} M${X(-6)} ${Y(86.5)} L${X(-9)} ${Y(89)} L${X(-6)} ${Y(91.5)}`
                : `M${X(right + 2)} ${Y(89)} L${X(right + 9)} ${Y(89)} M${X(right + 6)} ${Y(86.5)} L${X(right + 9)} ${Y(89)} L${X(right + 6)} ${Y(91.5)}`
            }
            fill="none"
            stroke={LOST}
            strokeWidth={2}
          />
        </g>
      ))}
      {/* The front edge */}
      <line x1={X(0)} x2={X(right)} y1={Y(FIELD.depth)} y2={Y(FIELD.depth)} stroke={WON} strokeWidth={3.5} />
      {[25, 75].map((x) => (
        <path
          key={x}
          d={`M${X(x)} ${Y(102)} L${X(x)} ${Y(109)} M${X(x - 2.5)} ${Y(106)} L${X(x)} ${Y(109)} L${X(x + 2.5)} ${Y(106)}`}
          fill="none"
          stroke={WON}
          strokeWidth={2}
        />
      ))}
      {BADGES.map((badge, index) => (
        <g key={index} data-badge={index + 1}>
          <circle cx={X(badge.x)} cy={Y(badge.depth)} r={10} fill="var(--games-route-fg)" />
          <text x={X(badge.x)} y={Y(badge.depth) + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--games-route-surface)">
            {index + 1}
          </text>
        </g>
      ))}
    </svg>
  );
};
