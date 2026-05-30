import type { Metadata } from 'next';
import Link from 'next/link';
import { caseStudies } from '@/content/work/caseStudies';
import styles from './work.module.css';

export const metadata: Metadata = {
  title: 'Selected Work',
  description:
    'Long-form case studies of recent engineering work — what was broken, how I approached it, and what changed.',
  openGraph: {
    title: 'Selected Work | Yudai Yaguchi',
    description:
      'Long-form case studies of recent engineering work — what was broken, how I approached it, and what changed.',
  },
};

export default function WorkIndex() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.backLink}>
            <span aria-hidden="true">←</span> Back to home
          </Link>
          <h1 className={styles.title}>Selected Work</h1>
          <p className={styles.subtitle}>
            Long-form case studies of recent engineering work — what was broken,
            how I approached it as the directly responsible individual, and what
            changed.
          </p>
        </header>

        <ul className={styles.list}>
          {caseStudies.map((cs) => (
            <li key={cs.slug}>
              <Link href={`/work/${cs.slug}`} className={styles.card}>
                <div className={styles.eyebrow}>{cs.year}</div>
                <h2 className={styles.cardTitle}>{cs.title}</h2>
                <p className={styles.cardSummary}>{cs.summary}</p>
                <div className={styles.tagList}>
                  {cs.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
