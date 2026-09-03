import { describe, expect, it } from 'vitest';

import { createI18nInstance } from '@/lib/i18n';

describe('createI18nInstance', () => {
  it('initializes synchronously in the requested language', () => {
    const english = createI18nInstance('en');
    const japanese = createI18nInstance('ja');

    expect(english.isInitialized).toBe(true);
    expect(japanese.isInitialized).toBe(true);
    expect(english.t('home.hero.greeting')).toBe('Hello, my name is');
    expect(japanese.t('home.hero.greeting')).toBe('こんにちは、私は');
  });

  it('keeps concurrent render instances isolated', async () => {
    const english = createI18nInstance('en');
    const japanese = createI18nInstance('ja');

    await english.changeLanguage('ja');
    await english.changeLanguage('en');

    expect(english.language).toBe('en');
    expect(japanese.language).toBe('ja');
  });
});
