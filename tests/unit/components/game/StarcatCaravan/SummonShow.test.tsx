import { existsSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { shouldLaunchStar, WishReveal, WishSummary } from '@/components/game/StarcatCaravan/SummonShow';
import { CatSprite } from '@/components/game/StarcatCaravan/CatSprite';
import { CHARACTERS, characterById } from '@/components/game/StarcatCaravan/data';
import { gameReducer, initialGame, parseSave } from '@/components/game/StarcatCaravan/engine';

describe('summon presentation and portrait assets', () => {
  it('cancels a drag returned to its origin, while retaining true taps and fully drawn releases', () => {
    expect(shouldLaunchStar(5, true)).toBe(false);
    expect(shouldLaunchStar(0, true)).toBe(false);
    expect(shouldLaunchStar(30, true)).toBe(false);
    expect(shouldLaunchStar(-80, true)).toBe(false);
    expect(shouldLaunchStar(0, false)).toBe(true);
    expect(shouldLaunchStar(5, false)).toBe(true);
    expect(shouldLaunchStar(48, true)).toBe(true);
    expect(shouldLaunchStar(80, true)).toBe(true);
  });

  it.each([['ember', 3], ['maple', 4], ['luna', 5]] as const)('presents %s with its actual rarity, identity and new-companion reward', (id, rarity) => {
    const cat = characterById(id);
    const html = renderToStaticMarkup(<WishReveal pull={{ id, isNew: true, coins: 0 }} cat={cat} language="ja" />);
    expect(html).toContain(`data-rarity="${rarity}"`);
    expect(html).toContain(cat.name.ja);
    expect(html).toContain(cat.title.ja);
    expect(html).toContain('NEW COMPANION');
    expect(html).toContain(`href="${cat.portraitUrl}"`);
    expect(html).toContain('aria-live="polite"');
  });

  it('shows the actual duplicate reward and localized title rather than a new-companion badge', () => {
    const html = renderToStaticMarkup(<WishReveal pull={{ id: 'luna', isNew: false, coins: 320 }} cat={characterById('luna')} language="en" />);
    expect(html).toContain('Weaver of stars');
    expect(html).toContain('Awakening copy · +320 coins');
    expect(html).not.toContain('NEW COMPANION');
  });

  it('summarizes every pull in order, retaining duplicate companions and their rewards', () => {
    const pulls = [{ id: 'maple', isNew: true, coins: 0 }, { id: 'ember', isNew: false, coins: 80 }, { id: 'maple', isNew: false, coins: 160 }];
    const html = renderToStaticMarkup(<WishSummary pulls={pulls} characters={CHARACTERS} language="ja" />);
    expect(html.match(/data-rarity=/g)).toHaveLength(3);
    expect(html.match(/カエデ/g)).toHaveLength(2);
    expect(html).toContain('+80 コイン');
    expect(html).toContain('+160 コイン');
  });

  it('ships six unique image assets and still supports companions without a portrait', () => {
    const portraits = CHARACTERS.flatMap((cat) => cat.portraitUrl ? [cat.portraitUrl] : []);
    expect(new Set(portraits).size).toBe(6);
    for (const url of portraits) expect(existsSync(path.join(process.cwd(), 'public', url))).toBe(true);
    expect(renderToStaticMarkup(<CatSprite cat={characterById('mist')} />)).not.toContain('<image');
    expect(renderToStaticMarkup(<CatSprite cat={{ ...CHARACTERS[0], id: 'new-id', portraitUrl: 'https://example.com/new.webp' }} />)).toContain('href="https://example.com/new.webp"');
  });

  it('charges once, grants before the reveal, and keeps the saved award after the animation is closed', () => {
    const start = initialGame();
    const action = { type: 'summon' as const, count: 10 as const, rolls: Array.from({ length: 20 }, (_, i) => i % 2 === 0 ? 0 : 0.1) };
    const drawn = gameReducer(start, action);
    expect(drawn.save.gems).toBe(start.save.gems - 1000);
    expect(drawn.pulls).toHaveLength(10);
    expect(gameReducer(drawn, action)).toBe(drawn);
    const closed = gameReducer(drawn, { type: 'close-pulls' });
    expect(closed.pulls).toHaveLength(0);
    expect(closed.save).toBe(drawn.save);
    expect(parseSave(JSON.stringify(closed.save))).toEqual(drawn.save);
  });
});
