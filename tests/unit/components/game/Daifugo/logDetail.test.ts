import { describe, expect, it } from 'vitest';

import { formatDaifugoLogDetail } from '@/components/game/Daifugo/errorMessages';
import { applyAction, createInitialDaifugoState } from '@/components/game/Daifugo/gameLogic';
import en from '@/locales/en/common.json';
import ja from '@/locales/ja/common.json';

type Dictionary = { [key: string]: string | Dictionary };

/** A stand-in for i18next's `t`: looks the dotted key up in one language's file. */
function translator(dictionary: unknown) {
  return (key: string): string => {
    const value = key.split('.').reduce<string | Dictionary | undefined>(
      (node, part) => (node && typeof node === 'object' ? node[part] : undefined),
      dictionary as Dictionary,
    );
    if (typeof value !== 'string') throw new Error(`missing translation: ${key}`);
    return value;
  };
}

const ENGINE_DETAILS = ['Round 2 started', 'Round finished', 'Revolution toggled', 'Eleven-back active'];

describe('formatDaifugoLogDetail', () => {
  it('shows the engine\'s fixed log details in Japanese', () => {
    const t = translator(ja);
    expect(ENGINE_DETAILS.map((detail) => formatDaifugoLogDetail(t, detail))).toEqual([
      'ラウンド 2',
      'ラウンド終了',
      '革命',
      '11バック',
    ]);
  });

  it('leaves no English engine wording in the Japanese log', () => {
    const t = translator(ja);
    for (const detail of ENGINE_DETAILS) {
      expect(formatDaifugoLogDetail(t, detail)).not.toMatch(/[A-Za-z]{3,}/);
    }
  });

  it('shows them in English too', () => {
    const t = translator(en);
    expect(ENGINE_DETAILS.map((detail) => formatDaifugoLogDetail(t, detail))).toEqual([
      'Round 2',
      'round end',
      'Revolution',
      '11-Back',
    ]);
  });

  it('passes an unknown detail through unchanged', () => {
    expect(formatDaifugoLogDetail(translator(ja), 'something else')).toBe('something else');
  });

  it('covers the detail a next round really starts with', () => {
    const state = createInitialDaifugoState(['a', 'b', 'c'], { round: 3 });
    const detail = state.log[0]?.detail;
    expect(detail).toBeDefined();
    expect(formatDaifugoLogDetail(translator(ja), detail!)).toBe('ラウンド 3');
  });

  it('covers the detail a jack really writes (eleven-back)', () => {
    const start = createInitialDaifugoState(['a', 'b', 'c']);
    const leader = start.currentTurnPlayerId;
    const jack = { id: 'jack', suit: 'S' as const, rank: 11 };
    const state = { ...start, hands: { ...start.hands, [leader]: [jack, ...start.hands[leader]] } };
    const result = applyAction(state, {
      actionId: 'act',
      type: 'play',
      playerId: leader,
      cardIds: [jack.id],
      timestamp: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const details = result.state.log.map((entry) => entry.detail).filter((detail): detail is string => !!detail);
    expect(details).toContain('Eleven-back active');
    for (const detail of details) {
      expect(formatDaifugoLogDetail(translator(ja), detail)).not.toMatch(/[A-Za-z]{3,}/);
    }
  });
});
