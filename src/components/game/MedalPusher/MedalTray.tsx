'use client';

import { memo, useEffect, useId, useImperativeHandle, useState, useSyncExternalStore, type CSSProperties, type Ref } from 'react';
import { HEAP_SPOTS, STILL_TRAY, TRAY, heapCount, trayDue, trayHappen, trayHidden, trayLand, trayLanding, trayStill, washed, type TrayAir, type TrayNews } from './panel';
import { FACES, MEDAL_PAINT, faceOf } from './medalLook';
import look from './ControlPanel.module.css';

/** Whether the device asks for less motion. On the server, and in the render that takes over from it, the answer is no. */
const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const watchMotion = (changed: () => void) => {
  const query = window.matchMedia(LESS_MOTION);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
};
const wantsLessMotion = () => window.matchMedia(LESS_MOTION).matches;
const onServer = () => false;

/**
 * A medal as it is drawn in the tray, in each of the tones a medal on the
 * field can have gone to (see `FACES` in medalLook.ts): the paints the
 * field's renderer strikes a medal in, with the same washes laid over them.
 * The medals in the tray are the ones that were on the table, worn nickel,
 * and a few of them brighter, duller, darker or warmer than the rest.
 */
export const TRAY_TONES = FACES.map((wash, tone) => {
  const washes = tone === 0 ? [FACES[0]] : [FACES[0], wash];
  return {
    light: washed(MEDAL_PAINT.light, washes),
    face: washed(MEDAL_PAINT.face, washes),
    dark: washed(MEDAL_PAINT.dark, washes),
    rim: washed(MEDAL_PAINT.rim, washes),
    edge: washed(MEDAL_PAINT.edge, washes),
    glint: washed(MEDAL_PAINT.glint, washes),
  };
});

const Medal = ({ paint, tone }: { paint: string; tone: number }) => (
  <>
    <ellipse cy={1.1} rx={TRAY.medal.rx} ry={TRAY.medal.ry} fill={TRAY_TONES[tone].edge} />
    <ellipse rx={TRAY.medal.rx} ry={TRAY.medal.ry} fill={`url(#${paint}-${tone})`} stroke={TRAY_TONES[tone].rim} strokeWidth={0.5} />
    <ellipse cx={-1} cy={-0.7} rx={TRAY.medal.rx * 0.5} ry={TRAY.medal.ry * 0.36} fill={TRAY_TONES[tone].glint} opacity={0.42} />
  </>
);

/** What the cabinet can tell the tray. */
export interface MedalTrayHandle {
  /**
   * What happened to the purse: the medals that were fed, and what came in
   * and why. Returns whether the tray acts it out. Where it does not (the
   * device asks for less motion) nothing will be seen to land, and whoever
   * told it has the medals heard some other way.
   */
  happened(news: TrayNews): boolean;
  /** Another machine has been put up: the medals in the air were the old one's, and are gone. */
  still(): void;
}

export interface MedalTrayProps {
  /** The medals in the purse. */
  credits: number;
  /** Medals have been seen to land in the tray, this many together: they are heard there. */
  onLand?: (medals: number) => void;
  ref?: Ref<MedalTrayHandle>;
}

/**
 * The tray in front of the player: a steel dish under the counter, with the
 * mouth of the chute the machine pays through at its back (both drawn by the
 * panel's sheet), and in it the medals of the purse, heaped. The heap is as
 * many medals as the purse holds until it is full; the counter above it says
 * how many there are.
 *
 * The heap is a picture of the purse and of nothing else. What is acted out
 * over it is what the cabinet says happened (`happened`), and never a guess
 * from how much the count changed: a medal that was won drops in from the
 * chute, the day's bonus is counted out of it, a refill is tipped in over
 * the rim, and a medal that is fed leaves the heap towards the button that
 * fed it. A purse that changes with nothing said (a machine restored, reset,
 * or swapped for the account's) only changes the heap.
 *
 * A place of the heap whose medal is still in the air is not drawn until
 * that medal has landed. It lands when its time is up, whether or not it
 * could be drawn on the way, so no place stays hidden. Where the device asks
 * for less motion nothing is acted out, and medals that were in the air when
 * it asked are down at once.
 */
export const MedalTray = memo(function MedalTray({ credits, onLand, ref }: MedalTrayProps) {
  const id = useId();
  const calm = useSyncExternalStore(watchMotion, wantsLessMotion, onServer);
  const [air, setAir] = useState<TrayAir>(STILL_TRAY);
  const count = heapCount(credits);

  // Less motion has been asked for with medals on their way. They are not drawn any longer, so they are down now, and
  // every place is seen. (State that follows what is rendered is set while rendering, which React takes up before it
  // paints.)
  if (calm && air.flights.length > 0) setAir(trayStill(air));

  useImperativeHandle(
    ref,
    () => ({
      happened: (news) => {
        if (wantsLessMotion()) return false;
        const now = performance.now();
        setAir((was) => trayHappen(was, news, now));
        return true;
      },
      still: () => setAir(trayStill),
    }),
    [],
  );

  // The next medal in the air lands when its time is up, and so does every other whose time has come by then. The
  // tray does not wait to be told by the drawing that it has finished: a medal that is not drawn lands all the same.
  const due = trayDue(air);
  useEffect(() => {
    if (due === null) return undefined;
    const timer = window.setTimeout(
      () => {
        const now = Math.max(due, performance.now());
        const medals = trayLanding(air, now).reduce((sum, flight) => sum + (flight.way === 'in' ? flight.medals : 0), 0);
        if (medals > 0) onLand?.(medals);
        setAir((was) => trayLand(was, now));
      },
      Math.max(0, due - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [air, due, onLand]);

  const hidden = trayHidden(air);
  const lying = HEAP_SPOTS.slice(0, count).flatMap((spot, place) => (hidden.has(place) ? [] : [{ spot, place }]));
  const { width, height } = TRAY;
  return (
    <span className={look.tray} data-testid="pusher-tray" data-heap={count} data-lying={lying.length} aria-hidden>
      {/* The dish and the mouth of the chute are the sheet's: they are as wide as the tray is. The medals are drawn here
          and keep their shape whatever shape the tray has: the heap stands on the floor of the dish, in the middle,
          under the chute. */}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMax meet" focusable="false">
        <defs>
          {TRAY_TONES.map((tone, index) => (
            <radialGradient key={index} id={`${id}-${index}`} cx="0.38" cy="0.3" r="0.9">
              <stop offset="0" stopColor={tone.light} />
              <stop offset="0.5" stopColor={tone.face} />
              <stop offset="1" stopColor={tone.dark} />
            </radialGradient>
          ))}
        </defs>
        <g data-part="heap">
          {lying.map(({ spot, place }) => (
            <g key={place} transform={`translate(${spot.x.toFixed(2)} ${spot.y.toFixed(2)}) rotate(${spot.tilt.toFixed(1)})`}>
              <Medal paint={id} tone={faceOf(place)} />
            </g>
          ))}
        </g>
        {air.flights.map((flight) => (
          <g key={flight.id} transform={`translate(${flight.x.toFixed(2)} ${flight.y.toFixed(2)})`}>
            <g
              className={look.flight}
              data-way={flight.way}
              data-from={flight.from ?? undefined}
              style={{ '--mp-dx': `${flight.dx.toFixed(2)}px`, '--mp-dy': `${flight.dy.toFixed(2)}px`, animationDelay: `${flight.delay}ms`, animationDuration: `${flight.time}ms` } as CSSProperties}
            >
              {/* It is the medal of the place it lands on, or left: the same tone on the way as lying there. */}
              <Medal paint={id} tone={faceOf(flight.place)} />
            </g>
          </g>
        ))}
      </svg>
    </span>
  );
});
