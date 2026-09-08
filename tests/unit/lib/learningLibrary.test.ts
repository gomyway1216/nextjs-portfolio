import { describe, expect, it } from 'vitest';
import { safeLearningUrl, LEARNING_DOMAINS } from '@/lib/learningLibrary';
import { articleLearningInput } from '@/lib/articleLearning';
import type { StudyArticle } from '@/types/study';

describe('Learning Library references and article capture', () => {
  it('rejects active URLs, credentials and non-web references', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///private', 'https://name:password@example.com']) expect(safeLearningUrl(url)).toBeUndefined();
    expect(safeLearningUrl('https://example.com/lesson#section')).toBe('https://example.com/lesson#section');
  });
  it('preserves the selected original diagram and source anchor without generating content', () => {
    const content = 'Original explanation\n```mermaid\nflowchart LR\nA --> B\n```';
    const article = { id: 'a1', title: 'Article', summary: 'Summary', language: 'en', keyTakeaways: ['One'], sections: [{ id: 's1', title: 'Concept', content }] } as unknown as StudyArticle;
    const saved = articleLearningInput(article, 's1', 'engineering');
    expect(saved.content).toBe(content); expect(saved.domains).toEqual(['engineering']); expect(saved.language).toBe('en');
    expect(saved.sources?.[0].url).toBe('https://www.meetyudai.com/study/articles/a1#section-s1');
    expect(saved).not.toHaveProperty('generateFlashcards'); expect(saved).not.toHaveProperty('extractTerms');
    expect(saved.sourceKey).toBe(articleLearningInput(article, 's1', 'engineering').sourceKey);
    expect(() => articleLearningInput(article, 'missing', 'engineering')).toThrow();
  });
  it('includes broad learning domains without changing the article generator', () => {
    expect(LEARNING_DOMAINS).toEqual(['engineering', 'english', 'finance', 'society', 'other']);
  });
});
