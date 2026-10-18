'use client';

import { useEffect, useRef } from 'react';
import type { Face } from './engine';
import { Pips } from './Dice';
import { DIE_FACES, DOME, poseAtTime, rotate, type Pose, type ShakeEvent, type ShakePlan } from './physics';
import styles from './SicBo.module.css';

/**
 * The shaker as the player sees it: a lit base, a felt platter under a glass
 * dome, seen from in front and above, and three dice on it drawn as cubes in
 * the page's own 3D. A roll is played back from its plan (physics.ts) one frame
 * at a time, writing only the dice's transforms (and how much light each face
 * catches), so React draws nothing while the dice fly.
 *
 * The scene is laid out in units of the stage's width (`cqw`): the die's edge
 * is `--s`, 11% of it, and every length the frames give in edges is that many
 * `--s`. Nothing is measured.
 */

/** The stage's height, in hundredths of its width. */
export const STAGE_HEIGHT = 70;
/** Where the platter's middle is, down the stage, in hundredths of its width. */
export const CENTRE_Y = 36.5;
/** The die's edge, in hundredths of the stage's width. */
export const DIE_UNITS = 11;
/** How far the platter is tipped towards the player, in degrees. */
export const TILT = 42;
/** The dome's radius on the stage. */
const DOME_UNITS = DOME * DIE_UNITS;
/** How long the dice take to be put down where they rest with less motion asked for, in ms. */
export const CALM_MS = 450;

/** Where the light comes from, in the platter's frame: above, a little to the left and towards the player. */
const LIGHT = (() => {
  const v = { x: -0.32, y: 0.38, z: 0.87 };
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
})();

const fixed = (n: number) => (Math.abs(n) < 5e-5 ? '0' : n.toFixed(4));

/** A die's transform: where it is, in edges of `--s`, and its turn as an axis and an angle. */
export function dieTransform(pose: Pose): string {
  const { q } = pose;
  const sign = q.w < 0 ? -1 : 1;
  const w = Math.min(1, sign * q.w);
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  const axis = s < 1e-6 ? [0, 0, 1] : [(sign * q.x) / s, (sign * q.y) / s, (sign * q.z) / s];
  return `translate3d(calc(${fixed(pose.x)} * var(--s)), calc(${fixed(pose.y)} * var(--s)), calc(${fixed(pose.z)} * var(--s))) rotate3d(${fixed(axis[0])}, ${fixed(axis[1])}, ${fixed(axis[2])}, ${fixed(angle)}rad)`;
}

/** A die's shadow on the felt: under it, larger and fainter the higher it is. */
export function shadowStyle(pose: Pose): { transform: string; opacity: string } {
  const high = Math.max(0, pose.z - 0.5);
  return { transform: `translate3d(calc(${fixed(pose.x)} * var(--s)), calc(${fixed(pose.y)} * var(--s)), 1px) scale(${fixed(1 + high * 0.16)})`, opacity: fixed(Math.max(0.12, 0.5 - high * 0.13)) };
}

/** How much darker each face is than the light makes it, in the order of `DIE_FACES`. */
export function shadesOf(pose: Pose): number[] {
  return DIE_FACES.map(({ axis }) => {
    const n = rotate(pose.q, axis);
    const lit = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
    return 0.5 * (1 - lit);
  });
}

/** A roll to show: its plan, and whether it is played out or put straight where it ends. */
export interface ShakeRun {
  id: number;
  plan: ShakePlan;
  mode: 'animate' | 'calm';
}

export type Lights = 'idle' | 'attract' | 'shake' | 'settle' | 'big' | 'small' | 'triple';

export interface DomeProps {
  run: ShakeRun | null;
  /** Where the dice lie when no roll is being shown. Kept the same object while a roll is shown. */
  rest: readonly Pose[];
  skipped: boolean;
  lights: Lights;
  label: string;
  /** Words over the dome, always there and only shown when there is something to say. */
  banner: string | null;
  onSettle: (id: number) => void;
  onEvent: (event: ShakeEvent) => void;
  onDone: (id: number) => void;
  domeRef?: React.Ref<HTMLDivElement>;
}

/** The face elements' own turns, putting each on its side of the cube. */
const FACE_PLACES = ['rotateY(90deg)', 'rotateY(-90deg)', 'rotateX(-90deg)', 'rotateX(90deg)', 'rotateY(0deg)', 'rotateY(180deg)'];

/** The base, the felt and the dome's glass, in the stage's own units (its width is 100). */
const Base = () => {
  const cx = 50;
  const cy = CENTRE_Y;
  const rx = DOME_UNITS + 3.2;
  const ry = rx * Math.cos((TILT * Math.PI) / 180);
  const depth = 7;
  return (
    <svg className={styles.base} viewBox={`0 0 100 ${STAGE_HEIGHT}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sb-base-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#14112e" />
          <stop offset="0.5" stopColor="#3b3470" />
          <stop offset="1" stopColor="#14112e" />
        </linearGradient>
      </defs>
      {/* The base's side, under the platter's front edge. */}
      <path d={`M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy} L${cx + rx} ${cy + depth} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy + depth} Z`} fill="url(#sb-base-side)" />
      {/* The ring of lamps round the base. */}
      <path className={styles.ledRing} d={`M${cx - rx + 0.6} ${cy + depth * 0.55} A${rx - 0.6} ${ry} 0 0 0 ${cx + rx - 0.6} ${cy + depth * 0.55}`} pathLength={100} />
      {/* The platter's brass rim, round the felt. */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#2a2152" stroke="#d6b25e" strokeWidth={1.1} />
    </svg>
  );
};

/** The dome's glass: a half ball over the platter, drawn in front of the dice, its shine and its rim. */
const Glass = () => {
  const cx = 50;
  const cy = CENTRE_Y;
  const r = DOME_UNITS + 0.6;
  const ry = r * Math.cos((TILT * Math.PI) / 180);
  return (
    <svg className={styles.glass} viewBox={`0 0 100 ${STAGE_HEIGHT}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="sb-glass" cx="0.36" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="0.45" stopColor="#dfe6ff" stopOpacity="0.05" />
          <stop offset="0.85" stopColor="#c9d4ff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} A${r} ${ry} 0 0 1 ${cx - r} ${cy} Z`} fill="url(#sb-glass)" stroke="rgba(230, 236, 255, 0.55)" strokeWidth={0.6} />
      {/* The light on the glass: a long shine up the left, and a small one at the top right. */}
      <path d={`M${cx - r * 0.8} ${cy - r * 0.18} A${r * 0.86} ${r * 0.86} 0 0 1 ${cx - r * 0.26} ${cy - r * 0.8}`} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.6} strokeLinecap="round" />
      <ellipse cx={cx + r * 0.42} cy={cy - r * 0.66} rx={2.4} ry={1.2} fill="rgba(255,255,255,0.45)" transform={`rotate(32 ${cx + r * 0.42} ${cy - r * 0.66})`} />
      {/* The dome's foot, the front of its ring on the platter. */}
      <path d={`M${cx - r} ${cy} A${r} ${ry} 0 0 0 ${cx + r} ${cy}`} fill="none" stroke="rgba(214, 178, 94, 0.9)" strokeWidth={0.9} />
    </svg>
  );
};

/** One die: six faces, each with its pips and the shade the light leaves on it, round a core that fills its rounded edges. */
const Die = ({ pose, dieRef, shadeRefs }: { pose: Pose; dieRef: (element: HTMLDivElement | null) => void; shadeRefs: (index: number, element: HTMLSpanElement | null) => void }) => {
  const shades = shadesOf(pose);
  return (
    <div className={styles.die} ref={dieRef} style={{ transform: dieTransform(pose) }}>
      <span className={`${styles.core} ${styles.coreX}`} />
      <span className={`${styles.core} ${styles.coreY}`} />
      <span className={`${styles.core} ${styles.coreZ}`} />
      {DIE_FACES.map(({ face }, index) => (
        <span key={face} className={styles.dieFace} style={{ transform: `${FACE_PLACES[index]} translateZ(calc(var(--s) / 2))` }} data-face={face}>
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <Pips face={face as Face} />
          </svg>
          <span className={styles.shade} ref={(element) => shadeRefs(index, element)} style={{ opacity: fixed(shades[index]) }} />
        </span>
      ))}
    </div>
  );
};

export const Dome = ({ run, rest, skipped, lights, label, banner, onSettle, onEvent, onDone, domeRef }: DomeProps) => {
  const dice = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const shadows = useRef<(HTMLSpanElement | null)[]>([null, null, null]);
  const shades = useRef<(HTMLSpanElement | null)[][]>([[], [], []]);
  const rig = useRef<HTMLDivElement | null>(null);
  const skippedRef = useRef(skipped);
  const handlers = useRef({ onSettle, onEvent, onDone });
  useEffect(() => {
    skippedRef.current = skipped;
  }, [skipped]);
  useEffect(() => {
    handlers.current = { onSettle, onEvent, onDone };
  });

  useEffect(() => {
    if (!run) return;
    const { plan, mode, id } = run;
    const draw = (t: number) => {
      for (let die = 0; die < 3; die++) {
        const pose = poseAtTime(plan, t, die);
        const element = dice.current[die];
        if (element) element.style.transform = dieTransform(pose);
        const shadow = shadows.current[die];
        if (shadow) {
          const look = shadowStyle(pose);
          shadow.style.transform = look.transform;
          shadow.style.opacity = look.opacity;
        }
        shadesOf(pose).forEach((shade, index) => {
          const span = shades.current[die][index];
          if (span) span.style.opacity = fixed(shade);
        });
      }
      const jolt = mode === 'animate' ? plan.jolt[Math.min(plan.count - 1, Math.round(t * 60))] ?? 0 : 0;
      if (rig.current) rig.current.style.transform = `translate3d(0, calc(${fixed(jolt)} * var(--s)), 0)`;
    };
    if (mode === 'calm') {
      // With less motion: the dice are put where they come to rest, and the result is shown a moment later.
      draw(plan.duration);
      handlers.current.onSettle(id);
      const timer = window.setTimeout(() => handlers.current.onDone(id), CALM_MS);
      return () => window.clearTimeout(timer);
    }
    let frame = 0;
    let start: number | null = null;
    let settled = false;
    let next = 0;
    const tick = (now: number) => {
      start ??= now;
      const skip = skippedRef.current;
      const t = skip ? plan.duration : (now - start) / 1000;
      draw(t);
      if (!settled && t >= plan.shakeEnd) {
        settled = true;
        handlers.current.onSettle(id);
      }
      // What the dice hit as they go, for their sound: nothing a skip passes over is heard.
      while (next < plan.events.length && plan.events[next].t <= t) {
        if (!skip) handlers.current.onEvent(plan.events[next]);
        next += 1;
      }
      if (t >= plan.duration) {
        if (rig.current) rig.current.style.transform = '';
        handlers.current.onDone(id);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [run]);

  return (
    <div className={styles.shaker} ref={domeRef} data-testid="sb-dome" data-lights={lights} data-running={run ? 'true' : 'false'}>
      <div className={styles.stage} role="img" aria-label={label}>
        <Base />
        <div className={styles.rig} ref={rig}>
          <div className={styles.scene}>
            <div className={styles.platter}>
              <span className={styles.felt} />
              {rest.map((pose, die) => {
                const look = shadowStyle(pose);
                return (
                  <span
                    key={`shadow-${die}`}
                    className={styles.shadow}
                    ref={(element) => {
                      shadows.current[die] = element;
                    }}
                    style={{ transform: look.transform, opacity: look.opacity }}
                  />
                );
              })}
              {rest.map((pose, die) => (
                <Die
                  key={`die-${die}`}
                  pose={pose}
                  dieRef={(element) => {
                    dice.current[die] = element;
                  }}
                  shadeRefs={(index, element) => {
                    shades.current[die][index] = element;
                  }}
                />
              ))}
            </div>
          </div>
          <Glass />
        </div>
      </div>
      <span className={styles.domeBanner} data-testid="sb-banner" data-show={banner ? 'true' : 'false'} aria-hidden="true">
        {banner ?? ''}
      </span>
    </div>
  );
};
