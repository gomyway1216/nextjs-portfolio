/**
 * Mini Adventure - local UI strings (ja/en).
 * The engine writes its log and item texts in English (they are part of the
 * game state); the UI shows them through `localizeLogText`, `localizeItemName`
 * and `localizeItemDescription`, which leave English exactly as written.
 */

import type { GameLanguage } from '../constants/gameTranslations';
import type { EnemyTrait } from './Sight';
import {
  CardEffect, ItemType, PetType, ScrollEffect,
  type EnemyType, type Item, type MiniAdventureDifficulty, type StatusEffect,
} from './types';

/** Every item name the engine creates (Items.ts), as it writes it. */
export const ITEM_NAMES = [
  'Wooden Sword', 'Bronze Sword', 'Iron Sword', 'Steel Sword', 'Silver Sword',
  'Golden Sword', 'Platinum Sword', 'Mythril Sword', 'Diamond Sword', 'Legendary Sword',
  'Cloth Armor', 'Leather Armor', 'Chainmail', 'Scale Armor', 'Plate Armor',
  'Silver Armor', 'Golden Armor', 'Mythril Armor', 'Diamond Armor', 'Legendary Armor',
  'Fireball Scroll', 'Freeze Scroll', 'Teleport Scroll', 'Map Scroll', 'Power Scroll', 'Shield Scroll',
  'Attack Card', 'Sleep Card', 'Confuse Card', 'Force Card', 'Heal Card',
  'Bird Egg', 'Snake Egg', 'Bear Egg',
  'Torch', 'Health Potion',
] as const;
export type ItemName = (typeof ITEM_NAMES)[number];

/**
 * Every message the engine logs (GameEngine.ts). Its English text is the exact
 * engine string with the values as placeholders: {item} an item name, {enemy}
 * an enemy name, {pet} a pet name, {n} a number.
 */
export type LogKey =
  | 'welcome' | 'controls' | 'seeItem' | 'defeated' | 'dragonFalls' | 'hit' | 'levelUp'
  | 'noStairs' | 'dragonBlocks' | 'escaped' | 'bossPresence' | 'descend' | 'nothingHere'
  | 'inventoryFull' | 'pickedUp' | 'useTorch' | 'drinkPotion' | 'eggNotReady' | 'teleport'
  | 'mapRevealed' | 'poweredUp' | 'shielded' | 'fireballHits' | 'noEnemiesInSight' | 'frozenEnemies'
  | 'healCard' | 'chooseThrow' | 'cardMissed' | 'cardHits' | 'enemySleeps' | 'enemyConfused'
  | 'enemyPushed' | 'equip' | 'noPet' | 'birdEscape' | 'pythonWeakens' | 'teddyConfuses'
  | 'screamFreezes' | 'eggEaten' | 'enemyHits' | 'playerDefeated' | 'torchOut' | 'torchLow'
  | 'eggHatched' | 'playerFrozen' | 'wait' | 'dropped';

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
  /** The hatched pet shown in the status row. */
  petNames: Record<PetType, string>;
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
  // "In sight" panel: the enemies the player can currently see
  sight: {
    title: string;
    empty: string;
    /** Header count: how many rows are listed out of how many enemies are visible. */
    count: (shown: number, total: number) => string;
    /** One player melee hit on the enemy; `range` is e.g. "6–8". */
    dealt: (range: string) => string;
    /** One enemy hit on the player. */
    taken: (range: string) => string;
    enemyNames: Record<EnemyType, string>;
    status: Record<Exclude<StatusEffect, StatusEffect.NONE>, string>;
    traits: Record<EnemyTrait, string>;
  };
  /** Item names, keyed by the engine's English name. */
  itemNames: Record<ItemName, string>;
  /** Item descriptions; {n} is the item's number (attack, defence, torch light). */
  itemDescriptions: {
    weapon: string;
    armor: string;
    torch: string;
    potion: string;
    scroll: Record<ScrollEffect, string>;
    card: Record<CardEffect, string>;
    egg: Record<PetType, string>;
  };
  /** Log messages; see `LogKey`. */
  log: Record<LogKey, string>;
  // Accessibility labels (screen readers)
  aria: {
    surfaceMap: string;
    floorMap: (floor: number) => string;
    dir: Record<
      'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight',
      string
    >;
    throwDir: Record<'up' | 'down' | 'left' | 'right', string>;
  };
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
  petNames: { grabber_bird: 'Grabber Bird', python: 'Python', teddy: 'Teddy' },
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
    '"In sight" lists the enemies you can see: their HP and the damage one hit does each way.',
  ],
  sight: {
    title: 'In sight',
    empty: 'No enemies in sight.',
    count: (shown, total) => (total > shown ? `nearest ${shown} of ${total}` : `${total}`),
    dealt: range => `Deal ${range}`,
    taken: range => `Take ${range}`,
    enemyNames: {
      slime: 'Slime', bat: 'Bat', goblin: 'Goblin', skeleton: 'Skeleton', orc: 'Orc',
      worm: 'Worm', imp: 'Imp', ghost: 'Ghost', golem: 'Golem', dragon: 'Dragon',
    },
    status: {
      sleep: 'Asleep', frozen: 'Frozen', confused: 'Confused',
      powered_up: 'Powered up', shielded: 'Shielded',
    },
    traits: {
      resistsMagic: 'Scroll-immune',
      canPassWalls: 'Passes walls',
      eatsEggs: 'Eats eggs',
      canDisable: 'Freezing scream',
    },
  },
  itemNames: Object.fromEntries(ITEM_NAMES.map(name => [name, name])) as Record<ItemName, string>,
  itemDescriptions: {
    weapon: 'Attack +{n}',
    armor: 'Defense +{n}',
    torch: 'Restores {n} torch light',
    potion: 'Restores 30 HP',
    scroll: {
      [ScrollEffect.FIREBALL]: 'Burns all visible enemies',
      [ScrollEffect.FREEZE]: 'Freezes all visible enemies',
      [ScrollEffect.TELEPORT]: 'Teleport to a random location',
      [ScrollEffect.MAP_REVEAL]: 'Reveals the entire floor',
      [ScrollEffect.POWER_UP]: 'Boosts attack for 10 turns',
      [ScrollEffect.SHIELD]: 'Boosts defense for 10 turns',
    },
    card: {
      [CardEffect.DAMAGE]: 'Throw to deal damage from distance',
      [CardEffect.SLEEP]: 'Puts enemy to sleep',
      [CardEffect.CONFUSE]: 'Confuses enemy movement',
      [CardEffect.KNOCKBACK]: 'Pushes enemy back',
      [CardEffect.HEAL]: 'Restores HP when used on self',
    },
    egg: {
      [PetType.GRABBER_BIRD]: 'Hatches into a Grabber Bird (escape ability)',
      [PetType.PYTHON]: 'Hatches into a Python (weaken enemies)',
      [PetType.TEDDY]: 'Hatches into a Teddy (guide enemies)',
    },
  },
  log: {
    welcome: 'Welcome to the dungeon! Find the stairs to descend.',
    controls: 'Arrow keys or WASD to move. Press "." to wait.',
    seeItem: "You see a {item} here. Press 'g' to pick up.",
    defeated: 'You defeated the {enemy}! (+{n} exp)',
    dragonFalls: 'The Dragon falls! The way out is open — reach the stairs to escape.',
    hit: 'You hit the {enemy} for {n} damage!',
    levelUp: 'Level up! You are now level {n}!',
    noStairs: 'There are no stairs here.',
    dragonBlocks: 'The Dragon blocks your escape. Defeat it first!',
    escaped: 'You escaped the dungeon! Victory!',
    bossPresence: 'You sense a powerful presence on this floor...',
    descend: 'You descend to floor {n}.',
    nothingHere: 'There is nothing here to pick up.',
    inventoryFull: 'Your inventory is full!',
    pickedUp: 'You picked up the {item}.',
    useTorch: 'You use the torch. Light restored to {n}.',
    drinkPotion: 'You drink the potion. HP restored by {n}.',
    eggNotReady: 'The egg needs more time to hatch.',
    teleport: 'You teleport to a new location!',
    mapRevealed: 'The entire floor is revealed!',
    poweredUp: 'Your attacks are powered up!',
    shielded: 'A magical shield surrounds you!',
    fireballHits: 'Fireball hits {n} enemies!',
    noEnemiesInSight: 'No enemies in sight.',
    frozenEnemies: 'Enemies are frozen in place!',
    healCard: 'The heal card restores {n} HP!',
    chooseThrow: 'Choose a direction to throw the card.',
    cardMissed: 'The card flies off into the darkness...',
    cardHits: 'The card hits {enemy} for {n} damage!',
    enemySleeps: '{enemy} falls asleep!',
    enemyConfused: '{enemy} is confused!',
    enemyPushed: '{enemy} is pushed back!',
    equip: 'You equip the {item}.',
    noPet: 'You have no pet.',
    birdEscape: 'The Grabber Bird carries you away!',
    pythonWeakens: 'The Python weakens all visible enemies!',
    teddyConfuses: 'The Teddy confuses nearby enemies!',
    screamFreezes: "The {enemy}'s scream freezes you!",
    eggEaten: 'The {enemy} ate your egg!',
    enemyHits: 'The {enemy} hits you for {n} damage!',
    playerDefeated: 'You have been defeated...',
    torchOut: 'Your torch has gone out! Danger increases!',
    torchLow: 'Your torch is flickering...',
    eggHatched: 'Your egg hatched into a {pet}!',
    playerFrozen: 'You are frozen and cannot move!',
    wait: 'You wait...',
    dropped: 'You dropped the {item}.',
  },
  aria: {
    surfaceMap: 'Surface map',
    floorMap: (floor: number) => `Dungeon floor ${floor}`,
    dir: {
      up: 'Move up',
      down: 'Move down',
      left: 'Move left',
      right: 'Move right',
      upLeft: 'Move up-left',
      upRight: 'Move up-right',
      downLeft: 'Move down-left',
      downRight: 'Move down-right',
    },
    throwDir: {
      up: 'Throw up',
      down: 'Throw down',
      left: 'Throw left',
      right: 'Throw right',
    },
  },
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
  petNames: { grabber_bird: 'つかみ鳥', python: 'ニシキヘビ', teddy: 'テディ' },
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
    '「視界内の敵」には見えている敵のHPと、1回の攻撃で与える・受けるダメージが表示される。',
  ],
  sight: {
    title: '視界内の敵',
    empty: '視界に敵はいません。',
    count: (shown, total) => (total > shown ? `${total}体中 近い${shown}体` : `${total}体`),
    dealt: range => `与ダメ ${range}`,
    taken: range => `被ダメ ${range}`,
    enemyNames: {
      slime: 'スライム', bat: 'コウモリ', goblin: 'ゴブリン', skeleton: 'スケルトン', orc: 'オーク',
      worm: 'ワーム', imp: 'インプ', ghost: 'ゴースト', golem: 'ゴーレム', dragon: 'ドラゴン',
    },
    status: {
      sleep: '睡眠', frozen: '凍結', confused: '混乱',
      powered_up: '強化', shielded: '防御強化',
    },
    traits: {
      resistsMagic: '巻物無効',
      canPassWalls: '壁抜け',
      eatsEggs: '卵を食べる',
      canDisable: '凍結の叫び',
    },
  },
  itemNames: {
    'Wooden Sword': '木の剣', 'Bronze Sword': '青銅の剣', 'Iron Sword': '鉄の剣',
    'Steel Sword': '鋼の剣', 'Silver Sword': '銀の剣', 'Golden Sword': '金の剣',
    'Platinum Sword': '白金の剣', 'Mythril Sword': 'ミスリルの剣', 'Diamond Sword': 'ダイヤの剣',
    'Legendary Sword': '伝説の剣',
    'Cloth Armor': '布の服', 'Leather Armor': '革の鎧', 'Chainmail': '鎖かたびら',
    'Scale Armor': 'うろこの鎧', 'Plate Armor': '板金の鎧', 'Silver Armor': '銀の鎧',
    'Golden Armor': '金の鎧', 'Mythril Armor': 'ミスリルの鎧', 'Diamond Armor': 'ダイヤの鎧',
    'Legendary Armor': '伝説の鎧',
    'Fireball Scroll': '火球の巻物', 'Freeze Scroll': '氷結の巻物', 'Teleport Scroll': '転移の巻物',
    'Map Scroll': '地図の巻物', 'Power Scroll': '力の巻物', 'Shield Scroll': '守りの巻物',
    'Attack Card': '攻撃カード', 'Sleep Card': '睡眠カード', 'Confuse Card': '混乱カード',
    'Force Card': '衝撃カード', 'Heal Card': '回復カード',
    'Bird Egg': '鳥の卵', 'Snake Egg': '蛇の卵', 'Bear Egg': '熊の卵',
    'Torch': '松明', 'Health Potion': '回復薬',
  },
  itemDescriptions: {
    weapon: '攻撃 +{n}',
    armor: '防御 +{n}',
    torch: '松明の明かりを {n} 回復',
    potion: 'HPを30回復',
    scroll: {
      [ScrollEffect.FIREBALL]: '見えている敵すべてを焼く',
      [ScrollEffect.FREEZE]: '見えている敵すべてを凍らせる',
      [ScrollEffect.TELEPORT]: 'ランダムな場所へ転移',
      [ScrollEffect.MAP_REVEAL]: 'フロア全体を明らかにする',
      [ScrollEffect.POWER_UP]: '10ターンの間、攻撃力アップ',
      [ScrollEffect.SHIELD]: '10ターンの間、防御力アップ',
    },
    card: {
      [CardEffect.DAMAGE]: '投げて離れた敵にダメージ',
      [CardEffect.SLEEP]: '敵を眠らせる',
      [CardEffect.CONFUSE]: '敵の動きを混乱させる',
      [CardEffect.KNOCKBACK]: '敵を押し返す',
      [CardEffect.HEAL]: '自分に使うとHP回復',
    },
    egg: {
      [PetType.GRABBER_BIRD]: 'つかみ鳥が孵る（脱出の能力）',
      [PetType.PYTHON]: 'ニシキヘビが孵る（敵を弱らせる）',
      [PetType.TEDDY]: 'テディが孵る（敵を導く）',
    },
  },
  log: {
    welcome: 'ダンジョンへようこそ！階段を見つけて下へ進もう。',
    controls: '矢印キーか WASD で移動。「.」で1ターン待つ。',
    seeItem: 'ここに{item}がある。「g」で拾う。',
    defeated: '{enemy}を倒した！（経験値 +{n}）',
    dragonFalls: 'ドラゴンを倒した！出口が開いた — 階段から脱出しよう。',
    hit: '{enemy}に{n}のダメージ！',
    levelUp: 'レベルアップ！レベル{n}になった！',
    noStairs: 'ここに階段はない。',
    dragonBlocks: 'ドラゴンが脱出を阻んでいる。先に倒そう！',
    escaped: 'ダンジョンから脱出した！勝利！',
    bossPresence: 'この階に強大な気配を感じる…',
    descend: '{n}階へ降りた。',
    nothingHere: 'ここに拾えるものはない。',
    inventoryFull: '持ち物がいっぱいだ！',
    pickedUp: '{item}を拾った。',
    useTorch: '松明を使った。明かりが{n}に回復。',
    drinkPotion: '回復薬を飲んだ。HPが{n}回復。',
    eggNotReady: '卵が孵るにはまだ時間がかかる。',
    teleport: '別の場所へ転移した！',
    mapRevealed: 'フロア全体が明らかになった！',
    poweredUp: '攻撃力が強化された！',
    shielded: '魔法の盾に包まれた！',
    fireballHits: '火球が敵{n}体に命中！',
    noEnemiesInSight: '視界に敵はいない。',
    frozenEnemies: '敵が凍りついた！',
    healCard: '回復カードでHPが{n}回復！',
    chooseThrow: 'カードを投げる方向を選ぼう。',
    cardMissed: 'カードは闇の中へ飛んでいった…',
    cardHits: 'カードが{enemy}に命中、{n}のダメージ！',
    enemySleeps: '{enemy}は眠った！',
    enemyConfused: '{enemy}は混乱した！',
    enemyPushed: '{enemy}を押し返した！',
    equip: '{item}を装備した。',
    noPet: 'ペットがいない。',
    birdEscape: 'つかみ鳥があなたを運び去った！',
    pythonWeakens: 'ニシキヘビが見えている敵すべてを弱らせた！',
    teddyConfuses: 'テディが近くの敵を混乱させた！',
    screamFreezes: '{enemy}の叫びで体が凍りついた！',
    eggEaten: '{enemy}に卵を食べられた！',
    enemyHits: '{enemy}の攻撃で{n}のダメージ！',
    playerDefeated: 'あなたは倒れた…',
    torchOut: '松明が消えた！危険が増す！',
    torchLow: '松明の火が揺らいでいる…',
    eggHatched: '卵が孵って{pet}が生まれた！',
    playerFrozen: '体が凍りついて動けない！',
    wait: '様子をうかがった…',
    dropped: '{item}を捨てた。',
  },
  aria: {
    surfaceMap: '地上マップ',
    floorMap: (floor: number) => `ダンジョン ${floor} 階`,
    dir: {
      up: '上へ移動',
      down: '下へ移動',
      left: '左へ移動',
      right: '右へ移動',
      upLeft: '左上へ移動',
      upRight: '右上へ移動',
      downLeft: '左下へ移動',
      downRight: '右下へ移動',
    },
    throwDir: {
      up: '上へ投げる',
      down: '下へ投げる',
      left: '左へ投げる',
      right: '右へ投げる',
    },
  },
};

export function getMiniAdventureStrings(language: GameLanguage): MiniAdventureStrings {
  return language === 'ja' ? ja : en;
}

type Placeholder = 'item' | 'enemy' | 'pet' | 'n';
type PlaceholderValues = Partial<Record<Placeholder, string>>;
const PLACEHOLDER = /\{(item|enemy|pet|n)\}/g;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Each English log template as a whole-line pattern, with its placeholder names in capture order. */
const LOG_PATTERNS = (Object.keys(en.log) as LogKey[]).map((key) => {
  const template = en.log[key];
  const names: Placeholder[] = [];
  let source = '';
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    source += escapeRegExp(template.slice(last, match.index));
    source += match[1] === 'n' ? '(\\d+)' : '(.+?)';
    names.push(match[1] as Placeholder);
    last = (match.index ?? 0) + match[0].length;
  }
  source += escapeRegExp(template.slice(last));
  return { key, names, re: new RegExp(`^${source}$`) };
});

const fill = (template: string, values: PlaceholderValues) =>
  template.replace(PLACEHOLDER, (_, name: Placeholder) => values[name] ?? '');

function byEnglishName<K extends string>(names: Record<K, string>): Map<string, K> {
  return new Map((Object.keys(names) as K[]).map(id => [names[id], id]));
}
const ENEMY_BY_NAME = byEnglishName(en.sight.enemyNames);
const PET_BY_NAME = byEnglishName(en.petNames);

/** Which log message an engine line is, with its values; null when no template matches. */
export function parseLogText(text: string): { key: LogKey; values: PlaceholderValues } | null {
  for (const { key, names, re } of LOG_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const values: PlaceholderValues = {};
    names.forEach((name, i) => { values[name] = match[i + 1]; });
    return { key, values };
  }
  return null;
}

/** An engine log line in the UI language. English, and any line no template matches, is shown as written. */
export function localizeLogText(text: string, language: GameLanguage): string {
  if (language !== 'ja') return text;
  const parsed = parseLogText(text);
  if (!parsed) return text;
  const t = getMiniAdventureStrings(language);
  const { item, enemy, pet, n } = parsed.values;
  const enemyId = enemy === undefined ? undefined : ENEMY_BY_NAME.get(enemy);
  const petId = pet === undefined ? undefined : PET_BY_NAME.get(pet);
  return fill(t.log[parsed.key], {
    item: item === undefined ? undefined : (t.itemNames[item as ItemName] ?? item),
    enemy: enemyId ? t.sight.enemyNames[enemyId] : enemy,
    pet: petId ? t.petNames[petId] : pet,
    n,
  });
}

/** An item's name in the UI language (in English, exactly as the engine wrote it). */
export function localizeItemName(item: Pick<Item, 'name'>, language: GameLanguage): string {
  if (language !== 'ja') return item.name;
  return getMiniAdventureStrings(language).itemNames[item.name as ItemName] ?? item.name;
}

/** An item's description in the UI language, built from the item's data (in English, exactly as the engine wrote it). */
export function localizeItemDescription(item: Item, language: GameLanguage): string {
  if (language !== 'ja') return item.description;
  const d = getMiniAdventureStrings(language).itemDescriptions;
  switch (item.type) {
    case ItemType.WEAPON:
      return item.weaponData ? fill(d.weapon, { n: String(item.weaponData.attack) }) : item.description;
    case ItemType.ARMOR:
      return item.armorData ? fill(d.armor, { n: String(item.armorData.defense) }) : item.description;
    case ItemType.TORCH:
      return item.torchValue !== undefined ? fill(d.torch, { n: String(item.torchValue) }) : item.description;
    case ItemType.POTION:
      return d.potion;
    case ItemType.SCROLL:
      return item.scrollEffect ? d.scroll[item.scrollEffect] : item.description;
    case ItemType.CARD:
      return item.cardEffect ? d.card[item.cardEffect] : item.description;
    case ItemType.EGG:
      return item.petType ? d.egg[item.petType] : item.description;
    default:
      return item.description;
  }
}
