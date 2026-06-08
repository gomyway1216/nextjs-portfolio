'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Binary,
  BookOpen,
  Brain,
  ChartNoAxesCombined,
  Code2,
  KeyRound,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getLocalizedCryptoTechniques } from '@/lib/cs-learning/crypto';
import {
  formatCsLearningCopy,
  getCsLearningCopy,
  normalizeCsLearningLanguage,
} from '@/lib/cs-learning/localization';
import { getLocalizedSortingAlgorithms } from '@/lib/cs-learning/sorting';
import styles from './cs-learning-lab.module.css';

export default function CsLearningLabHome() {
  const { i18n } = useTranslation();
  const language = normalizeCsLearningLanguage(i18n.language);
  const copy = getCsLearningCopy(language);
  const sortingAlgorithms = getLocalizedSortingAlgorithms(language);
  const cryptoTechniques = getLocalizedCryptoTechniques(language);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero} aria-labelledby="cs-lab-title">
          <div className={styles.heroContent}>
            <p className={styles.kicker}>
              <span className={styles.statusDot} aria-hidden="true" />
              {copy.home.kicker}
            </p>
            <h1 id="cs-lab-title" className={styles.title}>
              {copy.home.title}
            </h1>
            <p className={styles.subtitle}>{copy.home.subtitle}</p>
            <div className={styles.heroActions}>
              <Link href="/study/cs/algorithms/sorting/bubble-sort" className={styles.primaryLink}>
                {copy.home.startSorting}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/study/cs/cryptography/rsa" className={styles.secondaryLink}>
                {copy.home.openCrypto}
                <KeyRound size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <aside className={styles.heroPanel} aria-label={copy.home.learningFlowLabel}>
            <h2 className={styles.heroPanelTitle}>{copy.home.flowTitle}</h2>
            <ol className={styles.flowList}>
              {copy.home.flow.map((item, index) => (
                <li key={item.title} className={styles.flowItem}>
                  <span className={styles.flowIndex}>{index + 1}</span>
                  <div>
                    <p className={styles.flowTitle}>{item.title}</p>
                    <p className={styles.flowText}>{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        <section className={styles.section} aria-labelledby="cs-lab-tracks">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{copy.home.tracksEyebrow}</p>
              <h2 id="cs-lab-tracks" className={styles.sectionTitle}>
                {copy.home.tracksTitle}
              </h2>
              <p className={styles.sectionText}>{copy.home.tracksText}</p>
            </div>
          </div>

          <div className={styles.grid}>
            <Link href="/study/cs/algorithms/sorting" className={styles.cardLink}>
              <article className={styles.card}>
                <div>
                  <div className={styles.cardTop}>
                    <span className={styles.iconBox}>
                      <Code2 size={22} aria-hidden="true" />
                    </span>
                    <span className={styles.badge}>
                      {formatCsLearningCopy(copy.home.sortsBadge, { count: sortingAlgorithms.length })}
                    </span>
                  </div>
                  <h3 className={styles.cardTitle}>{copy.home.sortingTitle}</h3>
                  <p className={styles.cardText}>{copy.home.sortingText}</p>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.smallBadge}>{copy.home.visualizer}</span>
                  <span className={styles.textLink}>
                    {copy.common.open} <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </article>
            </Link>

            <Link href="/study/cs/algorithms/big-o" className={styles.cardLink}>
              <article className={styles.card}>
                <div>
                  <div className={styles.cardTop}>
                    <span className={`${styles.iconBox} ${styles.iconBoxAmber}`}>
                      <ChartNoAxesCombined size={22} aria-hidden="true" />
                    </span>
                    <span className={styles.badge}>Big-O</span>
                  </div>
                  <h3 className={styles.cardTitle}>{copy.home.complexityTitle}</h3>
                  <p className={styles.cardText}>{copy.home.complexityText}</p>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.smallBadge}>{copy.home.comparison}</span>
                  <span className={styles.textLink}>
                    {copy.common.open} <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </article>
            </Link>

            <Link href="/study/cs/cryptography" className={styles.cardLink}>
              <article className={styles.card}>
                <div>
                  <div className={styles.cardTop}>
                    <span className={`${styles.iconBox} ${styles.iconBoxGreen}`}>
                      <ShieldCheck size={22} aria-hidden="true" />
                    </span>
                    <span className={styles.badge}>
                      {formatCsLearningCopy(copy.home.topicsBadge, { count: cryptoTechniques.length })}
                    </span>
                  </div>
                  <h3 className={styles.cardTitle}>{copy.home.cryptoTitle}</h3>
                  <p className={styles.cardText}>{copy.home.cryptoText}</p>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.smallBadge}>{copy.home.playground}</span>
                  <span className={styles.textLink}>
                    {copy.common.open} <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </article>
            </Link>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="cs-lab-map">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{copy.home.mapEyebrow}</p>
              <h2 id="cs-lab-map" className={styles.sectionTitle}>
                {copy.home.mapTitle}
              </h2>
            </div>
            <Link href="/study" className={styles.secondaryLink}>
              <BookOpen size={17} aria-hidden="true" />
              {copy.home.studyArticles}
            </Link>
          </div>

          <div className={styles.twoGrid}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>{copy.home.algorithms}</p>
                  <h3 className={styles.toolTitle}>{copy.home.sortingSet}</h3>
                </div>
                <Binary size={22} color="#2563eb" aria-hidden="true" />
              </div>
              <div className={styles.tagList}>
                {sortingAlgorithms.map((algorithm) => (
                  <Link key={algorithm.id} href={algorithm.route} className={styles.pillButton}>
                    {algorithm.shortName}
                  </Link>
                ))}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>{copy.home.cryptography}</p>
                  <h3 className={styles.toolTitle}>{copy.home.techniqueSet}</h3>
                </div>
                <Sparkles size={22} color="#0f766e" aria-hidden="true" />
              </div>
              <div className={styles.tagList}>
                {cryptoTechniques.map((technique) => (
                  <Link key={technique.id} href={technique.route} className={styles.pillButton}>
                    {technique.shortName}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="cs-lab-next">
          <div className={styles.panel}>
            <div className={styles.toolHeader}>
              <div>
                <p className={styles.eyebrow}>{copy.home.nextEyebrow}</p>
                <h2 id="cs-lab-next" className={styles.toolTitle}>
                  {copy.home.nextTitle}
                </h2>
                <p className={styles.toolText}>{copy.home.nextText}</p>
              </div>
              <Brain size={24} color="#d97706" aria-hidden="true" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
