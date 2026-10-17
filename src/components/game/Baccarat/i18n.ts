/**
 * Local ja/en strings for baccarat, consumed via useGameLanguage().
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import type { OddsBet } from './analysis';
import type { BetId, Mode, Outcome, Side, Winner } from './engine';
import type { PatternId } from './sim';

export interface BaccaratStrings {
  title: string;
  subtitle: string;
  tabPlay: string;
  tabOdds: string;
  tabSim: string;
  howToPlay: string;
  infoBody: string[];
  betName: Record<BetId, string>;
  side: Record<Side, string>;
  // Play
  /** The medal counter: its LED windows, and the counts in type beside them. */
  medalsLed: string;
  betLed: string;
  winLed: string;
  medalsHeld: (medals: string) => string;
  medalsOnTable: (medals: string) => string;
  medalsWon: (medals: string) => string;
  medalsWaiting: string;
  /** Shown near the counter, and in the help: medals are not money (the Medal Game Center's own words, NOT_MONEY). */
  notMoney: string;
  medalsFrom: string;
  centerLink: string;
  noticeTitle: string;
  noticeBody: string;
  noticeOk: string;
  cardAway: string;
  playHere: string;
  refill: (medals: number) => string;
  sayRestart: string;
  sayResumed: (medals: number) => string;
  betButtons: string;
  betButtonAria: (medals: number) => string;
  deal: string;
  dealing: string;
  undo: string;
  clear: string;
  rebet: string;
  /** The table's keys, on a desktop. */
  keysHint: string;
  tableMode: string;
  modeName: Record<Mode, string>;
  modeLocked: string;
  bankerPays: (mode: Mode) => string;
  betAria: (name: string, pays: string) => string;
  noMedals: string;
  notKept: string;
  spotMax: (name: string, most: number) => string;
  bankerStep: (step: number) => string;
  placeBets: string;
  natural: string;
  result: (winner: Winner, playerTotal: number, bankerTotal: number, natural: boolean) => string;
  dragon7Hit: string;
  panda8Hit: string;
  handAria: (side: string, total: number | null) => string;
  handResults: string;
  noBetsHand: string;
  outcome: Record<Outcome, string>;
  shoeLabel: (n: number) => string;
  handInShoe: (n: number) => string;
  cardsLeft: (n: number) => string;
  burnInfo: (card: string, burned: number) => string;
  cutCardOut: string;
  shoeWaiting: string;
  beadPlate: string;
  bigRoad: string;
  roadLetter: Record<Winner, string>;
  roadAria: (name: string, banker: number, player: number, tie: number) => string;
  roadNote: string;
  statsTitle: string;
  hands: string;
  observedVsExact: string;
  pairs: string;
  naturals: string;
  liveTitle: string;
  liveNote: (unseen: number) => string;
  liveFresh: string;
  colBet: string;
  colWin: string;
  colEdge: string;
  playerEdge: string;
  hint: string[];
  // Odds
  oddsIntro: string;
  decksLabel: string;
  deckOption: (n: number) => string;
  outcomeTitle: string;
  outcomeName: Record<Winner, string>;
  colOutcome: string;
  colProbability: string;
  colWays: string;
  colNoTie: string;
  outcomeNote: (total: string) => string;
  edgeTitle: string;
  oddsBetName: Record<OddsBet, string>;
  colPays: string;
  colPush: string;
  colHouseEdge: string;
  edgeNote: string;
  tableauTitle: string;
  tableauIntro: string;
  colBankerTotal: string;
  playerStood: string;
  playerThird: string;
  drawShort: string;
  standShort: string;
  drawLong: string;
  standLong: string;
  whyTitle: string;
  whyBody: string;
  statNatural: string;
  statPlayerDraws: string;
  statBankerDraws: string;
  statCardsPerHand: string;
  statHandsPerShoe: string;
  decksTitle: string;
  decksIntro: string;
  colDecks: string;
  pairTitle: string;
  pairBody: (decks: number, fraction: string, pct: string, edge: string) => string;
  // Simulation
  run: string;
  running: (pct: number) => string;
  handsLabel: string;
  shoesLabel: string;
  linesTitle: string;
  linesIntro: string;
  colSimulated: (hands: string) => string;
  colExact: string;
  linesNote: string;
  patternsTitle: string;
  patternsIntro: string;
  patternName: Record<PatternId, string>;
  colStrategy: string;
  colBets: string;
  colOnBanker: string;
  colExpected: string;
  patternsNote: string;
  streakTitle: string;
  streakAxis: string;
  streakNote: (shoes: string, mean: string, eightPlus: string) => string;
  countingTitle: string;
  countingIntro: string;
  colFavorable: string;
  colAvgEdge: string;
  colGainPerShoe: string;
  colRealized: string;
  countingNote: (shoes: string, hands: string) => string;
  sampleShoeTitle: string;
  sampleShoeAxis: string;
  sampleShoeNote: string;
}

const en: BaccaratStrings = {
  title: 'Baccarat',
  subtitle:
    'Punto Banco from an eight-deck shoe. Bet on Player, Banker or a Tie, follow the scoreboards, and see the exact odds of the next hand from the cards still in the shoe.',
  tabPlay: 'Table',
  tabOdds: 'Odds',
  tabSim: 'Simulation',
  howToPlay: 'How to play',
  infoBody: [
    'Put medals on Player, Banker, Tie or the side bets with the BET buttons, then press DEAL. The medals on the felt are taken from your medals when the cards are dealt, and what a bet wins comes back to them when the hand is over. Two hands of two cards are dealt; the hand closer to 9 wins.',
    'Cards are worth their face value, aces 1, tens and faces 0, and only the last digit counts: 7 + 8 = 15 counts as 5.',
    'Nobody makes decisions — a fixed chart decides third cards. An 8 or 9 on the first two cards is a “natural” and ends the hand. Otherwise the Player draws on 0–5, and the Banker draws according to its total and the Player’s third card (see the Odds tab).',
    'Player pays 1:1. On the no-commission (EZ) table, where you sit down, Banker pays 1:1 but pushes when it wins with a three-card 7. On the 5% commission table Banker pays 0.95:1, and is bet in 20s so that the 5% is always a whole medal: 20 medals on Banker win 19. Both push on a tie. Tie pays 8:1, pairs 11:1, Dragon 7 40:1 and Panda 8 25:1.',
    'Each press of a BET button puts that many medals on a spot. Player and Banker take up to 100 medals each; the Tie and the side bets up to 20 each.',
    'The shoe holds eight decks. The first card is turned over and that many cards are burned; the cut card near the end marks the last hand before a new shoe.',
  ],
  betName: {
    player: 'Player',
    banker: 'Banker',
    tie: 'Tie',
    playerPair: 'Player Pair',
    bankerPair: 'Banker Pair',
    dragon7: 'Dragon 7',
    panda8: 'Panda 8',
  },
  side: { player: 'Player', banker: 'Banker' },
  medalsLed: 'MEDALS',
  betLed: 'BET',
  winLed: 'WIN',
  medalsHeld: (n) => `${n} medals`,
  medalsOnTable: (n) => `${n} on the table`,
  medalsWon: (n) => `${n} won`,
  medalsWaiting: 'Looking for your medals…',
  notMoney: NOT_MONEY.en,
  medalsFrom: 'These are your medals from the Medal Game Center: every game there plays with the same ones, and they are reset only there.',
  centerLink: 'Medal Game Center',
  noticeTitle: 'Baccarat now plays with your medals',
  noticeBody:
    'This table now takes its bets from your medals at the Medal Game Center, the same medals every game there plays with. The old practice chips are gone: they were never medals, and they are not turned into medals.',
  noticeOk: 'Got it',
  cardAway: 'Your medals are being played in another tab. This table waits here.',
  playHere: 'Play here',
  refill: (n) => `Out of medals — take ${n} more`,
  sayRestart: 'Your medals were reset at the Medal Game Center, so this table starts over with a new shoe.',
  sayResumed: (n) => `The hand dealt before this page closed has been finished: ${n} medals came back.`,
  betButtons: 'BET',
  betButtonAria: (n) => `Bet ${n} ${n === 1 ? 'medal' : 'medals'} a press`,
  deal: 'DEAL',
  dealing: 'Dealing…',
  undo: 'Undo',
  clear: 'Clear',
  rebet: 'Rebet',
  keysHint: 'Keys: Space or Enter deals · P Player · B Banker · T Tie · R rebet · U undo',
  tableMode: 'Table',
  modeName: { commission: '5% commission', ez: 'No commission (EZ)' },
  modeLocked: 'Take your bets down to switch tables.',
  bankerPays: (mode) => (mode === 'ez' ? '1:1 · 3-card 7 pushes' : '0.95:1 · in 20s'),
  betAria: (name, pays) => `${name} (${pays})`,
  noMedals: 'Not enough medals for that bet.',
  notKept: 'This browser is not saving anything just now, so no hand can be dealt with your medals.',
  spotMax: (name, most) => `${name} takes up to ${most} medals.`,
  bankerStep: (step) => `On the 5% table the Banker is bet in ${step}s, so its 5% is a whole medal.`,
  placeBets: 'Place your bets, then deal.',
  natural: 'Natural',
  result: (winner, p, b, natural) => {
    const nat = natural ? 'Natural — ' : '';
    if (winner === 'tie') return `${nat}Tie, ${p} to ${b}`;
    return winner === 'player' ? `${nat}Player wins, ${p} to ${b}` : `${nat}Banker wins, ${b} to ${p}`;
  },
  dragon7Hit: 'Dragon 7!',
  panda8Hit: 'Panda 8!',
  handAria: (side, total) => (total === null ? `${side}: no cards` : `${side}: ${total}`),
  handResults: 'This hand',
  noBetsHand: 'No bets this hand.',
  outcome: { win: 'won', lose: 'lost', push: 'push' },
  shoeLabel: (n) => `Shoe #${n}`,
  handInShoe: (n) => `Hand ${n}`,
  cardsLeft: (n) => `${n} cards left`,
  burnInfo: (card, burned) => `Burn card ${card} → ${burned} burned`,
  cutCardOut: 'The cut card is out — that was the last hand of this shoe. The next deal shuffles a new one.',
  shoeWaiting: 'A fresh eight-deck shoe is shuffled on the first deal.',
  beadPlate: 'Bead plate',
  bigRoad: 'Big road',
  roadLetter: { banker: 'B', player: 'P', tie: 'T' },
  roadAria: (name, b, p, t) => `${name}: Banker ${b}, Player ${p}, Tie ${t}`,
  roadNote:
    'Casinos post these boards so players can chase streaks and patterns. Every hand is still a fresh draw from the shoe — the patterns predict nothing.',
  statsTitle: 'This table',
  hands: 'Hands',
  observedVsExact: 'observed · exact',
  pairs: 'Pairs (P / B)',
  naturals: 'Naturals',
  liveTitle: 'Next hand — exact odds',
  liveNote: (n) =>
    `Computed from the ${n} cards you haven’t seen (burned cards count as unseen). The odds drift as the shoe is dealt, but the main bets almost never turn in your favor.`,
  liveFresh: 'Fresh shoe',
  colBet: 'Bet',
  colWin: 'Win',
  colEdge: 'Edge',
  playerEdge: 'in your favor',
  hint: [
    'Banker wins a little more often (45.86% vs 44.62%) because it acts after seeing the Player’s third card; the 5% commission, or on the EZ table the push on a three-card 7, is what keeps it a house game.',
    'Every bet settles each hand. Player and Banker push on a tie.',
    'A pair means the first two cards share a rank (K-K, not K-Q).',
  ],
  oddsIntro:
    'Baccarat has no decisions, so its odds can be computed exactly: enumerate every way the next six cards can come out of the shoe and play each one by the drawing rules. Nothing on this tab is simulated.',
  decksLabel: 'Decks in the shoe',
  deckOption: (n) => (n === 1 ? '1 deck' : `${n} decks`),
  outcomeTitle: 'How often each side wins',
  outcomeName: { banker: 'Banker wins', player: 'Player wins', tie: 'Tie' },
  colOutcome: 'Outcome',
  colProbability: 'Probability',
  colWays: 'Ways',
  colNoTie: 'Ignoring ties',
  outcomeNote: (total) =>
    `Out of all ${total} orderings of the next six cards (a hand that uses fewer cards is counted once for every way the unused cards could fall), so each probability is an exact fraction.`,
  edgeTitle: 'The house edge of every bet',
  oddsBetName: {
    banker: 'Banker (5% commission)',
    bankerEz: 'Banker (EZ, 3-card 7 pushes)',
    player: 'Player',
    tie: 'Tie at 8:1',
    tie9: 'Tie at 9:1',
    pair: 'Player / Banker Pair',
    dragon7: 'Dragon 7 (EZ)',
    panda8: 'Panda 8 (EZ)',
  },
  colPays: 'Pays',
  colPush: 'Push',
  colHouseEdge: 'House edge',
  edgeNote:
    'Edge per hand dealt, counting a push as a bet returned. The commission turns the Banker’s head start into a 1.06% house edge; the EZ table waives it but pushes the 2.25% of hands the Banker wins with a three-card 7 — slightly cheaper at 1.02%. Some casinos pay 9:1 on the Tie, which cuts its edge from 14.4% to 4.8%. At this table every bet wins whole medals and these edges are exact: every EZ bet wins whole medals already, and on the 5% table the Banker is bet in 20s, so 0.95:1 always comes to whole medals (20 win 19).',
  tableauTitle: 'The drawing rules',
  tableauIntro:
    'A natural (8 or 9 on two cards) on either side ends the hand. Otherwise the Player draws on 0–5 and stands on 6–7, then the Banker follows this chart:',
  colBankerTotal: 'Banker total',
  playerStood: 'Player stood',
  playerThird: 'Player’s third card',
  drawShort: 'D',
  standShort: 'S',
  drawLong: 'draws',
  standLong: 'stands',
  whyTitle: 'Why the Banker wins more often',
  whyBody:
    'The Player’s rule ignores the other hand, but the Banker sees the Player’s third card before deciding — standing on 3 against an 8, drawing on 6 against a 6 or 7. That information is worth about 1.2 points of win probability, which the 5% commission takes back.',
  statNatural: 'Natural on the deal',
  statPlayerDraws: 'Player draws a third card',
  statBankerDraws: 'Banker draws a third card',
  statCardsPerHand: 'Cards per hand',
  statHandsPerShoe: 'Hands per shoe (≈)',
  decksTitle: 'Does the number of decks matter?',
  decksIntro:
    'Barely for the main bets. Fewer decks make card removal stronger: the Banker gets a little better, the Tie a little worse — and pairs get much rarer.',
  colDecks: 'Decks',
  pairTitle: 'Pair bets',
  pairBody: (decks, fraction, pct, edge) =>
    `The first two cards of a hand share a rank with probability (4·${decks} − 1)/(52·${decks} − 1) = ${fraction} ≈ ${pct}: the second card must be one of the other ${4 * decks - 1} cards of the first card’s rank. At 11:1 that is a ${edge} house edge.`,
  run: 'Run',
  running: (pct) => `Running… ${pct}%`,
  handsLabel: 'Hands',
  shoesLabel: 'Shoes',
  linesTitle: 'Every bet on the same cards',
  linesIntro:
    'Deals real eight-deck shoes one after another — burn, cut card and reshuffle included — and bets one unit on every line each hand. The dashed lines are the exact edges from the Odds tab.',
  colSimulated: (hands) => `Simulated (${hands} hands)`,
  colExact: 'Exact',
  linesNote:
    'The ± is a 95% range. The 40:1 and 25:1 side bets swing so much that even a million hands only pins them down to about a point.',
  patternsTitle: 'Chasing the road',
  patternsIntro:
    'Casino regulars read the big road: follow a streak, bet the chop, fade a run of three. Each system below bets one unit on Banker or Player from the current shoe’s road (ties skipped, road wiped at each new shoe), all on the same hands.',
  patternName: {
    banker: 'Always Banker',
    player: 'Always Player',
    follow: 'Follow the last winner',
    chop: 'Bet against the last winner',
    streak3: 'After three in a row, bet the other side',
    coin: 'Coin flip',
  },
  colStrategy: 'System',
  colBets: 'Bets',
  colOnBanker: 'On Banker',
  colExpected: 'Expected',
  patternsNote:
    'Every system lands where its mix of bets says it should — the Banker’s 1.06% and the Player’s 1.24%, weighted by how often it chose each. The road decides which side you bet, never the odds of the next hand.',
  streakTitle: 'Longest streak per shoe',
  streakAxis: 'Longest run of one side in the shoe',
  streakNote: (shoes, mean, eightPlus) =>
    `Over ${shoes} complete shoes the longest run averaged ${mean} in a row, and ${eightPlus} of shoes had one of 8 or more. Long streaks are what randomness looks like — not a signal.`,
  countingTitle: 'Counting cards',
  countingIntro:
    'A perfect counter: before every hand it computes each bet’s exact odds from the cards not yet seen — the same calculation as the live panel on the Table tab — and bets one unit only when the bet favors the player.',
  colFavorable: 'Hands in your favor',
  colAvgEdge: 'Average edge then',
  colGainPerShoe: 'Expected gain per shoe',
  colRealized: 'Actually won per shoe',
  countingNote: (shoes, hands) =>
    `${shoes} shoes, ${hands} hands. Banker, Player and Tie almost never turn positive — Thorp and Walden showed in 1966 that the main bets are practically unbeatable. The side bets are another story: Dragon 7 pays 40:1, so a shortage of the right cards late in the shoe swings it by ten points or more. Casinos answer with low limits on side bets and by watching for players who only bet late in the shoe.`,
  sampleShoeTitle: 'Every bet’s edge through one shoe',
  sampleShoeAxis: 'Hand in the shoe',
  sampleShoeNote: 'Above the zero line (shaded) the bet favors the player. The main bets barely move; the side bets wander further the deeper the shoe is dealt.',
};

const ja: BaccaratStrings = {
  title: 'バカラ',
  subtitle:
    '8デッキのシューで遊ぶプント・バンコ。プレイヤー・バンカー・タイに賭けて罫線を追いかけ、シューに残ったカードから次の1回の正確な確率を確認できます。',
  tabPlay: 'テーブル',
  tabOdds: '確率',
  tabSim: 'シミュレーション',
  howToPlay: '遊び方',
  infoBody: [
    '「ベット」ボタンでプレイヤー・バンカー・タイやサイドベットにメダルを置き、「ディール」を押します。置いたメダルはカードが配られるときに持ちメダルから使われ、勝った分は回が終わると持ちメダルに戻ります。2枚ずつ配られ、合計が9に近い方の勝ちです。',
    'カードは数字どおり、Aは1、10と絵札は0と数え、下1桁だけを使います（7＋8＝15は5）。',
    '判断は一切ありません。3枚目は決まった表で決まります。最初の2枚で8か9なら「ナチュラル」で即決着。そうでなければプレイヤーは0〜5で引き、バンカーは自分の合計とプレイヤーの3枚目で引くかどうかが決まります（確率タブ参照）。',
    'プレイヤーは1:1。最初に座るノーコミッション（EZ）テーブルでは、バンカーは1:1ですが3枚の7で勝ったときは引き分けです。コミッション5%のテーブルでは、バンカーは0.95:1で、5%がいつもメダル1枚単位になるよう20枚単位でベットします（20枚で勝つと19枚）。タイのときはどちらも引き分け。タイは8:1、ペアは11:1、ドラゴン7は40:1、パンダ8は25:1です。',
    '「ベット」ボタンを1回押すと、その枚数がスポットに置かれます。プレイヤーとバンカーはそれぞれ最大100枚、タイとサイドベットはそれぞれ最大20枚までです。',
    'シューには8デッキ入っています。最初の1枚をめくり、その数だけカードを捨て札（バーン）にします。終盤のカットカードが出たら、その回でシューは終わりです。',
  ],
  betName: {
    player: 'プレイヤー',
    banker: 'バンカー',
    tie: 'タイ',
    playerPair: 'プレイヤーペア',
    bankerPair: 'バンカーペア',
    dragon7: 'ドラゴン7',
    panda8: 'パンダ8',
  },
  side: { player: 'プレイヤー', banker: 'バンカー' },
  medalsLed: '持ちメダル',
  betLed: 'ベット',
  winLed: '獲得',
  medalsHeld: (n) => `${n}枚`,
  medalsOnTable: (n) => `テーブルに${n}枚`,
  medalsWon: (n) => `${n}枚獲得`,
  medalsWaiting: 'メダルを確認しています…',
  notMoney: NOT_MONEY.ja,
  medalsFrom: 'メダルゲームセンターの持ちメダルです。センターのどのゲームでも同じメダルで遊び、リセットはセンターでのみ行えます。',
  centerLink: 'メダルゲームセンター',
  noticeTitle: 'バカラは持ちメダルで遊ぶようになりました',
  noticeBody:
    'このテーブルのベットは、メダルゲームセンターの持ちメダルから使います。センターのどのゲームとも同じメダルです。以前の練習用チップはなくなりました。チップはメダルではなかったので、メダルには替わりません。',
  noticeOk: 'わかりました',
  cardAway: 'メダルは別のタブで遊ばれています。このテーブルはここで待っています。',
  playHere: 'ここで遊ぶ',
  refill: (n) => `メダルがなくなりました — ${n}枚もらう`,
  sayRestart: 'メダルゲームセンターでメダルがリセットされたので、このテーブルも新しいシューで最初からになります。',
  sayResumed: (n) => `ページを閉じる前に配った回を最後まで進めました。${n}枚獲得です。`,
  betButtons: 'ベット',
  betButtonAria: (n) => `1回${n}枚ベット`,
  deal: 'ディール',
  dealing: 'ディール中…',
  undo: '取り消し',
  clear: 'クリア',
  rebet: '同じベット',
  keysHint: 'キー：Space か Enter でディール・P でプレイヤー・B でバンカー・T でタイ・R で同じベット・U で取り消し',
  tableMode: 'テーブル',
  modeName: { commission: 'コミッション5%', ez: 'ノーコミッション（EZ）' },
  modeLocked: 'テーブルを切り替えるにはベットを外してください。',
  bankerPays: (mode) => (mode === 'ez' ? '1:1・3枚の7は引き分け' : '0.95:1・20枚単位'),
  betAria: (name, pays) => `${name}（${pays}）`,
  noMedals: 'メダルが足りません。',
  notKept: 'このブラウザにはいま保存できないため、持ちメダルで配ることができません。',
  spotMax: (name, most) => `${name}は最大${most}枚までです。`,
  bankerStep: (step) => `コミッション5%のテーブルでは、5%がメダル1枚単位になるよう、バンカーは${step}枚単位でベットします。`,
  placeBets: 'ベットしてからディールしてください。',
  natural: 'ナチュラル',
  result: (winner, p, b, natural) => {
    const nat = natural ? 'ナチュラル — ' : '';
    if (winner === 'tie') return `${nat}タイ（${p}対${b}）`;
    return winner === 'player' ? `${nat}プレイヤーの勝ち（${p}対${b}）` : `${nat}バンカーの勝ち（${b}対${p}）`;
  },
  dragon7Hit: 'ドラゴン7！',
  panda8Hit: 'パンダ8！',
  handAria: (side, total) => (total === null ? `${side}：カードなし` : `${side}：${total}`),
  handResults: 'この回の結果',
  noBetsHand: 'この回はベットなし。',
  outcome: { win: '勝ち', lose: '負け', push: '引き分け' },
  shoeLabel: (n) => `シュー #${n}`,
  handInShoe: (n) => `${n}回目`,
  cardsLeft: (n) => `残り${n}枚`,
  burnInfo: (card, burned) => `バーンカード ${card} → ${burned}枚を捨て札`,
  cutCardOut: 'カットカードが出ました。この回でシューは終わりで、次のディールで新しいシューをシャッフルします。',
  shoeWaiting: '最初のディールで8デッキのシューをシャッフルします。',
  beadPlate: 'ビーズプレート',
  bigRoad: '大路（ビッグロード）',
  roadLetter: { banker: 'B', player: 'P', tie: 'T' },
  roadAria: (name, b, p, t) => `${name}：バンカー${b}、プレイヤー${p}、タイ${t}`,
  roadNote:
    'カジノはこうした罫線を掲示して、流れやパターンを追わせます。でも毎回シューから新しく引いているだけで、パターンは何も予言しません。',
  statsTitle: 'このテーブル',
  hands: 'ハンド数',
  observedVsExact: '実測・理論値',
  pairs: 'ペア（P / B）',
  naturals: 'ナチュラル',
  liveTitle: '次の1回の正確な確率',
  liveNote: (n) =>
    `まだ見ていない${n}枚（捨て札も未知として扱います）から計算しています。シューが進むと確率は少しずつ動きますが、メインのベットがプレイヤー有利になることはほぼありません。`,
  liveFresh: '新しいシュー',
  colBet: 'ベット',
  colWin: '勝率',
  colEdge: 'エッジ',
  playerEdge: 'プレイヤー有利',
  hint: [
    'バンカーはプレイヤーの3枚目を見てから動けるので少しだけ勝ちやすく（45.86%対44.62%）、その分を5%のコミッション（EZテーブルでは3枚の7での引き分け）で回収しています。',
    'ベットは毎回すべて精算されます。タイのときプレイヤーとバンカーは引き分けです。',
    'ペアは最初の2枚が同じランク（K-KはペアでK-Qは違う）のときです。',
  ],
  oddsIntro:
    'バカラには判断がないので、確率を厳密に計算できます。シューから次の6枚が出てくる並びをすべて数え上げ、それぞれをドロールールどおりに進めるだけです。このタブの数字はシミュレーションではありません。',
  decksLabel: 'シューのデッキ数',
  deckOption: (n) => `${n}デッキ`,
  outcomeTitle: '勝敗の確率',
  outcomeName: { banker: 'バンカーの勝ち', player: 'プレイヤーの勝ち', tie: 'タイ' },
  colOutcome: '結果',
  colProbability: '確率',
  colWays: '場合の数',
  colNoTie: 'タイを除くと',
  outcomeNote: (total) =>
    `次の6枚の並び全${total}通り（使うカードが少ない回は、使わないカードの並び方の数だけ数えます）に対する割合なので、どの確率も正確な分数です。`,
  edgeTitle: '各ベットのハウスエッジ',
  oddsBetName: {
    banker: 'バンカー（コミッション5%）',
    bankerEz: 'バンカー（EZ、3枚の7は引き分け）',
    player: 'プレイヤー',
    tie: 'タイ（8:1）',
    tie9: 'タイ（9:1）',
    pair: 'プレイヤー／バンカーペア',
    dragon7: 'ドラゴン7（EZ）',
    panda8: 'パンダ8（EZ）',
  },
  colPays: '配当',
  colPush: '引き分け',
  colHouseEdge: 'ハウスエッジ',
  edgeNote:
    '配られた1回あたりのエッジで、引き分けは賭け金が戻るものとして数えています。バンカーの有利さはコミッションで1.06%のハウスエッジに変わります。EZテーブルはコミッションなしの代わりに、バンカーが3枚の7で勝つ2.25%の回を引き分けにしていて、1.02%とわずかに安くなります。タイを9:1で払うカジノでは、エッジは14.4%から4.8%に下がります。このテーブルではどのベットもメダル1枚単位で払われ、エッジはここに示した値のままです。EZテーブルの配当はもともと1枚単位で、コミッション5%のテーブルではバンカーを20枚単位でベットするので、0.95:1がいつも1枚単位になります（20枚で勝つと19枚）。',
  tableauTitle: 'ドローのルール',
  tableauIntro:
    'どちらかがナチュラル（最初の2枚で8か9）ならその場で終わり。そうでなければプレイヤーは0〜5で引き、6〜7で止まります。バンカーはこの表に従います：',
  colBankerTotal: 'バンカーの合計',
  playerStood: 'プレイヤーは引かず',
  playerThird: 'プレイヤーの3枚目',
  drawShort: '引',
  standShort: '止',
  drawLong: '引く',
  standLong: '止まる',
  whyTitle: 'なぜバンカーの方が勝ちやすいのか',
  whyBody:
    'プレイヤーのルールは相手を見ませんが、バンカーはプレイヤーの3枚目を見てから決めます（8が出たら3で止まる、6か7なら6でも引く、など）。この情報が勝率で約1.2ポイントの差になり、それを5%のコミッションで回収しています。',
  statNatural: '最初の2枚でナチュラル',
  statPlayerDraws: 'プレイヤーが3枚目を引く',
  statBankerDraws: 'バンカーが3枚目を引く',
  statCardsPerHand: '1回に使うカード',
  statHandsPerShoe: '1シューの回数（約）',
  decksTitle: 'デッキ数で変わる？',
  decksIntro:
    'メインのベットはほとんど変わりません。デッキが少ないほど1枚抜けた影響が強くなり、バンカーは少し良く、タイは少し悪く、ペアはぐっと出にくくなります。',
  colDecks: 'デッキ',
  pairTitle: 'ペアベット',
  pairBody: (decks, fraction, pct, edge) =>
    `最初の2枚が同じランクになる確率は (4·${decks} − 1)/(52·${decks} − 1) = ${fraction} ≈ ${pct}。2枚目が1枚目と同じランクの残り${4 * decks - 1}枚のどれかであればよいからです。11:1の配当ではハウスエッジは${edge}です。`,
  run: '実行',
  running: (pct) => `実行中… ${pct}%`,
  handsLabel: 'ハンド数',
  shoesLabel: 'シュー数',
  linesTitle: '同じカードで全ベットを比べる',
  linesIntro:
    '8デッキのシューを次々に配り（バーン、カットカード、シャッフルも本物どおり）、毎回すべてのベットに1単位ずつ賭けます。点線は確率タブの正確なエッジです。',
  colSimulated: (hands) => `シミュレーション（${hands}回）`,
  colExact: '理論値',
  linesNote: '± は95%の幅です。40:1や25:1のサイドベットは振れ幅が大きく、100万回でも1ポイント程度までしか絞り込めません。',
  patternsTitle: '罫線を追いかける',
  patternsIntro:
    'カジノの常連は大路を読みます。流れに乗る、ツラ切れを狙う、3連の後は逆に張る。以下の各方式は今のシューの罫線（タイは除外、新しいシューでリセット）を見てバンカーかプレイヤーに1単位ずつ、すべて同じハンドで賭けます。',
  patternName: {
    banker: 'いつもバンカー',
    player: 'いつもプレイヤー',
    follow: '直前の勝ちに乗る',
    chop: '直前の勝ちの逆に張る',
    streak3: '3連続の後は逆に張る',
    coin: 'コイン投げで決める',
  },
  colStrategy: '方式',
  colBets: 'ベット数',
  colOnBanker: 'バンカー比率',
  colExpected: '理論値',
  patternsNote:
    'どの方式も、賭けた比率どおりの場所に落ち着きます。バンカーの1.06%とプレイヤーの1.24%を、それぞれに賭けた割合で平均しただけです。罫線が変えるのはどちらに賭けるかだけで、次の1回の確率は変わりません。',
  streakTitle: '1シューの最長連続',
  streakAxis: 'シュー内で同じ側が続いた最長回数',
  streakNote: (shoes, mean, eightPlus) =>
    `完了した${shoes}シューで、最長連続の平均は${mean}回、8連続以上が出たシューは${eightPlus}でした。長いツラはランダムならふつうに起きることで、合図ではありません。`,
  countingTitle: 'カードカウンティング',
  countingIntro:
    '完璧なカウンター：毎回、まだ見ていないカードから各ベットの正確な確率を計算し（テーブルタブの確率パネルと同じ計算）、プレイヤー有利なときだけ1単位賭けます。',
  colFavorable: '有利だった回の割合',
  colAvgEdge: 'そのときの平均エッジ',
  colGainPerShoe: '1シューあたりの期待利益',
  colRealized: '1シューあたりの実際の勝ち',
  countingNote: (shoes, hands) =>
    `${shoes}シュー・${hands}ハンド。バンカー・プレイヤー・タイがプレイヤー有利になることはほぼありません（ソープとウォルデンが1966年に示したとおり、メインのベットは事実上攻略できません）。サイドベットは別で、40:1のドラゴン7はシュー終盤に特定のカードが偏ると10ポイント以上動きます。カジノはサイドベットの上限を低くし、終盤だけ賭ける客を見張ることで対処しています。`,
  sampleShoeTitle: '1シューを通した各ベットのエッジ',
  sampleShoeAxis: 'シューの何回目か',
  sampleShoeNote: 'ゼロの線より上（色付き）ならプレイヤー有利です。メインのベットはほとんど動かず、サイドベットはシューが進むほど大きく揺れます。',
};

export const getStrings = (language: GameLanguage): BaccaratStrings => (language === 'ja' ? ja : en);
