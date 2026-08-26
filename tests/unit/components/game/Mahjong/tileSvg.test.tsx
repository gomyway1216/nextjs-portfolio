/**
 * Riichi Mahjong — tile renderer tests.
 *
 * The repo has no jsdom environment and no `@testing-library/react` (and this
 * milestone may not add dependencies), so these are render-to-string
 * assertions via `react-dom/server`. `TileSvg` is a pure function of its props
 * with no state, effects or event handlers, so the static markup is the whole
 * observable surface.
 *
 * Class names come from the imported CSS module rather than being hard-coded,
 * so the assertions survive both the vitest identity proxy and hashed
 * production class names.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  FACE_DOWN_LABEL,
  TileById,
  TileSvg,
  tileLabel,
} from '@/components/game/Mahjong/TileSvg';
import styles from '@/components/game/Mahjong/TileSvg.module.css';
import {
  MAN_START,
  PIN_START,
  SOU_START,
  HONOR_START,
} from '@/components/game/Mahjong/engine/tiles';
import { TILE_KIND_COUNT } from '@/components/game/Mahjong/engine/types';

/** Count elements of `tag` whose class attribute contains `className`. */
function countElements(html: string, tag: string, className: string): number {
  const re = new RegExp(`<${tag}\\b[^>]*?class="([^"]*)"`, 'g');
  let count = 0;
  let match = re.exec(html);
  while (match !== null) {
    if (match[1].split(/\s+/).includes(className)) count += 1;
    match = re.exec(html);
  }
  return count;
}

function countTags(html: string, tag: string): number {
  return html.match(new RegExp(`<${tag}\\b`, 'g'))?.length ?? 0;
}

function attr(html: string, name: string): string | null {
  return new RegExp(`${name}="([^"]*)"`).exec(html)?.[1] ?? null;
}

describe('TileSvg', () => {
  it('renders every one of the 34 kinds as a non-empty svg', () => {
    for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
      const html = renderToStaticMarkup(<TileSvg kind={kind} />);
      expect(html, `kind ${kind}`).toContain('<svg');
      expect(html, `kind ${kind}`).toContain('viewBox="0 0 60 80"');
      expect(html, `kind ${kind}`).toContain('role="img"');
      // Something is drawn on the faceplate beyond the body/faceplate/bevel.
      const drawn =
        countTags(html, 'circle') +
        countTags(html, 'path') +
        countTags(html, 'text') +
        countTags(html, 'rect');
      expect(drawn, `kind ${kind} draws nothing`).toBeGreaterThan(3);
    }
  });

  it('labels every kind with a readable accessible name', () => {
    for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
      const html = renderToStaticMarkup(<TileSvg kind={kind} />);
      expect(attr(html, 'aria-label')).toBe(tileLabel(kind));
    }
    expect(tileLabel(MAN_START + 4)).toBe('5 of characters');
    expect(tileLabel(PIN_START)).toBe('1 of circles');
    expect(tileLabel(SOU_START + 8)).toBe('9 of bamboo');
    expect(tileLabel(HONOR_START)).toBe('East wind');
    expect(tileLabel(HONOR_START + 4)).toBe('White dragon');
    expect(tileLabel(HONOR_START + 6)).toBe('Red dragon');
  });

  it('draws pin tiles 1-9 with exactly rank-many pip circles', () => {
    for (let rank = 1; rank <= 9; rank += 1) {
      const html = renderToStaticMarkup(<TileSvg kind={PIN_START + rank - 1} />);
      expect(countTags(html, 'circle'), `${rank}p circle count`).toBe(rank);
      expect(countElements(html, 'circle', styles.pip), `${rank}p pip class`).toBe(rank);
    }
  });

  it('draws sou tiles 2-9 with exactly rank-many bamboo sticks', () => {
    for (let rank = 2; rank <= 9; rank += 1) {
      const html = renderToStaticMarkup(<TileSvg kind={SOU_START + rank - 1} />);
      expect(countElements(html, 'g', styles.souStick), `${rank}s stick count`).toBe(rank);
    }
  });

  it('renders 1s as the bird variant rather than a stick', () => {
    const html = renderToStaticMarkup(<TileSvg kind={SOU_START} />);
    expect(countElements(html, 'g', styles.bird)).toBe(1);
    expect(countElements(html, 'g', styles.souStick)).toBe(0);
    expect(html).toContain(styles.birdBeak);
    // The bird is drawn from paths, so it must not disturb pin pip counting.
    expect(countTags(html, 'circle')).toBe(0);
  });

  it('renders man tiles as a numeral plus the 萬 glyph', () => {
    const html = renderToStaticMarkup(<TileSvg kind={MAN_START + 2} />);
    expect(countTags(html, 'text')).toBe(2);
    expect(html).toContain('>3</text>');
    expect(html).toContain('萬');
  });

  it('renders honour glyphs, and haku as a blank frame', () => {
    const winds = ['東', '南', '西', '北'];
    winds.forEach((glyph, i) => {
      const html = renderToStaticMarkup(<TileSvg kind={HONOR_START + i} />);
      expect(html).toContain(glyph);
      expect(countTags(html, 'text')).toBe(1);
    });

    const haku = renderToStaticMarkup(<TileSvg kind={HONOR_START + 4} />);
    expect(countTags(haku, 'text')).toBe(0);
    expect(haku).toContain(styles.hakuOuter);
    expect(haku).toContain(styles.hakuInner);

    expect(renderToStaticMarkup(<TileSvg kind={HONOR_START + 5} />)).toContain('發');
    expect(renderToStaticMarkup(<TileSvg kind={HONOR_START + 6} />)).toContain('中');
  });

  it('renders a face-down tile with no face content and a back label', () => {
    const html = renderToStaticMarkup(<TileSvg kind={PIN_START + 4} faceDown />);
    expect(attr(html, 'aria-label')).toBe(FACE_DOWN_LABEL);
    expect(html).toContain(styles.faceDown);
    expect(html).toContain(styles.backFace);
    // No faceplate and nothing engraved on it.
    expect(html).not.toContain(styles.faceplate);
    expect(countTags(html, 'circle')).toBe(0);
    expect(countTags(html, 'text')).toBe(0);
    expect(countElements(html, 'g', styles.souStick)).toBe(0);
    // The kind must not leak into the DOM for a hidden tile.
    expect(html).not.toContain('data-tile-kind');
  });

  it('marks red fives with the red modifier and says so in the label', () => {
    const html = renderToStaticMarkup(<TileSvg kind={SOU_START + 4} red />);
    expect(html).toContain(styles.red);
    expect(attr(html, 'aria-label')).toBe('5 of bamboo (red)');

    const plain = renderToStaticMarkup(<TileSvg kind={SOU_START + 4} />);
    expect(plain).not.toContain(`class="${styles.tile} ${styles.md} ${styles.red}"`);
    expect(attr(plain, 'aria-label')).toBe('5 of bamboo');
  });

  it('never applies the red modifier to a face-down tile', () => {
    const html = renderToStaticMarkup(<TileSvg kind={PIN_START + 4} red faceDown />);
    expect(countElements(html, 'span', styles.red)).toBe(0);
    expect(attr(html, 'aria-label')).toBe(FACE_DOWN_LABEL);
  });

  it('applies the rotation class only when rotated', () => {
    const rotated = renderToStaticMarkup(<TileSvg kind={MAN_START} rotated />);
    expect(countElements(rotated, 'span', styles.rotated)).toBe(1);

    const upright = renderToStaticMarkup(<TileSvg kind={MAN_START} />);
    expect(countElements(upright, 'span', styles.rotated)).toBe(0);
  });

  it('applies the dimmed and size classes, and passes className through', () => {
    const html = renderToStaticMarkup(
      <TileSvg kind={MAN_START} dimmed size="sm" className="pondTile" />,
    );
    expect(countElements(html, 'span', styles.dimmed)).toBe(1);
    expect(countElements(html, 'span', styles.sm)).toBe(1);
    expect(countElements(html, 'span', 'pondTile')).toBe(1);

    const large = renderToStaticMarkup(<TileSvg kind={MAN_START} size="lg" />);
    expect(countElements(large, 'span', styles.lg)).toBe(1);
  });

  it('supports an explicitly decorative tile', () => {
    const html = renderToStaticMarkup(<TileSvg kind={MAN_START} ariaLabel="" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('aria-label');
  });

  it('honours a caller-supplied aria label', () => {
    const html = renderToStaticMarkup(<TileSvg kind={MAN_START} ariaLabel="your winning tile" />);
    expect(attr(html, 'aria-label')).toBe('your winning tile');
  });
});

describe('TileById', () => {
  it('derives the kind from the tile id', () => {
    // Tile ids 36..39 are all 1p (kind 9 = PIN_START).
    for (let copy = 0; copy < 4; copy += 1) {
      const html = renderToStaticMarkup(<TileById tileId={PIN_START * 4 + copy} />);
      expect(attr(html, 'aria-label')).toBe('1 of circles');
      expect(countTags(html, 'circle')).toBe(1);
    }
  });

  it('derives red fives from the tile id', () => {
    for (const redId of [16, 52, 88]) {
      const html = renderToStaticMarkup(<TileById tileId={redId} />);
      expect(attr(html, 'aria-label')).toContain('(red)');
      expect(countElements(html, 'span', styles.red)).toBe(1);
    }

    // The other three copies of 5m are ordinary tiles.
    for (const plainId of [17, 18, 19]) {
      const html = renderToStaticMarkup(<TileById tileId={plainId} />);
      expect(attr(html, 'aria-label')).toBe('5 of characters');
      expect(countElements(html, 'span', styles.red)).toBe(0);
    }
  });

  it('lets the caller override the red-five derivation', () => {
    const html = renderToStaticMarkup(<TileById tileId={16} red={false} />);
    expect(attr(html, 'aria-label')).toBe('5 of characters');
    expect(countElements(html, 'span', styles.red)).toBe(0);
  });
});
