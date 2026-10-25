import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompanionCollection, ElementSynergy, PartyOverview, TravelRecord } from '@/components/game/StarcatCaravan/Companions';
import { GuideContent } from '@/components/game/StarcatCaravan/StarcatGuide';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { newSave, parseSave } from '@/components/game/StarcatCaravan/engine';

describe('acquired companions and party help', () => {
  it('renders only the four starters, without unowned names, images or placeholders', () => {
    const html = renderToStaticMarkup(<CompanionCollection save={newSave()} characters={CHARACTERS} language="ja" ready onAction={vi.fn()} />);
    expect(html.match(/data-testid="cat-/g)).toHaveLength(4);
    for (const name of ['コハク', 'ミナモ', 'ソヨ', 'ワカバ']) expect(html).toContain(name);
    for (const absent of ['ルナ', 'ソル', 'カエデ', '未発見', 'luna-v1.webp', 'sol-v1.webp', 'maple-v1.webp']) expect(html).not.toContain(absent);
    for (const role of ['前線を支える', '離れた場所から攻撃', '傷ついた仲間を回復']) expect(html).toContain(role);
  });

  it('adds a newly acquired runtime companion with its existing level and current DB role', () => {
    const added = { ...CHARACTERS[0], id: 'new-companion', name: { ja: '新しい仲間', en: 'New friend' }, role: 'healer' as const };
    const save = newSave();
    save.owned[added.id] = { level: 7, copies: 2 };
    const html = renderToStaticMarkup(<CompanionCollection save={save} characters={[...CHARACTERS, added]} language="ja" ready onAction={vi.fn()} />);
    expect(html.match(/data-testid="cat-/g)).toHaveLength(5);
    expect(html).toContain('data-testid="cat-new-companion"');
    expect(html).toContain('Lv. 7');
    expect(html).toContain('回復');
    expect(html).not.toContain('カエデ');
  });

  it('does not mistake an inherited property for an acquired companion', () => {
    const save = newSave();
    save.owned = Object.assign(Object.create({ luna: { level: 20, copies: 1 } }), save.owned);
    const html = renderToStaticMarkup(<CompanionCollection save={save} characters={CHARACTERS} language="en" ready onAction={vi.fn()} />);
    expect(html).not.toContain('Luna');
    expect(html.match(/data-testid="cat-/g)).toHaveLength(4);
  });

  it('explains the actual selected companions and manual deployment without listing the rest', () => {
    const save = newSave(); save.team = ['brook', 'moss'];
    const html = renderToStaticMarkup(<PartyOverview save={save} characters={CHARACTERS} language="ja" />);
    expect(html).toContain('ミナモ'); expect(html).toContain('ワカバ');
    expect(html).toContain('画面下の仲間を押して');
    expect(html).toContain('/games/starcat-caravan/guide#roles');
    expect(html).not.toContain('コハク'); expect(html).not.toContain('ルナ');
  });

  it('shows element combinations for the actual party without prescribing four roles', () => {
    const save = newSave(); save.owned.spark = { level: 1, copies: 1 }; save.team = ['ember', 'spark', 'brook', 'breeze'];
    const html = renderToStaticMarkup(<ElementSynergy save={save} characters={CHARACTERS} language="ja" />);
    for (const text of ['4役の必須枠はありません', '火の共鳴', '蒸気バースト', '火花拡散', '恵みの風']) expect(html).toContain(text);
    expect(html).toContain('/guide#elements');
    const solo = renderToStaticMarkup(<ElementSynergy save={{ ...save, team: ['ember'] }} characters={CHARACTERS} language="en" />);
    expect(solo).toContain('A solo companion can still deploy');
    expect(solo).not.toContain('resonance</strong>');
  });
});

describe('travel journal and the field guide', () => {
  it('shows cleared islands, completed wins/losses and wishes from a restored save', () => {
    const saved = { ...newSave(), cleared: [0, 1], wins: 5, losses: 3, pulls: 20 };
    const restored = parseSave(JSON.stringify(saved))!;
    const html = renderToStaticMarkup(<TravelRecord save={restored} language="en" />);
    expect(html).toContain('2 / 6'); expect(html).toContain('5 / 3'); expect(html).toContain('20');
    expect(html).toContain('Results are recorded when a battle finishes.');
    expect(html).toContain('/games/starcat-caravan/guide#saving');
  });

  it.each(['ja', 'en'] as const)('provides all guide anchors and distinguishes saved progress from in-battle state (%s)', (language) => {
    const html = renderToStaticMarkup(<GuideContent language={language} />);
    for (const id of ['journey', 'roles', 'elements', 'enemies', 'growth', 'abilities', 'saving']) { expect(html).toContain(`id="${id}"`); expect(html).toContain(`href="#${id}"`); }
    expect(html).toContain(language === 'ja' ? '水＋風なら回復役がいなくても' : 'Water + Wind can heal');
    expect(html).toContain(language === 'ja' ? '戦闘途中のHP・敵の位置・残り時間' : 'In-battle HP, enemy positions, remaining time');
    expect(html).toContain(language === 'ja' ? '実績バッジ・称号・達成日時' : 'Dedicated achievement badges, titles and unlock timestamps');
    expect(html).toContain(language === 'ja' ? '現在まだありません' : 'not currently implemented');
    expect(html).not.toContain('luna-v1.webp');
  });
});
