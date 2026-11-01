/**
 * The human's 21 pieces. A piece stays in its slot once played, so the tray does
 * not reflow under the player's finger.
 */

'use client';

import { PIECES, type GameState } from './engine';
import type { BlokusStrings } from './i18n';
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
}

const MiniPiece = ({ cells }: { cells: ReadonlyArray<readonly [number, number]> }) => {
  const height = Math.max(...cells.map(([r]) => r)) + 1;
  const width = Math.max(...cells.map(([, c]) => c)) + 1;
  // Five cells across at the most, so every piece is drawn to one scale.
  const box = 5;
  const left = (box - width) / 2;
  const top = (box - height) / 2;
  return (
    <svg className={styles.miniPiece} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      {cells.map(([r, c]) => (
        <rect key={`${r}-${c}`} className={styles.square} x={left + c + 0.05} y={top + r + 0.05} width={0.9} height={0.9} rx={0.12} />
      ))}
    </svg>
  );
};

export const Tray = ({ game, color, playable, selected, selectedCells, strings, onSelect }: TrayProps) => (
  <div className={`${styles.tray} ${styles[`color${color}`]}`} role="group" aria-label={strings.trayLabel} data-testid="blokus-tray">
    {PIECES.map((piece) => {
      const inHand = (game.hands[color] & (1 << piece.index)) !== 0;
      const stuck = inHand && !playable.has(piece.index);
      const isSelected = selected === piece.index;
      const note = inHand ? (stuck ? strings.pieceStuck : null) : strings.pieceUsed;
      return (
        <button
          key={piece.name}
          type="button"
          className={styles.trayPiece}
          data-testid={`blokus-piece-${piece.name}`}
          data-state={!inHand ? 'used' : stuck ? 'stuck' : 'ready'}
          aria-pressed={isSelected}
          aria-label={[strings.piece(piece.name, piece.size), note].filter(Boolean).join(' — ')}
          disabled={!inHand || stuck}
          onClick={() => onSelect(piece.index)}
        >
          {inHand ? <MiniPiece cells={isSelected && selectedCells ? selectedCells : piece.shape} /> : null}
        </button>
      );
    })}
  </div>
);
