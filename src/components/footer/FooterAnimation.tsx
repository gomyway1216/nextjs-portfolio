'use client';
import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useProfile } from '@/hooks/useProfile';
import { resolveSocialLinks } from '@/lib/socialLinks';
import { SOCIAL_PLATFORM_META } from '@/components/socialPlatforms';
import type { Profile } from '@/hooks/useProfile';

interface FooterProps {
  initialProfile?: Profile | null;
}

// Internal links repeated in the footer so every page that renders it
// (home, 404) offers a path into the main sections without scrolling back
// up — and so crawlers see the section index from the bottom of the page.
const FOOTER_NAV_LINKS = [
  { href: '/blog', labelKey: 'home.nav.blog' },
  { href: '/projects', labelKey: 'home.nav.work' },
  { href: '/tools', labelKey: 'home.nav.tools' },
  { href: '/games', labelKey: 'home.nav.games' },
  { href: '/study', labelKey: 'home.nav.study' },
  { href: '/growth', labelKey: 'home.nav.growth' },
] as const;

const Footer = ({ initialProfile }: FooterProps) => {
  const { t } = useTranslation();
  const { profile } = useProfile(initialProfile);
  const links = resolveSocialLinks(profile);

  return (
    <>
      <nav className="footer-links" aria-label={t('footer.navLabel')}>
        {FOOTER_NAV_LINKS.map(({ href, labelKey }) => (
          <Link key={href} href={href}>
            {t(labelKey)}
          </Link>
        ))}
        {/* Plain <a>: the feed is a route handler, not a page to prefetch. */}
        <a href="/rss.xml" type="application/rss+xml">
          {t('footer.rss')}
        </a>
      </nav>
      <div className="row align-items-center">
        <div className="col-md-6 my-2">
          <div className="nav justify-content-center justify-content-md-start">
            {links.map(({ platform, url }) => {
              const { Icon, label } = SOCIAL_PLATFORM_META[platform];
              return (
                <a key={`${platform}-${url}`} href={url} rel="noopener noreferrer" target="_blank" aria-label={label}>
                  <Icon />
                </a>
              );
            })}
          </div>
          {/* End .nav */}
        </div>
        {/* End .col */}

        <div className="col-md-6 my-2 text-center text-md-end">
          <p>
            © {new Date().getFullYear()} Yudai Yaguchi. All rights reserved.
          </p>
        </div>
        {/* End .col */}
      </div>
      {/* End .row */}
    </>
  );
};

export default Footer;
