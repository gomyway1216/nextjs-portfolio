'use client';

import type { PusherStrings } from './i18n';
import look from './ControlPanel.module.css';

/**
 * What is printed and riveted on the control panel, and the pictures on the
 * caps of its switches. The panel's working parts are the cabinet's own
 * (PlayTab, FeelControls, SoundControls); how they look as parts of a
 * machine is ControlPanel.module.css; its counter and its tray are
 * SegmentDisplay and MedalTray.
 */

const CAP = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', focusable: 'false' } as const;

/** On the Auto switch's cap: round and round. */
export const AutoIcon = () => (
  <svg {...CAP} aria-hidden>
    <path d="M13 8a5 5 0 0 1-8.6 3.5M3 8a5 5 0 0 1 8.6-3.5" />
    <path d="M11.7 2v2.6H9.1M4.3 14v-2.6h2.6" />
  </svg>
);

/** On the Sound switch's cap: a loudspeaker, sounding or struck out. */
export const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg {...CAP} aria-hidden>
    <path d="M2.3 6.3h2.2L7.6 3.6v8.8L4.5 9.7H2.3z" fill="currentColor" />
    <path d={on ? 'M10.2 5.7a3.3 3.3 0 0 1 0 4.6M12.2 3.9a5.9 5.9 0 0 1 0 8.2' : 'M10.4 6.1l3.5 3.8M13.9 6.1l-3.5 3.8'} />
  </svg>
);

/**
 * The maker's plate: the small metal plate every cabinet has riveted to it,
 * with the machine's name and its model. The maker is as made up as the
 * machine. It is there to be seen, not read out.
 */
export const MakersPlate = ({ strings: t }: { strings: PusherStrings }) => (
  <span className={look.maker} aria-hidden data-testid="pusher-maker">
    <b>GOLDEN FEVER</b>
    <span>{t.makerLine}</span>
  </span>
);

/**
 * The small print along the near edge of the plate: what such a panel
 * always asks of whoever plays at it. Part of the picture of the panel, and
 * not read out either.
 */
export const PanelWarning = ({ strings: t }: { strings: PusherStrings }) => (
  <p className={look.warning} aria-hidden data-testid="pusher-warning">
    {t.panelWarning}
  </p>
);
