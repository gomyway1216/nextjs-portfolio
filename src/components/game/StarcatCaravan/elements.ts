import { CHARACTERS, type Character, type Element, type Words } from './data';

export type Reaction = 'steam' | 'flare' | 'bloom' | 'melt' | 'freeze' | 'blizzard' | 'overload' | 'shock' | 'storm' | 'shatter';
export const AURA_SECONDS = 4;
export const REACTION_COOLDOWN = 2;
export const RESONANCE_HP = 1.2;
export const RESONANCE_ATTACK = 1.15;
export const ELEMENT_ADVANTAGES: Record<Element, readonly Element[]> = { fire: ['wind', 'ice'], water: ['fire'], wind: ['water'], ice: ['lightning'], lightning: ['water'] };
export const REACTIONS: Record<Reaction, { elements: readonly [Element, Element]; name: Words; detail: Words; color: string }> = {
  steam: { elements: ['fire', 'water'], name: { ja: '蒸気バースト', en: 'Steam burst' }, detail: { ja: '発動した攻撃の75%を追加ダメージ', en: 'Extra damage equal to 75% of the triggering attack' }, color: '#eac8f2' },
  flare: { elements: ['fire', 'wind'], name: { ja: '火花拡散', en: 'Spark spread' }, detail: { ja: '標的と周囲14以内の敵へ、攻撃の50%を追加ダメージ', en: 'Extra 50% attack damage to the target and enemies within 14 units' }, color: '#ffc18c' },
  bloom: { elements: ['water', 'wind'], name: { ja: '恵みの風', en: 'Restoring breeze' }, detail: { ja: 'パーティーHPを、発動した攻撃の50%分回復', en: 'Heal party HP for 50% of the triggering attack' }, color: '#a6e8c5' },
  melt: { elements: ['fire', 'ice'], name: { ja: '融雪の閃光', en: 'Thaw flash' }, detail: { ja: '標的へ攻撃力85%の追加ダメージ', en: 'Extra 85% attack damage to the target' }, color: '#f3ccbc' },
  freeze: { elements: ['water', 'ice'], name: { ja: '氷結', en: 'Deep freeze' }, detail: { ja: '標的へ25%の追撃と1.2秒の凍結。ボスは半分', en: 'Extra 25% damage and freeze for 1.2 seconds (half for bosses)' }, color: '#b5e6f6' },
  blizzard: { elements: ['wind', 'ice'], name: { ja: '霜の嵐', en: 'Frost gale' }, detail: { ja: '標的と周囲14以内へ45%の追撃と0.6秒の凍結。ボスは半分', en: 'Extra 45% damage and a 0.6-second freeze within 14 units (half freeze for bosses)' }, color: '#caefe7' },
  overload: { elements: ['fire', 'lightning'], name: { ja: '雷火の爆ぜ', en: 'Thunderflare' }, detail: { ja: '標的と周囲14以内へ攻撃力65%の追加ダメージ', en: 'Extra 65% attack damage to the target and enemies within 14 units' }, color: '#edb5df' },
  shock: { elements: ['water', 'lightning'], name: { ja: '感電の輪', en: 'Conductive ring' }, detail: { ja: '標的と周囲20以内の敵2体まで、攻撃力65%で追撃', en: 'Extra 65% attack damage to the target and up to 2 enemies within 20 units' }, color: '#bcbff8' },
  storm: { elements: ['wind', 'lightning'], name: { ja: '疾雷', en: 'Storm arc' }, detail: { ja: '標的と周囲25以内の敵2体まで、攻撃力50%で追撃', en: 'Extra 50% attack damage to the target and up to 2 enemies within 25 units' }, color: '#d7dfb1' },
  shatter: { elements: ['ice', 'lightning'], name: { ja: '砕氷の雷', en: 'Shatterbolt' }, detail: { ja: '標的へ攻撃力100%の追加ダメージ', en: 'Extra 100% attack damage to the target' }, color: '#d7d3ff' },
};

export function reactionFor(first: Element, second: Element): Reaction | null {
  if (first === second) return null;
  return (Object.keys(REACTIONS) as Reaction[]).find((id) => REACTIONS[id].elements.includes(first) && REACTIONS[id].elements.includes(second)) ?? null;
}

/** Distinct selected companions count; redeploying one companion never stacks resonance. */
export function partyElements(team: readonly string[], characters: readonly Character[] = CHARACTERS) {
  const counts: Record<Element, number> = { fire: 0, water: 0, wind: 0, ice: 0, lightning: 0 };
  for (const id of new Set(team)) {
    const cat = characters.find((entry) => entry.id === id);
    if (cat) counts[cat.element]++;
  }
  const present = (Object.keys(counts) as Element[]).filter((element) => counts[element] > 0);
  return { counts, resonances: present.filter((element) => counts[element] >= 2), reactions: (Object.keys(REACTIONS) as Reaction[]).filter((id) => REACTIONS[id].elements.every((element) => counts[element] > 0)) };
}
