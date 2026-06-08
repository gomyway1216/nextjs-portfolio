'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChartNoAxesCombined } from 'lucide-react';
import { ComplexityChart } from './SortingOverview';
import { getCsLearningCopy, normalizeCsLearningLanguage } from '@/lib/cs-learning/localization';
import { complexitySamples, getLocalizedSortingAlgorithms } from '@/lib/cs-learning/sorting';
import styles from './cs-learning-lab.module.css';

export function BigOComparisonPage() {
  const { i18n } = useTranslation();
  const language = normalizeCsLearningLanguage(i18n.language);
  const copy = getCsLearningCopy(language);
  const samples = complexitySamples();
  const sortingAlgorithms = getLocalizedSortingAlgorithms(language);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.section}>
          <Link href="/study/cs/algorithms/sorting" className={styles.textLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.common.sortingLab}
          </Link>

          <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{copy.bigO.complexity}</p>
              <h1 className={styles.title}>{copy.bigO.title}</h1>
              <p className={styles.subtitle}>{copy.bigO.subtitle}</p>
            </div>
            <ChartNoAxesCombined size={30} color="#d97706" aria-hidden="true" />
          </div>
        </section>

        <section className={styles.labLayout}>
          <div className={styles.mainColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>{copy.bigO.chart}</p>
                  <h2 className={styles.toolTitle}>{copy.bigO.growthByInput}</h2>
                </div>
              </div>
              <ComplexityChart labels={copy.sortingOverview} />
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>{copy.bigO.numbers}</p>
                  <h2 className={styles.toolTitle}>{copy.bigO.sampleCounts}</h2>
                </div>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>n</th>
                    <th>O(n)</th>
                    <th>O(n log n)</th>
                    <th>O(n^2)</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample) => (
                    <tr key={sample.n}>
                      <td>{sample.n}</td>
                      <td>{sample.linear.toLocaleString()}</td>
                      <td>{sample.linearithmic.toLocaleString()}</td>
                      <td>{sample.quadratic.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className={styles.sideColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>{copy.bigO.sortMap}</p>
                  <h2 className={styles.toolTitle}>{copy.bigO.whereSortLands}</h2>
                </div>
              </div>
              <div className={styles.metricsGrid}>
                {sortingAlgorithms.map((algorithm) => (
                  <Link key={algorithm.id} href={algorithm.route} className={styles.cardLink}>
                    <div className={styles.metric}>
                      <p className={styles.metricLabel}>{algorithm.shortName}</p>
                      <p className={styles.metricValue}>{algorithm.average}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
