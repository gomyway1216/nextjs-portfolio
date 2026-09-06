import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { games, getGameCoverPath } from '@/components/game/constants/games';
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
