import { CHARACTERS, type Character, type Element, type Words } from './data';

export type Reaction = 'steam' | 'flare' | 'bloom';
export const AURA_SECONDS = 4;
export const REACTION_COOLDOWN = 2;
export const RESONANCE_HP = 1.2;
export const RESONANCE_ATTACK = 1.15;
export const REACTIONS: Record<Reaction, { elements: readonly [Element, Element]; name: Words; detail: Words; color: string }> = {
  steam: { elements: ['fire', 'water'], name: { ja: '蒸気バースト', en: 'Steam burst' }, detail: { ja: '発動した攻撃の75%を追加ダメージ', en: 'Extra damage equal to 75% of the triggering attack' }, color: '#eac8f2' },
  flare: { elements: ['fire', 'wind'], name: { ja: '火花拡散', en: 'Spark spread' }, detail: { ja: '標的と周囲14以内の敵へ、攻撃の50%を追加ダメージ', en: 'Extra 50% attack damage to the target and enemies within 14 units' }, color: '#ffc18c' },
  bloom: { elements: ['water', 'wind'], name: { ja: '恵みの風', en: 'Restoring breeze' }, detail: { ja: '戦場の味方全体を、発動した攻撃の50%分回復', en: 'Heal every living ally for 50% of the triggering attack' }, color: '#a6e8c5' },
};

export function reactionFor(first: Element, second: Element): Reaction | null {
  if (first === second) return null;
  return (Object.keys(REACTIONS) as Reaction[]).find((id) => REACTIONS[id].elements.includes(first) && REACTIONS[id].elements.includes(second)) ?? null;
}

/** Distinct selected companions count; redeploying one companion never stacks resonance. */
export function partyElements(team: readonly string[], characters: readonly Character[] = CHARACTERS) {
  const counts: Record<Element, number> = { fire: 0, water: 0, wind: 0 };
  for (const id of new Set(team)) {
    const cat = characters.find((entry) => entry.id === id);
    if (cat) counts[cat.element]++;
  }
  const present = (Object.keys(counts) as Element[]).filter((element) => counts[element] > 0);
  return { counts, resonances: present.filter((element) => counts[element] >= 2), reactions: (Object.keys(REACTIONS) as Reaction[]).filter((id) => REACTIONS[id].elements.every((element) => counts[element] > 0)) };
}
