import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FISH } from '@/components/game/Fishing/engine';
import { FishName, nameParts } from '@/components/game/Fishing/FishName';
import { getStrings } from '@/components/game/Fishing/i18n';

describe('where a fish’s name may wrap in a narrow column', () => {
  it('cuts a Japanese name where its katakana word begins, never inside a word', () => {
    expect(nameParts('みかづきカジキ')).toEqual(['みかづき', 'カジキ']);
    expect(nameParts('ちょうちんイカ')).toEqual(['ちょうちん', 'イカ']);
    expect(nameParts('いかずちマグロ')).toEqual(['いかずち', 'マグロ']);
    // After a kanji or hiragana too; the space in the name breaks a line by itself.
    expect(nameParts('港のヌシ ツキウロコ')).toEqual(['港の', 'ヌシ ツキウロコ']);
  });

  it('leaves a name of one word, and an English name, whole', () => {
    expect(nameParts('リボンダイ')).toEqual(['リボンダイ']);
    expect(nameParts('あぶくっこ')).toEqual(['あぶくっこ']);
    expect(nameParts('宝箱')).toEqual(['宝箱']);
    expect(nameParts('Moonscale, the Harbor Lord')).toEqual(['Moonscale, the Harbor Lord']);
    expect(nameParts('')).toEqual(['']);
  });

  it('keeps every fish’s name character for character in both languages, with no piece empty and none cut inside katakana', () => {
    for (const language of ['en', 'ja'] as const) {
      const names = getStrings(language).fishNames;
      for (const fish of FISH) {
        const parts = nameParts(names[fish.id]);
        expect(parts.join('')).toBe(names[fish.id]);
        for (const part of parts) expect(part.length).toBeGreaterThan(0);
        // No piece ends in katakana while the next begins with it: that would be a word cut in two.
        for (let i = 1; i < parts.length; i++) expect(/[゠-ヿ]$/.test(parts[i - 1]) && /^[゠-ヿ]/.test(parts[i])).toBe(false);
      }
    }
  });

  it('draws the name as its own text, a break allowed only between the pieces', () => {
    const markup = renderToStaticMarkup(<FishName name="みかづきカジキ" />);
    expect(markup).toMatch(/^<span class="[^"]*fishName[^"]*">みかづき<wbr\/>カジキ<\/span>$/);
    expect(renderToStaticMarkup(<FishName name="Bubble Fry" />)).toMatch(/^<span class="[^"]*">Bubble Fry<\/span>$/);
  });
});
