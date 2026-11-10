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
  statsTitle: string;
  todayPending: string;
  todayResult: (attempts: number, hinted: boolean) => string;
  statSolved: string;
  statCurrent: string;
  statBest: string;
  statFirstTry: string;
  distTitle: string;
  distHint: string;
  distRow: (attempts: number, days: number) => string;
  distHintRow: (days: number) => string;
  statsNote: string;
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
    'Your record keeps the first solve of each day on this device. Every different wrong square you tapped before it counts, even after Undo or Reset, and a solve after showing the hint is listed separately.',
  ],
  toMove: 'to move',
  boardLabel: 'Puzzle board, 3 by 3',
  cellLabel: (row, col, content) =>
    `Row ${row}, column ${col}, ${content}`,
  empty: 'empty',
  alreadySolved: "You already solved today's puzzle.",
  statsTitle: 'Your record',
  todayPending: 'Today: not solved yet.',
  todayResult: (attempts, hinted) =>
    `Today: recorded as ${attempts === 1 ? '1 attempt' : `${attempts} attempts`}${hinted ? ', with the hint' : ''}.`,
  statSolved: 'Days solved',
  statCurrent: 'Current streak',
  statBest: 'Best streak',
  statFirstTry: 'First-tap solves',
  distTitle: 'Attempts on the first solve of each day',
  distHint: 'Hint',
  distRow: (attempts, days) =>
    `${attempts === 1 ? '1 attempt' : `${attempts} attempts`}, no hint: ${days === 1 ? '1 day' : `${days} days`}`,
  distHintRow: (days) => `Solved after showing the hint: ${days === 1 ? '1 day' : `${days} days`}`,
  statsNote:
    'Saved on this device. Only the first solve of each day is recorded; every different wrong square tapped before it counts, even after Undo or Reset.',
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
    '記録にはその日の最初のクリアだけがこの端末に残ります。それまでにタップした不正解のマスは「取り消し」や「リセット」をしても数に入り、ヒントを表示してからのクリアは別枠で集計されます。',
  ],
  toMove: 'の手番',
  boardLabel: '3×3のパズル盤',
  cellLabel: (row, col, content) => `${row}行 ${col}列、${content}`,
  empty: '空き',
  alreadySolved: '本日のパズルはクリア済みです。',
  statsTitle: 'あなたの記録',
  todayPending: '今日：まだクリアしていません。',
  todayResult: (attempts, hinted) =>
    `今日：${attempts}回でクリアと記録${hinted ? '（ヒント使用）' : ''}。`,
  statSolved: 'クリア日数',
  statCurrent: '連続クリア',
  statBest: '最長連続',
  statFirstTry: '一発正解',
  distTitle: '各日の最初のクリアまでの挑戦回数',
  distHint: 'ヒント',
  distRow: (attempts, days) => `ヒントなし${attempts}回：${days}日`,
  distHintRow: (days) => `ヒントを表示してからクリア：${days}日`,
  statsNote:
    'この端末に保存されます。記録されるのはその日の最初のクリアだけで、それまでにタップした不正解のマスは「取り消し」や「リセット」をしても数に入ります。',
};

export const getStrings = (language: GameLanguage): DailyMovePuzzleStrings =>
  language === 'ja' ? ja : en;
