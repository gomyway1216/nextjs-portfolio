'use client';

import { memo, useId, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { HEAP_SPOTS, TRAY, heapCount, leaveSide, trayChange } from './panel';
import look from './ControlPanel.module.css';

/** A medal on its way: dropping in from the chute to its place, or leaving the heap towards a feed button. */
interface Flight {
  id: number;
  way: 'in' | 'out';
  /** Where it lands, or where it leaves from. */
  x: number;
  y: number;
  /** For one that leaves: towards the left button (-1) or the right (1). */
  side: -1 | 1;
  /** How long after the change it sets off, in milliseconds: several at once come one after another. */
  delay: number;
}

/** What the tray remembers between two renders: the purse it last drew, the medals on their way, and whose turn it is to leave. */
interface Seen {
  credits: number;
  flights: Flight[];
  /** The first medal of the heap that has only just been put there: it is not seen until the one dropping in has landed. */
  fresh: number;
  next: number;
  turn: number;
}

/** Whether the device asks for less motion. On the server, and in the render that takes over from it, the answer is no. */
const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const watchMotion = (changed: () => void) => {
  const query = window.matchMedia(LESS_MOTION);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
};
const wantsLessMotion = () => window.matchMedia(LESS_MOTION).matches;
const onServer = () => false;

/** The medals that may be on their way at once. More are not drawn, and those that have been forgotten by then have long landed. */
const FLIGHTS_KEPT = 10;

const Medal = ({ face, edge }: { face: string; edge: string }) => (
  <>
    <ellipse cy={1.1} rx={TRAY.medal.rx} ry={TRAY.medal.ry} fill={edge} />
    <ellipse rx={TRAY.medal.rx} ry={TRAY.medal.ry} fill={face} stroke="#8a5a06" strokeWidth={0.5} />
    <ellipse cx={-1} cy={-0.7} rx={TRAY.medal.rx * 0.5} ry={TRAY.medal.ry * 0.36} fill="#fff7c8" opacity={0.6} />
  </>
);

export interface MedalTrayProps {
  /** The medals in the purse. */
  credits: number;
  /** Whether each feed button is held, the left one's first: a medal that is fed leaves towards the one that is. */
  held: readonly [boolean, boolean];
}

/**
 * The tray in front of the player: a steel dish under the counter, with the
 * mouth of the chute the machine pays through at its back (both drawn by
 * the panel's sheet), and in it the medals of the purse, heaped. A medal that is won drops in from the chute;
 * one that is fed leaves the heap towards the button that fed it. The heap is
 * as many medals as the purse holds until it is full; the counter above it
 * says how many there are.
 *
 * It is a picture of the purse and of nothing else: it is drawn from the
 * count, and what it acts out is the change in the count from one render to
 * the next. Where the device asks for less motion nothing is acted out, and
 * the heap only changes.
 */
export const MedalTray = memo(function MedalTray({ credits, held }: MedalTrayProps) {
  const id = useId();
  const calm = useSyncExternalStore(watchMotion, wantsLessMotion, onServer);
  const [seen, setSeen] = useState<Seen>({ credits, flights: [], fresh: Number.POSITIVE_INFINITY, next: 1, turn: 0 });
  const count = heapCount(credits);

  // The purse has changed since the tray was last drawn: what changed is acted out. (State that follows a prop is set
  // while rendering, which React takes up before it paints.)
  if (credits !== seen.credits) {
    // Where less motion is asked for nothing is acted out: the heap only changes.
    const { arrive, leave } = calm ? { arrive: 0, leave: 0 } : trayChange(seen.credits, credits);
    const was = heapCount(seen.credits);
    const flights: Flight[] = [];
    let { next, turn } = seen;
    for (let n = 0; n < arrive; n++) {
      // Each drops to a place of its own: the newest places of the heap, or the top of a heap that is full.
      const spot = HEAP_SPOTS[Math.max(0, Math.min(HEAP_SPOTS.length, count) - 1 - n)];
      flights.push({ id: next++, way: 'in', x: spot.x, y: spot.y, side: 1, delay: n * 70 });
    }
    for (let n = 0; n < leave; n++) {
      // The one that leaves is the last that was heaped.
      const spot = HEAP_SPOTS[Math.max(0, Math.min(HEAP_SPOTS.length - 1, was - 1 - n))];
      flights.push({ id: next++, way: 'out', x: spot.x, y: spot.y, side: leaveSide(held, turn++), delay: n * 70 });
    }
    setSeen({ credits, flights: [...seen.flights, ...flights].slice(-FLIGHTS_KEPT), fresh: arrive > 0 && count > was ? was : Number.POSITIVE_INFINITY, next, turn });
  }
  const land = (flight: number) => setSeen((now) => ({ ...now, flights: now.flights.filter((one) => one.id !== flight) }));

  const { width, height, chute } = TRAY;
  return (
    <span className={look.tray} data-testid="pusher-tray" data-heap={count} aria-hidden>
      {/* The dish and the mouth of the chute are the sheet's: they are as wide as the tray is. The medals are drawn here
          and keep their shape whatever shape the tray has: the heap stands on the floor of the dish, in the middle,
          under the chute. */}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMax meet" focusable="false">
        <defs>
          <radialGradient id={`${id}-gold`} cx="0.38" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#fff1a8" />
            <stop offset="0.5" stopColor="#f6c544" />
            <stop offset="1" stopColor="#b97c0c" />
          </radialGradient>
        </defs>
        <g className={look.heap}>
          {HEAP_SPOTS.slice(0, count).map((spot, index) => (
            <g key={index} transform={`translate(${spot.x.toFixed(2)} ${spot.y.toFixed(2)}) rotate(${spot.tilt.toFixed(1)})`} data-fresh={index >= seen.fresh || undefined}>
              <Medal face={`url(#${id}-gold)`} edge="#7a4d05" />
            </g>
          ))}
        </g>
        {seen.flights.map((flight) => (
          <g key={flight.id} transform={`translate(${flight.x.toFixed(2)} ${flight.y.toFixed(2)})`}>
            <g
              className={look.flight}
              data-way={flight.way}
              style={{ '--mp-from-x': `${(flight.way === 'in' ? chute.x - flight.x : 0).toFixed(2)}px`, '--mp-from-y': `${(flight.way === 'in' ? chute.y - flight.y : 0).toFixed(2)}px`, '--mp-to-x': `${flight.side * 52}px`, animationDelay: `${flight.delay}ms` } as CSSProperties}
              onAnimationEnd={() => land(flight.id)}
            >
              <Medal face={`url(#${id}-gold)`} edge="#7a4d05" />
            </g>
          </g>
        ))}
      </svg>
    </span>
  );
});
