/**
 * Local ja/en strings for NEW Animal Roleplay UI chrome.
 *
 * Existing gameplay strings still live in the shared locale JSON and are read via
 * react-i18next's `t()`. Anything added during the revamp lives here so we don't
 * mutate shared translation files. Pick a language with `useGameLanguage()`.
 */

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
};

export function getLocalStrings(language: string): LocalStrings {
  return language === 'ja' ? ja : en;
}
