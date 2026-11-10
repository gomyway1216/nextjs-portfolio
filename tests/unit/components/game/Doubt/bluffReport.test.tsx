/**
 * Render-to-string checks for the post-game bluff report (the repo has no DOM
 * test environment), covering both languages.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BluffReport } from '@/components/game/Doubt/BluffReport';
import type { ClaimRecord } from '@/components/game/Doubt/claimHistory';
import { getDoubtStrings } from '@/components/game/Doubt/i18n';

const NAMES: Record<string, string> = { me: 'Yuki', a1: 'AI 1', a2: 'AI 2' };
const nameOf = (id: string) => NAMES[id] ?? id;

const history: ClaimRecord[] = [
  {
    id: 'r1',
    playerId: 'me',
    declaredRank: 1,
    cards: [{ id: 'c1', suit: 'S', rank: 1 }, { id: 'c2', suit: 'H', rank: 13 }],
    truthful: false,
    outcome: 'accepted',
    challengerId: 'a1',
    pileTakerId: null,
    pileSize: 0,
  },
  {
    id: 'r2',
    playerId: 'a1',
    declaredRank: 2,
    cards: [{ id: 'c3', suit: 'D', rank: 2 }],
    truthful: true,
    outcome: 'doubted',
    challengerId: 'a2',
    pileTakerId: 'a2',
    pileSize: 3,
  },
  {
    id: 'r3',
    playerId: 'a2',
    declaredRank: 3,
    cards: [{ id: 'c4', suit: 'C', rank: 9 }],
    truthful: false,
    outcome: 'doubted',
    challengerId: 'me',
    pileTakerId: 'a2',
    pileSize: 1,
  },
  {
    id: 'r4',
    playerId: 'me',
    declaredRank: 4,
    cards: [{ id: 'c5', suit: 'S', rank: 4 }],
    truthful: true,
    outcome: 'pending',
    challengerId: null,
    pileTakerId: null,
    pileSize: 0,
  },
];

function render(language: 'en' | 'ja', records = history, defaultExpanded = true): string {
  return renderToStaticMarkup(
    <BluffReport
      history={records}
      playerOrder={['me', 'a1', 'a2']}
      humanId="me"
      nameOf={nameOf}
      strings={getDoubtStrings(language)}
      defaultExpanded={defaultExpanded}
    />,
  );
}

describe('BluffReport', () => {
  it('summarises the human player and reveals every resolved claim', () => {
    const html = render('en');

    expect(html).toContain('Bluff report');
    expect(html).toContain('1 got through · 0 caught');
    expect(html).toContain('1 right · 0 wrong');
    expect(html).toContain('claimed 2 × A');
    expect(html).toContain('K♥');
    expect(html).toContain('Accepted by AI 1');
    expect(html).toContain('Doubted by AI 2 — AI 2 picked up 3');
    expect(html).toContain('Doubted by Yuki — AI 2 picked up 1');
    // The still-pending claim is not part of the report.
    expect(html).not.toContain('claimed 1 × 4');
    expect(html.match(/<li/g)).toHaveLength(3);
  });

  it('keeps the claim list collapsed until asked', () => {
    const html = render('en', history, false);

    expect(html).toContain('Show all 3 claims');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<li');
  });

  it('is fully translated to Japanese', () => {
    const html = render('ja');

    expect(html).toContain('ブラフの答え合わせ');
    expect(html).toContain('成功 1 回 · 見破られた 0 回');
    expect(html).toContain('A を 2 枚と宣言');
    expect(html).toContain('AI 1 が受け入れた');
    expect(html).not.toMatch(/Accepted|Doubted|claimed|Bluff/);
  });

  it('renders nothing when no claim was resolved', () => {
    expect(render('en', [])).toBe('');
    expect(render('en', [history[3]!])).toBe('');
  });

  it('has a translation for every report string in both languages', () => {
    const en = getDoubtStrings('en');
    const ja = getDoubtStrings('ja');
    const keys = Object.keys(en).filter(k => k.startsWith('report')) as (keyof typeof en)[];

    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(ja[key], key).toBeDefined();
      expect(typeof ja[key], key).toBe(typeof en[key]);
    }
  });
});
