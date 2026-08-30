import { describe, expect, it } from 'vitest';

import {
  BLOG_SOCIAL_IMAGE_ALT,
  BLOG_SOCIAL_IMAGE_PATH,
  buildBlogSocialImages,
  buildTwitterImages,
} from '@/lib/blog/socialMetadata';

describe('blog social metadata', () => {
  it('uses a post image when one is available', () => {
    expect(buildBlogSocialImages('https://cdn.example.com/cover.webp', 'Post title')).toEqual([
      { url: 'https://cdn.example.com/cover.webp', alt: 'Post title' },
    ]);
  });

  it.each([undefined, null, '', '   '])(
    'uses the explicit blog fallback for a missing image (%s)',
    (imageUrl) => {
      expect(buildBlogSocialImages(imageUrl, 'Post title')).toEqual([
        {
          url: BLOG_SOCIAL_IMAGE_PATH,
          width: 1200,
          height: 630,
          type: 'image/png',
          alt: BLOG_SOCIAL_IMAGE_ALT,
        },
      ]);
    },
  );

  it('keeps Twitter images limited to supported URL and alt fields', () => {
    const images = buildBlogSocialImages(undefined, 'Post title');

    expect(buildTwitterImages(images)).toEqual([
      { url: BLOG_SOCIAL_IMAGE_PATH, alt: BLOG_SOCIAL_IMAGE_ALT },
    ]);
  });
});
