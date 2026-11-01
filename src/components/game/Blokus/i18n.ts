/**
 * Local bilingual (ja/en) strings for the Blokus UI.
 */

import type { Difficulty } from '../common/types';
import type { GameLanguage } from '../constants/gameTranslations';
import type { Mode } from './engine';

export interface BlokusStrings {
  title: string;
  subtitle: string;
  gameSetup: string;
  selectDifficulty: string;
  start: string;
  modeTitle: string;
  modes: Record<Mode, { label: string; description: string }>;
  /** Colour names in turn order, per mode. */
  colors: Record<Mode, readonly string[]>;
  playersTitle: string;
  playerCount: (count: number) => string;
  player: (number: number) => string;
  seatColors: (name: string) => string;
  seatControl: (name: string) => string;
  friendHere: string;
  aiLevel: (level: string) => string;
  sharedNote: (color: string) => string;
  twoColorsNote: string;
  sharedColor: (color: string) => string;
  withColor: (name: string, color: string) => string;
  /** How names and colours join: "Yellow and Green". */
  and: (first: string, second: string) => string;
  turnOf: (name: string) => string;
  playingColor: (color: string) => string;
  winnerIs: (name: string) => string;
  you: string;
  ai: (color: string) => string;
  yourTurn: string;
  yourTurnHint: string;
  thinking: (name: string) => string;
  passing: (name: string) => string;
  youPass: string;
  youAreOut: string;
  squaresLeft: (squares: number) => string;
  piecesLeft: (pieces: number) => string;
  outOfMoves: string;
  turnBadge: string;
  rotate: string;
  flip: string;
  place: string;
  moveGhost: Record<'up' | 'down' | 'left' | 'right', string>;
  noFit: string;
  pickPiece: string;
  piece: (name: string, squares: number) => string;
  pieceUsed: string;
  pieceStuck: string;
  trayLabel: string;
  boardLabel: (size: number) => string;
  boardTextTitle: string;
  boardEmpty: string;
  cell: (row: number, col: number) => string;
  boardRow: (row: number, entries: ReadonlyArray<{ name: string; cols: readonly number[] }>) => string;
  startSquare: (cell: string) => string;
  openCorners: (cells: readonly string[]) => string;
  /** What a piece in hand covers, read out as it moves without a pointer. */
  heldAt: (piece: string, width: number, height: number, cells: readonly string[], legal: boolean) => string;
  win: string;
  tie: string;
  lose: string;
  finalScores: string;
  rank: (rank: number) => string;
  points: (score: number) => string;
  bonusAll: string;
  bonusSingle: string;
  newGame: string;
  changeDifficulty: string;
  infoTitle: string;
  objectiveTitle: string;
  objectiveBody: string;
  rulesTitle: string;
  rules: string[];
  controlsTitle: string;
  controls: string[];
  scoreTitle: string;
  scoreBody: string;
  tipsTitle: string;
  tips: string[];
  difficulties: Record<Difficulty, { label: string; description: string }>;
}

const en: BlokusStrings = {
  title: 'Blokus',
  subtitle: 'Claim the board corner by corner. Your pieces may only touch at the corners.',
  gameSetup: 'Game setup',
  selectDifficulty: 'Select AI level',
  start: 'Start Game',
  modeTitle: 'Game',
  modes: {
    classic: { label: 'Classic', description: '20×20, for 2 to 4 players' },
    duo: { label: 'Duo', description: '14×14, for 2 players' },
  },
  colors: {
    classic: ['Blue', 'Yellow', 'Red', 'Green'],
    duo: ['Violet', 'Orange'],
  },
  playersTitle: 'Players',
  playerCount: (count) => `${count} players`,
  player: (number) => `Player ${number}`,
  seatColors: (name) => `${name}: colour`,
  seatControl: (name) => `${name}: who plays`,
  friendHere: 'A friend on this device',
  aiLevel: (level) => `AI: ${level}`,
  sharedNote: (color) => `${color} is shared: you take turns playing it, and it scores for nobody.`,
  twoColorsNote: 'Each side plays two colours on opposite corners, and their scores are added together.',
  sharedColor: (color) => `${color} (shared)`,
  withColor: (name, color) => `${name} (${color})`,
  and: (first, second) => `${first} and ${second}`,
  turnOf: (name) => `${name}'s turn`,
  playingColor: (color) => `Playing ${color}.`,
  winnerIs: (name) => `${name} wins`,
  you: 'You',
  ai: (color) => `${color} AI`,
  yourTurn: 'Your turn',
  yourTurnHint: 'Pick a piece, then place it on the board.',
  thinking: (name) => `${name} is thinking…`,
  passing: (name) => `${name} can’t move`,
  youPass: 'No piece fits. You are out of moves.',
  youAreOut: 'You are out of moves. Watching the rest…',
  squaresLeft: (squares) => `${squares} left`,
  piecesLeft: (pieces) => `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`,
  outOfMoves: 'Out',
  turnBadge: 'To move',
  rotate: 'Rotate',
  flip: 'Flip',
  place: 'Place',
  moveGhost: { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right' },
  noFit: 'It doesn’t fit there.',
  pickPiece: 'Pick a piece below.',
  piece: (name, squares) => `${name}, ${squares} ${squares === 1 ? 'square' : 'squares'}`,
  pieceUsed: 'already placed',
  pieceStuck: 'no room for it',
  trayLabel: 'Your pieces',
  boardLabel: (size) => `Blokus board, ${size} by ${size}`,
  boardTextTitle: 'The board in words',
  boardEmpty: 'The board is empty.',
  cell: (row, col) => `row ${row} column ${col}`,
  boardRow: (row, entries) =>
    `Row ${row}: ${entries.map(({ name, cols }) => `${name} ${cols.length === 1 ? 'column' : 'columns'} ${cols.join(', ')}`).join('; ')}`,
  startSquare: (cell) => `Your start square: ${cell}.`,
  openCorners: (cells) => `Your open corners: ${cells.join(', ')}.`,
  heldAt: (piece, width, height, cells, legal) =>
    `${piece}, ${width} wide and ${height} tall, covers ${cells.join(', ')}. ${legal ? 'It fits here.' : 'It doesn’t fit here.'}`,
  win: 'You win!',
  tie: 'A tie at the top',
  lose: 'You lost this one',
  finalScores: 'Final scores',
  rank: (rank) => ['1st', '2nd', '3rd', '4th'][rank - 1],
  points: (score) => `${score > 0 ? '+' : ''}${score}`,
  bonusAll: 'all placed',
  bonusSingle: 'single last',
  newGame: 'New Game',
  changeDifficulty: 'Change Level',
  infoTitle: 'How to Play Blokus',
  objectiveTitle: 'Objective',
  objectiveBody: 'Place as many of your 21 pieces as you can. The player with the fewest squares left in hand wins.',
  rulesTitle: 'Rules',
  rules: [
    'Your first piece must cover your start square.',
    'Every later piece must touch one of your own pieces at a corner.',
    'Your own pieces may never touch along an edge. Other colours may.',
    'When no piece fits you are out, and the others play on until nobody can move.',
    'Two players on the Classic board play two colours each, and add their scores.',
    'Three players play a colour each and take turns with the fourth, which scores for nobody.',
  ],
  controlsTitle: 'Controls',
  controls: [
    'Mouse: pick a piece, move over the board, and click to place it.',
    'Touch: pick a piece, tap or drag on the board to position it, then press Place.',
    'Keyboard: arrows move it, R rotates, F flips, Enter places, Esc puts it back.',
    'Dots mark your open corners. Brighter ones can take the piece you picked.',
  ],
  scoreTitle: 'Scoring',
  scoreBody: 'You lose a point for every square left in hand. Placing all 21 pieces scores +15, and +20 if the single square went last.',
  tipsTitle: 'Pro Tips',
  tips: [
    'Play the big, awkward pieces while there is still room.',
    'Head for the centre first: it opens the most corners.',
    'Keep several open corners, so one block can’t shut you out.',
    'Sit in a rival’s gap and its corners close for good.',
  ],
  difficulties: {
    easy: { label: 'Easy', description: 'Big pieces, not much of a plan' },
    medium: { label: 'Medium', description: 'Looks after its own room' },
    hard: { label: 'Hard', description: 'Takes room from its rivals too' },
    expert: { label: 'Expert', description: 'Plays out its best ideas first' },
    master: { label: 'Master', description: 'Plays out far more, and for longer' },
  },
};

const ja: BlokusStrings = {
  title: 'ブロックス',
  subtitle: '角から角へ陣地を広げる陣取りゲーム。自分のピースは角でしかつなげません。',
  gameSetup: 'ゲーム設定',
  selectDifficulty: 'AIのレベルを選択',
  start: 'ゲーム開始',
  modeTitle: 'ゲーム',
  modes: {
    classic: { label: 'クラシック', description: '20×20、2〜4人' },
    duo: { label: 'デュオ', description: '14×14、2人' },
  },
  colors: {
    classic: ['青', '黄', '赤', '緑'],
    duo: ['紫', 'オレンジ'],
  },
  playersTitle: '人数',
  playerCount: (count) => `${count}人`,
  player: (number) => `プレイヤー${number}`,
  seatColors: (name) => `${name}の色`,
  seatControl: (name) => `${name}を操作する人`,
  friendHere: 'この端末で友達が操作',
  aiLevel: (level) => `AI：${level}`,
  sharedNote: (color) => `${color}は共有の色です。順番に置き、誰の得点にもなりません。`,
  twoColorsNote: '1人2色ずつ、向かい合う角の色を使い、2色の得点を合計します。',
  sharedColor: (color) => `${color}（共有）`,
  withColor: (name, color) => `${name}（${color}）`,
  and: (first, second) => `${first}と${second}`,
  turnOf: (name) => `${name}の番`,
  playingColor: (color) => `${color}を置きます。`,
  winnerIs: (name) => `${name}の勝ち`,
  you: 'あなた',
  ai: (color) => `${color}のAI`,
  yourTurn: 'あなたの番',
  yourTurnHint: 'ピースを選んで、盤に置きましょう。',
  thinking: (name) => `${name}が考えています…`,
  passing: (name) => `${name}は置けません`,
  youPass: '置けるピースがありません。ここまでです。',
  youAreOut: 'もう置けません。残りの対局を見守ります…',
  squaresLeft: (squares) => `残り${squares}マス`,
  piecesLeft: (pieces) => `${pieces}個`,
  outOfMoves: '終了',
  turnBadge: '手番',
  rotate: '回転',
  flip: '裏返す',
  place: '置く',
  moveGhost: { up: '上へ動かす', down: '下へ動かす', left: '左へ動かす', right: '右へ動かす' },
  noFit: 'そこには置けません。',
  pickPiece: '下からピースを選びましょう。',
  piece: (name, squares) => `${name}（${squares}マス）`,
  pieceUsed: '置いたピース',
  pieceStuck: '置ける場所なし',
  trayLabel: '手持ちのピース',
  boardLabel: (size) => `ブロックスの盤面 ${size}×${size}`,
  boardTextTitle: '盤面の文字による説明',
  boardEmpty: '盤面にはまだ何もありません。',
  cell: (row, col) => `${row}行${col}列`,
  boardRow: (row, entries) => `${row}行目：${entries.map(({ name, cols }) => `${name} ${cols.join('、')}列`).join('／')}`,
  startSquare: (cell) => `スタートのマス：${cell}。`,
  openCorners: (cells) => `空いている角：${cells.join('、')}。`,
  heldAt: (piece, width, height, cells, legal) =>
    `${piece}、横${width}マス、縦${height}マス。${cells.join('、')}に重なります。${legal ? 'ここに置けます。' : 'ここには置けません。'}`,
  win: 'あなたの勝ち！',
  tie: '同点で1位',
  lose: '今回は負けました',
  finalScores: '最終スコア',
  rank: (rank) => `${rank}位`,
  points: (score) => `${score > 0 ? '+' : ''}${score}点`,
  bonusAll: '全部置いた',
  bonusSingle: '最後が1マス',
  newGame: '新しいゲーム',
  changeDifficulty: 'レベルを変更',
  infoTitle: 'ブロックスの遊び方',
  objectiveTitle: '目的',
  objectiveBody: '21個のピースをできるだけ多く置きましょう。手元に残ったマスが最も少ない色の勝ちです。',
  rulesTitle: 'ルール',
  rules: [
    '最初のピースは、自分のスタートのマスを覆うように置きます。',
    '2個目からは、自分のピースと「角」で接するように置きます。',
    '自分のピース同士は「辺」で接してはいけません。他の色とは接しても構いません。',
    '置けるピースがなくなるとその色は終了し、誰も置けなくなるまで続きます。',
  ],
  controlsTitle: '操作',
  controls: [
    'マウス：ピースを選び、盤の上で動かしてクリックで置きます。',
    'タッチ：ピースを選び、盤をタップかドラッグで位置を決めて「置く」を押します。',
    'キーボード：矢印で移動、Rで回転、Fで裏返し、Enterで配置、Escで戻します。',
    '点は自分の空いた角です。明るい点には選んだピースを置けます。',
  ],
  scoreTitle: '得点',
  scoreBody: '手元に残ったマス1つにつき1点減点です。21個すべて置くと+15点、最後に1マスのピースを置いていれば+20点です。',
  tipsTitle: 'コツ',
  tips: [
    '大きくて形の複雑なピースは、場所があるうちに使いましょう。',
    'まず中央を目指すと、多くの角が開けます。',
    '空いた角を複数持っておけば、1か所ふさがれても続けられます。',
    '相手の隙間に入り込めば、その角は二度と使えなくなります。',
  ],
  difficulties: {
    easy: { label: '初級', description: '大きなピースを気ままに置く' },
    medium: { label: '中級', description: '自分の広さを大事にする' },
    hard: { label: '上級', description: '相手の場所も奪いにくる' },
    expert: { label: '達人', description: '有力な手を試し打ちして選ぶ' },
    master: { label: '名人', description: 'さらに多く、長く試し打ちする' },
  },
};

export const getBlokusStrings = (language: GameLanguage): BlokusStrings => (language === 'ja' ? ja : en);
