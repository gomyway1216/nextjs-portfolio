import type { Role, Words } from './data';

export const ROLE_DETAILS: Record<Role, { brief: Words; tactic: Words }> = {
  guard: { brief: { ja: '高いHPで仲間を支える', en: 'High HP to support the party' }, tactic: { ja: '高いHPと防御力で、パーティー全体の耐久力を底上げ。仲間全員でHPを共有します。', en: 'High HP and defense improve your party’s endurance. All companions share one HP pool.' } },
  fighter: { brief: { ja: '近づいて敵を攻撃する', en: 'Close-range damage' }, tactic: { ja: '近くの敵を自動で攻撃。別の属性の仲間と同じ敵を狙うと、属性連携を起こせます。', en: 'Automatically attack nearby enemies. Hit the same enemy with another element to trigger a reaction.' } },
  ranger: { brief: { ja: '離れた場所から攻撃する', en: 'Attack from a distance' }, tactic: { ja: '長い射程で離れた敵を自動で攻撃。敵へ属性を付け、ほかの仲間と連携できます。', en: 'Automatically attack enemies with long reach. Apply an element early for other companions to combine with.' } },
  healer: { brief: { ja: '傷ついた仲間を回復する', en: 'Heal injured companions' }, tactic: { ja: 'パーティーHPが90%未満なら、1.5秒ごとに回復。回復が不要な時は半分の威力で攻撃します。', en: 'Heal the shared party HP every 1.5 seconds when below 90%. When healing is not needed, attack at half power.' } },
};

export const GUIDE_URL = '/games/starcat-caravan/guide';
