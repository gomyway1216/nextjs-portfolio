/**
 * Local bilingual (ja/en) strings for the Othello game UI.
 *
 * Kept inside the component directory (per the revamp spec) rather than the
 * shared gameTranslations catalog, so this game can add copy without touching
 * files other games depend on. Consumed via `useGameLanguage()`.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { Difficulty } from '../common/types';

export interface OthelloStrings {
  title: string;
  tagline: string;
  aiMatch: string;
  setupSinglePlayer: string;
  difficulty: string;
  chooseColor: string;
  black: string;
  white: string;
  moveFirst: string;
  moveSecond: string;
  startVsAi: string;
  howToPlay: string;
  yourTurn: string;
  aiTurn: string;
  opponentTurn: (name: string) => string;
  thinking: string;
  waitingFor: (name: string) => string;
  blackToPlay: string;
  whiteToPlay: string;
  blackMustPass: string;
  whiteMustPass: string;
  passed: (who: string, next: string) => string;
  aiPlayed: (move: string, next: string) => string;
  blackWins: (a: number, b: number) => string;
  whiteWins: (a: number, b: number) => string;
  draw: (a: number, b: number) => string;
  youAre: (color: string) => string;
  youAreVs: (color: string, name: string) => string;
  playAgain: string;
  backToLobby: string;
  newGame: string;
  moveHistory: string;
  noMoves: string;
  pass: string;
  discsLabel: string;
  // Info modal
  objectiveTitle: string;
  objectiveBody: string;
  rulesTitle: string;
  rules: string[];
  strategyTitle: string;
  strategies: string[];
  difficultyLabels: Record<Difficulty, { label: string; description: string }>;
}

const en: OthelloStrings = {
  title: 'Othello',
  tagline: 'Pick a match type, color, and AI strength before the board opens.',
  aiMatch: 'AI match',
  setupSinglePlayer: 'Set up single player',
  difficulty: 'Select difficulty',
  chooseColor: 'Choose your color',
  black: 'Black',
  white: 'White',
  moveFirst: 'Moves first',
  moveSecond: 'Moves second',
  startVsAi: 'Start vs AI',
  howToPlay: 'How to Play',
  yourTurn: 'Your turn',
  aiTurn: 'AI turn',
  opponentTurn: (name) => `${name}'s turn`,
  thinking: 'AI is thinking…',
  waitingFor: (name) => `Waiting for ${name}…`,
  blackToPlay: 'Black to play',
  whiteToPlay: 'White to play',
  blackMustPass: 'Black must pass',
  whiteMustPass: 'White must pass',
  passed: (who, next) => `${who} passed. ${next} to play`,
  aiPlayed: (move, next) => `AI played ${move}. ${next} to play`,
  blackWins: (a, b) => `Black wins ${a}–${b}!`,
  whiteWins: (a, b) => `White wins ${a}–${b}!`,
  draw: (a, b) => `Draw ${a}–${b}`,
  youAre: (color) => `You are playing as ${color}`,
  youAreVs: (color, name) => `You are ${color} vs ${name}`,
  playAgain: 'Play Again',
  backToLobby: 'Back to Lobby',
  newGame: 'New Game',
  moveHistory: 'Move history',
  noMoves: 'No moves yet',
  pass: 'Pass',
  discsLabel: 'discs',
  objectiveTitle: 'Objective',
  objectiveBody: 'Have more discs than your opponent when the game ends.',
  rulesTitle: 'Rules',
  rules: [
    'Black moves first',
    'Place a disc to flip your opponent’s discs',
    'A move must flip at least one disc',
    'Discs flip in all 8 directions at once',
    'If you can’t move, you must pass',
    'The game ends when neither player can move',
  ],
  strategyTitle: 'Strategy',
  strategies: [
    'Corners are gold — they can never be flipped',
    'Avoid the squares next to empty corners (X-squares)',
    'Control edges to build stable discs',
    'Fewer discs mid-game is often stronger (mobility)',
  ],
  difficultyLabels: {
    easy: { label: 'Easy', description: 'Depth 2 — quick, casual' },
    medium: { label: 'Medium', description: 'Depth 4 — a solid club opponent' },
    hard: { label: 'Hard', description: 'Depth 6 + exact endgame' },
    expert: { label: 'Expert', description: '~1s/move, deepens adaptively' },
    master: { label: 'Master', description: '~2.5s/move, strongest search' },
  },
};

const ja: OthelloStrings = {
  title: 'オセロ',
  tagline: '対戦モード・手番・AIの強さを選んで対局を始めましょう。',
  aiMatch: 'AI対戦',
  setupSinglePlayer: 'ひとりで遊ぶ設定',
  difficulty: '難易度を選択',
  chooseColor: '手番を選択',
  black: '黒',
  white: '白',
  moveFirst: '先手',
  moveSecond: '後手',
  startVsAi: 'AIと対戦',
  howToPlay: '遊び方',
  yourTurn: 'あなたの番',
  aiTurn: 'AIの番',
  opponentTurn: (name) => `${name}の番`,
  thinking: 'AIが考えています…',
  waitingFor: (name) => `${name}を待っています…`,
  blackToPlay: '黒の番',
  whiteToPlay: '白の番',
  blackMustPass: '黒はパスです',
  whiteMustPass: '白はパスです',
  passed: (who, next) => `${who}がパスしました。${next}の番`,
  aiPlayed: (move, next) => `AIが${move}に着手。${next}の番`,
  blackWins: (a, b) => `黒の勝ち ${a}–${b}！`,
  whiteWins: (a, b) => `白の勝ち ${a}–${b}！`,
  draw: (a, b) => `引き分け ${a}–${b}`,
  youAre: (color) => `あなたは${color}です`,
  youAreVs: (color, name) => `あなたは${color}（対 ${name}）`,
  playAgain: 'もう一度',
  backToLobby: 'ロビーへ戻る',
  newGame: '新しい対局',
  moveHistory: '棋譜',
  noMoves: 'まだ着手はありません',
  pass: 'パス',
  discsLabel: '枚',
  objectiveTitle: '目的',
  objectiveBody: '対局終了時に相手より多くの石を並べましょう。',
  rulesTitle: 'ルール',
  rules: [
    '黒が先手です',
    '石を置いて相手の石を挟んで裏返します',
    '最低1枚は裏返せる場所にしか置けません',
    '8方向すべてを同時に裏返します',
    '置ける場所がなければパスします',
    'どちらも置けなくなると終局です',
  ],
  strategyTitle: '戦略',
  strategies: [
    '隅は最強 — 裏返されることがありません',
    '空いた隅の隣（X打ち）は避けましょう',
    '辺を押さえて安定石を作りましょう',
    '中盤は石数が少ない方が有利なことも（着手可能数）',
  ],
  difficultyLabels: {
    easy: { label: '初級', description: '深さ2 — 気軽に対局' },
    medium: { label: '中級', description: '深さ4 — 手応えのある相手' },
    hard: { label: '上級', description: '深さ6＋終盤完全読み' },
    expert: { label: 'エキスパート', description: '約1秒/手・可変深さ' },
    master: { label: 'マスター', description: '約2.5秒/手・最強探索' },
  },
};

export function getOthelloStrings(language: GameLanguage): OthelloStrings {
  return language === 'ja' ? ja : en;
}
