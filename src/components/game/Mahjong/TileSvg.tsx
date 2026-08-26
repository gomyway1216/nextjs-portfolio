/**
 * Riichi Mahjong — inline SVG tile renderer.
 *
 * Draws any of the 34 tile kinds (plus the tile back) as a self-contained
 * `<svg>`: no image assets, no sprite sheet, no webfont for the numbers or the
 * pips. Only the manzu rank / `萬` glyph and the honour glyphs fall back to
 * `<text>` with a generic CJK font stack — everything else is geometry, so the
 * tiles stay crisp at any size and recolour with the theme.
 *
 * Presentation only: this module imports the frozen tile contract from
 * `engine/` but never the round state, so the board, the pond, the meld strip,
 * the dora display and the result screen can all share it.
 */

import type { JSX } from 'react';

import { isHonor, isRedFive, kindOf, rankOf, suitOf } from './engine/tiles';
import type { TileId, TileKind } from './engine/types';
import styles from './TileSvg.module.css';

export type TileSize = 'sm' | 'md' | 'lg';

export type TileSvgProps = {
  kind: TileKind;
  /** Render as a red five (aka dora). */
  red?: boolean;
  faceDown?: boolean;
  /** Sideways, as for a riichi declaration tile in the pond. */
  rotated?: boolean;
  /** Faded, e.g. a discard that was called away. */
  dimmed?: boolean;
  size?: TileSize;
  className?: string;
  /**
   * Accessible name. Defaults to a readable name such as
   * `"5 of characters (red)"`. Pass `""` to mark the tile decorative
   * (`aria-hidden`), for example when adjacent text already names it.
   */
  ariaLabel?: string;
};

export type TileByIdProps = Omit<TileSvgProps, 'kind'> & {
  tileId: TileId;
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const SUIT_NAME: Record<'m' | 'p' | 's', string> = {
  m: 'characters',
  p: 'circles',
  s: 'bamboo',
};

const HONOUR_NAME = [
  'East wind',
  'South wind',
  'West wind',
  'North wind',
  'White dragon',
  'Green dragon',
  'Red dragon',
] as const;

const HONOUR_GLYPH = ['東', '南', '西', '北', '', '發', '中'] as const;

/** Default accessible name for a tile. */
export function tileLabel(kind: TileKind, red = false): string {
  if (isHonor(kind)) return HONOUR_NAME[rankOf(kind) - 1] ?? 'unknown tile';
  const suit = suitOf(kind) as 'm' | 'p' | 's';
  return `${rankOf(kind)} of ${SUIT_NAME[suit]}${red ? ' (red)' : ''}`;
}

/** Accessible name used for a face-down tile. */
export const FACE_DOWN_LABEL = 'Face-down tile';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * A tile occupies a 60x80 user-space box (3:4, the real tile proportion). The
 * engraved faceplate is `x 3..57`, `y 2.5..74.5`; the layouts below stay
 * inside roughly `x 9..51`, `y 9..69` so nothing crowds the bevel.
 */
const VIEW_BOX = '0 0 60 80';

type Pip = { x: number; y: number; r: number; accent?: boolean };

/** Canonical pinzu arrangements — exactly one `<circle>` per pip. */
const PIN_LAYOUT: readonly (readonly Pip[])[] = [
  // 1p — a single large ring in the centre.
  [{ x: 30, y: 38, r: 13.5, accent: true }],
  // 2p — vertical pair.
  [
    { x: 30, y: 22, r: 8.6 },
    { x: 30, y: 54, r: 8.6 },
  ],
  // 3p — diagonal.
  [
    { x: 17, y: 20, r: 8 },
    { x: 30, y: 38, r: 8 },
    { x: 43, y: 56, r: 8 },
  ],
  // 4p — corners.
  [
    { x: 19, y: 22, r: 8.4 },
    { x: 41, y: 22, r: 8.4 },
    { x: 19, y: 54, r: 8.4 },
    { x: 41, y: 54, r: 8.4 },
  ],
  // 5p — corners plus an accented centre.
  [
    { x: 18, y: 21, r: 7.6 },
    { x: 42, y: 21, r: 7.6 },
    { x: 30, y: 38, r: 7.6, accent: true },
    { x: 18, y: 55, r: 7.6 },
    { x: 42, y: 55, r: 7.6 },
  ],
  // 6p — two columns of three.
  [
    { x: 19, y: 20, r: 7.4 },
    { x: 41, y: 20, r: 7.4 },
    { x: 19, y: 38, r: 7.4 },
    { x: 41, y: 38, r: 7.4 },
    { x: 19, y: 56, r: 7.4 },
    { x: 41, y: 56, r: 7.4 },
  ],
  // 7p — the classic accented diagonal of three over a block of four.
  [
    { x: 17, y: 15, r: 6.2, accent: true },
    { x: 30, y: 21, r: 6.2, accent: true },
    { x: 43, y: 27, r: 6.2, accent: true },
    { x: 19, y: 45, r: 6.8 },
    { x: 41, y: 45, r: 6.8 },
    { x: 19, y: 61, r: 6.8 },
    { x: 41, y: 61, r: 6.8 },
  ],
  // 8p — two columns of four.
  [
    { x: 19, y: 15, r: 6.4 },
    { x: 41, y: 15, r: 6.4 },
    { x: 19, y: 30, r: 6.4 },
    { x: 41, y: 30, r: 6.4 },
    { x: 19, y: 45, r: 6.4 },
    { x: 41, y: 45, r: 6.4 },
    { x: 19, y: 60, r: 6.4 },
    { x: 41, y: 60, r: 6.4 },
  ],
  // 9p — 3x3 grid, middle column accented.
  [
    { x: 16.5, y: 20, r: 6.3 },
    { x: 30, y: 20, r: 6.3, accent: true },
    { x: 43.5, y: 20, r: 6.3 },
    { x: 16.5, y: 38, r: 6.3 },
    { x: 30, y: 38, r: 6.3, accent: true },
    { x: 43.5, y: 38, r: 6.3 },
    { x: 16.5, y: 56, r: 6.3 },
    { x: 30, y: 56, r: 6.3, accent: true },
    { x: 43.5, y: 56, r: 6.3 },
  ],
];

type Stick = { x: number; y: number; s: number; accent?: boolean };

/** Canonical souzu arrangements for ranks 2-9 (1s is the bird). */
const SOU_LAYOUT: readonly (readonly Stick[])[] = [
  // 2s — vertical pair.
  [
    { x: 30, y: 21, s: 1 },
    { x: 30, y: 55, s: 1 },
  ],
  // 3s — one over two.
  [
    { x: 30, y: 19, s: 0.92 },
    { x: 19, y: 54, s: 0.92 },
    { x: 41, y: 54, s: 0.92 },
  ],
  // 4s — corners.
  [
    { x: 19, y: 21, s: 0.92 },
    { x: 41, y: 21, s: 0.92 },
    { x: 19, y: 55, s: 0.92 },
    { x: 41, y: 55, s: 0.92 },
  ],
  // 5s — corners plus an accented centre.
  [
    { x: 17, y: 19, s: 0.78 },
    { x: 43, y: 19, s: 0.78 },
    { x: 30, y: 38, s: 0.78, accent: true },
    { x: 17, y: 57, s: 0.78 },
    { x: 43, y: 57, s: 0.78 },
  ],
  // 6s — two columns of three.
  [
    { x: 19, y: 20, s: 0.8 },
    { x: 41, y: 20, s: 0.8 },
    { x: 19, y: 38, s: 0.8 },
    { x: 41, y: 38, s: 0.8 },
    { x: 19, y: 56, s: 0.8 },
    { x: 41, y: 56, s: 0.8 },
  ],
  // 7s — an accented single over two columns of three.
  [
    { x: 30, y: 16, s: 0.7, accent: true },
    { x: 19, y: 34, s: 0.7 },
    { x: 41, y: 34, s: 0.7 },
    { x: 19, y: 49, s: 0.7 },
    { x: 41, y: 49, s: 0.7 },
    { x: 19, y: 63, s: 0.7 },
    { x: 41, y: 63, s: 0.7 },
  ],
  // 8s — two columns of four.
  [
    { x: 19, y: 14, s: 0.68 },
    { x: 41, y: 14, s: 0.68 },
    { x: 19, y: 30, s: 0.68 },
    { x: 41, y: 30, s: 0.68 },
    { x: 19, y: 46, s: 0.68 },
    { x: 41, y: 46, s: 0.68 },
    { x: 19, y: 62, s: 0.68 },
    { x: 41, y: 62, s: 0.68 },
  ],
  // 9s — 3x3 grid, middle column accented.
  [
    { x: 16, y: 20, s: 0.62 },
    { x: 30, y: 20, s: 0.62, accent: true },
    { x: 44, y: 20, s: 0.62 },
    { x: 16, y: 38, s: 0.62 },
    { x: 30, y: 38, s: 0.62, accent: true },
    { x: 44, y: 38, s: 0.62 },
    { x: 16, y: 56, s: 0.62 },
    { x: 30, y: 56, s: 0.62, accent: true },
    { x: 44, y: 56, s: 0.62 },
  ],
];

function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Face fragments
// ---------------------------------------------------------------------------

function BambooStick({ x, y, s, accent }: Stick): JSX.Element {
  return (
    <g
      className={cx(styles.souStick, accent && styles.souStickAccent)}
      transform={`translate(${x} ${y}) scale(${s})`}
    >
      <rect className={styles.souBody} x={-4} y={-9} width={8} height={18} rx={3.4} />
      <path className={styles.souNode} d="M-4 -2.4 H4 M-4 2.4 H4" />
      <path className={styles.souCap} d="M-2.4 -6.4 H2.4 M-2.4 6.4 H2.4" />
    </g>
  );
}

/** 1s: a stylised bird perched on a bamboo stub. Paths only, no `<circle>`. */
function SouBird(): JSX.Element {
  return (
    <g className={styles.bird}>
      <path className={styles.birdTail} d="M21 40 L9 54 L17.5 51.5 L18.5 59 L27 48.5 Z" />
      <path
        className={styles.birdBody}
        d="M31.5 20.5 C22.5 22.5 17.5 31.5 20.5 41.5 C22.5 48 27 52.5 30 55 C33.5 52.5 40 46 41.5 38 C43 29.5 39 22 31.5 20.5 Z"
      />
      <path
        className={styles.birdWing}
        d="M29.5 27 C24.5 30 23.5 37.5 26.5 43.5 C28.5 47 31.5 48 32.5 45.5 C29.5 40 28.5 33 29.5 27 Z"
      />
      <path
        className={styles.birdHead}
        d="M33 10.4 a5.6 5.6 0 1 0 0.01 0 Z M30.8 21 C29.8 18 31 15.4 33.4 14.6 L36.4 19.6 Z"
      />
      <path className={styles.birdBeak} d="M38 13.8 L45 16.4 L38 19 Z" />
      <path className={styles.birdEye} d="M33.6 13.4 a1.35 1.35 0 1 0 0.01 0 Z" />
      <rect className={styles.birdPerch} x={20} y={60} width={20} height={7.5} rx={3.2} />
    </g>
  );
}

function ManFace({ rank }: { rank: number }): JSX.Element {
  return (
    <g className={styles.manFace}>
      <text
        className={styles.manRank}
        x={30}
        y={29}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {rank}
      </text>
      <text
        className={styles.manChar}
        x={30}
        y={58}
        textAnchor="middle"
        dominantBaseline="central"
      >
        萬
      </text>
    </g>
  );
}

function HonourFace({ kind }: { kind: TileKind }): JSX.Element {
  const rank = rankOf(kind);
  // Haku (honour rank 5) is the blank tile: a thin engraved frame, nothing else.
  if (rank === 5) {
    return (
      <g className={styles.hakuFace}>
        <rect className={styles.hakuOuter} x={13} y={15} width={34} height={49} rx={3.5} />
        <rect className={styles.hakuInner} x={17.5} y={19.5} width={25} height={40} rx={2.5} />
      </g>
    );
  }
  return (
    <text
      className={cx(
        styles.honourChar,
        rank === 6 && styles.honourGreen,
        rank === 7 && styles.honourRed,
      )}
      x={30}
      y={39}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {HONOUR_GLYPH[rank - 1]}
    </text>
  );
}

function TileBack(): JSX.Element {
  return (
    <g className={styles.back}>
      <rect className={styles.backFace} x={3} y={2.5} width={54} height={72} rx={5.5} />
      <rect className={styles.backInset} x={9} y={9} width={42} height={59} rx={4} />
      <path className={styles.backMark} d="M30 24 L40 38.5 L30 53 L20 38.5 Z" />
      <path className={styles.backLines} d="M15 15 L45 15 M15 62 L45 62" />
    </g>
  );
}

function TileFace({ kind }: { kind: TileKind }): JSX.Element {
  const suit = suitOf(kind);
  if (suit === 'z') return <HonourFace kind={kind} />;

  const rank = rankOf(kind);
  if (suit === 'm') return <ManFace rank={rank} />;

  if (suit === 'p') {
    return (
      <g className={styles.pinFace}>
        {PIN_LAYOUT[rank - 1].map((pip, i) => (
          <circle
            // Pip positions are a static table per rank, so the index is stable.
            key={i}
            className={cx(
              styles.pip,
              pip.accent && styles.pipAccent,
              rank === 1 && styles.pipLarge,
            )}
            cx={pip.x}
            cy={pip.y}
            r={pip.r}
          />
        ))}
      </g>
    );
  }

  // Souzu: 1s is the bird, 2-9s are stick grids.
  if (rank === 1) return <SouBird />;
  return (
    <g className={styles.souFace}>
      {SOU_LAYOUT[rank - 2].map((stick, i) => (
        <BambooStick key={i} {...stick} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * One mahjong tile.
 *
 * The wrapper `<span>` owns the footprint — driven by the `--mj-tile-width`
 * custom property, which the `size` classes set and any ancestor may override
 * — and the `<svg>` scales to fill it.
 */
export function TileSvg({
  kind,
  red = false,
  faceDown = false,
  rotated = false,
  dimmed = false,
  size = 'md',
  className,
  ariaLabel,
}: TileSvgProps): JSX.Element {
  const defaultLabel = faceDown ? FACE_DOWN_LABEL : tileLabel(kind, red);
  const label = ariaLabel === undefined ? defaultLabel : ariaLabel;
  const decorative = label === '';

  return (
    <span
      className={cx(
        styles.tile,
        styles[size],
        faceDown && styles.faceDown,
        rotated && styles.rotated,
        dimmed && styles.dimmed,
        !faceDown && red && styles.red,
        className,
      )}
      data-tile-kind={faceDown ? undefined : kind}
    >
      <svg
        className={styles.svg}
        viewBox={VIEW_BOX}
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
        {...(decorative
          ? { 'aria-hidden': true as const }
          : { role: 'img', 'aria-label': label })}
      >
        {faceDown ? (
          <>
            <rect
              className={styles.backBody}
              x={0.75}
              y={0.75}
              width={58.5}
              height={78.5}
              rx={7.5}
            />
            <TileBack />
          </>
        ) : (
          <>
            <rect
              className={styles.body}
              x={0.75}
              y={0.75}
              width={58.5}
              height={78.5}
              rx={7.5}
            />
            <rect className={styles.faceplate} x={3} y={2.5} width={54} height={72} rx={5.5} />
            <rect className={styles.bevel} x={3} y={2.5} width={54} height={72} rx={5.5} />
            <TileFace kind={kind} />
          </>
        )}
      </svg>
    </span>
  );
}

/**
 * Same renderer, keyed off a physical {@link TileId}: `kind` comes from
 * `kindOf` and `red` defaults to `isRedFive`. Pass `red` explicitly to
 * override (e.g. when the rule set disables aka dora).
 */
export function TileById({ tileId, red, ...rest }: TileByIdProps): JSX.Element {
  return <TileSvg kind={kindOf(tileId)} red={red ?? isRedFive(tileId)} {...rest} />;
}

export default TileSvg;
