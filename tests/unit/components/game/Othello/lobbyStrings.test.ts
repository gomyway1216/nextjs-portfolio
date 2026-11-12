import { describe, expect, it } from 'vitest';

import { getOthelloStrings } from '@/components/game/Othello/i18n';

describe('Othello online lobby strings', () => {
  const en = getOthelloStrings('en').lobby;
  const ja = getOthelloStrings('ja').lobby;

  it('has every lobby string in both languages, and none of the Japanese ones left in English', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (key === 'errors') continue;
      expect(ja[key], key).toBeTruthy();
      expect(ja[key], key).not.toBe(en[key]);
      expect(ja[key] as string, key).not.toMatch(/[A-Za-z]{3,}/);
    }
  });

  it("translates the lobby's own error messages into Japanese", () => {
    for (const message of ['Room was closed', 'Failed to create room', 'Failed to join room', 'Network error']) {
      expect(ja.errors[message], message).toBeTruthy();
    }
  });
});
