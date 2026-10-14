/**
 * The words on the instruction plate, in Japanese and in English.
 *
 * The two are two plates, not one plate translated. The Japanese one is
 * worded the way the makers of the real station pushers word theirs: a title
 * in Japanese (遊び方), a flow of short headings that urge (〜よう！) over a
 * friendly line (〜てね, 〜よ！), the game's own nouns left in English capitals
 * (START, BALL, JACKPOT), and the symbols on a card of their own. The English
 * one is set as an export cabinet's would be.
 *
 * Neither has a rule's number typed into it. Every count a line mentions is
 * handed to it from the rules (plateData.ts), so the plate cannot say one
 * thing while the machine does another. And what the cabinet itself calls a
 * thing (Swing, chance time) is taken from the cabinet's own words.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { getStrings } from './i18n';
import type { Bonus } from './lottery';
import type { ArtWords } from './PlateArt';
import { hotterReach, payoutLines, type BowlStage, type JackpotPath, type NoteId, type PayoutLine, type PlateRules, type StepId } from './plateData';

/** One step of the plate: its heading, its one line of words, and the word the compact plate has room for. */
export interface StepWords {
  head: string;
  line: (rules: PlateRules) => string;
  short: string;
}

/** A note under the payout card's lines: the name of what it is about, and what it says. */
export interface NoteWords {
  head: string;
  line: string;
}

export interface PlateStrings {
  /** The plate's title, and the machine's kind under its name. */
  title: string;
  kind: string;
  /** The line across the top: what the game is, in one breath. */
  lead: string;
  /** The name of the run of steps. */
  flowTitle: string;
  steps: Record<StepId, StepWords>;
  art: ArtWords;

  // The payout card
  payoutTitle: string;
  payoutSub: string;
  /** How a line's symbols are read out: the digits, and that three alike make it. */
  lineSays: (digits: readonly number[]) => string;
  /** Printed under a line that any one of several symbols makes. */
  anyThree: string;
  bonusName: Record<Bonus, string>;
  bonusLine: Record<Bonus, (line: PayoutLine, rules: PlateRules) => string>;
  medals: (count: number) => string;
  range: (from: number, to: number) => string;
  fever: string;
  /** Printed on a line a gold spin pays more on, and how that is read out. */
  gold: (times: number) => string;
  goldSays: (times: number) => string;
  /** The notes under the lines. One with nothing to say for these rules is null. */
  notes: Record<NoteId, (rules: PlateRules) => NoteWords | null>;

  // The way to the jackpot
  pathTitle: string;
  pathBall: string;
  pathRoulette: string;
  pathCross: string;
  /** What it takes to get from the roulette to the bowls, of which there are `bowls`. */
  pathChain: (goal: number, bowls: number) => string;
  /** The name of a bowl, counted from the top, from 1. */
  pathBowl: (number: number) => string;
  /** What the mark on a hole that lets the ball down means. */
  pathDown: string;
  jackpot: string;
  jackpotFrom: (start: number) => string;
  jackpotGrows: (step: number) => string;
  /** The whole way, in words, for whoever cannot see it drawn. */
  pathSays: (path: JackpotPath) => string;
  oddsNote: string;

  // The controls
  handsTitle: string;
  keysTitle: string;
  /** The row of hands is named for a finger on a phone, and for the mouse where there is one. */
  touchTitle: string;
  mouseTitle: string;
  feed: string;
  feedHold: string;
  aimLeft: string;
  aimRight: string;
  touchFeed: string;
  touchAim: string;
  touchSlider: string;
  /** Both ways of working the machine, in words, for whoever cannot see the pictograms. */
  keysSay: (feed: readonly string[], aim: readonly (readonly string[])[]) => string;
  touchSay: string;

  // The furniture
  cautionTitle: string;
  cautions: string[];
  /** The small print under them: what is not a rule of play. */
  small: string;
  /** The line a printer puts at the foot of a sheet: what it is, and its number. */
  imprint: string;
  sheet: string;

  // Round the plate
  open: string;
  stickerSays: (steps: readonly string[]) => string;
  close: string;
  textTitle: string;
}

/** The games a gold spin pays more on, by what each is called in a sentence. */
const goldGames = (rules: PlateRules, name: Record<Bonus, string>): string[] =>
  payoutLines(rules)
    .filter((line) => line.gold !== null)
    .map((line) => name[line.leads]);

const uiJa = getStrings('ja');
const uiEn = getStrings('en');

/** A bowl in a Japanese sentence: how many holes, and what each kind of them does. */
const bowlJa = (bowl: BowlStage, index: number, start: number): string => {
  const parts = [
    ...(bowl.down > 0 ? [`下の段へ進む穴が${bowl.down}つ`] : []),
    ...bowl.prizes.map((medals) => `${medals}枚の穴`),
    ...(bowl.jackpot > 0 ? [`JACKPOT（${start}枚〜）の穴`] : []),
  ];
  return `${index + 1}段目は${parts.join('、')}`;
};
const bowlEn = (bowl: BowlStage, index: number, start: number): string => {
  const parts = [
    ...(bowl.down > 0 ? [`${bowl.down} down to the next bowl`] : []),
    ...bowl.prizes.map((medals) => `one worth ${medals} medals`),
    ...(bowl.jackpot > 0 ? [`the jackpot’s, from ${start} medals`] : []),
  ];
  return `Bowl ${index + 1}: ${parts.join(', ')}`;
};

const ja: PlateStrings = {
  title: '遊び方',
  kind: 'メダルプッシャー',
  lead: 'メダルを入れて、手前に押し出そう！',
  flowTitle: 'ゲームの流れ',
  steps: {
    insert: {
      head: 'メダルを入れよう！',
      line: () => 'L・R ボタンを押してね。左右のレールからメダルが入るよ！',
      short: '入れる',
    },
    aim: {
      head: 'ねらいを決めよう！',
      line: () => `スライダーかフィールドで、レールの先を動かせるよ！ 「${uiJa.swing}」なら自動でふれるよ。`,
      short: 'ねらう',
    },
    push: {
      head: 'メダルを落とそう！',
      line: () => '手前のまん中から落ちたメダルをゲット！ 横や手前の角の穴に落ちるともどらないよ。',
      short: '落とす',
    },
    start: {
      head: 'START をねらおう！',
      line: (rules) => `メダルが橋をすべって溝をわたり、START チャッカーに入ると、スロットが1回まわるよ！（保留は${rules.hold}回まで）`,
      short: 'START',
    },
    match: {
      head: '数字をそろえよう！',
      line: () => '同じ数字が3つそろうとチャンス！ 配当表を見てね。',
      short: 'そろえる',
    },
    jackpot: {
      head: 'JACKPOT に挑戦！',
      line: (rules) => `ボールを手前に落とすとルーレット。数字が${rules.chainGoal}回つづくとクルーンへ！`,
      short: 'JP',
    },
  },
  art: { get: 'ゲット!', hold: 'HOLD', jackpot: 'JACKPOT' },

  payoutTitle: '配当表',
  payoutSub: 'スロット絵柄説明',
  lineSays: (digits) => (digits.length === 1 ? `${digits[0]}が3つ` : `${digits.join('・')}のどれかが3つ`),
  anyThree: 'どれでも3つ',
  bonusName: { ball: 'BALL 獲得！', chest: '宝箱チャンス！', sugoroku: 'すごろくチャンス！' },
  bonusLine: {
    ball: () => 'ボールが1個フィールドに出るよ。手前に落とすと JACKPOT チャンス！',
    chest: (line, rules) => `${rules.chests.length}つの宝箱から1つえらんでね。${line.towersFrom === null ? '' : `${line.towersFrom}枚からはタワー！`}`,
    sugoroku: () => 'サイコロをふって、止まったマスの枚数をゲット！',
  },
  medals: (count) => `${count}枚`,
  range: (from, to) => `${from}〜${to}枚`,
  fever: 'FEVER',
  gold: (times) => `金×${times}`,
  goldSays: (times) => `金の抽選なら${times}倍`,
  notes: {
    // Which reach to hope for: whichever of the two hits more often on this machine.
    reach: (rules) => {
      const hotter = hotterReach(rules);
      return hotter && { head: 'リーチ', line: `左右の数字がそろうとリーチ！ ${{ normal: 'ノーマルリーチ', long: 'スーパーリーチ' }[hotter]}は大チャンス！` };
    },
    // Chance time, where a gold spin pays more on some line.
    chance: (rules) => {
      const games = goldGames(rules, { ball: 'ボール', chest: '宝箱', sugoroku: 'すごろく' });
      if (games.length === 0) return null;
      return { head: uiJa.chanceTitle, line: `保留がいっぱいのとき START に入ると、保留が金色に！ 金の抽選は${games.join('・')}が${rules.chance.multiplier}倍！` };
    },
  },

  pathTitle: 'JACKPOT への道',
  pathBall: 'ボールを落とす',
  pathRoulette: 'ルーレット',
  pathCross: 'で終了',
  pathChain: (goal, bowls) => `数字が${goal}回つづくと クルーン${bowls > 1 ? `${bowls}段` : ''}へ！`,
  pathBowl: (number) => `${number}段目`,
  pathDown: '下の段へ',
  jackpot: 'JACKPOT',
  jackpotFrom: (start) => `${start}枚〜`,
  jackpotGrows: (step) => `はメダル${step}枚ごとに1枚ふえるよ`,
  pathSays: (path) =>
    `JACKPOT への道：ボールを手前に落とすとルーレットが回ります。数字（${path.pockets.join('・')}枚）に止まるとその枚数がタワーになり、もう一度回ります。×に止まると終了です。数字が${path.chainGoal}回つづくと、${path.bowls.length}段のクルーンへ進みます。${path.bowls.map((bowl, index) => bowlJa(bowl, index, path.jackpotStart)).join('。')}。JACKPOT はメダル${path.jackpotStep}枚ごとに1枚ふえます。`,
  oddsNote: 'くわしい確率は「確率」タブを見てね。',

  handsTitle: '操作方法',
  keysTitle: 'キーボード',
  touchTitle: 'タッチ',
  mouseTitle: 'マウス',
  feed: 'メダルを入れる',
  feedHold: '押したままで連続',
  aimLeft: '左のねらい',
  aimRight: '右のねらい',
  touchFeed: '押すと1枚、押したままで連続',
  touchAim: 'フィールドをなぞってねらう',
  touchSlider: 'スライダーでもOK',
  keysSay: (feed, aim) =>
    `キーボード：${feed[0]}で左、${feed[1]}で右のレールにメダルが入ります（押したままで連続）。${aim[0].join('と')}で左のレール、${aim[1].join('と')}で右のレールのねらいが動きます。`,
  touchSay: 'タッチ：L・Rボタンを押すと1枚、押したままで連続して入ります。フィールドの左半分・右半分をなぞるか、スライダーで、それぞれのレールのねらいが動きます。',

  cautionTitle: 'ご注意',
  cautions: ['横や手前の角の穴に落ちたメダルはもどりません。', 'メダルは景品やお金と交換できません。', '台をたたいたり、ゆらしたりしないでください。'],
  small: '※ サインインすると、マシンをアカウントに預けておけます。',
  imprint: 'GOLDEN FEVER 遊び方パネル',
  sheet: 'GF-01-INST-J',

  open: '説明パネルを大きく見る',
  stickerSays: (steps) => `ゲームの流れ：${steps.map((step, index) => `${index + 1} ${step}`).join(' ')}`,
  close: 'とじる',
  textTitle: '文章でくわしく読む',
};

const en: PlateStrings = {
  title: 'HOW TO PLAY',
  kind: 'MEDAL PUSHER',
  lead: 'Feed medals in and push them off the front!',
  flowTitle: 'GAME FLOW',
  steps: {
    insert: {
      head: 'Insert medals!',
      line: () => 'Press L or R. Medals go in from the left and right rails.',
      short: 'INSERT',
    },
    aim: {
      head: 'Take aim!',
      line: () => `Move a rail’s tip with its slider, or on the field. Or switch on ${uiEn.swing} and just time L and R.`,
      short: 'AIM',
    },
    push: {
      head: 'Push them off!',
      line: () => 'Medals over the middle of the front edge are yours. Off the sides or over a front corner, they are gone.',
      short: 'PUSH',
    },
    start: {
      head: 'Hit START!',
      line: (rules) => `A medal that rides a tongue over the well into a START pocket spins the slot once. Up to ${rules.hold} spins are held.`,
      short: 'START',
    },
    match: {
      head: 'Match three!',
      line: () => 'Three alike start a bonus. See the payout card.',
      short: 'MATCH',
    },
    jackpot: {
      head: 'Go for the JACKPOT!',
      line: (rules) => `A ball off the front spins the roulette. ${rules.chainGoal} numbers in a row send it to the ${rules.bowls.length > 1 ? 'bowls' : 'bowl'}.`,
      short: 'JP',
    },
  },
  art: { get: 'GET!', hold: 'HOLD', jackpot: 'JACKPOT' },

  payoutTitle: 'PAYOUT',
  payoutSub: 'SLOT SYMBOLS',
  lineSays: (digits) => (digits.length === 1 ? `Three ${digits[0]}s` : `Three of any one of ${digits.join(', ')}`),
  anyThree: 'ANY ×3',
  bonusName: { ball: 'BALL GET!', chest: 'TREASURE CHANCE!', sugoroku: 'SUGOROKU CHANCE!' },
  bonusLine: {
    ball: () => 'A ball drops onto the field. Push it off the front for the JACKPOT chance.',
    chest: (line, rules) => `Pick one of ${rules.chests.length} chests.${line.towersFrom === null ? '' : ` ${line.towersFrom} and up are stacked as medal towers.`}`,
    sugoroku: () => 'Roll the die and win what your square says.',
  },
  medals: (count) => `${count}`,
  range: (from, to) => `${from}–${to}`,
  fever: 'FEVER',
  gold: (times) => `GOLD ×${times}`,
  goldSays: (times) => `A gold spin pays ${times} times over`,
  notes: {
    reach: (rules) => {
      const hotter = hotterReach(rules);
      return hotter && { head: 'REACH', line: `Two alike is a REACH! ${{ normal: 'A plain REACH', long: 'A SUPER REACH' }[hotter]} is the one to hope for.` };
    },
    chance: (rules) => {
      const games = goldGames(rules, { ball: 'the ball', chest: 'the chests', sugoroku: 'the board' });
      if (games.length === 0) return null;
      return { head: uiEn.chanceTitle, line: `A medal through START with the hold full turns a held spin gold. Gold spins pay ×${rules.chance.multiplier} on ${games.join(' and ')}.` };
    },
  },

  pathTitle: 'THE WAY TO THE JACKPOT',
  pathBall: 'Drop the ball',
  pathRoulette: 'Roulette',
  pathCross: 'ends the run',
  pathChain: (goal, bowls) => `${goal} numbers in a row: on to the ${bowls > 1 ? `${bowls} bowls` : 'bowl'}!`,
  pathBowl: (number) => `Bowl ${number}`,
  pathDown: 'down a bowl',
  jackpot: 'JACKPOT',
  jackpotFrom: (start) => `${start}+`,
  jackpotGrows: (step) => `grows by 1 for every ${step} medals played`,
  pathSays: (path) =>
    `The way to the jackpot: a ball pushed over the front spins the roulette. A number (${path.pockets.join(', ')}) is stacked as a tower of that many medals and the roulette turns again. A cross ends the run. ${path.chainGoal} numbers in a row send the ball to ${path.bowls.length > 1 ? `${path.bowls.length} bowls, one under another` : 'the bowl'}, where it drops through a hole. ${path.bowls.map((bowl, index) => bowlEn(bowl, index, path.jackpotStart)).join('. ')}. The jackpot grows by one for every ${path.jackpotStep} medals played.`,
  oddsNote: 'The exact chances are on the Odds tab.',

  handsTitle: 'CONTROLS',
  keysTitle: 'KEYS',
  touchTitle: 'TOUCH',
  mouseTitle: 'MOUSE',
  feed: 'Feed a medal',
  feedHold: 'Hold to keep feeding',
  aimLeft: 'Aim left rail',
  aimRight: 'Aim right rail',
  touchFeed: 'Press for one, hold for a stream',
  touchAim: 'Drag on the field to aim',
  touchSlider: 'Or use the sliders',
  keysSay: (feed, aim) =>
    `Keys: ${feed[0]} feeds the left rail and ${feed[1]} the right; hold one to keep feeding. ${aim[0].join(' and ')} aim the left rail, ${aim[1].join(' and ')} the right.`,
  touchSay: 'Touch: press L or R to feed one medal, and hold it to keep feeding. Drag on the left or right half of the field, or use the sliders, to aim each rail.',

  cautionTitle: 'CAUTION',
  cautions: ['Medals that fall down the side holes are not returned.', 'Medals cannot be exchanged for prizes or money.', 'Do not hit or shake the machine.'],
  small: '* Sign in to keep your machine on your account.',
  imprint: 'GOLDEN FEVER INSTRUCTION PLATE',
  sheet: 'GF-01-INST-E',

  open: 'Open the instruction plate',
  stickerSays: (steps) => `Game flow: ${steps.map((step, index) => `${index + 1} ${step}`).join(' ')}`,
  close: 'Close',
  textTitle: 'Read it in full, as text',
};

export const getPlateStrings = (language: GameLanguage): PlateStrings => (language === 'ja' ? ja : en);
