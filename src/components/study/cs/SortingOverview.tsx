'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ChartNoAxesCombined, Code2 } from 'lucide-react';
import { getCsLearningCopy, normalizeCsLearningLanguage } from '@/lib/cs-learning/localization';
import { complexitySamples, getLocalizedSortingAlgorithms } from '@/lib/cs-learning/sorting';
import styles from './cs-learning-lab.module.css';

export function SortingOverview() {
  const { i18n } = useTranslation();
  const language = normalizeCsLearningLanguage(i18n.language);
  const copy = getCsLearningCopy(language);
  const sortingAlgorithms = getLocalizedSortingAlgorithms(language);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.section}>
          <Link href="/study/cs" className={styles.textLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.common.csLearningLab}
          </Link>

          <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{copy.sortingOverview.algorithms}</p>
              <h1 className={styles.title}>{copy.sortingOverview.title}</h1>
              <p className={styles.subtitle}>{copy.sortingOverview.subtitle}</p>
            </div>
            <Link href="/study/cs/algorithms/big-o" className={styles.secondaryLink}>
              <ChartNoAxesCombined size={17} aria-hidden="true" />
              {copy.common.bigOComparison}
            </Link>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sorting-list-title">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{copy.sortingOverview.visualizerSet}</p>
              <h2 id="sorting-list-title" className={styles.sectionTitle}>
                {copy.sortingOverview.chooseAlgorithm}
              </h2>
            </div>
          </div>

          <div className={styles.grid}>
            {sortingAlgorithms.map((algorithm) => (
              <Link key={algorithm.id} href={algorithm.route} className={styles.cardLink}>
                <article className={styles.card}>
                  <div>
                    <div className={styles.cardTop}>
                      <span className={styles.iconBox}>
                        <Code2 size={22} aria-hidden="true" />
                      </span>
                      <span className={styles.badge}>{algorithm.average}</span>
                    </div>
                    <h3 className={styles.cardTitle}>{algorithm.name}</h3>
                    <p className={styles.cardText}>{algorithm.summary}</p>
                  </div>
                  <div>
                    <div className={styles.tagList}>
                      <span className={styles.smallBadge}>
                        {algorithm.stable ? copy.common.stable : copy.common.notStable}
                      </span>
                      <span className={styles.smallBadge}>
                        {algorithm.inPlace ? copy.common.inPlace : copy.common.extraMemory}
                      </span>
                      <span className={styles.smallBadge}>{algorithm.space}</span>
                    </div>
                    <div className={styles.cardFooter} style={{ marginTop: 14 }}>
                      <span className={styles.smallBadge}>
                        {copy.common.best} {algorithm.best}
                      </span>
                      <span className={styles.textLink}>
                        {copy.common.run} <ArrowRight size={15} aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sorting-complexity-title">
          <div className={styles.panel}>
            <div className={styles.toolHeader}>
              <div>
                <p className={styles.eyebrow}>{copy.sortingOverview.growth}</p>
                <h2 id="sorting-complexity-title" className={styles.toolTitle}>
                  {copy.sortingOverview.growthTitle}
                </h2>
                <p className={styles.toolText}>{copy.sortingOverview.growthText}</p>
              </div>
              <Link href="/study/cs/algorithms/big-o" className={styles.secondaryLink}>
                {copy.sortingOverview.openChart}
              </Link>
            </div>
            <ComplexityChart labels={copy.sortingOverview} />
          </div>
        </section>
      </div>
    </main>
  );
}

type ComplexityChartLabels = {
  chartLabel: string;
  chartLegend: string;
  red: string;
  blue: string;
  green: string;
};

export function ComplexityChart({ labels }: { labels: ComplexityChartLabels }) {
  const samples = complexitySamples();
  const max = Math.max(...samples.map((sample) => sample.quadratic));

  return (
    <div className={styles.comparisonChart} aria-label={labels.chartLabel}>
      {samples.map((sample) => (
        <div key={sample.n} className={styles.chartRow}>
          <span>n={sample.n}</span>
          <div>
            <div className={styles.chartTrack} aria-hidden="true">
              <div
                className={`${styles.chartBar} ${styles.chartQuadratic}`}
                style={{ width: `${Math.max(2, (sample.quadratic / max) * 100)}%` }}
              />
            </div>
            <div className={styles.chartTrack} style={{ marginTop: 5 }} aria-hidden="true">
              <div
                className={`${styles.chartBar} ${styles.chartLog}`}
                style={{ width: `${Math.max(2, (sample.linearithmic / max) * 100)}%` }}
              />
            </div>
            <div className={styles.chartTrack} style={{ marginTop: 5 }} aria-hidden="true">
              <div
                className={`${styles.chartBar} ${styles.chartLinear}`}
                style={{ width: `${Math.max(2, (sample.linear / max) * 100)}%` }}
              />
            </div>
          </div>
          <span>{sample.quadratic.toLocaleString()}</span>
        </div>
      ))}
      <div className={styles.tagList} aria-label={labels.chartLegend}>
        <span className={styles.smallBadge}>{labels.red}</span>
        <span className={styles.smallBadge}>{labels.blue}</span>
        <span className={styles.smallBadge}>{labels.green}</span>
      </div>
    </div>
  );
}
