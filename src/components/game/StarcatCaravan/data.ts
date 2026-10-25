export type Language = 'en' | 'ja';
export type Element = 'fire' | 'water' | 'wind' | 'ice' | 'lightning';
export type Ability = 'none' | 'strike' | 'splash' | 'chain' | 'ward' | 'mend' | 'frost';
export type Role = 'guard' | 'fighter' | 'ranger' | 'healer';
export type Rarity = 3 | 4 | 5;
export type Words = Record<Language, string>;

export interface Character {
  id: string;
  /** Public image URL; null explicitly selects the lightweight vector sprite. */
  portraitUrl?: string | null;
  name: Words;
  title: Words;
  rarity: Rarity;
  element: Element;
  role: Role;
  fur: string;
  accent: string;
  hp: number;
  attack: number;
  defense?: number;
  ability?: Ability;
  abilityName?: Words;
  range: number;
  speed: number;
  cost: number;
  cooldown: number;
}

const INITIAL_CHARACTERS: Character[] = [
  { id: 'ember', portraitUrl: '/img/games/starcat-caravan/characters/ember-v1.webp', name: { ja: 'コハク', en: 'Ember' }, title: { ja: '小さな勇者', en: 'Little adventurer' }, rarity: 3, element: 'fire', role: 'fighter', fur: '#f6bd79', accent: '#ed9870', hp: 180, attack: 30, range: 6, speed: 7, cost: 45, cooldown: 3 },
  { id: 'brook', portraitUrl: '/img/games/starcat-caravan/characters/brook-v1.webp', name: { ja: 'ミナモ', en: 'Brook' }, title: { ja: '湖の守り手', en: 'Lake guardian' }, rarity: 3, element: 'water', role: 'guard', fur: '#e1e8ec', accent: '#79bad9', hp: 350, attack: 16, range: 5, speed: 4, cost: 55, cooldown: 4 },
  { id: 'breeze', name: { ja: 'ソヨ', en: 'Breeze' }, title: { ja: '風の射手', en: 'Wind archer' }, rarity: 3, element: 'wind', role: 'ranger', fur: '#b8b7a7', accent: '#95d3b0', hp: 110, attack: 28, range: 20, speed: 5, cost: 60, cooldown: 4 },
  { id: 'moss', portraitUrl: '/img/games/starcat-caravan/characters/moss-v1.webp', name: { ja: 'ワカバ', en: 'Moss' }, title: { ja: '森の薬師', en: 'Forest herbalist' }, rarity: 3, element: 'wind', role: 'healer', fur: '#e4d7bc', accent: '#99bf7c', hp: 140, attack: 18, range: 18, speed: 4, cost: 65, cooldown: 5 },
  { id: 'spark', name: { ja: 'ヒバナ', en: 'Spark' }, title: { ja: 'いたずら剣士', en: 'Mischievous duelist' }, rarity: 3, element: 'fire', role: 'fighter', fur: '#b9917f', accent: '#edb26e', hp: 140, attack: 36, range: 5, speed: 9, cost: 50, cooldown: 3 },
  { id: 'pearl', name: { ja: 'シズク', en: 'Pearl' }, title: { ja: '潮騒の奏者', en: 'Tide songkeeper' }, rarity: 3, element: 'water', role: 'ranger', fur: '#f2eae3', accent: '#a1c9e8', hp: 130, attack: 25, range: 22, speed: 5, cost: 60, cooldown: 4 },
  { id: 'maple', portraitUrl: '/img/games/starcat-caravan/characters/maple-v1.webp', name: { ja: 'カエデ', en: 'Maple' }, title: { ja: '紅葉の騎士', en: 'Autumn knight' }, rarity: 4, element: 'fire', role: 'guard', fur: '#e1a46d', accent: '#e8887c', hp: 520, attack: 35, range: 6, speed: 5, cost: 85, cooldown: 5 },
  { id: 'mist', name: { ja: 'カスミ', en: 'Mist' }, title: { ja: '霧の魔法使い', en: 'Mist spellweaver' }, rarity: 4, element: 'water', role: 'ranger', fur: '#c2c4de', accent: '#aba2df', hp: 180, attack: 55, range: 24, speed: 5, cost: 100, cooldown: 6 },
  { id: 'clover', name: { ja: 'ヨツバ', en: 'Clover' }, title: { ja: '芽吹きの賢者', en: 'Bloom sage' }, rarity: 4, element: 'wind', role: 'healer', fur: '#f2e6c7', accent: '#a5d2a1', hp: 220, attack: 36, range: 22, speed: 4, cost: 90, cooldown: 6 },
  { id: 'gale', name: { ja: 'ハヤテ', en: 'Gale' }, title: { ja: '翠風の剣士', en: 'Jade swordsman' }, rarity: 4, element: 'wind', role: 'fighter', fur: '#717d81', accent: '#77cbb6', hp: 280, attack: 58, range: 7, speed: 9, cost: 85, cooldown: 5 },
  { id: 'luna', portraitUrl: '/img/games/starcat-caravan/characters/luna-v1.webp', name: { ja: 'ルナ', en: 'Luna' }, title: { ja: '星を紡ぐ魔女', en: 'Weaver of stars' }, rarity: 5, element: 'water', role: 'ranger', fur: '#fff0d9', accent: '#f2d584', hp: 270, attack: 90, range: 27, speed: 5, cost: 135, cooldown: 8 },
  { id: 'sol', portraitUrl: '/img/games/starcat-caravan/characters/sol-v1.webp', name: { ja: 'ソル', en: 'Sol' }, title: { ja: '暁の守護騎士', en: 'Dawn paladin' }, rarity: 5, element: 'fire', role: 'guard', fur: '#f8d395', accent: '#edb659', hp: 750, attack: 65, range: 7, speed: 5, cost: 130, cooldown: 8 },
  { id: 'yuki', name: { ja: 'ユキ', en: 'Yuki' }, title: { ja: '雪花の剣舞', en: 'Snowpetal dancer' }, rarity: 4, element: 'ice', role: 'fighter', fur: '#ecf3f8', accent: '#9eddec', hp: 300, attack: 56, range: 8, speed: 7, cost: 85, cooldown: 5 },
  { id: 'fubuki', name: { ja: 'フブキ', en: 'Fubuki' }, title: { ja: '氷河の守護獣', en: 'Glacier guardian' }, rarity: 5, element: 'ice', role: 'guard', fur: '#f2f6fa', accent: '#91cce6', hp: 720, attack: 64, range: 8, speed: 4, cost: 130, cooldown: 8 },
  { id: 'raika', name: { ja: 'ライカ', en: 'Raika' }, title: { ja: '雷走りの斥候', en: 'Lightning trail scout' }, rarity: 4, element: 'lightning', role: 'ranger', fur: '#554739', accent: '#e3bf65', hp: 190, attack: 52, range: 23, speed: 7, cost: 95, cooldown: 6 },
  { id: 'shiden', name: { ja: 'シデン', en: 'Shiden' }, title: { ja: '紫電の奏者', en: 'Violet songkeeper' }, rarity: 5, element: 'lightning', role: 'healer', fur: '#555064', accent: '#c1a2ed', hp: 330, attack: 62, range: 24, speed: 5, cost: 125, cooldown: 8 },
];

export const ORIGINAL_CHARACTER_IDS = ['ember', 'brook', 'breeze', 'moss', 'spark', 'pearl', 'maple', 'mist', 'clover', 'gale', 'luna', 'sol'] as const;
const gifts: Record<string, { defense: number; ability: Ability; abilityName: Words }> = {
  ember: { defense: 12, ability: 'strike', abilityName: { ja: '勇気の一閃', en: 'Brave slash' } },
  brook: { defense: 28, ability: 'ward', abilityName: { ja: 'さざ波の守り', en: 'Ripple shelter' } },
  breeze: { defense: 6, ability: 'strike', abilityName: { ja: '風縫いの一矢', en: 'Windwoven arrow' } },
  moss: { defense: 8, ability: 'mend', abilityName: { ja: '木漏れ日の薬', en: 'Sunlit remedy' } },
  spark: { defense: 9, ability: 'strike', abilityName: { ja: '火遊びの二連刃', en: 'Twin ember blades' } },
  pearl: { defense: 7, ability: 'mend', abilityName: { ja: '潮騒の旋律', en: 'Tidal melody' } },
  maple: { defense: 36, ability: 'ward', abilityName: { ja: '紅葉の守り', en: 'Autumn aegis' } },
  mist: { defense: 10, ability: 'splash', abilityName: { ja: '霧雨の波紋', en: 'Misty ripple' } },
  clover: { defense: 14, ability: 'mend', abilityName: { ja: '四つ葉の祝福', en: 'Clover blessing' } },
  gale: { defense: 18, ability: 'splash', abilityName: { ja: '翠風の輪舞', en: 'Jade wind dance' } },
  luna: { defense: 20, ability: 'splash', abilityName: { ja: '星月の奔流', en: 'Moonstar torrent' } },
  sol: { defense: 48, ability: 'ward', abilityName: { ja: '暁光の結界', en: 'Dawn sanctuary' } },
  yuki: { defense: 20, ability: 'frost', abilityName: { ja: '雪花の刃', en: 'Snowpetal edge' } },
  fubuki: { defense: 50, ability: 'ward', abilityName: { ja: '氷河の抱擁', en: 'Glacier embrace' } },
  raika: { defense: 12, ability: 'chain', abilityName: { ja: '雷走の連矢', en: 'Thunderchain bolts' } },
  shiden: { defense: 22, ability: 'mend', abilityName: { ja: '紫電の調べ', en: 'Violet overture' } },
};
export const CHARACTERS: Character[] = INITIAL_CHARACTERS.map((cat) => ({ ...cat, ...gifts[cat.id], portraitUrl: cat.portraitUrl ?? `/img/games/starcat-caravan/characters/${cat.id}-v1.webp` }));
export const RARITY_POWER: Record<Rarity, number> = { 3: 1, 4: 1.2, 5: 1.5 };

export function characterById(id: string, characters: readonly Character[] = CHARACTERS): Character {
  const character = characters.find((entry) => entry.id === id);
  if (!character) throw new Error(`Unknown starcat: ${id}`);
  return character;
}

export const ELEMENTS: Record<Element, { name: Words; color: string; symbol: string }> = {
  fire: { name: { ja: '火', en: 'Fire' }, color: '#f1a88e', symbol: '✹' },
  water: { name: { ja: '水', en: 'Water' }, color: '#94cbea', symbol: '◈' },
  wind: { name: { ja: '風', en: 'Wind' }, color: '#a1d8b7', symbol: '❧' },
  ice: { name: { ja: '氷', en: 'Ice' }, color: '#b5e6f6', symbol: '❄' },
  lightning: { name: { ja: '雷', en: 'Lightning' }, color: '#d2b2fa', symbol: 'ϟ' },
};
export const ROLES: Record<Role, Words> = {
  guard: { ja: '盾役', en: 'Guardian' }, fighter: { ja: '近接', en: 'Fighter' },
  ranger: { ja: '遠距離', en: 'Ranger' }, healer: { ja: '回復', en: 'Healer' },
};
export const STAGES = [
  { name: { ja: 'はじまりの草原', en: 'Firstlight Meadow' }, subtitle: { ja: '小さな一歩、大きな冒険。', en: 'Little paws. A grand adventure.' }, element: 'wind', hp: 650, enemies: 7, interval: 7, strength: 1, gems: 500, coins: 250 },
  { name: { ja: 'ささやきの森', en: 'Whispering Woods' }, subtitle: { ja: '木漏れ日の向こうに。', en: 'Follow the rustling leaves.' }, element: 'water', hp: 1000, enemies: 10, interval: 6, strength: 1.35, gems: 550, coins: 350 },
  { name: { ja: '夕映えの遺跡', en: 'Emberfall Ruins' }, subtitle: { ja: '眠る灯火をもう一度。', en: 'Rekindle an ancient light.' }, element: 'fire', hp: 1400, enemies: 13, interval: 5.5, strength: 1.75, gems: 600, coins: 450 },
  { name: { ja: '月しずくの湖', en: 'Moonwater Lake' }, subtitle: { ja: '凍る湖面に映る、もう一つの空。', en: 'Another sky in the frozen lake.' }, element: 'ice', hp: 1900, enemies: 16, interval: 5, strength: 2.2, gems: 650, coins: 550 },
  { name: { ja: '天空の回廊', en: 'Skyward Passage' }, subtitle: { ja: '雷鳴を越えて、星のそばへ。', en: 'Beyond the thunder, among the stars.' }, element: 'lightning', hp: 2400, enemies: 19, interval: 4.8, strength: 2.7, gems: 700, coins: 650 },
  { name: { ja: '星降りの城', en: 'Starfall Citadel' }, subtitle: { ja: '旅の終わりに、願いをひとつ。', en: 'One final wish at journey’s end.' }, element: 'fire', hp: 3200, enemies: 22, interval: 4.5, strength: 3.3, gems: 1000, coins: 1000 },
] as const;

export const SUMMON_COST = 100;
export const PITY_FIVE = 50;
export const PITY_FOUR = 10;
export const MAX_LEVEL = 20;
export const SAVE_KEY = 'starcat-caravan-v1';
