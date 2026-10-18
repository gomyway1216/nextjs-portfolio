'use client';

import { memo, useEffect, useRef } from 'react';
import { LAMPS, LAMP_COUNT, SEGMENT_COUNT, WHEEL, type Segment } from './engine';
import { LAMP_STEP, SEG, frameAt, freeSwing, pegAt, pegsPast, pushedBend, touching, type Phase, type Show } from './physics';
import styles from './BigWheel.module.css';

/**
 * The big wheel: an upright wheel of 54 segments with a peg between each two,
 * the leather flapper at the top that the pegs bend and let go, and the hub's
 * ring of 16 star lamps for the Milky Way Chance.
 *
 * It is a picture of a spin already drawn: the machine gives it the show
 * (physics.ts) and it plays it with requestAnimationFrame, writing the
 * wheel's and the flapper's transforms straight to their layers (each its own
 * composited layer, so a frame repaints nothing), and telling the machine as
 * each step begins, as each peg slips past the flapper (its clack) and as each
 * lamp lights. React draws it again only between steps.
 */

/** A spin for the wheel to show: its name (a new name, a new show) and the show. */
export interface WheelRun {
  id: string;
  show: Show;
}

export interface WheelProps {
  run: WheelRun | null;
  /** Straight to the end of the show. */
  skipped: boolean;
  /** Where the wheel stands while no spin is shown, and the lamp left lit (null for none). */
  rest: number;
  restLamp: number | null;
  /** What the machine is doing, for the lights: the step of the show, or `idle`. */
  phase: Phase | 'idle';
  /** Whether the stop under the pointer is a win, which lights it. */
  win: boolean;
  /** What the hub's middle shows: the multiplier drawn, once it is known, or the machine's star. */
  hub: string;
  /** With less motion: the flapper hangs still and the lights do not chase. */
  calm: boolean;
  label: string;
  onPhase?: (phase: Phase) => void;
  onFlap?: () => void;
  onLamp?: () => void;
  onDone?: () => void;
}

const VB = 400;
const C = VB / 2;
/** Radii, in the drawing's units (the wheel is 400 across). */
const R = { frame: 199, bulbs: 191, rim: 182, face: 178, pegs: 172, label: 157, inner: 76, hub: 74, lamps: 57, core: 38 } as const;
/** Where the flapper hangs from, and how long it is: its tip reaches down between the pegs. */
const HINGE_Y = 5;
const TIP_Y = 39;

/** Each segment's paint: its colour, its edge and the colour of its number. */
export const SEGMENT_LOOK: Readonly<Record<string, { fill: string; edge: string; ink: string }>> = {
  '2': { fill: '#1d56b8', edge: '#123a80', ink: '#ffffff' },
  '4': { fill: '#17834a', edge: '#0d5a31', ink: '#ffffff' },
  '5': { fill: '#7036b8', edge: '#4c2380', ink: '#ffffff' },
  '8': { fill: '#bd5a0c', edge: '#843d06', ink: '#ffffff' },
  '10': { fill: '#c11f33', edge: '#86121f', ink: '#ffffff' },
  '20': { fill: '#cfd3de', edge: '#8e95a8', ink: '#1a2133' },
  '40': { fill: '#f4c430', edge: '#b28710', ink: '#6e0c0c' },
  bonus: { fill: '#1b1748', edge: '#0d0b2a', ink: '#ffd86b' },
};

export const lookOf = (segment: Segment) => SEGMENT_LOOK[String(segment)];

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** A point at radius `r` and compass angle `deg` (0 at the top, clockwise). */
function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

function sector(rIn: number, rOut: number, a0: number, a1: number): string {
  const [x1, y1] = polar(rOut, a0);
  const [x2, y2] = polar(rOut, a1);
  const [x3, y3] = polar(rIn, a1);
  const [x4, y4] = polar(rIn, a0);
  return `M${fmt(x1)} ${fmt(y1)}A${rOut} ${rOut} 0 0 1 ${fmt(x2)} ${fmt(y2)}L${fmt(x3)} ${fmt(y3)}A${rIn} ${rIn} 0 0 0 ${fmt(x4)} ${fmt(y4)}Z`;
}

const BONUS_LETTERS = ['B', 'O', 'N', 'U', 'S'];
const BULBS = 36;

/** The wheel's face, drawn once: it only ever turns. */
const Face = memo(function Face() {
  return (
    <>
      <circle cx={C} cy={C} r={R.rim} fill="#1a1208" />
      {WHEEL.map((segment, index) => {
        const centre = index * SEG;
        const look = lookOf(segment);
        const [lx, ly] = polar(R.label, centre);
        return (
          <g key={index} className={segment === 'bonus' ? styles.bonusSegment : undefined} data-segment={index}>
            <path d={sector(R.inner, R.face, centre - SEG / 2, centre + SEG / 2)} fill={look.fill} stroke={look.edge} strokeWidth={0.6} />
            {/* A lighter band at the rim, as a painted wheel's edge catches the light. */}
            <path d={sector(R.label + 11, R.face - 1, centre - SEG / 2 + 0.3, centre + SEG / 2 - 0.3)} fill="#ffffff" opacity={0.13} />
            {segment === 'bonus' ? (
              <>
                <text x={fmt(lx)} y={fmt(ly + 1)} className={styles.faceStar} fill={look.ink} textAnchor="middle" dominantBaseline="central" transform={`rotate(${fmt(centre)} ${fmt(lx)} ${fmt(ly)})`}>
                  ★
                </text>
                {BONUS_LETTERS.map((letter, i) => {
                  const [bx, by] = polar(R.label - 17 - i * 12.5, centre);
                  return (
                    <text key={letter} x={fmt(bx)} y={fmt(by)} className={styles.faceLetter} fill={look.ink} textAnchor="middle" dominantBaseline="central" transform={`rotate(${fmt(centre)} ${fmt(bx)} ${fmt(by)})`}>
                      {letter}
                    </text>
                  );
                })}
              </>
            ) : (
              <>
                <text x={fmt(lx)} y={fmt(ly)} className={styles.faceNumber} fill={look.ink} textAnchor="middle" dominantBaseline="central" transform={`rotate(${fmt(centre)} ${fmt(lx)} ${fmt(ly)})`}>
                  {segment}
                </text>
                {segment >= 20 && (
                  <text
                    x={fmt(polar(R.label - 30, centre)[0])}
                    y={fmt(polar(R.label - 30, centre)[1])}
                    className={styles.faceStarSmall}
                    fill={look.ink}
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${fmt(centre)} ${fmt(polar(R.label - 30, centre)[0])} ${fmt(polar(R.label - 30, centre)[1])})`}
                  >
                    ★
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
      {/* The pegs, one between each two segments, near the rim: what the flapper clacks over. */}
      {WHEEL.map((_, index) => {
        const [px, py] = polar(R.pegs, index * SEG + SEG / 2);
        return <circle key={index} cx={fmt(px)} cy={fmt(py)} r={2.5} className={styles.peg} />;
      })}
      <circle cx={C} cy={C} r={R.face} fill="none" stroke="#d9a93a" strokeWidth={1.4} />
      <circle cx={C} cy={C} r={R.inner} fill="none" stroke="#d9a93a" strokeWidth={1.2} />
    </>
  );
});

/** The frame round the wheel: brass, with a ring of bulbs that chase while it turns. */
const Frame = memo(function Frame() {
  return (
    <>
      <circle cx={C} cy={C} r={R.frame} className={styles.frameRing} />
      <circle cx={C} cy={C} r={R.frame - 13} fill="none" stroke="#5c3d0a" strokeWidth={1} />
      {Array.from({ length: BULBS }, (_, i) => {
        const [bx, by] = polar(R.bulbs, (i * 360) / BULBS + 5);
        return <circle key={i} cx={fmt(bx)} cy={fmt(by)} r={3.6} className={styles.bulb} data-group={i % 3} />;
      })}
    </>
  );
});

const WIN_WEDGE = sector(R.inner, R.face, -SEG / 2, SEG / 2);

export const Wheel = ({ run, skipped, rest, restLamp, phase, win, hub, calm, label, onPhase, onFlap, onLamp, onDone }: WheelProps) => {
  const rotor = useRef<SVGSVGElement>(null);
  const flapper = useRef<SVGSVGElement>(null);
  const lamps = useRef<(SVGGElement | null)[]>([]);
  const skippedRef = useRef(skipped);
  const calmRef = useRef(calm);
  const handlers = useRef({ onPhase, onFlap, onLamp, onDone });
  const finished = useRef<string | null>(null);
  useEffect(() => {
    skippedRef.current = skipped;
    calmRef.current = calm;
    handlers.current = { onPhase, onFlap, onLamp, onDone };
  });

  useEffect(() => {
    if (!run) return;
    const { show } = run;
    let raf = 0;
    let start: number | null = null;
    let lastPhase: Phase | null = null;
    let lastLamp: number | null = -1;
    let pegs = pegsPast(show.steps[0].wheel?.from ?? show.rest);
    let release = { at: -Infinity, bend: 0 };
    let wasTouching = false;
    let bendNow = 0;
    const tick = (now: number) => {
      start ??= now;
      const ms = skippedRef.current ? show.length : now - start;
      const frame = frameAt(show, ms);
      if (rotor.current) rotor.current.style.transform = `rotate(${fmt(frame.angle)}deg)`;
      // The flapper: bent by the peg at its tip the way the wheel turns, swinging free once it slips off.
      const x = pegAt(frame.angle);
      const touch = !calmRef.current && touching(x);
      const free = calmRef.current ? 0 : freeSwing(release.bend, now - release.at);
      const bend = touch ? Math.max(pushedBend(x), free) : free;
      if (wasTouching && !touch) release = { at: now, bend: bendNow };
      wasTouching = touch;
      bendNow = bend;
      if (flapper.current) flapper.current.style.transform = `rotate(${fmt(-bend)}deg)`;
      const passed = pegsPast(frame.angle);
      if (passed > pegs && !skippedRef.current) handlers.current.onFlap?.();
      pegs = passed;
      if (frame.lamp !== lastLamp) {
        lamps.current.forEach((lamp, i) => lamp?.setAttribute('data-on', String(i === frame.lamp)));
        if (frame.lamp !== null && lastLamp !== null && lastLamp !== -1 && !skippedRef.current) handlers.current.onLamp?.();
        lastLamp = frame.lamp;
      }
      if (frame.phase !== lastPhase) {
        lastPhase = frame.phase;
        handlers.current.onPhase?.(frame.phase);
      }
      if (frame.phase === 'done') {
        if (finished.current !== run.id) {
          finished.current = run.id;
          handlers.current.onDone?.();
        }
        // The flapper keeps swinging a moment after the wheel has stopped.
        if (Math.abs(bend) < 0.1 || calmRef.current) {
          if (flapper.current) flapper.current.style.transform = 'rotate(0deg)';
          return;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [run]);

  const restAngle = `rotate(${fmt(rest)}deg)`;
  return (
    <div className={styles.wheel} role="img" aria-label={label} data-testid="bw-wheel" data-phase={phase} data-win={win ? 'true' : 'false'} data-dark={phase === 'second' ? 'true' : 'false'}>
      <svg className={styles.layer} viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <Frame />
      </svg>
      {/* The wheel itself, turned as a whole by the animation: React sets its angle only when it stands. */}
      <svg ref={rotor} className={`${styles.layer} ${styles.rotor}`} viewBox={`0 0 ${VB} ${VB}`} style={{ transform: restAngle }} aria-hidden="true" focusable="false" data-testid="bw-rotor">
        <Face />
      </svg>
      <svg className={styles.layer} viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="bw-shade" cx="50%" cy="42%" r="55%">
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="85%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
          </radialGradient>
          <radialGradient id="bw-sky" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#2c2a78" />
            <stop offset="70%" stopColor="#14123f" />
            <stop offset="100%" stopColor="#090820" />
          </radialGradient>
        </defs>
        {/* Light on the wheel's face, which stays where it is as the wheel turns under it. */}
        <circle cx={C} cy={C} r={R.face} fill="url(#bw-shade)" pointerEvents="none" />
        {/* The stop under the pointer, lit when it wins. */}
        <path d={WIN_WEDGE} className={styles.winWedge} />
        {/* The hub: a night sky with the ring of star lamps, the Milky Way Chance's. */}
        <circle cx={C} cy={C} r={R.hub} fill="url(#bw-sky)" stroke="#d9a93a" strokeWidth={3} />
        <path d={`M${C - 52} ${C + 18} Q${C} ${C - 30} ${C + 54} ${C - 16}`} className={styles.milkyWay} />
        {LAMPS.map((multiplier, i) => {
          const [lx, ly] = polar(R.lamps, i * LAMP_STEP);
          return (
            <g
              key={i}
              ref={(element) => {
                lamps.current[i] = element;
              }}
              className={styles.lamp}
              data-on={restLamp === i ? 'true' : 'false'}
              data-top={multiplier === 10 ? 'true' : 'false'}
            >
              <circle cx={fmt(lx)} cy={fmt(ly)} r={8.4} />
              <text x={fmt(lx)} y={fmt(ly)} textAnchor="middle" dominantBaseline="central">
                {multiplier}
              </text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r={R.core} className={styles.core} />
        <text x={C} y={C} className={styles.hubText} textAnchor="middle" dominantBaseline="central" data-testid="bw-hub">
          {hub}
        </text>
      </svg>
      {/* The flapper, on its own layer, swung about its hinge at the top. */}
      <svg ref={flapper} className={`${styles.layer} ${styles.flapper}`} viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <path d={`M${C - 4.6} ${HINGE_Y} L${C + 4.6} ${HINGE_Y} L${C + 2.4} ${TIP_Y - 2.5} Q${C} ${TIP_Y + 1.5} ${C - 2.4} ${TIP_Y - 2.5} Z`} className={styles.flap} />
        <path d={`M${C - 1} ${HINGE_Y + 3} L${C - 0.6} ${TIP_Y - 5}`} className={styles.flapShine} />
      </svg>
      {/* The pointer's housing over the hinge. */}
      <svg className={styles.layer} viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <path d={`M${C - 19} 0 L${C + 19} 0 L${C + 11} 14 L${C} 21 L${C - 11} 14 Z`} className={styles.pointer} />
        <circle cx={C} cy={7.5} r={4.2} className={styles.jewel} />
      </svg>
    </div>
  );
};

/** How many segments and lamps the wheel draws, for its tests. */
export const DRAWN = { segments: SEGMENT_COUNT, lamps: LAMP_COUNT, bulbs: BULBS } as const;
