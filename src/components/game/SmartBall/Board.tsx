'use client';

import { memo, type RefObject } from 'react';
import { HOLES, LINES, SIZE, numberOf } from './engine';
import type { SmartBallStrings } from './i18n';
import { ARC, BOARD_H, BOARD_W, GAP_X, GUARD_DX, GUARD_DY, GUTTER_Y, DRAIN, HOLE_R, LANE_WALL, LANE_X, LEAVE, MR, PIN_R, PIN_ROWS, PLUNGER_TIP, REST, ROW_Y, holeXY } from './scene';
import styles from './SmartBall.module.css';

/**
 * The table under its glass: the painted board with its hot-spring scene, the rail and the lane, the plunger, the pins,
 * the sixteen numbered holes and the OUT gutter, the marbles lit in their holes, and the marble on its way. What moves
 * (the marble, the plunger and the rail's lamps) is moved by the page straight on the elements it is handed (`parts`), a
 * frame at a time, without drawing the board again.
 */

/** The elements the page moves. */
export interface BoardParts {
  marble: RefObject<SVGGElement | null>;
  plunger: RefObject<SVGGElement | null>;
  lamps: RefObject<SVGGElement | null>;
}

/** The plate under the rail that says what the lines pay. */
const PLATE = { x: 96, y: 80, w: 108, h: 70 } as const;

/** Each column's paint round its holes, left to right: vermilion, indigo, saffron, leaf green, as the rings on a real board are painted. */
const RING_PAINT = ['#d8452b', '#3949ab', '#e0a116', '#2e8b57'] as const;

/** A glass marble's look, drawn at the origin: blue glass, a swirl inside that turns as it rolls, and a fixed glint. */
const MarbleLook = () => (
  <>
    <circle r={MR} fill="url(#smb-glass)" stroke="#123a7a" strokeWidth="0.8" />
    <g data-swirl="">
      <path d="M -4.6 1.2 C -2.6 -3.8 2.4 -4.4 4.4 -1.4" fill="none" stroke="#bfe3ff" strokeOpacity="0.75" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M -3.2 3.4 C -0.6 1.4 1.8 2.6 3.6 3" fill="none" stroke="#6fb6ff" strokeOpacity="0.6" strokeWidth="1" strokeLinecap="round" />
    </g>
    <ellipse cx="-2.4" cy="-2.8" rx="2.3" ry="1.5" fill="#ffffff" fillOpacity="0.85" />
  </>
);

/** The scene painted on the board under the rail: far mountains, a red sun, and the steam of the springs either side of the plate. */
const Mural = () => (
  <g aria-hidden="true" opacity="0.85">
    <path d="M 24 152 L 52 116 L 74 134 L 100 104 L 132 140 L 168 112 L 200 138 L 228 108 L 262 152 Z" fill="#cfe3d2" />
    <path d="M 24 152 L 46 136 L 66 146 L 90 128 L 118 150 Z" fill="#b7d4bc" />
    <circle cx="62" cy="96" r="9" fill="#f19a7f" />
    {/* The steam: wisps rising off the spring at either side of the plate. */}
    {[74, 228].map((x) => (
      <path key={x} d={`M ${x} 152 c -7 -9 7 -14 0 -24 c -6 -9 5 -13 1 -21`} fill="none" stroke="#ffffff" strokeOpacity="0.95" strokeWidth="3" strokeLinecap="round" />
    ))}
  </g>
);

/** The plunger at the foot of the lane: its tip under the marble, the spring, the rod down into the housing. */
const Plunger = ({ part }: { part: RefObject<SVGGElement | null> }) => {
  const coil = Array.from({ length: 7 }, (_, i) => `L ${LANE_X + (i % 2 === 0 ? 6 : -6)} ${PLUNGER_TIP + 6 + i * 4}`).join(' ');
  return (
    <g aria-hidden="true">
      {/* The housing the rod runs in. */}
      <rect x={LANE_X - 10} y={PLUNGER_TIP + 2} width="20" height={BOARD_H - PLUNGER_TIP} rx="3" fill="#2a2f36" />
      <g ref={part} className={styles.plunger}>
        <path d={`M ${LANE_X} ${PLUNGER_TIP + 4} ${coil} L ${LANE_X} ${PLUNGER_TIP + 6 + 7 * 4}`} fill="none" stroke="#c9d1da" strokeWidth="1.5" />
        <rect x={LANE_X - 2} y={PLUNGER_TIP} width="4" height={BOARD_H} fill="url(#smb-chrome)" />
        <rect x={LANE_X - 7} y={PLUNGER_TIP} width="14" height="5" rx="2" fill="#c62828" stroke="#6b1010" strokeWidth="0.8" />
      </g>
    </g>
  );
};

/**
 * Where the rail's lamps stand, one where each strength rolls off the rail, numbered 1 to 7: their middles and their
 * numbers' baselines. Written to two places: the server's and the browser's trigonometry differ in the last bits, and
 * the page must be drawn the same by both.
 */
const LAMP_SPOTS = LEAVE.map((theta) => {
  const y = ARC.y - (ARC.r - 17) * Math.sin(theta);
  return { x: (ARC.x + (ARC.r - 17) * Math.cos(theta)).toFixed(2), y: y.toFixed(2), baseline: (y + 4.3).toFixed(2) };
});

/** A lamp of the rail: its glass and its number. */
const Lamp = ({ w, fill }: { w: number; fill?: string }) => (
  <>
    <circle cx={LAMP_SPOTS[w].x} cy={LAMP_SPOTS[w].y} r="8" className={styles.lamp} style={fill ? { fill } : undefined} />
    <text x={LAMP_SPOTS[w].x} y={LAMP_SPOTS[w].baseline} textAnchor="middle" className={styles.lampNumber}>
      {w + 1}
    </text>
  </>
);

/** The rail's lamps: the page lights the one the plunger is drawn to. */
const RailLamps = ({ part }: { part: RefObject<SVGGElement | null> }) => (
  <g ref={part} className={styles.lamps} data-window="" aria-hidden="true">
    {LAMP_SPOTS.map((_, w) => (
      <g key={w} data-lamp={w}>
        <Lamp w={w} />
      </g>
    ))}
  </g>
);

/** A lamp's radius to the outside of its rim: its glass, 8, and half its 1-unit outline. */
const LAMP_RIM = 8.5;
/** The lamps' colours in the attract run: lit, and dark after it has passed (darker than at rest). */
export const CHASE_LIT = '#ffdd33';
export const CHASE_DARK = '#6b5a3a';

/** The pictures of the attract run, in the order they are drawn: every lamp at rest, then every lamp lit and dark. */
const CHASE_PICTURES = [
  ...LAMP_SPOTS.map((_, w) => ({ w, state: 'rest' as const })),
  ...LAMP_SPOTS.flatMap((_, w) => (['lit', 'dark'] as const).map((state) => ({ w, state }))),
];

/**
 * The rail's lamps as they run on their own while the machine stands unplayed (the attract run), drawn over the board:
 * each lamp three times (as it is at rest, lit, and dark after it has passed), each in a picture of its own, shown and
 * hidden by opacity (SmartBall.module.css). The browser runs that on the compositor, so the run paints nothing: run on
 * the board's own lamps, each step of it repainted the board (two to five percent of a phone's main thread while the
 * machine stood unplayed). Every picture is the board's own drawing of the lamp, with the glass's glare over it as over
 * the board, in a picture the board's size: a browser draws an SVG on whole pixels, and one the board's size and place
 * lands on them as the board does, so the lamp is drawn exactly where the board draws it. The board's own lamps are
 * hidden while the run is on.
 */
export const ChaseLamps = memo(function ChaseLamps() {
  return (
    <div className={styles.chase} aria-hidden="true">
      {/* The pictures at rest first: they are not run by the compositor, and drawn under the ones that are, they are
          drawn with the board, as its own lamps are. */}
      {CHASE_PICTURES.map(({ w, state }) => {
        const spot = LAMP_SPOTS[w];
        return (
          <svg key={`${w}-${state}`} className={styles.chaseState} data-chase={w} data-state={state} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} focusable="false">
            <clipPath id={`smb-chase-${w}-${state}`}>
              <circle cx={spot.x} cy={spot.y} r={LAMP_RIM} />
            </clipPath>
            <Lamp w={w} fill={state === 'lit' ? CHASE_LIT : state === 'dark' ? CHASE_DARK : undefined} />
            {/* The glass's glare, as it lies over the board, on the lamp alone: the board under this picture has its own. */}
            <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="url(#smb-glare)" clipPath={`url(#smb-chase-${w}-${state})`} />
          </svg>
        );
      })}
    </div>
  );
});

/** The marble the page moves: on the plunger, or on its way. Hidden until there is one. */
const Marble = ({ part }: { part: RefObject<SVGGElement | null> }) => (
  <g ref={part} className={styles.marble} data-testid="smb-marble" style={{ opacity: 0 }} transform={`translate(${REST.x} ${REST.y})`}>
    <g>
      <MarbleLook />
    </g>
  </g>
);

export interface BoardProps {
  t: SmartBallStrings;
  label: string;
  parts: BoardParts;
  /** The holes lit (as bits), each with its marble in it. */
  lit: number;
  /** The lines lit, by their place in `LINES`. */
  lines: readonly number[];
  /** How many lines the pay plate lights. */
  plate: number;
}

/** The board. Memoised: what moves on it is moved on its elements, and it is drawn again only when what it lights changes. */
export const Board = memo(function Board({ t, label, parts, lit, lines, plate }: BoardProps) {
  const railOuter = ARC.r + MR + 1.5;
  return (
    <svg className={styles.boardSvg} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} role="img" aria-label={label} focusable="false">
      <defs>
        <radialGradient id="smb-glass" cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#9fd0ff" />
          <stop offset="0.45" stopColor="#3f8ae0" />
          <stop offset="1" stopColor="#123f8f" />
        </radialGradient>
        <linearGradient id="smb-chrome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7d8794" />
          <stop offset="0.45" stopColor="#f3f6f9" />
          <stop offset="1" stopColor="#7d8794" />
        </linearGradient>
        <radialGradient id="smb-brass" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="1" stopColor="#a5781c" />
        </radialGradient>
        <radialGradient id="smb-hole" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#050505" />
          <stop offset="0.75" stopColor="#1d140c" />
          <stop offset="1" stopColor="#4a3420" />
        </radialGradient>
        <pattern id="smb-grain" width="300" height="14" patternUnits="userSpaceOnUse">
          <path d="M 0 4 Q 75 1 150 5 T 300 4" fill="none" stroke="#e7d7b2" strokeWidth="1" />
          <path d="M 0 11 Q 90 13 170 10 T 300 11" fill="none" stroke="#efe2c3" strokeWidth="0.8" />
        </pattern>
        <linearGradient id="smb-glare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.26" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.68" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.76" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The painted board, its grain under the paint. */}
      <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="#f7efd9" />
      <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="url(#smb-grain)" />
      <Mural />

      {/* What the lines pay, painted on a plate under the rail; the line the board stands at lit. */}
      <g aria-hidden="true" className={styles.payPlate} data-lines={plate}>
        <rect x={PLATE.x} y={PLATE.y} width={PLATE.w} height={PLATE.h} rx="9" fill="#7a1f12" fillOpacity="0.92" stroke="#e8c36a" strokeWidth="1.6" />
        <text x={PLATE.x + PLATE.w / 2} y={PLATE.y + 16} textAnchor="middle" className={styles.plateTitle}>
          {t.payPlateTitle}
        </text>
        {t.payPlate.map(([words, pays], i) => (
          <g key={words} className={styles.plateLine} data-on={plate === i + 1 ? 'true' : 'false'}>
            <text x={PLATE.x + 10} y={PLATE.y + 32 + i * 15}>
              {words}
            </text>
            <text x={PLATE.x + PLATE.w - 10} y={PLATE.y + 32 + i * 15} textAnchor="end">
              {pays}
            </text>
          </g>
        ))}
      </g>

      {/* The rail round the top, and the lane up the right-hand side. */}
      <g aria-hidden="true">
        <path d={`M ${ARC.x + railOuter} ${ARC.y + 4} A ${railOuter} ${railOuter} 0 0 0 ${ARC.x - railOuter} ${ARC.y} L ${ARC.x - railOuter} ${GUTTER_Y - 14}`} fill="none" stroke="url(#smb-chrome)" strokeWidth="4" />
        <path d={`M ${ARC.x + railOuter} ${ARC.y + 4} L ${ARC.x + railOuter} ${BOARD_H}`} fill="none" stroke="url(#smb-chrome)" strokeWidth="4" />
        <path d={`M ${LANE_WALL} ${ARC.y + 18} L ${LANE_WALL} ${GUTTER_Y - 4}`} fill="none" stroke="url(#smb-chrome)" strokeWidth="3.4" strokeLinecap="round" />
      </g>

      {/* The rail's lamps: where each strength rolls off it, the one the plunger is drawn to lit. */}
      <RailLamps part={parts.lamps} />

      {/* The two rows of pins under the rail. */}
      <g aria-hidden="true">
        {PIN_ROWS.flatMap((row) =>
          row.xs.map((x) => (
            <g key={`${x}-${row.y}`}>
              <circle cx={x} cy={row.y} r={PIN_R + 0.8} fill="#6a4c12" />
              <circle cx={x - 0.5} cy={row.y - 0.5} r={PIN_R} fill="url(#smb-brass)" />
            </g>
          )),
        )}
      </g>

      {/* The lines lit: a gold band through each line's four holes. */}
      <g aria-hidden="true">
        {lines.map((i) => {
          const [a, , , d] = LINES[i].holes;
          const from = holeXY(a);
          const to = holeXY(d);
          return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={styles.lineBand} data-line={i} />;
        })}
      </g>

      {/* The sixteen holes, each in its painted ring with its guard pins and its number. */}
      <g data-testid="smb-holes">
        {Array.from({ length: HOLES }, (_, hole) => {
          const { x, y } = holeXY(hole);
          const on = (lit & (1 << hole)) !== 0;
          const col = hole % SIZE;
          return (
            <g key={hole} data-hole={hole} data-lit={on ? 'true' : 'false'} className={styles.hole}>
              <circle cx={x} cy={y} r={HOLE_R + 5} fill={RING_PAINT[col]} className={styles.ring} />
              <circle cx={x} cy={y} r={HOLE_R + 5} className={styles.ringGlow} />
              <circle cx={x} cy={y} r={HOLE_R} fill="url(#smb-hole)" />
              {[-1, 1].map((side) => (
                <g key={side} aria-hidden="true">
                  <circle cx={x + side * GUARD_DX} cy={y - GUARD_DY} r={PIN_R + 0.8} fill="#6a4c12" />
                  <circle cx={x + side * GUARD_DX - 0.5} cy={y - GUARD_DY - 0.5} r={PIN_R} fill="url(#smb-brass)" />
                </g>
              ))}
              <text x={x} y={y + HOLE_R + 18} textAnchor="middle" className={styles.holeNumber} aria-hidden="true">
                {numberOf(hole)}
              </text>
              {on && (
                <g transform={`translate(${x} ${y}) scale(0.9)`} className={styles.litMarble}>
                  <MarbleLook />
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* The gaps' runs down to the gutter, faint, and the gutter itself. */}
      <g aria-hidden="true">
        {GAP_X.map((x) => (
          <line key={x} x1={x} y1={ROW_Y[0] - 10} x2={x} y2={GUTTER_Y - 12} stroke="#e6d6ad" strokeWidth="1.2" strokeDasharray="2 6" />
        ))}
        <rect x="6" y={GUTTER_Y - 11} width={LANE_WALL - 6} height="22" rx="10" fill="#3a2a1a" />
        <rect x="9" y={GUTTER_Y - 8} width={LANE_WALL - 12} height="16" rx="8" fill="#20160c" />
        <circle cx={DRAIN.x} cy={DRAIN.y} r="7" fill="#050505" />
        <text x={(6 + LANE_WALL) / 2} y={GUTTER_Y + 5} textAnchor="middle" className={styles.outText}>
          {t.outLabel}
        </text>
      </g>

      <Plunger part={parts.plunger} />

      {/* The marble on its way (or on the plunger). */}
      <Marble part={parts.marble} />

      {/* The glass over it all. */}
      <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="url(#smb-glare)" pointerEvents="none" />
    </svg>
  );
});
