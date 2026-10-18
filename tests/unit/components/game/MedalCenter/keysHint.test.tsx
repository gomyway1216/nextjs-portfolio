import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getStrings as baccarat } from '@/components/game/Baccarat/i18n';
import { getStrings as blackjack } from '@/components/game/Blackjack/i18n';
import { getStrings as craps } from '@/components/game/Craps/i18n';
import { KeysHint, keyParts } from '@/components/game/MedalCenter/KeysHint';
import { getStrings as threeCardPoker } from '@/components/game/ThreeCardPoker/i18n';
import { getStrings as videoPoker } from '@/components/game/VideoPoker/i18n';

const LINES = (['en', 'ja'] as const).flatMap((language) => [blackjack, baccarat, threeCardPoker, craps, videoPoker].map((strings) => strings(language).keysHint));

describe('a keys line', () => {
  it('is cut into its parts, the separator kept with the part before it, and nothing lost', () => {
    expect(keyParts('Keys: Space or Enter rolls · R repeat bets · U undo')).toEqual(['Keys: Space or Enter rolls ·', 'R repeat bets ·', 'U undo']);
    expect(keyParts('キー：Space か Enter でロール・R で前回と同じ賭け・U で取り消し')).toEqual(['キー：Space か Enter でロール・', 'R で前回と同じ賭け・', 'U で取り消し']);
    for (const line of LINES) {
      expect(keyParts(line).length, line).toBeGreaterThan(2);
      expect(keyParts(line).join(line.includes(' · ') ? ' ' : ''), line).toBe(line);
    }
  });

  it('reads as it did, each part kept whole on a line', () => {
    for (const line of LINES) {
      const markup = renderToStaticMarkup(<KeysHint text={line} className="hint" testId="keys" />);
      expect(markup.replace(/<[^>]+>/g, ''), line).toBe(line);
      expect(markup.match(/white-space:nowrap/g)?.length, line).toBe(keyParts(line).length);
    }
  });
});
