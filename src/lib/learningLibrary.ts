export const LEARNING_DOMAINS = ['engineering', 'english', 'finance', 'society', 'other'] as const;
export type LearningDomain = typeof LEARNING_DOMAINS[number];
export const LEARNING_KINDS = ['concept', 'word', 'expression', 'practice'] as const;
export type LearningKind = typeof LEARNING_KINDS[number];
export type LearningAssessment = 'again' | 'remembered' | 'understood' | 'pause';

export interface LearningItem {
  id: string; title: string; content: string; summary: string;
  domains: LearningDomain[]; kind: LearningKind; language: 'ja' | 'en' | 'other';
  tags: string[]; goals: string[];
  sources: Array<{ label: string; url?: string; locator?: string }>;
  diagrams: Array<{ title: string; mermaid: string }>;
  figures: Array<{ title: string; url: string }>;
  relatedIds: string[]; linkedArticleIds: string[];
  state: 'saved' | 'learning' | 'understood'; revision: number;
  createdAt?: string; updatedAt?: string; nextReviewAt?: string; lastReviewedAt?: string;
  examples?: Array<{ sentence?: string; explanation?: string; context?: string; codeExample?: string; language?: string }>;
  pronunciation?: string; visibility: 'private';
}
export interface SaveLearningInput {
  sourceKey: string; title: string; content: string;
  domains: LearningDomain[]; kind: LearningKind; language: 'ja' | 'en' | 'other';
  sources?: LearningItem['sources']; diagrams?: LearningItem['diagrams']; figures?: LearningItem['figures'];
  relatedIds?: string[]; goals?: string[]; tags?: string[];
}
export function safeLearningUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; }
  catch { return undefined; }
}
export const learningLabels = {
  ja: {
    domains: { engineering: 'エンジニアリング', english: '英語', finance: '金融・お金', society: '社会の仕組み', other: 'その他・未分類' },
    kinds: { concept: 'コンセプト', word: '単語', expression: '表現', practice: '実践・学び方' },
    states: { saved: '保存済み', learning: '復習中', understood: '自己評価：説明できる' },
    assessments: { again: 'まだ曖昧 · 明日', remembered: '思い出せた · 3日後', understood: '説明できる · 7日後', pause: '復習を休む' },
  },
  en: {
    domains: { engineering: 'Engineering', english: 'English', finance: 'Finance', society: 'How society works', other: 'Other / ungrouped' },
    kinds: { concept: 'Concept', word: 'Word', expression: 'Expression', practice: 'Practice' },
    states: { saved: 'Saved', learning: 'Reviewing', understood: 'Self-assessed: can explain' },
    assessments: { again: 'Still unclear · tomorrow', remembered: 'Recalled it · in 3 days', understood: 'Can explain it · in 7 days', pause: 'Pause reviews' },
  },
};
