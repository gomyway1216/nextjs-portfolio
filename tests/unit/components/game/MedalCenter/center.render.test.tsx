import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { COUNTER_PLACES, FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MachineFloor } from '@/components/game/MedalCenter/MachineFloor';
import { MACHINE_PITCHES, MACHINE_ZONES, ZONES, ZONE_SIGNS, bestReturnPercent, cornersOf, isNewMachine, zoneOf, type ZoneId } from '@/components/game/MedalCenter/floorPlan';
import { MedalsOut } from '@/components/game/MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH, MEDAL_PUSHER_PATH } from '@/components/game/MedalCenter/paths';
import { getCenterStrings } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { linked } from '@/lib/medalFloor/jackpot';
import { FLOOR_GAMES } from '@/lib/medalFloor/games';

/** No word of money, in either language: what every line the medal center shows is checked against. */
const MONEY = /bankroll|\bbank\b|deposit|withdraw|cash|money|dollar|balance|credit|\$|預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|収支/i;

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

  it('lays the floor out in corners, as a real medal floor is, each under a sign that is a heading, each machine a cabinet whose lit name is its link', () => {
    const html = render();
    const t = getCenterStrings('en');
    // The corners there are machines in, in the order a player walks onto them: the new machines by the door, the pusher, the
    // video machines, the tables, the candy shop. A corner with no machine in it is not shown.
    const shown = [...html.matchAll(/data-testid="center-zone-([a-z]+)"/g)].map((match) => match[1] as ZoneId);
    expect(shown).toEqual(ZONES.filter((zone) => FLOOR.some(({ id }) => zoneOf(id) === zone)));
    for (const zone of ['pusher', 'video', 'table', 'kids'] as const) expect(shown).toContain(zone);
    // Every machine in the floor plan is a machine on the floor.
    for (const id of [...Object.keys(MACHINE_ZONES), ...Object.keys(MACHINE_PITCHES)]) expect(FLOOR.some((machine) => machine.id === id), id).toBe(true);
    for (const zone of shown) {
      expect(html).toContain(`<h3 id="center-zone-${zone}-title"`);
      expect(html).toContain(`aria-labelledby="center-zone-${zone}-title"`);
      expect(html).toContain(`>${ZONE_SIGNS[zone].en.replace(/&/g, '&amp;')}</span>`);
      // The sign's other language is there for the look, not read twice.
      expect(html).toContain(`lang="ja" aria-hidden="true">${ZONE_SIGNS[zone].ja}</span>`);
    }
    expect(html).toContain(`>${t.machineCount(5)}</span>`);
    for (const { id, path } of FLOOR) {
      const name = games.find((game) => game.id === id)!.title.replace(/&/g, '&amp;');
      // Each machine stands in its corner; one the floor plan has no corner for yet stands with the new ones, marked NEW.
      expect(html).toMatch(new RegExp(`<li[^>]*data-open="true" data-machine="${id}" data-zone="${zoneOf(id)}"`));
      if (MACHINE_ZONES[id] === undefined) expect(html).toMatch(new RegExp(`data-machine="${id}" data-zone="new" data-wide="false" data-new="true"`));
      // Its name, lit over the cabinet, is a heading and the link in.
      const link = html.match(new RegExp(`<h4[^>]*><a[^>]*data-testid="center-play-${id}"[^>]*>${name}</a></h4>`))?.[0] ?? '';
      expect(link, id).toContain(`href="${path}"`);
    }
    // The pusher is a big cabinet; the others are not.
    expect(html).toMatch(/data-machine="medal-pusher" data-zone="pusher" data-wide="true"/);
    expect(html).toMatch(/data-machine="slot-machine" data-zone="video" data-wide="false"/);
    // No plate says the same as every other one.
    expect(html).not.toContain('Plays with your medals.');
  });

  it('gives each machine a line of its own, short enough for a phone, in both languages, and in no word of money', () => {
    // Every machine there was before the floor was laid out in corners has one; one that comes later shows its catalog description until it does.
    for (const id of ['medal-pusher', 'slot-machine', 'janken', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'craps', 'three-card-poker']) expect(MACHINE_PITCHES[id], id).toBeDefined();
    for (const [id, pitch] of Object.entries(MACHINE_PITCHES)) {
      expect(pitch.en.length, id).toBeLessThanOrEqual(48);
      expect([...pitch.ja].length, id).toBeLessThanOrEqual(24);
      for (const words of [pitch.en, pitch.ja]) expect(words, id).not.toMatch(MONEY);
    }
    const lines = Object.values(MACHINE_PITCHES).map((pitch) => pitch.en);
    expect(new Set(lines).size).toBe(lines.length);
    const html = render('ja');
    expect(html).toContain(`data-testid="center-pitch-janken">${MACHINE_PITCHES.janken!.ja}</p>`);
    for (const zone of ['pusher', 'video', 'table', 'kids'] as const) expect(html).toContain(`>${ZONE_SIGNS[zone].ja}</span>`);
    for (const words of [...Object.values(ZONE_SIGNS).flatMap((sign) => [sign.en, sign.ja])]) expect(words).not.toMatch(MONEY);
    const t = getCenterStrings('en');
    const ja = getCenterStrings('ja');
    for (const words of [t.legendJp, t.legendNew, t.legendReturn, t.jpSay, t.newSay, t.bestReturn('95.3%'), ja.legendJp, ja.legendNew, ja.legendReturn, ja.jpSay, ja.newSay, ja.bestReturn('95.3%')]) expect(words).not.toMatch(MONEY);
  });

  it('marks the machines linked to the floor jackpot, and shows each one’s best return as its rules publish it, never rounded up', () => {
    const html = render();
    for (const { id } of FLOOR) {
      const isLinked = (FLOOR_GAMES as readonly string[]).includes(id) && linked(id as (typeof FLOOR_GAMES)[number]);
      expect(html.includes(`data-testid="center-jp-${id}"`), id).toBe(isLinked);
      expect(html, id).toContain(`data-testid="center-best-${id}">Best return `);
    }
    expect(html).toContain('data-testid="center-jp-medal-pusher"');
    expect(html).not.toContain('data-testid="center-jp-video-poker"');
    // 9/6 video poker brings back 99.544%: its rule says 0.9955, and the plate says 99.5%, not 99.6%.
    expect(bestReturnPercent('video-poker')).toBe(99.5);
    expect(html).toContain('data-testid="center-best-video-poker">Best return 99.5%</span>');
    expect(html).toContain('data-testid="center-best-slot-machine">Best return 95.3%</span>');
    expect(html).toContain('data-testid="center-best-roulette">Best return 97.3%</span>');
    expect(html).toContain('data-testid="center-best-craps">Best return 100.0%</span>');
    expect(html).toContain('data-testid="center-best-janken">Best return 90.0%</span>');
    expect(render('ja')).toContain('data-testid="center-best-slot-machine">最高還元率95.3%</span>');
    // The key under the floor's lead says what the sticker means; NEW is in it only while a machine is marked NEW.
    expect(html).toContain('data-testid="center-legend"');
    expect(html).toContain(getCenterStrings('en').legendJp);
    const fresh = FLOOR.filter(({ id }) => isNewMachine(id)).length;
    expect(html.match(/data-new="true"/g)?.length ?? 0).toBe(fresh);
    expect(html.includes(`</span> ${getCenterStrings('en').legendNew}</li>`)).toBe(fresh > 0);
    expect(bestReturnPercent('not-a-machine')).toBeNull();
  });

  it('puts a machine that comes onto the floor with no corner yet among the new machines, by the door, marked NEW, with its catalog description on its plate', () => {
    const machines = [...FLOOR.filter((machine): machine is { id: string; path: string } => machine.path !== null), { id: 'kelly-criterion', path: '/games/kelly-criterion' }];
    expect(zoneOf('kelly-criterion')).toBe('new');
    expect(isNewMachine('kelly-criterion')).toBe(true);
    expect(cornersOf(machines)[0]).toMatchObject({ zone: 'new', width: 1 });
    expect(cornersOf(machines).map(({ zone }) => zone)).toEqual(['new', 'pusher', 'video', 'table', 'kids']);
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <MachineFloor machines={machines} language="en" t={getCenterStrings('en')} />
      </I18nextProvider>,
    );
    expect(html.indexOf('center-zone-new')).toBeLessThan(html.indexOf('center-zone-pusher'));
    expect(html).toContain(`>${ZONE_SIGNS.new.en}</span>`);
    expect(html).toMatch(/data-machine="kelly-criterion" data-zone="new" data-wide="false" data-new="true"/);
    expect(html).toContain('data-testid="center-new-kelly-criterion"');
    expect(html).toContain(`data-testid="center-pitch-kelly-criterion">${games.find((game) => game.id === 'kelly-criterion')!.description}</p>`);
    // Not a machine the floor's rules know: no best return, and no floor jackpot sticker.
    expect(html).not.toContain('center-best-kelly-criterion');
    expect(html).not.toContain('center-jp-kelly-criterion');
    // With a machine new on the floor, the key says what NEW means.
    expect(html).toContain(`</span> ${getCenterStrings('en').legendNew}</li>`);
  });

  it('is in the catalog under its own path', () => {
    const entry = games.find((game) => game.id === 'medal-center');
    expect(entry?.path).toBe(MEDAL_CENTER_PATH);
    expect(entry?.category).toBe('Arcade');
  });
});
