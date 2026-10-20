/**
 * Big Catch Harbor's words, in English and Japanese.
 *
 * Medals are never spoken of as money (the owner: 「本当のお金と誤解される書き方は
 * しないでほしい。」): they are "your medals" / 「持ちメダル」, a catch "gives"
 * medals, and the note that they are not money (`NOT_MONEY`) is shown under the
 * machine. `tests/unit/components/game/Fishing/render.test.tsx` reads every
 * string here for words that would say otherwise.
 *
 * The machine's name, its fish and their names are its own: no product's
 * names, characters or words are used.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import type { FishId, Shadow } from './engine';
import type { Step } from './show';

export interface FishingStrings {
  title: string;
  subtitle: string;
  centerLink: string;
  howToPlay: string;
  tabMachine: string;
  tabOdds: string;
  /** The sign over the cabinet, and the line under it. */
  sign: string;
  signSub: string;
  fishNames: Record<FishId, string>;
  shadowNames: Record<Shadow, string>;
  /** The water, for a screen reader: what is happening in it. */
  pondLabel: (step: string) => string;
  pondIdle: string;
  // What the screen says
  steps: Record<Exclude<Step, 'landed' | 'away' | 'nothing'>, string>;
  landed: (fish: string, multiple: number, medals: number) => string;
  chestLanded: (multiple: number, medals: number) => string;
  away: (fish: string) => string;
  lordComing: string;
  nothing: string;
  attract: string;
  attractSub: string;
  get: string;
  // The panel
  medals: string;
  bet: string;
  win: string;
  betGroup: string;
  betAria: (bet: number) => string;
  betUnit: string;
  cast: string;
  reel: string;
  skip: string;
  reelNote: string;
  keysHint: string;
  refill: (medals: number) => string;
  outOfMedals: string;
  notEnough: (bet: number) => string;
  cardAway: string;
  playHere: string;
  resumed: string;
  sayCast: (bet: number) => string;
  sayHooked: string;
  sayRefill: (medals: number) => string;
  sayRestart: string;
  notMoney: string;
  centerNote: string;
  centerNoteLink: string;
  // The fish board
  boardTitle: string;
  boardNote: string;
  colFish: string;
  colShadow: string;
  colPays: string;
  colMedals: (bet: number) => string;
  chestPays: string;
  // This visit
  sessionTitle: string;
  casts: string;
  played: string;
  won: string;
  net: string;
  catches: string;
  biggest: string;
  cameBack: string;
  machineReturn: string;
  recentTitle: string;
  recentNothing: string;
  recentAway: string;
  // How to play
  infoBody: (top: number) => string[];
  // The Odds tab
  oddsIntro: string[];
  returnLabel: string;
  returnNote: (num: number, den: number) => string;
  keepsLabel: string;
  hitLabel: string;
  noBiteLabel: string;
  awayLabel: string;
  spreadLabel: string;
  spreadNote: (casts: string) => string;
  fishTitle: string;
  fishIntro: string;
  colBites: string;
  colLands: string;
  colCaught: string;
  colAway: string;
  colShare: string;
  total: string;
  chestTitle: string;
  chestIntro: string;
  colPrize: string;
  colInChest: string;
  colPerCast: string;
  drawsTitle: string;
  draws: string[];
  realTitle: string;
  real: string[];
  simTitle: string;
  simIntro: string;
  simCasts: string;
  simSessions: string;
  simRun: string;
  simRunning: string;
  simExpected: (net: string) => string;
  simResult: (mean: string, ahead: string, rtp: string, lords: string) => string;
  simChart: string;
  simBehind: string;
  simAhead: string;
}

const en: FishingStrings = {
  title: 'Big Catch Harbor',
  subtitle: 'A fishing medal machine at the Medal Game Center: cast for 1, 3 or 5 medals, reel in whatever bites, and see why exactly 90 of every 100 medals come back.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  sign: 'BIG CATCH HARBOR',
  signSub: '大漁ハーバー',
  fishNames: {
    fry: 'Bubble Fry',
    goby: 'Pebble Goby',
    sardine: 'Wave Sardine',
    bream: 'Ribbon Bream',
    squid: 'Lantern Squid',
    tuna: 'Thunder Tuna',
    marlin: 'Crescent Marlin',
    chest: 'Treasure Chest',
    lord: 'Moonscale, the Harbor Lord',
  },
  shadowNames: { small: 'Small', medium: 'Medium', large: 'Large', chest: 'Glinting', lord: 'Huge' },
  pondLabel: (step) => `The harbor: ${step}`,
  pondIdle: 'fish swim by, waiting for a cast',
  steps: {
    flight: 'Cast!',
    warning: 'WARNING — the Harbor Lord is coming!',
    wait: 'Waiting for a bite…',
    hooked: 'HIT!',
    fight: 'Reel it in!',
    chest: 'A treasure chest! What is inside?',
  },
  landed: (fish, multiple, medals) => `GET! ${fish} ×${multiple}: ${medals.toLocaleString('en-US')} ${medals === 1 ? 'medal' : 'medals'}`,
  chestLanded: (multiple, medals) => `Treasure chest ×${multiple}: ${medals.toLocaleString('en-US')} medals!`,
  away: (fish) => `The one that got away: ${fish}`,
  lordComing: 'The Harbor Lord is coming!',
  nothing: 'Nothing bit this time.',
  attract: 'CAST TO PLAY',
  attractSub: 'Fish are biting!',
  get: 'GET!',
  medals: 'Medals',
  bet: 'Bet',
  win: 'Win',
  betGroup: 'Medals a cast',
  betAria: (bet) => `${bet} ${bet === 1 ? 'medal' : 'medals'} a cast`,
  betUnit: 'a cast',
  cast: 'CAST',
  reel: 'REEL',
  skip: 'Skip',
  reelNote: 'Reeling only hurries the show: what a cast brings is decided the moment you cast.',
  keysHint: 'Keys: Space or Enter casts and reels · 1, 3 or 5 sets the bet · S skips',
  refill: (medals) => `Out of medals — take ${medals} more`,
  outOfMedals: 'You have no medals left.',
  notEnough: (bet) => `Not enough medals to cast for ${bet} — choose a smaller bet.`,
  cardAway: 'Your medals are being played on a machine in another tab. This machine waits where it is.',
  playHere: 'Play here',
  resumed: 'The cast left under way has been played out.',
  sayCast: (bet) => `Cast for ${bet} ${bet === 1 ? 'medal' : 'medals'}.`,
  sayHooked: 'A bite!',
  sayRefill: (medals) => `The attendant brought ${medals} medals.`,
  sayRestart: 'Your medals were reset at the Medal Game Center: this machine has started over.',
  notMoney: NOT_MONEY.en,
  centerNote: 'These are your medals from the Medal Game Center, shared by every machine there. The daily bonus and the reset are on its front page.',
  centerNoteLink: 'Go to the Medal Game Center',
  boardTitle: 'Fish board',
  boardNote: 'What each catch gives, times the medals a cast. A shadow’s size in the water tells small, medium and large fish apart.',
  colFish: 'Fish',
  colShadow: 'Shadow',
  colPays: 'Pays',
  colMedals: (bet) => `Bet ${bet}`,
  chestPays: '×10–\u200b×200',
  sessionTitle: 'This visit',
  casts: 'Casts',
  played: 'Medals played',
  won: 'Medals won',
  net: 'Net',
  catches: 'Catches',
  biggest: 'Biggest catch',
  cameBack: 'Came back',
  machineReturn: 'Machine’s return',
  recentTitle: 'Last casts',
  recentNothing: 'No bite',
  recentAway: 'Got away',
  infoBody: (top) => [
    'Choose how many medals a cast takes: 1, 3 or 5 (keys 1, 3, 5). Whatever you catch gives its multiple of that. Then press CAST (Space or Enter).',
    'The float flies out and shadows swim by. When one bites, the float goes under: HIT! A small, medium or large shadow is a small, medium or large fish; a glinting one is a treasure chest, and a huge one is the harbor’s lord, Moonscale.',
    `Landed, a fish gives its multiple: from ×1 for a Bubble Fry to ×50 for a Crescent Marlin. A treasure chest opens on ×10, ×20, ×50 or ×200, and Moonscale gives ×300: ${top.toLocaleString('en-US')} medals on a 5-medal cast. Bigger fish fight harder and get away more often.`,
    'Everything a cast brings — what bites, whether it is landed, and a chest’s prize — is drawn the moment you press CAST, from the chances on the Odds tab. Pressing REEL (or Space) only moves the show on, and Skip (S) goes straight to the end: neither changes what was drawn.',
    'On average exactly 90 medals of every 100 cast come back, at every bet. See the Odds tab for the exact sums.',
    'If you leave or reload the page while a cast is under way, it is finished and paid as the page goes, and shown again when you come back. A cast is never made again.',
    'Your medals are the Medal Game Center’s: every machine there plays with the same medals, and they are reset only at the Medal Game Center.',
    NOT_MONEY.en,
  ],
  oddsIntro: [
    'A cast is a lottery shown through an animation, as on the fishing medal machines in Japanese game centers. Its result is drawn the moment you cast, from the fixed chances below, and nothing you do afterwards changes it. Every chance is the same on every cast, whatever came before.',
  ],
  returnLabel: 'Comes back',
  returnNote: (num, den) => `${num}/${den} of every medal cast, exactly, at every bet`,
  keepsLabel: 'Machine keeps',
  hitLabel: 'A catch',
  noBiteLabel: 'Nothing bites',
  awayLabel: 'Gets away',
  spreadLabel: 'Spread of a cast',
  spreadNote: (casts) => `About ${casts} casts before what comes back is within one point of 90%, 95 times in 100`,
  fishTitle: 'Every fish, every cast',
  fishIntro: 'Each fish’s chance to bite a cast, then its chance to be landed once it has bitten. A catch is both; its share is what it adds to the medals that come back, per medal cast.',
  colBites: 'Bites',
  colLands: 'Landed',
  colCaught: 'Caught a cast',
  colAway: 'Gets away',
  colShare: 'Share',
  total: 'Total',
  chestTitle: 'Inside the treasure chest',
  chestIntro: 'A treasure chest landed opens on one of four prizes, its light running round them and stopping on the one drawn when you cast.',
  colPrize: 'Prize',
  colInChest: 'In a chest',
  colPerCast: 'A cast',
  drawsTitle: 'How a cast is drawn',
  draws: [
    'Three random numbers are drawn the moment you press CAST, always three and in this order.',
    'The first picks what bites: 10,000 equal cells, each fish holding as many as its chance (Bubble Fry 2,100, Moonscale 10), and the 5,735 cells no fish holds are a cast that nothing bites.',
    'The second decides whether the fish that bit is landed: a Bubble Fry 19 times in 20, Moonscale once in 8.',
    'The third is the treasure chest’s prize, out of 20 equal cells, used only when a chest is landed.',
  ],
  realTitle: 'Like the real machines',
  real: [
    'Real fishing medal machines show fish as shadows whose size hints at what they are, reveal a fish only once it bites, pay more for the bigger fish, and save a giant fish for the climax. Their rod modes multiply both what a cast takes and what it gives, as the 1, 3 and 5 here do.',
    'Shops set how much a medal machine gives back; about 85% to 95% is usual, and none is set to give back more than is played. This machine gives back exactly 90%, and its chances are published here, which real machines’ are not.',
  ],
  simTitle: 'Try it many times',
  simIntro: 'Plays many sessions at once, each of the same number of 1-medal casts, every cast drawn as the machine draws it, and shows how they ended.',
  simCasts: 'Casts per session',
  simSessions: 'Sessions',
  simRun: 'Play them',
  simRunning: 'Playing…',
  simExpected: (net) => `Expected: ${net} medals per session, exactly.`,
  simResult: (mean, ahead, rtp, lords) => `Played: ${mean} medals per session on average; ${ahead} of the sessions ended ahead; ${rtp} came back; ${lords} landed Moonscale.`,
  simChart: 'How the sessions ended: medals behind (left) or ahead (right)',
  simBehind: 'behind',
  simAhead: 'ahead',
};

const ja: FishingStrings = {
  title: '大漁ハーバー',
  subtitle: 'メダルゲームセンターの釣りのメダルゲーム。1投1・3・5枚でキャストし、食いついた魚を釣り上げます。メダル100枚につきちょうど90枚が戻る理由も確かめられます。',
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  sign: 'BIG CATCH HARBOR',
  signSub: '大漁ハーバー',
  fishNames: {
    fry: 'あぶくっこ',
    goby: 'こいしハゼ',
    sardine: 'なみイワシ',
    bream: 'リボンダイ',
    squid: 'ちょうちんイカ',
    tuna: 'いかずちマグロ',
    marlin: 'みかづきカジキ',
    chest: '宝箱',
    lord: '港のヌシ ツキウロコ',
  },
  shadowNames: { small: '小', medium: '中', large: '大', chest: 'キラリ', lord: '特大' },
  pondLabel: (step) => `港の水面：${step}`,
  pondIdle: '魚がキャストを待って泳いでいます',
  steps: {
    flight: 'キャスト！',
    warning: '警告！港のヌシが近づいてくる！',
    wait: 'アタリ待ち…',
    hooked: 'ヒット！',
    fight: '巻け！',
    chest: '宝箱だ！中身は…？',
  },
  landed: (fish, multiple, medals) => `GET！${fish} ×${multiple}で${medals.toLocaleString('ja-JP')}枚`,
  chestLanded: (multiple, medals) => `宝箱 ×${multiple}で${medals.toLocaleString('ja-JP')}枚！`,
  away: (fish) => `${fish}に逃げられた…`,
  lordComing: '港のヌシが近づいてくる！',
  nothing: '今回はアタリなし。',
  attract: 'キャストでスタート',
  attractSub: '魚が集まってきた！',
  get: 'GET！',
  medals: '持ちメダル',
  bet: 'ベット',
  win: '獲得',
  betGroup: '1投のメダル',
  betAria: (bet) => `1投${bet}枚`,
  betUnit: '1投',
  cast: 'キャスト',
  reel: '巻く',
  skip: 'スキップ',
  reelNote: 'リールを巻くと演出が早く進むだけです。結果はキャストした瞬間に決まっています。',
  keysHint: 'キー：Space か Enter でキャスト／巻く・1／3／5 でベット・S でスキップ',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  outOfMedals: '持ちメダルがなくなりました。',
  notEnough: (bet) => `持ちメダルが足りないので${bet}枚ではキャストできません。ベットを減らしてください。`,
  cardAway: 'メダルは別のタブのマシンで遊ばれています。このマシンはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  resumed: '途中だったキャストを最後まで見せました。',
  sayCast: (bet) => `${bet}枚でキャスト。`,
  sayHooked: 'アタリ！',
  sayRefill: (medals) => `店員さんがメダルを${medals}枚持ってきました。`,
  sayRestart: 'メダルゲームセンターでメダルがリセットされたので、このマシンも最初からになりました。',
  notMoney: NOT_MONEY.ja,
  centerNote: 'このメダルはメダルゲームセンターの持ちメダルで、センターのどのマシンでも同じです。デイリーボーナスとリセットはセンターの入口ページにあります。',
  centerNoteLink: 'メダルゲームセンターへ',
  boardTitle: '魚図鑑',
  boardNote: '釣れたときにもらえるのは、1投のメダルの何倍か。水中の魚影の大きさで、小・中・大の魚が見分けられます。',
  colFish: '魚',
  colShadow: '魚影',
  colPays: '倍率',
  colMedals: (bet) => `${bet}枚ベット`,
  chestPays: '×10〜\u200b×200',
  sessionTitle: '今回のプレイ',
  casts: 'キャスト数',
  played: '使ったメダル',
  won: 'もらったメダル',
  net: '差し引き',
  catches: '釣れた回数',
  biggest: '最大の獲得',
  cameBack: '戻った割合',
  machineReturn: 'マシンの還元率',
  recentTitle: '最近のキャスト',
  recentNothing: 'アタリなし',
  recentAway: 'バラシ',
  infoBody: (top) => [
    '1投のメダルを1・3・5枚から選びます（1・3・5キー）。釣れた魚の倍率に、この枚数をかけたメダルがもらえます。選んだら「キャスト」（Space か Enter）。',
    'ウキが飛んでいき、魚影が泳いできます。食いつくとウキが沈んで「ヒット！」。魚影の小・中・大は魚の大きさ、キラリと光る影は宝箱、特大の影は港のヌシ、ツキウロコです。',
    `釣り上げると、あぶくっこの×1からみかづきカジキの×50まで、魚ごとの倍率がもらえます。宝箱は×10・×20・×50・×200のどれかが当たり、ツキウロコは×300。5枚のキャストなら${top.toLocaleString('ja-JP')}枚です。大きな魚ほど手強く、逃げられることも多くなります。`,
    'キャストで何が食いつくか、釣り上げられるか、宝箱の中身は、どれも「キャスト」を押した瞬間に「確率」タブの確率で決まります。「巻く」（Space）は演出を先に進めるだけ、「スキップ」（S）は最後まで飛ばすだけで、結果は変わりません。',
    '平均すると、どのベットでも、使ったメダル100枚につきちょうど90枚が戻ってきます。正確な計算は「確率」タブにあります。',
    'キャストの途中でページを閉じたり読み込み直したりしても、そのキャストはページを離れるときに最後まで決まって支払われ、戻ってきたときにもう一度見られます。キャストがやり直しになることはありません。',
    '持ちメダルはメダルゲームセンターのものです。どのマシンでも同じメダルで遊び、リセットはメダルゲームセンターでだけできます。',
    NOT_MONEY.ja,
  ],
  oddsIntro: [
    'ゲームセンターの釣りのメダルゲームと同じように、キャストは演出つきの抽選です。結果はキャストした瞬間に下の決まった確率で抽選され、その後の操作では変わりません。どの確率も毎回同じで、それまでの結果には左右されません。',
  ],
  returnLabel: '戻る割合',
  returnNote: (num, den) => `使ったメダルのちょうど${num}/${den}。どのベットでも同じ`,
  keepsLabel: 'マシンに残る割合',
  hitLabel: '釣れる',
  noBiteLabel: 'アタリなし',
  awayLabel: '逃げられる',
  spreadLabel: '1投のばらつき',
  spreadNote: (casts) => `戻る割合が90%の前後1ポイントに収まる（100回中95回）まで約${casts}投`,
  fishTitle: '魚ごとの確率（1投あたり）',
  fishIntro: '魚ごとに、キャストに食いつく確率と、食いついたあと釣り上げられる確率です。両方そろうと「釣れる」。「寄与」は、使ったメダル1枚あたりに戻るメダルのうち、その魚の分です。',
  colBites: '食いつく',
  colLands: '釣り上げ',
  colCaught: '1投で釣れる',
  colAway: '逃げられる',
  colShare: '寄与',
  total: '合計',
  chestTitle: '宝箱の中身',
  chestIntro: '釣り上げた宝箱は4つの当たりのどれかで開きます。光が当たりの上を回って、キャストしたときに決まった当たりで止まります。',
  colPrize: '当たり',
  colInChest: '宝箱の中で',
  colPerCast: '1投あたり',
  drawsTitle: 'キャストの抽選のしかた',
  draws: [
    '「キャスト」を押した瞬間に、乱数を3つ、いつもこの順番で引きます。',
    '1つ目で食いつくものが決まります。10,000個の同じ大きさのマスを、魚がそれぞれの確率の数ずつ持っています（あぶくっこは2,100、ツキウロコは10）。どの魚も持っていない5,735マスはアタリなしです。',
    '2つ目で、食いついた魚を釣り上げられるかが決まります。あぶくっこは20回に19回、ツキウロコは8回に1回です。',
    '3つ目は宝箱の当たりで、20個の同じ大きさのマスから決まります。宝箱を釣り上げたときだけ使います。',
  ],
  realTitle: '本物のマシンと同じところ',
  real: [
    '本物の釣りのメダルゲームでは、魚は大きさで正体がわかる魚影で泳ぎ、食いついて初めて正体がわかります。大きな魚ほどメダルが多く、最後の山場には巨大な魚が出てきます。ロッドのモードで、1投に使うメダルともらえるメダルが一緒に何倍にもなります。ここの1・3・5枚も同じです。',
    'メダルゲームがどれだけ戻すかはお店が設定し、85%〜95%くらいがふつうで、入れたより多く戻す設定にはなりません。このマシンはちょうど90%を戻し、確率もここで公開しています。本物のマシンの確率は公開されていません。',
  ],
  simTitle: 'たくさん試す',
  simIntro: '1投1枚のキャストを同じ回数ずつ行うプレイを一度にたくさん行い、どう終わったかを表示します。どのキャストもマシンと同じ抽選です。',
  simCasts: '1回のプレイのキャスト数',
  simSessions: 'プレイ回数',
  simRun: '試す',
  simRunning: '試しています…',
  simExpected: (net) => `期待値：1回のプレイあたり${net}枚（正確な値）`,
  simResult: (mean, ahead, rtp, lords) => `結果：1回のプレイあたり平均${mean}枚。増えて終わったプレイは${ahead}、戻った割合は${rtp}。ツキウロコを釣ったプレイは${lords}。`,
  simChart: 'プレイの終わり方：減った枚数（左）と増えた枚数（右）',
  simBehind: '減った',
  simAhead: '増えた',
};

export const getStrings = (language: GameLanguage): FishingStrings => (language === 'ja' ? ja : en);
