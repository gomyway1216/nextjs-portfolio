'use client';

import { useEffect, useRef, useState } from 'react';
import { SEGMENT_CELL, SEGMENT_NAMES, SEGMENT_SHAPES, segmentsFor } from './panel';
import look from './ControlPanel.module.css';

export interface SegmentDisplayProps {
  /** The number to show. Anything in it that is not a digit, like the comma of 1,234, is passed over. */
  value: number | string;
  /** How many digits the display has. */
  places: number;
  /** The colour of its LEDs: red for the medals, amber for the jackpot. */
  tone?: 'red' | 'amber';
}

/**
 * A row of seven-segment LED digits behind smoked acrylic, as a cabinet
 * shows a number. Every place has all seven segments, and the ones that are
 * not lit can still be made out through the window, as on the real thing.
 *
 * It is a picture. The number is written in type beside it, by whoever puts
 * this on the panel, for a screen reader and for anything else that reads
 * the page; this is hidden from both.
 */
export const SegmentDisplay = ({ value, places, tone = 'red' }: SegmentDisplayProps) => (
  <span className={look.display} data-tone={tone} aria-hidden>
    {segmentsFor(value, places).map((lit, place) => (
      <svg key={place} className={look.digit} viewBox={`0 0 ${SEGMENT_CELL.width + 2} ${SEGMENT_CELL.height}`} focusable="false">
        <g transform={`translate(2 0) skewX(${SEGMENT_CELL.lean})`}>
          {SEGMENT_NAMES.map((name) => (
            <polygon key={name} points={SEGMENT_SHAPES[name]} data-on={lit.includes(name)} />
          ))}
        </g>
      </svg>
    ))}
  </span>
);

/**
 * The same display, showing whatever number is written in the element just
 * before it. The jackpot's plate is such a number: it is the jackpot, and
 * while a jackpot is being paid it is counted up by the show that pays it.
 * Whoever writes the number, the display follows the writing, so it needs to
 * know nothing of why the number changes. `initial` is what the server and
 * the first render show: the number as it is written then.
 */
export const SegmentMirror = ({ initial, places, tone }: { initial: number | string } & Omit<SegmentDisplayProps, 'value'>) => {
  const [seen, setSeen] = useState<string | null>(null);
  const self = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const written = self.current?.previousElementSibling;
    if (!written || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setSeen(written.textContent ?? ''));
    observer.observe(written, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={self} className={look.mirror}>
      <SegmentDisplay value={seen ?? initial} places={places} tone={tone} />
    </span>
  );
};
