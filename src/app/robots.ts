import type { MetadataRoute } from 'next';

const SITE_URL = 'https://meetyudai.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/account',
          '/api/',
          '/signin',
          '/new-project',
          '/achievements',
          '/voice-chat',
          '/voice-tasks',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
