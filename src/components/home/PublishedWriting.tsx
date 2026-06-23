'use client';

import { ArrowUpRight, Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SITE_URL } from '@/lib/siteConfig';
import { formatDate } from '@/lib/utils/util';
import { writingSummary, type Writing } from '@/lib/writing';
import styles from './PublishedWriting.module.css';

interface PublishedWritingProps {
  // Server-rendered in app/page.tsx (Firestore, with a built-in default
  // fallback), so the cards and their JSON-LD ship in the SSR HTML.
  writings: Writing[];
}

export default function PublishedWriting({ writings }: PublishedWritingProps) {
  const { t, i18n } = useTranslation();

  // Nothing published (e.g. every entry hidden) → render no section.
  if (writings.length === 0) return null;

  // BlogPosting nodes whose author @id points at the Person node defined in
  // app/layout.tsx, so search engines connect each article back to Yudai.
  const writingJsonLd = {
    '@context': 'https://schema.org',
    '@graph': writings.map((w) => ({
      '@type': 'BlogPosting',
      headline: w.title,
      url: w.url,
      ...(w.date ? { datePublished: w.date } : {}),
      author: { '@id': `${SITE_URL}/#person` },
      publisher: { '@type': 'Organization', name: w.source },
    })),
  };

  // Escape '<' so a value containing '</script>' can't break out of the
  // inline script tag (defense-in-depth).
  const writingJsonLdHtml = JSON.stringify(writingJsonLd).replace(/</g, '\\u003c');

  return (
    <section id="writing" className="section modern-section">
      <div className="container">
        <div className="title modern-title">
          <h3>{t('home.writing.title')}</h3>
          <p>{t('home.writing.subtitle')}</p>
        </div>

        <ul className={styles.list}>
          {writings.map((w) => (
            <li className={styles.item} key={w.id}>
              <span className={styles.icon} aria-hidden="true">
                <Newspaper size={20} strokeWidth={2} />
              </span>
              <div className={styles.body}>
                <div className={styles.meta}>
                  <span>{w.source}</span>
                  {w.date ? <span>· {formatDate(w.date)}</span> : null}
                </div>
                <h4 className={styles.title}>
                  {/* rel="noopener" (not noreferrer) so the referrer reaches
                      the destination's analytics; the link stays followable. */}
                  <a className={styles.link} href={w.url} target="_blank" rel="noopener">
                    {w.title}
                    <span className={styles.srOnly}> {t('home.writing.newTab')}</span>
                  </a>
                </h4>
                <p className={styles.summary}>{writingSummary(w, i18n.language)}</p>
                <span className={styles.readMore} aria-hidden="true">
                  {t('home.writing.readLabel', { source: w.source })}
                  <ArrowUpRight size={16} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: writingJsonLdHtml }}
      />
    </section>
  );
}
