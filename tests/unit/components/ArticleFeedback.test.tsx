import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { createI18nInstance } from '@/lib/i18n';
import ArticleFeedback from '@/components/study/ArticleFeedback';

vi.mock('@/services/studyService', () => ({ getArticleFeedback: vi.fn(), saveArticleFeedback: vi.fn() }));

describe('ArticleFeedback translations', () => {
  it.each([
    ['ja', 'ためになった', 'ためにならなかった', '細かすぎる・エッジケース'],
    ['en', 'Useful', 'Not useful', 'Too niche / edge case'],
  ] as const)('renders real %s button labels, not missing translation keys', (language, useful, notUseful, reason) => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance(language)}>
        <ArticleFeedback articleId="lesson-1" />
      </I18nextProvider>
    );
    expect(html).toContain(useful);
    expect(html).toContain(notUseful);
    expect(html).toContain(reason);
    expect(html).not.toContain('articleFeedback.');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('disabled=""');
  });
});
