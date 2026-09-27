import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_COVER_SIZE, games, getGameCoverPath } from '@/components/game/constants/games';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

describe('buildGameMetadata', () => {
  it('derives title, description, canonical and social card from the catalog', () => {
    const shogi = games.find((game) => game.id === 'shogi')!;
    const metadata = buildGameMetadata('shogi');

    expect(metadata.title).toBe(shogi.title);
    expect(metadata.description).toContain(shogi.description);
    expect(metadata.alternates?.canonical).toBe('/games/shogi');
    expect(metadata.openGraph?.url).toBe('/games/shogi');
    expect(metadata.openGraph?.title).toBe('Shogi | Yudai Yaguchi');
    expect(JSON.stringify(metadata.openGraph?.images)).toContain(getGameCoverPath('shogi'));
  });

  it('throws for an id that is not in the catalog', () => {
    expect(() => buildGameMetadata('not-a-game')).toThrow(/unknown game id/);
  });

  it('gives every catalog game a distinct title and canonical', () => {
    const titles = new Set(games.map((game) => buildGameMetadata(game.id).title));
    const canonicals = new Set(games.map((game) => buildGameMetadata(game.id).alternates?.canonical));
    expect(titles.size).toBe(games.length);
    expect(canonicals.size).toBe(games.length);
  });
});

/** Width/height from a WebP file header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf: Buffer): { width: number; height: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

describe('game cover images', () => {
  it('reads the size from every WebP header variant', () => {
    // 13×7 images encoded by sharp: lossy, lossless and extended (with alpha).
    const fixtures = {
      'VP8 ': 'UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoNAAcAAsBMJaACdLoAA5gA/u2QP4hd7G2//PTP62/j/xkAAAA=',
      VP8L: 'UklGRh4AAABXRUJQVlA4TBEAAAAvDIABAAdQjyLXo/+BiOh/AAA=',
      VP8X: 'UklGRloAAABXRUJQVlA4WAoAAAAQAAAADAAABgAAQUxQSAoAAAABB1DAiAhERP8DVlA4ICoAAACQAQCdASoNAAcAAsBMJaACdLoAA5gA/u2QP4hd7G2//PTP62/j/xkAAAA=',
    };
    for (const [chunk, base64] of Object.entries(fixtures)) {
      const buf = Buffer.from(base64, 'base64');
      expect(buf.toString('ascii', 12, 16)).toBe(chunk);
      expect(webpSize(buf)).toEqual({ width: 13, height: 7 });
    }
    expect(() => webpSize(Buffer.from('not an image at all'))).toThrow(/not a WebP/);
  });

  it('declares the real cover size in Open Graph metadata', () => {
    const [image] = buildGameMetadata('roulette').openGraph?.images as { width: number; height: number }[];
    expect({ width: image.width, height: image.height }).toEqual(GAME_COVER_SIZE);
  });

  for (const game of games) {
    it(`${game.id} has a ${GAME_COVER_SIZE.width}×${GAME_COVER_SIZE.height} cover`, () => {
      const file = join(process.cwd(), 'public', getGameCoverPath(game.id));
      expect(existsSync(file)).toBe(true);
      expect(webpSize(readFileSync(file))).toEqual(GAME_COVER_SIZE);
    });
  }
});

describe('/games layout keeps the site title template for game pages', () => {
  it('declares title as default + template, not a bare string', async () => {
    const { metadata } = await import('@/app/games/layout');
    expect(metadata.title).toEqual({
      default: 'Games & Interactive Demos',
      template: '%s | Yudai Yaguchi',
    });
  });
});

describe('every /games/<id> route exports its catalog metadata', () => {
  const appDir = join(process.cwd(), 'src', 'app', 'games');

  for (const game of games) {
    it(`${game.id} page or layout calls buildGameMetadata('${game.id}')`, () => {
      const candidates = [join(appDir, game.id, 'page.tsx'), join(appDir, game.id, 'layout.tsx')];
      const sources = candidates.filter(existsSync).map((file) => readFileSync(file, 'utf8'));
      expect(sources.length).toBeGreaterThan(0);
      // Tolerant of quote style and whitespace; strict about the id.
      const call = new RegExp(`buildGameMetadata\\(\\s*['"\`]${game.id}['"\`]\\s*\\)`);
      expect(sources.some((source) => call.test(source))).toBe(true);
    });
  }
});
