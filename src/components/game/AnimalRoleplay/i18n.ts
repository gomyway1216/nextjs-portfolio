/**
 * Local ja/en strings for NEW Animal Roleplay UI chrome.
 *
 * Existing gameplay strings still live in the shared locale JSON and are read via
 * react-i18next's `t()`. Anything added during the revamp lives here so we don't
 * mutate shared translation files. Pick a language with `useGameLanguage()`.
 */

import type { RunLuck } from './runReview';
import type { Difficulty } from './types';

export interface LocalStrings {
  difficulty: {
    heading: string;
    labels: Record<Difficulty, string>;
    descriptions: Record<Difficulty, string>;
  };
  chooseAnimalHeading: string;
  bestScore: string;
  successChance: string;
  threat: string;
  food: string;
  progress: string;
  survived: string;
  bestBadge: string;
  startRun: string;
  actionHint: string;
  review: {
    heading: string;
    chartLabel: string;
    turnsLabel: string;
    successes: (count: number, total: number, expected: string) => string;
    luck: Record<RunLuck, string>;
    topPicks: (count: number, total: number) => string;
    topNote: string;
    lowest: (hp: number, hunger: number) => string;
    highest: (action: string, chance: number) => string;
  };
}

const en: LocalStrings = {
  difficulty: {
    heading: 'Difficulty',
    labels: { easy: 'Cub', normal: 'Wild', hard: 'Feral' },
    descriptions: {
      easy: 'Gentler threats, forgiving hunger.',
      normal: 'Balanced wilderness survival.',
      hard: 'Brutal threats, higher score reward.',
    },
  },
  chooseAnimalHeading: 'Choose your animal',
  bestScore: 'Best',
  successChance: 'Success',
  threat: 'Threat',
  food: 'Food',
  progress: 'Progress',
  survived: 'Survived',
  bestBadge: 'New best!',
  startRun: 'Start run',
  actionHint: 'Predicted success is shown on each action.',
  review: {
    heading: 'Run review',
    chartLabel: 'HP and hunger after each turn',
    turnsLabel: 'Turn by turn',
    successes: (count, total, expected) =>
      `Succeeded on ${count} of ${total} turns. The success chances of the actions you chose added up to ${expected}.`,
    luck: {
      lucky: 'The rolls went your way.',
      unlucky: 'The rolls went against you.',
      even: 'The rolls landed about where the chances pointed.',
    },
    topPicks: (count, total) =>
      `You chose the action with the highest success chance on ${count} of ${total} turns.`,
    topNote:
      'The highest chance only compares success rates. It does not weigh what each action gains or costs.',
    lowest: (hp, hunger) => `Lowest HP ${hp} · Lowest hunger ${hunger}`,
    highest: (action, chance) => `Highest chance: ${action} ${chance}%`,
  },
};

const ja: LocalStrings = {
  difficulty: {
    heading: '難易度',
    labels: { easy: '子ども', normal: '野生', hard: '獰猛' },
    descriptions: {
      easy: '脅威は穏やか、空腹も緩やか。',
      normal: 'バランスの取れたサバイバル。',
      hard: '脅威は過酷、スコア報酬は高め。',
    },
  },
  chooseAnimalHeading: '動物を選ぶ',
  bestScore: '最高',
  successChance: '成功率',
  threat: '脅威',
  food: '食料',
  progress: '進行',
  survived: '生存',
  bestBadge: '自己ベスト！',
  startRun: 'ゲーム開始',
  actionHint: '各行動には予測成功率を表示しています。',
  review: {
    heading: '今回の振り返り',
    chartLabel: '各ターン後のHPと空腹',
    turnsLabel: 'ターンごとの記録',
    successes: (count, total, expected) =>
      `${total}ターン中${count}回成功。選んだ行動の成功率を合計すると${expected}回分でした。`,
    luck: {
      lucky: '運は味方でした。',
      unlucky: '運には恵まれませんでした。',
      even: 'ほぼ成功率どおりの結果でした。',
    },
    topPicks: (count, total) => `${total}ターン中${count}回、成功率が最も高い行動を選びました。`,
    topNote: '「成功率最高」は成功率だけの比較です。行動ごとの得失は考慮していません。',
    lowest: (hp, hunger) => `HPの最低値 ${hp} · 空腹の最低値 ${hunger}`,
    highest: (action, chance) => `成功率最高: ${action} ${chance}%`,
  },
};

export function getLocalStrings(language: string): LocalStrings {
  return language === 'ja' ? ja : en;
}
