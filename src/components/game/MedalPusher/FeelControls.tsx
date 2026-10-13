'use client';

import { useRef } from 'react';
import type { PusherStrings } from './i18n';
import { useFullscreen } from './useFeel';
import styles from './MedalPusher.module.css';

export interface FeelControlsProps {
  strings: PusherStrings;
  /** Whether the rails swing by themselves. */
  sweep: boolean;
  onSweep: (on: boolean) => void;
  /** Whether vibration is on, or null where the device has no motor: there is no switch for it then. */
  vibration: boolean | null;
  onVibration: (on: boolean) => void;
}

const ICON = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** A rail swinging from side to side. */
const SweepIcon = () => (
  <svg {...ICON} aria-hidden>
    <path d="M1.5 8h13M4.5 5l-3 3 3 3M11.5 5l3 3-3 3" />
  </svg>
);
/** A phone shaking. */
const VibrationIcon = () => (
  <svg {...ICON} aria-hidden>
    <rect x="5.5" y="2" width="5" height="12" rx="1.2" />
    <path d="M3 5.5v5M13 5.5v5M0.8 7v2M15.2 7v2" />
  </svg>
);
/** Four corners: pushed out to fill the screen, drawn in to leave it. */
const FullscreenIcon = ({ active }: { active: boolean }) => (
  <svg {...ICON} aria-hidden>
    <path d={active ? 'M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4' : 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4'} />
  </svg>
);

/**
 * The switches of feel, in one short row under the controls: Sweep, which
 * the cabinet's own words call Swing, and, each only where the device can do
 * it, vibration and fullscreen. What a device can do is not known until the
 * page is in a browser, so the server and the first render show Sweep alone;
 * a switch the device has no use for is never drawn and takes up no room.
 *
 * Fullscreen is the whole cabinet's: the picture and the controls together.
 * This row is inside the cabinet, and finds it from where it stands.
 *
 * The line that says what to do while the rails swing is `FeelNote`, a piece
 * of its own: it comes last in the controls, after whatever row another
 * switch has opened under this one.
 */
export const FeelControls = ({ strings: t, sweep, onSweep, vibration, onVibration }: FeelControlsProps) => {
  const row = useRef<HTMLDivElement | null>(null);
  const fullscreen = useFullscreen(() => row.current?.closest(`.${styles.cabinet}`) ?? null);

  return (
    <div ref={row} className={styles.feel} data-testid="pusher-feel">
      <div className={styles.feelRow} role="group" aria-label={t.feelLabel}>
        <button type="button" className={styles.toggle} aria-pressed={sweep} title={t.swingHint} data-testid="pusher-sweep" onClick={() => onSweep(!sweep)}>
          <SweepIcon /> {t.swing}
        </button>
        {vibration !== null && (
          <button type="button" className={styles.toggle} aria-pressed={vibration} title={t.vibrationHint} data-testid="pusher-vibration" onClick={() => onVibration(!vibration)}>
            <VibrationIcon /> {t.vibration}
          </button>
        )}
        {fullscreen.supported && (
          <button type="button" className={styles.toggle} aria-pressed={fullscreen.active} title={t.fullscreenHint} data-testid="pusher-fullscreen" onClick={fullscreen.toggle}>
            <FullscreenIcon active={fullscreen.active} /> {t.fullscreen}
          </button>
        )}
      </div>
    </div>
  );
};

/** While the rails swing, a line at the foot of the controls that says what to do about it. */
export const FeelNote = ({ strings: t, sweep }: { strings: PusherStrings; sweep: boolean }) =>
  sweep ? (
    <p className={styles.feelNote} data-testid="pusher-sweep-note">
      {t.swingNote}
    </p>
  ) : null;
