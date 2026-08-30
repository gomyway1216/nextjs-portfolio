import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { games, getGameCoverPath } from '@/components/game/constants/games';

describe('game cover assets', () => {
  it('provides a valid WebP cover for every game', () => {
    for (const game of games) {
      const publicPath = getGameCoverPath(game.id);
      const filePath = join(process.cwd(), 'public', publicPath.slice(1));

      expect(publicPath).toBe(`/img/games/covers/${game.id}.webp`);
      expect(existsSync(filePath), `${game.id} cover is missing`).toBe(true);
      expect(statSync(filePath).size, `${game.id} cover is unexpectedly small`).toBeGreaterThan(10_000);

      const header = readFileSync(filePath).subarray(0, 12);
      expect(header.subarray(0, 4).toString()).toBe('RIFF');
      expect(header.subarray(8, 12).toString()).toBe('WEBP');
    }
  });
});
