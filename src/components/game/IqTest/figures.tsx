import type { GameLanguage } from '../constants/gameTranslations';

import { getIqStrings } from './i18n';
import type { CellSpec } from './questions';
import { describeCell } from './review';
import styles from './IqTest.module.css';

export const CellShapeSvg = ({
  cell,
  size = 70,
  language,
}: {
  cell: CellSpec;
  size?: number;
  language: GameLanguage;
}) => {
  const cy = size / 2;
  const gap = size * 0.06;
  const usable = size - gap * 2;
  const shapeSize = Math.min(usable / cell.count - gap, size * 0.55);
  const r = shapeSize / 2;
  const startX = (size - (shapeSize * cell.count + gap * (cell.count - 1))) / 2 + r;

  const shapes = Array.from({ length: cell.count }, (_, i) => {
    const cx = startX + i * (shapeSize + gap);
    if (cell.shape === 'circle') {
      return <circle key={i} cx={cx} cy={cy} r={r} fill={cell.color} />;
    }
    if (cell.shape === 'square') {
      return (
        <rect key={i} x={cx - r} y={cy - r} width={2 * r} height={2 * r} fill={cell.color} rx={r * 0.12} />
      );
    }
    if (cell.shape === 'triangle') {
      const pts = `${cx},${cy - r} ${cx - r},${cy + r * 0.85} ${cx + r},${cy + r * 0.85}`;
      return <polygon key={i} points={pts} fill={cell.color} />;
    }
    const star: string[] = [];
    for (let k = 0; k < 10; k += 1) {
      const angle = (Math.PI / 5) * k - Math.PI / 2;
      const radius = k % 2 === 0 ? r : r * 0.45;
      star.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
    }
    return <polygon key={i} points={star.join(' ')} fill={cell.color} />;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={describeCell(cell)[language]}
    >
      {shapes}
    </svg>
  );
};

export const MatrixGridView = ({
  grid,
  language,
  compact = false,
}: {
  grid: (CellSpec | null)[][];
  language: GameLanguage;
  /** Smaller grid for the end-of-test review. */
  compact?: boolean;
}) => {
  const t = getIqStrings(language);
  return (
    <div
      className={compact ? `${styles.matrixGrid} ${styles.matrixGridCompact}` : styles.matrixGrid}
      role="group"
      aria-label={t.matrixGridLabel}
    >
      {grid.flatMap((row, r) =>
        row.map((cell, c) => (
          <div key={`${r}-${c}`} className={styles.matrixCell}>
            {cell ? (
              <CellShapeSvg cell={cell} size={compact ? 40 : 80} language={language} />
            ) : (
              <span className={styles.matrixCellQ} role="img" aria-label={t.blankCell}>
                ?
              </span>
            )}
          </div>
        )),
      )}
    </div>
  );
};
