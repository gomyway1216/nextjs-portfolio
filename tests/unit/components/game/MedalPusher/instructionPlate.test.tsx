import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MedalPusher } from '@/components/game/MedalPusher';
import { InstructionPlate, InstructionPlateDialog, PlateSticker, PlateSwitch } from '@/components/game/MedalPusher/InstructionPlate';
import { INK, PUSH_MARKS, StepArt, StepGlyph, arrow, dropPose, hasArt, holeMouth, holePlaces, mouthOutline, startMouths, tongueOutline, type Mouth } from '@/components/game/MedalPusher/PlateArt';
import { AIM_CAPS, KEY_CAPS, PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { armCollar, armTip } from '@/components/game/MedalPusher/arms';
import { CATCHER, mouthOnDrawing, slopeSpot, slotCorners, tongueCorners, wellCorners } from '@/components/game/MedalPusher/catcher';
import { CHECKERS, FIELD, MEDAL_RADIUS, MEDAL_THICKNESS, PUSHER, armStart, frontPays, pusherFront } from '@/components/game/MedalPusher/engine';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import {
  BOARD,
  BOWLS,
  CHAIN_GOAL,
  CHANCE,
  CHESTS,
  CHEST_TOWERS_FROM,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  JEWEL_TIER,
  JEWEL_VALUE,
  ROULETTE,
  SPIN_TABLE,
  TIERS,
  TIER_BONUS,
  TIER_DIGITS,
  chanceTierValue,
  reachHitChance,
  tierValue,
} from '@/components/game/MedalPusher/lottery';
import { PLATE_NOTES, PLATE_RULES, PLATE_STEPS, hotterReach, jackpotPath, payoutLines, type PlateRules, type WinTier } from '@/components/game/MedalPusher/plateData';
import { getPlateStrings } from '@/components/game/MedalPusher/plateStrings';
import { holeSpot } from '@/components/game/MedalPusher/screen';
import { SIDE_HOLE, acrossAt } from '@/components/game/MedalPusher/sidehole';
import { MAX_STOCK } from '@/components/game/MedalPusher/session';
import { HEIGHT, project, rise } from '@/components/game/MedalPusher/view';
import { createI18nInstance } from '@/lib/i18n';

type Language = 'en' | 'ja';
const LANGUAGES: Language[] = ['en', 'ja'];
const WIN_TIERS: WinTier[] = ['seven', 'big', 'small'];

const render = (node: React.ReactNode, lang: Language = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const plate = (language: Language, rules?: PlateRules) => renderToStaticMarkup(<InstructionPlate language={language} rules={rules} />);

/** What a reader is given to read: the markup without its drawings and its tags. */
function wordsOf(html: string): string {
  let rest = html;
  // The drawings go first, innermost first: a reel's picture is a drawing inside a drawing.
  for (let before = ''; before !== rest; ) {
    before = rest;
    rest = rest.replace(/<svg(?:(?!<svg)[\s\S])*?<\/svg>/g, ' ');
  }
  return rest
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
/** Every value an attribute takes in a stretch of markup, in order. */
const valuesOf = (html: string, attribute: string): string[] => [...html.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'g'))].map(([, value]) => value);
/** The markup of the payout card's line for a tier. */
const lineOf = (html: string, tier: WinTier): string => html.match(new RegExp(`<li[^>]*data-plate-line="${tier}"[\\s\\S]*?</li>`))?.[0] ?? '';
/** The markup of a drawing with this mark: from the mark to the end of its own drawing, past any drawing inside it. */
const drawingOf = (html: string, mark: string): string => {
  const from = html.indexOf(mark);
  if (from < 0) return '';
  let depth = 1;
  for (const tag of html.slice(from).matchAll(/<svg\b|<\/svg>/g)) {
    depth += tag[0] === '</svg>' ? -1 : 1;
    if (depth === 0) return html.slice(from, from + tag.index);
  }
  return '';
};
const artOf = (html: string, step: string): string => drawingOf(html, `data-plate-art="${step}"`);
/** Every drawing with this mark, in order. */
const drawingsOf = (html: string, mark: string): string[] => {
  const found: string[] = [];
  for (let from = html.indexOf(mark); from >= 0; from = html.indexOf(mark, from + 1)) found.push(drawingOf(html.slice(from), mark));
  return found;
};
const ascending = (values: readonly number[]): number[] => [...new Set(values)].sort((a, b) => a - b);
const one = (value: number): string => String(Math.round(value * 10) / 10);
const count = (html: string, pattern: RegExp): number => html.match(pattern)?.length ?? 0;

/**
 * Rules no machine has, with no number in them that the real ones have: a
 * plate printed from these has to follow them in every figure.
 */
const OTHER: PlateRules = {
  tiers: TIERS,
  tierDigits: { small: [2, 6], big: [1, 3, 9], seven: [5] },
  tierBonus: { small: 'chest', big: 'ball', seven: 'sugoroku' },
  board: [12, 17, 90, 12, 25, 17],
  feverSquare: 2,
  chests: [11, 22, 33, 44, 66],
  chestTowersFrom: 33,
  roulette: ['stop', 15, 45, 'stop', 15, 75, 'stop'],
  chainGoal: 7,
  bowls: [
    ['down', 60, 'down', 'down', 80],
    [70, 'jackpot', 'down'],
    ['down', 'down'],
    ['jackpot', 95],
  ],
  jackpotStart: 777,
  jackpotStep: 55,
  reachHits: { normal: 0.5, long: 0.2 },
  hold: 13,
  chance: { multiplier: 8, tiers: ['seven'] },
};

describe('the plate’s tables', () => {
  it('are the lottery’s own', () => {
    expect(PLATE_RULES.tiers).toBe(TIERS);
    expect(PLATE_RULES.tierDigits).toBe(TIER_DIGITS);
    expect(PLATE_RULES.tierBonus).toBe(TIER_BONUS);
    expect(PLATE_RULES.board).toBe(BOARD);
    expect(PLATE_RULES.feverSquare).toBe(FEVER_SQUARE);
    expect(PLATE_RULES.chests).toBe(CHESTS);
    expect(PLATE_RULES.chestTowersFrom).toBe(CHEST_TOWERS_FROM);
    expect(PLATE_RULES.roulette).toBe(ROULETTE);
    expect(PLATE_RULES.chainGoal).toBe(CHAIN_GOAL);
    expect(PLATE_RULES.bowls).toBe(BOWLS);
    expect(PLATE_RULES.jackpotStart).toBe(JACKPOT_START);
    expect(PLATE_RULES.jackpotStep).toBe(JACKPOT_STEP);
    expect(PLATE_RULES.hold).toBe(MAX_STOCK);
    expect(PLATE_RULES.reachHits).toEqual({ normal: reachHitChance('normal'), long: reachHitChance('long') });
    // Chance time: the lottery's multiplier, on exactly the lines the lottery makes a gold spin worth more on.
    expect(PLATE_RULES.chance.multiplier).toBe(CHANCE.multiplier);
    for (const tier of WIN_TIERS) {
      // A gold spin doubles the game a line leads to, not the jewel that comes with a treasure line.
      const jewel = tier === JEWEL_TIER ? JEWEL_VALUE : 0;
      const more = (chanceTierValue(tier, JACKPOT_START) - jewel) / (tierValue(tier, JACKPOT_START) - jewel);
      expect(PLATE_RULES.chance.tiers.includes(tier)).toBe(more > 1);
      if (more > 1) expect(more).toBeCloseTo(CHANCE.multiplier, 9);
    }
  });

  it('list every line of the slot that wins, the rarest first, with what the lottery says it leads to', () => {
    const lines = payoutLines();
    expect(lines.map((line) => line.tier).sort()).toEqual(TIERS.filter((tier) => tier !== 'miss').sort());
    const chances = lines.map((line) => SPIN_TABLE[line.tier]);
    expect([...chances].sort((a, b) => a - b)).toEqual(chances);
    for (const line of lines) {
      expect(line.digits).toEqual(TIER_DIGITS[line.tier]);
      expect(line.leads).toBe(TIER_BONUS[line.tier]);
      expect(line.gold).toBe(PLATE_RULES.chance.tiers.includes(line.tier) ? CHANCE.multiplier : null);
    }
    const leadingTo = (leads: string) => lines.find((line) => line.leads === leads);
    expect(leadingTo('chest')).toMatchObject({ prizes: ascending(CHESTS), towersFrom: CHEST_TOWERS_FROM, fever: null });
    expect(leadingTo('sugoroku')).toMatchObject({
      prizes: ascending(BOARD.filter((_medals, square) => square !== FEVER_SQUARE)),
      fever: BOARD[FEVER_SQUARE],
      towersFrom: null,
    });
    expect(leadingTo('ball')).toMatchObject({ prizes: [], fever: null, towersFrom: null });
    // Between them the lines use every digit of the reels once.
    expect(lines.flatMap((line) => line.digits).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('follow the roulette and the bowls to the jackpot', () => {
    const numbers = ROULETTE.filter((pocket): pocket is number => pocket !== 'stop');
    const path = jackpotPath();
    expect(path).toMatchObject({
      pockets: ascending(numbers),
      crosses: ROULETTE.length - numbers.length,
      size: ROULETTE.length,
      chainGoal: CHAIN_GOAL,
      jackpotStart: JACKPOT_START,
      jackpotStep: JACKPOT_STEP,
    });
    // A bowl for each of the lottery's, the top one first, and every hole of each accounted for.
    expect(path.bowls).toHaveLength(BOWLS.length);
    BOWLS.forEach((holes, bowl) => {
      const stage = path.bowls[bowl];
      const paying = holes.filter((hole): hole is number => typeof hole === 'number');
      expect(stage.holes).toBe(holes.length);
      expect(stage.down).toBe(holes.filter((hole) => hole === 'down').length);
      expect(stage.jackpot).toBe(holes.filter((hole) => hole === 'jackpot').length);
      expect(stage.prizes).toEqual(ascending(paying));
      expect(stage.down + stage.jackpot + paying.length).toBe(holes.length);
    });
    expect(jackpotPath(OTHER)).toEqual({
      pockets: [15, 45, 75],
      crosses: 3,
      size: 7,
      chainGoal: 7,
      bowls: [
        { holes: 5, down: 3, prizes: [60, 80], jackpot: 0 },
        { holes: 3, down: 1, prizes: [70], jackpot: 1 },
        { holes: 2, down: 2, prizes: [], jackpot: 0 },
        { holes: 2, down: 0, prizes: [95], jackpot: 1 },
      ],
      jackpotStart: 777,
      jackpotStep: 55,
    });
  });

  it('say which reach to hope for only when one of them hits more often', () => {
    expect(hotterReach()).toBe(reachHitChance('long') > reachHitChance('normal') ? 'long' : 'normal');
    expect(hotterReach(OTHER)).toBe('normal');
    expect(hotterReach({ ...OTHER, reachHits: { normal: 0.3, long: 0.3 } })).toBeNull();
  });
});

describe('the payout card', () => {
  it.each(LANGUAGES)('shows each line with its own symbols and what the lottery says three of them lead to (%s)', (language) => {
    const html = plate(language);
    expect(valuesOf(html, 'data-plate-line')).toEqual(payoutLines().map((line) => line.tier));
    for (const tier of WIN_TIERS) {
      const line = lineOf(html, tier);
      expect(line).toContain(`data-plate-leads="${TIER_BONUS[tier]}"`);
      // Its symbols are the pictures the reels wear, for exactly the digits that make the line.
      const shown = valuesOf(line, 'data-plate-digit').map(Number);
      expect(ascending(shown)).toEqual(ascending(TIER_DIGITS[tier]));
      expect(line.match(/data-family="/g)).toHaveLength(shown.length);
      // A line one digit makes is that digit on all three reels; any other shows each digit that can make it once.
      expect(shown).toHaveLength(TIER_DIGITS[tier].length === 1 ? 3 : TIER_DIGITS[tier].length);
      expect(wordsOf(line)).toContain(getPlateStrings(language).bonusName[TIER_BONUS[tier]]);
    }
  });

  it('prints the chests, the board and the roulette from the lottery’s tables', () => {
    const html = plate('en');
    const chest = lineOf(html, 'big');
    expect(valuesOf(chest, 'data-plate-prize').map(Number)).toEqual(ascending(CHESTS));
    // A chest that is stacked as towers is marked with one, and no other.
    const stacked = [...chest.matchAll(/data-plate-prize="(\d+)" data-plate-tower="(true|false)"/g)].map(([, medals, tower]) => [Number(medals), tower === 'true']);
    expect(stacked).toEqual(ascending(CHESTS).map((medals) => [medals, medals >= CHEST_TOWERS_FROM]));
    expect(chest.match(/data-plate-glyph="tower"/g)).toHaveLength(CHESTS.filter((medals) => medals >= CHEST_TOWERS_FROM).length);
    expect(wordsOf(chest)).toContain(`Pick one of ${CHESTS.length} chests. ${CHEST_TOWERS_FROM} and up are stacked as medal towers.`);

    const board = lineOf(html, 'small');
    const squares = BOARD.filter((_medals, square) => square !== FEVER_SQUARE);
    expect(board).toContain(`data-plate-prize-from="${Math.min(...squares)}" data-plate-prize-to="${Math.max(...squares)}"`);
    expect(board).toContain(`data-plate-fever="${BOARD[FEVER_SQUARE]}"`);
    expect(wordsOf(board)).toContain(`${Math.min(...squares)}–${Math.max(...squares)}`);
    expect(wordsOf(board)).toContain(`FEVER ${BOARD[FEVER_SQUARE]}`);

    const path = html.split('data-testid="pusher-plate-path"')[1];
    const numbers = ROULETTE.filter((pocket): pocket is number => pocket !== 'stop');
    expect(valuesOf(path, 'data-plate-pocket').map(Number)).toEqual(ascending(numbers));
    expect(path).toContain(`data-plate-crosses="${ROULETTE.length - numbers.length}"`);
    expect(path).toContain(`data-plate-chain="${CHAIN_GOAL}"`);
    expect(path).toContain(`data-plate-grows="${JACKPOT_STEP}"`);
    const words = wordsOf(path);
    expect(words).toContain(`${CHAIN_GOAL} numbers in a row: on to the ${BOWLS.length} bowls!`);
    expect(words).toContain(`JACKPOT ${JACKPOT_START}+`);
    expect(words).toContain(`JACKPOT grows by 1 for every ${JACKPOT_STEP} medals played`);
    // Whoever cannot see the drawing is told the same, in a sentence.
    expect(words).toContain(getPlateStrings('en').pathSays(jackpotPath()));
    // The exact chances are not on the card: it points at where they are.
    expect(wordsOf(html)).toContain('The exact chances are on the Odds tab.');
    expect(wordsOf(html)).not.toMatch(/%|\bin \d+\b|1\/\d/);
  });

  it.each(LANGUAGES)('shows the bowls of the jackpot challenge as the lottery has them, the top one first (%s)', (language) => {
    const t = getPlateStrings(language);
    const pathOf = (html: string) => html.split('data-testid="pusher-plate-path"')[1].split('data-testid="pusher-plate-hands"')[0];
    for (const rules of [PLATE_RULES, OTHER]) {
      const html = plate(language, rules);
      const path = pathOf(html);
      const stations = path.split('data-plate-station="bowl"').slice(1);
      // A station for each bowl, numbered from the top.
      expect(stations).toHaveLength(rules.bowls.length);
      expect(valuesOf(path, 'data-plate-bowl')).toEqual(rules.bowls.map((_holes, bowl) => String(bowl + 1)));
      rules.bowls.forEach((holes, bowl) => {
        const station = stations[bowl];
        expect(wordsOf(station)).toContain(t.pathBowl(bowl + 1));
        // What it pays is printed under it: each prize, and the jackpot where it has the jackpot's hole.
        const prizes = ascending(holes.filter((hole): hole is number => typeof hole === 'number'));
        expect(valuesOf(station, 'data-plate-hole').map(Number)).toEqual(prizes);
        for (const medals of prizes) expect(wordsOf(station)).toContain(t.medals(medals));
        expect(count(station, /data-plate-jackpot="/g)).toBe(holes.includes('jackpot') ? 1 : 0);
        if (holes.includes('jackpot')) expect(wordsOf(station)).toContain(`${t.jackpot} ${t.jackpotFrom(rules.jackpotStart)}`);
        expect(station).toContain(`data-plate-down="${holes.filter((hole) => hole === 'down').length}"`);
      });
      // Its drawing has a hole for every hole: ringed in blue where it leads down, in pink where it pays, and in
      // gold where it is the jackpot's.
      const dishes = drawingsOf(path, 'data-plate-glyph="path-bowl"');
      expect(dishes).toHaveLength(rules.bowls.length);
      rules.bowls.forEach((holes, bowl) => {
        expect(count(dishes[bowl], /fill="#93d6ef" stroke-width/g)).toBe(holes.filter((hole) => hole === 'down').length);
        expect(count(dishes[bowl], /fill="#f59ac0" stroke-width/g)).toBe(holes.filter((hole) => typeof hole === 'number').length);
        expect(count(dishes[bowl], /fill="#ffe58a" stroke-width/g)).toBe(holes.filter((hole) => hole === 'jackpot').length);
      });
      // The mark for a hole that leads down is explained, where there is one.
      expect(wordsOf(path)).toContain(t.pathDown);
      // And the last step's drawing stands the same bowls one under another.
      const stacked = artOf(html, 'jackpot');
      const all = rules.bowls.flat();
      expect(count(stacked, /fill="#93d6ef" stroke-width/g)).toBe(all.filter((hole) => hole === 'down').length);
      expect(count(stacked, /fill="#f59ac0" stroke-width/g)).toBe(all.filter((hole) => typeof hole === 'number').length);
      expect(count(stacked, /fill="#ffe58a" stroke-width/g)).toBe(all.filter((hole) => hole === 'jackpot').length);
    }
    // A challenge with no hole that leads down has no mark to explain.
    expect(wordsOf(pathOf(plate(language, { ...OTHER, bowls: [['jackpot', 40]] })))).not.toContain(t.pathDown);
  });

  it('puts a bowl’s holes where the screen has them', () => {
    BOWLS.forEach((holes, bowl) => {
      const places = holePlaces(holes.length);
      expect(places).toHaveLength(holes.length);
      holes.forEach((_hole, index) => {
        const on = holeSpot(index, bowl);
        expect(places[index].x).toBeCloseTo(on.x, 9);
        expect(places[index].y).toBeCloseTo(on.y, 9);
      });
    });
  });

  it.each(LANGUAGES)('follows other rules in every figure, and keeps none of this machine’s (%s)', (language) => {
    const html = plate(language, OTHER);
    // The lines lead where these rules send them.
    expect(valuesOf(html, 'data-plate-line')).toEqual(['seven', 'big', 'small']);
    expect(valuesOf(html, 'data-plate-leads')).toEqual(['sugoroku', 'ball', 'chest']);
    expect(valuesOf(lineOf(html, 'seven'), 'data-plate-digit')).toEqual(['5', '5', '5']);
    expect(valuesOf(lineOf(html, 'big'), 'data-plate-digit')).toEqual(['1', '3', '9']);
    expect(valuesOf(lineOf(html, 'small'), 'data-plate-digit')).toEqual(['2', '6']);
    expect(valuesOf(html, 'data-plate-prize')).toEqual(['11', '22', '33', '44', '66']);
    expect(valuesOf(html, 'data-plate-tower')).toEqual(['false', 'false', 'true', 'true', 'true']);
    expect(html).toContain('data-plate-prize-from="12" data-plate-prize-to="25"');
    expect(html).toContain('data-plate-fever="90"');
    expect(valuesOf(html, 'data-plate-pocket')).toEqual(['15', '45', '75']);
    expect(valuesOf(html, 'data-plate-hole')).toEqual(['60', '80', '70', '95']);
    expect(html).toContain('data-plate-chain="7"');
    expect(valuesOf(html, 'data-plate-jackpot')).toEqual(['777', '777']);
    // Chance time pays what these rules say, on the line they say, and on no other.
    expect(lineOf(html, 'seven')).toContain('data-plate-gold="8"');
    expect(lineOf(html, 'big')).not.toContain('data-plate-gold');
    expect(lineOf(html, 'small')).not.toContain('data-plate-gold');

    // Every number a reader is given is one of these rules', or is in the nature of the machine: one spin, one ball,
    // one chest, one medal; three reels; the count of the bowls and of the holes that lead down; and the number of
    // the sheet.
    const steps = html.replace(/<span[^>]*data-plate-num="\d+"[^>]*>\d+<\/span>/g, ' ');
    const numbers = new Set(wordsOf(steps).match(/\d+/g));
    const rules = [1, 2, 3, 5, 6, 9, 11, 22, 33, 44, 66, 12, 25, 90, 15, 45, 75, 7, 60, 80, 70, 95, 777, 55, 13, 8].map(String);
    const natural = ['1', '2', '3', '4', '01'];
    expect([...numbers].filter((number) => !rules.includes(number) && !natural.includes(number))).toEqual([]);
    // And every figure of the rules that the card prints is there.
    for (const number of ['11', '22', '33', '44', '66', '12', '25', '90', '15', '45', '75', '7', '60', '80', '70', '95', '777', '55', '13', '8']) expect(numbers).toContain(number);
  });

  it('draws the roulette and the run’s lamps from the rules too', () => {
    for (const rules of [PLATE_RULES, OTHER]) {
      const html = plate('en', rules);
      const crosses = rules.roulette.filter((pocket) => pocket === 'stop').length;
      const wheel = drawingOf(html, 'data-plate-glyph="path-roulette"');
      // A pocket for each of the roulette's, and a cross in each one that ends the run.
      expect(wheel.match(/<path[^>]*d="M[^"]*A[^"]*"[^>]*fill="#[0-9a-f]{6}"/g)).toHaveLength(rules.roulette.length);
      expect(wheel.match(/fill="#e2222e"/g)).toHaveLength(crosses);
      expect(wheel.match(/stroke="#fffdf4"/g)).toHaveLength(crosses);
      // The big drawing of the last step has a lamp, numbered, for each number in a row that the run takes.
      const last = artOf(html, 'jackpot');
      expect([...last.matchAll(/<text[^>]*>(\d+)<\/text>/g)].map(([, number]) => Number(number))).toEqual(Array.from({ length: rules.chainGoal }, (_unused, index) => index + 1));
    }
  });

  it('says which reach to hope for, by what the lottery makes of them', () => {
    expect(PLATE_NOTES).toContain('reach');
    expect(wordsOf(plate('en'))).toContain(reachHitChance('long') > reachHitChance('normal') ? 'A SUPER REACH is the one to hope for.' : 'A plain REACH is the one to hope for.');
    expect(wordsOf(plate('ja'))).toContain('スーパーリーチは大チャンス！');
    expect(wordsOf(plate('en', OTHER))).toContain('A plain REACH is the one to hope for.');
    expect(plate('en', { ...OTHER, reachHits: { normal: 0.3, long: 0.3 } })).not.toContain('data-plate-note="reach"');
  });

  it.each(LANGUAGES)('says what chance time is and marks the lines a gold spin pays more on (%s)', (language) => {
    expect(PLATE_NOTES).toContain('chance');
    const t = getPlateStrings(language);
    const html = plate(language);
    const note = html.match(/<p[^>]*data-plate-note="chance"[\s\S]*?<\/p>/)?.[0] ?? '';
    // It is called what the cabinet calls it, and says how many times over, and on which games.
    expect(wordsOf(note)).toContain(getStrings(language).chanceTitle);
    expect(wordsOf(note)).toContain(language === 'ja' ? `金の抽選は宝箱・すごろくが${CHANCE.multiplier}倍！` : `Gold spins pay ×${CHANCE.multiplier} on the chests and the board.`);
    expect(wordsOf(note)).toContain('START');
    // The lines it pays more on carry its badge, with what that means said for whoever cannot see it; a ball is a ball.
    for (const line of payoutLines()) {
      const row = lineOf(html, line.tier);
      expect(count(row, /data-plate-gold="/g)).toBe(line.gold === null ? 0 : 1);
      if (line.gold !== null) {
        expect(row).toContain(`data-plate-gold="${CHANCE.multiplier}"`);
        expect(wordsOf(row)).toContain(t.gold(CHANCE.multiplier));
        expect(wordsOf(row)).toContain(t.goldSays(CHANCE.multiplier));
      }
    }
    expect(lineOf(html, 'seven')).not.toContain('data-plate-gold');
    // A machine whose gold spins pay no more has no note and no badge.
    for (const off of [
      { multiplier: 1, tiers: WIN_TIERS },
      { multiplier: 3, tiers: [] },
    ]) {
      const plain = plate(language, { ...PLATE_RULES, chance: off });
      expect(plain).not.toContain('data-plate-note="chance"');
      expect(plain).not.toContain('data-plate-gold');
    }
  });
});

describe('the steps', () => {
  it.each(LANGUAGES)('are a numbered list, each a drawing with a heading and one line of words (%s)', (language) => {
    const html = plate(language);
    const t = getPlateStrings(language);
    const list = html.match(/<ol[^>]*data-testid="pusher-plate-steps"[\s\S]*?<\/ol>/)?.[0] ?? '';
    expect(valuesOf(list, 'data-plate-step')).toEqual([...PLATE_STEPS]);
    expect(valuesOf(list, 'data-plate-art')).toEqual([...PLATE_STEPS]);
    expect(valuesOf(list, 'data-plate-num')).toEqual(PLATE_STEPS.map((_step, index) => String(index + 1)));
    const items = list.split('<li').slice(1);
    expect(items).toHaveLength(PLATE_STEPS.length);
    PLATE_STEPS.forEach((step, index) => {
      expect(hasArt(step)).toBe(true);
      // The drawing is for the eye. The words are words.
      expect(items[index]).toMatch(/<svg[^>]*aria-hidden="true"/);
      const words = wordsOf(items[index]);
      expect(words).toContain(t.steps[step].head);
      expect(words).toContain(t.steps[step].line(PLATE_RULES));
      expect(t.steps[step].short.length).toBeGreaterThan(0);
    });
  });

  it('take the size of the hold and the length of the run from the machine, and the name of Swing from the cabinet', () => {
    for (const language of LANGUAGES) {
      const t = getPlateStrings(language);
      for (const [step, number] of [
        ['start', 'hold'],
        ['jackpot', 'chainGoal'],
      ] as const) {
        expect(t.steps[step].line(PLATE_RULES)).toContain(String(PLATE_RULES[number]));
        expect(t.steps[step].line({ ...PLATE_RULES, [number]: 23 })).toContain('23');
        expect(t.steps[step].line({ ...PLATE_RULES, [number]: 23 })).not.toContain(String(PLATE_RULES[number]));
      }
      expect(t.steps.aim.line(PLATE_RULES)).toContain(getStrings(language).swing);
    }
    expect(getPlateStrings('en').steps.jackpot.line(PLATE_RULES)).toContain('to the bowls.');
    expect(getPlateStrings('en').steps.jackpot.line({ ...PLATE_RULES, bowls: [['jackpot', 40]] })).toContain('to the bowl.');
  });

  it('say at step 4 how a medal gets into a START pocket: it slides in, down the catcher’s slide', () => {
    expect(getPlateStrings('en').steps.start.line(PLATE_RULES)).toBe(`A medal that rides a tongue over the well into a START pocket spins the slot once. Up to ${MAX_STOCK} spins are held.`);
    expect(getPlateStrings('ja').steps.start.line(PLATE_RULES)).toBe(`メダルが橋をすべって溝をわたり、START チャッカーに入ると、スロットが1回まわるよ！（保留は${MAX_STOCK}回まで）`);
    // And the plate prints it, in both languages, beside the drawing of a medal doing so.
    for (const language of LANGUAGES) {
      const html = plate(language);
      expect(wordsOf(html)).toContain(getPlateStrings(language).steps.start.line(PLATE_RULES));
      expect(artOf(html, 'start')).toContain('data-plate-drop="slide"');
    }
  });

  it('draw the machine’s own parts where its camera puts them', () => {
    const html = plate('en');
    // The two rails, from the slots at the front corners to their tips over the pusher.
    for (const arm of [0, 1] as const) {
      const collar = armCollar(arm);
      const tip = armTip(arm, armStart(arm));
      const from = project(collar.x, collar.height, collar.depth);
      const to = project(tip.x, tip.height, tip.depth);
      const rail = `d="M${one(from.x)} ${one(from.y)}L${one(to.x)} ${one(to.y)}"`;
      expect(artOf(html, 'insert')).toContain(rail);
      expect(artOf(html, 'aim')).toContain(rail);
    }
    // The feed buttons are lettered as the cabinet's are.
    expect(artOf(html, 'insert')).toMatch(/>L<\/text>[\s\S]*>R<\/text>/);
    // And the three reels show the line that brings the ball.
    expect(valuesOf(artOf(html, 'match'), 'data-family')).toEqual(['seven', 'seven', 'seven']);
  });

  it('draws an arrow from its tail to its point', () => {
    const d = arrow(0, 0, 10, 0, 2);
    expect(d.startsWith('M0 -1L')).toBe(true);
    expect(d).toContain('L10 0L');
    expect(d.endsWith('L0 1Z')).toBe(true);
  });
});

describe('the START mouths', () => {
  /** The lip half way along its stroke, which is where the plate draws it. */
  const MID = PUSHER.period / 4;
  const words = getPlateStrings('en').art;
  const CATCHER_STEPS = ['insert', 'aim', 'push', 'start'];

  it('are the catcher’s: where it has them on the drawing, and as wide and as tall', () => {
    expect(pusherFront(MID)).toBeCloseTo((PUSHER.min + PUSHER.max) / 2, 9);
    const mouths = startMouths();
    expect(mouths).toHaveLength(CHECKERS.positions.length);
    mouths.forEach((mouth, chucker) => {
      expect(mouth).toMatchObject(mouthOnDrawing(chucker, MID));
      expect(mouth.rim).toBeGreaterThan(0);
    });
    // In every drawing that shows the catcher: each mouth's opening, its rim round it, its tongue, and START under each;
    // and the well under the lip that the tongues cross, drawn once, before them.
    const html = plate('en');
    const well = `M${wellCorners(MID)
      .map((corner) => project(corner.x, corner.height, corner.depth))
      .map((point) => `${one(point.x)} ${one(point.y)}`)
      .join('L')}Z`;
    for (const step of CATCHER_STEPS) {
      const art = artOf(html, step);
      expect(art.match(/>START</g)).toHaveLength(mouths.length);
      expect(art.split(`d="${well}"`).length - 1).toBeGreaterThanOrEqual(1);
      for (const mouth of mouths) {
        expect(art).toContain(`d="${mouthOutline(mouth)}"`);
        expect(art).toContain(`d="${mouthOutline(mouth, mouth.rim)}"`);
        expect(art).toContain(`d="${tongueOutline(mouth)}"`);
        expect(art.indexOf(`d="${tongueOutline(mouth)}"`)).toBeGreaterThan(art.indexOf(`d="${well}"`));
      }
    }
  });

  it('each have the catcher’s tongue: a narrow bridge from the lip over the well to the upper edge of the opening, where the cabinet’s own drawing has it', () => {
    const seen = (spot: { x: number; height: number; depth: number }) => project(spot.x, spot.height, spot.depth);
    startMouths().forEach((mouth, chucker) => {
      const tongue = mouth.pocket?.tongue ?? [];
      const own = tongueCorners(chucker, MID).map(seen);
      expect(tongue).toHaveLength(4);
      tongue.forEach(([x, y], corner) => expect([x, y]).toEqual([own[corner].x, own[corner].y]));
      expect(tongueOutline(mouth)).toMatch(/^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+){3}Z$/);
      // It ends on the upper edge of the opening, in the middle of it, a good deal narrower than the opening; and it begins higher up the drawing, at the lip.
      const [upperLeft, upperRight] = mouth.pocket?.opening ?? [];
      expect(tongue[3][1]).toBeCloseTo(upperLeft[1], 9);
      expect(tongue[3][0]).toBeGreaterThan(upperLeft[0]);
      expect(tongue[2][0]).toBeLessThan(upperRight[0]);
      expect(tongue[2][0] - tongue[3][0]).toBeLessThan((upperRight[0] - upperLeft[0]) / 3);
      expect((tongue[2][0] + tongue[3][0]) / 2).toBeCloseTo(mouth.x, 0);
      expect(tongue[0][1]).toBeLessThan(tongue[3][1] - 20);
    });
    // A mouth that is handed in as a hole or a slit has none.
    expect(tongueOutline({ x: 0, y: 0, wide: 10, tall: 5, rim: 1, round: true })).toBeNull();
  });

  it('are drawn as the pockets the catcher has: openings with square corners in its slide, with the medal sliding in along its tongue lying flat', () => {
    const seen = (spot: { x: number; height: number; depth: number }) => project(spot.x, spot.height, spot.depth);
    const mouths = startMouths();
    mouths.forEach((mouth, chucker) => {
      expect(mouth.round).toBe(false);
      const { opening, frame } = mouth.pocket ?? { opening: [], frame: [] };
      // Four corners each, the catcher's own on the cabinet's drawing: the upper edge from the left, then the lower from the right.
      const open = slotCorners(chucker, MID, false, 0, CATCHER.rim.high).map(seen);
      const outer = slotCorners(chucker, MID, false, CATCHER.rim.wide, CATCHER.rim.high).map(seen);
      expect(opening).toHaveLength(4);
      expect(frame).toHaveLength(4);
      opening.forEach(([x, y], corner) => expect([x, y]).toEqual([open[corner].x, open[corner].y]));
      frame.forEach(([x, y], corner) => expect([x, y]).toEqual([outer[corner].x, outer[corner].y]));
      // Straight edges from corner to corner, and nothing round about it.
      for (const outline of [mouthOutline(mouth), mouthOutline(mouth, mouth.rim)]) expect(outline).toMatch(/^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+){3}Z$/);
      expect(mouthOutline(mouth)).not.toBe(mouthOutline(mouth, mouth.rim));
      // Its upper and lower edges are level, the lower one wider, as the nearer edge of an opening in a board that leans toward the player is.
      expect(opening[0][1]).toBeCloseTo(opening[1][1], 9);
      expect(opening[2][1]).toBeCloseTo(opening[3][1], 9);
      expect(opening[2][0] - opening[3][0]).toBeGreaterThan(opening[1][0] - opening[0][0]);
      // It is about its middle as catcher.ts has that, as tall as it has it, and as wide there.
      expect((opening[0][1] + opening[3][1]) / 2).toBeCloseTo(mouth.y, 0);
      expect(opening[3][1] - opening[0][1]).toBeCloseTo(mouth.tall, 9);
      expect(mouth.wide).toBeGreaterThan(opening[1][0] - opening[0][0]);
      expect(mouth.wide).toBeLessThan(opening[2][0] - opening[3][0]);
      // The frame stands out round it on every side.
      expect(frame[0][0]).toBeLessThan(opening[0][0]);
      expect(frame[0][1]).toBeLessThan(opening[0][1]);
      expect(frame[2][0]).toBeGreaterThan(opening[2][0]);
      expect(frame[2][1]).toBeGreaterThan(opening[2][1]);
      expect(dropPose(mouth)).toBe('slide');
    });
    // The medal that is shown going into the middle one lies on its tongue, face up, out over the well: an oval as wide
    // as a medal is there and flatter, its nose over the upper edge of the opening and the opening still to be seen
    // under it, with an arrow from it into the pocket.
    const start = artOf(plate('en'), 'start');
    const coin = start.split('data-plate-drop="slide"')[1]?.match(/d="M([\d.-]+) ([\d.-]+)a([\d.]+) ([\d.]+) /g)?.[1]?.match(/M([\d.-]+) ([\d.-]+)a([\d.]+) ([\d.]+) /);
    if (!coin) throw new Error('no medal is drawn sliding into a pocket');
    const [left, cy, rx, ry] = coin.slice(1).map(Number);
    const middle = mouths[1];
    const [upper, , , lower] = (middle.pocket?.opening ?? []).map(([, y]) => y);
    expect(left + rx).toBeCloseTo(middle.x, 0);
    // Flatter than it is wide, and rounder than a medal lying level there would be seen: the slide leans toward the player.
    expect(ry).toBeLessThan(rx);
    expect(ry / rx).toBeGreaterThan(seen(slopeSpot(CHECKERS.positions[1], 0, MID)).tilt * 1.1);
    expect(rx * 2).toBeGreaterThan(middle.wide * 0.7);
    expect(rx * 2).toBeLessThan(middle.wide);
    expect(cy).toBeLessThan(upper);
    expect(cy + ry).toBeGreaterThan(upper);
    expect(cy + ry).toBeLessThan((upper + lower) / 2);
    // It is where a medal with its middle that far down the tongue is seen, half its thickness clear of the tongue's top; and that far down, its tail is off the lip.
    const down = CATCHER.back - MEDAL_RADIUS * 0.8;
    const clear = CATCHER.rim.high + MEDAL_THICKNESS / 2;
    expect(down).toBeGreaterThan(MEDAL_RADIUS);
    expect(cy).toBeCloseTo(seen(slopeSpot(CHECKERS.positions[1], down, MID, clear)).y, 1);
    // Its rim is the oval drawn before it, the same size, a medal's thickness nearer the tongue: as thick as the machine's medals are, and no thicker.
    const rim = start.split('data-plate-drop="slide"')[1]?.match(/d="M([\d.-]+) ([\d.-]+)a([\d.]+) ([\d.]+) /);
    if (!rim) throw new Error('the sliding medal has no rim');
    expect(rim.slice(1).map(Number)).toEqual([left, expect.any(Number), rx, ry]);
    expect(Number(rim[2])).toBeGreaterThan(cy);
    expect(Number(rim[2]) - cy).toBeCloseTo(seen(slopeSpot(CHECKERS.positions[1], down, MID, clear - MEDAL_THICKNESS)).y - seen(slopeSpot(CHECKERS.positions[1], down, MID, clear)).y, 1);
    // The arrow is the last thing drawn of it: from the medal, straight down the drawing, to a point inside the opening.
    const arrowAt = start.split('data-plate-drop="slide"')[1]?.split('</g>')[0]?.match(/d="M[\d.-]+ [\d.-]+L[\d.-]+ [\d.-]+L[\d.-]+ [\d.-]+L([\d.-]+) ([\d.-]+)L/);
    if (!arrowAt) throw new Error('no arrow is drawn from the medal into the pocket');
    const [tipX, tipY] = arrowAt.slice(1).map(Number);
    expect(tipX).toBeCloseTo(middle.x, 0);
    expect(tipY).toBeGreaterThan((upper + lower) / 2);
    expect(tipY).toBeLessThan(lower);
  });

  it('are drawn round when they are handed in as round holes, with the medal lying flat', () => {
    // The mouths a catcher with a level deck and round holes in it would have: a circle lying on a deck is seen as an oval.
    const holes: Mouth[] = startMouths().map(({ x, y, wide, rim }) => ({ x, y, wide, tall: wide * 0.5, rim, round: true }));
    for (const step of CATCHER_STEPS) {
      const art = renderToStaticMarkup(<StepArt step={step} rules={PLATE_RULES} words={words} mouths={holes} />);
      for (const hole of holes) {
        expect(mouthOutline(hole)).toMatch(/^M[\d.-]+ [\d.-]+a[\d.]+ [\d.]+ 0 1 0 /);
        expect(art).toContain(`d="${mouthOutline(hole)}"`);
        expect(art).toContain(`d="${mouthOutline(hole, hole.rim)}"`);
        expect(dropPose(hole)).toBe('flat');
      }
      // No pocket is left in it, and no tongue: holes are in a slide that begins at the lip.
      for (const pocket of startMouths()) {
        expect(art).not.toContain(`d="${mouthOutline(pocket)}"`);
        expect(art).not.toContain(`d="${tongueOutline(pocket)}"`);
      }
    }
    expect(renderToStaticMarkup(<StepArt step="start" rules={PLATE_RULES} words={words} mouths={holes} />)).toContain('data-plate-drop="flat"');
  });

  it('are drawn as slits when they are handed in as slits, with the medal going down on its edge', () => {
    // The mouths a catcher would have if they were slits that run away from the player.
    const slits: Mouth[] = startMouths().map(({ x, y, wide, rim }) => ({ x, y, rim, wide: wide / 4, tall: wide * 0.8, round: false }));
    for (const step of CATCHER_STEPS) {
      const art = renderToStaticMarkup(<StepArt step={step} rules={PLATE_RULES} words={words} mouths={slits} />);
      for (const slit of slits) {
        // A slot: straight sides as long as it is taller than wide, round ends, where it is said to be.
        const outline = mouthOutline(slit);
        expect(outline.startsWith(`M${one(slit.x)} ${one(slit.y - slit.tall / 2)}`)).toBe(true);
        expect(outline).toContain(`v${one(slit.tall - slit.wide)}`);
        expect(art).toContain(`d="${outline}"`);
        expect(art).toContain(`d="${mouthOutline(slit, slit.rim)}"`);
        expect(dropPose(slit)).toBe('edge');
      }
      // No pocket is left in it.
      for (const pocket of startMouths()) expect(art).not.toContain(`d="${mouthOutline(pocket)}"`);
    }
    /** The medal that is drawn going down the middle mouth: where its middle is, and half its width and its height. */
    const coinIn = (mouths: Mouth[]) => {
      const start = renderToStaticMarkup(<StepArt step="start" rules={PLATE_RULES} words={words} mouths={mouths} />);
      const coin = start.split('data-plate-drop="edge"')[1]?.match(/d="M([\d.-]+) [\d.-]+a([\d.]+) ([\d.]+) /);
      if (!coin) throw new Error('no medal is drawn going down a slot on its edge');
      const [left, rx, ry] = coin.slice(1).map(Number);
      return { x: left + rx, rx, ry };
    };
    // In a slot that runs away from the player it is seen side on: over the slot, and much taller than it is wide.
    const sideOn = coinIn(slits);
    expect(sideOn.x).toBeCloseTo(slits[1].x, 0);
    expect(sideOn.ry).toBeGreaterThan(sideOn.rx * 2.5);
    // In one that runs across it is seen face on: nearly a full circle.
    const faceOn = coinIn(startMouths().map(({ x, y, wide, tall, rim }) => ({ x, y, wide, rim, tall: tall / 4, round: false })));
    expect(faceOn.ry / faceOn.rx).toBeCloseTo(0.94, 1);
  });

  it('are on the compact plate as they are on the cabinet: three pockets, as they would be three holes or three slits', () => {
    const holes = renderToStaticMarkup(<StepGlyph step="start" roundMouths />);
    const slots = renderToStaticMarkup(<StepGlyph step="start" roundMouths={false} />);
    // Left to itself it draws what the catcher has, which is pockets.
    const pockets = renderToStaticMarkup(<StepGlyph step="start" />);
    expect(startMouths().every((mouth) => mouth.pocket !== undefined)).toBe(true);
    expect(pockets).not.toBe(holes);
    expect(pockets).not.toBe(slots);
    // Three round mouths, each a rim, its line and the dark of the hole; or three slits, each the same three; or
    // three pockets, each a frame, its line and the dark of an opening with square corners.
    const ovals = /d="M[\d.]+ 18a[\d.]+ [\d.]+ 0 1 0 /g;
    const slotted = /d="M[\d.]+ 1[45](\.\d)?h0a/g;
    const squared = /d="M[\d.]+ 15\.3h6\.4v4\.8h-6\.4Z"/g;
    const framed = /d="M[\d.]+ 14\.2h7\.8a0\.5 0\.5 /g;
    expect(count(holes, ovals)).toBe(CHECKERS.positions.length * 3);
    expect(count(holes, slotted)).toBe(0);
    expect(count(slots, slotted)).toBe(CHECKERS.positions.length * 3);
    expect(count(slots, ovals)).toBe(0);
    expect(count(pockets, squared)).toBe(CHECKERS.positions.length);
    expect(count(pockets, framed)).toBe(CHECKERS.positions.length * 2);
    for (const other of [holes, slots]) expect(count(other, squared) + count(other, framed)).toBe(0);
    // And over the pockets, the well with a tongue across it to each: a bar from the top of the well down to its pocket's frame. Holes and slits have neither.
    const bridged = /d="M[\d.]+ 5h1\.4a0\.4 0\.4 /g;
    expect(count(pockets, bridged)).toBe(CHECKERS.positions.length * 2);
    for (const other of [holes, slots]) expect(count(other, bridged)).toBe(0);
    expect(count(pockets, ovals) + count(pockets, slotted)).toBe(0);
    expect(slots).not.toBe(holes);
  });
});

describe('the strip for the hands', () => {
  it.each(LANGUAGES)('shows the keys and the touches as pictures, and says both in words (%s)', (language) => {
    const html = plate(language);
    const t = getPlateStrings(language);
    const hands = html.split('data-testid="pusher-plate-hands"')[1].split('</section>')[0];
    // Both rows are in the page, for the stylesheet to show the one that suits the device, and neither is read out.
    expect([...hands.matchAll(/<div[^>]*data-plate-hands="(keys|touch)"[^>]*aria-hidden="true"/g)].map(([, kind]) => kind)).toEqual(['keys', 'touch']);
    const keys = hands.split('data-plate-hands="keys"')[1].split('data-plate-hands="touch"')[0];
    expect([...keys.matchAll(/<kbd[^>]*>([A-Z])<\/kbd>/g)].map(([, cap]) => cap)).toEqual([...KEY_CAPS, ...AIM_CAPS.flat()]);
    expect(valuesOf(hands, 'data-plate-glyph')).toEqual(['hand-press', 'hand-drag', 'hand-slide']);
    // The row of hands is a finger's on a phone and the mouse's where there is one: both names are there to choose from.
    expect(valuesOf(hands, 'data-plate-pointer')).toEqual(['touch', 'mouse']);
    // What is read out names every key, and the touches.
    const said = hands.match(/<p class="[^"]*srOnly[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '';
    for (const cap of [...KEY_CAPS, ...AIM_CAPS.flat()]) expect(said).toContain(cap);
    expect(said).toContain(t.touchSay);
  });
});

describe('the words', () => {
  it('are there in both languages, for every step and every line', () => {
    const en = getPlateStrings('en');
    const ja = getPlateStrings('ja');
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    for (const t of [en, ja]) {
      expect(Object.keys(t.steps).sort()).toEqual([...PLATE_STEPS].sort());
      expect(Object.keys(t.notes).sort()).toEqual([...PLATE_NOTES].sort());
      expect(Object.keys(t.bonusName).sort()).toEqual(['ball', 'chest', 'sugoroku']);
      expect(Object.keys(t.bonusLine).sort()).toEqual(['ball', 'chest', 'sugoroku']);
      expect(t.cautions.length).toBeGreaterThan(0);
      expect(t.small.length).toBeGreaterThan(0);
    }
    expect(ja.cautions).toHaveLength(en.cautions.length);
    // What goes down a side hole is not returned, and the holes turn the front corners: the plate says so where it says what is yours.
    expect(en.steps.push.line(PLATE_RULES)).toBe('Medals over the middle of the front edge are yours. Off the sides or over a front corner, they are gone.');
    expect(ja.steps.push.line(PLATE_RULES)).toBe('手前のまん中から落ちたメダルをゲット！ 横や手前の角の穴に落ちるともどらないよ。');
    expect(en.cautions[0]).toBe('Medals that fall down the side holes are not returned.');
    expect(ja.cautions[0]).toBe('横や手前の角の穴に落ちたメダルはもどりません。');
    // The Japanese plate is titled as the makers title theirs, and its headings urge.
    expect(ja.title).toBe('遊び方');
    for (const step of PLATE_STEPS) expect(ja.steps[step].head.endsWith('！')).toBe(true);
    // The names of the two buttons are not each other's, or the header button's: a test looks them up by name.
    expect(en.open).not.toContain(getStrings('en').howToPlay);
    expect(ja.open).not.toContain(getStrings('ja').howToPlay);
  });
});

describe('where the plate lives', () => {
  it('is what the How to play button opens: a dialog in the page from the first render, closed, with the old explanation in it', () => {
    for (const language of LANGUAGES) {
      const t = getStrings(language);
      const html = render(<MedalPusher />, language);
      const button = html.match(/<button[^>]*data-testid="pusher-how-to-play"[^>]*>([\s\S]*?)<\/button>/);
      expect(button?.[0]).toContain('aria-haspopup="dialog"');
      expect(button?.[1]).toBe(t.howToPlay);

      const dialog = html.match(/<dialog[^>]*>[\s\S]*<\/dialog>/)?.[0] ?? '';
      const opening = dialog.slice(0, dialog.indexOf('>') + 1);
      expect(opening).toContain('data-testid="pusher-plate-dialog"');
      expect(opening).toContain(`aria-label="${t.howToPlay}"`);
      expect(opening).not.toMatch(/\sopen(=|\s|>)/);
      // It can be closed by a button with a name, which is the first thing in it.
      expect(dialog.indexOf('data-testid="pusher-plate-close"')).toBeLessThan(dialog.indexOf('data-testid="pusher-plate-text"'));
      expect(dialog).toMatch(new RegExp(`<button[^>]*aria-label="${getPlateStrings(language).close}"[^>]*data-testid="pusher-plate-close"`));
      // The plate is printed when it is first asked for: the page does not carry its drawings until then.
      expect(dialog).not.toContain('data-testid="pusher-plate"');
      expect(dialog).not.toContain('data-plate-art=');
      // What it replaced is there from the start: every paragraph of the explanation.
      const text = dialog.split('data-testid="pusher-plate-text"')[1];
      expect(text).toContain('<summary');
      const said = wordsOf(text);
      for (const paragraph of t.infoBody(MAX_STOCK)) expect(said).toContain(paragraph);
    }
  });

  it('holds the plate up once it is opened, in the page’s language, over the explanation', () => {
    for (const language of LANGUAGES) {
      const html = render(<InstructionPlateDialog isOpen onClose={() => undefined} title="How to play" body={['One.', 'Two.']} />, language);
      expect(html.startsWith('<dialog')).toBe(true);
      expect(html).toContain('aria-label="How to play"');
      expect(html.match(/data-testid="pusher-plate"/g)).toHaveLength(1);
      expect(html).toContain(`data-plate-lang="${language}"`);
      expect(valuesOf(html, 'data-plate-step')).toEqual([...PLATE_STEPS]);
      expect(html).toContain('data-testid="pusher-plate-payout"');
      // The plate, then the explanation in sentences.
      expect(html.indexOf('data-testid="pusher-plate"')).toBeLessThan(html.indexOf('data-testid="pusher-plate-text"'));
      expect(html.match(/<p class="[^"]*textP[^"]*">/g)).toHaveLength(2);
    }
    // Closed and never opened, it is the explanation alone.
    const closed = render(<InstructionPlateDialog isOpen={false} onClose={() => undefined} title="How to play" body={['One.', 'Two.']} />);
    expect(closed).not.toContain('data-testid="pusher-plate"');
    expect(closed.match(/<p class="[^"]*textP[^"]*">/g)).toHaveLength(2);
  });

  it('has a compact one on the cabinet, under the controls, that opens the full one', () => {
    for (const language of LANGUAGES) {
      const t = getPlateStrings(language);
      const html = render(<MedalPusher />, language);
      const machine = html.split('id="pusher-panel-machine"')[1].split('id="pusher-panel-odds"')[0];
      expect(machine.match(/data-testid="pusher-plate-strip"/g)).toHaveLength(1);
      // It is on the cabinet: after the controls, before the tally.
      const [controls, strip, tally] = ['data-testid="pusher-controls"', 'data-testid="pusher-plate-strip"', 'data-testid="pusher-played"'].map((mark) => machine.indexOf(mark));
      expect(controls).toBeGreaterThan(0);
      expect(strip).toBeGreaterThan(controls);
      expect(tally).toBeGreaterThan(strip);

      const button = machine.match(/<button[^>]*data-testid="pusher-plate-strip"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
      expect(button).toContain('type="button"');
      expect(button).toContain(`aria-label="${t.open}"`);
      expect(button).toContain('aria-haspopup="dialog"');
      // The six steps, numbered, each with its picture and a word, and said in words for whoever cannot see them.
      expect(valuesOf(button, 'data-plate-mini')).toEqual([...PLATE_STEPS]);
      expect(valuesOf(button, 'data-plate-glyph')).toEqual(PLATE_STEPS.map((step) => `step-${step}`));
      const described = button.match(/aria-describedby="([^"]+)"/)?.[1] ?? 'none';
      const said = button.match(new RegExp(`<span id="${described}"[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? '';
      PLATE_STEPS.forEach((step, index) => expect(said).toContain(`${index + 1} ${t.steps[step].head}`));
    }
  });

  it('is only a sticker where there is no full plate to open', () => {
    const alone = render(<PlayTab />);
    const sticker = alone.match(/<[a-z]+[^>]*data-testid="pusher-plate-strip"[^>]*>/)?.[0] ?? '';
    expect(sticker.startsWith('<div')).toBe(true);
    expect(sticker).toContain('role="img"');
    expect(sticker).toContain('aria-label="Game flow: 1 Insert medals! 2 Take aim! 3 Push them off! 4 Hit START! 5 Match three! 6 Go for the JACKPOT!"');
    // Given something to ask, it is a button.
    const asked = render(
      <PlateSwitch.Provider value={() => undefined}>
        <PlateSticker />
      </PlateSwitch.Provider>,
    );
    expect(asked.startsWith('<button')).toBe(true);
  });

  it('is put away while the cabinet fills the screen, where every place is spoken for', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/InstructionPlate.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
    // One rule hides the sticker inside whatever is filling the screen, and it is not hidden anywhere else.
    const hiding = rules.filter((rule) => /\.sticker\b(?![A-Za-z])/.test(rule.selector) && /display:\s*none/.test(rule.body));
    expect(hiding.map((rule) => rule.selector)).toEqual([':fullscreen:not(:root) .sticker']);
    // It is the sticker's own rule, so it holds wherever on the cabinet the sticker is mounted, and it gives the
    // sticker no place in the cabinet's grid to keep in step with: it has none there.
    expect(rules.filter((rule) => rule.selector.includes('.sticker') && /grid-area|grid-row|grid-column/.test(rule.body))).toEqual([]);
    // The sticker is inside the cabinet, which is what fills the screen: the last thing in it before its lower bulbs.
    const cabinet = render(<PlayTab />);
    const [controls, sticker, tally] = ['data-testid="pusher-controls"', 'data-testid="pusher-plate-strip"', 'data-testid="pusher-played"'].map((mark) => cabinet.indexOf(mark));
    expect(sticker).toBeGreaterThan(controls);
    expect(sticker).toBeLessThan(tally);
  });

  it('adds nothing to the page twice, closed or open', () => {
    const html = render(<MedalPusher />);
    const testIds = valuesOf(html, 'data-testid');
    expect(testIds.filter((id, index) => testIds.indexOf(id) !== index)).toEqual([]);
    const ids = valuesOf(html, ' id');
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    // With the plate held up, the dialog has more in it. Nothing in it, in either language, goes by a name that
    // anything else on the page answers to: the cabinet, the Odds, the Simulation or the Records.
    for (const language of LANGUAGES) {
      const page = render(<MedalPusher />, language);
      const closed = page.match(/<dialog[^>]*>[\s\S]*<\/dialog>/)?.[0] ?? '';
      const elsewhere = valuesOf(page.replace(closed, ''), 'data-testid');
      expect(elsewhere.length).toBeGreaterThan(40);
      const opened = valuesOf(render(<InstructionPlateDialog isOpen onClose={() => undefined} title="How to play" body={['One.']} />, language), 'data-testid');
      // Everything the plate names: the dialog, its way out, the plate and its parts, and the text under it.
      for (const id of ['pusher-plate-dialog', 'pusher-plate-close', 'pusher-plate', 'pusher-plate-steps', 'pusher-plate-payout', 'pusher-plate-path', 'pusher-plate-hands', 'pusher-plate-text']) expect(opened, id).toContain(id);
      expect(opened.filter((id, index) => opened.indexOf(id) !== index)).toEqual([]);
      expect(opened.filter((id) => elsewhere.includes(id))).toEqual([]);
      // The closed dialog is the same dialog with less in it, and the sticker is the only other thing of the plate's.
      expect(valuesOf(closed, 'data-testid').filter((id) => !opened.includes(id))).toEqual([]);
      expect(elsewhere.filter((id) => id.startsWith('pusher-plate'))).toEqual(['pusher-plate-strip']);
      expect(elsewhere.filter((id) => id === 'pusher-how-to-play')).toHaveLength(1);
    }
    // The plate's own marks are its own: none of them is one the cabinet's tests count.
    const plateOnly = plate('en');
    for (const mark of ['data-tier=', 'data-leads=', 'data-here=', 'data-lit=', 'data-pocket=', 'data-hole=', 'data-on=', 'data-arm=', 'data-badge=', 'data-bowl=', 'data-gold=', 'data-kind=', 'role="tab"', '<canvas']) {
      expect(plateOnly).not.toContain(mark);
    }
  });
});

describe('the medals on the plate', () => {
  it('are as thick as the machine’s: a medal lying on a table shows as much rim under its face as the camera sees of its thickness', () => {
    // How much of its own half-width a lying medal's rim shows, anywhere on a table: the camera looks down on all of them at much the same angle.
    const at = project(50, 0, 60);
    const share = (HEIGHT.medal * rise(at)) / (MEDAL_RADIUS * at.scale);
    expect(HEIGHT.medal).toBe(MEDAL_THICKNESS);
    // A coin, and not a counter: the rim is an eighth of the half-width or so. At twice the thickness it was over a fifth.
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.16);
    for (const step of ['push', 'start']) {
      // Every oval of the drawing that is filled with one of the medal's inks, in the order it is drawn: where its left end is, how high, and how big.
      const ovals = [...artOf(plate('en'), step).split('data-plate-drop=')[0].matchAll(/d="M([\d.-]+) ([\d.-]+)a([\d.]+) ([\d.]+) [^"]*" fill="(#[0-9a-f]+)"/g)].map(([, left, y, rx, ry, fill]) => ({ left: Number(left), y: Number(y), rx: Number(rx), ry: Number(ry), fill }));
      const rims = ovals.flatMap((oval, index) => (oval.fill === INK.goldDark && ovals[index + 1]?.fill === INK.gold ? [{ rim: oval, face: ovals[index + 1] }] : []));
      expect(rims.length).toBeGreaterThan(4);
      for (const { rim, face } of rims) {
        // The same oval, lower by the rim: each is written to a tenth of a pixel.
        expect([rim.left, rim.rx, rim.ry]).toEqual([face.left, face.rx, face.ry]);
        expect(rim.y - face.y).toBeGreaterThan(0);
        expect(Math.abs(rim.y - face.y - share * face.rx)).toBeLessThan(0.2);
      }
    }
  });
});

describe('the side holes on the instruction plate', () => {
  const D = FIELD.depth;
  const W = FIELD.width;
  /** An outline through places of the cabinet, as the plate writes one. */
  const outlineOf = (corners: [number, number, number][]): string =>
    `M${corners
      .map(([x, height, depth]) => project(x, height, depth))
      .map((point) => `${one(point.x)} ${one(point.y)}`)
      .join('L')}Z`;

  it('draws a dark mouth with a red edge under each front corner, where the cabinet has it, and the tray’s front between two cheeks', () => {
    const html = plate('en');
    const tray: [number, number] = [SIDE_HOLE.reach + SIDE_HOLE.cheek, W - SIDE_HOLE.reach - SIDE_HOLE.cheek];
    const front = outlineOf([
      [tray[0], 0, D],
      [tray[1], 0, D],
      [tray[1], -9, D],
      [tray[0], -9, D],
    ]);
    // Every drawing that shows the front of the table shows it so.
    for (const step of ['insert', 'aim', 'push', 'start']) {
      const art = artOf(html, step);
      expect(art).toContain(`d="${front}"`);
      for (const side of [-1, 1]) {
        const from = side < 0 ? 0 : W;
        const hole = acrossAt(SIDE_HOLE.reach - SIDE_HOLE.cheek, side);
        const cheek = acrossAt(SIDE_HOLE.reach + SIDE_HOLE.cheek, side);
        const [dark, edge, steel] = holeMouth(side);
        // The dark of the hole, in the key's own black, from the side of the table to the cheek.
        expect(dark).toMatchObject({ fill: INK.key });
        expect(dark.d).toBe(
          outlineOf([
            [from, 0, D],
            [hole, 0, D],
            [hole, -9, D],
            [from, -9, D],
          ]),
        );
        expect(art).toContain(`<path d="${dark.d}" fill="${INK.key}"`);
        // The red edge over it, on the table, and the cheek beside it.
        expect(edge.fill).toBe(INK.red);
        expect(art).toContain(`<path d="${edge.d}" fill="${INK.red}"`);
        expect(steel.d).toBe(
          outlineOf([
            [hole, 0, D],
            [cheek, 0, D],
            [cheek, -9, D],
            [hole, -9, D],
          ]),
        );
        expect(art).toContain(`<path d="${steel.d}" fill="${INK.steel}"`);
        // It comes after the tray's front in the drawing, and nothing is printed down the whole width of the table's front.
        expect(art.indexOf(`d="${dark.d}"`)).toBeGreaterThan(art.indexOf(`d="${front}"`));
      }
      expect(art).not.toContain(
        `d="${outlineOf([
          [0, 0, D],
          [W, 0, D],
          [W, -9, D],
          [0, -9, D],
        ])}"`,
      );
    }
  });

  it('shows, where it says what is yours, a medal going down each mouth with a cross under it, and the winnings going into the tray only', () => {
    for (const language of LANGUAGES) {
      const art = artOf(plate(language), 'push');
      // A cross for each way a medal is lost: the two open sides, and the two mouths at the front corners.
      expect(count(art, new RegExp(`stroke="${INK.red}"`, 'g'))).toBe(4);
      // The medal that goes down each mouth is well inside it, where the rule loses it.
      expect(frontPays(PUSH_MARKS.lost)).toBe(false);
      expect(frontPays(W - PUSH_MARKS.lost)).toBe(false);
      expect(PUSH_MARKS.lost - MEDAL_RADIUS).toBeGreaterThan(0);
      expect(PUSH_MARKS.lost + MEDAL_RADIUS).toBeLessThan(SIDE_HOLE.reach - SIDE_HOLE.cheek);
      for (const x of [PUSH_MARKS.lost, W - PUSH_MARKS.lost]) {
        const hole = project(x, 0, D);
        expect(art).toContain(`d="${arrow(hole.x, hole.y + 44, hole.x, hole.y + 100, 18)}" fill="${INK.red}"`);
      }
      // The green arrows are under the tray's stretch of the edge, head and all, and clear of the cheeks.
      const middle = project(50, 0, D);
      const half = (project(W - SIDE_HOLE.reach - SIDE_HOLE.cheek, 0, D).x - project(SIDE_HOLE.reach + SIDE_HOLE.cheek, 0, D).x) / 2;
      expect(PUSH_MARKS.won + 32 * 1.15).toBeLessThan(half - 10);
      for (const way of [-1, 1]) {
        expect(art).toContain(`d="${arrow(middle.x + way * PUSH_MARKS.won, middle.y + 32, middle.x + way * PUSH_MARKS.won, middle.y + 140, 32)}" fill="${INK.green}"`);
      }
      expect(count(art, new RegExp(`fill="${INK.green}"`, 'g'))).toBe(2);
    }
  });
});
