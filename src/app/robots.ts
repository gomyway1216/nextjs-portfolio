import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/siteConfig';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/memory',
          '/account',
          '/api',
          '/signin',
          '/new-project',
          '/projects/*/edit',
          '/achievements',
          '/voice-chat',
          '/voice-tasks',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
