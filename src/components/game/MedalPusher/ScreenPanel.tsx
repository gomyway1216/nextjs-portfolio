'use client';

import { useState, type CSSProperties } from 'react';
import type { PusherStrings } from './i18n';
import { BOWLS, CHANCE, FEVER_SQUARE, ROULETTE, TIER_BONUS, type BowlHole } from './lottery';
import { SCREEN_STACK } from './medalLook';
import { ReelSymbol, tierOfDigit } from './ReelSymbols';
import { GOLD_FLASH } from './render';
import {
  BOARD_SQUARES,
  BOWL_SHAPE,
  MONITOR,
  REEL_DIGITS,
  WHEEL,
  ballSpot,
  bowlBall,
  holeSpot,
  monitorMode,
  monitorScene,
  pocketPlace,
  wheelSpot,
  type BallSpot,
  type Banner,
  type BowlPoint,
  type ChestView,
  type MonitorMode,
  type ScreenState,
  type WheelSpot,
} from './screen';
import { MAX_STOCK, type ActiveRoulette } from './session';
import { TUBE } from './stacker';
import { SCREEN } from './view';
import { WINDOW } from './works';
import styles from './MedalPusher.module.css';

/** The digits the reels show before the first spin. */
export const IDLE_DIGITS: [number, number, number] = [3, 5, 8];

/** A value the stylesheet works a transform out from. */
const cssVars = (vars: Record<`--mp-${string}`, string | number>) => vars as CSSProperties;

/**
 * How far in from either side of the screen what stands low on the stage keeps, in the wall, as a share of the
 * screen's width: the windows the towers are stacked in are cut in the screen's lower corners (works.ts), and each
 * reaches in from its side to the outer edge of its frame. The slab of the slot's board and the column beside a wheel
 * or the bowls may go a little way under a window's frame, by their rounded rims and the room round what is on them,
 * as they always have; what is on them may not. The windows are as wide as a tower whatever the screen's width, so
 * the narrower the table, the more of the screen they take.
 */
export const STAGE_IN = ((TUBE.x[0] + WINDOW.half + WINDOW.frame - SCREEN.left) / (SCREEN.right - SCREEN.left)) * 100 - 5;

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
    stroke: SCREEN_STACK.line,
    strokeWidth: 0.9,
  });
  return (
    <svg className={styles.heap} viewBox={`0 0 ${MEDAL.across + 2} ${height.toFixed(1)}`} data-coins={coins}>
      {Array.from({ length: coins }, (_, coin) => (
        <ellipse key={coin} {...medal(coin)} fill={SCREEN_STACK.edge} />
      ))}
      {coins > 0 && (
        <>
          {/* The face of the top one. */}
          <ellipse {...medal(coins)} fill={SCREEN_STACK.face} />
          <ellipse {...medal(coins)} rx={MEDAL.across / 2 - 3.5} ry={MEDAL.flat - 1.5} fill={SCREEN_STACK.shine} stroke="none" />
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

/** Medals in the stack that stands on a square: more for a square that pays more, and a tower on the fever, which stands as tall as the screen has always had room for. */
const squareCoins = (medals: number): number => Math.min(12, Math.max(1, Math.round(medals / 2.5)));

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

/** The most medals the run's tower is drawn with, and the medals of the run that each one stands for. */
const TOWER = { coins: 14, each: 10 } as const;

/**
 * The wheel as it is drawn, in ems of its box, where one em is its radius out
 * to the rim: the ball's own radius, how much of its size the ball loses as
 * it sits down into a pocket, and how far the wheel leans back from the eye.
 */
const WHEEL_VIEW = { ball: 0.07, sink: 0.16, tilt: 50 } as const;

/**
 * How a pocket is painted by what it holds: the plate its number stands on,
 * the number, and the light of its lamp. The same on every board, so that a
 * colour always means the same prize.
 */
const POCKET_PAINT: Readonly<Record<string, { plate: string; ink: string; lit: string }>> = {
  stop: { plate: '#7a1128', ink: '#ffd9df', lit: '#ff3d5a' },
  10: { plate: '#1e5fd6', ink: '#ffffff', lit: '#8fc0ff' },
  20: { plate: '#0f8f58', ink: '#ffffff', lit: '#7df0b0' },
  30: { plate: '#8438d0', ink: '#ffffff', lit: '#d5a6ff' },
  50: { plate: '#e2a917', ink: '#2a1700', lit: '#fff3b0' },
};

/**
 * How each board is dressed: the name on its plate, the metal its cone is
 * turned from (light, body and shade), the two tones of its banked track, and
 * the colour of the lamps round its rim. The pockets and their chances are
 * the same on all four.
 */
export const WHEEL_BOARDS = [
  { name: 'BRONZE', cone: ['#f6c79c', '#b8703a', '#5e3211'], track: ['#2a1c14', '#5f4130'], lamp: '#ffb37a' },
  { name: 'SILVER', cone: ['#f6f9fd', '#a9b4c4', '#4d5868'], track: ['#1c2029', '#4d5565'], lamp: '#cfe3ff' },
  { name: 'GOLD', cone: ['#fff6c2', '#e2a917', '#7a5200'], track: ['#2b2006', '#6e5312'], lamp: '#ffe27a' },
  { name: 'FINAL', cone: ['#ffe0f4', '#d2359a', '#4a0a34'], track: ['#170a20', '#44265c'], lamp: '#ff8fd8' },
] as const;

/** A number to three places, for a path. */
const f = (value: number): string => value.toFixed(3);
/** The point `radius` from the middle of the wheel, `turn` turns clockwise from its top, in the wheel's own radii. */
const wheelAt = (radius: number, turn: number): [number, number] => [radius * Math.sin(turn * 2 * Math.PI), -radius * Math.cos(turn * 2 * Math.PI)];
/** The piece of a ring between two radii and two turns, as an SVG path. */
function ringPiece(inner: number, outer: number, from: number, to: number): string {
  const [ax, ay] = wheelAt(outer, from);
  const [bx, by] = wheelAt(outer, to);
  const [cx, cy] = wheelAt(inner, to);
  const [dx, dy] = wheelAt(inner, from);
  return `M${f(ax)} ${f(ay)} A${f(outer)} ${f(outer)} 0 0 1 ${f(bx)} ${f(by)} L${f(cx)} ${f(cy)} A${f(inner)} ${f(inner)} 0 0 0 ${f(dx)} ${f(dy)} Z`;
}
/** A point of the wheel as CSS places it in the wheel's box. */
const onWheel = (radius: number, turn: number): CSSProperties => {
  const [x, y] = wheelAt(radius, turn);
  return { left: `${(50 + x * 50).toFixed(2)}%`, top: `${(50 + y * 50).toFixed(2)}%` };
};

/** The pockets of a board in the order they stand round the rotor, each with its place in the lottery's list. */
export function boardPockets(board: number): { pocket: number; holds: (typeof ROULETTE)[number] }[] {
  const places: { pocket: number; holds: (typeof ROULETTE)[number] }[] = [];
  ROULETTE.forEach((holds, pocket) => (places[pocketPlace(pocket, board)] = { pocket, holds }));
  return places;
}

/** The CSS transform that puts the wheel's ball on `spot`: across and down the wheel, as high over the pockets as it is, and smaller once it has sat down. */
export const wheelBallTransform = (spot: WheelSpot): string =>
  `translate3d(${spot.x.toFixed(3)}em, ${spot.y.toFixed(3)}em, ${spot.lift.toFixed(3)}em) scale(${(1 - WHEEL_VIEW.sink * spot.sunk).toFixed(3)})`;

/** The turn of the rotor as CSS takes it. */
export const rotorTurn = (spot: WheelSpot): string => `${(spot.rotor * 360).toFixed(2)}deg`;

/**
 * Moves the ball of the ball's lottery, whichever part of it is on the stage:
 * round the wheel while the roulette turns, turning the rotor with it, and
 * down the bowls after a full run. `ball` is the ball the screen handed over,
 * which says by `data-of` whether it is the wheel's or the bowls'; in the one
 * frame between the roulette ending and the bowls being drawn it is left alone.
 */
export function placeLottery(ball: HTMLElement, roulette: ActiveRoulette, calm: boolean): void {
  const inBowls = roulette.bowl !== null;
  if ((ball.dataset.of === 'bowls') !== inBowls) return;
  if (roulette.bowl) {
    placeBall(ball, ballSpot(roulette.bowl, calm));
    return;
  }
  const spot = wheelSpot(roulette, calm);
  ball.style.transform = wheelBallTransform(spot);
  const shadow = ball.firstElementChild;
  if (shadow instanceof HTMLElement) shadow.style.transform = `translateZ(${(-spot.lift).toFixed(3)}em)`;
  ball.parentElement?.style.setProperty('--mp-rotor', rotorTurn(spot));
}

/** Where the ball waits before the cabinet first moves it: on the track, where it is shot from. */
const WAITING = wheelSpot({ pocket: 0, elapsed: 0, duration: 1, landed: false, level: 0 }, true);
/** The ball's radius and the wheel's lean, for the stylesheet. */
const WHEEL_SIZES = cssVars({ '--mp-ball': `${WHEEL_VIEW.ball}em`, '--mp-dish-tilt': `${WHEEL_VIEW.tilt}deg` });
/** The deflectors on the track and the lamps round the rim: how many of each. */
const RIM = { deflectors: 8, lamps: 24 } as const;

/**
 * The roulette as the machine it is: a rotor with twelve pockets, a numbered
 * plate outside each and dividers between them, turning inside a bowl with a
 * banked track, under a dome. The ball is shot onto the track and is moved by
 * whoever it is registered with; here it only waits where it is shot from.
 * `board` is the board the run is on, which says where each pocket stands and
 * how the wheel is dressed, and `lit` the pocket the ball lies in.
 */
const Wheel = ({ board, lit, registerBall }: { board: number; lit: number; registerBall: (element: HTMLDivElement | null) => void }) => {
  const dress = WHEEL_BOARDS[board] ?? WHEEL_BOARDS[0];
  const pockets = boardPockets(board);
  const count = pockets.length;
  const half = 0.5 / count;
  return (
    <div className={styles.wheelWindow} data-testid="pusher-wheel" data-board={board} data-lit={lit}>
      <div className={styles.wheelScene}>
        <div className={styles.wheelTilt} style={WHEEL_SIZES}>
          <span className={styles.dishShadow} />
          <span className={styles.dishSide} />
          {/* The bowl, which does not turn: the rim with its lamps, and the banked track with its deflectors. */}
          <svg className={styles.wheelBowl} viewBox="-1 -1 2 2">
            {/* The bezel with its lamps, the rim inside it, and the track banked down from the rim to the rotor. */}
            <circle r="1" fill="#0b0b12" />
            {Array.from({ length: RIM.lamps }, (_, index) => {
              const [x, y] = wheelAt(0.965, index / RIM.lamps);
              return <circle key={index} className={styles.trackLamp} cx={f(x)} cy={f(y)} r="0.024" fill={dress.lamp} data-odd={index % 2 === 1} />;
            })}
            <circle r="0.925" fill="none" stroke="#b8860b" strokeWidth="0.03" />
            <circle r="0.928" fill="none" stroke="#ffd65c" strokeWidth="0.018" />
            <circle r="0.931" fill="none" stroke="#fff3b0" strokeWidth="0.006" />
            <circle r="0.912" fill={dress.track[1]} />
            <circle r="0.875" fill={dress.track[1]} stroke="rgba(255, 255, 255, 0.2)" strokeWidth="0.01" />
            <circle r="0.835" fill={dress.track[0]} />
            <circle r={f(WHEEL.rotor + 0.012)} fill="#05050a" />
            {Array.from({ length: RIM.deflectors }, (_, index) => {
              const [x, y] = wheelAt(0.822, (index + 0.5) / RIM.deflectors);
              return <rect key={index} x="-0.03" y="-0.011" width="0.06" height="0.022" rx="0.009" fill="#eef2f8" transform={`translate(${f(x)} ${f(y)}) rotate(${(((index + 0.5) / RIM.deflectors) * 360).toFixed(1)})`} />;
            })}
          </svg>
          {/* The light the metal of the track catches, which stays where it is while the rotor turns under it. */}
          <span className={styles.trackSheen} />
          {/* The rotor, which turns: the plates, the pockets with the dividers between them, and the cone. */}
          <div className={styles.rotor}>
            <svg className={styles.wheelBowl} viewBox="-1 -1 2 2">
              <circle r={f(WHEEL.rotor)} fill="#0d0d14" />
              {pockets.map(({ pocket, holds }, place) => {
                const paint = POCKET_PAINT[String(holds)];
                const on = lit === pocket;
                const at = place / count;
                return (
                  <g key={pocket} data-pocket={pocket} data-place={place} data-holds={holds} data-lit={on}>
                    <path d={ringPiece(WHEEL.outer + 0.012, WHEEL.rotor - 0.012, at - half + 0.004, at + half - 0.004)} fill={on ? '#fffbe0' : paint.plate} />
                    {/* The pocket: its floor, lighter towards the cone where the light reaches it, and the shade under the wall of the plates. */}
                    <path d={ringPiece(WHEEL.inner, WHEEL.outer, at - half, at + half)} fill={on ? paint.lit : '#0c0c13'} />
                    {!on && <path d={ringPiece(WHEEL.inner, WHEEL.inner + 0.085, at - half, at + half)} fill="#1d1d2a" />}
                    <path d={ringPiece(WHEEL.outer - 0.045, WHEEL.outer, at - half, at + half)} fill="rgba(0, 0, 0, 0.55)" />
                  </g>
                );
              })}
              {pockets.map((_, place) => {
                const [x1, y1] = wheelAt(WHEEL.inner - 0.01, (place + 0.5) / count);
                const [x2, y2] = wheelAt(WHEEL.outer + 0.02, (place + 0.5) / count);
                return <line key={place} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="#e6ebf3" strokeWidth="0.03" strokeLinecap="round" />;
              })}
              <circle r={f(WHEEL.outer + 0.006)} fill="none" stroke="#9aa3b3" strokeWidth="0.014" />
              {/* The cone, turned in steps, with the four arms of its handle. */}
              <circle r={f(WHEEL.inner)} fill={dress.cone[2]} stroke="#e6ebf3" strokeWidth="0.022" />
              <circle r={f(WHEEL.inner * 0.82)} fill={dress.cone[1]} />
              <circle r={f(WHEEL.inner * 0.56)} fill={dress.cone[0]} />
              {[0, 0.25].map((turn) => {
                const [x, y] = wheelAt(WHEEL.inner * 0.74, turn);
                return <line key={turn} x1={f(-x)} y1={f(-y)} x2={f(x)} y2={f(y)} stroke="#f4f7fb" strokeWidth="0.05" strokeLinecap="round" />;
              })}
            </svg>
            {pockets.map(({ pocket, holds }, place) => (
              <span
                key={pocket}
                className={styles.plateNumber}
                style={{ ...onWheel(WHEEL.plate, place / count), color: lit === pocket ? '#14080a' : POCKET_PAINT[String(holds)].ink }}
                data-holds={holds}
                data-on={lit === pocket}
              >
                {holds === 'stop' ? '×' : holds}
              </span>
            ))}
          </div>
          <span className={styles.dishHub} data-dish="wheel" />
          <div className={styles.ballSpot} ref={registerBall} style={{ left: '50%', top: '50%', transform: wheelBallTransform(WAITING) }} data-of="wheel" data-testid="pusher-wheel-ball">
            <span className={styles.ballShadow} style={{ transform: `translateZ(${(-WAITING.lift).toFixed(3)}em)` }} />
            <span className={styles.ball} />
          </div>
        </div>
        {/* The dome over it all: what shows of clear acrylic is the light it catches. */}
        <span className={styles.dome} />
      </div>
    </div>
  );
};

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
            <div className={styles.ballSpot} ref={registerBall} style={{ ...onFloor({ x: 0, y: 0 }), transform: ballTransform(waiting) }} data-of="bowls" data-testid="pusher-bowl-ball">
              <span className={styles.ballShadow} style={{ transform: shadowTransform(waiting) }} />
              <span className={styles.ball} />
            </div>
          </div>
        </div>
        {/* The bowls stand under a dome like the wheel's. */}
        <span className={styles.dome} data-over="bowls" />
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

/** How long one flash of a gold spin's lamp takes on the page, from bright to bright: the stylesheet takes it from here, so it is the cabinet's own rate. */
export const GOLD_FLASH_STYLE = { '--mp-gold-flash': `${1 / GOLD_FLASH.perSecond}s` } as CSSProperties;

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

/** The scene the monitor was last drawn in, and how many times it has changed gear since it was first drawn. */
export interface Gear {
  scene: string;
  shifts: number;
}
/** The gear after a drawing of `scene`: the same one if the scene has not changed, and one shift on if it has. */
export const shiftGear = (gear: Gear, scene: string): Gear => (gear.scene === scene ? gear : { scene, shifts: gear.shifts + 1 });

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
  // The world round the game: its light, and what is written on the shutters when the monitor changes into it.
  const monitor = monitorMode(state);
  // In the ball's lottery the shutters carry the name of what they open on: the roulette, the board the run has come to, or the bowls.
  const lottery = state.mode === 'bowl' ? t.challenge : state.board > 0 ? `${state.board + 1} ${WHEEL_BOARDS[state.board].name}` : t.chance;
  const worlds: Record<MonitorMode, string> = { normal: t.slotName, chance: t.chanceTitle, fever: t.feverTag, challenge: lottery, jackpot: t.jackpot };
  // Each change of scene shuts the shutters once. The first drawing is no change.
  const scene = monitorScene(state);
  const [gear, setGear] = useState<Gear>({ scene, shifts: 0 });
  const shifted = shiftGear(gear, scene);
  if (shifted !== gear) setGear(shifted);
  const choosing = state.mode === 'chest' && state.chests?.every((chest) => chest.state === 'closed');
  // A reach is cut in across the reels as it is called; the caption below keeps the words up for as long as it lasts.
  const reach = state.banner === 'reach' || state.banner === 'superReach';
  return (
    <div
      className={styles.screen}
      role="group"
      aria-label={t.screenAria}
      data-mode={state.mode}
      data-banner={state.banner}
      data-monitor={monitor}
      // How quickly what is on the screen is played: the stylesheet times a reach's cut-in, the die and the piece's hops by it.
      style={{ ...GOLD_FLASH_STYLE, ...cssVars({ '--mp-glow': MONITOR[monitor].colour, '--mp-stage-in': `${STAGE_IN.toFixed(2)}cqw`, '--mp-pace': state.pace }) }}
      data-pace={state.pace}
      data-testid="pusher-screen"
    >
      <div className={styles.rays} aria-hidden />
      <div className={styles.frameLamps} aria-hidden />
      <div className={styles.screenTop}>
        <span className={styles.screenTitle} data-testid="pusher-mode">
          {title}
        </span>
        <div className={styles.stock} role="img" aria-label={t.stockAria(stock, MAX_STOCK)} data-testid="pusher-stock" data-held={stock} style={GOLD_FLASH_STYLE}>
          <span className={styles.stockLabel} aria-hidden>
            {t.stock}
          </span>
          {Array.from({ length: MAX_STOCK }, (_, index) => (
            <span key={index} className={styles.lamp} data-lit={index < stock} data-gold={index < state.golds} aria-hidden />
          ))}
        </div>
      </div>
      {/* Chance time, for as long as it lasts: what it is called, what a gold spin pays, and how many are left. It is said aloud once, where the cabinet makes its announcements. */}
      {state.chance > 0 && (
        <div className={styles.chance} data-gold={state.gold} data-testid="pusher-chance" aria-hidden>
          <span className={styles.chanceTitle}>{t.chanceTitle}</span>
          <span className={styles.chanceTimes}>×{CHANCE.multiplier}</span>
          <span className={styles.chanceLeft}>{t.chanceLeft(state.chance)}</span>
        </div>
      )}
      {/* A gold spin outside chance time, which is one the lucky lamp made: the spin on the reels, or the game its line led to, carries a tag that says it is gold and what that pays. The monitor stays in its everyday mode. */}
      {state.chance === 0 && state.gold && (
        <div className={styles.chance} data-gold="true" data-lone="true" data-testid="pusher-gold-spin" aria-hidden>
          <span className={styles.chanceTitle}>{t.goldTag}</span>
          <span className={styles.chanceTimes}>×{CHANCE.multiplier}</span>
        </div>
      )}

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
              <Wheel board={Math.max(0, state.board)} lit={state.lit} registerBall={registerBall} />
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
                // The boards of the run, beside the wheel: which of them the ball is on, and which are behind it.
                <ol className={styles.ladder} data-rungs={WHEEL_BOARDS.length} data-testid="pusher-boards">
                  {WHEEL_BOARDS.map((dress, board) => (
                    <li key={board} className={styles.rung} data-on={board === state.board} data-done={board < state.level && board !== state.board}>
                      <span className={styles.rungNumber}>{board + 1}</span>
                      <span className={styles.rungPrize}>{dress.name}</span>
                    </li>
                  ))}
                </ol>
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

      {gear.shifts > 0 && (
        <div key={gear.shifts} className={styles.gear} data-to={monitor} aria-hidden data-testid="pusher-gear">
          <span className={styles.shutter} data-side="top" />
          <span className={styles.shutter} data-side="bottom" />
          <span className={styles.gearTitle}>{worlds[monitor]}</span>
        </div>
      )}
      <div className={styles.glass} aria-hidden />
    </div>
  );
};
