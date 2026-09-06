import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import SiteFooter from '@/components/common/SiteFooter';
import { createI18nInstance } from '@/lib/i18n';
import { RSS_PATH, SITE_SECTION_LINKS } from '@/lib/siteNav';
import { DEFAULT_SOCIAL_LINKS } from '@/lib/socialLinks';

describe('SiteFooter', () => {
  it('links to home, every site section, the RSS feed and the social profiles', () => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <SiteFooter />
      </I18nextProvider>,
    );

    expect(markup).toMatch(/<footer/);
    expect(markup).toContain('href="/"');
    for (const { href } of SITE_SECTION_LINKS) {
      expect(markup).toContain(`href="${href}"`);
    }
    expect(markup).toContain(`href="${RSS_PATH}"`);
    for (const { url } of DEFAULT_SOCIAL_LINKS) {
      expect(markup).toContain(`href="${url}"`);
    }
    expect(markup).toContain(`© ${new Date().getFullYear()} Yudai Yaguchi`);
  });
});
