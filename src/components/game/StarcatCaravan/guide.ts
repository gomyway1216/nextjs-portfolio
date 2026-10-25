import type { Role, Words } from './data';

export const ROLE_DETAILS: Record<Role, { brief: Words; tactic: Words }> = {
  guard: { brief: { ja: '高いHPで前線を支える', en: 'High HP to hold the frontline' }, tactic: { ja: '先に出撃させ、後ろの仲間を守る壁に。攻撃力より耐久力が得意です。', en: 'Deploy first to form a durable frontline for the companions behind them.' } },
  fighter: { brief: { ja: '近づいて敵を攻撃する', en: 'Close-range damage' }, tactic: { ja: '敵へ近づいて攻撃。異なる属性の仲間と同じ敵を狙うと、属性連携を起こせます。', en: 'Move into close range and attack. Hit the same enemy with another element to trigger a reaction.' } },
  ranger: { brief: { ja: '離れた場所から攻撃する', en: 'Attack from a distance' }, tactic: { ja: '長い射程で後ろから攻撃。先に敵へ属性を付け、近づく仲間と連携できます。', en: 'Attack with long reach. Apply an element early for approaching companions to combine with.' } },
  healer: { brief: { ja: '傷ついた仲間を回復する', en: 'Heal injured companions' }, tactic: { ja: '射程内でHPの割合が最も低い仲間を優先して回復。回復しない時は半分の威力で攻撃します。', en: 'Heal the ally in range with the lowest HP ratio. When not healing, attack at half power.' } },
};

export const GUIDE_URL = '/games/starcat-caravan/guide';
