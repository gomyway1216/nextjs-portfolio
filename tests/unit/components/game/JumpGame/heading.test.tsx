import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import JumpGame from '@/components/game/JumpGame';
import { jumpGameUITranslations } from '@/components/game/constants/gameTranslations';
import { createI18nInstance } from '@/lib/i18n';

// The game reads the signed-in user to save high scores; render it signed out.
vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ currentUser: null, loading: false }),
}));

const render = (language: 'en' | 'ja') =>
  renderToStaticMarkup(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <JumpGame />
    </I18nextProvider>,
  );

describe('Jump Game heading', () => {
  it('names the game in both languages', () => {
    expect(jumpGameUITranslations.en.title).toBe('Jump Game');
    expect(jumpGameUITranslations.ja.title).toBe('ジャンプゲーム');
  });

  // The game fills the page with a canvas and shows no title, so the page's
  // only main heading is this one for screen readers and search engines.
  it('renders exactly one main heading, before the canvas', () => {
    const markup = render('en');
    expect(markup.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(markup).toMatch(/<h1 class="[^"]*srOnly[^"]*">Jump Game<\/h1>/);
    expect(markup.indexOf('<h1')).toBeLessThan(markup.indexOf('<canvas'));
  });

  it('is localized', () => {
    expect(render('ja')).toMatch(/<h1 class="[^"]*srOnly[^"]*">ジャンプゲーム<\/h1>/);
  });
});
