import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import { FIELD, HOLD_MAX, SHED, STOCK } from './engine';
import { PRIZES, type OutcomeId } from './lottery';
import { LEND } from './credit';

/**
 * Every word Cherry Blossom Carousel shows, in English and Japanese.
 *
 * Medals are not money, and nothing here may read as money (no bank, deposit, withdraw, balance, cash, cash out,
 * wager or $; no 預け, 残高, お金, 円, 換金): the medals are "your medals" / 「持ちメダル」, a handful put into the slot is
 * the machine's CREDIT / 「クレジット」, given back with RETURN / 「返却」, and `notMoney` says outright that the medals
 * are not money.
 *
 * Japanese lines carry their own break points: a zero-width space (`​`) between phrases, where Safari and Firefox,
 * which keep Japanese words whole only where the text says so, may break a line.
 */

/** A break point between Japanese phrases. */
const B = '​';

const enMedals = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'medal' : 'medals'}`;
const jaMedals = (n: number) => `${n.toLocaleString('ja-JP')}枚`;

/** The sources the machine is built from, cited on the Odds tab. */
export const SOURCES: readonly { label: { en: string; ja: string }; url: string }[] = [
  {
    label: {
      en: 'A pusher that turns: a round pusher revolving about an axis off its centre, partitions running out from it, win holes under lamps, the extra game paid into the tray (Eagle Co., US 5,622,366, 1997)',
      ja: '回るプッシャー：中心からずれた軸で回る丸いプッシャー、そこから放射状に伸びる仕切り、ランプつきの入賞穴、追加ゲームの払い出しはトレイへ（イーグル社、米国特許5,622,366、1997年）',
    },
    url: 'https://patents.google.com/patent/US5622366',
  },
  {
    label: {
      en: 'A turntable on a raised stage with its heap of medals, a three-digit seven-segment lottery, and a jackpot that spins the turntable up and throws the heap across the field (JP H09-135962A)',
      ja: '一段高いステージの回転テーブルとメダルの山、7セグ3桁の抽選、回転テーブルを高速で回して山をフィールドへ放り出すジャックポット（特開平9-135962）',
    },
    url: 'https://patents.google.com/patent/JPH09135962A/ja',
  },
  {
    label: {
      en: 'A two-tier pusher’s feeders, checkers and the medal’s way from the slot to the field (Konami, US 7,934,723)',
      ja: '2段フィールドのプッシャーの投入口・チェッカーと、メダルが投入口からフィールドへ届くまで（コナミ、米国特許7,934,723）',
    },
    url: 'https://patents.google.com/patent/US7934723',
  },
  {
    label: {
      en: 'Rotating tables in a medal field, and why turning parts beat a belt (Konami, JP H11-290545A)',
      ja: 'メダルゲームの盤面で回る回転テーブル（コナミ、特開平11-290545）',
    },
    url: 'https://patents.google.com/patent/JPH11290545A/ja',
  },
  {
    label: {
      en: 'What a real pusher returns: about 90% set by the shop, the field alone half to six in ten, the side holes’ width as the shop’s knob',
      ja: '実機の戻り：お店の設定でおおむね90%、フィールドだけでは5〜6割、横穴の幅がお店の調整',
    },
    url: 'https://mabo-medalgame.com/how-to-increase-medals/',
  },
];

/** The counter's outcomes, as the plate under the counter says them. */
const enOutcome: Record<OutcomeId, string> = { jackpot: '7 7 7', triple: 'Three alike', sevens: 'Two 7s', seven: 'A 7 in the middle', miss: 'Anything else' };
const jaOutcome: Record<OutcomeId, string> = { jackpot: '7・7・7', triple: 'ゾロ目', sevens: '7が2つ', seven: '真ん中が7', miss: 'それ以外' };

const en = {
  title: 'Cherry Blossom Carousel',
  titleParts: ['Cherry Blossom', 'Carousel'],
  subtitle:
    'The pusher corner’s second cabinet: a single-station pusher whose pusher turns. A carousel on a pole a little off its centre swings its skirt out round the field and shoves the medals towards the edge. Drop a medal as a hole on its deck comes round, and the counter rolls; 7-7-7 tips the treasure dish and throws its stock across the field.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  sign: 'SAKURA CAROUSEL',
  signSub: 'MEDAL PUSHER',
  outcomeName: enOutcome,
  medalsWord: enMedals,
  medals: 'MEDALS',
  credit: 'CREDIT',
  stock: 'JACKPOT',
  hold: 'HOLD',
  drop: 'DROP',
  dropSmall: 'hold for more',
  dropAria: 'Drop a medal from the slot; hold to keep dropping, four a second',
  giveBack: 'RETURN',
  giveBackAria: 'Return the medals in the slot to your medals',
  paytable: [
    { id: 'jackpot' as OutcomeId, shows: '777', pays: 'JACKPOT' },
    { id: 'triple' as OutcomeId, shows: '★★★', pays: String(PRIZES.triple) },
    { id: 'sevens' as OutcomeId, shows: '7·7', pays: String(PRIZES.sevens) },
    { id: 'seven' as OutcomeId, shows: '·7·', pays: String(PRIZES.seven) },
  ],
  paytableLabel: `Pays: 7-7-7 the jackpot; three alike ${PRIZES.triple}; two 7s ${PRIZES.sevens}; a 7 in the middle ${PRIZES.seven}`,
  stageLabel: (onField: number, stock: number) =>
    `The carousel under glass: its deck with three holes turning on a pole a little off its centre, the rail over it, the treasure dish on the pole with ${enMedals(stock)} in it, and the field of ${enMedals(onField)} round its skirt, side holes at both front corners.`,
  holdLamps: (holds: number) => `Spins waiting: ${holds} of ${HOLD_MAX}`,
  counterLabel: (digits: string) => `The counter shows ${digits}`,
  status: {
    empty: `DROP puts ${LEND} of your medals in the slot and drops them one by one.`,
    ready: 'Drop a medal as a hole on the deck passes the ▼ mark.',
    spinning: 'The counter rolls…',
    reach: 'REACH! The first two digits match…',
    full: 'Four spins wait: a medal into a hole now starts nothing.',
    jackpot: (n: number) => `JACKPOT! The dish throws its ${enMedals(n)} across the field.`,
    throwing: 'The dish is throwing its stock: the carousel pushes it off the field.',
  },
  outcome: (id: OutcomeId, medals: number) => (id === 'miss' ? 'No win.' : id === 'jackpot' ? 'JACKPOT!' : `${enOutcome[id]}: ${enMedals(medals)} into the tray.`),
  pocketHeld: 'Into a hole! The counter rolls.',
  pocketWasted: 'Into a hole, but four spins wait already.',
  returned: (medals: number) => `${enMedals(medals)} back from the slot into your medals.`,
  notEnough: 'No medals left to put in the slot.',
  unsaved: 'This browser’s storage is full: the machine cannot keep its field, so no medals were taken.',
  cardAway: 'Your medals are in a machine in another tab.',
  playHere: 'Play here',
  refill: (medals: number) => `Out of medals — take ${medals} more`,
  outOfMedals: 'Out of medals.',
  sayLent: (medals: number) => `${enMedals(medals)} into the slot.`,
  sayPocket: 'Into a hole.',
  sayResult: (digits: string, id: OutcomeId, medals: number) => `The counter stops at ${digits}. ${id === 'miss' ? 'No win.' : id === 'jackpot' ? 'Jackpot.' : `${enMedals(medals)} won.`}`,
  sayJackpot: (n: number) => `Jackpot: the dish throws ${enMedals(n)} across the field.`,
  sayRestart: 'The medals were reset at the medal center.',
  sayRefill: (medals: number) => `${enMedals(medals)} added.`,
  historyTitle: 'Last wins',
  historyEmpty: 'No wins yet.',
  historyEntry: (id: OutcomeId, medals: number) => (id === 'jackpot' ? `JP ${medals}` : `${enOutcome[id]} ${medals}`),
  sessionTitle: 'This visit',
  fed: 'Medals dropped',
  back: 'Medals into the tray',
  spins: 'Spins',
  wins: 'Wins',
  jackpots: 'Jackpots',
  cameBack: 'Came back',
  bestBack: 'Best play brings back',
  keysHint: 'Keys: Space drops a medal (hold for more) · R gives back the credit',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the medal center’s, shared by every machine there.',
  centerNoteLink: 'Medal Game Center',
  odds: {
    intro: [
      'A pusher’s field is a heap of medals pushed about by the machine, and what it gives back is worked out by playing it, not by a formula. So the machine is played here exactly as it is (its physics, its holes, its counter and its dish, the same code as the cabinet on the Machine tab) for millions of medals each way, on twelve machines at once, each set up from a seed of its own, and every medal that comes back is counted.',
      'Each figure is the medals back over the medals dropped. Beside it is how far it could be out: the half-width of its 95% confidence interval, from how much 5,000-medal batches differ from each other (a jackpot makes some batches much richer than others). The first 500 medals on each machine are not counted, so that its field has settled to the way it is being fed.',
    ],
    bestLabel: 'Best play',
    bestNote: 'Every medal dropped as a hole passes the ▼ mark, one a hole, none while four spins wait.',
    steadyLabel: 'An everyday hand',
    steadyNote: 'A medal about every second, at no moment in particular.',
    heldLabel: 'DROP held down',
    heldNote: 'A medal every time the slot takes one, four a second.',
    interval: (half: string) => `95% interval: ±${half}`,
    measured: (medals: string) => `measured over ${medals} medals`,
    whereTitle: 'Where the medals come back from',
    whereNote: 'Per 100 medals dropped. The field’s share is of the medals that left the field: the share that left it over the front edge into the tray rather than down a side hole, about half to six in ten as on a real machine.',
    colWay: 'Way',
    colFront: 'Off the front edge',
    colPrizes: 'Counter’s prizes',
    colThrown: 'Thrown into the tray',
    colPockets: 'Into a hole',
    colShare: 'Field’s share',
    colJackpots: 'Jackpots per 1,000',
    scanTitle: 'Every other moment',
    scanNote:
      'Could another moment do better than best play? The machine was also played every other way of choosing the moment, each on twelve machines: every hole timed but dropped early or late, from 40 steps (⅔ s) late to 20 early, and every step near the hole; one medal a turn at a single angle of the carousel, every 12°; DROP held through one part of the skirt’s swing; and the holes timed only while the dish holds plenty. The highest of each family is below. None comes out clearly above best play: each one’s interval reaches down to it.',
    againNote: (play: string, value: string, half: string, medals: string) =>
      `The plays that came out highest were played again on twelve other machines for many more medals, where being picked for coming out high cannot lift them. The highest of everything measured: ${play}, ${value} ±${half} over ${medals} medals. The medal center counts this as the machine’s best.`,
    colFamily: 'Moment',
    colPlays: 'Plays',
    colHighest: 'Highest',
    colAt: 'At',
    familyName: { leads: 'Early or late', angles: 'One angle a turn', swings: 'DROP held through part of the swing', dishes: 'By the dish' },
    scanLead: (steps: number) => (steps === 0 ? 'as the hole passes' : `${Math.abs(steps)} ${Math.abs(steps) === 1 ? 'step' : 'steps'} ${steps < 0 ? 'late' : 'early'}`),
    scanAngle: (angle: number) => `at ${angle}°`,
    scanSwing: (from: number, to: number) => `${from}° to ${to}°`,
    scanDish: (stock: number) => `timed from ${stock} in the dish`,
    scanNamed: (family: string, play: string) => `${family} (${play})`,
    counterTitle: 'The counter',
    counterNote: (value: string) =>
      `Each spin is drawn from one number: a number one of your presses drew and kept, the first still waiting, or the machine’s own when none is left. Every chance below is exact (out of 65,536). A spin pays ${value} medals into the tray on average, the jackpot left out: it pays through the field.`,
    colShows: 'Shows',
    colChance: 'Chance',
    colOneIn: 'One in',
    colPays: 'Pays',
    jackpotPays: 'the dish’s stock, thrown across the field',
    nothing: 'nothing',
    dishTitle: 'The treasure dish',
    dish: [
      `The dish starts with ${STOCK.start} medals and the hopper adds one for every ${STOCK.every} medals dropped. 7-7-7 tips it: its stock is thrown out across the field, thirty medals a second, a few of them straight over the front edge into the tray, and the carousel pushes the rest off over the next turns. Then it starts again at ${STOCK.start}.`,
      'The stock is the machine’s, not the player’s: it is on the field only once it has been thrown.',
    ],
    rulesTitle: 'The machine',
    rules: [
      'The carousel turns once every 6 seconds on a pole 2 medal radii off its centre, so its skirt swings out and back by a medal’s width as it turns, and pushes whatever has come to lie against it outwards, along the field’s side walls, which run straight out from the pole.',
      `A medal takes 0.9 seconds from DROP to the deck: in at the slot, down the rail and off its tip. It comes down within about a medal’s width of the tip, wherever chance puts it: that is drawn at the press.`,
      `A medal that misses the holes glances off the domed deck and goes over its rim at a heading drawn at the press, anywhere within ${SHED.spread}° either side of straight ahead, and lands on the heap just beyond the farthest the skirt swings out, wherever the bulge is, where the skirt works it on through the medals between. So the moment you drop a medal chooses only whether it meets a hole, never where a miss goes. Medals pushed over the front edge drop into the tray; over the front within ${FIELD.sideReach} medal radii of either corner, down a side hole.`,
      'Every random number the machine uses comes from a press (where a medal comes down, a number kept for a spin, and the way it glances off the deck if it misses) or from its own seeded generator, and it keeps time in steps of 1/60 s with no sine or cosine but its own: the same presses play out the same in every browser, and in the measurement.',
      'The field, the medals in the air, the counter and the dish are written down as the machine plays: a reload finds them where they were, and the medals that came back are counted once.',
    ],
    sourcesTitle: 'What it is built from',
    sourcesNote: 'The machine is a design of its own, built from how real machines work: no machine’s name, art or rules are copied.',
  },
  infoBody: (best: string, steady: string, held: string) => [
    `DROP puts ${LEND} of your medals into the slot (CREDIT), and drops them one by one down the rail onto the carousel’s deck; hold it to keep dropping, four a second. RETURN gives back what is left in the slot.`,
    'The carousel turns on a pole a little off its centre, so its skirt swings out and back as it turns and shoves the medals round it towards the front edge. Medals pushed over the front edge drop into the tray and are yours; near the front corners they go down the side holes.',
    `Three holes ride round the deck. A medal that comes down in one, or slides into one as it goes off the deck’s edge, rolls the counter: 7-7-7 tips the treasure dish and throws its stock across the field (it starts at ${STOCK.start} and grows a medal for every ${STOCK.every} dropped), three alike pay ${PRIZES.triple}, two 7s ${PRIZES.sevens}, a 7 in the middle ${PRIZES.seven}, straight into the tray. Up to ${HOLD_MAX} spins wait.`,
    `The skill is timing: drop a medal as a hole passes the ▼ mark, and it comes down as the hole reaches the rail’s tip. Done every time, and never while four spins wait, it brings back ${best} of the medals dropped (measured over millions of medals; the Odds tab says how). A medal a second at no moment in particular brings back ${steady}; the button held down, ${held}.`,
  ],
};

type Strings = typeof en;

const ja: Strings = {
  title: 'さくらメリーゴーランド',
  titleParts: ['さくら', 'メリーゴーランド'],
  subtitle: `プッシャーコーナーの${B}2台目、${B}プッシャーが${B}回る${B}シングル機。${B}中心から${B}少しずれた${B}軸で${B}回る${B}メリーゴーランドが、${B}すそを${B}張り出して${B}まわりの${B}メダルを${B}押し出します。${B}デッキの${B}穴が${B}回ってきたところへ${B}メダルを${B}落とすと${B}カウンターが${B}回り、${B}7・7・7で${B}宝の皿が${B}傾いて${B}ストックの${B}メダルが${B}フィールドへ${B}飛び散ります。`,
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  sign: 'SAKURA CAROUSEL',
  signSub: 'メダルプッシャー',
  outcomeName: jaOutcome,
  medalsWord: jaMedals,
  medals: '持ちメダル',
  credit: 'クレジット',
  stock: 'JACKPOT',
  hold: '保留',
  drop: '投入',
  dropSmall: '長押しで連続',
  dropAria: '投入：メダルを1枚。長押しで1秒に4枚ずつ',
  giveBack: '返却',
  giveBackAria: '返却：クレジットのメダルを持ちメダルに戻す',
  paytable: [
    { id: 'jackpot', shows: '777', pays: 'JACKPOT' },
    { id: 'triple', shows: '★★★', pays: `${PRIZES.triple}枚` },
    { id: 'sevens', shows: '7·7', pays: `${PRIZES.sevens}枚` },
    { id: 'seven', shows: '·7·', pays: `${PRIZES.seven}枚` },
  ],
  paytableLabel: `配当：7・7・7でジャックポット、ゾロ目${PRIZES.triple}枚、7が2つで${PRIZES.sevens}枚、真ん中が7で${PRIZES.seven}枚`,
  stageLabel: (onField: number, stock: number) =>
    `ガラスの中のメリーゴーランド。中心から少しずれた軸で回る、穴が3つあるデッキ、その上のレール、軸の上の宝の皿（${jaMedals(stock)}）、すそのまわりのフィールドに${jaMedals(onField)}、手前の両隅に横穴。`,
  holdLamps: (holds: number) => `保留：${holds}／${HOLD_MAX}`,
  counterLabel: (digits: string) => `カウンターの表示：${digits}`,
  status: {
    empty: `投入で${B}持ちメダル${B}${LEND}枚が${B}クレジットに${B}入り、${B}1枚ずつ${B}落ちます。`,
    ready: `デッキの${B}穴が${B}▼を${B}通るときに${B}メダルを${B}投入。`,
    spinning: `カウンターが${B}回っています…`,
    reach: `リーチ！${B}最初の${B}2桁が${B}そろいました…`,
    full: `保留が${B}4つ：${B}いま${B}穴に${B}入っても${B}回りません。`,
    jackpot: (n: number) => `ジャックポット！${B}宝の皿の${B}${jaMedals(n)}が${B}フィールドへ${B}飛び散ります。`,
    throwing: `宝の皿の${B}メダルが${B}飛び散っています。${B}メリーゴーランドが${B}押し出します。`,
  },
  outcome: (id, medals) => (id === 'miss' ? 'はずれ。' : id === 'jackpot' ? 'ジャックポット！' : `${jaOutcome[id]}：${jaMedals(medals)}をトレイへ。`),
  pocketHeld: `入賞！${B}カウンターが${B}回ります。`,
  pocketWasted: `入賞しましたが、${B}保留が${B}いっぱいです。`,
  returned: (medals) => `クレジットから${B}${jaMedals(medals)}を${B}持ちメダルに${B}戻しました。`,
  notEnough: `投入する${B}メダルが${B}ありません。`,
  unsaved: `このブラウザの${B}保存領域が${B}いっぱいで${B}フィールドを${B}記録できないため、${B}メダルは${B}使っていません。`,
  cardAway: `持ちメダルは${B}別の${B}タブの${B}マシンで${B}使われています。`,
  playHere: 'ここで遊ぶ',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  outOfMedals: 'メダルがなくなりました。',
  sayLent: (medals) => `クレジットに${jaMedals(medals)}。`,
  sayPocket: '入賞。',
  sayResult: (digits, id, medals) => `カウンターは${digits}。${id === 'miss' ? 'はずれ。' : id === 'jackpot' ? 'ジャックポット。' : `${jaMedals(medals)}の当たり。`}`,
  sayJackpot: (n) => `ジャックポット：宝の皿から${jaMedals(n)}がフィールドへ。`,
  sayRestart: 'メダルセンターでメダルがリセットされました。',
  sayRefill: (medals) => `${jaMedals(medals)}もらいました。`,
  historyTitle: '最近の当たり',
  historyEmpty: 'まだ当たりはありません。',
  historyEntry: (id, medals) => (id === 'jackpot' ? `JP ${medals}` : `${jaOutcome[id]} ${medals}`),
  sessionTitle: '今回のプレイ',
  fed: `投入した${B}メダル`,
  back: `トレイに${B}出た${B}メダル`,
  spins: 'カウンター',
  wins: '当たり',
  jackpots: 'ジャックポット',
  cameBack: '戻り',
  bestBack: `いちばん${B}上手な${B}遊び方の${B}戻り`,
  keysHint: 'キー：Space で投入（長押しで連続）・R でクレジット返却',
  notMoney: NOT_MONEY.ja,
  centerNote: `持ちメダルは${B}メダルセンターの${B}もので、${B}すべての${B}マシンで${B}共通です。`,
  centerNoteLink: 'メダルゲームセンター',
  odds: {
    intro: [
      `プッシャーの${B}フィールドは${B}マシンに${B}押される${B}メダルの${B}山で、${B}戻りは${B}式ではなく${B}実際に${B}動かして${B}確かめるしか${B}ありません。${B}そこで${B}「マシン」タブの${B}マシンと${B}まったく${B}同じもの${B}（物理、${B}穴、${B}カウンター、${B}宝の皿の${B}コード）を、${B}12台${B}それぞれ${B}別の${B}シードで${B}用意して、${B}遊び方ごとに${B}何百万枚も${B}投入し、${B}戻ってきた${B}メダルを${B}1枚ずつ${B}数えました。`,
      `数字は${B}どれも、${B}投入した${B}メダルに${B}対する${B}戻った${B}メダルの${B}割合です。${B}となりに${B}あるのは${B}誤差の${B}目安で、${B}5,000枚ずつに${B}分けた${B}区切りの${B}ばらつきから${B}求めた${B}95%信頼区間の${B}半分の${B}幅です${B}（ジャックポットが${B}ある${B}区切りは${B}大きく${B}増えます）。${B}各マシンの${B}最初の${B}500枚は、${B}フィールドが${B}その${B}遊び方に${B}落ち着くまでと${B}して${B}数えていません。`,
    ],
    bestLabel: `いちばん${B}上手な${B}遊び方`,
    bestNote: `穴が${B}▼を${B}通るときに${B}毎回${B}1枚ずつ${B}投入し、${B}保留が${B}4つの${B}ときは${B}投入しない。`,
    steadyLabel: `ふつうの${B}遊び方`,
    steadyNote: `タイミングを${B}気にせず、${B}1秒に${B}1枚くらい。`,
    heldLabel: `投入ボタン${B}押しっぱなし`,
    heldNote: `投入口が${B}受け付ける${B}たびに${B}1枚、${B}1秒に${B}4枚。`,
    interval: (half: string) => `95%区間：±${half}`,
    measured: (medals: string) => `${medals}枚で計測`,
    whereTitle: `メダルは${B}どこから${B}戻るか`,
    whereNote: `投入${B}100枚${B}あたり。${B}フィールドの${B}割合は、${B}フィールドから${B}出た${B}メダルの${B}うち、${B}横穴ではなく${B}手前の${B}ふちから${B}トレイに${B}落ちた${B}割合です。${B}実機と${B}同じく${B}5〜6割ほど。`,
    colWay: '遊び方',
    colFront: `手前の${B}ふちから`,
    colPrizes: `カウンターの${B}当たり`,
    colThrown: `トレイへ${B}直接`,
    colPockets: '入賞',
    colShare: `フィールドの${B}割合`,
    colJackpots: `1,000枚${B}あたりの${B}ジャックポット`,
    scanTitle: `ほかの${B}タイミングも${B}すべて`,
    scanNote: `ほかの${B}タイミングなら${B}もっと${B}戻るのでは？${B}ほかの${B}タイミングの${B}選び方も${B}すべて、${B}それぞれ${B}12台で${B}試しました。${B}穴に${B}合わせつつ${B}早めや${B}遅めに${B}投入する${B}（40ステップ＝⅔秒${B}遅くから${B}20ステップ${B}早くまで、${B}穴の${B}近くは${B}1ステップ${B}ごと）、${B}1回転に${B}1枚、${B}メリーゴーランドが${B}決まった${B}角度の${B}ときだけ${B}（12°ごと）、${B}すその${B}ふりの${B}一部の${B}あいだだけ${B}投入ボタンを${B}押しっぱなし、${B}宝の皿に${B}たくさん${B}あるときだけ${B}穴に${B}合わせる。${B}それぞれの${B}いちばん${B}高かった${B}ものが${B}下の${B}表で、${B}いちばん${B}上手な${B}遊び方を${B}はっきり${B}上回る${B}ものは${B}ありません${B}（どれも${B}区間が${B}重なります）。`,
    againNote: (play: string, value: string, half: string, medals: string) =>
      `高く${B}出た${B}ものは、${B}別の${B}12台で${B}ずっと${B}多くの${B}メダルを${B}使って${B}測り直しました${B}（高く${B}出たから${B}選んだ${B}分の${B}かさ上げが${B}入りません）。${B}測った${B}すべての${B}中で${B}いちばん${B}高かった${B}もの：${B}${play}、${B}${value}${B}±${half}${B}（${medals}枚）。${B}メダルセンターは${B}これを${B}この${B}マシンの${B}いちばん${B}高い${B}戻りと${B}して${B}数えます。`,
    colFamily: 'タイミング',
    colPlays: `試した${B}数`,
    colHighest: `いちばん${B}高い`,
    colAt: 'そのとき',
    familyName: { leads: `早め・${B}遅め`, angles: `1回転に${B}1枚、${B}決まった${B}角度`, swings: `ふりの${B}一部だけ${B}押しっぱなし`, dishes: `宝の皿${B}しだい` },
    scanLead: (steps: number) => (steps === 0 ? `穴が${B}通る${B}ちょうど` : `${Math.abs(steps)}ステップ${steps < 0 ? '遅く' : '早く'}`),
    scanAngle: (angle: number) => `${angle}°`,
    scanSwing: (from: number, to: number) => `${from}°〜${to}°`,
    scanDish: (stock: number) => `皿が${B}${stock}枚${B}から`,
    scanNamed: (family: string, play: string) => `${family}（${play}）`,
    counterTitle: 'カウンター',
    counterNote: (value: string) =>
      `1回ごとに${B}1つの${B}数で${B}決まります。${B}投入の${B}ときに${B}引いて${B}ためておいた${B}数の${B}最初の${B}もの、${B}なければ${B}マシン自身の${B}数です。${B}下の${B}確率は${B}すべて${B}正確な${B}値です${B}（65,536分の）。${B}ジャックポットを${B}除くと、${B}1回あたり${B}平均${value}枚が${B}トレイに${B}出ます${B}（ジャックポットは${B}フィールドを${B}通して${B}戻ります）。`,
    colShows: '表示',
    colChance: '確率',
    colOneIn: `何回に${B}1回`,
    colPays: '配当',
    jackpotPays: `宝の皿の${B}ストックが${B}フィールドへ`,
    nothing: 'なし',
    dishTitle: '宝の皿',
    dish: [
      `宝の皿は${B}${STOCK.start}枚から${B}始まり、${B}${STOCK.every}枚${B}投入される${B}ごとに${B}ホッパーが${B}1枚${B}足します。${B}7・7・7で${B}皿が${B}傾き、${B}ストックが${B}1秒に${B}30枚ずつ${B}フィールドへ${B}飛び散ります。${B}少しは${B}手前の${B}ふちを${B}越えて${B}直接${B}トレイへ、${B}残りは${B}メリーゴーランドが${B}次の${B}回転で${B}押し出します。${B}そのあと${B}また${B}${STOCK.start}枚から。`,
      `ストックは${B}マシンの${B}もので、${B}飛び散って${B}フィールドに${B}出たときに${B}初めて${B}押し出せるように${B}なります。`,
    ],
    rulesTitle: 'マシンのしくみ',
    rules: [
      `メリーゴーランドは${B}6秒に${B}1回、${B}中心から${B}メダル半径${B}2つ分${B}ずれた${B}軸で${B}回ります。${B}回るたびに${B}すそが${B}メダル${B}1枚分${B}張り出し、${B}そこに${B}寄ってきた${B}メダルを、${B}軸から${B}まっすぐ${B}伸びる${B}両側の${B}壁にそって${B}外へ${B}押し出します。`,
      `投入から${B}デッキまで${B}0.9秒：${B}投入口に${B}入り、${B}レールを${B}転がり、${B}先から${B}落ちます。${B}落ちる${B}場所は${B}レールの${B}先から${B}メダル${B}1枚分ほどの${B}範囲で、${B}投入した${B}瞬間に${B}決まります。`,
      `穴に${B}入らなかった${B}メダルは${B}丸い${B}デッキに${B}はねて、${B}投入の${B}瞬間に${B}決まった${B}向き${B}（正面から${B}左右${B}${SHED.spread}°${B}以内）に${B}デッキの${B}ふちを${B}越え、${B}すそが${B}いちばん${B}張り出す${B}ところの${B}すぐ${B}外の${B}山に${B}落ち、${B}すそに${B}押される${B}メダルに${B}押されて${B}進みます${B}（すその${B}向きに${B}よらず${B}同じ${B}場所）。${B}投入の${B}タイミングで${B}決まるのは${B}穴に${B}入るか${B}どうか${B}だけで、${B}外れた${B}メダルの${B}行き先は${B}変わりません。${B}手前の${B}ふちを${B}越えた${B}メダルは${B}トレイへ、${B}両隅から${B}メダル半径${B}${FIELD.sideReach}つ分${B}以内は${B}横穴へ${B}落ちます。`,
      `マシンが${B}使う${B}乱数は、${B}投入の${B}瞬間に${B}引いた${B}数${B}（メダルの${B}落ちる${B}場所、${B}カウンター用に${B}ためておく${B}数、${B}外れたときに${B}デッキから${B}落ちる${B}向き）と、${B}マシン自身の${B}シードつき${B}乱数だけです。${B}時間は${B}1/60秒の${B}刻みで${B}進み、${B}三角関数も${B}自前なので、${B}同じ${B}投入は${B}どの${B}ブラウザでも${B}計測でも${B}同じ${B}結果に${B}なります。`,
      `フィールド、${B}空中の${B}メダル、${B}カウンター、${B}宝の皿は${B}プレイ中に${B}記録されます。${B}再読み込みしても${B}元の${B}場所に${B}あり、${B}戻った${B}メダルは${B}一度だけ${B}数えられます。`,
    ],
    sourcesTitle: '参考にした実機のしくみ',
    sourcesNote: `このマシンは${B}オリジナルの${B}設計で、${B}実機の${B}しくみを${B}参考に${B}しています。${B}実在の${B}機種の${B}名前・絵・ルールは${B}使っていません。`,
  },
  infoBody: (best, steady, held) => [
    `投入で持ちメダル${LEND}枚がクレジットに入り、1枚ずつレールを転がってメリーゴーランドのデッキに落ちます。長押しで1秒に4枚ずつ。返却でクレジットの残りを持ちメダルに戻します。`,
    'メリーゴーランドは中心から少しずれた軸で回るので、回るたびにすそが張り出し、まわりのメダルを手前のふちへ押し出します。手前のふちから落ちたメダルはトレイに入って持ちメダルになり、手前の両隅では横穴に落ちます。',
    `デッキには穴が3つあって一緒に回ります。穴に落ちたメダルや、デッキのふちへすべるとちゅうで穴に入ったメダルはカウンターを回します。7・7・7で宝の皿が傾き、ストックのメダルがフィールドへ飛び散ります（${STOCK.start}枚から始まり、${STOCK.every}枚投入するごとに1枚増えます）。ゾロ目は${PRIZES.triple}枚、7が2つで${PRIZES.sevens}枚、真ん中が7で${PRIZES.seven}枚がトレイに直接出ます。保留は${HOLD_MAX}つまで。`,
    `コツはタイミングです。穴が▼を通るときに投入すると、穴がレールの先に来たところへメダルが落ちます。毎回そうして、保留が4つのときは投入しなければ、投入したメダルの${best}が戻ります（何百万枚ものシミュレーションで計測。方法は「確率」タブにあります）。タイミングを気にせず1秒に1枚なら${steady}、ボタンを押しっぱなしなら${held}です。`,
  ],
};

export function getStrings(language: GameLanguage): Strings {
  return language === 'ja' ? ja : en;
}

export type CarouselStrings = Strings;
