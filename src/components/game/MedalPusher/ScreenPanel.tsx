'use client';

import { Fragment, useState, type CSSProperties } from 'react';
import type { PusherStrings } from './i18n';
import { BOWLS, CHAIN_GOAL, FEVER_SQUARE, ROULETTE, TIER_BONUS, type BowlHole } from './lottery';
import { ReelSymbol, tierOfDigit } from './ReelSymbols';
import {
  BOARD_SQUARES,
  BOWL_SHAPE,
  REEL_DIGITS,
  bowlBall,
  holeSpot,
  type BallSpot,
  type Banner,
  type BowlPoint,
  type ChestView,
  type ScreenState,
} from './screen';
import { MAX_STOCK } from './session';
import styles from './MedalPusher.module.css';

/** The digits the reels show before the first spin. */
export const IDLE_DIGITS: [number, number, number] = [3, 5, 8];

/** A value the stylesheet works a transform out from. */
const cssVars = (vars: Record<`--mp-${string}`, string | number>) => vars as CSSProperties;

// ── The reels ───────────────────────────────────────────────────────────────

/** A reel is a drum with the nine symbols on its faces: how far round it is from one to the next, in degrees. The stylesheet stands the faces this far apart. */
const FACE_TURN = 360 / REEL_DIGITS.length;

/**
 * The CSS transform that turns a reel's strip so that `position` along
 * REEL_DIGITS is on the pay line. The symbols come down the window as the
 * position grows.
 */
export const stripOffset = (position: number): string => `rotateX(${(-position * FACE_TURN).toFixed(2)}deg)`;

/**
 * Marks a reel's strip for the stylesheet: `fast` while it runs too fast to
 * read and is drawn blurred, `waiting` while it stands dimmed, when nothing
 * may move, with its digit still to come. Written only when it changes.
 */
export const markStrip = (strip: { dataset: DOMStringMap }, mark: 'fast' | 'waiting', on: boolean): void => {
  const value = String(on);
  if (strip.dataset[mark] !== value) strip.dataset[mark] = value;
};

// ── Medals ──────────────────────────────────────────────────────────────────

/** A pile of medals as the screen draws it, in the units of its view box: how wide a medal is, how thick, and how flat it looks from where it is seen. */
const MEDAL = { across: 22, thick: 3.2, flat: 4.2 } as const;

/** A stack of `coins` medals seen a little from above: a medal or two is a small prize, a tall stack a tower. */
const Heap = ({ coins }: { coins: number }) => {
  const height = coins * MEDAL.thick + 2 * MEDAL.flat + 1;
  /** The outline of a medal with `under` medals beneath it. Each is drawn over the one below, so only its edge shows. */
  const medal = (under: number) => ({
    cx: MEDAL.across / 2 + 1,
    cy: (height - MEDAL.flat - 0.5 - under * MEDAL.thick).toFixed(1),
    rx: MEDAL.across / 2,
    ry: MEDAL.flat,
    stroke: '#6b4300',
    strokeWidth: 0.9,
  });
  return (
    <svg className={styles.heap} viewBox={`0 0 ${MEDAL.across + 2} ${height.toFixed(1)}`} data-coins={coins}>
      {Array.from({ length: coins }, (_, coin) => (
        <ellipse key={coin} {...medal(coin)} fill="#c9900a" />
      ))}
      {coins > 0 && (
        <>
          {/* The face of the top one. */}
          <ellipse {...medal(coins)} fill="#ffd65c" />
          <ellipse {...medal(coins)} rx={MEDAL.across / 2 - 3.5} ry={MEDAL.flat - 1.5} fill="#fff3b0" stroke="none" />
        </>
      )}
    </svg>
  );
};

// ── The sugoroku board ──────────────────────────────────────────────────────

/**
 * The board is a loop laid out on a grid three rows deep: along the front
 * from left to right, round the right-hand end, back along the far side and
 * round the left-hand end. This many squares lie along each long side.
 */
const BOARD_SIDE = (BOARD_SQUARES.length - 2) / 2;
const BOARD_GRID = { columns: BOARD_SIDE + 2, rows: 3 } as const;

/** The column and row of a square on that grid: column 0 is the left-hand end, row 0 the far side. */
export function squarePlace(square: number): { column: number; row: number } {
  if (square < BOARD_SIDE) return { column: square + 1, row: 2 };
  if (square === BOARD_SIDE) return { column: BOARD_GRID.columns - 1, row: 1 };
  if (square <= 2 * BOARD_SIDE) return { column: 2 * BOARD_SIDE + 1 - square, row: 0 };
  return { column: 0, row: 1 };
}

/** Medals in the stack that stands on a square: more for a square that pays more, and a tower on the fever. */
const squareCoins = (medals: number): number => Math.max(1, Math.round(medals / 2.5));

/** The line the piece walks, through the middle of every square, in the units of the board's grid. */
const TRACK = BOARD_SQUARES.map((_, square) => {
  const { column, row } = squarePlace(square);
  return `${column + 0.5},${row + 0.5}`;
}).join(' ');

type Vector = [number, number, number];

/**
 * The die is a cube standing on the board: x runs to the right, y towards the
 * player and z up off the board. This is the way each face looks out of it as
 * the stylesheet builds it, opposite faces adding up to seven, and the quarter
 * turns that bring each face to the top.
 */
const DIE_OUT: Record<number, Vector> = { 1: [0, 0, 1], 6: [0, 0, -1], 5: [0, 1, 0], 2: [0, -1, 0], 3: [1, 0, 0], 4: [-1, 0, 0] };
const DIE_UP: Record<number, { axis: 'X' | 'Y'; degrees: number }> = {
  1: { axis: 'X', degrees: 0 },
  6: { axis: 'X', degrees: 180 },
  5: { axis: 'X', degrees: 90 },
  2: { axis: 'X', degrees: -90 },
  3: { axis: 'Y', degrees: -90 },
  4: { axis: 'Y', degrees: 90 },
};
/** How far the die lies turned on the board, in degrees, so that it is seen corner on and not square. */
const DIE_YAW = -20;

/** The CSS transform that lays the die down with `face` on top. */
export const dieTurn = (face: number): string => {
  const { axis, degrees } = DIE_UP[face] ?? DIE_UP[1];
  return `rotateZ(${DIE_YAW}deg) rotate${axis}(${degrees}deg)`;
};

/** A direction turned about an axis the way CSS turns it. */
function turned([x, y, z]: Vector, axis: 'X' | 'Y' | 'Z', degrees: number): Vector {
  const cos = Math.cos((degrees * Math.PI) / 180);
  const sin = Math.sin((degrees * Math.PI) / 180);
  if (axis === 'X') return [x, y * cos - z * sin, y * sin + z * cos];
  if (axis === 'Y') return [x * cos + z * sin, y, -x * sin + z * cos];
  return [x * cos - y * sin, x * sin + y * cos, z];
}

/**
 * How the light falls on the face showing `value` once `face` has been rolled:
 * the top is lit, the two sides the player can see are in more and more
 * shadow, and the rest are turned away.
 */
export function dieShade(face: number, value: number): 'top' | 'front' | 'side' | 'away' {
  const { axis, degrees } = DIE_UP[face] ?? DIE_UP[1];
  const [, towards, up] = turned(turned(DIE_OUT[value], axis, degrees), 'Z', DIE_YAW);
  if (Math.abs(up) > 0.9) return up > 0 ? 'top' : 'away';
  return towards > 0.7 ? 'front' : towards > 0 ? 'side' : 'away';
}

/** Where the dots of each face of a die sit, on a 3 × 3 grid counted from the top left. */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const DIE_VALUES = [1, 2, 3, 4, 5, 6];

/** The die: a cube that tumbles while it is rolling and comes to rest with the face that was rolled on top. */
const Die = ({ face, rolling }: { face: number; rolling: boolean }) => (
  <span className={styles.dieSpot} aria-hidden>
    <span className={styles.dieShadow} />
    <span className={styles.die} data-rolling={rolling} data-testid="pusher-die" data-face={face} style={cssVars({ '--mp-die-turn': dieTurn(face) })}>
      {DIE_VALUES.map((value) => (
        <svg key={value} className={styles.dieFace} viewBox="0 0 100 100" data-pips={value} data-shade={rolling ? 'side' : dieShade(face, value)}>
          <rect className={styles.dieBody} x="3" y="3" width="94" height="94" rx="16" />
          {PIPS[value].map((cell) => (
            <circle key={cell} cx={26 + (cell % 3) * 24} cy={26 + Math.floor(cell / 3) * 24} r={value === 1 ? 13 : 9} fill={value === 1 ? '#d61f4c' : '#1b1140'} />
          ))}
        </svg>
      ))}
    </span>
  </span>
);

/** The playing piece, standing. */
const Pawn = () => (
  <svg className={styles.pawn} viewBox="0 0 24 34">
    <ellipse cx="12" cy="30" rx="10" ry="3.6" fill="#8a0d45" />
    <path d="M3.5 29.5 Q12 6 20.5 29.5 Q12 33.5 3.5 29.5 Z" fill="#ff4f9a" stroke="#6b0835" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="12" cy="9" r="7" fill="#ff7cc0" stroke="#6b0835" strokeWidth="1.4" />
    <circle cx="9.6" cy="6.6" r="2.2" fill="#ffe0f1" />
  </svg>
);

/**
 * The sugoroku board, lying on the stage in front of whatever stands on it:
 * twelve tiles on a loop, a stack of medals on each for what it pays, and the
 * piece on the square it has reached. While the slot is on, the board is seen
 * low across the front of the stage; the stylesheet lifts the view over it
 * when a roll begins, and the die is thrown into the middle of the loop.
 */
const Board = ({ state, strings: t }: { state: ScreenState; strings: PusherStrings }) => {
  // Each move of the piece is one hop. The two halves of the count take turns, so that the stylesheet starts a new hop for each.
  const [walk, setWalk] = useState({ square: state.square, hops: 0 });
  if (walk.square !== state.square) setWalk({ square: state.square, hops: walk.hops + 1 });
  const here = squarePlace(state.square);
  return (
    <div className={styles.boardScene}>
      <div className={styles.boardPlane} style={cssVars({ '--mp-columns': BOARD_GRID.columns, '--mp-rows': BOARD_GRID.rows })}>
        <svg className={styles.track} viewBox={`0 0 ${BOARD_GRID.columns} ${BOARD_GRID.rows}`} preserveAspectRatio="none" aria-hidden>
          <polygon points={TRACK} />
        </svg>
        <ol className={styles.board} aria-label={t.boardAria(state.square + 1, BOARD_SQUARES[state.square])} data-testid="pusher-board" data-square={state.square}>
          {BOARD_SQUARES.map((medals, index) => {
            const { column, row } = squarePlace(index);
            return (
              <li
                key={index}
                className={styles.square}
                style={cssVars({ '--mp-column': column, '--mp-row': row })}
                data-here={index === state.square}
                data-fever={index === FEVER_SQUARE}
                aria-hidden
              >
                <span className={styles.squareUp}>
                  <Heap coins={squareCoins(medals)} />
                  <span className={styles.squarePays}>
                    {index === FEVER_SQUARE ? <span className={styles.squareTag}>{t.feverTag}</span> : null}
                    {medals}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <span className={styles.piece} style={cssVars({ '--mp-column': here.column, '--mp-row': here.row })} aria-hidden>
          <span className={styles.pieceUp}>
            <span className={styles.pieceHop} data-hop={walk.hops === 0 ? 'none' : walk.hops % 2 === 1 ? 'odd' : 'even'}>
              <Pawn />
            </span>
          </span>
        </span>
        {state.mode === 'sugoroku' && state.die > 0 && <Die face={state.die} rolling={state.rolling} />}
      </div>
    </div>
  );
};

// ── The treasure chests ─────────────────────────────────────────────────────

/**
 * One chest, as a box: four walls, the gold inside, and a lid of three planks
 * that swings back on its hinge. What it holds stands on its front as a
 * question mark until it is open, and then rises out of it.
 */
const Chest = ({ view }: { view: ChestView }) => (
  <span className={styles.chestScene} aria-hidden>
    <span className={styles.chestShadow} />
    <span className={styles.chestBox}>
      <span className={styles.chestWall} data-wall="back" />
      <span className={styles.chestWall} data-wall="left" />
      <span className={styles.chestWall} data-wall="right" />
      <span className={styles.chestGold} />
      <span className={styles.chestWall} data-wall="front" />
      <span className={styles.chestLid}>
        <span className={styles.chestLining} />
        <span className={styles.chestPlank} data-plank="back" />
        <span className={styles.chestPlank} data-plank="top" />
        <span className={styles.chestPlank} data-plank="front" />
        <span className={styles.chestEnd} data-end="left" />
        <span className={styles.chestEnd} data-end="right" />
      </span>
      <span className={styles.chestPrize}>{view.prize ?? '?'}</span>
    </span>
  </span>
);

// ── The roulette ────────────────────────────────────────────────────────────

/** Where a pocket's number stands and where its lamp sits on the rim, as shares of the wheel's radius from its middle. */
const POCKET_AT = 0.68;
const LAMP_AT = 0.965;
/** The most medals the run's tower is drawn with, and the medals of the run that each one stands for. */
const TOWER = { coins: 14, each: 10 } as const;

/** The point of the wheel `radius` from its middle on pocket `index`, as percentages of its box: the first pocket is at the far side. */
function wheelPoint(index: number, radius: number): [number, number] {
  const angle = ((index / ROULETTE.length) * 2 - 0.5) * Math.PI;
  return [50 + Math.cos(angle) * radius * 50, 50 + Math.sin(angle) * radius * 50];
}

/** That point as CSS places it in the wheel's box. */
const onWheel = (index: number, radius: number): CSSProperties => {
  const [x, y] = wheelPoint(index, radius);
  return { left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%` };
};

/**
 * The roulette as a wheel lying on the stage: twelve pockets with their
 * numbers standing in them and a lamp on the rim for each. The light runs
 * round from lamp to lamp, and the pocket it is on is bright. A cross ends the run.
 */
const Wheel = ({ lit }: { lit: number }) => (
  <div className={styles.dishScene}>
    <div className={styles.dishTilt}>
      <span className={styles.dishShadow} />
      <span className={styles.dishSide} />
      <svg className={styles.wheel} viewBox="0 0 100 100" data-testid="pusher-wheel" data-lit={lit}>
        <circle cx="50" cy="50" r="50" fill="#12061f" />
        {ROULETTE.map((pocket, index) => {
          const [x1, y1] = wheelPoint(index - 0.5, 0.92);
          const [x2, y2] = wheelPoint(index + 0.5, 0.92);
          const on = lit === index;
          const stop = pocket === 'stop';
          return (
            <g key={index} data-pocket={index} data-lit={on}>
              <path
                d={`M50 50 L${x1.toFixed(2)} ${y1.toFixed(2)} A46 46 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`}
                fill={on ? (stop ? '#ff6b81' : '#ffd65c') : stop ? '#5c0f22' : index % 2 === 0 ? '#3a2a82' : '#231560'}
                stroke="#0a0520"
                strokeWidth="0.7"
              />
            </g>
          );
        })}
        <circle cx="50" cy="50" r="46" fill="none" stroke="#0a0520" strokeWidth="1" />
        <circle cx="50" cy="50" r="48.3" fill="none" stroke="#ffd65c" strokeWidth="3.4" />
        <circle cx="50" cy="50" r="48.3" fill="none" stroke="#fff3b0" strokeWidth="0.9" />
        <circle cx="50" cy="50" r="20" fill="#0a0520" stroke="#ffd65c" strokeWidth="1.6" />
      </svg>
      <span className={styles.dishHub} />
      {ROULETTE.map((pocket, index) => {
        const stop = pocket === 'stop';
        const on = lit === index;
        return (
          <Fragment key={index}>
            <span className={styles.rimLamp} style={onWheel(index, LAMP_AT)} data-on={on} />
            <span className={styles.pocketLabel} style={onWheel(index, POCKET_AT)} data-stop={stop} data-on={on}>
              {stop ? '×' : pocket}
            </span>
          </Fragment>
        );
      })}
    </div>
  </div>
);

// ── The bowls ───────────────────────────────────────────────────────────────

/**
 * A bowl as it is drawn, in ems of the dish it lies in, where one em is the
 * dish's radius out to its rim: the radius of the bowl the ball rolls in, how
 * far towards the player its floor is drawn so that it looks sunk below the
 * rim, the ball's own radius as a share of the bowl's, and the share of its
 * size the ball loses as it sinks.
 */
const BOWL_VIEW = { radius: 0.84, sunk: 0.05, ball: 0.1, sink: 0.3 } as const;
/** How far one dish is below the one above it, in the same ems. */
const DISH_DROP = BOWL_SHAPE.drop * BOWL_VIEW.radius;

/**
 * The CSS transform that puts the ball on `spot`: so far across and down the
 * floor of its bowl, and as far below the top bowl as that bowl is, less
 * whatever it still has to fall.
 */
export function ballTransform(spot: BallSpot): string {
  const x = spot.x * BOWL_VIEW.radius;
  const y = spot.y * BOWL_VIEW.radius;
  const z = (spot.lift - spot.bowl * BOWL_SHAPE.drop) * BOWL_VIEW.radius;
  return `translate3d(${x.toFixed(3)}em, ${y.toFixed(3)}em, ${z.toFixed(3)}em) scale(${(1 - BOWL_VIEW.sink * spot.sunk).toFixed(3)})`;
}

/** The CSS transform that keeps the ball's shadow on the floor while the ball is in the air over it. */
export const shadowTransform = (spot: BallSpot): string => `translateZ(${(-spot.lift * BOWL_VIEW.radius).toFixed(3)}em)`;

/** Moves the ball the cabinet was handed to `spot`, and its shadow, which is the first thing in it, with it. */
export function placeBall(ball: HTMLElement, spot: BallSpot): void {
  ball.style.transform = ballTransform(spot);
  const shadow = ball.firstElementChild;
  if (shadow instanceof HTMLElement) shadow.style.transform = shadowTransform(spot);
}

/** The ball's radius and the drop from dish to dish, for the stylesheet. */
const BOWL_SIZES = cssVars({ '--mp-ball': `${(BOWL_VIEW.ball * BOWL_VIEW.radius).toFixed(4)}em`, '--mp-drop': `${DISH_DROP.toFixed(4)}em` });

/** A point of a bowl's floor as CSS places it in the dish's box: how far across, and how far down. */
const onFloor = ({ x, y }: BowlPoint): CSSProperties => ({
  left: `${(50 + x * BOWL_VIEW.radius * 50).toFixed(2)}%`,
  top: `${(50 + (y * BOWL_VIEW.radius + BOWL_VIEW.sunk) * 50).toFixed(2)}%`,
});

/**
 * What a hole does is painted on the floor of its bowl, where the ball rolls
 * over it and nothing hides the ball. It is beside the hole on the player's
 * side, `below` it, and so clear of the lip the ball comes to rest on, which
 * is straight out from the hole; for a hole at the far side or in the middle,
 * where the boss or the hole itself is in the way, it is `beyond` it instead.
 * It is `size` high and drawn `tall` times taller than it is, since the dish
 * is seen at a slant and what lies on it looks squashed.
 */
const HOLE_LABEL = { below: 0.35, beyond: 0.42, size: 0.22, tall: 1.4 } as const;
function labelSpot(hole: number, bowl: number): BowlPoint {
  const { x, y } = holeSpot(hole, bowl);
  return Math.abs(x) < 0.01 ? { x: 0, y: y - HOLE_LABEL.beyond } : { x: x * 1.06, y: y + HOLE_LABEL.below };
}

/** The colours of each dish, the top one first: its floor, the ring inside that, and the floor the holes are in. */
const DISH_PAINT = [
  { floor: '#4a38a8', inner: '#35278c', well: '#211460' },
  { floor: '#a1285f', inner: '#7c1b48', well: '#4f0e2c' },
  { floor: '#d9a520', inner: '#b07c0a', well: '#7d5403' },
] as const;
/** The colour of a hole's edge and of what is written beside it, by what the hole does. */
const HOLE_PAINT = { down: '#7df0ff', prize: '#ffc2d0', jackpot: '#fffbe0' } as const;
const holeKind = (hole: BowlHole): keyof typeof HOLE_PAINT => (hole === 'down' || hole === 'jackpot' ? hole : 'prize');

/**
 * One bowl of the challenge: a dish with its holes, what each does written beside it, and the one the ball went
 * through lit. `on` is the bowl the ball is in, and `above` a bowl it has left, which the stylesheet turns to glass
 * for as long as the ball takes to fall out from under it.
 */
const Dish = ({ bowl, taken, on, above, jackpot }: { bowl: number; taken: number; on: boolean; above: boolean; jackpot: string }) => {
  const holes = BOWLS[bowl];
  const paint = DISH_PAINT[bowl];
  const funnel = holes.length === 1;
  const size = funnel ? BOWL_SHAPE.last : BOWL_SHAPE.hole;
  return (
    <div className={styles.dish} style={cssVars({ '--mp-bowl': bowl })} data-bowl={bowl} data-on={on} data-above={above}>
      <span className={styles.dishSide} />
      <svg className={styles.bowl} viewBox="-1 -1 2 2">
        {/* The wall of the dish, which shows on the far side between the rim and the floor. */}
        <circle r="0.9" fill="#6b4300" />
        <g transform={`translate(0 ${BOWL_VIEW.sunk}) scale(${BOWL_VIEW.radius})`}>
          <circle r="1" fill={paint.floor} />
          <circle r={funnel ? 0.72 : 0.8} fill={paint.inner} />
          {/* The floor the holes are in, out to where the ball runs round them; in the funnel, the last turn before the hole. */}
          <circle r={(funnel ? 0.46 : BOWL_SHAPE.ring + BOWL_SHAPE.lip + BOWL_VIEW.ball).toFixed(3)} fill={paint.well} />
          {holes.map((hole, index) => {
            const { x, y } = holeSpot(index, bowl);
            const label = labelSpot(index, bowl);
            const kind = holeKind(hole);
            const lit = taken === index;
            return (
              <g key={index} data-hole={index} data-kind={kind} data-in={lit}>
                <circle cx={x.toFixed(3)} cy={y.toFixed(3)} r={(size + 0.03).toFixed(3)} fill={HOLE_PAINT[kind]} />
                <circle cx={x.toFixed(3)} cy={y.toFixed(3)} r={size} fill={lit ? '#fffbe0' : '#05020f'} />
                {/* The far wall of the hole, which is all of its inside that can be seen from the front. */}
                {!lit && <ellipse cx={x.toFixed(3)} cy={(y - size * 0.42).toFixed(3)} rx={(size * 0.86).toFixed(3)} ry={(size * 0.5).toFixed(3)} fill={paint.inner} />}
                <text
                  className={styles.holeLabel}
                  transform={`translate(${label.x.toFixed(3)} ${label.y.toFixed(3)}) scale(1 ${HOLE_LABEL.tall})`}
                  y={(HOLE_LABEL.size * 0.36).toFixed(3)}
                  fontSize={HOLE_LABEL.size}
                  textAnchor="middle"
                  fill={lit ? '#ffffff' : HOLE_PAINT[kind]}
                >
                  {hole === 'down' ? '▼' : hole === 'jackpot' ? jackpot : hole}
                </text>
              </g>
            );
          })}
        </g>
        {/* The rim, over the edge of the floor. */}
        <circle r="0.945" fill="none" stroke="#b8860b" strokeWidth="0.11" />
        <circle r="0.95" fill="none" stroke="#ffd65c" strokeWidth="0.07" />
        <circle r="0.955" fill="none" stroke="#fff3b0" strokeWidth="0.022" />
      </svg>
      {!funnel && <span className={styles.dishHub} style={onFloor({ x: 0, y: 0 })} data-dish="bowl" />}
      {/* A bowl the ball is not in stands in the shade. */}
      <span className={styles.dishShade} />
    </div>
  );
};

/**
 * The jackpot challenge: three dishes one under another, seen from the front
 * and above. The stylesheet lifts the stack so that the dish the ball is in
 * is the one in the middle of the view, and the ball is seen to fall from one
 * to the next. The ball is moved by whoever it is registered with; here it
 * only waits where it is let go.
 */
const Bowls = ({ stage, fallen, jackpot, registerBall }: { stage: number; fallen: readonly number[]; jackpot: string; registerBall: (element: HTMLDivElement | null) => void }) => {
  const waiting = bowlBall(0, 0);
  return (
    <div className={styles.bowlWindow} data-testid="pusher-bowl" data-stage={stage} data-fallen={fallen.join(' ')}>
      <div className={styles.bowlScene}>
        <div className={styles.bowlTilt} style={BOWL_SIZES}>
          <div className={styles.bowlLift} style={cssVars({ '--mp-stage': stage })}>
            {BOWLS.map((_, bowl) => (
              <Dish key={bowl} bowl={bowl} taken={fallen[bowl] ?? -1} on={bowl === stage} above={bowl < stage} jackpot={jackpot} />
            ))}
            <div className={styles.ballSpot} ref={registerBall} style={{ ...onFloor({ x: 0, y: 0 }), transform: ballTransform(waiting) }} data-testid="pusher-bowl-ball">
              <span className={styles.ballShadow} style={{ transform: shadowTransform(waiting) }} />
              <span className={styles.ball} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** How many medals rain down the stage while the jackpot is counted out. */
const RAIN = 18;

/**
 * What the bowls paid, over the stage, as far as it has been counted out.
 * The jackpot has the whole stage, with medals raining down it. Each medal
 * of the rain has its own place across the stage and its own moment to start.
 * The stylesheet is told how many digits the number has, so that a jackpot
 * that has grown past a thousand still fits across the stage.
 */
const PayShow = ({ amount, jackpot }: { amount: number; jackpot: boolean }) => (
  <div className={styles.payShow} data-kind={jackpot ? 'jackpot' : 'prize'} data-digits={Math.min(5, String(amount).length)} aria-hidden data-testid="pusher-pay-show">
    {jackpot &&
      Array.from({ length: RAIN }, (_, coin) => (
        <span key={coin} className={styles.payCoin} style={cssVars({ '--mp-across': ((coin * 7 + 3) % RAIN) / (RAIN - 1), '--mp-wait': (coin * 5) % RAIN })} />
      ))}
    <span className={styles.payCount} data-testid="pusher-pay-count">
      +{amount}
    </span>
  </div>
);

export interface ScreenProps {
  state: ScreenState;
  stock: number;
  strings: PusherStrings;
  /** Hands the screen's three reel strips to whoever drives them. */
  registerStrip: (reel: number, element: HTMLDivElement | null) => void;
  /** Hands over the ball in the bowl, while the bowl is on. */
  registerBall: (element: HTMLDivElement | null) => void;
  onPick: (chest: number) => void;
}

/** The headline for a banner, in the machine's own words. */
export function bannerText(state: ScreenState, t: PusherStrings): string | null {
  const text: Record<Banner, string | null> = {
    none: null,
    reach: t.reach,
    superReach: t.superReach,
    line: state.line === 'big' ? t.chestTitle : t.sugorokuTitle,
    ball: t.ballWin,
    medals: t.spinWin(state.amount),
    towers: t.towerWin(state.amount),
    fever: t.feverWin(state.amount),
    finish: t.finishWin(state.amount),
    jackpot: t.jackpotWon(state.amount),
  };
  return text[state.banner];
}

/**
 * The centre screen: a small stage. The slot stands at the back of it with
 * the sugoroku board lying in front, and each of the games the slot leads to
 * takes the stage in its turn.
 */
export const Screen = ({ state, stock, strings: t, registerStrip, registerBall, onPick }: ScreenProps) => {
  const banner = bannerText(state, t);
  const titles: Record<ScreenState['mode'], string> = {
    slot: t.slotName,
    sugoroku: t.sugorokuTitle,
    chest: t.chestTitle,
    roulette: t.chance,
    bowl: t.challenge,
  };
  const title = titles[state.mode];
  const choosing = state.mode === 'chest' && state.chests?.every((chest) => chest.state === 'closed');
  // A reach is cut in across the reels as it is called; the caption below keeps the words up for as long as it lasts.
  const reach = state.banner === 'reach' || state.banner === 'superReach';
  return (
    <div className={styles.screen} role="group" aria-label={t.screenAria} data-mode={state.mode} data-banner={state.banner} data-testid="pusher-screen">
      <div className={styles.rays} aria-hidden />
      <div className={styles.screenTop}>
        <span className={styles.screenTitle} data-testid="pusher-mode">
          {title}
        </span>
        <div className={styles.stock} role="img" aria-label={t.stockAria(stock, MAX_STOCK)} data-testid="pusher-stock" data-held={stock}>
          <span className={styles.stockLabel} aria-hidden>
            {t.stock}
          </span>
          {Array.from({ length: MAX_STOCK }, (_, index) => (
            <span key={index} className={styles.lamp} data-lit={index < stock} aria-hidden />
          ))}
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.reels} aria-hidden data-hidden={state.mode !== 'slot'} data-line={state.line ?? 'none'}>
          {IDLE_DIGITS.map((idle, reel) => (
            <div key={reel} className={styles.reel}>
              <div
                className={styles.strip}
                ref={(element) => registerStrip(reel, element)}
                style={{ transform: stripOffset(idle - 1) }}
                data-fast="false"
                data-waiting="false"
              >
                {REEL_DIGITS.map((digit, index) => (
                  <span
                    key={digit}
                    className={styles.digit}
                    style={cssVars({ '--mp-face': index })}
                    data-digit={digit}
                    data-tier={tierOfDigit(digit)}
                    data-leads={TIER_BONUS[tierOfDigit(digit)]}
                  >
                    <ReelSymbol digit={digit} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Board state={state} strings={t} />

        {reach && (
          <div className={styles.cutIn} data-kind={state.banner} aria-hidden data-testid="pusher-cut-in">
            <span className={styles.cutInText}>{banner}</span>
          </div>
        )}

        {state.mode === 'sugoroku' && (state.die === 0 || !state.rolling) && (
          <span className={styles.rollHint} data-beside={state.die > 0} aria-hidden>
            {state.die === 0 ? t.sugorokuRolling : t.sugorokuMove(state.die)}
          </span>
        )}

        {state.mode === 'chest' && state.chests && (
          <div className={styles.bonus}>
            <div className={styles.chests} role="group" aria-label={t.chestPrompt}>
              {state.chests.map((chest, index) => (
                <button
                  key={index}
                  type="button"
                  className={styles.chest}
                  data-state={chest.state}
                  data-chosen={chest.chosen}
                  data-testid={`pusher-chest-${index}`}
                  disabled={!choosing}
                  aria-label={chest.prize === null ? t.chestName(index + 1) : t.chestHeld(index + 1, chest.prize)}
                  onClick={() => onPick(index)}
                >
                  <Chest view={chest} />
                </button>
              ))}
            </div>
            {choosing && (
              <span className={styles.bonusHint} data-testid="pusher-countdown">
                {t.chestCountdown(state.secondsLeft)}
              </span>
            )}
          </div>
        )}

        {(state.mode === 'roulette' || state.mode === 'bowl') && (
          <div className={styles.bonus} data-row="true" aria-hidden>
            {state.mode === 'bowl' ? (
              <Bowls stage={state.stage} fallen={state.fallen} jackpot={t.jackpot} registerBall={registerBall} />
            ) : (
              <Wheel lit={state.lit} />
            )}
            <div className={styles.chain} data-testid="pusher-chain" data-level={state.level}>
              {state.mode === 'bowl' ? (
                // The way down, beside the bowls: what each one holds, and which of them the ball is in.
                <ol className={styles.ladder} data-testid="pusher-ladder">
                  {BOWLS.map((holes, bowl) => {
                    const prize = holes.find((hole) => hole !== 'down');
                    return (
                      <li key={bowl} className={styles.rung} data-on={bowl === state.stage} data-done={bowl < state.stage}>
                        <span className={styles.rungNumber}>{bowl + 1}</span>
                        <span className={styles.rungPrize}>{prize === 'jackpot' ? t.jackpot : prize}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <>
                  <span className={styles.chainLabel}>{t.chainLevel(state.level, CHAIN_GOAL)}</span>
                  <span className={styles.chainLamps}>
                    {Array.from({ length: CHAIN_GOAL }, (_, index) => (
                      <span key={index} className={styles.lamp} data-lit={index < state.level} data-goal={index === CHAIN_GOAL - 1} />
                    ))}
                  </span>
                </>
              )}
              <span className={styles.chainTower}>
                <Heap coins={Math.min(TOWER.coins, Math.ceil(state.total / TOWER.each))} />
              </span>
              <span className={styles.chainTotal}>{t.chainTotal(state.total)}</span>
            </div>
          </div>
        )}

        {state.mode === 'bowl' && state.banner !== 'none' && <PayShow amount={state.amount} jackpot={state.banner === 'jackpot'} />}
      </div>

      <div className={styles.caption} aria-hidden data-testid="pusher-caption">
        {banner ? (
          <span className={styles.banner} data-banner={state.banner}>
            {banner}
          </span>
        ) : (
          <span className={styles.legend}>
            <span data-tier="seven">{t.legendSeven}</span>
            <span data-tier="big">{t.legendOdd}</span>
            <span data-tier="small">{t.legendEven}</span>
          </span>
        )}
      </div>
    </div>
  );
};
