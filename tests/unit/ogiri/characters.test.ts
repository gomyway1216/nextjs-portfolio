import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CHARACTERS, characterFor } from '@/lib/ogiri/characters';
import { AVATARS } from '@/lib/ogiri/types';

describe('original character assets', () => {
  it('covers every existing avatar identifier without changing saved games', async () => {
    expect(CHARACTERS.map((c) => c.avatar)).toEqual(AVATARS);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(20);
    let bytes = 0;
    for (const character of CHARACTERS) {
      const file = path.join(
        process.cwd(),
        'public/img/games/ogiri/characters',
        `${character.id}.webp`,
      );
      const data = readFileSync(file);
      expect(data.toString('ascii', 8, 12)).toBe('WEBP');
      const metadata = await sharp(data).metadata();
      expect(metadata).toMatchObject({ width: 384, height: 384, hasAlpha: true });
      bytes += statSync(file).size;
      expect(characterFor(character.avatar)).toBe(character);
    }
    expect(bytes).toBeLessThan(550_000);
    expect(characterFor('unknown')).toBe(CHARACTERS[0]);
  });
});
