import { describe, expect, it } from 'vitest';

import { getDoubtStrings, isDefaultYouName } from '@/components/game/Doubt/i18n';

describe('Doubt strings', () => {
  it('knows the default name in either language, so "(You)" is not added to it', () => {
    expect(isDefaultYouName(getDoubtStrings('ja').yourNamePlaceholder)).toBe(true);
    expect(isDefaultYouName(getDoubtStrings('en').yourNamePlaceholder)).toBe(true);
    expect(isDefaultYouName(' you ')).toBe(true);
  });

  it('keeps the marker for a name the player typed', () => {
    expect(isDefaultYouName('Yudai')).toBe(false);
    expect(isDefaultYouName('あなたの友達')).toBe(false);
    expect(isDefaultYouName('')).toBe(false);
  });

  it('has the mode-select screen in Japanese, with no English left in it', () => {
    const ja = getDoubtStrings('ja');
    const en = getDoubtStrings('en');
    for (const key of ['menuBackToGames', 'menuTitle', 'menuChooseMode', 'menuVsAi', 'menuOnline', 'menuDescription'] as const) {
      expect(ja[key]).not.toBe(en[key]);
      expect(ja[key].replace(/AI/g, '')).not.toMatch(/[A-Za-z]{2,}/);
      expect(en[key].length).toBeGreaterThan(0);
    }
  });
});
