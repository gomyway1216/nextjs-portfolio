import { type FC, useId } from 'react';
import { RYOKO_GLYPHS } from './ryokoGlyphs';
import styles from './ShogiPiece.module.css';

const PROMOTED_LABELS = new Set(['と', '杏', '圭', '全', '馬', '龍', '竜']);

// Piece body geometry (viewBox 0 0 100 104).
//
// Proportions follow a real shogi koma: narrow top, high shoulders and a
// wide, flared base. The coordinates are a uniform 1.3x mapping of the
// lishogi Ryoko_1Kanji body frame (apex 50,12.9 / shoulders ±22.6 at 21.1 /
// base ±31.3 at 82.1) so the extracted kanji glyphs line up exactly.
const FACE = 'M50 6.4 L78.4 16.5 L89.4 93.8 L10.6 93.8 L21.6 16.5 Z';
const SILHOUETTE = 'M50 5 L79.4 15.7 L90.7 95 L90.7 99.4 L9.3 99.4 L9.3 95 Z';
// Maps the glyph source frame (100x100) onto this body: x' = 1.3x - 15, y' = 1.3y - 11.77
const GLYPH_TRANSFORM = 'matrix(1.3 0 0 1.3 -15 -11.77)';

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
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const woodId = `koma-wood-${uid}`;
  const sheenId = `koma-sheen-${uid}`;
  const glyph = RYOKO_GLYPHS[label];

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
      <svg className={styles.tile} viewBox="0 0 100 104" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={woodId} x1="0" y1="0" x2="0.12" y2="1">
            <stop offset="0" stopColor="#f6e0ab" />
            <stop offset="0.45" stopColor="#ecc681" />
            <stop offset="1" stopColor="#dda75c" />
          </linearGradient>
          <linearGradient id={sheenId} x1="0.1" y1="0" x2="0.55" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="0.4" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Shadow cast on the board. Rotated (opponent) pieces spin 180deg via
            CSS, so their local shadow offset is negated to keep the light
            source consistent across the whole board. */}
        <path
          className={styles.castShadow}
          d={SILHOUETTE}
          transform={rotated ? 'translate(-2.4, -2.8)' : 'translate(2.4, 2.8)'}
        />
        {/* Dark edge: side bevel plus the visible bottom thickness of the piece */}
        <path className={styles.edge} d={SILHOUETTE} />
        {/* Boxwood top face */}
        <path d={FACE} fill={`url(#${woodId})`} />
        {/* Faint wood grain */}
        <path
          className={styles.grain}
          d="M31 26 C35 48 28 70 33.5 90 M67.5 22 C63 46 70.5 68 65.5 91"
        />
        {/* Light catching the two top edges */}
        <path className={styles.bevelHighlight} d="M23.4 15.9 L50 6.4 L76.6 15.9" />
        {/* Sheen for a subtle 3D roundness */}
        <path d={FACE} fill={`url(#${sheenId})`} />
        {/* Kanji: Ryoko (巻菱湖) calligraphy glyphs, shown via the typeface switch */}
        {glyph && (
          <g className={styles.glyph} transform={GLYPH_TRANSFORM}>
            {glyph.map((shape, i) => (
              <path
                key={i}
                className={shape.paper ? styles.glyphPaper : styles.glyphInk}
                d={shape.d}
              />
            ))}
          </g>
        )}
        {/* Kanji: font-rendered label (default and classic typefaces) */}
        <text className={styles.labelText} x="50" y="55" textAnchor="middle">
          {label}
        </text>
      </svg>
    </span>
  );
};
