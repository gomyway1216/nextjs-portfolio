/**
 * The horse-racing machine's words, in English and Japanese. Nothing here may
 * read as money: the medals are "your medals" (持ちメダル), and a ticket is
 * bought with medals, never paid for.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Call, MarginId } from './race';
import type { RunningStyle } from './stable';

export interface HorseStrings {
  title: string;
  subtitle: string;
  centerLink: string;
  howToPlay: string;
  tabRace: string;
  tabOdds: string;
  // The board over the track
  raceNo: (n: number) => string;
  runners: string;
  statusOpen: string;
  statusCloses: (seconds: number) => string;
  statusClosed: string;
  statusRunning: string;
  statusResult: string;
  ticker: string[];
  trackLabel: string;
  inGate: string;
  // The tickets
  win: string;
  winHelp: string;
  quinella: string;
  quinellaHelp: string;
  oddsUnit: (odds: number) => string;
  styleName: Record<RunningStyle, string>;
  winAria: (gate: number, name: string, odds: number, medals: number) => string;
  quinellaAria: (a: number, b: number, odds: number, medals: number) => string;
  stepGroup: string;
  stepAria: (medals: number) => string;
  // The buttons
  start: string;
  running: string;
  skip: string;
  rebet: (medals: number) => string;
  undo: string;
  clear: string;
  // The medals
  medals: string;
  bet: string;
  won: string;
  medalsSr: (medals: number) => string;
  betSr: (medals: number) => string;
  wonSr: (medals: number) => string;
  finding: string;
  centerNote: string;
  centerNoteLink: string;
  cardAway: string;
  playHere: string;
  refill: (medals: number) => string;
  sayRefill: (medals: number) => string;
  sayReset: string;
  sayResumed: string;
  sayStake: (medals: number) => string;
  tooFew: string;
  noneLeft: string;
  ticketFull: (most: number) => string;
  rebetShort: (medals: number) => string;
  // The result
  resultTitle: (race: number) => string;
  lastRace: string;
  place: (n: number) => string;
  margin: Record<MarginId, string>;
  photo: string;
  photoFinish: string;
  confirmed: string;
  paid: (won: number, net: number) => string;
  lost: (wagered: number) => string;
  resultIdle: string;
  sayResult: (first: string, second: string, won: number, wagered: number) => string;
  // The race caller
  call: (call: Call, horse: (gate: number) => string) => string;
  gateIn: string;
  // History
  historyTitle: string;
  historyEmpty: string;
  historyRace: string;
  historyResult: string;
  historyNet: string;
  keysHint: string;
  infoBody: string[];
}

const circled = ['①', '②', '③', '④', '⑤', '⑥'];
/** A gate's number as the board writes it: ① to ⑥. */
export const gateMark = (gate: number): string => circled[gate - 1] ?? String(gate);

const medalsEn = (n: number) => `${n.toLocaleString('en-US')} medal${n === 1 ? '' : 's'}`;

const en: HorseStrings = {
  title: 'Mini Turf Racing',
  subtitle: 'A horse-racing medal machine: six horses on a miniature track. Buy win and quinella tickets with your medals, press START, and watch them run.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabRace: 'Race',
  tabOdds: 'Odds',
  raceNo: (n) => `RACE ${n}`,
  runners: '6 runners',
  statusOpen: 'Tickets on sale',
  statusCloses: (s) => `Betting closes in ${s}s`,
  statusClosed: 'Betting closed',
  statusRunning: 'They’re running',
  statusResult: 'Result',
  ticker: ['Tickets on sale for the next race', 'WIN: pick the winner · QUINELLA: pick the first two', 'Press START when your tickets are in', 'Every ticket brings back 89.5% to 90% in the long run'],
  trackLabel: 'The track: six horses on a miniature oval',
  inGate: 'The field is in the gate…',
  win: 'WIN',
  winHelp: 'Pick the winner',
  quinella: 'QUINELLA',
  quinellaHelp: 'Pick the first two, either order',
  oddsUnit: (odds) => `×${odds}`,
  styleName: { front: 'Front-runner', stalker: 'Stalker', closer: 'Closer', deep: 'Deep closer' },
  winAria: (gate, name, odds, medals) => `Win ticket on ${gate} ${name}, odds ${odds} to 1 back${medals > 0 ? `, ${medalsEn(medals)} on it` : ''}`,
  quinellaAria: (a, b, odds, medals) => `Quinella ticket on ${a} and ${b}, odds ${odds}${medals > 0 ? `, ${medalsEn(medals)} on it` : ''}`,
  stepGroup: 'Medals a tap',
  stepAria: (medals) => `${medalsEn(medals)} a tap`,
  start: 'START',
  running: 'RUNNING',
  skip: 'Skip to the finish',
  rebet: (medals) => (medals > 0 ? `Same tickets (${medals})` : 'Same tickets'),
  undo: 'Undo',
  clear: 'Clear',
  medals: 'MEDALS',
  bet: 'BET',
  won: 'WIN',
  medalsSr: (n) => `Your medals: ${n.toLocaleString('en-US')}`,
  betSr: (n) => `On the tickets: ${medalsEn(n)}`,
  wonSr: (n) => `Last race brought back ${medalsEn(n)}`,
  finding: 'Looking for your medals…',
  centerNote: 'These are your medals from the Medal Game Center: every game there plays with the same ones, and they are reset only there.',
  centerNoteLink: 'Go to the Medal Game Center',
  cardAway: 'Your medals are being played in another tab. This machine waits where it is.',
  playHere: 'Play here',
  refill: (medals) => `Out of medals — take ${medals} more`,
  sayRefill: (medals) => `${medalsEn(medals)} added to your medals.`,
  sayReset: 'Your medals were reset at the Medal Game Center: this machine starts over at race 1.',
  sayResumed: 'A race left running here is run again to its result.',
  sayStake: (medals) => `${medalsEn(medals)} on the tickets. They’re in the gate.`,
  tooFew: 'Not enough medals for the tickets on the board.',
  noneLeft: 'No medals left to put on a ticket.',
  ticketFull: (most) => `A ticket takes at most ${most} medals.`,
  rebetShort: (medals) => `The same tickets need ${medalsEn(medals)}.`,
  resultTitle: (race) => `Race ${race} result`,
  lastRace: 'Last race',
  place: (n) => ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1] ?? `${n}th`,
  margin: {
    nose: 'a nose',
    head: 'a head',
    neck: 'a neck',
    half: 'half a length',
    threeQuarters: '¾ length',
    one: 'a length',
    oneQuarter: '1¼ lengths',
    oneHalf: '1½ lengths',
    two: '2 lengths',
    twoHalf: '2½ lengths',
    three: '3 lengths',
    four: '4 lengths',
  },
  photo: 'AT THE POST',
  photoFinish: 'PHOTO FINISH',
  confirmed: 'OFFICIAL',
  paid: (won, net) => `Back: ${medalsEn(won)} (${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('en-US')})`,
  lost: (wagered) => `No winning ticket (${medalsEn(wagered)})`,
  resultIdle: 'Each race’s result shows here: the first two, the margin, and what your tickets brought back.',
  sayResult: (first, second, won, wagered) => `${first} wins, ${second} second. ${won > 0 ? `Your tickets brought back ${medalsEn(won)}.` : `No winning ticket, ${medalsEn(wagered)} played.`}`,
  call: (call, horse) => {
    switch (call.kind) {
      case 'off':
        return 'And they’re off!';
      case 'early':
        return `${horse(call.leader)} goes to the front, ${horse(call.second)} tracking.`;
      case 'turn':
        return `Into the far turn, ${horse(call.leader)} leads ${horse(call.second)}.`;
      case 'home':
        return call.lengths >= 1.5 ? `Round the home turn, ${horse(call.leader)} clear by ${Math.round(call.lengths)} lengths.` : `Round the home turn, ${horse(call.leader)} just ahead of ${horse(call.second)}.`;
      case 'straight':
        return `Into the straight, ${horse(call.leader)} in front!`;
      case 'final':
        return call.mode === 'flying'
          ? `100 to go: ${horse(call.chaser)} flying at ${horse(call.leader)}!`
          : call.mode === 'close'
            ? `100 to go: ${horse(call.leader)}, ${horse(call.chaser)} right there!`
            : `100 to go, ${horse(call.leader)} has gone clear!`;
      case 'post':
        return call.photo ? 'They hit the line together: a photo!' : `${horse(call.winner)} crosses the line first!`;
      case 'result':
        return `${horse(call.winner)} wins by ${en.margin[call.margin]}, ${horse(call.second)} second.`;
    }
  },
  gateIn: 'All six are in the gate…',
  historyTitle: 'Your races this visit',
  historyEmpty: 'No races yet.',
  historyRace: 'Race',
  historyResult: '1st–2nd',
  historyNet: 'Net',
  keysHint: 'Keys: Space or Enter starts · 1–6 a win ticket · S skips · R same tickets · U undo',
  infoBody: [
    'Six horses run each race. Before the off, put your medals on tickets: a WIN ticket on one horse wins if it finishes first; a QUINELLA ticket on two horses wins if they finish first and second, in either order.',
    'Each ticket shows its odds: a winning ticket brings back its odds times the medals on it, those medals included. Tap a ticket to add medals (1, 5 or 10 a tap, up to 99 a ticket).',
    'Press START, or wait: once you have a ticket, betting closes by itself after 60 seconds. The result is drawn as betting closes, from the chances the Odds tab shows, and the race is then run to it. You can skip to the finish.',
    'Every ticket on every race brings back between 89.5% and 90% of the medals on it in the long run. No ticket is a better bet than another; long shots just come in less often.',
    'The medals are your medals from the Medal Game Center, the same ones every machine there plays with.',
  ],
};

const ja: HorseStrings = {
  title: 'ミニターフ競馬',
  subtitle: '6頭の馬がミニチュアのコースを走る競馬メダルゲームです。持ちメダルで単勝・連複を買って START を押し、レースを見届けます。',
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabRace: 'レース',
  tabOdds: '確率',
  raceNo: (n) => `第${n}レース`,
  runners: '6頭立て',
  statusOpen: '発売中',
  statusCloses: (s) => `締切まで ${s}秒`,
  statusClosed: '締切',
  statusRunning: 'レース中',
  statusResult: '確定',
  ticker: ['次のレースの馬券を発売中', '単勝：1着を当てる・連複：1着と2着の2頭を当てる', '買い終わったら START', 'どの馬券も長い目で見て89.5〜90％が戻ります'],
  trackLabel: 'コース：ミニチュアの楕円コースを6頭が走ります',
  inGate: '各馬ゲートイン…',
  win: '単勝',
  winHelp: '1着を当てる',
  quinella: '連複',
  quinellaHelp: '1着・2着の2頭（順不同）',
  oddsUnit: (odds) => `${odds}倍`,
  styleName: { front: '逃げ', stalker: '先行', closer: '差し', deep: '追込' },
  winAria: (gate, name, odds, medals) => `単勝 ${gate}番 ${name}、${odds}倍${medals > 0 ? `、${medals}枚` : ''}`,
  quinellaAria: (a, b, odds, medals) => `連複 ${a}-${b}、${odds}倍${medals > 0 ? `、${medals}枚` : ''}`,
  stepGroup: '1回に置く枚数',
  stepAria: (medals) => `1回に${medals}枚`,
  start: 'START',
  running: 'レース中',
  skip: 'ゴールまで飛ばす',
  rebet: (medals) => (medals > 0 ? `同じ買い方（${medals}枚）` : '同じ買い方'),
  undo: '1つ戻す',
  clear: 'クリア',
  medals: '持ちメダル',
  bet: 'ベット',
  won: '獲得',
  medalsSr: (n) => `持ちメダル ${n.toLocaleString('ja-JP')}枚`,
  betSr: (n) => `馬券に置いたメダル ${n}枚`,
  wonSr: (n) => `前のレースで戻ったメダル ${n}枚`,
  finding: '持ちメダルを確認しています…',
  centerNote: 'メダルゲームセンターの持ちメダルです。センターのどのゲームも同じメダルで遊び、リセットはセンターでのみ行えます。',
  centerNoteLink: 'メダルゲームセンターへ',
  cardAway: 'メダルは別のタブで遊ばれています。このマシンはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  sayRefill: (medals) => `メダルを${medals}枚受け取りました。`,
  sayReset: 'メダルゲームセンターでメダルがリセットされました。このマシンも第1レースからです。',
  sayResumed: '途中だったレースを、決まっていた結果のとおりにもう一度走らせます。',
  sayStake: (medals) => `馬券に${medals}枚。各馬ゲートインです。`,
  tooFew: '馬券に置いたメダルに足りる持ちメダルがありません。',
  noneLeft: '馬券に置ける持ちメダルがありません。',
  ticketFull: (most) => `1枚の馬券に置けるのは${most}枚までです。`,
  rebetShort: (medals) => `同じ買い方には${medals}枚いります。`,
  resultTitle: (race) => `第${race}レース 結果`,
  lastRace: '前のレース',
  place: (n) => `${n}着`,
  margin: {
    nose: 'ハナ',
    head: 'アタマ',
    neck: 'クビ',
    half: '1/2馬身',
    threeQuarters: '3/4馬身',
    one: '1馬身',
    oneQuarter: '1馬身1/4',
    oneHalf: '1馬身1/2',
    two: '2馬身',
    twoHalf: '2馬身1/2',
    three: '3馬身',
    four: '4馬身',
  },
  photo: 'ゴール写真',
  photoFinish: '写真判定',
  confirmed: '確定',
  paid: (won, net) => `戻り ${won.toLocaleString('ja-JP')}枚（${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('ja-JP')}）`,
  lost: (wagered) => `当たりなし（${wagered.toLocaleString('ja-JP')}枚）`,
  resultIdle: 'レースが終わると、ここに1着・2着と着差、馬券で戻ったメダルが出ます。',
  sayResult: (first, second, won, wagered) => `1着 ${first}、2着 ${second}。${won > 0 ? `馬券で${won}枚が戻りました。` : `当たり馬券はありません（${wagered}枚）。`}`,
  call: (call, horse) => {
    switch (call.kind) {
      case 'off':
        return 'スタートしました！';
      case 'early':
        return `先手を取ったのは${horse(call.leader)}、${horse(call.second)}が続きます。`;
      case 'turn':
        return `3コーナー、先頭は${horse(call.leader)}、2番手${horse(call.second)}。`;
      case 'home':
        return call.lengths >= 1.5 ? `4コーナー、${horse(call.leader)}が${Math.round(call.lengths)}馬身のリード。` : `4コーナー、先頭${horse(call.leader)}、すぐ後ろに${horse(call.second)}。`;
      case 'straight':
        return `直線に向いた！ 先頭は${horse(call.leader)}！`;
      case 'final':
        return call.mode === 'flying'
          ? `残り100！ ${horse(call.chaser)}が猛追！`
          : call.mode === 'close'
            ? `残り100！ ${horse(call.leader)}に${horse(call.chaser)}が並びかける！`
            : `残り100、${horse(call.leader)}が抜け出した！`;
      case 'post':
        return call.photo ? '並んでゴール！ 写真判定です！' : `${horse(call.winner)}、先頭でゴールイン！`;
      case 'result':
        return `1着は${horse(call.winner)}、${ja.margin[call.margin]}差。2着は${horse(call.second)}。`;
    }
  },
  gateIn: '各馬ゲートイン完了…',
  historyTitle: 'このセッションのレース',
  historyEmpty: 'まだレースはありません。',
  historyRace: 'レース',
  historyResult: '1着-2着',
  historyNet: '差し引き',
  keysHint: 'キー：Space か Enter でスタート・1〜6 で単勝・S で飛ばす・R で同じ買い方・U で1つ戻す',
  infoBody: [
    '1レースに6頭が走ります。発走前に持ちメダルを馬券に置きます。単勝は1頭を選び、その馬が1着なら当たり。連複は2頭を選び、その2頭が1着と2着なら（順番はどちらでも）当たりです。',
    '馬券にはオッズが出ています。当たった馬券は、置いたメダルのオッズ倍（置いたメダルを含む）が戻ります。馬券を押すたびに1・5・10枚ずつ置け、1枚の馬券には99枚まで置けます。',
    'START を押すか、待ちます。馬券を1枚でも買うと60秒で自動的に締め切られます。結果は締め切った瞬間に「確率」タブの確率どおりに決まり、その結果のとおりにレースが走ります。ゴールまで飛ばすこともできます。',
    'どのレースのどの馬券も、長い目で見て置いたメダルの89.5〜90％が戻ります。得な馬券はありません。人気のない馬は当たる回数が少ないだけです。',
    '持ちメダルはメダルゲームセンターのメダルです。センターのどのマシンも同じメダルで遊びます。',
  ],
};

export const getStrings = (language: GameLanguage): HorseStrings => (language === 'ja' ? ja : en);
