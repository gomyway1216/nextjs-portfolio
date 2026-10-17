/**
 * Calico Janken's words, in English and Japanese.
 *
 * Medals are never spoken of as money (the owner: 「本当のお金と誤解される書き方は
 * しないでほしい。」): they are "your medals" / 「持ちメダル」, a win "gives" medals,
 * and the note that they are not money (`NOT_MONEY`) is shown by the medal
 * counter. `tests/unit/components/game/Janken/strings.test.ts` reads every
 * string here for words that would say otherwise.
 *
 * The janken words — じゃんけんぽん, あいこでしょ, グー, チョキ, パー — are
 * everybody's. The machine's name and its cat are its own.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { NOT_MONEY } from '../MedalCenter/strings';
import type { Hand, Outcome } from './engine';

export interface JankenStrings {
  title: string;
  subtitle: string;
  centerLink: string;
  howToPlay: string;
  tabMachine: string;
  tabOdds: string;
  /** The sign over the cabinet, and the line under it. */
  sign: string;
  signSub: string;
  /** The picture of the cat, for a screen reader. */
  catLabel: (state: string) => string;
  catStates: { idle: string; calling: string; showing: (hand: string) => string; spinning: string };
  ringLabel: (lit: number | null) => string;
  // What the cat says
  sayInsert: string;
  sayCall: string;
  sayAiko: string;
  sayPon: string;
  saySho: string;
  sayWin: string;
  sayLose: string;
  sayDraw: string;
  saySpin: string;
  sayOffer: (medals: number) => string;
  sayDouble: string;
  sayPaid: (medals: number) => string;
  sayEmpty: string;
  // The panel
  counterLabel: string;
  winLabel: string;
  stakeLabel: string;
  unit: string;
  you: string;
  cat: string;
  lamps: Record<Outcome, string>;
  hands: Record<Hand, string>;
  handsSub: Record<Hand, string>;
  medalIn: string;
  double: string;
  collect: string;
  keysHint: string;
  refill: (medals: number) => string;
  finding: string;
  cardAway: string;
  playHere: string;
  soundOn: string;
  soundOff: string;
  notMoney: string;
  centerNote: string;
  centerNoteLink: string;
  // Read out
  announceInsert: string;
  announceThrow: (you: string, cat: string, outcome: Outcome, kind: 'play' | 'double') => string;
  announceStopped: (lamp: number, medals: number, canDouble: boolean) => string;
  announceDoubleWin: (medals: number, canDouble: boolean) => string;
  announcePaid: (medals: number) => string;
  announceReturned: (medals: number) => string;
  announceRestarted: string;
  announceResumed: string;
  announceDouble: (medals: number) => string;
  // The plate beside the cabinet
  plateTitle: string;
  plateSteps: string[];
  plateLamps: string;
  plateLampCount: (lamps: number) => string;
  plateReturn: string;
  // How to play
  infoBody: string[];
  // The Odds tab
  oddsIntro: string[];
  throwTitle: string;
  colOutcome: string;
  colThrow: string;
  colMedal: string;
  outcomeNames: Record<Outcome, string>;
  throwNote: string;
  ringTitle: string;
  ringIntro: string;
  colLamp: string;
  colLamps: string;
  colPerWin: string;
  colPerMedal: string;
  colShare: string;
  total: string;
  returnTitle: string;
  returnValue: string;
  returnNote: (num: number, den: number) => string;
  keepsLabel: string;
  meanWinLabel: string;
  throwsLabel: string;
  doubleTitle: string;
  doubleIntro: (max: number) => string;
  colDoubles: string;
  colTop: string;
  colReturn: string;
  colSpread: string;
  compareTitle: string;
  compare: string[];
  simTitle: string;
  simIntro: string;
  simMedals: string;
  simSessions: string;
  simDoubles: string;
  simRun: string;
  simRunning: string;
  simExpected: (net: string) => string;
  simResult: (mean: string, ahead: string, rtp: string) => string;
  simChart: string;
  simBehind: string;
  simAhead: string;
  oneIn: string;
}

const en: JankenStrings = {
  title: 'Calico Janken',
  subtitle: 'A candy-shop janken machine: put a medal in, beat the calico cat at rock, paper, scissors, and the ring of lamps decides how many medals you win.',
  centerLink: 'Medal Game Center',
  howToPlay: 'How to play',
  tabMachine: 'Machine',
  tabOdds: 'Odds',
  sign: 'みけじゃんけん',
  signSub: 'CALICO JANKEN',
  catLabel: (state) => `The calico cat: ${state}`,
  catStates: {
    idle: 'it beckons you with its paw',
    calling: 'its paw is shaking, ready to throw',
    showing: (hand) => `it shows ${hand}`,
    spinning: 'it watches the lamps go round',
  },
  ringLabel: (lit) => (lit === null ? 'The ring of 30 lamps' : `The ring of 30 lamps: the light is on ${lit}`),
  sayInsert: 'Put a medal in!',
  sayCall: 'Jan… ken…',
  sayAiko: 'Aiko de…',
  sayPon: 'Pon!',
  saySho: 'Sho!',
  sayWin: 'You win!',
  sayLose: 'You lose…',
  sayDraw: 'A draw!',
  saySpin: 'Roulette!',
  sayOffer: (medals) => `${medals}! Take them, or double up?`,
  sayDouble: 'Double up! Jan… ken…',
  sayPaid: (medals) => `${medals} medal${medals === 1 ? '' : 's'} for you!`,
  sayEmpty: 'Out of medals…',
  counterLabel: 'YOUR MEDALS',
  winLabel: 'WIN',
  stakeLabel: 'AT STAKE',
  unit: 'medals',
  you: 'YOU',
  cat: 'CAT',
  lamps: { win: 'WIN', draw: 'DRAW', lose: 'LOSE' },
  hands: { gu: 'Rock', choki: 'Scissors', pa: 'Paper' },
  handsSub: { gu: 'グー', choki: 'チョキ', pa: 'パー' },
  medalIn: 'MEDAL IN',
  double: 'DOUBLE UP',
  collect: 'TAKE',
  keysHint: 'Keys: M a medal in · 1 2 3 rock, scissors, paper · D double up · T take',
  refill: (medals) => `Out of medals — take ${medals} more`,
  finding: 'Finding your medals…',
  cardAway: 'Your medals are being played on a machine in another tab. This machine waits where it is.',
  playHere: 'Play here',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  notMoney: NOT_MONEY.en,
  centerNote: 'Your medals are the same at every machine of the Medal Game Center, and are reset only there.',
  centerNoteLink: 'Go to the Medal Game Center',
  announceInsert: 'A medal is in. Jan, ken… choose rock, scissors or paper.',
  announceThrow: (you, cat, outcome, kind) =>
    `You: ${you}. Cat: ${cat}. ` +
    (outcome === 'draw'
      ? 'A draw: throw again, for nothing.'
      : outcome === 'lose'
        ? kind === 'double'
          ? 'You lose the double-up, and the medals on it.'
          : 'You lose.'
        : kind === 'double'
          ? 'You win the double-up.'
          : 'You win! The roulette spins.'),
  announceStopped: (lamp, medals, canDouble) => `The roulette stopped on ${lamp}: ${medals} medal${medals === 1 ? '' : 's'}. ${canDouble ? 'Take them, or double up.' : 'They are yours.'}`,
  announceDoubleWin: (medals, canDouble) => `${medals} medals. ${canDouble ? 'Take them, or double up again.' : 'That is as far as a double-up goes: they are yours.'}`,
  announcePaid: (medals) => `You took ${medals} medal${medals === 1 ? '' : 's'}.`,
  announceReturned: (medals) => `The medal${medals === 1 ? '' : 's'} not yet thrown went back to your medals.`,
  announceRestarted: 'The medals were reset at the Medal Game Center: the machine has started over.',
  announceResumed: 'The machine carries on with the round it had.',
  announceDouble: (medals) => `Double up: ${medals} medals on one throw. Jan, ken… choose your hand.`,
  plateTitle: 'HOW TO PLAY',
  plateSteps: [
    'Put a medal in.',
    'Press rock, scissors or paper: the cat shows its hand at once.',
    'Win, and the light runs round the lamps: you win the medals on the lamp it stops on.',
    'A draw is thrown again for nothing. A loss gives nothing.',
    'Take what you won, or double up: win again to double it, lose and it is gone.',
  ],
  plateLamps: 'THE LAMPS',
  plateLampCount: (lamps) => `${lamps} lamp${lamps === 1 ? '' : 's'}`,
  plateReturn: 'Exactly 90 medals of every 100 come back on average: see the Odds tab.',
  infoBody: [
    'Press MEDAL IN (or the M key) to put one of your medals in. The cat calls “jan… ken…” and shakes its paw.',
    'Press Rock, Scissors or Paper (or 1, 2, 3). The cat shows its hand at the same moment. Its hand is drawn fairly when you press yours: rock, scissors and paper a third each, whatever you press and whatever happened before.',
    'Win, and the light runs round the ring of 30 lamps and stops on one of them, each as likely as any other. You win the medals on that lamp: 1, 2, 3, 5 or 10.',
    'A draw (あいこ) is thrown again for nothing. A loss gives nothing, and the medal stays in the machine.',
    'After a win you can TAKE the medals (T), or DOUBLE UP (D): the medals go on one more throw, which doubles them on a win, is thrown again on a draw, and loses them on a loss. You can double up four times in a row, to sixteen times the lamp. A double-up is a fair bet: it does not change how much comes back on average, only how it is spread.',
    'On average 90 medals of every 100 put in come back: see the Odds tab for the exact sums.',
    'If you leave or reload the page in the middle of a round, a medal you put in and have not thrown yet is given back, and medals you have won are given to you. A throw you have made is never thrown again.',
    'Your medals are the Medal Game Center’s: every machine there plays with the same medals, and they are reset only at the Medal Game Center. Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.',
  ],
  oddsIntro: [
    'Everything on this machine is drawn fairly, and so every chance below is exact. The cat’s hand is rock, scissors or paper a third each, drawn when you press yours, so no hand of yours is better or worse than another. The roulette stops on any of its 30 lamps as likely as any other.',
  ],
  throwTitle: 'One throw, and one medal',
  colOutcome: 'Outcome',
  colThrow: 'Per throw',
  colMedal: 'Per medal',
  outcomeNames: { win: 'Win', draw: 'Draw (thrown again)', lose: 'Loss' },
  throwNote: 'A draw is thrown again, so a medal always ends in a win or a loss: a win with chance 1/3 + 1/3 × 1/3 + … = 1/2. A medal takes 1.5 throws on average.',
  ringTitle: 'The ring of lamps',
  ringIntro: 'Each of the 30 lamps is as likely as any other. A win gives the medals on the lamp the light stops on.',
  colLamp: 'Medals',
  colLamps: 'Lamps',
  colPerWin: 'Chance when it spins',
  colPerMedal: 'Chance per medal',
  colShare: 'Comes back per medal',
  total: 'Total',
  returnTitle: 'What comes back',
  returnValue: 'Medals back per 100 put in',
  returnNote: (num, den) => `Exactly ${num}/${den}: half the medals win, and a win gives 54/30 = 1.8 medals on average.`,
  keepsLabel: 'The machine keeps',
  meanWinLabel: 'Medals per win, on average',
  throwsLabel: 'Throws per medal, on average',
  doubleTitle: 'The double-up',
  doubleIntro: (max) =>
    `A double-up wins half the time (draws are thrown again) and doubles the medals on it, so on average it gives back exactly what it takes. Doubling up never changes the 90%; it only makes the wins rarer and bigger. Up to ${max} in a row.`,
  colDoubles: 'Double-ups after every win',
  colTop: 'Biggest win',
  colReturn: 'Back per 100',
  colSpread: 'Spread per medal (σ)',
  compareTitle: 'Next to the other machines',
  compare: [
    'The Medal Pusher gives back about 90 medals of every 100 when it is played the best way. This machine gives back exactly 90, however it is played.',
    'How much a real candy-shop janken machine gives back has never been published that we could find. Its hand is often said to be set by the machine, and here it is not: it is drawn fairly, and the figure above is exact.',
  ],
  simTitle: 'Try it many times',
  simIntro: 'Plays many sessions at once, each with the same number of medals, and shows how they ended.',
  simMedals: 'Medals per session',
  simSessions: 'Sessions',
  simDoubles: 'Double-ups after every win',
  simRun: 'Play them',
  simRunning: 'Playing…',
  simExpected: (net) => `Expected: ${net} medals per session, exactly.`,
  simResult: (mean, ahead, rtp) => `Played: ${mean} medals per session on average; ${ahead} of the sessions ended ahead; ${rtp} came back.`,
  simChart: 'How the sessions ended: medals ahead or behind',
  simBehind: 'behind',
  simAhead: 'ahead',
  oneIn: '1 in',
};

const ja: JankenStrings = {
  title: 'みけじゃんけん',
  subtitle: '駄菓子屋にあるような、じゃんけんのメダルゲームです。メダルを入れて三毛ねこにじゃんけんで勝つと、ランプのルーレットでもらえるメダルの枚数が決まります。',
  centerLink: 'メダルゲームセンター',
  howToPlay: '遊び方',
  tabMachine: 'マシン',
  tabOdds: '確率',
  sign: 'みけじゃんけん',
  signSub: 'CALICO JANKEN',
  catLabel: (state) => `三毛ねこ：${state}`,
  catStates: {
    idle: '手まねきしています',
    calling: '手をふって、出す手を構えています',
    showing: (hand) => `${hand}を出しています`,
    spinning: 'ランプが回るのを見ています',
  },
  ringLabel: (lit) => (lit === null ? '30個のランプの輪' : `30個のランプの輪：${lit}のランプが光っています`),
  sayInsert: 'メダルを入れてね！',
  sayCall: 'じゃーん、けーん…',
  sayAiko: 'あいこで…',
  sayPon: 'ぽん！',
  saySho: 'しょ！',
  sayWin: 'かち！',
  sayLose: 'まけ…',
  sayDraw: 'あいこ！',
  saySpin: 'ルーレット！',
  sayOffer: (medals) => `${medals}枚！ うけとる？ ダブルアップ？`,
  sayDouble: 'ダブルアップ！ じゃーん、けーん…',
  sayPaid: (medals) => `${medals}枚どうぞ！`,
  sayEmpty: 'メダルがないよ…',
  counterLabel: '持ちメダル',
  winLabel: 'WIN',
  stakeLabel: 'ダブルアップ中',
  unit: '枚',
  you: 'あなた',
  cat: 'ねこ',
  lamps: { win: 'かち', draw: 'あいこ', lose: 'まけ' },
  hands: { gu: 'グー', choki: 'チョキ', pa: 'パー' },
  handsSub: { gu: 'ROCK', choki: 'SCISSORS', pa: 'PAPER' },
  medalIn: 'メダル投入',
  double: 'ダブルアップ',
  collect: 'うけとる',
  keysHint: 'キー：M メダル投入・1 2 3 グー チョキ パー・D ダブルアップ・T うけとる',
  refill: (medals) => `メダルがなくなりました — ${medals}枚もらう`,
  finding: '持ちメダルを確認しています…',
  cardAway: 'メダルは別のタブのマシンで遊ばれています。このマシンはそのまま待っています。',
  playHere: 'ここで遊ぶ',
  soundOn: '音あり',
  soundOff: '音なし',
  notMoney: NOT_MONEY.ja,
  centerNote: '持ちメダルはメダルゲームセンターのどのマシンでも同じで、リセットはメダルゲームセンターでだけできます。',
  centerNoteLink: 'メダルゲームセンターへ',
  announceInsert: 'メダルが入りました。じゃん、けん…グー、チョキ、パーを選んでください。',
  announceThrow: (you, cat, outcome, kind) =>
    `あなた：${you}。ねこ：${cat}。` +
    (outcome === 'draw'
      ? 'あいこです。もう一度、メダルなしで出せます。'
      : outcome === 'lose'
        ? kind === 'double'
          ? 'ダブルアップに負けました。かけたメダルはなくなります。'
          : 'まけです。'
        : kind === 'double'
          ? 'ダブルアップに勝ちました。'
          : 'かちです！ ルーレットが回ります。'),
  announceStopped: (lamp, medals, canDouble) => `ルーレットは${lamp}で止まりました。${medals}枚です。${canDouble ? 'うけとるか、ダブルアップを選んでください。' : 'あなたのメダルです。'}`,
  announceDoubleWin: (medals, canDouble) => `${medals}枚です。${canDouble ? 'うけとるか、もう一度ダブルアップを選んでください。' : 'ダブルアップはここまでです。あなたのメダルです。'}`,
  announcePaid: (medals) => `${medals}枚をうけとりました。`,
  announceReturned: (medals) => `まだ出していなかったメダル${medals}枚を、持ちメダルに戻しました。`,
  announceRestarted: 'メダルゲームセンターでメダルがリセットされました。マシンは最初からになりました。',
  announceResumed: '途中だった回のつづきから遊べます。',
  announceDouble: (medals) => `ダブルアップです。${medals}枚をかけて1回勝負します。じゃん、けん…手を選んでください。`,
  plateTitle: 'あそびかた',
  plateSteps: [
    'メダルを入れてね。',
    'グー・チョキ・パーを押すと、ねこも同時に手を出すよ。',
    '勝つとランプが回るよ。止まったランプの枚数がもらえるよ。',
    'あいこはメダルなしでもう一回。負けるとなにももらえないよ。',
    'もらうか、ダブルアップ。勝てば2倍、負ければなくなるよ。',
  ],
  plateLamps: 'ランプ',
  plateLampCount: (lamps) => `${lamps}個`,
  plateReturn: '平均すると、100枚につきちょうど90枚が戻ります。くわしくは「確率」タブへ。',
  infoBody: [
    '「メダル投入」（Mキー）を押すと、持ちメダルが1枚入ります。ねこが「じゃーん、けーん…」と手をふります。',
    'グー・チョキ・パー（1・2・3キー）を押すと、同時にねこも手を出します。ねこの手は、あなたが押したときに公平に決まります。グー・チョキ・パーが3分の1ずつで、あなたの手にも、それまでの勝負にも左右されません。',
    '勝つと、30個のランプの輪を光が回り、どれか1つに止まります。どのランプに止まるかも同じ確率です。止まったランプの枚数（1・2・3・5・10枚）がもらえます。',
    'あいこは、メダルなしでもう一度勝負します。負けるとメダルはもらえず、入れたメダルはマシンのものになります。',
    '勝ったあとは「うけとる」（T）か「ダブルアップ」（D）を選べます。ダブルアップは、勝ったメダルをかけてもう1回勝負します。勝てば2倍、あいこならもう一度、負ければなくなります。4回まで続けられ、最大でランプの16倍です。ダブルアップは公平な勝負なので、平均して戻るメダルは変わりません。変わるのはばらつきだけです。',
    '平均すると、入れたメダル100枚につき90枚が戻ってきます。正確な計算は「確率」タブにあります。',
    '途中でページを閉じたり読み込み直したりすると、入れたまままだ手を出していないメダルは戻り、勝ったメダルはあなたのものになります。出した手がやり直しになることはありません。',
    '持ちメダルはメダルゲームセンターのものです。どのマシンでも同じメダルで遊び、リセットはメダルゲームセンターでだけできます。メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。',
  ],
  oddsIntro: [
    'このマシンの抽選はすべて公平なので、下の確率はどれも正確な値です。ねこの手はグー・チョキ・パーが3分の1ずつで、あなたが手を押したときに決まります。だから、どの手を出しても有利にも不利にもなりません。ルーレットも、30個のランプのどれに止まるかは同じ確率です。',
  ],
  throwTitle: '1回の勝負と、メダル1枚',
  colOutcome: '結果',
  colThrow: '1回の勝負',
  colMedal: 'メダル1枚',
  outcomeNames: { win: 'かち', draw: 'あいこ（もう一度）', lose: 'まけ' },
  throwNote: 'あいこはもう一度勝負するので、メダル1枚は必ず「かち」か「まけ」で終わります。かちの確率は 1/3 + 1/3 × 1/3 + … = 1/2 です。メダル1枚あたりの勝負の回数は平均1.5回です。',
  ringTitle: 'ランプの輪',
  ringIntro: '30個のランプはどれも同じ確率で光が止まります。勝つと、止まったランプの枚数がもらえます。',
  colLamp: '枚数',
  colLamps: 'ランプの数',
  colPerWin: '回ったときの確率',
  colPerMedal: 'メダル1枚あたりの確率',
  colShare: 'メダル1枚あたりの戻り',
  total: '合計',
  returnTitle: '戻ってくるメダル',
  returnValue: '100枚あたりの戻り',
  returnNote: (num, den) => `ちょうど ${num}/${den} です。メダルの半分が勝ち、勝ったときにもらえるのは平均 54/30 = 1.8枚です。`,
  keepsLabel: 'マシンに残る分',
  meanWinLabel: '1回勝ったときの平均枚数',
  throwsLabel: 'メダル1枚あたりの平均勝負回数',
  doubleTitle: 'ダブルアップ',
  doubleIntro: (max) => `ダブルアップは半分の確率で勝ち（あいこはやり直し）、かけたメダルが2倍になります。だから平均すると、かけた分がちょうど戻ります。ダブルアップをしても90%は変わらず、勝ちが少なく大きくなるだけです。${max}回まで続けられます。`,
  colDoubles: '勝つたびにするダブルアップの回数',
  colTop: 'いちばん大きい勝ち',
  colReturn: '100枚あたりの戻り',
  colSpread: 'メダル1枚あたりのばらつき（σ）',
  compareTitle: 'ほかのマシンとくらべると',
  compare: [
    'メダルプッシャーは、いちばん得な遊び方で100枚につき約90枚が戻ります。このマシンは、どう遊んでもちょうど90枚です。',
    '実際の駄菓子屋のじゃんけんマシンが何割戻すのかは、調べた範囲では公表されていませんでした。手はマシンが調整しているとよく言われますが、ここではそうしていません。公平に決まるので、上の数字は正確です。',
  ],
  simTitle: 'たくさん遊んでみる',
  simIntro: '同じ枚数のメダルで遊ぶ回を一度にたくさん遊び、それぞれがどう終わったかを見せます。',
  simMedals: '1回で使うメダル',
  simSessions: '回数',
  simDoubles: '勝つたびにするダブルアップ',
  simRun: '遊ぶ',
  simRunning: '遊んでいます…',
  simExpected: (net) => `期待値：1回あたり ${net}枚（正確な値）`,
  simResult: (mean, ahead, rtp) => `結果：1回あたり平均 ${mean}枚。増えて終わった回は ${ahead}。戻りは ${rtp} でした。`,
  simChart: '各回の終わり方：増えた枚数・減った枚数',
  simBehind: '減った',
  simAhead: '増えた',
  oneIn: '',
};

export const getStrings = (language: GameLanguage): JankenStrings => (language === 'ja' ? ja : en);
export const STRINGS = { en, ja } as const;
