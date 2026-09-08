import type { StudyArticle } from '@/types/study';
import type { LearningDomain, SaveLearningInput } from './learningLibrary';

export function articleLearningInput(article: StudyArticle & { language?: string }, sectionId: string, domain: LearningDomain): SaveLearningInput {
  const section = article.sections.find((s) => s.id === sectionId);
  if (sectionId !== 'summary' && !section) throw new Error('Section not found');
  const code = section?.codeExamples?.map((example) => `\n\n\`\`\`${example.language}\n${example.code}\n\`\`\`\n${example.explanation || ''}`).join('') || '';
  return {
    sourceKey: `article:${article.id}:${sectionId}`,
    title: section?.title || article.title,
    content: section ? `${section.content}${code}` : `${article.summary}\n\n${article.keyTakeaways.map((item) => `- ${item}`).join('\n')}`,
    domains: [domain], kind: 'concept', language: article.language === 'en' ? 'en' : 'ja',
    sources: [{ label: article.title, url: `https://www.meetyudai.com/study/articles/${encodeURIComponent(article.id)}${section ? `#section-${encodeURIComponent(section.id)}` : '#takeaways'}`, locator: section?.title || 'Summary / key takeaways' }],
  };
}
