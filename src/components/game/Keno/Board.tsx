'use client';

import { Fragment, useEffect, useRef, type KeyboardEvent } from 'react';
import { BALLS, COLUMNS, HALF, halfOf } from './engine';
import type { KenoStrings } from './i18n';
import styles from './Keno.module.css';

export type Half = 'top' | 'bottom';

export interface BoardProps {
  t: KenoStrings;
  /** The ticket's spots. */
  spots: ReadonlySet<number>;
  /** The balls out so far, each with the place it came out in (0 to 19). */
  drawn: ReadonlyMap<number, number>;
  /** The ball that came out last, which pops. */
  latest: number | null;
  /** Which half a phone shows: on a wider screen the whole board is shown and this is not used. */
  half: Half;
  onHalf: (half: Half) => void;
  /** Whether a number may be marked or taken off now (not while the balls are being drawn). */
  open: boolean;
  onToggle: (n: number) => void;
  /** The number that takes the board's one stop of the Tab key. */
  focus: number;
  onFocus: (n: number) => void;
}

const NUMBERS = Array.from({ length: BALLS }, (_, i) => i + 1);

/**
 * The keno board: the numbers 1 to 80 in eight rows of ten, the top half 1 to 40 over the bottom half 41 to 80, as on
 * the real screen. Every number is a button at least 44 px to a side. Where the screen is too narrow for ten of them
 * a row (a phone), it shows one half at a time, in rows of five, and a switch over it chooses the half (the switch
 * says how many of each half's numbers are marked and caught); a wider screen shows the whole board and no switch
 * (Keno.module.css, by the width of the screen the board stands in).
 *
 * The board is one stop of the Tab key; the arrow keys move between its numbers, crossing to the other half where a
 * phone shows one at a time, and Space or Enter marks a number or takes it off.
 */
export const Board = ({ t, spots, drawn, latest, half, onHalf, open, onToggle, focus, onFocus }: BoardProps) => {
  const grid = useRef<HTMLDivElement | null>(null);
  const wanted = useRef<number | null>(null);

  // A number moved to by the arrow keys in the other half is focused once that half is shown.
  useEffect(() => {
    const n = wanted.current;
    if (n === null) return;
    wanted.current = null;
    grid.current?.querySelector<HTMLButtonElement>(`[data-n="${n}"]`)?.focus();
  }, [half, focus]);

  const countIn = (top: boolean) => {
    let marked = 0;
    let caught = 0;
    for (const n of spots) {
      if ((n <= HALF) !== top) continue;
      marked += 1;
      if (drawn.has(n)) caught += 1;
    }
    return { marked, caught };
  };
  const anyDrawn = drawn.size > 0;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0, Home: 0, End: 0 };
    if (!(event.key in keys)) return;
    const from = Number((event.target as HTMLElement).getAttribute('data-n'));
    if (!from) return;
    event.preventDefault();
    // Ten numbers a row on the whole board, five on a half.
    const columns = grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').filter(Boolean).length : COLUMNS;
    let to = from;
    if (event.key === 'ArrowRight') to = from + 1;
    else if (event.key === 'ArrowLeft') to = from - 1;
    else if (event.key === 'ArrowDown') to = from + columns;
    else if (event.key === 'ArrowUp') to = from - columns;
    else if (event.key === 'Home') to = from - ((from - 1) % columns);
    else if (event.key === 'End') to = Math.min(BALLS, from - ((from - 1) % columns) + columns - 1);
    to = Math.min(BALLS, Math.max(1, to));
    if (to === from) return;
    const target = grid.current?.querySelector<HTMLButtonElement>(`[data-n="${to}"]`);
    onFocus(to);
    if (target && target.offsetParent !== null) target.focus();
    else {
      // On the half not shown: it is shown, and the number focused once it is.
      wanted.current = to;
      onHalf(halfOf(to));
    }
  };

  return (
    <div className={styles.boardWrap}>
      <div className={styles.halves} role="radiogroup" aria-label={t.halvesLabel}>
        {(['top', 'bottom'] as const).map((which) => {
          const { marked, caught } = countIn(which === 'top');
          return (
            <button
              key={which}
              type="button"
              role="radio"
              aria-checked={half === which}
              aria-label={t.halfAria(which === 'top', marked, anyDrawn ? caught : null)}
              className={styles.halfButton}
              data-testid={`kn-half-${which}`}
              onClick={() => onHalf(which)}
            >
              <span className={styles.halfName}>{t.half(which === 'top')}</span>
              <span className={styles.halfCount} aria-hidden="true" data-on={marked > 0 ? 'true' : 'false'}>
                {anyDrawn ? `${caught}/${marked}` : marked}
              </span>
            </button>
          );
        })}
      </div>
      <div ref={grid} className={styles.board} role="group" aria-label={t.boardLabel} data-testid="kn-board" data-half={half} onKeyDown={onKeyDown}>
        {NUMBERS.map((n) => {
          const marked = spots.has(n);
          const order = drawn.get(n);
          const out = order !== undefined;
          return (
            <Fragment key={n}>
              {n === HALF + 1 && <span className={styles.divider} aria-hidden="true" />}
              <button
                type="button"
                className={styles.cell}
                data-n={n}
                data-testid={`kn-cell-${n}`}
                data-half={halfOf(n)}
                data-marked={marked ? 'true' : 'false'}
                data-drawn={out ? 'true' : 'false'}
                data-caught={marked && out ? 'true' : 'false'}
                data-latest={latest === n ? 'true' : 'false'}
                aria-pressed={marked}
                aria-disabled={!open}
                aria-label={t.cellAria(n, marked, out)}
                tabIndex={focus === n ? 0 : -1}
                onClick={() => {
                  onFocus(n);
                  if (open) onToggle(n);
                }}
              >
                <span className={styles.cellNumber}>{n}</span>
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default Board;
