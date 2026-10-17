import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { Board, BestAtEach, FeedList, PlaceCard, type PlaceState } from '@/components/game/MedalCenter/floor/FloorParts';
import { FloorRankings } from '@/components/game/MedalCenter/floor/FloorRankings';
import { FloorTogether } from '@/components/game/MedalCenter/floor/FloorTogether';
import { MEDAL_RANKINGS_PATH } from '@/components/game/MedalCenter/floor/paths';
import { getFloorStrings, type FloorStrings } from '@/components/game/MedalCenter/floor/strings';
import { createI18nInstance } from '@/lib/i18n';
import type { FloorFeedEntry, FloorRow } from '@/lib/medalFloor/types';

const inLanguage = (lang: 'en' | 'ja', node: React.ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

const words = (lang: 'en' | 'ja' = 'en') => {
  const i18n = createI18nInstance(lang);
  const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
  return { t: getFloorStrings(lang), fmt: (n: number) => n.toLocaleString(locale), gameName: (game: string) => i18n.t(`games.${game}.title`) };
};

const NOW = Date.UTC(2026, 9, 17, 6, 0, 0);
const FEED: FloorFeedEntry[] = [
  { id: 3, name: 'Lucky Cat', tag: '0001', game: 'medal-pusher', label: 'jackpot', medals: 523, at: NOW - 120_000 },
  { id: 2, name: null, tag: '1234', game: 'slot-machine', label: 'seven3', medals: 3_000, at: NOW - 10_000 },
  { id: 1, name: 'みけ', tag: '0002', game: 'janken', label: 'double-up', medals: 160, at: NOW - 3 * 3_600_000 },
];

describe('the floor’s moments', () => {
  it('say who won what at which machine, and when, in English', () => {
    const html = renderToStaticMarkup(<FeedList {...words()} feed={FEED} now={NOW} loading={false} unavailable={false} />);
    expect(html).toContain('Lucky Cat</bdi> <span>hit the JACKPOT: 523 medals</span>');
    expect(html).toContain('Player 1234</bdi> <span>lined up three sevens: 3,000 medals</span>');
    expect(html).toContain('won a 160-medal double-up');
    expect(html).toContain('Medal Pusher · <time');
    expect(html).toContain('2 min ago');
    expect(html).toContain('just now');
    expect(html).toContain('3 h ago');
    expect(html.match(/data-testid="floor-moment"/g)).toHaveLength(3);
    expect(html).not.toContain('floor-hide-moment');
  });

  it('and in Japanese', () => {
    const html = renderToStaticMarkup(<FeedList {...words('ja')} feed={FEED} now={NOW} loading={false} unavailable={false} />);
    expect(html).toContain('ジャックポット！523枚');
    expect(html).toContain('プレイヤー1234');
    expect(html).toContain('7が3つそろって3,000枚');
    expect(html).toContain('ダブルアップで160枚');
    expect(html).toContain('2分前');
  });

  it('say so when the floor is quiet or cannot be reached, and give the owner a way to take one off', () => {
    expect(renderToStaticMarkup(<FeedList {...words()} feed={[]} now={NOW} loading={false} unavailable={false} />)).toContain(getFloorStrings('en').feedEmpty);
    expect(renderToStaticMarkup(<FeedList {...words()} feed={[]} now={NOW} loading={false} unavailable />)).toContain(getFloorStrings('en').feedUnavailable);
    expect(renderToStaticMarkup(<FeedList {...words()} feed={FEED} now={NOW} loading={false} unavailable={false} onHide={() => {}} />).match(/floor-hide-moment/g)).toHaveLength(3);
  });
});

describe('the boards', () => {
  const rows: FloorRow[] = [
    { rank: 1, name: 'Lucky Cat', tag: '0001', score: 3_210, at: 1 },
    { rank: 2, name: null, tag: '1234', score: 160, at: 2 },
    { rank: 2, name: 'Ben', tag: '0003', score: 160, at: 3 },
  ];

  it('rank players by name and medals, sharing a rank where they tie', () => {
    const html = renderToStaticMarkup(<Board {...words()} title="Medals won" rows={rows} testId="won" />);
    expect(html.match(/data-rank="2"/g)).toHaveLength(2);
    expect(html).toContain('#1');
    expect(html).toContain('3,210 medals');
    expect(html).toContain('Player 1234');
    expect(html).not.toContain('floor-block');
    expect(renderToStaticMarkup(<Board {...words('ja')} title="獲得メダル" rows={rows} testId="won" />)).toContain('1位');
    expect(renderToStaticMarkup(<Board {...words()} title="x" rows={[]} testId="won" />)).toContain(getFloorStrings('en').boardEmpty);
  });

  it('show the owner the hidden lines, marked, with the owner’s controls', () => {
    const owned: FloorRow[] = [
      { rank: 0, name: 'Cheater', tag: '0009', score: 99_999, at: 1, pid: '0123456789abcdef', hidden: true, blocked: false },
      { rank: 0, name: 'Blocked', tag: '0008', score: 500, at: 1, pid: 'fedcba9876543210', hidden: true, blocked: true },
      { rank: 1, name: 'Ann', tag: '0001', score: 100, at: 1, pid: '00112233445566aa', hidden: false, blocked: false },
    ];
    const html = renderToStaticMarkup(<Board {...words()} title="x" rows={owned} testId="won" owner={{ hide: () => {}, block: () => {} }} />);
    expect(html.match(/data-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('>Hidden<');
    expect(html).toContain('>Show<');
    expect(html).toContain('>Unblock player<');
    expect(html.match(/>Block player</g)).toHaveLength(2);
  });

  it('give the hub the biggest win at each machine that has one', () => {
    const html = renderToStaticMarkup(
      <BestAtEach {...words()} boards={{ kind: 'day', key: '2026-10-17', start: 0, end: 1, won: [], best: { roulette: [rows[0]!], 'slot-machine': [rows[1]!] } }} />,
    );
    expect(html.match(/data-testid="floor-best-row"/g)).toHaveLength(2);
    // In the floor's own order: the slot machine comes before roulette.
    expect(html.indexOf('data-game="slot-machine"')).toBeLessThan(html.indexOf('data-game="roulette"'));
  });
});

describe('a player’s place on the floor', () => {
  const card = (state: PlaceState, extra: Partial<Parameters<typeof PlaceCard>[0]> = {}) =>
    renderToStaticMarkup(<PlaceCard t={getFloorStrings('en')} state={state} busy={false} problem={null} signInHref="/signin" onJoin={() => {}} onLeave={() => {}} {...extra} />);

  it('asks a guest to sign in, and offers nothing else', () => {
    const html = card({ kind: 'guest' });
    expect(html).toContain('href="/signin"');
    expect(html).not.toContain('floor-join');
  });

  it('is off until the player joins, and says that nothing is sent until then', () => {
    const html = card({ kind: 'off' });
    expect(html).toContain('nothing about your play is sent anywhere');
    expect(html).toContain('>Join the floor<');
    expect(html).toContain('real name or email');
    expect(html).not.toContain('floor-leave');
  });

  it('shows a player on the floor their name, and how to change it or leave', () => {
    const html = card({ kind: 'on', name: 'Lucky Cat', tag: '0001' });
    expect(html).toContain('You are on the floor as Lucky Cat.');
    expect(html).toContain('value="Lucky Cat"');
    expect(html).toContain('>Leave the floor<');
    expect(card({ kind: 'on', name: null, tag: '0042' })).toContain('You are on the floor as Player 0042.');
    expect(card({ kind: 'blocked' })).toContain(getFloorStrings('en').blocked);
    expect(card({ kind: 'off' }, { problem: 'Please choose a different nickname.' })).toContain('role="alert"');
  });
});

describe('the floor on the medal center’s front', () => {
  it('sits under the machines, before the plate, with the rankings’ link and the honest note, before anything is read', () => {
    const html = inLanguage('en', <MedalCenter signInHref="/signin" together={<FloorTogether member={null} settled signInHref="/signin" />} />);
    const t = getFloorStrings('en');
    expect(html).toContain('data-testid="floor-together"');
    expect(html.indexOf('center-machines')).toBeLessThan(html.indexOf('floor-together'));
    expect(html.indexOf('floor-together')).toBeLessThan(html.indexOf('center-rules-title'));
    expect(html).toContain(`href="${MEDAL_RANKINGS_PATH}"`);
    expect(html).toContain(t.honesty);
    expect(html).toContain('data-state="guest"');
    // Nothing time-based is in the server's render: the floor is read in the browser.
    expect(html).not.toContain('<time');
  });

  it('the rankings page renders in Japanese with every machine’s board to come', () => {
    const html = inLanguage('ja', <FloorRankings member={null} settled={false} owner={null} />);
    expect(html).toContain('ランキング');
    expect(html).toContain('data-state="checking"');
    expect(html).toContain(getFloorStrings('ja').honesty);
  });
});

describe('the floor’s words', () => {
  const everything = (t: FloorStrings): string[] => {
    const out: string[] = [];
    for (const value of Object.values(t)) {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'function') {
        out.push(String(value('x', '9')));
        for (const label of ['jackpot', 'bowl', 'seven3', 'bar3', 'double-up', 'royal', 'straight-flush', 'four-kind', null]) out.push(String(value(label, '9')));
      } else if (value && typeof value === 'object') out.push(...Object.values(value as Record<string, string>));
    }
    return out;
  };

  it('never read as money, in either language', () => {
    for (const text of everything(getFloorStrings('en'))) expect(text, text).not.toMatch(/\b(bank|banked|deposit|withdraw|balance|cash|money|coins?|bet)\b|\$/i);
    for (const text of everything(getFloorStrings('ja'))) expect(text, text).not.toMatch(/預け|預かり|引き出し|残高|お金|賞金|現金|換金/);
  });

  it('say every refusal of a name in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const refusals = getFloorStrings(lang).refusals;
      for (const reason of ['empty', 'short', 'long', 'characters', 'contact', 'reserved', 'abuse'] as const) expect(refusals[reason].length).toBeGreaterThan(5);
    }
  });
});
