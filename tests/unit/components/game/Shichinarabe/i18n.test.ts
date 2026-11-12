import { describe, expect, it } from 'vitest';

import { getShichinarabeStrings, isDefaultYouName } from '@/components/game/Shichinarabe/i18n';

describe('Shichinarabe strings', () => {
  it('knows the default name in either language, so "(You)" is not added to it', () => {
    expect(isDefaultYouName(getShichinarabeStrings('ja').namePlaceholder)).toBe(true);
    expect(isDefaultYouName(getShichinarabeStrings('en').namePlaceholder)).toBe(true);
    expect(isDefaultYouName(' you ')).toBe(true);
  });

  it('keeps the marker for a name the player typed', () => {
    expect(isDefaultYouName('Yudai')).toBe(false);
    expect(isDefaultYouName('あなたの友達')).toBe(false);
    expect(isDefaultYouName('')).toBe(false);
  });

  it('has the mode-select screen in Japanese, with no English left in it', () => {
    const ja = getShichinarabeStrings('ja');
    const en = getShichinarabeStrings('en');
    for (const key of ['menuBackToGames', 'menuTitle', 'menuChooseMode', 'menuVsAi', 'menuOnline', 'menuDescription'] as const) {
      expect(ja[key]).not.toBe(en[key]);
      expect(ja[key].replace(/AI/g, '')).not.toMatch(/[A-Za-z]{2,}/);
      expect(en[key].length).toBeGreaterThan(0);
    }
  });
});
