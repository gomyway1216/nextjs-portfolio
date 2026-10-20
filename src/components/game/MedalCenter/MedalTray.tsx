import { memo } from 'react';
import styles from './MachineFloor.module.css';

/**
 * The lower body of a tall cabinet on the floor's plan: what a medal pusher has under its window, the chute medals
 * come down and the tray they pile up in, behind a gold lip, between the cabinet's neon edges (its box's borders, so that
 * they stay in view however the picture is cut). Drawn here (nothing of
 * any real cabinet's art), in the floor's own palette.
 *
 * It fills whatever height its cabinet has to spare beside a taller corner (floorPlan.ts, `spansOf`'s `tall`): the
 * picture is scaled to cover the box and kept to its bottom, so the tray and its medals are always in view and only
 * the dark cabinet above them is cut.
 */

/** The medals in the tray: rows from the top of the heap down, each a little wider, nudged so they never line up. */
const HEAP: { x: number; y: number; tilt: number }[] = (() => {
  let seed = 7;
  const next = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const medals: { x: number; y: number; tilt: number }[] = [];
  const rows = 6;
  for (let row = 0; row < rows; row++) {
    const y = 128 + row * 9;
    const count = 5 + row * 3;
    const width = 120 + row * 52;
    for (let i = 0; i < count; i++) {
      const x = 240 - width / 2 + (width * (i + 0.5)) / count + (next() - 0.5) * 10;
      medals.push({ x, y: y + (next() - 0.5) * 4, tilt: (next() - 0.5) * 16 });
    }
  }
  return medals;
})();

/** Medals on their way down the chute. */
const FALLING = [
  { x: 232, y: 94, tilt: 62 },
  { x: 250, y: 112, tilt: -40 },
];

const Medal = ({ x, y, tilt }: { x: number; y: number; tilt: number }) => (
  <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(1)})`}>
    <ellipse rx={15} ry={5.6} fill="url(#mtFace)" stroke="#5f5b78" strokeWidth={1} />
    <ellipse rx={9.5} ry={3.2} fill="none" stroke="#8f8ba6" strokeWidth={0.9} />
    <ellipse cx={-4} cy={-1.6} rx={5} ry={1.2} fill="#ffffff" opacity={0.55} />
  </g>
);

/** A drawing that never changes: drawn once, however often the cabinet round it is. */
export const MedalTray = memo(function MedalTray() {
  return (
    <div className={styles.tray} aria-hidden="true" data-testid="center-tray">
      <svg viewBox="0 0 480 200" preserveAspectRatio="xMidYMax slice" focusable="false">
        <defs>
          <linearGradient id="mtBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#24155e" />
            <stop offset="1" stopColor="#0d0726" />
          </linearGradient>
          <radialGradient id="mtFace" cx="0.4" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#f4f3fb" />
            <stop offset="0.55" stopColor="#c9c6d9" />
            <stop offset="1" stopColor="#8d89a3" />
          </radialGradient>
          <linearGradient id="mtLip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.45" stopColor="#ffd65c" />
            <stop offset="1" stopColor="#a86a00" />
          </linearGradient>
          <linearGradient id="mtWell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#05020f" />
            <stop offset="1" stopColor="#1b1145" />
          </linearGradient>
        </defs>
        <rect width="480" height="200" fill="url(#mtBody)" />
        {/* The chute, with a gold rim, and two medals coming down it. */}
        <rect x="200" y="52" width="80" height="28" rx="9" fill="#05020f" stroke="#ffd65c" strokeWidth="3" />
        <rect x="210" y="60" width="60" height="5" rx="2.5" fill="#ffd65c" opacity="0.35" />
        {FALLING.map((medal, i) => (
          <Medal key={i} {...medal} />
        ))}
        {/* The tray: its dark well, the heap of medals in it, and the gold lip in front. */}
        <path d="M70 120 Q240 96 410 120 L440 182 L40 182 Z" fill="url(#mtWell)" />
        {HEAP.map((medal, i) => (
          <Medal key={i} {...medal} />
        ))}
        <rect x="26" y="176" width="428" height="16" rx="8" fill="url(#mtLip)" />
        <rect x="40" y="179" width="400" height="3" rx="1.5" fill="#ffffff" opacity="0.5" />
        {/* The lamps either side of the tray. */}
        <circle cx="84" cy="150" r="7" fill="#ffd65c" opacity="0.9" />
        <circle cx="396" cy="150" r="7" fill="#ffd65c" opacity="0.9" />
      </svg>
    </div>
  );
});
