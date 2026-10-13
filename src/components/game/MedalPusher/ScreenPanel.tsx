'use client';

import { Fragment, useState, type CSSProperties } from 'react';
import type { PusherStrings } from './i18n';
import { BOWL, CHAIN_GOAL, CHANCE, FEVER_SQUARE, ROULETTE, TIER_BONUS } from './lottery';
import { ReelSymbol, tierOfDigit } from './ReelSymbols';
import { GOLD_FLASH } from './render';
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

// ── The bowl ────────────────────────────────────────────────────────────────

/**
 * The bowl as it is drawn, in ems of the dish it lies in, where one em is the
 * dish's radius out to its rim: the radius of the bowl the ball rolls in, how
 * far towards the player its floor is drawn so that it looks sunk below the
 * rim, the ball's own radius as a share of the bowl's, and the share of its
 * size the ball loses as it sinks.
 */
const BOWL_VIEW = { radius: 0.84, sunk: 0.05, ball: 0.1, sink: 0.3 } as const;

/** The CSS transform that puts the ball on `spot` of the dish's floor. */
export function ballTransform(spot: BallSpot): string {
  const x = spot.x * BOWL_VIEW.radius;
  const y = spot.y * BOWL_VIEW.radius;
  return `translate(${x.toFixed(3)}em, ${y.toFixed(3)}em) scale(${(1 - BOWL_VIEW.sink * spot.sunk).toFixed(3)})`;
}

/** The ball's radius, for the stylesheet. */
const BALL_SIZE = cssVars({ '--mp-ball': `${(BOWL_VIEW.ball * BOWL_VIEW.radius).toFixed(4)}em` });

/** A point of the bowl's floor as CSS places it in the dish's box: how far across, and how far down. */
const onFloor = ({ x, y }: BowlPoint): CSSProperties => ({
  left: `${(50 + x * BOWL_VIEW.radius * 50).toFixed(2)}%`,
  top: `${(50 + (y * BOWL_VIEW.radius + BOWL_VIEW.sunk) * 50).toFixed(2)}%`,
});

/**
 * Where a hole's sign stands: behind the hole as the player sees it, and a
 * little out to its side, so that neither the hole nor the boss in the middle
 * is covered. Behind the far hole is where the ball rolls, so its sign stands
 * back at the edge of the floor instead.
 */
function signSpot(hole: number): BowlPoint {
  const { x, y } = holeSpot(hole);
  const behind = y - BOWL_SHAPE.hole * 1.25;
  if (Math.hypot(x, behind) > BOWL_SHAPE.ring) return { x: 0, y: -1 };
  return { x: x * 1.16, y: behind };
}

/**
 * The jackpot challenge: a dish seen from the front with a hole for each
 * prize and a sign behind each hole. It is drawn on one flat sheet, the floor
 * a little towards the player so that it lies below the rim; the signs and the
 * ball stand on that sheet. The ball is moved by whoever it is registered
 * with; here it only waits where it is let go.
 */
const Bowl = ({ hole, jackpot, registerBall }: { hole: number; jackpot: string; registerBall: (element: HTMLDivElement | null) => void }) => (
  <div className={styles.dishScene}>
    <div className={styles.dishTilt}>
      <span className={styles.dishShadow} />
      <span className={styles.dishSide} />
      <svg className={styles.bowl} viewBox="-1 -1 2 2" data-testid="pusher-bowl" data-landed={hole}>
        {/* The wall of the dish, which shows on the far side between the rim and the floor. */}
        <circle r="0.9" fill="#6b4300" />
        <g transform={`translate(0 ${BOWL_VIEW.sunk}) scale(${BOWL_VIEW.radius})`}>
          <circle r="1" fill="#4a38a8" />
          <circle r="0.8" fill="#35278c" />
          {/* The floor the holes are in, out to where the ball runs round them. */}
          <circle r={(BOWL_SHAPE.ring + BOWL_SHAPE.lip + BOWL_VIEW.ball).toFixed(3)} fill="#211460" />
          {BOWL.map((prize, index) => {
            const { x, y } = holeSpot(index);
            const best = prize === 'jackpot';
            const on = hole === index;
            return (
              <g key={index} data-hole={index} data-in={on}>
                <circle cx={x.toFixed(3)} cy={y.toFixed(3)} r={(BOWL_SHAPE.hole + 0.03).toFixed(3)} fill={best ? '#ffd65c' : '#ff9db1'} />
                <circle cx={x.toFixed(3)} cy={y.toFixed(3)} r={BOWL_SHAPE.hole} fill={on ? (best ? '#fff3a8' : '#ffd0da') : '#05020f'} />
                {/* The far wall of the hole, which is all of its inside that can be seen from the front. */}
                {!on && (
                  <ellipse
                    cx={x.toFixed(3)}
                    cy={(y - BOWL_SHAPE.hole * 0.42).toFixed(3)}
                    rx={(BOWL_SHAPE.hole * 0.86).toFixed(3)}
                    ry={(BOWL_SHAPE.hole * 0.5).toFixed(3)}
                    fill="#2a1c5c"
                  />
                )}
              </g>
            );
          })}
        </g>
        {/* The rim, over the edge of the floor. */}
        <circle r="0.945" fill="none" stroke="#b8860b" strokeWidth="0.11" />
        <circle r="0.95" fill="none" stroke="#ffd65c" strokeWidth="0.07" />
        <circle r="0.955" fill="none" stroke="#fff3b0" strokeWidth="0.022" />
      </svg>
      <span className={styles.dishHub} style={onFloor({ x: 0, y: 0 })} data-dish="bowl" />
      {BOWL.map((prize, index) => {
        const best = prize === 'jackpot';
        const spot = signSpot(index);
        return (
          <span
            key={index}
            className={styles.holeSign}
            style={onFloor(spot)}
            data-best={best}
            data-on={hole === index}
            data-side={Math.abs(spot.x) < 0.01 ? 'middle' : spot.x < 0 ? 'left' : 'right'}
          >
            {best ? jackpot : prize}
          </span>
        );
      })}
      <div
        className={styles.ballSpot}
        ref={registerBall}
        style={{ ...onFloor({ x: 0, y: 0 }), ...BALL_SIZE, transform: ballTransform(bowlBall(0, 0)) }}
        data-testid="pusher-bowl-ball"
      >
        <span className={styles.ballShadow} />
        <span className={styles.ball} />
      </div>
    </div>
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
        <div className={styles.stock} role="img" aria-label={t.stockAria(stock, MAX_STOCK)} data-testid="pusher-stock" data-held={stock} style={GOLD_FLASH_STYLE}>
          <span className={styles.stockLabel} aria-hidden>
            {t.stock}
          </span>
          {Array.from({ length: MAX_STOCK }, (_, index) => (
            <span key={index} className={styles.lamp} data-lit={index < stock} data-gold={index < state.chance - (state.gold ? 1 : 0)} aria-hidden />
          ))}
        </div>
      </div>
      {/* Chance time, for as long as a gold spin is still to come: what it is called, what a gold spin pays, and how many are left. It is said aloud once, where the cabinet makes its announcements. */}
      {state.chance > 0 && (
        <div className={styles.chance} data-gold={state.gold} data-testid="pusher-chance" aria-hidden>
          <span className={styles.chanceTitle}>{t.chanceTitle}</span>
          <span className={styles.chanceTimes}>×{CHANCE.multiplier}</span>
          <span className={styles.chanceLeft}>{t.chanceLeft(state.chance)}</span>
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
            {state.mode === 'bowl' ? <Bowl hole={state.hole} jackpot={t.jackpot} registerBall={registerBall} /> : <Wheel lit={state.lit} />}
            <div className={styles.chain} data-testid="pusher-chain" data-level={state.level}>
              <span className={styles.chainLabel}>{t.chainLevel(state.level, CHAIN_GOAL)}</span>
              <span className={styles.chainLamps}>
                {Array.from({ length: CHAIN_GOAL }, (_, index) => (
                  <span key={index} className={styles.lamp} data-lit={index < state.level} data-goal={index === CHAIN_GOAL - 1} />
                ))}
              </span>
              <span className={styles.chainTower}>
                <Heap coins={Math.min(TOWER.coins, Math.ceil(state.total / TOWER.each))} />
              </span>
              <span className={styles.chainTotal}>{t.chainTotal(state.total)}</span>
            </div>
          </div>
        )}
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
