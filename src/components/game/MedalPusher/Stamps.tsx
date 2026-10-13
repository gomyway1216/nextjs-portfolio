'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import type { AchievementId, Day } from './records';
import styles from './Records.module.css';

/**
 * The ink the stamps are pressed in. A rubber stamp never prints clean: its
 * edge wanders and the ink does not take everywhere. One filter does both,
 * and every stamp under one `InkPad` uses it.
 */
export const InkPad = ({ id }: { id: string }) => (
  <svg className={styles.inkPad} width="0" height="0" aria-hidden focusable="false">
    <defs>
      <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
        {/* The edge wanders. */}
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="wander" />
        <feDisplacementMap in="SourceGraphic" in2="wander" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="pressed" />
        {/* The ink is thin in specks. */}
        <feTurbulence type="fractalNoise" baseFrequency="0.32" numOctaves="2" seed="3" result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 4.5" result="specks" />
        <feComposite in="pressed" in2="specks" operator="in" />
      </filter>
    </defs>
  </svg>
);

/** A name for an `InkPad`'s filter that is this component's alone, and plain enough to be pointed at from a drawing. */
export const useInk = (): string => `mp-ink-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** The way a date stamp writes a day: two digits each for the year, the month and the day. */
export const stampDate = (day: Day): string => `${day.slice(2, 4)}.${day.slice(5, 7)}.${day.slice(8, 10)}`;

/** How far each stamp is turned, in degrees: nobody presses a stamp straight. */
const TILTS = [-9, 6, -4, 10, -7, 4, -11, 7, -5, 9, -8, 5];
export const tiltOf = (index: number): number => TILTS[((index % TILTS.length) + TILTS.length) % TILTS.length];

interface StampProps {
  /** The filter of the `InkPad` this stamp is pressed from. */
  ink: string;
  /** Which stamp of its sheet it is, for how it is turned. */
  index: number;
  /** Whether it was pressed just now: it comes down on the paper. */
  fresh?: boolean;
}

const turned = (index: number): CSSProperties => ({ '--tilt': `${tiltOf(index)}deg` }) as CSSProperties;

/**
 * A date stamp, the kind a counter presses on a card: a ring, the day across
 * the middle between two rules, and the house's name above and below.
 */
export const DateStamp = ({ ink, index, fresh = false, day }: StampProps & { day: Day }) => (
  <svg className={styles.stamp} style={turned(index)} data-fresh={fresh} viewBox="0 0 100 100" aria-hidden focusable="false">
    <g filter={`url(#${ink})`} fill="none" stroke="currentColor">
      <circle cx="50" cy="50" r="45" strokeWidth="5" />
      <circle cx="50" cy="50" r="38.5" strokeWidth="1.5" />
      <path d="M14.5 37.5H85.5M14.5 62.5H85.5" strokeWidth="2.2" />
      <g fill="currentColor" stroke="none" textAnchor="middle" fontWeight="900">
        <text x="50" y="31" fontSize="8.4" letterSpacing="0.6">
          GOLDEN FEVER
        </text>
        <text x="50" y="56.5" fontSize="17.5" letterSpacing="0.2">
          {stampDate(day)}
        </text>
        <text x="50" y="76" fontSize="10.5" letterSpacing="2.4">
          BONUS
        </text>
      </g>
    </g>
  </svg>
);

/** The picture in the middle of each achievement's stamp, drawn in one ink on a 40-unit square. */
const MARKS: Record<AchievementId, ReactNode> = {
  // Three alike in a row, with the line through them.
  firstLine: (
    <>
      <rect x="2.5" y="12" width="10" height="16" rx="2" />
      <rect x="15" y="12" width="10" height="16" rx="2" />
      <rect x="27.5" y="12" width="10" height="16" rx="2" />
      <path d="M0 20H40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3 2.4" />
    </>
  ),
  // The hold's eight lamps, all lit.
  holdFull: (
    <>
      {[0, 1, 2, 3].map((lamp) => (
        <circle key={`a${lamp}`} cx={6.5 + lamp * 9} cy="13.5" r="3.6" />
      ))}
      {[0, 1, 2, 3].map((lamp) => (
        <circle key={`b${lamp}`} cx={6.5 + lamp * 9} cy="26.5" r="3.6" />
      ))}
    </>
  ),
  // A bolt.
  superWin: <path d="M23 2 8 22h9l-3 16 16-21h-9z" />,
  // A burst.
  fever: <path d="M20 1.5l4.2 9.6 9.4-4.6-4.6 9.4 9.5 4.1-9.5 4.1 4.6 9.4-9.4-4.6-4.2 9.6-4.2-9.6-9.4 4.6 4.6-9.4L1.5 20l9.5-4.1-4.6-9.4 9.4 4.6z" />,
  // A chest with its lid and its lock.
  treasure: (
    <>
      <path d="M5 17v-3a9 9 0 0 1 9-9h12a9 9 0 0 1 9 9v3z" />
      <path d="M5 20h11v4a4 4 0 0 0 8 0v-4h11v15H5z" />
      <circle cx="20" cy="23" r="2" />
    </>
  ),
  // A stack of medals leaning over.
  tower: (
    <>
      <rect x="9" y="30" width="20" height="5" rx="2.5" />
      <rect x="10" y="23.5" width="20" height="5" rx="2.5" />
      <rect x="11.5" y="17" width="20" height="5" rx="2.5" />
      <rect x="13.5" y="10.5" width="20" height="5" rx="2.5" />
      <rect x="16" y="4" width="20" height="5" rx="2.5" />
    </>
  ),
  sevens: (
    <text x="20" y="28" textAnchor="middle" fontSize="21" fontWeight="900" fontStyle="italic" letterSpacing="-1">
      777
    </text>
  ),
  // A ball, with the light on it left clear.
  ball: <path fillRule="evenodd" d="M20 3a17 17 0 1 0 0 34 17 17 0 0 0 0-34zm-6 6a6 4.5 -35 1 1 0 8 6 4.5 -35 0 1 0-8z" />,
  // Four steps up.
  fullRun: (
    <>
      <rect x="3" y="27" width="7.5" height="9" rx="1.5" />
      <rect x="12" y="20" width="7.5" height="16" rx="1.5" />
      <rect x="21" y="13" width="7.5" height="23" rx="1.5" />
      <rect x="30" y="5" width="7.5" height="31" rx="1.5" />
    </>
  ),
  // A crown.
  jackpot: <path d="M4 32 2 11l10 9 8-15 8 15 10-9-2 21zM4 34.5h32V38H4z" />,
  thousand: (
    <text x="20" y="26.5" textAnchor="middle" fontSize="15.5" fontWeight="900" letterSpacing="-0.6">
      1000
    </text>
  ),
  // A week on a calendar.
  week: (
    <>
      <path fillRule="evenodd" d="M4 7h32v30H4zm3 9v18h26V16z" />
      <rect x="10" y="2.5" width="4" height="8" rx="2" />
      <rect x="26" y="2.5" width="4" height="8" rx="2" />
      <text x="20" y="31.5" textAnchor="middle" fontSize="15" fontWeight="900">
        7
      </text>
    </>
  ),
};

/** An achievement's picture alone, for a square of the sheet that has no stamp yet. */
export const AchievementMark = ({ id }: { id: AchievementId }) => (
  <svg className={styles.mark} viewBox="0 0 40 40" aria-hidden focusable="false" fill="currentColor">
    {MARKS[id]}
  </svg>
);

/** An achievement's stamp: its picture in a double ring. */
export const AchievementStamp = ({ ink, index, fresh = false, id }: StampProps & { id: AchievementId }) => (
  <svg className={styles.stamp} style={turned(index)} data-fresh={fresh} data-ink={index % 3} viewBox="0 0 100 100" aria-hidden focusable="false">
    <g filter={`url(#${ink})`}>
      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.5 3.2" />
      <g transform="translate(26 26) scale(1.2)" fill="currentColor">
        {MARKS[id]}
      </g>
    </g>
  </svg>
);
