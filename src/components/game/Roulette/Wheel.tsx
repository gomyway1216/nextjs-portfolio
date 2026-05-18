'use client';

import { useEffect, useRef, useState } from 'react';
import { WHEEL_ORDER, POCKET_COUNT, colorOf } from './engine';

interface WheelProps {
  /** Target pocket number (0-36). */
  result: number | null;
  /**
   * Monotonic spin counter — bump on every new spin (even if `result`
   * repeats) so the wheel re-animates. 0 = no spin yet.
   */
  spinId: number;
  /** Called once the spin animation settles. */
  onSettled?: () => void;
  size?: number;
}

const SLICE_DEG = 360 / POCKET_COUNT;
const SPIN_TURNS = 6;
const SPIN_DURATION_MS = 3800;

const colorFill: Record<string, string> = {
  red: '#dc2626',
  black: '#0f172a',
  green: '#15803d',
};

export const Wheel = ({ result, spinId, onSettled, size = 320 }: WheelProps) => {
  const [rotation, setRotation] = useState(0);
  const prevSpinId = useRef<number>(0);
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (spinId === 0 || result === null || spinId === prevSpinId.current) return;
    prevSpinId.current = spinId;

    const indexOnWheel = WHEEL_ORDER.indexOf(result);
    // We want the chosen slice to end up at the top (pointer at 12 o'clock).
    // Slice i sits centered at angle (i + 0.5) * SLICE_DEG when rotation = 0.
    // To rotate it to top we need the wheel rotated by -(i + 0.5) * SLICE_DEG.
    const targetWithinTurn = -(indexOnWheel + 0.5) * SLICE_DEG;
    // Always advance forward and add full turns for visual effect.
    setRotation((current) => {
      const currentMod = ((current % 360) + 360) % 360;
      const delta = ((targetWithinTurn - currentMod) % 360 + 360) % 360;
      return current + delta + SPIN_TURNS * 360;
    });

    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      onSettled?.();
    }, SPIN_DURATION_MS);

    return () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    };
  }, [spinId, result, onSettled]);

  const radius = size / 2;
  const innerRadius = radius * 0.45;
  const labelRadius = radius * 0.78;

  const slices = WHEEL_ORDER.map((n, i) => {
    const startAngle = i * SLICE_DEG - 90; // -90 so index 0 is at top
    const endAngle = (i + 1) * SLICE_DEG - 90;
    const midAngle = (startAngle + endAngle) / 2;
    const path = arcPath(radius, radius, innerRadius, radius - 4, startAngle, endAngle);
    const labelX = radius + Math.cos((midAngle * Math.PI) / 180) * labelRadius;
    const labelY = radius + Math.sin((midAngle * Math.PI) / 180) * labelRadius;
    return (
      <g key={`${n}-${i}`}>
        <path d={path} fill={colorFill[colorOf(n)]} stroke="#1e293b" strokeWidth={0.5} />
        <text
          x={labelX}
          y={labelY}
          fill="#fff"
          fontSize={radius * 0.07}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${midAngle + 90}, ${labelX}, ${labelY})`}
        >
          {n}
        </text>
      </g>
    );
  });

  return (
    <div style={{ position: 'relative', width: size, height: size + 24, margin: '0 auto' }}>
      {/* Pointer at top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '20px solid #fbbf24',
          zIndex: 2,
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))',
        }}
      />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          marginTop: 24,
          transform: `rotate(${rotation}deg)`,
          transition: spinId === 0 ? 'none' : `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.17, 0.84, 0.32, 1.0)`,
          display: 'block',
        }}
      >
        <circle cx={radius} cy={radius} r={radius - 1} fill="#1e293b" />
        {slices}
        <circle cx={radius} cy={radius} r={innerRadius} fill="#0f172a" stroke="#334155" strokeWidth={2} />
        <circle cx={radius} cy={radius} r={innerRadius * 0.35} fill="#334155" />
      </svg>
    </div>
  );
};

function arcPath(cx: number, cy: number, rInner: number, rOuter: number, startDeg: number, endDeg: number): string {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(startRad);
  const y1 = cy + rOuter * Math.sin(startRad);
  const x2 = cx + rOuter * Math.cos(endRad);
  const y2 = cy + rOuter * Math.sin(endRad);
  const x3 = cx + rInner * Math.cos(endRad);
  const y3 = cy + rInner * Math.sin(endRad);
  const x4 = cx + rInner * Math.cos(startRad);
  const y4 = cy + rInner * Math.sin(startRad);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export const WHEEL_SPIN_MS = SPIN_DURATION_MS;
