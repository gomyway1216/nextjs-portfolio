'use client';

import { ArrowUpRight, Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SITE_URL } from '@/lib/siteConfig';
import styles from './PublishedWriting.module.css';

interface Publication {
  id: string;
  /** Title as published — stays in the original language for both locales. */
  title: string;
  /** Publisher shown on the card and used as the article's publisher. */
  source: string;
  url: string;
  /**
   * Optional ISO date (e.g. '2026-06-18'). Shown on the card and emitted as
   * datePublished in structured data when present. Left unset until the
   * exact publication date is confirmed.
   */
  date?: string;
}

// External, published articles authored by Yudai. Add new pieces here — the
// card list and the BlogPosting structured data are both generated from this
// array, and each entry needs a matching `home.writing.items.<id>.summary`
// string in the locale files.
const publications: Publication[] = [
  {
    id: 'explainable-states',
    title: 'Why Financial Products Need Explainable States',
    source: 'Atlas Engineering',
    url: 'https://www.atlasfin.com/post/why-financial-products-need-explainable-states',
  },
];

export default function PublishedWriting() {
  const { t } = useTranslation();

  // BlogPosting nodes whose author @id points at the Person node defined in
  // app/layout.tsx, so search engines connect each article back to Yudai.
  const writingJsonLd = {
    '@context': 'https://schema.org',
    '@graph': publications.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: p.url,
      ...(p.date ? { datePublished: p.date } : {}),
      author: { '@id': `${SITE_URL}/#person` },
      publisher: { '@type': 'Organization', name: p.source },
    })),
  };

  // Escape '<' so a value containing '</script>' can't break out of the
  // inline script tag (defense-in-depth for future entries).
  const writingJsonLdHtml = JSON.stringify(writingJsonLd).replace(/</g, '\\u003c');

  return (
    <section id="writing" className="section modern-section">
      <div className="container">
        <div className="title modern-title">
          <h3>{t('home.writing.title')}</h3>
          <p>{t('home.writing.subtitle')}</p>
        </div>

        <ul className={styles.list}>
          {publications.map((p) => (
            <li className={styles.item} key={p.id}>
              <span className={styles.icon} aria-hidden="true">
                <Newspaper size={20} strokeWidth={2} />
              </span>
              <div className={styles.body}>
                <div className={styles.meta}>
                  <span>{p.source}</span>
                  {p.date ? <span>· {p.date}</span> : null}
                </div>
                <h4 className={styles.title}>
                  {/* rel="noopener" (not noreferrer) so the referrer reaches
                      the destination's analytics; the link stays followable. */}
                  <a className={styles.link} href={p.url} target="_blank" rel="noopener">
                    {p.title}
                    <span className={styles.srOnly}> {t('home.writing.newTab')}</span>
                  </a>
                </h4>
                <p className={styles.summary}>{t(`home.writing.items.${p.id}.summary`)}</p>
                <span className={styles.readMore} aria-hidden="true">
                  {t('home.writing.readLabel', { source: p.source })}
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
