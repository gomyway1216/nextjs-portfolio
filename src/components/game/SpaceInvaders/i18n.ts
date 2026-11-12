/**
 * Local (component-scoped) UI strings for Space Invaders.
 * Uses the shared `useGameLanguage()` hook's `language` ('ja' | 'en').
 */

import type { GameLanguage } from '../constants/gameTranslations';
import { EnemyType } from './types';
import type { Difficulty } from './types';

interface SpaceInvadersStrings {
  title: string;
  tagline: string;
  singlePlayer: string;
  play: string;
  playAgain: string;
  resume: string;
  pause: string;
  howToPlay: string;
  difficulty: string;
  difficultyLabels: Record<Difficulty, string>;
  difficultyDescriptions: Record<Difficulty, string>;
  score: string;
  high: string;
  wave: string;
  lives: string;
  gameOver: string;
  victory: string;
  finalScore: string;
  newHighScore: string;
  paused: string;
  pausedHint: string;
  move: string;
  fire: string;
  controlsHint: string;
  objective: string;
  objectiveText: string;
  controls: string;
  ctrlMove: string;
  ctrlFire: string;
  ctrlPause: string;
  enemies: string;
  tips: string;
  tipShields: string;
  tipSpeed: string;
  tipUfo: string;
  tipExtraLife: string;
  bonus: string;
  topRow: string;
  midRows: string;
  botRows: string;
  debriefTitle: string;
  debriefWave: string;
  debriefTime: string;
  debriefShots: string;
  debriefAccuracy: string;
  debriefNoShots: string;
  debriefInvaders: string;
  debriefUfos: string;
  debriefBonus: (points: number) => string;
  debriefByType: string;
  debriefAccuracyNote: string;
  debriefCoopNote: string;
  enemyNames: Record<EnemyType, string>;
  lobby: {
    createRoom: string;
    joinRoom: string;
    yourName: string;
    roomPassword: string;
    roomCode: string;
    back: string;
    create: string;
    creating: string;
    join: string;
    joining: string;
    waitingRoom: string;
    roomCodeLabel: string;
    shareCode: string;
    players: string;
    youTag: string;
    hostTag: string;
    ready: string;
    notReady: string;
    cancelReady: string;
    waitingForPlayer: string;
    leave: string;
    startGame: string;
    waitingForHost: string;
    creatingRoom: string;
    joiningRoom: string;
    startingGame: string;
    /** The lobby's own (client-side) error messages, keyed by their English text. */
    errors: Record<string, string>;
  };
}

const STRINGS: Record<GameLanguage, SpaceInvadersStrings> = {
  en: {
    title: 'Space Invaders',
    tagline: 'Defend Earth from the endless alien swarm.',
    singlePlayer: 'Single Player',
    play: 'Launch',
    playAgain: 'Play Again',
    resume: 'Resume',
    pause: 'Pause',
    howToPlay: 'How to Play',
    difficulty: 'Difficulty',
    difficultyLabels: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
    difficultyDescriptions: {
      easy: 'Slower aliens, 4 lives',
      normal: 'Classic pace, 3 lives',
      hard: 'Fast & aggressive, 2 lives',
    },
    score: 'Score',
    high: 'Hi',
    wave: 'Wave',
    lives: 'Lives',
    gameOver: 'Game Over',
    victory: 'Victory!',
    finalScore: 'Final Score',
    newHighScore: 'New High Score!',
    paused: 'Paused',
    pausedHint: 'Press P or ESC to resume',
    move: 'Move',
    fire: 'Fire',
    controlsHint: 'Move: Arrows / A,D  ·  Fire: Space / Up  ·  Pause: P / ESC',
    objective: 'Objective',
    objectiveText: 'Destroy every alien before they reach Earth. Each wave descends lower and moves faster — survive as long as you can!',
    controls: 'Controls',
    ctrlMove: 'Arrow keys / A, D — Move ship',
    ctrlFire: 'Space / Up Arrow — Fire',
    ctrlPause: 'P / ESC — Pause',
    enemies: 'Enemies',
    tips: 'Tips',
    tipShields: 'Duck behind shields for cover — but they wear down.',
    tipSpeed: 'Aliens speed up as their ranks thin.',
    tipUfo: 'Shoot the mystery UFO for a big bonus.',
    tipExtraLife: 'Earn an extra life every 1,500 points.',
    bonus: 'bonus',
    topRow: 'top row',
    midRows: 'middle rows',
    botRows: 'bottom rows',
    debriefTitle: 'Run debrief',
    debriefWave: 'Wave reached',
    debriefTime: 'Play time',
    debriefShots: 'Shots fired',
    debriefAccuracy: 'Accuracy',
    debriefNoShots: '—',
    debriefInvaders: 'Invaders destroyed',
    debriefUfos: 'UFOs shot down',
    debriefBonus: (points) => `+${points} pts`,
    debriefByType: 'Invaders destroyed by type',
    debriefAccuracyNote:
      'Accuracy is the share of your shots that destroyed an invader or a UFO; a shot that hit a shield or flew off screen counts as a miss. Play time excludes pauses.',
    debriefCoopNote: 'These figures cover your own ship only.',
    enemyNames: {
      [EnemyType.SQUID]: 'Squid',
      [EnemyType.CRAB]: 'Crab',
      [EnemyType.OCTOPUS]: 'Octopus',
    },
    lobby: {
      createRoom: 'Create Room',
      joinRoom: 'Join Room',
      yourName: 'Your Name',
      roomPassword: 'Room Password',
      roomCode: 'Room Code',
      back: 'Back',
      create: 'Create',
      creating: 'Creating...',
      join: 'Join',
      joining: 'Joining...',
      waitingRoom: 'Waiting Room',
      roomCodeLabel: 'Room Code:',
      shareCode: 'Share this code with your friend',
      players: 'Players',
      youTag: '(You)',
      hostTag: '[Host]',
      ready: 'Ready',
      notReady: 'Not Ready',
      cancelReady: 'Not Ready',
      waitingForPlayer: 'Waiting for another player...',
      leave: 'Leave',
      startGame: 'Start Game',
      waitingForHost: 'Waiting for host to start...',
      creatingRoom: 'Creating room...',
      joiningRoom: 'Joining room...',
      startingGame: 'Starting game...',
      errors: {},
    },
  },
  ja: {
    title: 'スペースインベーダー',
    tagline: '終わりなきエイリアンの群れから地球を守れ。',
    singlePlayer: 'シングルプレイ',
    play: '開始',
    playAgain: 'もう一度',
    resume: '再開',
    pause: '一時停止',
    howToPlay: '遊び方',
    difficulty: '難易度',
    difficultyLabels: { easy: 'イージー', normal: 'ノーマル', hard: 'ハード' },
    difficultyDescriptions: {
      easy: '遅い敵・ライフ4',
      normal: '標準ペース・ライフ3',
      hard: '高速で攻撃的・ライフ2',
    },
    score: 'スコア',
    high: 'ハイ',
    wave: 'ウェーブ',
    lives: 'ライフ',
    gameOver: 'ゲームオーバー',
    victory: '勝利！',
    finalScore: '最終スコア',
    newHighScore: 'ハイスコア更新！',
    paused: '一時停止中',
    pausedHint: 'P または ESC で再開',
    move: '移動',
    fire: '発射',
    controlsHint: '移動: 矢印 / A,D  ·  発射: スペース / ↑  ·  一時停止: P / ESC',
    objective: '目的',
    objectiveText: 'エイリアンが地球に到達する前に全滅させろ。ウェーブごとに低く速くなる——どこまで生き残れる？',
    controls: '操作',
    ctrlMove: '矢印キー / A, D — 移動',
    ctrlFire: 'スペース / ↑ — 発射',
    ctrlPause: 'P / ESC — 一時停止',
    enemies: '敵',
    tips: 'ヒント',
    tipShields: 'シールドの陰に隠れよう——ただし削れていく。',
    tipSpeed: '敵は数が減るほど速くなる。',
    tipUfo: 'ミステリーUFOを撃つと大ボーナス。',
    tipExtraLife: '1,500点ごとに残機が1つ増える。',
    bonus: 'ボーナス',
    topRow: '上段',
    midRows: '中段',
    botRows: '下段',
    debriefTitle: '今回の戦績',
    debriefWave: '到達ウェーブ',
    debriefTime: 'プレイ時間',
    debriefShots: '発射数',
    debriefAccuracy: '命中率',
    debriefNoShots: '—',
    debriefInvaders: '撃破した敵',
    debriefUfos: 'UFO撃墜',
    debriefBonus: (points) => `+${points}点`,
    debriefByType: '種類別の撃破数',
    debriefAccuracyNote:
      '命中率は、発射した弾のうち敵またはUFOを撃破した弾の割合です。シールドに当たった弾や画面外に出た弾は外れとして数えます。プレイ時間に一時停止中は含みません。',
    debriefCoopNote: '数字は自機の分だけです。',
    enemyNames: {
      [EnemyType.SQUID]: 'イカ',
      [EnemyType.CRAB]: 'カニ',
      [EnemyType.OCTOPUS]: 'タコ',
    },
    lobby: {
      createRoom: 'ルームを作る',
      joinRoom: 'ルームに参加',
      yourName: 'あなたの名前',
      roomPassword: 'ルームのパスワード',
      roomCode: 'ルームコード',
      back: '戻る',
      create: '作成',
      creating: '作成中…',
      join: '参加',
      joining: '参加中…',
      waitingRoom: '待機ルーム',
      roomCodeLabel: 'ルームコード:',
      shareCode: 'このコードを友だちに伝えてください',
      players: 'プレイヤー',
      youTag: '（あなた）',
      hostTag: '［ホスト］',
      ready: '準備OK',
      notReady: '準備中',
      cancelReady: '準備を取り消す',
      waitingForPlayer: 'もう1人の参加を待っています…',
      leave: '退出',
      startGame: 'ゲーム開始',
      waitingForHost: 'ホストの開始を待っています…',
      creatingRoom: 'ルームを作成中…',
      joiningRoom: 'ルームに参加中…',
      startingGame: 'ゲームを開始中…',
      errors: {
        'Room was closed': 'ルームが閉じられました',
        'Failed to create room': 'ルームを作成できませんでした',
        'Failed to join room': 'ルームに参加できませんでした',
        'Network error': '通信エラーが発生しました',
      },
    },
  },
};

export function getSpaceInvadersStrings(language: GameLanguage): SpaceInvadersStrings {
  return STRINGS[language] ?? STRINGS.en;
}
