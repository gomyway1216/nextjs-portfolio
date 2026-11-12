import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getMiniAdventureStrings } from '@/components/game/MiniAdventure/i18n';
import { PetType, StatusEffect } from '@/components/game/MiniAdventure/types';

const source = readFileSync(join(process.cwd(), 'src/components/game/MiniAdventure/MiniAdventure.tsx'), 'utf8');

describe('Mini Adventure status row names', () => {
  it.each(['ja', 'en'] as const)('names every pet and every status in %s', (language) => {
    const t = getMiniAdventureStrings(language);
    for (const pet of Object.values(PetType)) {
      expect(t.petNames[pet], pet).toBeTruthy();
      // Never the raw id.
      expect(t.petNames[pet]).not.toContain('_');
    }
    for (const status of Object.values(StatusEffect)) {
      if (status === StatusEffect.NONE) continue;
      expect(t.sight.status[status], status).toBeTruthy();
    }
  });

  it('gives Japanese names in the Japanese UI', () => {
    const ja = getMiniAdventureStrings('ja');
    for (const pet of Object.values(PetType)) expect(ja.petNames[pet]).not.toMatch(/[A-Za-z]/);
    expect(ja.sight.status[StatusEffect.FROZEN]).not.toMatch(/[A-Za-z]/);
  });

  // The status row used to print the raw enum ("frozen") and the raw pet id.
  it('renders the pills from the translations, not from the raw values', () => {
    expect(source).toContain('{t.sight.status[player.status]}');
    expect(source).toContain('{t.petNames[player.pet]}');
    expect(source).not.toMatch(/>\{player\.status\}</);
    expect(source).not.toContain("player.pet.replace(");
  });
});
