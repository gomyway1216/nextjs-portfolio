'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SOCIAL_PLATFORM_META } from '@/components/socialPlatforms';
import { DEFAULT_SOCIAL_LINKS } from '@/lib/socialLinks';
import styles from './author-card.module.css';

const AVATAR_SRC = '/img/about/about-me.jpg';

/**
 * "Written by" card under an article. Search visitors land on a post, not
 * the home page — this is where they learn who wrote it and where to go
 * next. Static links on purpose (no profile fetch on every article).
 */
const AuthorCard = () => {
  const { t } = useTranslation();
  const name = t('home.hero.name');

  return (
    <aside className={styles.card} aria-label={t('blogPage.author.label')}>
      <div className={styles.avatar}>
        <Image src={AVATAR_SRC} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
      </div>
      <div className={styles.body}>
        <p className={styles.kicker}>{t('blogPage.author.label')}</p>
        <p className={styles.name}>{name}</p>
        <p className={styles.role}>{t('home.about.role')}</p>
        <p className={styles.blurb}>{t('blogPage.author.blurb')}</p>
        <div className={styles.links}>
          <Link className={styles.link} href="/#about">
            {t('blogPage.author.aboutLink')}
          </Link>
          <Link className={styles.link} href="/blog">
            {t('blogPage.author.allPosts')}
          </Link>
          {DEFAULT_SOCIAL_LINKS.map(({ platform, url }) => {
            const { Icon, label } = SOCIAL_PLATFORM_META[platform];
            return (
              <a
                key={platform}
                className={styles.social}
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
      </div>
    </aside>
  );
};

export default AuthorCard;
