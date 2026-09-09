import { expect, it } from 'vitest';
import { articleLearningInput, articleLearningMaterial } from '@/lib/articleLearning';
import type { StudyArticle } from '@/types/study';

const article = { id: 'lesson-1', title: 'Article', summary: 'Summary', keyTakeaways: ['Takeaway'], updatedAt: '2026-09-09T01:00:00Z', sections: [{ id: 's1', title: 'Section', content: 'Original body', order: 0, codeExamples: [{ id: 'c1', language: 'js', code: 'write(chunk)', explanation: 'Original code' }] }] } as StudyArticle;
it('attaches the exact article and section IDs without changing the save contract', () => {
  const material = articleLearningMaterial(article, 's1', 'engineering');
  expect(material.article).toEqual({ id: 'lesson-1', sectionId: 's1', updatedAt: article.updatedAt });
  expect(material.content).toContain('Original body'); expect(material.content).toContain('write(chunk)');
  expect(material.revision).toBeUndefined();
  expect(articleLearningInput(article, 's1', 'engineering')).not.toHaveProperty('article');
});
it('identifies a summary excerpt without inventing a real section ID', () => {
  expect(articleLearningMaterial(article, 'summary', 'engineering').article).toEqual({ id: 'lesson-1', updatedAt: article.updatedAt });
  expect(() => articleLearningMaterial(article, 'missing', 'engineering')).toThrow('Section not found');
});
