import { describe, expect, it } from 'vitest';
import { categoryDisplayLabel, titleCaseCategory } from '@/lib/blog/categoryLabelKeys';

describe('categoryDisplayLabel', () => {
  const t = (key: string) => `t(${key})`;

  it('translates curated categories through their i18n key', () => {
    expect(categoryDisplayLabel('system-design', t)).toBe('t(blogPage.index.categories.systemDesign)');
    expect(categoryDisplayLabel('all', t)).toBe('t(blogPage.index.categories.all)');
  });

  it('title-cases unknown slugs instead of showing the raw value', () => {
    expect(categoryDisplayLabel('ml-ops', t)).toBe('Ml Ops');
    expect(titleCaseCategory('--odd--slug-')).toBe('Odd Slug');
  });
});

describe('ai-engineering category', () => {
  const t = (key: string) => `t(${key})`;

  it('has a curated label instead of the title-cased "Ai Engineering"', () => {
    expect(categoryDisplayLabel('ai-engineering', t)).toBe('t(blogPage.index.categories.aiEngineering)');
  });
});
