/**
 * Riichi Mahjong — local bilingual (en/ja) strings.
 *
 * Kept in the component directory like the sibling games
 * (`ShogiImproved/i18n.ts`, `Othello/i18n.ts`) so the mahjong UI can grow copy
 * without touching the shared `constants/gameTranslations.ts` catalogue that
 * every other game depends on. Consumed through `useGameLanguage()`.
 *
 * Yaku names follow the plan's rule (§M6): English shows the Japanese name in
 * romaji with a short gloss, Japanese shows the kanji name.
 *
 * This module is pure data — no React, no engine state — so tests and the
 * result modal can import it freely.
 */

import type { Difficulty } from '../common/types';
import type { GameLanguage } from '../constants/gameTranslations';
import type { DrawReason, YakuId } from './engine/types';

/** The three difficulties this game offers (the shared type has five). */
export type MahjongDifficulty = Extract<Difficulty, 'easy' | 'medium' | 'hard'>;

export const MAHJONG_DIFFICULTIES: readonly MahjongDifficulty[] = [
  'easy',
  'medium',
  'hard',
];

export interface MahjongCopy {
  // -- Start screen -------------------------------------------------------
  title: string;
  subtitle: string;
  gameSetup: string;
  chooseStrength: string;
  start: string;
  difficulties: Record<MahjongDifficulty, { label: string; description: string }>;
  rulesSummary: string;

  // -- Table --------------------------------------------------------------
  you: string;
  seatName: (wind: string) => string;
  dealerMark: string;
  riichiStickLabel: string;
  wallRemaining: string;
  doraLabel: string;
  uraDoraLabel: string;
  honbaLabel: string;
  sticksLabel: string;
  roundLabel: (wind: string, hand: number) => string;
  handNumber: (n: number) => string;
  winds: [string, string, string, string];
  pondLabel: (seat: string) => string;
  meldsLabel: (seat: string) => string;
  concealedLabel: (seat: string, count: number) => string;

  // -- Hand / status ------------------------------------------------------
  yourHand: string;
  drawnTile: string;
  yourTurn: string;
  waitingForOthers: string;
  thinking: (seat: string) => string;
  chooseDiscard: string;
  riichiLocked: string;
  tenpai: string;
  shantenAway: (n: number) => string;
  complete: string;
  waitsLabel: string;
  furiten: string;
  armRiichi: string;
  cancelRiichi: string;
  riichiArmedHint: string;

  // -- Prompt -------------------------------------------------------------
  promptTitle: string;
  actionRon: string;
  actionTsumo: string;
  actionChi: string;
  actionPon: string;
  actionKan: string;
  actionAnkan: string;
  actionKakan: string;
  actionKyuushu: string;
  actionPass: string;
  chooseTiles: string;

  // -- Log ----------------------------------------------------------------
  logTitle: string;
  logEmpty: string;
  logDiscard: (seat: string, tile: string) => string;
  logRiichi: (seat: string, tile: string) => string;
  logCall: (seat: string, call: string, from: string) => string;
  logKan: (seat: string, call: string) => string;
  logWin: (seat: string, how: string) => string;
  logDraw: (reason: string) => string;

  // -- Result -------------------------------------------------------------
  handResultTitle: string;
  gameResultTitle: string;
  winningHand: string;
  yakuTitle: string;
  doraHan: string;
  fuLabel: string;
  hanLabel: string;
  pointsLabel: string;
  deltasTitle: string;
  tsumoBy: (seat: string) => string;
  ronBy: (winner: string, loser: string) => string;
  drawReason: Record<DrawReason, string>;
  tenpaiSeats: string;
  notenSeats: string;
  none: string;
  nextHand: string;
  playAgain: string;
  finalStandings: string;
  placeLabel: (place: number) => string;
  limitNames: Record<string, string>;
  yakumanLabel: (multiplier: number) => string;

  // -- Info modal ---------------------------------------------------------
  howToPlayTitle: string;
  objectiveLabel: string;
  objectiveBody: string;
  basicRulesLabel: string;
  basicRules: string[];
  controlsLabel: string;
  controls: string[];
  yakuId: (id: YakuId) => string;
}

// ---------------------------------------------------------------------------
// Yaku names
// ---------------------------------------------------------------------------

const YAKU_EN: Record<string, string> = {
  riichi: 'Riichi (ready hand)',
  'double-riichi': 'Double Riichi',
  ippatsu: 'Ippatsu (one shot)',
  'menzen-tsumo': 'Menzen Tsumo (self-draw, closed)',
  pinfu: 'Pinfu (all sequences)',
  tanyao: 'Tanyao (all simples)',
  iipeiko: 'Iipeiko (twin sequence)',
  'yakuhai-round-wind': 'Yakuhai — round wind',
  'yakuhai-seat-wind': 'Yakuhai — seat wind',
  'yakuhai-haku': 'Yakuhai — Haku (white dragon)',
  'yakuhai-hatsu': 'Yakuhai — Hatsu (green dragon)',
  'yakuhai-chun': 'Yakuhai — Chun (red dragon)',
  rinshan: 'Rinshan Kaihou (dead-wall draw)',
  chankan: 'Chankan (robbing a kan)',
  haitei: 'Haitei Raoyue (last tile drawn)',
  houtei: 'Houtei Raoyui (last discard)',
  'sanshoku-doujun': 'Sanshoku Doujun (three colour run)',
  ittsuu: 'Ittsuu (pure straight)',
  chanta: 'Chanta (outside hand)',
  chiitoitsu: 'Chiitoitsu (seven pairs)',
  toitoi: 'Toitoi (all triplets)',
  sanankou: 'Sanankou (three concealed triplets)',
  'sanshoku-doukou': 'Sanshoku Doukou (three colour triplets)',
  sankantsu: 'Sankantsu (three kans)',
  honroutou: 'Honroutou (terminals and honours)',
  shousangen: 'Shousangen (little three dragons)',
  honitsu: 'Honitsu (half flush)',
  junchan: 'Junchan (terminals in every set)',
  ryanpeikou: 'Ryanpeikou (two twin sequences)',
  chinitsu: 'Chinitsu (full flush)',
  tenhou: 'Tenhou (blessing of heaven)',
  chiihou: 'Chiihou (blessing of earth)',
  kokushi: 'Kokushi Musou (thirteen orphans)',
  'kokushi-13': 'Kokushi Musou — 13-tile wait',
  suuankou: 'Suuankou (four concealed triplets)',
  'suuankou-tanki': 'Suuankou Tanki (single wait)',
  daisangen: 'Daisangen (big three dragons)',
  shousuushii: 'Shousuushii (little four winds)',
  daisuushii: 'Daisuushii (big four winds)',
  suukantsu: 'Suukantsu (four kans)',
  tsuuiisou: 'Tsuuiisou (all honours)',
  chinroutou: 'Chinroutou (all terminals)',
  ryuuiisou: 'Ryuuiisou (all green)',
  chuuren: 'Chuuren Poutou (nine gates)',
  'chuuren-9': 'Junsei Chuuren Poutou (true nine gates)',
};

const YAKU_JA: Record<string, string> = {
  riichi: '立直',
  'double-riichi': 'ダブル立直',
  ippatsu: '一発',
  'menzen-tsumo': '門前清自摸和',
  pinfu: '平和',
  tanyao: '断幺九',
  iipeiko: '一盃口',
  'yakuhai-round-wind': '役牌（場風）',
  'yakuhai-seat-wind': '役牌（自風）',
  'yakuhai-haku': '役牌（白）',
  'yakuhai-hatsu': '役牌（發）',
  'yakuhai-chun': '役牌（中）',
  rinshan: '嶺上開花',
  chankan: '搶槓',
  haitei: '海底摸月',
  houtei: '河底撈魚',
  'sanshoku-doujun': '三色同順',
  ittsuu: '一気通貫',
  chanta: '混全帯幺九',
  chiitoitsu: '七対子',
  toitoi: '対々和',
  sanankou: '三暗刻',
  'sanshoku-doukou': '三色同刻',
  sankantsu: '三槓子',
  honroutou: '混老頭',
  shousangen: '小三元',
  honitsu: '混一色',
  junchan: '純全帯幺九',
  ryanpeikou: '二盃口',
  chinitsu: '清一色',
  tenhou: '天和',
  chiihou: '地和',
  kokushi: '国士無双',
  'kokushi-13': '国士無双十三面待ち',
  suuankou: '四暗刻',
  'suuankou-tanki': '四暗刻単騎',
  daisangen: '大三元',
  shousuushii: '小四喜',
  daisuushii: '大四喜',
  suukantsu: '四槓子',
  tsuuiisou: '字一色',
  chinroutou: '清老頭',
  ryuuiisou: '緑一色',
  chuuren: '九蓮宝燈',
  'chuuren-9': '純正九蓮宝燈',
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const en: MahjongCopy = {
  title: 'Riichi Mahjong',
  subtitle:
    'Four-player East-only mahjong against three AI seats — full yaku, fu and riichi scoring, no shortcuts.',
  gameSetup: 'Game setup',
  chooseStrength: 'Choose opponent strength',
  start: 'Deal East 1',
  difficulties: {
    easy: { label: 'Easy', description: 'Opponents play loose and rarely fold.' },
    medium: { label: 'Medium', description: 'Balanced attack, basic safe-tile defence.' },
    hard: { label: 'Hard', description: 'Pushes efficiency and folds against riichi.' },
  },
  rulesSummary:
    'Tonpuusen · 25,000 start · three red fives · ippatsu, ura dora and kan dora on · open tanyao allowed.',

  you: 'You',
  seatName: (wind) => `${wind} seat`,
  dealerMark: 'Dealer',
  riichiStickLabel: 'Riichi declared',
  wallRemaining: 'Wall',
  doraLabel: 'Dora',
  uraDoraLabel: 'Ura dora',
  honbaLabel: 'Honba',
  sticksLabel: 'Sticks',
  roundLabel: (wind, hand) => `${wind} ${hand}`,
  handNumber: (n) => `Hand ${n}`,
  winds: ['East', 'South', 'West', 'North'],
  pondLabel: (seat) => `${seat} discards`,
  meldsLabel: (seat) => `${seat} melds`,
  concealedLabel: (seat, count) => `${seat} holds ${count} concealed tiles`,

  yourHand: 'Your hand',
  drawnTile: 'Drawn tile',
  yourTurn: 'Your turn',
  waitingForOthers: 'Waiting for the other seats…',
  thinking: (seat) => `${seat} is thinking…`,
  chooseDiscard: 'Tap a tile to discard it.',
  riichiLocked: 'Riichi declared — you must discard the tile you drew.',
  tenpai: 'Tenpai',
  shantenAway: (n) => `${n} away from tenpai`,
  complete: 'Complete hand',
  waitsLabel: 'Waiting on',
  furiten: 'Furiten — you may not ron',
  armRiichi: 'Declare riichi',
  cancelRiichi: 'Cancel riichi',
  riichiArmedHint: 'Riichi armed — pick one of the highlighted discards.',

  promptTitle: 'Your call',
  actionRon: 'Ron',
  actionTsumo: 'Tsumo',
  actionChi: 'Chi',
  actionPon: 'Pon',
  actionKan: 'Kan',
  actionAnkan: 'Closed kan',
  actionKakan: 'Added kan',
  actionKyuushu: 'Nine orphans',
  actionPass: 'Pass',
  chooseTiles: 'Choose which tiles to use:',

  logTitle: 'Recent play',
  logEmpty: 'Nothing has happened yet.',
  logDiscard: (seat, tile) => `${seat} discarded ${tile}`,
  logRiichi: (seat, tile) => `${seat} declared riichi on ${tile}`,
  logCall: (seat, call, from) => `${seat} called ${call} from ${from}`,
  logKan: (seat, call) => `${seat} called ${call}`,
  logWin: (seat, how) => `${seat} won by ${how}`,
  logDraw: (reason) => `Hand drawn — ${reason}`,

  handResultTitle: 'Hand result',
  gameResultTitle: 'Game over',
  winningHand: 'Winning hand',
  yakuTitle: 'Yaku',
  doraHan: 'Dora',
  fuLabel: 'Fu',
  hanLabel: 'Han',
  pointsLabel: 'Points',
  deltasTitle: 'Score changes',
  tsumoBy: (seat) => `${seat} — tsumo`,
  ronBy: (winner, loser) => `${winner} — ron off ${loser}`,
  drawReason: {
    exhaustive: 'the wall ran out',
    kyuushu: 'nine terminals and honours',
    suukaikan: 'four kans',
    suufonrenda: 'four identical wind discards',
    suuchariichi: 'four riichi declarations',
  },
  tenpaiSeats: 'Tenpai',
  notenSeats: 'Noten',
  none: 'none',
  nextHand: 'Next hand',
  playAgain: 'Play again',
  finalStandings: 'Final standings',
  placeLabel: (place) => ['1st', '2nd', '3rd', '4th'][place - 1] ?? `${place}th`,
  limitNames: {
    mangan: 'Mangan',
    haneman: 'Haneman',
    baiman: 'Baiman',
    sanbaiman: 'Sanbaiman',
    yakuman: 'Yakuman',
  },
  yakumanLabel: (multiplier) =>
    multiplier > 1 ? `${multiplier}× Yakuman` : 'Yakuman',

  howToPlayTitle: 'How to play Riichi Mahjong',
  objectiveLabel: 'Objective',
  objectiveBody:
    'Build a 14-tile hand of four sets plus a pair (or one of the two special shapes) and win it before the other three seats do. The game is a tonpuusen: four hands of the East round, and the highest score at the end wins.',
  basicRulesLabel: 'Rules in this build',
  basicRules: [
    'Every hand needs at least one yaku — a bare shape with no yaku cannot be declared.',
    'Riichi costs 1,000 points, locks your hand to tsumogiri, and reveals ura dora if you win.',
    'Three red fives are in play and each counts as one extra han.',
    'Ippatsu, kan dora and kan ura are all on; open tanyao is allowed.',
    'Nine terminals and honours on your very first draw may abort the hand.',
  ],
  controlsLabel: 'Controls',
  controls: [
    'Tap a tile in your hand to discard it — only legal discards respond.',
    'Turn on "Declare riichi" first to restrict the hand to riichi-legal discards.',
    'Claims (ron, pon, chi, kan) appear as buttons and never time out.',
    'The drawn tile sits slightly apart on the right of your hand.',
  ],
  yakuId: (id) => YAKU_EN[id] ?? id,
};

// ---------------------------------------------------------------------------
// Japanese
// ---------------------------------------------------------------------------

const ja: MahjongCopy = {
  title: 'リーチ麻雀',
  subtitle: '4人打ち東風戦。役・符・裏ドラまで省略なしで実装したAI3人と対局します。',
  gameSetup: '対局設定',
  chooseStrength: 'AIの強さを選択',
  start: '東1局を開始',
  difficulties: {
    easy: { label: 'やさしい', description: '広く鳴き、ほとんどベタ降りしません。' },
    medium: { label: 'ふつう', description: '攻守のバランス型。現物程度は止めます。' },
    hard: { label: 'つよい', description: '効率重視で押し引きし、リーチには降ります。' },
  },
  rulesSummary:
    '東風戦・25000点持ち・赤ドラ3枚・一発／裏ドラ／カンドラあり・喰いタンあり。',

  you: 'あなた',
  seatName: (wind) => `${wind}家`,
  dealerMark: '親',
  riichiStickLabel: 'リーチ',
  wallRemaining: '残り',
  doraLabel: 'ドラ表示',
  uraDoraLabel: '裏ドラ表示',
  honbaLabel: '本場',
  sticksLabel: '供託',
  roundLabel: (wind, hand) => `${wind}${hand}局`,
  handNumber: (n) => `${n}局目`,
  winds: ['東', '南', '西', '北'],
  pondLabel: (seat) => `${seat}の河`,
  meldsLabel: (seat) => `${seat}の副露`,
  concealedLabel: (seat, count) => `${seat}の手牌${count}枚`,

  yourHand: '手牌',
  drawnTile: 'ツモ牌',
  yourTurn: 'あなたの番',
  waitingForOthers: '他家の応答待ち…',
  thinking: (seat) => `${seat}が考えています…`,
  chooseDiscard: '切る牌をタップしてください。',
  riichiLocked: 'リーチ中はツモ切りのみです。',
  tenpai: 'テンパイ',
  shantenAway: (n) => `${n}シャンテン`,
  complete: '和了形',
  waitsLabel: '待ち',
  furiten: 'フリテン（ロンできません）',
  armRiichi: 'リーチする',
  cancelRiichi: 'リーチ取消',
  riichiArmedHint: 'リーチ宣言牌を選んでください。',

  promptTitle: 'アクション',
  actionRon: 'ロン',
  actionTsumo: 'ツモ',
  actionChi: 'チー',
  actionPon: 'ポン',
  actionKan: 'カン',
  actionAnkan: '暗槓',
  actionKakan: '加槓',
  actionKyuushu: '九種九牌',
  actionPass: 'パス',
  chooseTiles: '使う牌を選択:',

  logTitle: '直近の進行',
  logEmpty: 'まだ何も起きていません。',
  logDiscard: (seat, tile) => `${seat}が${tile}を打牌`,
  logRiichi: (seat, tile) => `${seat}が${tile}でリーチ`,
  logCall: (seat, call, from) => `${seat}が${from}から${call}`,
  logKan: (seat, call) => `${seat}が${call}`,
  logWin: (seat, how) => `${seat}の${how}`,
  logDraw: (reason) => `流局 — ${reason}`,

  handResultTitle: '局の結果',
  gameResultTitle: '対局終了',
  winningHand: '和了形',
  yakuTitle: '役',
  doraHan: 'ドラ',
  fuLabel: '符',
  hanLabel: '翻',
  pointsLabel: '点',
  deltasTitle: '点数移動',
  tsumoBy: (seat) => `${seat}のツモ和了`,
  ronBy: (winner, loser) => `${winner}が${loser}からロン`,
  drawReason: {
    exhaustive: '荒牌平局',
    kyuushu: '九種九牌',
    suukaikan: '四開槓',
    suufonrenda: '四風連打',
    suuchariichi: '四家立直',
  },
  tenpaiSeats: 'テンパイ',
  notenSeats: 'ノーテン',
  none: 'なし',
  nextHand: '次の局へ',
  playAgain: 'もう一度',
  finalStandings: '最終順位',
  placeLabel: (place) => `${place}位`,
  limitNames: {
    mangan: '満貫',
    haneman: '跳満',
    baiman: '倍満',
    sanbaiman: '三倍満',
    yakuman: '役満',
  },
  yakumanLabel: (multiplier) => (multiplier > 1 ? `${multiplier}倍役満` : '役満'),

  howToPlayTitle: 'リーチ麻雀の遊び方',
  objectiveLabel: '目的',
  objectiveBody:
    '4面子1雀頭（または七対子・国士無双）の形を作り、他家より先に和了します。東風戦4局を打ち、終了時の点数が最も高い人が1位です。',
  basicRulesLabel: 'このビルドのルール',
  basicRules: [
    '和了には必ず1翻以上の役が必要です（形だけでは和了れません）。',
    'リーチは1000点供託・以降ツモ切り固定・和了時に裏ドラをめくります。',
    '赤ドラ3枚（5m/5p/5s）はそれぞれ1翻分のドラです。',
    '一発・カンドラ・カン裏あり、喰いタンありのアリアリルールです。',
    '配牌第一ツモ時に幺九牌が9種類あれば九種九牌で流局にできます。',
  ],
  controlsLabel: '操作',
  controls: [
    '手牌の牌をタップすると打牌します（合法な牌だけ反応します）。',
    '先に「リーチする」を押すと、リーチ可能な打牌だけが選べます。',
    'ロン・ポン・チー・カンはボタンで宣言します。制限時間はありません。',
    'ツモ牌は手牌の右側に少し離して表示されます。',
  ],
  yakuId: (id) => YAKU_JA[id] ?? YAKU_EN[id] ?? id,
};

const COPY: Record<GameLanguage, MahjongCopy> = { en, ja };

export function getMahjongCopy(language: GameLanguage): MahjongCopy {
  return COPY[language] ?? en;
}

export default getMahjongCopy;
