/**
 * The human's 21 pieces. A piece stays in its slot once played, so the tray does
 * not reflow under the player's finger.
 */

'use client';

import type { PointerEvent } from 'react';
import { memo, useEffect, useId, useMemo, useRef } from 'react';
import { PIECES, type GameState } from './engine';
import type { BlokusStrings } from './i18n';
import { Plastic, PlasticDefs } from './Plastic';
import type { PieceDrag } from './usePieceDrag';
import styles from './Blokus.module.css';

interface TrayProps {
  game: GameState;
  color: number;
  /** Pieces with at least one legal placement right now. */
  playable: ReadonlySet<number>;
  selected: number | null;
  /** The picked piece's cells as currently turned. */
  selectedCells: ReadonlyArray<readonly [number, number]> | null;
  strings: BlokusStrings;
  onSelect: (piece: number) => void;
  drag?: PieceDrag;
}

const MiniPiece = memo(function MiniPiece({ prefix, cells, color }: { prefix: string; cells: ReadonlyArray<readonly [number, number]>; color: number }) {
  const height = Math.max(...cells.map(([r]) => r)) + 1;
  const width = Math.max(...cells.map(([, c]) => c)) + 1;
  // Five cells across at the most, so every piece is drawn to one scale.
  const box = 5;
  return (
    <svg className={styles.miniPiece} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      <g transform={`translate(${(box - width) / 2} ${(box - height) / 2})`}>
        <Plastic prefix={prefix} cells={cells} color={color} marks={false} />
      </g>
    </svg>
  );
});

export const Tray = ({ game, color, playable, selected, selectedCells, strings, onSelect, drag }: TrayProps) => {
  const prefix = useId();
  const colors = useMemo(() => [color], [color]);
  const trayRef = useRef<HTMLDivElement>(null);
  const isDragging = drag?.isDragging;

  // touch-action has already said no to the browser, except Safari's, which can still
  // begin to scroll: only a touchmove listener set before the touch began can stop it.
  useEffect(() => {
    const tray = trayRef.current;
    if (!tray || !isDragging) return;
    const guard = (event: TouchEvent) => {
      if (isDragging() && event.cancelable) event.preventDefault();
    };
    tray.addEventListener('touchmove', guard, { passive: false });
    return () => tray.removeEventListener('touchmove', guard);
  }, [isDragging]);

  return (
    <div ref={trayRef} className={`${styles.tray} ${styles[`color${color}`]}`} role="group" aria-label={strings.trayLabel} data-testid="blokus-tray">
      <svg className={styles.defsOnly} aria-hidden="true">
        <PlasticDefs prefix={prefix} colors={colors} />
      </svg>
      {PIECES.map((piece) => {
        const inHand = (game.hands[color] & (1 << piece.index)) !== 0;
        const stuck = inHand && !playable.has(piece.index);
        const isSelected = selected === piece.index;
        const note = inHand ? (stuck ? strings.pieceStuck : null) : strings.pieceUsed;
        const cells = isSelected && selectedCells ? selectedCells : piece.shape;
        const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
          if (event.pointerType === 'mouse' || !drag || !inHand || stuck) return;
          const tray = event.currentTarget.parentElement!;
          drag.press({ event, cells, color, selected: isSelected, slides: tray.scrollWidth > tray.clientWidth, onSelect: () => onSelect(piece.index) });
        };
        return (
          <button
            key={piece.name}
            type="button"
            className={styles.trayPiece}
            data-testid={`blokus-piece-${piece.name}`}
            data-state={!inHand ? 'used' : stuck ? 'stuck' : 'ready'}
            data-out={isSelected && drag?.active != null}
            aria-pressed={isSelected}
            aria-label={[strings.piece(piece.name, piece.size), note].filter(Boolean).join(' — ')}
            disabled={!inHand || stuck}
            onPointerDown={handlePointerDown}
            onClick={() => {
              if (!drag?.ignoreClick()) onSelect(piece.index);
            }}
          >
            {inHand ? <MiniPiece prefix={prefix} cells={cells} color={color} /> : null}
          </button>
        );
      })}
    </div>
  );
};
