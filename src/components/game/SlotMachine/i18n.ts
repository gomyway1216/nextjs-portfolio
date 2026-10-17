/**
 * Local ja/en strings for the slot machine, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import type { PayRuleId, SymbolId } from './engine';

export interface SlotStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabOdds: string;
  tabSim: string;
  howToPlay: string;
  infoBody: (rtp: string) => string[];
  symbolName: Record<SymbolId, string>;
  ruleName: Record<PayRuleId, string>;
  // The medal center
  /** The link back to the medal center's front, above the title. */
  centerLink: string;
  /** Shown near the medal counter and in the help: medals are not money. */
  notMoney: string;
  centerNote: string;
  centerNoteLink: string;
  noticeTitle: string;
  noticeBody: string;
  noticeLink: string;
  noticeDismiss: string;
  cardAway: string;
  playHere: string;
  refill: (medals: number) => string;
  sayRefill: (medals: number) => string;
  sayRestart: string;
  resumed: string;
  // Play
  medals: string;
  bet: string;
  win: string;
  spin: string;
  spinning: string;
  auto: (n: number) => string;
  stopAuto: string;
  lever: string;
  betAria: (n: number) => string;
  reelsIdle: string;
  /** Screen-reader summary of the payline after a spin. */
  reelsResult: (symbols: string[]) => string;
  resultWin: (medals: number, rule: string) => string;
  resultLose: string;
  outOfMedals: string;
  notEnough: (bet: number) => string;
  sessionTitle: string;
  spins: string;
  wagered: string;
  paidOut: string;
  net: string;
  observedRtp: string;
  theoreticalRtp: string;
  hits: string;
  biggestWin: string;
  nearMisses: string;
  nearMissHint: string;
  rtpGapNote: (spins: number, needed: string) => string;
  paytable: string;
  /** The paytable's columns: the line, and what it wins at each bet. */
  payColLine: string;
  payColBet: (bet: number) => string;
  recentSpins: string;
  // Odds
  oddsIntro: string[];
  rtp: string;
  houseEdge: string;
  hitFrequency: string;
  volatility: string;
  volatilityNote: string;
  jackpotOdds: string;
  spinsForOnePercent: string;
  spinsForOnePercentNote: string;
  combination: string;
  pays: string;
  ways: string;
  probability: string;
  oneIn: string;
  /** Column: percentage points of RTP each rule returns (they sum to the RTP). */
  rtpContribution: string;
  total: string;
  exactFraction: (num: string, den: string) => string;
  virtualReelTitle: string;
  virtualReelIntro: string[];
  reelLabel: (n: number) => string;
  stopWeight: (w: number) => string;
  sevenOnLine: string;
  sevenBesideLine: string;
  jackpotNearMiss: string;
  nearMissRatio: (ratio: string) => string;
  uniformComparison: (jackpot: string, ratio: string) => string;
  // Sim
  convergenceTitle: string;
  convergenceIntro: string;
  spinsLabel: string;
  run: string;
  running: (pct: number) => string;
  observedAfter: (spins: string, observed: string, band: string) => string;
  band: string;
  sessionsTitle: string;
  sessionsIntro: string;
  bankrollLabel: string;
  betLabel: string;
  spinsPerSession: string;
  sessionsLabel: string;
  bustRate: string;
  aheadRate: string;
  medianFinal: string;
  meanFinal: string;
  expectedFinal: string;
  expectedFinalNote: (edge: string) => string;
  finalDist: string;
  sampleSession: string;
  spinsAxis: string;
}

const EN: SlotStrings = {
  title: 'Slot Machine',
  subtitle:
    'A classic 3-reel, one-line slot with real "virtual reel" odds. Play it, then see the exact probability of every win, the return to player, and why short sessions swing so wildly.',
  tabPlay: 'Play',
  tabOdds: 'Exact odds',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: (rtp) => [
    'Choose how many medals to bet — 1, 2 or 3, as on a Japanese medal slot — and press SPIN (or pull the lever). Only the middle row — the payline — pays: the paytable’s number times the medals bet. Cherries pay from the left reel: one cherry on reel 1, two on reels 1–2, or three.',
    'Every spin picks one of 64 "virtual stops" per reel, so there are exactly 64³ = 262,144 equally likely outcomes. That makes every probability on the Exact odds tab a precise count, not an estimate.',
    `In the long run the machine gives back ${rtp} of the medals bet on it, whatever the bet. The Simulation tab shows how slowly real results approach that number — and how often a session ends behind.`,
    'You play with your medals from the Medal Game Center: the same medals as every machine there. Run out and the attendant brings a free cupful of 100. The daily bonus and the one reset are on the Medal Game Center’s front page.',
    NOT_MONEY.en,
  ],
  symbolName: { seven: '7', bar: 'BAR', bell: 'Bell', plum: 'Plum', cherry: 'Cherry', blank: 'Blank' },
  ruleName: {
    seven3: 'Three 7s',
    bar3: 'Three BARs',
    bell3: 'Three bells',
    plum3: 'Three plums',
    cherry3: 'Three cherries',
    cherry2: 'Two cherries',
    cherry1: 'One cherry',
  },
  centerLink: 'Medal Game Center',
  notMoney: NOT_MONEY.en,
  centerNote: 'These are your medals from the Medal Game Center, shared by every machine there. The daily bonus and the reset are on its front page.',
  centerNoteLink: 'Go to the Medal Game Center',
  noticeTitle: 'Now on the medal floor',
  noticeBody:
    'This slot machine now plays with your medals from the Medal Game Center — the same medals as every other machine there. Its old separate count, which started at 500, is retired. Everything else, the session statistics included, works as before.',
  noticeLink: 'See your medals at the Medal Game Center',
  noticeDismiss: 'Got it',
  cardAway: 'Your medals are being played on a machine in another tab. This slot machine waits where it is.',
  playHere: 'Play here',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `The attendant brought ${medals} medals.`,
  sayRestart: 'Your medals were reset at the Medal Game Center: this machine has started over.',
  resumed: 'The spin left under way has been finished.',
  medals: 'Medals',
  bet: 'Bet',
  win: 'Win',
  spin: 'SPIN',
  spinning: 'Spinning…',
  auto: (n) => `Auto ×${n}`,
  stopAuto: 'Stop auto',
  lever: 'Pull the lever to spin',
  betAria: (n) => `BET ${n} ${n === 1 ? 'medal' : 'medals'}`,
  reelsIdle: 'Slot machine reels',
  reelsResult: (symbols) => `Payline: ${symbols.join(', ')}`,
  resultWin: (medals, rule) => `${rule} — won ${medals} ${medals === 1 ? 'medal' : 'medals'}!`,
  resultLose: 'No win',
  outOfMedals: 'You have no medals left.',
  notEnough: (bet) => `Not enough medals to bet ${bet} — choose a smaller bet.`,
  sessionTitle: 'This session',
  spins: 'Spins',
  wagered: 'Medals bet',
  paidOut: 'Medals won',
  net: 'Net medals',
  observedRtp: 'Your return',
  theoreticalRtp: 'Theoretical return',
  hits: 'Winning spins',
  biggestWin: 'Biggest win',
  nearMisses: '7-7 near misses',
  nearMissHint: 'Spins where reels 1–2 showed 7s and reel 3 had a 7 just above or below the line.',
  rtpGapNote: (spins, needed) =>
    `After ${spins} ${spins === 1 ? 'spin' : 'spins'} your return can be far from the theory: it takes about ${needed} spins for it to settle within ±1 point.`,
  paytable: 'Paytable (medals won)',
  payColLine: 'Line',
  payColBet: (bet) => `BET ${bet}`,
  recentSpins: 'Recent spins',
  oddsIntro: [
    'Each reel has 22 physical stops, but the random number generator picks one of 64 virtual stops that map onto them. Counting every combination of virtual stops (64³ = 262,144) gives the exact odds below.',
  ],
  rtp: 'Return to player',
  houseEdge: 'House edge',
  hitFrequency: 'Hit frequency',
  volatility: 'Volatility (σ)',
  volatilityNote: 'Standard deviation of one spin, in bets. Roulette’s red/black is about 1.0.',
  jackpotOdds: 'Jackpot (7-7-7)',
  spinsForOnePercent: 'Spins to trust the RTP',
  spinsForOnePercentNote: 'Spins before your observed return is within ±1 point of the RTP 95% of the time.',
  combination: 'Combination',
  pays: 'Pays',
  ways: 'Ways (of 262,144)',
  probability: 'Probability',
  oneIn: '1 in',
  rtpContribution: 'Contribution to RTP',
  total: 'All wins',
  exactFraction: (num, den) => `${num} ÷ ${den}`,
  virtualReelTitle: 'Virtual reels and the near miss',
  virtualReelIntro: [
    'Bar length is how many of the 64 virtual stops land on each physical stop. The 7 owns a single virtual stop, but the blanks right above and below it own six each.',
    'So a 7 shows just off the payline twelve times as often as on it. The "almost jackpot" you keep seeing is designed in — it does not mean a jackpot is due.',
  ],
  reelLabel: (n) => `Reel ${n}`,
  stopWeight: (w) => `${w} of 64 virtual stops`,
  sevenOnLine: '7 on the payline (each reel)',
  sevenBesideLine: '7 just above or below the payline',
  jackpotNearMiss: '7-7 and a 7 just off the line',
  nearMissRatio: (ratio) => `${ratio}× as often as the jackpot`,
  uniformComparison: (jackpot, ratio) =>
    `If all 22 physical stops were equally likely, the jackpot would be 1 in ${jackpot} and this near miss only ${ratio}× as common.`,
  convergenceTitle: 'How fast does the return converge?',
  convergenceIntro:
    'Bet one medal a spin for many spins and track your observed return. The shaded band is where 95% of players would be after that many spins.',
  spinsLabel: 'Number of spins',
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  observedAfter: (spins, observed, band) => `After ${spins} spins the observed return was ${observed} (95% band ${band}).`,
  band: '95% band',
  sessionsTitle: 'What happens in a real session?',
  sessionsIntro:
    'Simulate many players who each sit down with the same number of medals and bet the same every spin, until they run out of spins or medals.',
  bankrollLabel: 'Starting medals',
  betLabel: 'Medals bet per spin',
  spinsPerSession: 'Spins per session',
  sessionsLabel: 'Players (sessions)',
  bustRate: 'Ran out of medals',
  aheadRate: 'Finished ahead',
  medianFinal: 'Median medals left',
  meanFinal: 'Mean medals left',
  expectedFinal: 'Expected medals left',
  expectedFinalNote: (edge) => `Starting medals minus the house edge on every medal bet (spins actually played × medals bet × ${edge}).`,
  finalDist: 'Distribution of medals left',
  sampleSession: 'One sample session',
  spinsAxis: 'spins',
};

const JA: SlotStrings = {
  title: 'スロットマシン',
  subtitle:
    '本物と同じ「バーチャルリール」方式の 3 リール・1 ラインのスロット。遊んだあとで、各役の正確な確率・還元率（RTP）と、短期の持ちメダルがなぜ大きく増減するのかを確かめられます。',
  tabPlay: '遊ぶ',
  tabOdds: '正確な確率',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: (rtp) => [
    'ベットするメダルの枚数（日本のメダルスロットと同じく 1〜3 枚）を選んで SPIN を押す（またはレバーを引く）と回ります。当たりは中段のペイラインだけで、配当表の数 × ベット枚数のメダルを獲得します。チェリーは左のリールから数えます（1 リール目に 1 つ、1〜2 リール目に 2 つ、または 3 つ）。',
    '各リールは 64 個の「バーチャルストップ」から 1 つを選ぶので、1 回の結果はちょうど 64³ = 262,144 通りで、すべて同じ確率です。そのため「正確な確率」タブの数字は推定ではなく、数え上げた厳密値です。',
    `この台は長期的に、ベットしたメダルの ${rtp} を返します（ベット枚数によらず同じです）。「シミュレーション」タブでは、実際の結果がその値にどれほどゆっくり近づくか、そして何割のセッションが減って終わるかを確かめられます。`,
    'メダルゲームセンターの持ちメダルで遊びます。センターのどのマシンとも同じメダルです。メダルがなくなったら、店員さんが 100 枚を無料で持ってきます。デイリーボーナスとリセットは、メダルゲームセンターの入口ページにあります。',
    NOT_MONEY.ja,
  ],
  symbolName: { seven: '7', bar: 'BAR', bell: 'ベル', plum: 'プラム', cherry: 'チェリー', blank: '空白' },
  ruleName: {
    seven3: '7 揃い',
    bar3: 'BAR 揃い',
    bell3: 'ベル揃い',
    plum3: 'プラム揃い',
    cherry3: 'チェリー 3 つ',
    cherry2: 'チェリー 2 つ',
    cherry1: 'チェリー 1 つ',
  },
  centerLink: 'メダルゲームセンター',
  notMoney: NOT_MONEY.ja,
  centerNote: 'このメダルはメダルゲームセンターの持ちメダルで、センターのどのマシンでも同じです。デイリーボーナスとリセットはセンターの入口ページにあります。',
  centerNoteLink: 'メダルゲームセンターへ',
  noticeTitle: 'メダルフロアに登場',
  noticeBody:
    'このスロットマシンは、メダルゲームセンターの持ちメダルで遊ぶようになりました。センターのほかのマシンと同じメダルです。以前の、500 から始まるこの台だけの数はなくなりました。セッションの統計など、ほかはこれまでどおりです。',
  noticeLink: 'メダルゲームセンターで持ちメダルを見る',
  noticeDismiss: 'OK',
  cardAway: 'メダルは別のタブのマシンで遊ばれています。このスロットマシンはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `店員さんがメダルを${medals}枚持ってきました。`,
  sayRestart: 'メダルゲームセンターでメダルがリセットされたので、この台も最初からになりました。',
  resumed: '途中だったスピンを最後まで回しました。',
  medals: '持ちメダル',
  bet: 'ベット',
  win: '獲得',
  spin: 'SPIN',
  spinning: '回転中…',
  auto: (n) => `オート ×${n}`,
  stopAuto: 'オート停止',
  lever: 'レバーを引いて回す',
  betAria: (n) => `${n}枚ベット`,
  reelsIdle: 'スロットのリール',
  reelsResult: (symbols) => `ペイライン: ${symbols.join('、')}`,
  resultWin: (medals, rule) => `${rule} — ${medals}枚獲得！`,
  resultLose: 'ハズレ',
  outOfMedals: '持ちメダルがありません。',
  notEnough: (bet) => `${bet}枚ベットするにはメダルが足りません。ベット枚数を減らしてください。`,
  sessionTitle: 'このセッション',
  spins: 'スピン数',
  wagered: 'ベット枚数',
  paidOut: '獲得枚数',
  net: '差枚数',
  observedRtp: 'あなたの還元率',
  theoreticalRtp: '理論上の還元率',
  hits: '当たり回数',
  biggestWin: '最高獲得',
  nearMisses: '7-7 のニアミス',
  nearMissHint: '1〜2 リール目に 7 が揃い、3 リール目の 7 がペイラインのすぐ上か下で止まった回数。',
  rtpGapNote: (spins, needed) =>
    `${spins} 回ではあなたの還元率は理論値から大きくズレることがあります。±1 ポイント以内に収まるには約 ${needed} 回のスピンが必要です。`,
  paytable: '配当表（獲得枚数）',
  payColLine: '役',
  payColBet: (bet) => `${bet}枚`,
  recentSpins: '最近のスピン',
  oddsIntro: [
    '各リールの物理的なコマは 22 個ですが、乱数は 64 個のバーチャルストップから 1 つを選び、それが物理的なコマに対応します。バーチャルストップの組み合わせ（64³ = 262,144 通り）をすべて数えると、下の厳密な確率になります。',
  ],
  rtp: '還元率（RTP）',
  houseEdge: 'ハウスエッジ',
  hitFrequency: '当選確率',
  volatility: 'ボラティリティ（σ）',
  volatilityNote: '1 スピンの標準偏差（ベット単位）。ルーレットの赤/黒は約 1.0。',
  jackpotOdds: 'ジャックポット（7-7-7）',
  spinsForOnePercent: 'RTP を信頼できるスピン数',
  spinsForOnePercentNote: '実際の還元率が 95% の確率で RTP の ±1 ポイント以内に入るまでのスピン数。',
  combination: '組み合わせ',
  pays: '配当',
  ways: '通り数（262,144 中）',
  probability: '確率',
  oneIn: '1 /',
  rtpContribution: 'RTP への寄与',
  total: '当たり合計',
  exactFraction: (num, den) => `${num} ÷ ${den}`,
  virtualReelTitle: 'バーチャルリールとニアミス',
  virtualReelIntro: [
    'バーの長さは、64 個のバーチャルストップのうち何個がその物理コマに対応するかです。7 は 1 個しかありませんが、7 のすぐ上下の空白はそれぞれ 6 個あります。',
    'そのため 7 はペイライン上より、すぐ上下に止まる方が 12 倍多くなります。何度も見る「惜しい！」は設計されたもので、ジャックポットが近いという意味ではありません。',
  ],
  reelLabel: (n) => `リール ${n}`,
  stopWeight: (w) => `64 中 ${w} バーチャルストップ`,
  sevenOnLine: '7 がペイライン上（各リール）',
  sevenBesideLine: '7 がペイラインのすぐ上下',
  jackpotNearMiss: '7-7 で 3 本目の 7 がラインのすぐ外',
  nearMissRatio: (ratio) => `ジャックポットの ${ratio} 倍の頻度`,
  uniformComparison: (jackpot, ratio) =>
    `22 個の物理コマがすべて同じ確率なら、ジャックポットは 1 / ${jackpot}、このニアミスは ${ratio} 倍にとどまります。`,
  convergenceTitle: '還元率はどれくらいで収束する？',
  convergenceIntro:
    '毎回 1 枚ずつベットし続け、実際の還元率を追います。網掛けは、そのスピン数で 95% のプレイヤーが入る範囲です。',
  spinsLabel: 'スピン数',
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  observedAfter: (spins, observed, band) => `${spins} 回後の実際の還元率は ${observed}（95% 範囲 ${band}）でした。`,
  band: '95% 範囲',
  sessionsTitle: '実際の 1 回の遊びでは？',
  sessionsIntro:
    '同じ枚数の持ちメダルで座った大勢のプレイヤーが、毎回同じ枚数をベットし、スピン数かメダルが尽きるまで遊んだ結果をシミュレーションします。',
  bankrollLabel: '最初の持ちメダル',
  betLabel: '1 スピンのベット枚数',
  spinsPerSession: '1 セッションのスピン数',
  sessionsLabel: 'プレイヤー数（セッション）',
  bustRate: 'メダルが尽きた',
  aheadRate: '増えて終わった',
  medianFinal: '最後の持ちメダル 中央値',
  meanFinal: '最後の持ちメダル 平均',
  expectedFinal: '最後の持ちメダル 期待値',
  expectedFinalNote: (edge) => `最初の持ちメダルから、ベットした総枚数（実際のスピン数 × ベット枚数）× ハウスエッジ ${edge} を引いた値。`,
  finalDist: '最後の持ちメダルの分布',
  sampleSession: 'サンプル 1 セッション',
  spinsAxis: 'スピン',
};

export function getStrings(lang: GameLanguage): SlotStrings {
  return lang === 'ja' ? JA : EN;
}
