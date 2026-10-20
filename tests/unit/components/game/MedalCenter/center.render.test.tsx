import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { COUNTER_PLACES, FLOOR, MedalCenter } from '@/components/game/MedalCenter/MedalCenter';
import { MachineFloor } from '@/components/game/MedalCenter/MachineFloor';
import { MACHINE_PITCHES, MACHINE_ZONES, PLATE_RETURNS, ZONES, ZONE_SIGNS, cornersOf, isNewMachine, plateReturn, spansOf, zoneOf, type ZoneId } from '@/components/game/MedalCenter/floorPlan';
import { ODDS_OPTIONS, allBetOdds, combinedDontPassEdge, combinedPassEdge, toNumber as crapsNumber } from '@/components/game/Craps/analysis';
import { RETURN_LEAST as HORSE_RETURN_LEAST, RETURN_MOST as HORSE_RETURN_MOST } from '@/components/game/HorseRace/card';
import { toNumber as horseNumber } from '@/components/game/HorseRace/fraction';
import { analyzeBoard, valueOf as sugorokuValue } from '@/components/game/Sugoroku/engine';
import { MedalsOut } from '@/components/game/MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH, MEDAL_PUSHER_PATH } from '@/components/game/MedalCenter/paths';
import { getCenterStrings } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { linked } from '@/lib/medalFloor/jackpot';
import { FLOOR_GAMES, FLOOR_RULES } from '@/lib/medalFloor/games';

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

  it('draws a guest’s counter until the bank has been read, unless a member is expected, so that it does not move as the medals come in', () => {
    const t = getCenterStrings('en');
    // Without React's markers between the pieces of text.
    const guest = render().replace(/<!-- -->/g, '');
    expect(guest).toMatch(new RegExp(`data-testid="center-member" data-owner="guest">${t.memberGuest}<`));
    expect(guest).toMatch(new RegExp(`data-testid="center-where"[^>]*>${t.where.device} <a[^>]*href="/signin"[^>]*data-testid="center-sign-in">${t.signInInvite}</a>`));
    // A member the site expects is told their medals are being looked for, and is not asked to sign in.
    const member = renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <MedalCenter signInHref="/signin" presumedMember />
      </I18nextProvider>,
    ).replace(/<!-- -->/g, '');
    expect(member).toMatch(new RegExp(`data-testid="center-member" data-owner="guest">${t.memberChecking}<`));
    expect(member).toContain(t.where.checking);
    expect(member).not.toContain('center-sign-in');
    // Short enough to stay on the counter's line beside its name at a phone's width.
    for (const language of ['en', 'ja'] as const) expect(getCenterStrings(language).memberChecking.length).toBeLessThanOrEqual(10);
  });

  it('has the Medal Pusher and the casino games already on the medals open on the floor, and every casino game still to come shown as coming, with no way in yet', () => {
    const html = render();
    const play = html.match(/<a[^>]*data-testid="center-play-medal-pusher"[^>]*>/)?.[0] ?? '';
    expect(play).toContain(`href="${MEDAL_PUSHER_PATH}"`);
    // The casino games on the medals, the janken, fishing, horse-racing, ball bingo, big wheel, high & low and Sic Bo machines: open, and each Play link goes to its own page in the catalog.
    const open = ['slot-machine', 'janken', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'craps', 'three-card-poker', 'fishing', 'horse-race', 'ball-bingo', 'big-wheel', 'high-low', 'sic-bo', 'sugoroku', 'coin-maze', 'keno', 'smart-ball', 'pachinko'];
    for (const id of open) {
      expect(FLOOR.find((machine) => machine.id === id)?.path).toBe(games.find((game) => game.id === id)?.path);
      const link = html.match(new RegExp(`<a[^>]*data-testid="center-play-${id}"[^>]*>`))?.[0] ?? '';
      expect(link).toContain(`href="${games.find((game) => game.id === id)?.path}"`);
    }
    const soon = FLOOR.filter(({ path }) => path === null).map(({ id }) => id);
    for (const id of open) expect(soon).not.toContain(id);
    // With nothing still to come, the coming-soon shelf is not there at all.
    if (soon.length === 0) expect(html).not.toContain('data-testid="center-soon"');
    expect(FLOOR.map(({ id }) => id)).toEqual(['medal-pusher', 'slot-machine', 'janken', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'craps', 'three-card-poker', 'fishing', 'horse-race', 'ball-bingo', 'big-wheel', 'high-low', 'sic-bo', 'sugoroku', 'coin-maze', 'keno', 'smart-ball', 'pachinko']);
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
    // The corners there are machines in, in the order a player walks onto them: the new machines by the door, the pusher and
    // the video machines, the big machines, the candy shop, the tables. A corner with no machine in it is not shown.
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
    // The tables at the back: roulette, blackjack, baccarat, craps, Three Card Poker and Sic Bo.
    expect(html).toContain(`>${t.machineCount(6)}</span>`);
    for (const { id, path } of FLOOR) {
      const name = games.find((game) => game.id === id)!.title.replace(/&/g, '&amp;');
      // Each machine stands in its corner; one the floor plan has no corner for yet stands with the new ones, marked NEW.
      expect(html).toMatch(new RegExp(`<li[^>]*data-open="true" data-machine="${id}" data-zone="${zoneOf(id)}"`));
      if (MACHINE_ZONES[id] === undefined) expect(html).toMatch(new RegExp(`data-machine="${id}" data-zone="new" data-wide="false" data-new="true"`));
      // Its name, lit over the cabinet, is a heading and the link in.
      const link = html.match(new RegExp(`<h4[^>]*><a[^>]*data-testid="center-play-${id}"[^>]*>${name}</a></h4>`))?.[0] ?? '';
      expect(link, id).toContain(`href="${path}"`);
    }
    // The pusher, the horse race, the ball-drop bingo and the big wheel are big cabinets; the others are not.
    expect(html).toMatch(/data-machine="medal-pusher" data-zone="pusher" data-wide="true"/);
    expect(html).toMatch(/data-machine="horse-race" data-zone="big" data-wide="true"/);
    expect(html).toMatch(/data-machine="ball-bingo" data-zone="big" data-wide="true"/);
    expect(html).toMatch(/data-machine="big-wheel" data-zone="big" data-wide="true"/);
    expect(html).toMatch(/data-machine="slot-machine" data-zone="video" data-wide="false"/);
    expect(html).toMatch(/data-machine="high-low" data-zone="video" data-wide="false"/);
    expect(html).toMatch(/data-machine="sugoroku" data-zone="big" data-wide="true"/);
    expect(html).toMatch(/data-machine="coin-maze" data-zone="kids" data-wide="false"/);
    expect(html).toMatch(/data-machine="keno" data-zone="video" data-wide="false"/);
    expect(html).toMatch(/data-machine="smart-ball" data-zone="kids" data-wide="false"/);
    expect(html).toMatch(/data-machine="pachinko" data-zone="video" data-wide="false"/);
    // On the widest floor the five video machines (the pachinko beside the pachislot among them) stand beside the
    // pusher, two columns of three rows, as a pair of corners does, and the pusher's cabinet stands as tall as their
    // rows; the big machines, the candy shop and the tables each start a row of their own.
    expect(cornersOf(FLOOR).find(({ zone }) => zone === 'video')?.machines.map(({ id }) => id)).toEqual(['slot-machine', 'video-poker', 'high-low', 'keno', 'pachinko']);
    const spans = spansOf(cornersOf(FLOOR));
    expect(cornersOf(FLOOR).map(({ zone }, i) => `${zone} ${spans[i].span}${spans[i].squeezed ? ' squeezed' : ''}${spans[i].tall ? ' tall' : ''}`)).toEqual(['pusher 2 tall', 'video 2 squeezed', 'big 4', 'kids 4', 'table 4']);
    expect(html).toContain('data-zone="video" data-width="2" data-squeezed="true" data-tall="false"');
    expect(html).toContain('data-zone="pusher" data-width="2" data-squeezed="false" data-tall="true"');
    // The tall cabinet's lower body, its tray of medals: on the pusher, and nowhere else.
    expect(html.match(/data-testid="center-tray"/g)).toHaveLength(1);
    const pusherTile = html.slice(html.indexOf('data-machine="medal-pusher"'), html.indexOf('data-machine="slot-machine"'));
    expect(pusherTile).toContain('data-testid="center-tray"');
    // A corner too wide for three rows beside the one before it starts a row of its own; a big cabinet is never squeezed.
    expect(spansOf([{ zone: 'kids', width: 2 }, { zone: 'table', width: 7 }])).toEqual([
      { span: 2, squeezed: false, tall: false },
      { span: 4, squeezed: false, tall: false },
    ]);
    expect(spansOf([{ zone: 'kids', width: 2 }, { zone: 'big', width: 4 }])).toEqual([
      { span: 2, squeezed: false, tall: false },
      { span: 4, squeezed: false, tall: false },
    ]);
    // Two corners that fit side by side on one row each: neither squeezed, neither stands taller.
    expect(spansOf([{ zone: 'pusher', width: 2 }, { zone: 'video', width: 2 }])).toEqual([
      { span: 2, squeezed: false, tall: false },
      { span: 2, squeezed: false, tall: false },
    ]);
    // Any corner beside one squeezed onto more rows than its own stands as tall, a corner of small cabinets too.
    expect(spansOf([{ zone: 'kids', width: 2 }, { zone: 'table', width: 3 }]).map(({ tall }) => tall)).toEqual([true, false]);
    expect(html).toMatch(/data-machine="sic-bo" data-zone="table" data-wide="false" data-new="true"/);
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

  it('marks the machines linked to the floor jackpot, and shows each one’s best return a player can actually get, never rounded up', () => {
    const html = render();
    for (const { id } of FLOOR) {
      const isLinked = (FLOOR_GAMES as readonly string[]).includes(id) && linked(id as (typeof FLOOR_GAMES)[number]);
      expect(html.includes(`data-testid="center-jp-${id}"`), id).toBe(isLinked);
      const ranged = PLATE_RETURNS[id]?.least !== undefined;
      expect(html, id).toContain(`data-testid="center-best-${id}">${ranged ? 'Return ' : 'Best return '}`);
    }
    expect(html).toContain('data-testid="center-jp-medal-pusher"');
    expect(html).not.toContain('data-testid="center-jp-video-poker"');
    // 9/6 video poker brings back 99.544%: its rule says 0.9955, and the plate says 99.5%, not 99.6%.
    expect(plateReturn('video-poker')).toEqual({ least: null, most: 99.5 });
    expect(html).toContain('data-testid="center-best-video-poker">Best return 99.5%</span>');
    expect(html).toContain('data-testid="center-best-slot-machine">Best return 95.3%</span>');
    expect(html).toContain('data-testid="center-best-roulette">Best return 97.3%</span>');
    expect(html).toContain('data-testid="center-best-janken">Best return 90.0%</span>');
    // Craps: not the free odds' 100%, which cannot be bet alone, but Don't Pass with the full 6× lay behind it.
    expect(html).toContain('data-testid="center-best-craps">Best return 99.7%</span>');
    expect(html).not.toContain('100.0%');
    // The horse race: every ticket on a race brings back that race's return, between 89.5% and 90%.
    expect(html).toContain('data-testid="center-best-horse-race">Return 89.5%–90.0%</span>');
    const ja = render('ja');
    expect(ja).toContain('data-testid="center-best-slot-machine">最高還元率95.3%</span>');
    expect(ja).toContain('data-testid="center-best-craps">最高還元率99.7%</span>');
    expect(ja).toContain('data-testid="center-best-horse-race">還元率89.5%〜90.0%</span>');
    // The key under the floor's lead says what the sticker means; NEW is in it only while a machine is marked NEW.
    expect(html).toContain('data-testid="center-legend"');
    expect(html).toContain(getCenterStrings('en').legendJp);
    const fresh = FLOOR.filter(({ id }) => isNewMachine(id)).length;
    expect(html.match(/data-new="true"/g)?.length ?? 0).toBe(fresh);
    expect(html.includes(`</span> ${getCenterStrings('en').legendNew}</li>`)).toBe(fresh > 0);
    expect(plateReturn('not-a-machine')).toBeNull();
  });

  it('takes a plate’s return from the machine’s own exact odds where its floor rule is only a bound', () => {
    // Craps: the rule is the free odds' 100%, a bet that cannot be made alone, so the jackpot is never told less.
    expect(FLOOR_RULES.craps.bestReturn).toBe(1);
    const alone = allBetOdds().filter((bet) => crapsNumber(bet.houseEdge) === 0).map((bet) => bet.id);
    expect(alone).toEqual(['passOdds', 'dontPassOdds']);
    // What a player can get: Don't Pass with the full 6× lay, per medal wagered on both, exactly 1,097 / 1,100 …
    const dontPass = 1 - crapsNumber(combinedDontPassEdge());
    expect(PLATE_RETURNS.craps!.most).toBeCloseTo(dontPass, 12);
    expect(PLATE_RETURNS.craps!.least).toBeUndefined();
    // … better than the Pass Line with 3-4-5× odds, and than any bet that can be made alone.
    const pass = 1 - crapsNumber(combinedPassEdge(ODDS_OPTIONS.find((option) => option.id === '3-4-5x')!.multiple));
    expect(pass).toBeLessThan(dontPass);
    for (const bet of allBetOdds().filter((odds) => !alone.includes(odds.id))) expect(1 - crapsNumber(bet.houseEdge), bet.id).toBeLessThan(dontPass);
    expect(plateReturn('craps')).toEqual({ least: null, most: 99.7 });
    // The horse race: the rule is the most a race's tickets can bring back; a race card sets them from 89.5% to it.
    expect(PLATE_RETURNS['horse-race']).toEqual({ least: horseNumber(HORSE_RETURN_LEAST), most: horseNumber(HORSE_RETURN_MOST) });
    expect(FLOOR_RULES['horse-race'].bestReturn).toBe(horseNumber(HORSE_RETURN_MOST));
    expect(plateReturn('horse-race')).toEqual({ least: 89.5, most: 90 });
    // Whale Isle Sugoroku: the rule is the best square's next roll, which nobody can stay on; the best a player can do is
    // to bet big on every square but the six before START, worked out exactly from the board's chain. A hair under it.
    const betting = sugorokuValue(analyzeBoard().betting.value);
    expect(PLATE_RETURNS.sugoroku!.most).toBeLessThanOrEqual(betting);
    expect(betting - PLATE_RETURNS.sugoroku!.most).toBeLessThan(1e-5);
    expect(FLOOR_RULES.sugoroku.bestReturn).toBeGreaterThan(betting);
    expect(plateReturn('sugoroku')).toEqual({ least: null, most: 92.3 });
    // Every other machine's rule is a play a player can make, rounded up by at most a hair (rules.test.ts checks each
    // against its exact odds): its plate shows it.
    for (const game of FLOOR_GAMES) if (!(game in PLATE_RETURNS)) expect(plateReturn(game)?.least, game).toBeNull();
  });

  it('puts a machine that comes onto the floor with no corner yet among the new machines, by the door, marked NEW, with its catalog description on its plate', () => {
    const machines = [...FLOOR.filter((machine): machine is { id: string; path: string } => machine.path !== null), { id: 'kelly-criterion', path: '/games/kelly-criterion' }];
    expect(zoneOf('kelly-criterion')).toBe('new');
    expect(isNewMachine('kelly-criterion')).toBe(true);
    expect(cornersOf(machines)[0]).toMatchObject({ zone: 'new', width: 1 });
    const before = cornersOf(machines.slice(0, -1)).map(({ zone }) => zone);
    expect(before).not.toContain('new');
    expect(cornersOf(machines).map(({ zone }) => zone)).toEqual(['new', ...before]);
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
