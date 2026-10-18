'use client';

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { gateMark, type HorseStrings } from './i18n';
import { MARGINS, callsOf, progressAt, standingsAt, type Call, type RacePlan } from './race';
import { GATE_COLOURS, type Horse } from './stable';
import { CY, DISTANCE, FINISH_X, LENGTH, RAIL_IN, RAIL_OUT, START_X, VIEW, X0, X1, laneRadius, spotAt } from './geometry';
import styles from './HorseRace.module.css';

/** How long the field stands in the gate after START before the off, in seconds: the fanfare's length. */
export const GATE_SECONDS = 2.1;
/** How often the running order under the track is written while the horses run, in milliseconds. */
const ORDER_EVERY = 200;

/** A race the track is running: its plan, and when its gates open (performance.now(), in ms). */
export interface TrackRun {
  id: string;
  plan: RacePlan;
  opensAt: number;
}

export interface TrackProps {
  /** The horses, in gate order. */
  field: readonly Horse[];
  /** The race being run, or null while the field waits in the gate. */
  run: TrackRun | null;
  /** The player has skipped to the result: the race is shown at its end at once. */
  skipped: boolean;
  /** The winner has reached the post. */
  onPost: () => void;
  /** The race has been run to its end (or skipped to it). */
  onFinished: () => void;
  /** Each stride of the field at the gallop, for its sound. */
  onStride?: () => void;
  /** The gate has opened. */
  onOff?: () => void;
  t: HorseStrings;
  language: 'en' | 'ja';
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** The oval's outline at radius r, as a path. */
const oval = (r: number): string => `M ${X0} ${CY - r} H ${X1} A ${r} ${r} 0 0 1 ${X1} ${CY + r} H ${X0} A ${r} ${r} 0 0 1 ${X0} ${CY - r} Z`;

/** Where a horse stands before the off: in its stall, a touch behind the line. */
const IN_GATE = -1.5;
/** How far a figure's nose is ahead of its middle, and how much bigger the photo draws the figures. */
const NOSE = 9.5;
const PHOTO_SIZE = 1.6;
/** How big a figure is drawn on the track: a touch wider than its lane, as a horse is wider than a lane's chalk lines. */
const FIGURE_SIZE = 1.15;

/** A horse seen from above, heading right: its coat, the number cloth in its gate's colour, the jockey's silks and cap. */
const HorseFigure = ({ horse, gate }: { horse: Horse; gate: number }) => {
  const cloth = GATE_COLOURS[gate - 1];
  const { body, trim, pattern } = horse.silks;
  return (
    <>
      <path d="M -7.2 0 L -9.6 -0.7 L -9.4 0.7 Z" fill={horse.coat} opacity="0.85" />
      <ellipse cx="0" cy="0" rx="6.4" ry="2.5" fill={horse.coat} />
      <ellipse cx="6.6" cy="0" rx="2.9" ry="1.25" fill={horse.coat} />
      <rect x="-2.8" y="-3.1" width="4.4" height="6.2" rx="0.9" fill={cloth.cloth} stroke="rgba(0,0,0,0.35)" strokeWidth="0.3" />
      <ellipse cx="-0.4" cy="0" rx="2.3" ry="1.95" fill={body} stroke="rgba(0,0,0,0.3)" strokeWidth="0.25" />
      {pattern === 'hoops' && <rect x="-1.1" y="-1.9" width="1.1" height="3.8" fill={trim} />}
      {pattern === 'stripes' && <rect x="-2.6" y="-0.45" width="4.4" height="0.9" fill={trim} />}
      {pattern === 'sash' && <path d="M -2.2 -1.2 L 1.2 1.6 L 0.4 1.9 L -2.6 -0.4 Z" fill={trim} />}
      {pattern === 'halves' && <path d="M -0.4 -1.95 A 2.3 1.95 0 0 1 -0.4 1.95 Z" fill={trim} />}
      {pattern === 'diamond' && <path d="M -0.4 -1.3 L 0.6 0 L -0.4 1.3 L -1.4 0 Z" fill={trim} />}
      <circle cx="1.5" cy="0" r="1.2" fill={cloth.cloth} stroke="rgba(0,0,0,0.45)" strokeWidth="0.3" />
    </>
  );
};

const transformAt = (s: number, gate: number): string => {
  const { x, y, heading } = spotAt(s, gate - 1);
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${heading.toFixed(1)}) scale(${FIGURE_SIZE})`;
};

/** The last thing the caller has said by `t` seconds after the off. */
const callAt = (calls: readonly Call[], t: number): number => {
  let at = -1;
  for (let i = 0; i < calls.length; i += 1) if (calls[i].t <= t) at = i;
  return at;
};

/**
 * The miniature track and its race: the oval, the gate, the post and six
 * horses, moved straight on the page frame by frame while a race runs (no
 * React render for a frame), and under it the race caller's line and the
 * running order. When the winner reaches the post, the infield's screen shows
 * the finish-line photo.
 */
export const Track = memo(function Track({ field, run, skipped, onPost, onFinished, onStride, onOff, t, language }: TrackProps) {
  const horses = useRef<(SVGGElement | null)[]>([]);
  const strides = useRef<(SVGGElement | null)[]>([]);
  const [callIndex, setCallIndex] = useState(-1);
  const [order, setOrder] = useState<number[]>(() => field.map((_, i) => i + 1));
  const [posted, setPosted] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const calls = useMemo(() => (run ? callsOf(run.plan) : []), [run]);
  // The latest callbacks, for the frame loop.
  const live = useRef({ onPost, onFinished, onStride, onOff });
  useEffect(() => {
    live.current = { onPost, onFinished, onStride, onOff };
  });

  // A new race, or none: the caller, the order and the photo start again. (Set while rendering, as React allows for
  // state that follows a prop, so that the first frame of a race never shows the last race's photo.)
  const [seenRun, setSeenRun] = useState<TrackRun | null>(run);
  if (seenRun !== run) {
    setSeenRun(run);
    setCallIndex(-1);
    setPosted(false);
    setGateOpen(false);
    setOrder(field.map((_, i) => i + 1));
  }

  useEffect(() => {
    const place = (time: number | null) => {
      for (let gate = 1; gate <= field.length; gate += 1) {
        const s = run && time !== null && time > 0 ? progressAt(run.plan, gate, time) : IN_GATE;
        horses.current[gate - 1]?.setAttribute('transform', transformAt(s, gate));
        // A stride: the body stretches and gathers with the gallop.
        const phase = run && time !== null && time > 0 && time < run.plan.finish[gate - 1] + 1.2 ? Math.sin((s / LENGTH) * Math.PI * 1.6 + gate) : 0;
        strides.current[gate - 1]?.setAttribute('transform', `scale(${(1 + 0.07 * phase).toFixed(3)} ${(1 - 0.04 * phase).toFixed(3)})`);
      }
    };
    if (!run) {
      place(null);
      return;
    }
    const { plan } = run;
    const winnerAt = Math.min(...plan.finish);
    let posts = false;
    let off = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      live.current.onFinished();
    };
    const post = () => {
      if (posts) return;
      posts = true;
      setPosted(true);
      live.current.onPost();
    };
    // Skipped, or the player asks for less motion: the race is shown as it ends, at once.
    if (skipped || reducedMotion()) {
      place(plan.end);
      const timer = window.setTimeout(
        () => {
          setGateOpen(true);
          setOrder(plan.order.slice());
          setCallIndex(calls.length - 1);
          post();
          finish();
        },
        skipped ? 0 : 400,
      );
      return () => window.clearTimeout(timer);
    }
    let frame = 0;
    let lastOrder = -Infinity;
    let lastStride = -Infinity;
    let said = -1;
    const tick = (now: number) => {
      const time = (now - run.opensAt) / 1000;
      place(time);
      if (time >= 0 && !off) {
        off = true;
        setGateOpen(true);
        live.current.onOff?.();
      }
      const call = callAt(calls, time);
      if (call !== said) {
        said = call;
        setCallIndex(call);
      }
      if (time > 0 && now - lastOrder >= ORDER_EVERY) {
        lastOrder = now;
        const standing = standingsAt(plan, time);
        setOrder((before) => (before.every((gate, i) => gate === standing[i]) ? before : standing));
      }
      if (time > 0 && time < winnerAt + 0.8 && now - lastStride >= 450) {
        lastStride = now;
        live.current.onStride?.();
      }
      if (time >= winnerAt) post();
      if (time >= plan.end) {
        setOrder(plan.order.slice());
        finish();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [run, skipped, field, calls]);

  const nameOf = (gate: number): string => {
    const horse = field[gate - 1];
    return horse ? `${gateMark(gate)}${horse.name[language]}` : gateMark(gate);
  };
  const line = run ? (callIndex >= 0 ? t.call(calls[callIndex], nameOf) : t.gateIn) : '';
  const photo = run && posted ? run.plan : null;
  const lanes = field.map((_, i) => laneRadius(i));

  return (
    <div className={styles.trackBox}>
      <svg className={styles.track} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label={t.trackLabel} data-testid="hr-track" data-running={run && !posted ? 'true' : 'false'}>
        <rect x="0" y="0" width={VIEW.width} height={VIEW.height} rx="14" fill="#1d5a2a" />
        {/* The turf, the rails and the infield. */}
        <path d={oval(RAIL_OUT)} fill="#2f8a3b" />
        <path d={oval(RAIL_OUT - 0.5)} fill="none" stroke="#f4f4f0" strokeWidth="1.6" />
        <path d={oval(RAIL_IN)} fill="#3b9e49" stroke="#f4f4f0" strokeWidth="1.6" />
        {lanes.map((r, i) => (
          <path key={i} d={oval(r + 2.8)} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.5" />
        ))}
        <ellipse cx={X0 + 18} cy={CY} rx="14" ry="9" fill="#5fb6d9" opacity="0.85" />
        <ellipse cx={X1 - 18} cy={CY} rx="13" ry="8" fill="#2c7a35" />
        {/* The post: the line across the home straight, and its pole outside the rail. */}
        <line x1={FINISH_X} y1={CY + RAIL_IN} x2={FINISH_X} y2={CY + RAIL_OUT} stroke="#ffffff" strokeWidth="1.2" />
        <rect x={FINISH_X - 1.6} y={CY + RAIL_OUT - 1} width="3.2" height="9" fill="#d6262e" />
        <circle cx={FINISH_X} cy={CY + RAIL_OUT + 8} r="2.6" fill="#ffffff" stroke="#d6262e" strokeWidth="1" />
        {/* The starting gate on the far straight, a stall for each lane; it swings away at the off. */}
        <g className={styles.gate} data-open={gateOpen} aria-hidden>
          {lanes.map((r, i) => (
            <rect key={i} x={START_X - 9} y={CY - r - 2.6} width="12" height="5.2" rx="1" fill="rgba(210,214,220,0.35)" stroke="#d2d6dc" strokeWidth="0.8" />
          ))}
          <rect x={START_X - 10} y={CY - laneRadius(5) - 4} width="1.8" height={laneRadius(5) - laneRadius(0) + 8} fill="#9aa3ad" />
          <rect x={START_X + 3} y={CY - laneRadius(5) - 4} width="1.8" height={laneRadius(5) - laneRadius(0) + 8} fill="#9aa3ad" />
        </g>
        {field.map((horse, i) => (
          <g
            key={horse.id}
            ref={(element) => {
              horses.current[i] = element;
            }}
            transform={transformAt(IN_GATE, i + 1)}
            data-gate={i + 1}
          >
            <g
              ref={(element) => {
                strides.current[i] = element;
              }}
            >
              <HorseFigure horse={horse} gate={i + 1} />
            </g>
          </g>
        ))}
        {/* The finish-line photo, on the infield's screen. */}
        {photo && <FinishPhoto plan={photo} field={field} t={t} />}
      </svg>
      <p className={styles.commentary} data-testid="hr-commentary" aria-hidden>
        {line}
      </p>
      <ol className={styles.runningOrder} data-testid="hr-order" aria-hidden data-order={order.join('')}>
        {order.map((gate, i) => (
          <li key={gate} className={styles.orderChip} style={{ background: GATE_COLOURS[gate - 1].cloth, color: GATE_COLOURS[gate - 1].number }} data-place={i + 1}>
            {gate}
          </li>
        ))}
      </ol>
    </div>
  );
});

/**
 * The photo of the finish, as the winner's nose reaches the line: the first
 * three, close up, in lanes across the screen, the line down the middle.
 */
function FinishPhoto({ plan, field, t }: { plan: RacePlan; field: readonly Horse[]; t: HorseStrings }) {
  const winnerAt = Math.min(...plan.finish);
  const photo = (MARGINS.find((m) => m.id === plan.margins[1])?.lengths ?? 1) <= 0.25;
  // The screen: 150 × 66 in the infield. The line at its right third; three lengths behind it fit to the left.
  const left = X0 + 5;
  const top = CY - 33;
  const width = X1 - X0 - 10;
  const lineX = left + width * 0.72;
  const scale = (width * 0.62) / (3 * LENGTH);
  const clip = useId();
  return (
    <g data-testid="hr-photo" data-photo={photo} className={styles.photo}>
      <clipPath id={clip}>
        <rect x={left} y={top} width={width} height="66" rx="4" />
      </clipPath>
      <rect x={left} y={top} width={width} height="66" rx="4" fill="#101418" stroke="#f2c94c" strokeWidth="1.2" />
      <text x={left + 6} y={top + 11} fill="#f2c94c" fontSize="8" fontWeight="800">
        {photo ? t.photoFinish : t.photo}
      </text>
      <line x1={lineX} y1={top + 14} x2={lineX} y2={top + 62} stroke="#ffffff" strokeWidth="0.8" />
      <g clipPath={`url(#${clip})`}>
      {plan.order.slice(0, 3).map((gate, place) => {
        const behind = DISTANCE - progressAt(plan, gate, winnerAt);
        // A figure's nose is NOSE units ahead of its middle, drawn here at PHOTO_SIZE: the winner's nose is on the line.
        const x = lineX - behind * scale - NOSE * PHOTO_SIZE;
        const y = top + 24 + place * 15;
        return (
          <g key={gate} transform={`translate(${x.toFixed(2)} ${y}) scale(${PHOTO_SIZE})`} data-place={place + 1} data-gate={gate}>
            <HorseFigure horse={field[gate - 1]} gate={gate} />
          </g>
        );
      })}
      </g>
      <text x={left + width - 6} y={top + 61} fill="#ffffff" fontSize="7.5" fontWeight="700" textAnchor="end">
        {t.margin[plan.margins[1]]}
      </text>
    </g>
  );
}
