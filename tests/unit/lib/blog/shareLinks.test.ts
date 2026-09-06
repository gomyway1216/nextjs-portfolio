import { describe, expect, it } from 'vitest';
import { buildShareTargets } from '@/lib/blog/shareLinks';

describe('buildShareTargets', () => {
  const url = 'https://www.meetyudai.com/blog/system-design/idempotency?x=1&y=2';
  const title = 'Idempotency & retries: "safe" writes';

  it('returns X, LinkedIn and Hatena intents with the URL and title encoded', () => {
    const targets = buildShareTargets(url, title);
    expect(targets.map((t) => t.network)).toEqual(['x', 'linkedin', 'hatena']);

    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    expect(targets[0].href).toBe(`https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}`);
    expect(targets[1].href).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`);
    expect(targets[2].href).toBe(
      `https://b.hatena.ne.jp/entry/panel/?url=${encodedUrl}&btitle=${encodedTitle}`,
    );
  });

  it('never leaks raw ampersands or quotes from the title into the query string', () => {
    for (const target of buildShareTargets(url, title)) {
      const query = target.href.slice(target.href.indexOf('?') + 1);
      expect(query).not.toMatch(/["\s]/);
      // Only the separators we wrote ourselves remain unencoded.
      expect(query.split('&').every((pair) => pair.includes('='))).toBe(true);
    }
  });
});
