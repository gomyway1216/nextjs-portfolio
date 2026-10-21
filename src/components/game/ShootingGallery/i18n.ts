import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import { CORKS, KINDS, MOST_WIN, SHELF, STAKE, type KindId, type Outcome, type Play } from './engine';
import { SWAY_MS } from './scene';

/**
 * Every word Onsen Shooting Gallery shows, in English and Japanese.
 *
 * Medals are not money, and nothing here may read as money (no bank,
 * deposit, withdraw, balance, cash, cash out, wager, payout, coin or $; no
 * 預け, 残高, お金, 円, 換金, 賭け, 景品交換): the medals are "your medals" /
 * 「持ちメダル」, and `notMoney` says outright that the medals are not money.
 * A real gallery hands over what is knocked down, or counts it as points for a
 * prize; here each figure off the shelf pays its tag in medals, and nothing is
 * exchanged for anything.
 *
 * Japanese lines carry their own break points: a zero-width space (`​`)
 * between phrases, where Safari and Firefox, which keep Japanese words whole
 * only where the text says so, may break a line.
 */

/** A break point between Japanese phrases. */
const B = '​';

const enMedals = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;
const jaMedals = (n: number) => `${n.toLocaleString('ja-JP')}枚`;
const enFigures = (n: number) => `${n} ${n === 1 ? 'figure' : 'figures'}`;

const EN_KINDS: Readonly<Record<KindId, string>> = { box: 'sweet box', daruma: 'daruma', kokeshi: 'kokeshi', manju: 'manjū box', cat: 'beckoning cat' };
const JA_KINDS: Readonly<Record<KindId, string>> = { box: 'お菓子の箱', daruma: 'だるま', kokeshi: 'こけし', manju: 'まんじゅう箱', cat: '招き猫' };
/** The bands of the sway, over the top first: as the sight names them, and in a sentence. */
const EN_BANDS: readonly string[] = ['TOO HIGH', 'TOP EDGE', 'UPPER', 'CENTRE', 'BASE'];
const EN_BAND_WORDS: readonly string[] = ['over the top', 'the top edge', 'the upper half', 'the centre', 'the base'];
const JA_BANDS: readonly string[] = ['上へ外れ', '上の角', '上半分', 'まん中', '足もと'];
/** Where a figure stands: as set up, slid back once, on the brink (slid back twice), off the shelf. */
const EN_PLACES: readonly string[] = ['as set up', 'slid back a step', 'on the brink'];
const JA_PLACES: readonly string[] = ['そのまま', '奥へずれた', '棚のふち'];

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const catDown = (play: Play) => play.fallen.some((t) => SHELF[t] === 'cat');

/** What a play came to, in a few words for the status line (`status`) and a sentence for a screen reader (`say`). */
function enOutcome(play: Play): { status: string; say: string } {
  const n = play.fallen.length;
  if (n === 0) return { status: 'Nothing fell this time', say: `All ${CORKS} corks fired: nothing came off the shelf. Nothing this time.` };
  if (catDown(play)) return { status: `THE CAT FELL! +${play.won}`, say: `All ${CORKS} corks fired: the beckoning cat and ${n === 1 ? 'nothing else' : enFigures(n - 1)} off the shelf, ${enMedals(play.won)} won.` };
  return { status: `${n} down! +${play.won}`, say: `All ${CORKS} corks fired: ${enFigures(n)} off the shelf, ${enMedals(play.won)} won.` };
}

function jaOutcome(play: Play): { status: string; say: string } {
  const n = play.fallen.length;
  if (n === 0) return { status: `ひとつも${B}落ちなかった`, say: `コルクを${CORKS}発撃ち終わりました。棚から落ちた的はありません。今回はなしです。` };
  if (catDown(play)) return { status: `招き猫が落ちた！${B}+${play.won}枚`, say: `コルクを${CORKS}発撃ち終わりました。招き猫${n > 1 ? `ほか${n - 1}個` : ''}が棚から落ちて、${jaMedals(play.won)}の当たりです。` };
  return { status: `${n}個落とした！${B}+${play.won}枚`, say: `コルクを${CORKS}発撃ち終わりました。${n}個が棚から落ちて、${jaMedals(play.won)}の当たりです。` };
}

const en = {
  title: 'Onsen Shooting Gallery',
  /** The title in the pieces it may be broken between on a narrow screen. */
  titleParts: ['Onsen', 'Shooting Gallery'],
  subtitle: 'The cork-gun gallery of the hot-spring town game rooms: six corks, three tiers of figures on red felt, and only a figure that comes off the shelf counts. Hit the top edge to topple one.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  /** The noren over the stall. */
  noren: '射的',
  perPlay: `${STAKE} MEDALS · ${CORKS} CORKS`,
  /** The badge over a play from before this page that simply ended, shown again (`resumed` is a play this page finished). */
  lastPlay: 'Last play',
  medals: 'MEDALS',
  corks: 'CORKS',
  win: 'WIN',
  down: 'DOWN',
  start: 'START',
  startAria: `START: ${STAKE} medals for ${CORKS} corks`,
  fire: 'FIRE',
  fireAria: 'Fire: shoots the cork where the sight is now',
  skip: 'Skip',
  /** Why Skip waits: it only fast-forwards, once there is no cork left to fire. */
  skipWhy: 'after the last cork',
  kindName: (kind: KindId) => EN_KINDS[kind],
  bandLabel: (band: number) => EN_BANDS[band],
  /** A figure's tag: its medals, and what goes after the number. */
  tagUnit: '',
  figureAria: (target: number, position: number, picked: boolean) => {
    const kind = SHELF[target];
    const where = position < 0 ? 'off the shelf' : EN_PLACES[position];
    return `${cap(EN_KINDS[kind])}, ${enMedals(KINDS[kind].medals)}: ${where}${picked ? '. The sight is on it' : ''}`;
  },
  stageLabel: (where: string) => `The shooting gallery: three tiers of figures on red felt, each with its tag in medals, and the cork gun on the counter. ${where}`,
  whereIdle: 'No play under way.',
  whereAim: (cork: number, kind: KindId) => `Cork ${cork + 1} of ${CORKS} is in the gun, the sight on the ${EN_KINDS[kind]}.`,
  whereMoving: 'A cork is on its way.',
  status: {
    first: `Press START: ${STAKE} medals for ${CORKS} corks.`,
    again: `Press START for another ${CORKS} corks.`,
    loading: 'The lever back, a cork into the muzzle…',
    ready: (cork: number, kind: KindId) => `Cork ${cork + 1} of ${CORKS} at the ${EN_KINDS[kind]}: FIRE!`,
    flying: 'Pop!',
    /** What the last cork did, said before the next one's prompt. */
    moment: (outcome: Outcome, kind: KindId) =>
      outcome === 'fall' ? `Down! The ${EN_KINDS[kind]}: +${KINDS[kind].medals}.` : outcome === 'slide' ? `The ${EN_KINDS[kind]} slid back.` : outcome === 'rock' ? `The ${EN_KINDS[kind]} rocked and stood.` : 'Missed.',
    then: (what: string, next: string) => `${what} ${next}`,
  },
  /** The flash over the stall as a figure comes off the shelf. */
  flash: (kind: KindId): string => (kind === 'cat' ? 'THE CAT!' : 'DOWN!'),
  outcome: enOutcome,
  notEnough: `Not enough medals: a play takes ${STAKE}.`,
  unsaved: 'This browser’s storage is full: the play cannot be kept, so no medals were taken.',
  unfinished: 'A play from before is being finished first.',
  cardAway: 'Your medals are in a machine in another tab.',
  playHere: 'Play here',
  refill: (medals: number) => `Out of medals — take ${medals} more`,
  outOfMedals: 'Out of medals.',
  tooFew: (medals: number) => `A play takes ${STAKE} medals: play your last ${medals === 1 ? 'one' : medals} on another machine.`,
  resumed: 'Finished from before',
  /** A play this page finished as it gave up the medals (hidden, left, or another tab playing them): not the player's corks. */
  finishedAway: 'The play was finished while you were away: the corks left were fired blind.',
  sayStart: `${STAKE} medals in: ${CORKS} corks.`,
  sayResumed: 'A play left unfinished was finished: the corks not fired were fired blind.',
  sayRestart: 'The medals were reset at the medal center.',
  sayRefill: (medals: number) => `${enMedals(medals)} added.`,
  sayReady: (cork: number) => `Cork ${cork + 1}: pick a figure, and fire as the sight crosses where you want to hit it.`,
  sayMoment: (outcome: Outcome, kind: KindId) =>
    outcome === 'fall' ? `The ${EN_KINDS[kind]} is off the shelf: ${enMedals(KINDS[kind].medals)}.` : outcome === 'slide' ? `The ${EN_KINDS[kind]} slid back a step.` : outcome === 'rock' ? `The ${EN_KINDS[kind]} rocked and stayed up.` : 'The cork missed.',
  historyTitle: 'Last plays',
  historyEmpty: 'No plays yet.',
  historyEntry: (play: Play) => (play.fallen.length === 0 ? 'none' : `${catDown(play) ? 'cat! ' : ''}${play.fallen.length} down +${play.won}`),
  historyEntryLabel: (play: Play) => (play.fallen.length === 0 ? 'Nothing off the shelf' : `${enFigures(play.fallen.length)} off the shelf${catDown(play) ? ', the cat among them' : ''}, ${enMedals(play.won)}`),
  sessionTitle: 'This visit',
  plays: 'Plays',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Net',
  knocked: 'Figures down',
  cats: 'Cats down',
  cameBack: 'Came back',
  perfectBack: 'Perfect play brings back',
  keysHint: 'Keys: Space or Enter starts and fires · ← → ↑ ↓ pick a figure · S skips after the last cork',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the medal center’s, shared by every machine there.',
  centerNoteLink: 'Medal Game Center',
  infoBody: (perfect: string, typical: string, blind: string) => [
    `Press START: ${STAKE} of your medals go in, and you get ${CORKS} corks. The lever is pulled and a cork pushed into the muzzle of the cork gun on the counter.`,
    'Tap a figure on the shelves (or use the arrow keys) to aim at it. The sight sways up and down over it: over the top, the top edge, the upper half, the centre and the base. Press FIRE (or Space) when it is where you want to hit.',
    'A figure counts only if it comes off the shelf. A top-edge hit topples best, but the top edge is easiest to miss; a centre hit mostly rocks it; a base hit mostly slides it back. Small figures are hard to hit and easy to topple; the big beckoning cat is easy to hit and hardly moves: base hits slide it back, twice, to the brink of the shelf, and from there a top-edge hit topples it far more often.',
    `When all ${CORKS} corks are fired, every figure off the shelf pays the medals on its tag: a sweet box 2, a daruma 3, a kokeshi 4, the manjū box 5, the beckoning cat 25. The figures are stood up again for the next play.`,
    `Where to aim is up to you, but no hit is sure. Perfect play brings back ${perfect} of the medals played, an everyday hand about ${typical}, and blind shots ${blind}: the Odds tab works it all out.`,
    'Skip fast-forwards once the last cork has been fired. While the Odds tab or this help is open, the machine waits. Leave the page in the middle of a play and it is finished for you: the corks fired keep your aim, and the rest are fired blind.',
    NOT_MONEY.en,
  ],
  // ── The Odds tab ──
  oddsIntro: [
    'Everything is worked out exactly, as fractions, by dynamic programming over every state the shelf can be in (where each of the nine figures stands, or that it fell) and every count of corks left. What a shelf is worth is, for the best figure and band, the chance of each thing the cork can do times what the shelf it leaves is worth, plus the tag of a figure it knocks off.',
    'The aim is a skill here, and it pays: but no band is sure of a hit, a hit is not sure to topple, and the cat hardly ever falls before two good corks have slid it to the brink. So no way of playing brings back more than the medals played.',
  ],
  perfectLabel: 'Perfect play',
  perfectNote: 'the best figure and band for every cork, for the shelf as it stands',
  typicalLabel: 'Everyday hand',
  typicalNote: 'picks as well as it can; fires on the band aimed at half the time, a band higher or lower a quarter each',
  blindLabel: 'Blind shots',
  blindNote: 'any figure still up and any band, each as likely: a play left mid-way is finished this way',
  rulesTitle: 'How it works',
  rules: [
    `${STAKE} medals a play, for ${CORKS} corks, fired one at a time.`,
    `The sight sways from over a figure’s top down to its foot and back, ${(SWAY_MS / 1000).toLocaleString('en-US')} s each way, through five bands as long each: over the top, the top edge, the upper half, the centre and the base. FIRE shoots at the band the sight is on.`,
    'Each figure has its chances for each band, by where it stands (the tables below), out of 64: it falls off the shelf, slides back a step and stays up, rocks and stays where it was, or the cork misses. Over the top always misses.',
    'Only a figure off the shelf counts. The manjū box can slide back once and the cat twice; each step back stands it nearer the shelf’s back edge, where a hit topples it more easily. Nothing else slides.',
    `When the ${CORKS}th cork has been fired, every figure off the shelf pays its tag. Six corks can knock off six figures at most, and ${MOST_WIN} medals is the most a play can pay.`,
    'Where each cork goes is drawn when the medals go in; the figure and band you fire at only choose what the slot drawn for it does. Nothing is drawn as you fire.',
    'Skip only fast-forwards: it can be pressed once the last cork has been fired.',
    'While the Odds tab is open the machine waits: the sight and the cork stop, and go on from the same point when you come back.',
    'Leaving the page (or reloading it) in the middle of a play finishes it at once: the corks already fired keep your aim, and every cork still to come is fired blind, at a figure and band drawn when the medals went in.',
  ],
  fellTitle: 'How many figures come off the shelf',
  colFell: 'Figures off',
  colPerfect: 'Perfect',
  colTypical: 'Everyday',
  colBlind: 'Blind',
  fellCount: (n: number) => (n === 0 ? 'none' : `${n}`),
  grandRow: 'The beckoning cat among them',
  chancesTitle: 'Each figure’s chances',
  chancesNote: 'Out of 64, for a cork at each band: falls off the shelf, slides back a step, rocks and stays, or misses. Over the top always misses.',
  kindHeading: (kind: KindId) => `${cap(EN_KINDS[kind])}: ${enMedals(KINDS[kind].medals)}`,
  placeHeading: (position: number) => cap(EN_PLACES[position]),
  colBand: 'Band',
  colFall: 'Falls',
  colSlide: 'Slides',
  colRock: 'Rocks',
  colMiss: 'Misses',
  bandName: (band: number) => cap(EN_BAND_WORDS[band].replace(/^the /, '')),
  checkTitle: 'A check by play',
  checkNote: (plays: string) => `${plays} plays for each hand, drawn at random as the machine draws them, beside the exact figures.`,
  checkRun: 'Play them',
  checkRunning: 'Playing…',
  colHand: 'Hand',
  colExact: 'Exact',
  colSeen: 'Played',
  fractionNote: (fraction: string) => `As a fraction: ${fraction}.`,
};

export type ShootingGalleryStrings = typeof en;

const ja: ShootingGalleryStrings = {
  title: '湯の町射的',
  titleParts: ['湯の町', '射的'],
  subtitle: `温泉街の${B}遊技場の${B}射的。${B}コルクは6発、${B}赤い布の${B}3段の棚に${B}的が並び、${B}棚から落ちた${B}的だけが${B}当たり。${B}上の角を${B}ねらって${B}倒そう。`,
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  noren: '射的',
  perPlay: `1回${STAKE}枚・コルク${CORKS}発`,
  lastPlay: '前回のプレイ',
  medals: '持ちメダル',
  corks: 'コルク',
  win: '当たり',
  down: '落とした',
  start: 'スタート',
  startAria: `スタート（${STAKE}枚でコルク${CORKS}発）`,
  fire: '撃つ',
  fireAria: '撃つ：いま照準のある所へコルクを撃ちます',
  skip: 'スキップ',
  skipWhy: 'コルクを全部撃ってから',
  kindName: (kind: KindId) => JA_KINDS[kind],
  bandLabel: (band: number) => JA_BANDS[band],
  tagUnit: '枚',
  figureAria: (target: number, position: number, picked: boolean) => {
    const kind = SHELF[target];
    const where = position < 0 ? '棚から落ちた' : JA_PLACES[position];
    return `${JA_KINDS[kind]}、${jaMedals(KINDS[kind].medals)}：${where}${picked ? '。照準はここ' : ''}`;
  },
  stageLabel: (where: string) => `射的の店：赤い布の3段の棚に的が並び、それぞれにメダルの札。カウンターにコルク銃。${where}`,
  whereIdle: 'プレイしていません。',
  whereAim: (cork: number, kind: KindId) => `${CORKS}発のうち${cork + 1}発目のコルクが銃に入っています。照準は${JA_KINDS[kind]}。`,
  whereMoving: 'コルクが飛んでいます。',
  status: {
    first: `「スタート」で${B}メダル${STAKE}枚、${B}コルク${CORKS}発。`,
    again: `もう一度${B}「スタート」で${B}コルク${CORKS}発。`,
    loading: `レバーを引いて、${B}コルクを詰めて…`,
    ready: (cork: number, kind: KindId) => `${cork + 1}発目／${CORKS}：${B}${JA_KINDS[kind]}を${B}ねらって${B}撃て！`,
    flying: 'ポン！',
    moment: (outcome: Outcome, kind: KindId) =>
      outcome === 'fall' ? `落ちた！${B}${JA_KINDS[kind]}で${B}+${KINDS[kind].medals}枚。` : outcome === 'slide' ? `${JA_KINDS[kind]}が${B}奥へずれた。` : outcome === 'rock' ? `${JA_KINDS[kind]}は${B}揺れて${B}止まった。` : '外れ。',
    then: (what: string, next: string) => `${what}${B}${next}`,
  },
  flash: (kind: KindId) => (kind === 'cat' ? '招き猫！' : '落ちた！'),
  outcome: jaOutcome,
  notEnough: `メダルが${B}足りません。${B}1回${STAKE}枚です。`,
  unsaved: `このブラウザの保存領域が${B}いっぱいのため、${B}記録できません。${B}メダルは使っていません。`,
  unfinished: `前のプレイを${B}先に終わらせています。`,
  cardAway: `持ちメダルは${B}別のタブの${B}マシンで${B}使われています。`,
  playHere: 'ここで遊ぶ',
  refill: (medals: number) => `メダルがなくなりました — ${medals}枚もらう`,
  outOfMedals: 'メダルがなくなりました。',
  tooFew: (medals: number) => `1回${STAKE}枚です。${B}のこりの${medals}枚は${B}ほかのマシンで${B}遊べます。`,
  resumed: '前のプレイの続き',
  finishedAway: `離れている間に${B}プレイを終えました。${B}残りのコルクは${B}目をつぶって${B}撃ちました。`,
  sayStart: `メダルを${STAKE}枚入れました。コルクは${CORKS}発です。`,
  sayResumed: '途中だったプレイを終わらせました。まだのコルクは目をつぶって撃ちました。',
  sayRestart: 'メダルゲームセンターでメダルがリセットされました。',
  sayRefill: (medals: number) => `${jaMedals(medals)}を補充しました。`,
  sayReady: (cork: number) => `${cork + 1}発目：的を選んで、照準がねらう所に来たら撃とう。`,
  sayMoment: (outcome: Outcome, kind: KindId) =>
    outcome === 'fall' ? `${JA_KINDS[kind]}が棚から落ちました。${jaMedals(KINDS[kind].medals)}です。` : outcome === 'slide' ? `${JA_KINDS[kind]}が奥へずれました。` : outcome === 'rock' ? `${JA_KINDS[kind]}は揺れて止まりました。` : '外れました。',
  historyTitle: '最近のプレイ',
  historyEmpty: 'まだ遊んでいません。',
  historyEntry: (play: Play) => (play.fallen.length === 0 ? 'なし' : `${catDown(play) ? '招き猫！' : ''}${play.fallen.length}個 +${play.won}枚`),
  historyEntryLabel: (play: Play) => (play.fallen.length === 0 ? '落ちた的なし' : `${catDown(play) ? '招き猫をふくめ' : ''}${play.fallen.length}個が落ちて、${jaMedals(play.won)}`),
  sessionTitle: '今回のプレイ',
  plays: `プレイ${B}回数`,
  played: `使った${B}メダル`,
  won: `当たった${B}メダル`,
  net: '差し引き',
  knocked: `落とした${B}的`,
  cats: `落とした${B}招き猫`,
  cameBack: `戻った${B}割合`,
  perfectBack: `いちばん${B}上手な${B}撃ち方の${B}戻り`,
  keysHint: 'キー：Space か Enter でスタートと発射・← → ↑ ↓ で的を選ぶ・コルクを全部撃ったら S でスキップ',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルゲームセンターのもので、どのマシンでも同じメダルで遊べます。',
  centerNoteLink: 'メダルゲームセンター',
  infoBody: (perfect: string, typical: string, blind: string) => [
    `「スタート」を押すと、持ちメダルが${STAKE}枚入り、コルクが${CORKS}発もらえます。カウンターのコルク銃のレバーを引き、銃口にコルクを詰めます。`,
    '棚の的をタップする（または矢印キー）と、その的をねらいます。照準は的の上で上下にゆれます：上へ外れ・上の角・上半分・まん中・足もと。当てたい所に来たら「撃つ」（または Space）。',
    '当たりになるのは、棚から落ちた的だけ。上の角に当てるといちばん倒れやすいけれど、いちばん外れやすい所でもあります。まん中だとたいてい揺れるだけ、足もとだとたいてい奥へずれるだけ。小さな的は当てにくくて倒れやすく、大きな招き猫は当てやすいのにほとんど動きません。足もとに当てて2回奥へずらし、棚のふちまで来たら、上の角でぐっと倒れやすくなります。',
    `${CORKS}発撃ち終わると、棚から落ちた的それぞれの札のメダルがもらえます。お菓子の箱2枚、だるま3枚、こけし4枚、まんじゅう箱5枚、招き猫25枚。的は次のプレイのために並べ直します。`,
    `どこをねらうかは腕前ですが、当たるとはかぎりません。いちばん上手な撃ち方で戻りは${perfect}、ふつうの腕前でおよそ${typical}、目をつぶって撃つと${blind}。くわしくは「確率」タブで。`,
    'スキップは早送りです。コルクを全部撃ってから押せます。「確率」タブや遊び方を見ている間は、マシンが止まって待っています。プレイの途中でページを離れると、そこでプレイを終えます。撃ったコルクはそのまま、残りのコルクは目をつぶって撃ったことになります。',
    NOT_MONEY.ja,
  ],
  oddsIntro: [
    'すべて分数で正確に、棚のありうる状態（9個の的がそれぞれどこに立っているか、落ちたか）と残りのコルクの数すべてを動的計画法でたどって計算しています。ある棚の価値は、いちばんいい的と所をねらったとき、コルクがすることそれぞれの確率×そのあとの棚の価値、それに落とした的の札の合計です。',
    'ねらいは腕前で、上手なほど戻りは増えます。でも、どの所をねらっても当たるとはかぎらず、当たっても倒れるとはかぎらず、招き猫は2発のいい当たりで棚のふちまでずらさないと、まず落ちません。だから、どんな撃ち方でも使ったメダルより多くは戻りません。',
  ],
  perfectLabel: `いちばん${B}上手な${B}撃ち方`,
  perfectNote: `コルクごとに、${B}いまの棚で${B}いちばんいい的と所`,
  typicalLabel: `ふつうの${B}腕前`,
  typicalNote: `できるだけいい的と所を${B}ねらい、${B}半分は${B}ねらいどおり、${B}4回に1回ずつ${B}1つ上・下の所`,
  blindLabel: `目をつぶって${B}撃つ`,
  blindNote: `残っている的も${B}所も${B}同じ確率。${B}途中で離れた${B}プレイの残りは${B}これ`,
  rulesTitle: 'しくみ',
  rules: [
    `1回${STAKE}枚で${B}コルク${CORKS}発。${B}1発ずつ撃ちます。`,
    `照準は${B}的の上から${B}足もとまで、${B}片道${(SWAY_MS / 1000).toLocaleString('ja-JP')}秒で${B}上下にゆれ、${B}同じ長さの${B}5つの所を通ります：${B}上へ外れ・${B}上の角・${B}上半分・${B}まん中・${B}足もと。${B}「撃つ」で${B}いま照準のある所を撃ちます。`,
    `的ごとに、${B}立っている場所と${B}所ごとの確率が${B}決まっています（${B}下の表、${B}64のうちいくつか）：${B}棚から落ちる、${B}奥へずれて立ったまま、${B}揺れて止まる、${B}外れる。${B}上へ外れは${B}必ず外れます。`,
    `当たりは${B}棚から落ちた的だけ。${B}まんじゅう箱は1回、${B}招き猫は2回まで${B}奥へずれ、${B}ずれるほど${B}棚の奥のふちに近づいて${B}倒れやすくなります。${B}ほかの的は${B}ずれません。`,
    `${CORKS}発目を撃ち終わったら、${B}棚から落ちた的の${B}札のメダルが${B}もらえます。${B}6発で落とせるのは${B}6個まで、${B}1回の最高は${MOST_WIN}枚です。`,
    `コルクがどうなるかは${B}メダルを入れたときに${B}決まっていて、${B}ねらう的と所は${B}そのとき決まった${B}コルクの行き方が${B}どうなるかを${B}選ぶだけ。${B}撃つときに${B}何かを引くことは${B}ありません。`,
    `スキップは${B}早送りだけ。${B}コルクを全部撃ってから${B}押せます。`,
    `「確率」タブを見ている間は${B}マシンが待ちます。${B}照準もコルクも止まり、${B}戻ると${B}同じところから続きます。`,
    `プレイの途中で${B}ページを離れる（${B}再読み込みする）と、${B}すぐにプレイを終えます。${B}撃ったコルクは${B}そのまま、${B}まだのコルクは${B}メダルを入れたときに決めた${B}的と所へ${B}目をつぶって撃ちます。`,
  ],
  fellTitle: `棚から落ちる${B}的の数`,
  colFell: `落ちた${B}的`,
  colPerfect: `いちばん${B}上手`,
  colTypical: 'ふつう',
  colBlind: `目を${B}つぶる`,
  fellCount: (n: number) => (n === 0 ? 'なし' : `${n}個`),
  grandRow: `そのうち${B}招き猫が${B}落ちる`,
  chancesTitle: `的ごとの${B}確率`,
  chancesNote: `所ごとに、${B}64のうちいくつか：${B}棚から落ちる、${B}奥へずれる、${B}揺れて止まる、${B}外れる。${B}上へ外れは${B}必ず外れます。`,
  kindHeading: (kind: KindId) => `${JA_KINDS[kind]}：${jaMedals(KINDS[kind].medals)}`,
  placeHeading: (position: number) => JA_PLACES[position],
  colBand: '所',
  colFall: '落ちる',
  colSlide: 'ずれる',
  colRock: '揺れる',
  colMiss: '外れ',
  bandName: (band: number) => JA_BANDS[band],
  checkTitle: `じっさいに${B}遊んで${B}たしかめる`,
  checkNote: (plays: string) => `それぞれの腕前で${plays}回、マシンと同じようにランダムに遊んだ結果を、正確な値とならべます。`,
  checkRun: '遊ぶ',
  checkRunning: '遊んでいます…',
  colHand: '腕前',
  colExact: `正確な${B}値`,
  colSeen: `遊んだ${B}結果`,
  fractionNote: (fraction: string) => `分数で：${fraction}`,
};

export const getStrings = (language: GameLanguage): ShootingGalleryStrings => (language === 'ja' ? ja : en);
