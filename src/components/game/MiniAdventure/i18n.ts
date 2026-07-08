/**
 * Mini Adventure - local UI strings (ja/en).
 * Engine combat log messages stay in English (game flavor); everything the
 * player reads in the chrome (HUD, menus, buttons, tips) is bilingual.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { MiniAdventureDifficulty } from './types';

export interface MiniAdventureStrings {
  title: string;
  tagline: string;
  intro: string[];
  start: string;
  howToPlay: string;
  difficulty: string;
  difficultyNames: Record<MiniAdventureDifficulty, string>;
  difficultyDescs: Record<MiniAdventureDifficulty, string>;
  // HUD
  hp: string;
  attack: string;
  defense: string;
  torch: string;
  level: string;
  floor: string;
  turn: string;
  surface: string;
  pet: string;
  none: string;
  // Inventory
  inventory: string;
  equipped: string;
  weapon: string;
  armor: string;
  noItems: string;
  use: string;
  drop: string;
  equip: string;
  close: string;
  throwHint: string;
  emptyHint: string;
  // Game over
  victory: string;
  defeat: string;
  playAgain: string;
  backToMenu: string;
  enemiesDefeated: string;
  // Controls / on-screen
  move: string;
  pickUp: string;
  stairs: string;
  wait: string;
  openInventory: string;
  usePet: string;
  controlsHint: string;
  // How to play
  objective: string;
  objectiveText: string;
  controlsTitle: string;
  tipsTitle: string;
  controlsList: string[];
  tips: string[];
}

const en: MiniAdventureStrings = {
  title: 'Mini Adventure',
  tagline: 'A roguelike dungeon crawler',
  intro: [
    'Descend through 10 floors of a torch-lit dungeon.',
    'Find gear, manage your torch, and slay the Dragon to escape.',
    'Death is permanent — choose your fights wisely.',
  ],
  start: 'Start Game',
  howToPlay: 'How to Play',
  difficulty: 'Difficulty',
  difficultyNames: { easy: 'Explorer', normal: 'Adventurer', hard: 'Hero' },
  difficultyDescs: {
    easy: 'Weaker foes, extra supplies. A relaxed descent.',
    normal: 'A balanced challenge for most players.',
    hard: 'Tougher foes, faster torch drain, few supplies.',
  },
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  torch: 'Torch',
  level: 'Lv',
  floor: 'Floor',
  turn: 'Turn',
  surface: 'Surface',
  pet: 'Pet',
  none: 'None',
  inventory: 'Inventory',
  equipped: 'Equipped',
  weapon: 'Weapon',
  armor: 'Armor',
  noItems: 'No items yet — explore to find gear.',
  use: 'Use',
  drop: 'Drop',
  equip: 'Equip',
  close: 'Close',
  throwHint: 'Pick a direction to throw',
  emptyHint: 'Tap an item to select it.',
  victory: 'Victory!',
  defeat: 'Game Over',
  playAgain: 'Play Again',
  backToMenu: 'Main Menu',
  enemiesDefeated: 'Defeated',
  move: 'Move',
  pickUp: 'Pick up',
  stairs: 'Stairs',
  wait: 'Wait',
  openInventory: 'Inventory',
  usePet: 'Pet',
  controlsHint: 'Arrows / WASD to move. Tap the map controls on touch devices.',
  objective: 'Objective',
  objectiveText: 'Descend through 10 floors and defeat the Dragon boss to escape!',
  controlsTitle: 'Controls',
  tipsTitle: 'Tips',
  controlsList: [
    'Arrow Keys / WASD — Move & attack',
    'G or , — Pick up an item',
    '> or Enter — Use the stairs',
    '. or Space — Wait a turn',
    'I — Open inventory',
    'P — Use pet ability',
  ],
  tips: [
    'Keep your torch lit — in the dark you take extra damage.',
    'HP slowly regenerates as you move and fight.',
    'Eggs hatch after 60 turns into helpful pets.',
    'Watch out for Worms — they eat your eggs!',
    'The Dragon resists magic — you must beat it in melee.',
  ],
};

const ja: MiniAdventureStrings = {
  title: 'ミニアドベンチャー',
  tagline: 'ローグライク・ダンジョン探索',
  intro: [
    '松明の灯る10階層のダンジョンを潜り抜けよう。',
    '装備を集め、松明を管理し、ドラゴンを倒して脱出せよ。',
    '死は永遠 — 戦いは慎重に選ぼう。',
  ],
  start: 'ゲーム開始',
  howToPlay: '遊び方',
  difficulty: '難易度',
  difficultyNames: { easy: '探検者', normal: '冒険者', hard: '英雄' },
  difficultyDescs: {
    easy: '敵が弱く補給も多め。のんびり探索。',
    normal: 'ほどよい歯ごたえの標準設定。',
    hard: '敵が強く松明の消耗も早い。補給は僅か。',
  },
  hp: 'HP',
  attack: '攻撃',
  defense: '防御',
  torch: '松明',
  level: 'Lv',
  floor: '階',
  turn: 'ターン',
  surface: '地上',
  pet: 'ペット',
  none: 'なし',
  inventory: '持ち物',
  equipped: '装備中',
  weapon: '武器',
  armor: '防具',
  noItems: 'まだアイテムがありません。探索して装備を集めよう。',
  use: '使う',
  drop: '捨てる',
  equip: '装備',
  close: '閉じる',
  throwHint: '投げる方向を選択',
  emptyHint: 'アイテムをタップして選択。',
  victory: '勝利！',
  defeat: 'ゲームオーバー',
  playAgain: 'もう一度',
  backToMenu: 'メニューへ',
  enemiesDefeated: '撃破数',
  move: '移動',
  pickUp: '拾う',
  stairs: '階段',
  wait: '待つ',
  openInventory: '持ち物',
  usePet: 'ペット',
  controlsHint: '矢印 / WASD で移動。タッチ端末では画面のコントロールを使用。',
  objective: '目的',
  objectiveText: '10階層を降り、ボスのドラゴンを倒して脱出しよう！',
  controlsTitle: '操作',
  tipsTitle: 'ヒント',
  controlsList: [
    '矢印キー / WASD — 移動・攻撃',
    'G または , — アイテムを拾う',
    '> または Enter — 階段を使う',
    '. または Space — 1ターン待つ',
    'I — 持ち物を開く',
    'P — ペットの能力を使う',
  ],
  tips: [
    '松明を灯し続けよう — 暗闇では受けるダメージが増加。',
    '移動や戦闘でHPは少しずつ回復する。',
    '卵は60ターンで頼れるペットに孵化する。',
    'ワームに注意 — 卵を食べられてしまう！',
    'ドラゴンは魔法に耐性 — 近接で倒すしかない。',
  ],
};

export function getMiniAdventureStrings(language: GameLanguage): MiniAdventureStrings {
  return language === 'ja' ? ja : en;
}
