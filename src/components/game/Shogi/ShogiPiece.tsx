import type { FC } from 'react';
import styles from './ShogiPiece.module.css';

const PROMOTED_LABELS = new Set(['と', '杏', '圭', '全', '馬', '龍']);

interface ShogiPieceProps {
  label: string;
  isSente: boolean;
  rotated?: boolean;
  selected?: boolean;
  highlight?: 'from' | 'to';
  inHand?: boolean;
  interactive?: boolean;
}

export const ShogiPiece: FC<ShogiPieceProps> = ({
  label,
  isSente,
  rotated = false,
  selected = false,
  highlight,
  inHand = false,
  interactive = false,
}) => {
  const promoted = PROMOTED_LABELS.has(label);

  return (
    <span
      className={styles.piece}
      data-side={isSente ? 'sente' : 'gote'}
      data-rotated={rotated ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-highlight={highlight ?? 'none'}
      data-promoted={promoted ? 'true' : 'false'}
      data-in-hand={inHand ? 'true' : 'false'}
      data-interactive={interactive ? 'true' : 'false'}
      aria-label={label}
    >
      <span className={styles.face}>
        <span className={styles.label}>{label}</span>
      </span>
    </span>
  );
};
