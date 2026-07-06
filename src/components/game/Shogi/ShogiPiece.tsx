import type { FC } from 'react';
import styles from './ShogiPiece.module.css';

const PROMOTED_LABELS = new Set(['と', '杏', '圭', '全', '馬', '龍', '竜']);

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
      <svg className={styles.tile} viewBox="0 0 100 116" aria-hidden="true" focusable="false">
        <path
          className={styles.castShadow}
          d="M50 7 L90 30 L82 109 L18 109 L10 30 Z"
          transform="translate(2, 3)"
        />
        <path
          className={styles.rim}
          d="M50 5 L92 29 L84 112 L16 112 L8 29 Z"
        />
        <path
          className={styles.body}
          d="M50 10 L85 31 L78 105 L22 105 L15 31 Z"
        />
        <path
          className={styles.innerStroke}
          d="M50 15 L79 34 L73 100 L27 100 L21 34 Z"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className={styles.label}>{label}</span>
    </span>
  );
};
