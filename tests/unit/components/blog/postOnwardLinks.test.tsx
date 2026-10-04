import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';

import AuthorCard from '@/components/blog/AuthorCard';
import MoreFromCategory from '@/components/blog/MoreFromCategory';
import PostListItem from '@/components/blog/PostListItem';
import PostShareLinks from '@/components/blog/PostShareLinks';
import { createI18nInstance } from '@/lib/i18n';
import { DEFAULT_SOCIAL_LINKS } from '@/lib/socialLinks';

const render = (node: React.ReactElement, language: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(
    <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>,
  );

describe('PostShareLinks', () => {
  const url = 'https://www.meetyudai.com/blog/system-design/idempotency';

  it('renders one intent link per network plus a copy button', () => {
    const markup = render(<PostShareLinks url={url} title="Idempotency" />);
    const links = markup.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain(encodeURIComponent(url));
    }
    expect(markup).toContain('aria-label="Share on X"');
    expect(markup).toContain('aria-label="Share on LinkedIn"');
    expect(markup).toContain('Copy link');
  });

  it('localizes the labels', () => {
    const markup = render(<PostShareLinks url={url} title="冪等性" />, 'ja');
    expect(markup).toContain('aria-label="Xでシェア"');
    expect(markup).toContain('リンクをコピー');
  });
});

describe('AuthorCard', () => {
  it('names the author and links onward to the profile, the blog index and the social profiles', () => {
    const markup = render(<AuthorCard />);
    expect(markup).toContain('Written by');
    expect(markup).toContain('Yudai Yaguchi');
    expect(markup).toContain('href="/#about"');
    expect(markup).toContain('href="/blog"');
    for (const { url } of DEFAULT_SOCIAL_LINKS) {
      expect(markup).toContain(`href="${url}"`);
    }
  });
});

describe('MoreFromCategory', () => {
  const posts = [
    {
      id: 'p1',
      slug: 'first-post',
      title: 'First post',
      category: 'system-design',
      language: 'en' as const,
      // Midday UTC so the rendered calendar day is the same in any test-runner timezone.
      created: '2026-08-01T12:00:00.000Z',
    },
    {
      id: 'p2',
      slug: 'second post',
      title: 'Second post',
      category: 'system-design',
      language: 'en' as const,
      created: 'not-a-date',
    },
  ];

  it('renders nothing when there is nothing to offer', () => {
    expect(render(<MoreFromCategory category="system-design" posts={[]} />)).toBe('');
  });

  it('renders a translated heading and canonical, URL-encoded post links', () => {
    const markup = render(<MoreFromCategory category="system-design" posts={posts} />);
    expect(markup).toContain('More in System Design');
    expect(markup).toContain('href="/blog/system-design/first-post"');
    expect(markup).toContain('href="/blog/system-design/second%20post"');
    expect(markup).toContain('Aug 1, 2026');
    expect(markup).toContain('Second post');
  });

  it('translates the heading and the date on the Japanese locale', () => {
    const markup = render(<MoreFromCategory category="system-design" posts={posts} />, 'ja');
    expect(markup).toContain('システム設計の他の記事');
    expect(markup).toContain('2026年8月1日');
  });
});

describe('blog dates do not depend on the viewer’s time zone', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  // 02:00 UTC on Jul 18 is still Jul 17 in California and already Jul 18 in Tokyo.
  // The server (UTC) and every browser must print the same day, or hydration fails.
  const instant = '2026-07-18T02:00:00.000Z';

  it.each(['America/Los_Angeles', 'Asia/Tokyo'])('renders the same day in %s', (zone) => {
    process.env.TZ = zone;
    expect(new Date(instant).getTimezoneOffset()).not.toBe(0);

    const more = [{ id: 'p1', slug: 'first-post', title: 'First post', category: 'system-design', language: 'en' as const, created: instant }];
    expect(render(<MoreFromCategory category="system-design" posts={more} />)).toContain('Jul 18, 2026');
    expect(render(<MoreFromCategory category="system-design" posts={more} />, 'ja')).toContain('2026年7月18日');

    const item = (language: string) => (
      <PostListItem id="p1" slug="first-post" title="First post" summary="Summary" lastUpdated={instant} category="system-design" language={language} handleClick={() => {}} />
    );
    expect(render(item('en'))).toContain('Jul 18, 2026');
    expect(render(item('ja'), 'ja')).toContain('2026年7月18日');
  });
});
