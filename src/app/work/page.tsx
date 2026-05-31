import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Layers3, ShieldCheck } from 'lucide-react';
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

const highlights = [
  { label: 'Focus', value: 'Fintech platforms' },
  { label: 'Ownership', value: 'Architecture to rollout' },
  { label: 'Selected cases', value: `${caseStudies.length}` },
];

export default function WorkIndex() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.headerTop}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
            Back to home
          </Link>
          <span className={styles.availability}>Product engineering case studies</span>
        </div>

        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.kicker}>Selected Work</p>
            <h1 className={styles.title}>Systems that moved from prototype to production.</h1>
            <p className={styles.subtitle}>
              Long-form case studies of recent engineering work: what was broken,
              how I approached it as the directly responsible individual, and what
              changed.
            </p>
          </div>
          <div className={styles.highlightPanel} aria-label="Work highlights">
            {highlights.map((highlight) => (
              <div key={highlight.label} className={styles.highlightItem}>
                <span className={styles.highlightLabel}>{highlight.label}</span>
                <strong className={styles.highlightValue}>{highlight.value}</strong>
              </div>
            ))}
          </div>
        </header>

        <ul className={styles.list}>
          {caseStudies.map((cs) => (
            <li key={cs.slug}>
              <Link href={`/work/${cs.slug}`} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.eyebrow}>{cs.year}</div>
                    <h2 className={styles.cardTitle}>{cs.title}</h2>
                  </div>
                  <span className={styles.cardAction} aria-hidden="true">
                    <ArrowUpRight size={18} strokeWidth={2} />
                  </span>
                </div>
                <p className={styles.cardSummary}>{cs.summary}</p>
                <dl className={styles.cardFacts}>
                  <div>
                    <dt>
                      <BriefcaseBusiness aria-hidden="true" size={15} strokeWidth={2} />
                      Role
                    </dt>
                    <dd>{cs.role}</dd>
                  </div>
                  <div>
                    <dt>
                      <Layers3 aria-hidden="true" size={15} strokeWidth={2} />
                      Scope
                    </dt>
                    <dd>{cs.scope}</dd>
                  </div>
                  <div>
                    <dt>
                      <ShieldCheck aria-hidden="true" size={15} strokeWidth={2} />
                      Impact
                    </dt>
                    <dd>{cs.impact}</dd>
                  </div>
                </dl>
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
