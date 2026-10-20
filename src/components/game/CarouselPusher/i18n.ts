import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import { HOLD_MAX, STOCK } from './engine';
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
  giveBackAria: 'Give back the medals in the slot',
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
    empty: `DROP puts ${LEND} of your medals into the slot (CREDIT) and drops them one at a time.`,
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
      'A medal that misses the holes slides off the deck’s edge at the foot of the skirt, where the next swing pushes it into the heap. Medals pushed over the front edge drop into the tray; over the front within 3 medal radii of either corner, down a side hole.',
      'Every random number the machine uses comes from a press (where a medal comes down, and a number kept for a spin) or from its own seeded generator, and it keeps time in steps of 1/60 s with no sine or cosine but its own: the same presses play out the same in every browser, and in the measurement.',
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
  dropAria: 'メダルを1枚投入。長押しで1秒に4枚ずつ',
  giveBack: '返却',
  giveBackAria: 'クレジットのメダルを持ちメダルに戻す',
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
  cardAway: '持ちメダルは別のタブのマシンで使われています。',
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
  fed: '投入したメダル',
  back: 'トレイに出たメダル',
  spins: 'カウンター',
  wins: '当たり',
  jackpots: 'ジャックポット',
  cameBack: '戻り',
  bestBack: 'いちばん上手な遊び方の戻り',
  keysHint: 'キー：Space で投入（長押しで連続）・R でクレジット返却',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルセンターのもので、すべてのマシンで共通です。',
  centerNoteLink: 'メダルゲームセンター',
  odds: {
    intro: [
      `プッシャーのフィールドはマシンに押されるメダルの山で、戻りは式ではなく実際に動かして確かめるしかありません。そこで「マシン」タブのマシンとまったく同じもの（物理、穴、カウンター、宝の皿のコード）を、12台それぞれ別のシードで用意して、遊び方ごとに何百万枚も投入し、戻ってきたメダルを1枚ずつ数えました。`,
      `数字はどれも、投入したメダルに対する戻ったメダルの割合です。となりにあるのは誤差の目安で、5,000枚ずつに分けた区切りのばらつきから求めた95%信頼区間の半分の幅です（ジャックポットがある区切りは大きく増えます）。各マシンの最初の500枚は、フィールドがその遊び方に落ち着くまでとして数えていません。`,
    ],
    bestLabel: 'いちばん上手な遊び方',
    bestNote: '穴が▼を通るときに毎回1枚ずつ投入し、保留が4つのときは投入しない。',
    steadyLabel: 'ふつうの遊び方',
    steadyNote: 'タイミングを気にせず、1秒に1枚くらい。',
    heldLabel: '投入ボタン押しっぱなし',
    heldNote: '投入口が受け付けるたびに1枚、1秒に4枚。',
    interval: (half: string) => `95%区間：±${half}`,
    measured: (medals: string) => `${medals}枚で計測`,
    whereTitle: 'メダルはどこから戻るか',
    whereNote: '投入100枚あたり。フィールドの割合は、フィールドから出たメダルのうち、横穴ではなく手前のふちからトレイに落ちた割合です。実機と同じく5〜6割ほど。',
    colWay: '遊び方',
    colFront: '手前のふちから',
    colPrizes: 'カウンターの当たり',
    colThrown: 'トレイへ直接',
    colPockets: '入賞',
    colShare: 'フィールドの割合',
    colJackpots: '1,000枚あたりのジャックポット',
    counterTitle: 'カウンター',
    counterNote: (value: string) =>
      `1回ごとに1つの数で決まります。投入のときに引いてためておいた数の最初のもの、なければマシン自身の数です。下の確率はすべて正確な値です（65,536分の）。ジャックポットを除くと、1回あたり平均${value}枚がトレイに出ます（ジャックポットはフィールドを通して戻ります）。`,
    colShows: '表示',
    colChance: '確率',
    colOneIn: '何回に1回',
    colPays: '配当',
    jackpotPays: '宝の皿のストックがフィールドへ',
    nothing: 'なし',
    dishTitle: '宝の皿',
    dish: [
      `宝の皿は${STOCK.start}枚から始まり、${STOCK.every}枚投入されるごとにホッパーが1枚足します。7・7・7で皿が傾き、ストックが1秒に30枚ずつフィールドへ飛び散ります。少しは手前のふちを越えて直接トレイへ、残りはメリーゴーランドが次の回転で押し出します。そのあとまた${STOCK.start}枚から。`,
      'ストックはマシンのもので、飛び散ってフィールドに出たときに初めて押し出せるようになります。',
    ],
    rulesTitle: 'マシンのしくみ',
    rules: [
      'メリーゴーランドは6秒に1回、中心からメダル半径2つ分ずれた軸で回ります。回るたびにすそがメダル1枚分張り出し、そこに寄ってきたメダルを、軸からまっすぐ伸びる両側の壁にそって外へ押し出します。',
      '投入からデッキまで0.9秒：投入口に入り、レールを転がり、先から落ちます。落ちる場所はレールの先からメダル1枚分ほどの範囲で、投入した瞬間に決まります。',
      '穴に入らなかったメダルはデッキのふちからすその足もとにすべり落ち、次の張り出しで山に押し込まれます。手前のふちを越えたメダルはトレイへ、両隅からメダル半径3つ分以内は横穴へ落ちます。',
      'マシンが使う乱数は、投入の瞬間に引いた数（メダルの落ちる場所と、カウンター用にためておく数）と、マシン自身のシードつき乱数だけです。時間は1/60秒の刻みで進み、三角関数も自前なので、同じ投入はどのブラウザでも計測でも同じ結果になります。',
      'フィールド、空中のメダル、カウンター、宝の皿はプレイ中に記録されます。再読み込みしても元の場所にあり、戻ったメダルは一度だけ数えられます。',
    ],
    sourcesTitle: '参考にした実機のしくみ',
    sourcesNote: 'このマシンはオリジナルの設計で、実機のしくみを参考にしています。実在の機種の名前・絵・ルールは使っていません。',
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
