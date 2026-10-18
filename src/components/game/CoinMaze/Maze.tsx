'use client';

import { memo, type RefObject } from 'react';
import { POCKETS, SIDES, STAGES, type Pocket } from './engine';
import type { CoinMazeStrings } from './i18n';
import { BOARD_H, BOARD_W, CUPS, GATE_FOOT, GATE_LENGTH, GATE_X, HOLES, HOLE_W, PINS, PIN_R, POCKET_TOP, POCKET_W, POCKET_X, R, SHELVES, SLOT } from './scene';
import styles from './CoinMaze.module.css';

/**
 * The glass case: a hand-painted candy-shop backboard, the four shelves and lever cups, the gates, the OUT holes, the
 * pins and the pockets, and the medal. Everything that moves (the medal, the gates, the strikers and the time lamps) is
 * moved by the page straight on the elements it is handed (`parts`), a frame at a time, without drawing the case again.
 */

/** The elements the page moves. */
export interface MazeParts {
  medal: RefObject<SVGGElement | null>;
  gates: RefObject<SVGGElement | null>[];
  strikers: RefObject<SVGGElement | null>[];
  lamps: RefObject<SVGGElement | null>[];
}

/** Each gate's paint: the candy it is named for. */
const GATE_PAINT = [
  { body: '#7fd3f7', edge: '#1b7fb8', stripe: '#ffffff' },
  { body: '#ff8fb1', edge: '#c2185b', stripe: '#fff3f7' },
  { body: '#9be08a', edge: '#2e7d32', stripe: '#effbe9' },
  { body: '#a8714f', edge: '#4e2a14', stripe: '#f3d9c4' },
] as const;

const POCKET_PAINT: Record<Pocket, { fill: string; text: string }> = {
  big: { fill: '#f6c343', text: '#5a3200' },
  win: { fill: '#e8414b', text: '#ffffff' },
  out: { fill: '#55606e', text: '#ffffff' },
};

/** A lever's cup: a little U of steel at the wall, open toward the middle of the case. */
const Cup = ({ s }: { s: number }) => {
  const { x, y } = CUPS[s];
  const right = SIDES[s] === 'right';
  const wall = right ? x + R + 4 : x - R - 4;
  const lip = right ? x - R - 4 : x + R + 4;
  return (
    <path
      d={`M ${lip} ${y + R + 3} L ${wall} ${y + R + 3} L ${wall} ${y - R - 6}`}
      fill="none"
      stroke="#3b4350"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

/** The striker behind a cup: a spring and a hammer at the wall, pulled back as the lever is. */
const Striker = ({ s, part }: { s: number; part: RefObject<SVGGElement | null> }) => {
  const { x, y } = CUPS[s];
  const right = SIDES[s] === 'right';
  const face = right ? x + R + 1 : x - R - 1;
  const back = right ? BOARD_W - 4 : 4;
  const coil = Array.from({ length: 5 }, (_, i) => {
    const at = face + (back - face) * ((i + 0.5) / 5);
    return `L ${at} ${y + (i % 2 === 0 ? -4 : 4)}`;
  }).join(' ');
  return (
    <g ref={part} className={styles.striker}>
      <path d={`M ${face + (right ? 3 : -3)} ${y} ${coil} L ${back} ${y}`} fill="none" stroke="#9aa3ad" strokeWidth="1.4" />
      <rect x={right ? face : face - 4} y={y - 5} width="4" height="10" rx="1.5" fill="#d33b3b" stroke="#7a1414" strokeWidth="0.8" />
    </g>
  );
};

/** A lever's knob, outside the case on its wall. */
const Knob = ({ s }: { s: number }) => {
  const { y } = CUPS[s];
  const right = SIDES[s] === 'right';
  return <circle cx={right ? BOARD_W - 3 : 3} cy={y} r="5.5" fill="url(#cm-knob)" stroke="#5b0d0d" strokeWidth="1" />;
};

/** A gate: a flap on a hinge at the foot of the cup's mouth, painted like the candy it is named for. */
const Gate = ({ s, part }: { s: number; part: RefObject<SVGGElement | null> }) => {
  const x = GATE_X[s];
  const foot = GATE_FOOT(s);
  const paint = GATE_PAINT[s];
  const top = foot - GATE_LENGTH;
  return (
    <g ref={part} className={styles.gate} data-gate={s}>
      <rect x={x - 2.6} y={top} width="5.2" height={GATE_LENGTH} rx="2.4" fill={paint.body} stroke={paint.edge} strokeWidth="1.2" />
      {[0.25, 0.5, 0.75].map((u) => (
        <line key={u} x1={x - 2} x2={x + 2} y1={top + GATE_LENGTH * u} y2={top + GATE_LENGTH * u - 2} stroke={paint.stripe} strokeWidth="1.4" />
      ))}
      <circle cx={x} cy={foot} r="2.4" fill="#3b4350" />
    </g>
  );
};

/** A gate's time lamps: three bulbs under the cup, going out one by one as the medal waits. */
const Lamps = ({ s, part }: { s: number; part: RefObject<SVGGElement | null> }) => {
  const { x, y } = CUPS[s];
  const right = SIDES[s] === 'right';
  return (
    <g ref={part} className={styles.lamps} data-lit="0">
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + (right ? 1 : -1) * (i - 1) * 7} cy={y + 20} r="2.6" data-lamp={i} />
      ))}
    </g>
  );
};

/** The medal: silver, with a raised rim and a star, so that it can be seen to roll. */
const Medal = ({ part }: { part: RefObject<SVGGElement | null> }) => (
  <g ref={part} className={styles.medal} data-testid="cm-medal" style={{ opacity: 0 }}>
    <g className={styles.medalFace}>
      <circle r={R} fill="url(#cm-silver)" stroke="#5f6874" strokeWidth="1" />
      <circle r={R - 2.4} fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="0.9" />
      <path d="M 0 -4.6 L 1.3 -1.4 L 4.6 -1.3 L 2.1 0.8 L 2.9 4.1 L 0 2.3 L -2.9 4.1 L -2.1 0.8 L -4.6 -1.3 L -1.3 -1.4 Z" fill="#b8c0ca" stroke="#7d8692" strokeWidth="0.5" />
    </g>
  </g>
);

/** Little painted sweets on the backboard, where nothing runs. */
const Sweets = () => (
  <g aria-hidden="true" opacity="0.9">
    {/* A lollipop. */}
    <g transform="translate(64 58)">
      <line x1="0" y1="6" x2="0" y2="22" stroke="#d9b38c" strokeWidth="2" />
      <circle r="8" fill="#ffd1e1" stroke="#e85d8f" strokeWidth="1.2" />
      <path d="M 0 0 m -5 0 a 5 5 0 1 1 5 5 a 3.4 3.4 0 1 1 -3.4 -3.4 a 1.8 1.8 0 1 1 1.8 1.8" fill="none" stroke="#e85d8f" strokeWidth="1.2" />
    </g>
    {/* A wrapped sweet. */}
    <g transform="translate(216 150)">
      <path d="M -14 -5 L -8 0 L -14 5 Z M 14 -5 L 8 0 L 14 5 Z" fill="#ffb347" />
      <ellipse rx="9" ry="6" fill="#ffcf6b" stroke="#e0892b" strokeWidth="1" />
    </g>
    {/* A ramune bottle. */}
    <g transform="translate(84 226)">
      <path d="M -5 10 L -5 -2 Q -5 -6 -2 -8 L -2 -12 L 2 -12 L 2 -8 Q 5 -6 5 -2 L 5 10 Z" fill="#bfe9ff" stroke="#2c8fc9" strokeWidth="1" />
      <circle cy="-7" r="1.8" fill="#e9fbff" stroke="#2c8fc9" strokeWidth="0.6" />
    </g>
    {/* A stick of chewing gum. */}
    <g transform="translate(214 300) rotate(-12)">
      <rect x="-13" y="-5" width="26" height="10" rx="2" fill="#a5e3c4" stroke="#2e8b57" strokeWidth="1" />
      <rect x="-5" y="-5" width="10" height="10" fill="#ffffff" opacity="0.7" />
    </g>
  </g>
);

export interface MazeProps {
  t: CoinMazeStrings;
  label: string;
  parts: MazeParts;
  /** The gate the medal waits at, lit; null for none. */
  active: number | null;
  /** The pocket the last play ended in, lit; null for none. */
  hit: number | null;
}

/** The case. Memoised: what moves in it is moved on its elements, and it is drawn again only when what it lights changes. */
export const Maze = memo(function Maze({ t, label, parts, active, hit }: MazeProps) {
  return (
    <svg className={styles.mazeSvg} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} role="img" aria-label={label} focusable="false">
      <defs>
        <radialGradient id="cm-silver" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#d7dde4" />
          <stop offset="1" stopColor="#8d97a3" />
        </radialGradient>
        <radialGradient id="cm-knob" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ff8a80" />
          <stop offset="1" stopColor="#b71c1c" />
        </radialGradient>
        <pattern id="cm-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.7" fill="#f7c9d6" />
          <circle cx="13" cy="13" r="1.7" fill="#c9e7f7" />
        </pattern>
        <linearGradient id="cm-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.62" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="0.78" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The painted backboard. */}
      <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="#fff6e3" />
      <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="url(#cm-dots)" />
      <Sweets />

      {/* The slot at the top. */}
      <g aria-hidden="true">
        <rect x={SLOT.x - 16} y={SLOT.y - 9} width="32" height="10" rx="3" fill="#3b4350" />
        <rect x={SLOT.x - 11} y={SLOT.y - 6} width="22" height="3.2" rx="1.6" fill="#11151a" />
        <text x={SLOT.x + 22} y={SLOT.y} className={styles.boardText} textAnchor="start">
          {t.slotLabel} ▼
        </text>
      </g>

      {/* The shelves. */}
      {SHELVES.map((shelf, s) => (
        <g key={`shelf-${s}`} aria-hidden="true">
          <line x1={shelf.from.x} y1={shelf.from.y + 1.6} x2={shelf.to.x} y2={shelf.to.y + 1.6} stroke="#6b4a2b" strokeWidth="4" strokeLinecap="round" />
          <line x1={shelf.from.x} y1={shelf.from.y} x2={shelf.to.x} y2={shelf.to.y} stroke="#e9c27d" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}

      {/* The OUT holes under the gates. */}
      {HOLES.map((hole, s) => (
        <g key={`hole-${s}`} aria-hidden="true">
          <rect x={hole.x - HOLE_W / 2} y={hole.y - 6} width={HOLE_W} height="12" rx="6" fill="#151a21" />
          <text x={hole.x + (SIDES[s] === 'right' ? -HOLE_W / 2 - 3 : HOLE_W / 2 + 3)} y={hole.y + 4} className={styles.outText} textAnchor={SIDES[s] === 'right' ? 'end' : 'start'}>
            {t.outLabel}
          </text>
        </g>
      ))}

      {/* The cups, their strikers and knobs, their lamps, and the gates. */}
      {Array.from({ length: STAGES }, (_, s) => (
        <g key={`stage-${s}`} data-stage={s} data-active={active === s ? 'true' : 'false'} className={styles.stage}>
          <circle cx={CUPS[s].x} cy={CUPS[s].y} r={R + 7} className={styles.cupGlow} aria-hidden="true" />
          <Cup s={s} />
          <Striker s={s} part={parts.strikers[s]} />
          <Knob s={s} />
          <Lamps s={s} part={parts.lamps[s]} />
          <Gate s={s} part={parts.gates[s]} />
          <text x={SIDES[s] === 'right' ? CUPS[s].x - 4 : CUPS[s].x + 4} y={CUPS[s].y - 28} className={styles.gateNumber} textAnchor={SIDES[s] === 'right' ? 'end' : 'start'} aria-hidden="true">
            {s + 1}
          </text>
        </g>
      ))}

      {/* The pins. */}
      <g aria-hidden="true">
        {PINS.map((pin, i) => (
          <g key={`pin-${i}`}>
            <circle cx={pin.x} cy={pin.y} r={PIN_R + 0.8} fill="#7a5a1a" />
            <circle cx={pin.x - 0.6} cy={pin.y - 0.6} r={PIN_R - 0.6} fill="#f2d27a" />
          </g>
        ))}
      </g>

      {/* The pockets. */}
      <g aria-label={t.pocketsLabel} role="img">
        {POCKETS.map((pocket, k) => {
          const x = POCKET_X[k] - POCKET_W / 2;
          const paint = POCKET_PAINT[pocket];
          return (
            <g key={`pocket-${k}`} data-pocket={pocket} data-hit={hit === k ? 'true' : 'false'} className={styles.pocket}>
              <rect x={x + 1} y={POCKET_TOP} width={POCKET_W - 2} height={BOARD_H - POCKET_TOP - 3} rx="4" fill={paint.fill} className={styles.pocketBody} />
              <text x={POCKET_X[k]} y={POCKET_TOP + 11} className={styles.pocketText} textAnchor="middle" fill={paint.text}>
                {t.pocketShort(pocket)}
              </text>
              {t.pocketPays(pocket) && (
                <text x={POCKET_X[k]} y={POCKET_TOP + 21} className={styles.pocketText} textAnchor="middle" fill={paint.text}>
                  {t.pocketPays(pocket)}
                </text>
              )}
            </g>
          );
        })}
      </g>

      <Medal part={parts.medal} />

      {/* The glass over it all. */}
      <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="url(#cm-glass)" pointerEvents="none" />
    </svg>
  );
});
