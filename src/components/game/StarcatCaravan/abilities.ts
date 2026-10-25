import type { Ability, Character, Words } from './data';

export const ABILITIES: Record<Ability, { name: Words; detail: Words }> = {
  none: { name: { ja: '通常攻撃', en: 'Normal attack' }, detail: { ja: '追加能力なし。', en: 'No additional ability.' } },
  strike: { name: { ja: '追撃', en: 'Follow-up strike' }, detail: { ja: '通常攻撃4回ごとに、標的へ攻撃力75%の追加ダメージ。', en: 'Every 4 normal attacks, deal an extra 75% attack damage to the target.' } },
  splash: { name: { ja: '範囲攻撃', en: 'Area burst' }, detail: { ja: '通常攻撃4回ごとに、標的と周囲12以内へ攻撃力60%の追加ダメージ。', en: 'Every 4 normal attacks, deal extra 60% attack damage to the target and enemies within 12 units.' } },
  chain: { name: { ja: '連鎖攻撃', en: 'Chain attack' }, detail: { ja: '通常攻撃4回ごとに、標的の周囲20以内の別の敵を最大2体、攻撃力70%で追撃。', en: 'Every 4 normal attacks, strike up to 2 other enemies within 20 units of the target for 70% attack damage.' } },
  ward: { name: { ja: '守護結界', en: 'Protective ward' }, detail: { ja: '戦闘開始から10秒ごとに、自分の最大HP8%分の結界でパーティーHPを守る。6秒持続、共有HPの25%まで。重ねても加算しません。', en: 'Every 10 seconds, protect the shared party HP with a ward of 8% of this companion’s max HP for 6 seconds, capped at 25% of party HP. Wards do not stack.' } },
  mend: { name: { ja: '癒しの波', en: 'Healing pulse' }, detail: { ja: '戦闘開始から10秒ごとに、パーティーHPを攻撃・回復力80%分回復。HPが0になった戦闘は再挑戦です。', en: 'Every 10 seconds, heal party HP for 80% of attack/healing power. A battle at zero HP must be retried.' } },
  frost: { name: { ja: '氷の刃', en: 'Frost edge' }, detail: { ja: '通常攻撃4回ごとに攻撃力50%の追撃と1秒の凍結。ボスは凍結時間が半分。', en: 'Every 4 normal attacks, add 50% attack damage and freeze for 1 second. Bosses freeze for half as long.' } },
};

export function abilityFor(cat: Character) { return { id: cat.ability ?? 'none', name: cat.abilityName ?? ABILITIES[cat.ability ?? 'none'].name, detail: ABILITIES[cat.ability ?? 'none'].detail }; }
