'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SOCIAL_PLATFORM_META } from '@/components/socialPlatforms';
import { RSS_PATH, SITE_SECTION_LINKS } from '@/lib/siteNav';
import { DEFAULT_SOCIAL_LINKS } from '@/lib/socialLinks';
import styles from './site-footer.module.css';

/**
 * Compact footer for the sub-sites (blog, projects) that previously ended
 * with nothing below the content. Links to every main section plus the
 * social profiles, so a reader who arrived from search can keep going.
 */
const SiteFooter = () => {
  const { t } = useTranslation();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <nav className={styles.nav} aria-label={t('siteFooter.navLabel')}>
          <Link href="/">{t('home.nav.home')}</Link>
          {SITE_SECTION_LINKS.map(({ href, labelKey }) => (
            <Link key={href} href={href}>
              {t(labelKey)}
            </Link>
          ))}
          <a href={RSS_PATH} type="application/rss+xml">
            {t('siteFooter.rss')}
          </a>
        </nav>
        <div className={styles.meta}>
          <div className={styles.social} aria-label={t('siteFooter.socialLabel')}>
            {DEFAULT_SOCIAL_LINKS.map(({ platform, url }) => {
              const { Icon, label } = SOCIAL_PLATFORM_META[platform];
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                >
                  <Icon aria-hidden="true" />
                </a>
              );
            })}
          </div>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} {t('home.hero.name')}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
