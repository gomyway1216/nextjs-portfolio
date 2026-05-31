import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Home,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { caseStudies, getCaseStudyBySlug } from '@/content/work/caseStudies';
import styles from '../work.module.css';

interface Params {
  slug: string;
}

// Pre-render every case study at build time.
export function generateStaticParams(): Params[] {
  return caseStudies.map((cs) => ({ slug: cs.slug }));
}

// Case studies are fully static; any slug not in generateStaticParams
// should 404 at the routing level rather than attempt a dynamic render.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cs = getCaseStudyBySlug(slug);
  if (!cs) return {};

  return {
    title: cs.title,
    description: cs.summary,
    openGraph: {
      title: `${cs.title} | Yudai Yaguchi`,
      description: cs.summary,
      type: 'article',
    },
    twitter: {
      title: `${cs.title} | Yudai Yaguchi`,
      description: cs.summary,
    },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const cs = getCaseStudyBySlug(slug);
  if (!cs) notFound();

  const facts = [
    { label: 'Year', value: cs.year, icon: CalendarDays },
    { label: 'Role', value: cs.role, icon: BriefcaseBusiness },
    { label: 'Scope', value: cs.scope, icon: Layers3 },
    { label: 'Impact', value: cs.impact, icon: ShieldCheck },
  ];

  return (
    <main className={styles.page}>
      <div className={`${styles.shell} ${styles.articleShell}`}>
        <Link href="/work" className={styles.backLink}>
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
          Selected Work
        </Link>

        <header className={styles.articleHeader}>
          <p className={styles.kicker}>Case Study</p>
          <h1 className={`${styles.title} ${styles.articleTitle}`}>{cs.title}</h1>
          <p className={`${styles.subtitle} ${styles.articleSummary}`}>{cs.summary}</p>
          <div className={styles.tagList}>
            {cs.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className={styles.articleGrid}>
          <aside className={styles.articleAside}>
            <dl className={styles.articleFacts} aria-label="Case study summary">
              {facts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <div key={fact.label} className={styles.articleFact}>
                    <span className={styles.articleFactIcon} aria-hidden="true">
                      <Icon size={17} strokeWidth={2} />
                    </span>
                    <div>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </aside>

          <article className={styles.article}>
            {cs.sections.map((section) => (
              <section key={section.heading} className={styles.articleSection}>
                <h2 className={styles.sectionHeading}>{section.heading}</h2>
                {section.body.map((paragraph, i) => (
                  <p key={i} className={styles.paragraph}>
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </article>
        </div>

        <footer className={styles.footer}>
          <Link href="/work" className={styles.footerLink}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
            All case studies
          </Link>
          <Link href="/" className={styles.homeLink}>
            <Home aria-hidden="true" size={16} strokeWidth={2} />
            Home
          </Link>
        </footer>
      </div>
    </main>
  );
}
