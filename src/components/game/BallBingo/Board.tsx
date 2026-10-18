'use client';

import { memo, useEffect, useRef } from 'react';
import { FPS, flightMs, poseAt, type Flight } from './ballPath';
import { ARCH, BALL_R, CUPS, FIELD, FLAP, FOOT_POCKETS, FOOT_ROW, LANE, PINS, PIN_R, POSTS, VIEW, lidOf } from './field';
import { FREE_MOST, POCKETS } from './engine';
import styles from './BallBingo.module.css';

export interface BoardProps {
  /** The game as it stands: the numbers whose pockets hold a ball, the free balls given (the FREE cups shut at the last), and whether CHANCE holds its ball. */
  marks: number;
  frees: number;
  chance: boolean;
  /** Whether a ball waits at the plunger, to be shot, and whether the plunger is drawn back to shoot it. */
  waiting: boolean;
  pulling: boolean;
  /** How many times the flight's own pace it is shown at (2 for the quick mode). It may change while a ball flies. */
  speed: number;
  /** The ball in the air, and a key that is new for every ball shot. */
  flight: Flight | null;
  flightKey: number;
  /** The ball has dropped into its pocket (the frame it goes in). */
  onDrop?: () => void;
  /** The ball has come to rest in its pocket (or fallen away into OUT): the flight is over. */
  onLanded?: () => void;
  /** The pocket a ball last went into, and a key that is new each time, for its lamp to flash. */
  flash: { pocket: number; key: number } | null;
  label: string;
}

const PLUNGER = { x: LANE.x, y: LANE.bottom + BALL_R } as const;

/** How many of a flight's frames go by between two moments (in ms) when it is shown at `speed` times its own pace. */
export const framesBetween = (from: number, to: number, speed: number): number => (Math.max(0, to - from) / 1000) * FPS * speed;
/** How far the plunger is drawn back before it is let go, in the drawing's units. */
const PULL_DEPTH = 4;

/** The arch's path: from the left wall over the top to the lane's outer wall. */
const ARCH_PATH = `M ${FIELD.left} ${ARCH.cy} A ${ARCH.wall} ${ARCH.wall} 0 0 1 ${LANE.outer} ${ARCH.cy}`;
/** The field's face inside the walls: the arch, the walls down to the foot, the lane beside them. */
const FACE_PATH = `${ARCH_PATH} L ${LANE.outer} ${VIEW.height} L ${FIELD.left} ${VIEW.height} Z`;

/** The static field (walls, pins, the foot's posts): drawn once, and never again. */
const Field = memo(function Field() {
  return (
    <>
      <defs>
        <radialGradient id="bb-face" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#2b3f9e" />
          <stop offset="62%" stopColor="#15206b" />
          <stop offset="100%" stopColor="#0a0f3a" />
        </radialGradient>
        <linearGradient id="bb-chrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4f6fb" />
          <stop offset="45%" stopColor="#9aa3b5" />
          <stop offset="100%" stopColor="#e3e7ef" />
        </linearGradient>
        <radialGradient id="bb-ball" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#dfe3ea" />
          <stop offset="80%" stopColor="#7c8494" />
          <stop offset="100%" stopColor="#3d4350" />
        </radialGradient>
        <radialGradient id="bb-pin" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff5cf" />
          <stop offset="55%" stopColor="#e2b950" />
          <stop offset="100%" stopColor="#8a6418" />
        </radialGradient>
      </defs>
      <path d={FACE_PATH} fill="url(#bb-face)" />
      {/* Stars painted on the field's face, under the pins. */}
      <g className={styles.paint} aria-hidden>
        {[
          [40, 112, 3],
          [214, 96, 2.4],
          [96, 176, 2],
          [180, 210, 2.6],
          [30, 300, 2.2],
          [240, 320, 2],
          [120, 342, 1.8],
          [150, 64, 2.8],
        ].map(([x, y, r], i) => (
          <path key={i} d={`M ${x} ${y - r * 2} L ${x + r * 0.6} ${y - r * 0.6} L ${x + r * 2} ${y} L ${x + r * 0.6} ${y + r * 0.6} L ${x} ${y + r * 2} L ${x - r * 0.6} ${y + r * 0.6} L ${x - r * 2} ${y} L ${x - r * 0.6} ${y - r * 0.6} Z`} />
        ))}
      </g>
      {/* The lane up the right side, its flap at the top, and the arch's rail. */}
      <rect x={LANE.inner} y={ARCH.cy} width={LANE.outer - LANE.inner} height={VIEW.height - ARCH.cy} className={styles.lane} />
      <line x1={FIELD.right} y1={FLAP.y1} x2={FIELD.right} y2={VIEW.height} className={styles.rail} />
      <line x1={FLAP.x0} y1={FLAP.y0} x2={FLAP.x1} y2={FLAP.y1} className={styles.flap} />
      <path d={ARCH_PATH} className={styles.arch} />
      <line x1={FIELD.left} y1={ARCH.cy} x2={FIELD.left} y2={VIEW.height} className={styles.rail} />
      <line x1={LANE.outer} y1={ARCH.cy} x2={LANE.outer} y2={VIEW.height} className={styles.rail} />
      {PINS.map((pin, i) => (
        <circle key={i} cx={pin.x} cy={pin.y} r={PIN_R} fill="url(#bb-pin)" />
      ))}
      {POSTS.map((x) => (
        <line key={x} x1={x} y1={FOOT_ROW.postTop} x2={x} y2={FOOT_ROW.bottom + 8} className={styles.post} />
      ))}
    </>
  );
});

/**
 * The field: the arch, the pins, the cups and the pockets, drawn from the
 * same numbers the ball's flight is worked out against (field.ts), with the
 * balls that stand in their pockets and the one in the air. The ball in the
 * air is moved straight on the drawing, a frame at a time, from its flight's
 * frames; nothing else is drawn again while it flies.
 */
export const Board = memo(function Board({ marks, frees, chance, waiting, pulling, speed, flight, flightKey, onDrop, onLanded, flash, label }: BoardProps) {
  const ball = useRef<SVGGElement | null>(null);
  const handlers = useRef({ onDrop, onLanded, speed });
  useEffect(() => {
    handlers.current = { onDrop, onLanded, speed };
  });

  // The ball in the air: moved every frame from its flight, until it has come to rest.
  useEffect(() => {
    const element = ball.current;
    if (!flight || !element) return;
    const count = flight.frames.length / 2;
    let frame = 0;
    let last: number | null = null;
    let at = 0;
    let dropped = false;
    const place = (at: number) => {
      const { x, y } = poseAt(flight, at);
      element.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    };
    place(0);
    element.setAttribute('data-flying', 'true');
    const tick = (now: number) => {
      // The flight's frames are gone through at its own pace, times the speed it is shown at (which may change mid-flight).
      at += framesBetween(last ?? now, now, handlers.current.speed);
      last = now;
      place(at);
      if (!dropped && at >= flight.land) {
        dropped = true;
        handlers.current.onDrop?.();
      }
      if (at >= count - 1) {
        // At rest: the ball stays drawn where it is until the page draws it standing in its pocket (this effect's
        // cleanup, which runs once that is on the screen, puts the flying one away), so that it never blinks out.
        handlers.current.onLanded?.();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      element.setAttribute('data-flying', 'false');
    };
  }, [flight, flightKey]);

  const freeOpen = frees < FREE_MOST;
  const chanceOpen = !chance;
  const chanceRest = CUPS.find((cup) => POCKETS[cup.pocket].kind === 'chance')!;

  return (
    <svg className={styles.board} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label={label} data-testid="bingo-board" data-flying={flight ? 'true' : 'false'} data-speed={speed} data-flight-ms={flight ? Math.round(flightMs(flight)) : undefined}>
      <Field />
      {/* The cups among the pins, lit while they are open; a shut one has its dome. */}
      {CUPS.map((cup) => {
        const kind = POCKETS[cup.pocket].kind;
        const open = kind === 'free' ? freeOpen : chanceOpen;
        const lid = lidOf(cup);
        const flashing = flash?.pocket === cup.pocket;
        const plate = kind === 'chance' ? 2 * cup.half + 16 : 2 * cup.half + 8;
        return (
          <g key={cup.pocket} className={styles.cup} data-kind={kind} data-open={open} data-testid={`bingo-cup-${POCKETS[cup.pocket].id}`}>
            <rect x={cup.cx - plate / 2} y={cup.top + cup.depth + 2} width={plate} height={9} rx={3} className={styles.cupPlate} />
            <text x={cup.cx} y={cup.top + cup.depth + 9} className={styles.cupText}>
              {kind === 'free' ? 'FREE' : 'CHANCE'}
            </text>
            <path d={`M ${cup.cx - cup.half} ${cup.top} L ${cup.cx - cup.half} ${cup.top + cup.depth} L ${cup.cx + cup.half} ${cup.top + cup.depth} L ${cup.cx + cup.half} ${cup.top}`} className={styles.cupWall} />
            {!open && <path d={`M ${lid.cx - lid.r} ${cup.top + 2} A ${lid.r} ${lid.r} 0 0 1 ${lid.cx + lid.r} ${cup.top + 2} Z`} className={styles.lid} />}
            {flashing && <circle key={flash.key} cx={cup.cx} cy={cup.top + cup.depth / 2} r={cup.half + 6} className={styles.burst} />}
          </g>
        );
      })}
      {chance && <circle cx={chanceRest.cx} cy={chanceRest.restY} r={BALL_R} fill="url(#bb-ball)" />}
      {/* The pockets at the foot: OUT at the sides, the numbers between, each lit while a ball stands in it. */}
      {FOOT_POCKETS.map((foot) => {
        const pocket = POCKETS[foot.pocket];
        const filled = pocket.kind === 'number' && (marks & (1 << (pocket.number - 1))) !== 0;
        return (
          <g key={foot.pocket} className={styles.pocket} data-kind={pocket.kind} data-filled={filled} data-testid={`bingo-pocket-${pocket.id}`}>
            <rect x={foot.x0 + 1.4} y={FOOT_ROW.postTop + 2} width={foot.x1 - foot.x0 - 2.8} height={FOOT_ROW.bottom - FOOT_ROW.postTop + 6} rx={2} className={styles.pocketFace} />
            <text x={foot.cx} y={FOOT_ROW.bottom + 4} className={styles.pocketText}>
              {pocket.kind === 'out' ? 'OUT' : pocket.number}
            </text>
            {filled && <circle cx={foot.cx} cy={FOOT_ROW.restY} r={BALL_R} fill="url(#bb-ball)" />}
            {flash?.pocket === foot.pocket && <rect key={flash.key} x={foot.x0} y={FOOT_ROW.postTop - 6} width={foot.x1 - foot.x0} height={30} rx={4} className={styles.burstRect} />}
          </g>
        );
      })}
      {/* The plunger at the foot of the lane, and the ball waiting on it. */}
      <g className={styles.plunger} data-pulled={pulling}>
        <rect x={LANE.x - 6} y={PLUNGER.y} width={12} height={4} rx={1.5} className={styles.plungerHead} />
        <path d={`M ${LANE.x} ${PLUNGER.y + 4} l -4 2 l 8 2 l -8 2 l 8 2 l -4 2`} className={styles.spring} />
      </g>
      {waiting && !flight && <circle cx={LANE.x} cy={LANE.bottom + (pulling ? PULL_DEPTH : 0)} r={BALL_R} fill="url(#bb-ball)" className={styles.waiting} data-testid="bingo-waiting" />}
      {/* The ball in the air. Its place is written straight onto the drawing as it flies. */}
      <g ref={ball} transform={`translate(${LANE.x} ${LANE.bottom})`} className={styles.flyer} data-flying="false" aria-hidden>
        <circle r={BALL_R} fill="url(#bb-ball)" />
      </g>
    </svg>
  );
});

