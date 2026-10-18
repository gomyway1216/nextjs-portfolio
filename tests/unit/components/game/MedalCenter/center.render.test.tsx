import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { COUNTER_PLACES, FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MedalsOut } from '@/components/game/MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH, MEDAL_PUSHER_PATH } from '@/components/game/MedalCenter/paths';
import { getCenterStrings } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';

const render = (lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{<MedalCenter signInHref="/signin" />}</I18nextProvider>);

describe('the medal center’s front, as the server sends it', () => {
  it('holds the counter’s place with nothing on it until the bank has been read, and offers no reset yet', () => {
    const html = render();
    expect(html).toMatch(/data-testid="center-counter" data-loaded="false"/);
    expect(html).toMatch(/data-testid="center-balance">—</);
    expect(html).toMatch(/<button[^>]*data-testid="center-reset"[^>]*disabled=""/);
    expect(html).not.toContain('center-reset-dialog');
    expect(html).not.toContain('center-refill');
    // The LED counter has its places, every one dark.
    expect(html.match(/data-on="true"/g)).toBeNull();
    expect(html.match(/<polygon[^>]*data-on="false"/g)?.length).toBe(COUNTER_PLACES * 7);
  });

  it('has the Medal Pusher and the casino games already on the medals open on the floor, and every casino game still to come shown as coming, with no way in yet', () => {
    const html = render();
    const play = html.match(/<a[^>]*data-testid="center-play-medal-pusher"[^>]*>/)?.[0] ?? '';
    expect(play).toContain(`href="${MEDAL_PUSHER_PATH}"`);
    // The casino games on the medals, and the janken machine: open, and each Play link goes to its own page in the catalog.
    const open = ['slot-machine', 'janken', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'craps', 'three-card-poker', 'fishing'];
    for (const id of open) {
      expect(FLOOR.find((machine) => machine.id === id)?.path).toBe(games.find((game) => game.id === id)?.path);
      const link = html.match(new RegExp(`<a[^>]*data-testid="center-play-${id}"[^>]*>`))?.[0] ?? '';
      expect(link).toContain(`href="${games.find((game) => game.id === id)?.path}"`);
    }
    const soon = FLOOR.filter(({ path }) => path === null).map(({ id }) => id);
    for (const id of open) expect(soon).not.toContain(id);
    // With nothing still to come, the coming-soon shelf is not there at all.
    if (soon.length === 0) expect(html).not.toContain('data-testid="center-soon"');
    expect(FLOOR.map(({ id }) => id)).toEqual(['medal-pusher', 'slot-machine', 'janken', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'craps', 'three-card-poker', 'fishing']);
    // Each casino game comes onto the floor in a PR of its own, which opens its own line of FLOOR: this follows FLOOR.
    for (const { id, path } of FLOOR) {
      expect(html).toContain(`data-machine="${id}"`);
      if (path === null) expect(html).not.toContain(`center-play-${id}`);
      else expect(html.match(new RegExp(`<a[^>]*data-testid="center-play-${id}"[^>]*>`))?.[0] ?? '').toContain(`href="${path}"`);
    }
    // Every machine on the floor is a game the site has.
    for (const { id } of FLOOR) expect(games.some((game) => game.id === id)).toBe(true);
  });

  it('reads in Japanese, in the words of a medal counter', () => {
    const html = render('ja');
    const t = getCenterStrings('ja');
    expect(html).toContain('持ちメダル');
    expect(html).toContain('メダルをリセット');
    expect(html).toContain(t.floorTitle);
    // Every casino game is on the floor now: nothing is shown as coming.
    expect(html).not.toContain(t.soon);
    expect(t.resetDialogBody('2,480', true)).toContain('すべての端末');
    expect(getCenterStrings('en').resetDialogBody('2,480', false)).not.toContain('every device');
  });

  it('says why no refill is offered while medals are out on a round, with a way to each machine, and in no word of money', () => {
    const out = (lang: 'en' | 'ja') =>
      renderToStaticMarkup(
        <I18nextProvider i18n={createI18nInstance(lang)}>
          <MedalsOut games={['blackjack', 'video-poker']} language={lang} testId="center-out" />
        </I18nextProvider>,
      );
    const en = out('en');
    expect(en).toMatch(/data-testid="center-out" data-out="blackjack video-poker"/);
    for (const id of ['blackjack', 'video-poker']) {
      const game = games.find((entry) => entry.id === id)!;
      // Each name goes to the machine, where the round is finished.
      expect(en).toContain(`href="${game.path}"`);
      expect(en).toContain(`>${game.title}</a>`);
      expect(FLOOR.find((machine) => machine.id === id)?.path).toBe(game.path);
    }
    const text = (html: string) => html.replace(/<[^>]+>/g, '');
    expect(text(en)).toBe('Some of your medals are still on a round at Blackjack, Video Poker. Finish it there and they come back to you; the free refill is for when none are left anywhere.');
    const ja = out('ja');
    expect(text(ja)).toBe('ブラックジャック、ビデオポーカーで、まだメダルが勝負に出ています。そこで勝負を終えるとメダルが戻ります。無料のメダルは、どこにもメダルが残っていないときにもらえます。');
    for (const words of [text(en), text(ja), getCenterStrings('en').rules.join(' '), getCenterStrings('ja').rules.join(' ')]) {
      expect(words).not.toMatch(/bankroll|\bbank\b|deposit|withdraw|cash|money|dollar|balance|credit|\$|預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|収支/i);
    }
  });

  it('is in the catalog under its own path', () => {
    const entry = games.find((game) => game.id === 'medal-center');
    expect(entry?.path).toBe(MEDAL_CENTER_PATH);
    expect(entry?.category).toBe('Arcade');
  });
});
