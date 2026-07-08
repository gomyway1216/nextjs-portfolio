import type { GameLanguage } from '../constants/gameTranslations';

export interface DailyMovePuzzleStrings {
  title: string;
  subtitle: string;
  date: string;
  side: string;
  attempts: string;
  par: string;
  solvedToday: string;
  prompt: (side: string) => string;
  hint: string;
  wrong: string;
  solvedPerfect: string;
  solvedIn: (n: number) => string;
  celebration: string;
  reset: string;
  undo: string;
  hintBtn: string;
  share: string;
  copied: string;
  copyFailed: string;
  shareText: (dateKey: string, attempts: number) => string;
  howToPlay: string;
  infoTitle: string;
  infoBody: string[];
  toMove: string;
  boardLabel: string;
  cellLabel: (row: number, col: number, content: string) => string;
  empty: string;
  alreadySolved: string;
}

const en: DailyMovePuzzleStrings = {
  title: 'Daily Move Puzzle',
  subtitle: 'One puzzle a day. Find the single winning square in as few taps as possible.',
  date: 'Date',
  side: 'You play',
  attempts: 'Attempts',
  par: 'Par',
  solvedToday: 'Solved today',
  prompt: (side) => `${side} to move — win the game in one move.`,
  hint: 'Tap the square that completes three in a row.',
  wrong: 'Not that square. Look for three in a row.',
  solvedPerfect: 'Solved in one — a perfect par! 🎯',
  solvedIn: (n) => `Solved in ${n} attempts. Come back tomorrow!`,
  celebration: 'Solved!',
  reset: 'Reset',
  undo: 'Undo',
  hintBtn: 'Hint',
  share: 'Share result',
  copied: 'Result copied to clipboard.',
  copyFailed: 'Copy failed — select and copy the text manually.',
  shareText: (dateKey, attempts) =>
    `Daily Move Puzzle ${dateKey}\n${attempts === 1 ? '🎯 Solved in 1 (par!)' : `Solved in ${attempts} tries`}\nmeetyudai.com/games/daily-move-puzzle`,
  howToPlay: 'How to play',
  infoTitle: 'How to play',
  infoBody: [
    'Each day presents one tic-tac-toe position where it is your turn.',
    'Exactly one empty square completes three in a row for your side — find it.',
    'Par is 1: a perfect solve finds it on the first tap.',
    'Wrong taps count as extra attempts. Use Undo to take back a tap, or Reset to start the puzzle over.',
    'Everyone gets the same puzzle each day, so compare your attempts with friends.',
  ],
  toMove: 'to move',
  boardLabel: 'Puzzle board, 3 by 3',
  cellLabel: (row, col, content) =>
    `Row ${row}, column ${col}, ${content}`,
  empty: 'empty',
  alreadySolved: "You already solved today's puzzle.",
};

const ja: DailyMovePuzzleStrings = {
  title: '今日の一手パズル',
  subtitle: '毎日1問。勝ちのマスを、できるだけ少ないタップで見つけよう。',
  date: '日付',
  side: '手番',
  attempts: '挑戦回数',
  par: '基準',
  solvedToday: '本日クリア済み',
  prompt: (side) => `${side}の手番 — 1手で勝ちましょう。`,
  hint: '3つ並ぶマスをタップしてください。',
  wrong: 'そのマスではありません。3目並びを探しましょう。',
  solvedPerfect: '一発正解、パーフェクト！🎯',
  solvedIn: (n) => `${n}回でクリア。また明日！`,
  celebration: 'クリア！',
  reset: 'リセット',
  undo: '取り消し',
  hintBtn: 'ヒント',
  share: '結果を共有',
  copied: '結果をコピーしました。',
  copyFailed: 'コピーできませんでした。テキストを手動でコピーしてください。',
  shareText: (dateKey, attempts) =>
    `今日の一手パズル ${dateKey}\n${attempts === 1 ? '🎯 一発クリア（パー！）' : `${attempts}回でクリア`}\nmeetyudai.com/games/daily-move-puzzle`,
  howToPlay: '遊び方',
  infoTitle: '遊び方',
  infoBody: [
    '毎日、あなたの手番の三目並べの局面が1つ出題されます。',
    'ちょうど1つの空きマスが3目並びを完成させます。それを見つけましょう。',
    '基準は1手。最初のタップで当てれば完璧です。',
    '間違えるとその分だけ挑戦回数が増えます。「取り消し」で1手戻す、「リセット」で最初からやり直せます。',
    '全員が同じ問題に挑戦するので、友達と挑戦回数を比べてみましょう。',
  ],
  toMove: 'の手番',
  boardLabel: '3×3のパズル盤',
  cellLabel: (row, col, content) => `${row}行 ${col}列、${content}`,
  empty: '空き',
  alreadySolved: '本日のパズルはクリア済みです。',
};

export const getStrings = (language: GameLanguage): DailyMovePuzzleStrings =>
  language === 'ja' ? ja : en;
