import Link from 'next/link';
import { ArrowLeft, ChartNoAxesCombined } from 'lucide-react';
import { ComplexityChart } from './SortingOverview';
import { complexitySamples, sortingAlgorithms } from '@/lib/cs-learning/sorting';
import styles from './cs-learning-lab.module.css';

export function BigOComparisonPage() {
  const samples = complexitySamples();

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.section}>
          <Link href="/study/cs/algorithms/sorting" className={styles.textLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            Sorting Lab
          </Link>

          <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Complexity</p>
              <h1 className={styles.title}>Big-O Comparison</h1>
              <p className={styles.subtitle}>
                Theoretical growth makes the difference between linear, n log n, and quadratic
                work easier to see than raw browser timing.
              </p>
            </div>
            <ChartNoAxesCombined size={30} color="#d97706" aria-hidden="true" />
          </div>
        </section>

        <section className={styles.labLayout}>
          <div className={styles.mainColumn}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Chart</p>
                  <h2 className={styles.toolTitle}>Growth by input size</h2>
                </div>
              </div>
              <ComplexityChart />
            </div>

            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Numbers</p>
                  <h2 className={styles.toolTitle}>Sample operation counts</h2>
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
                  <p className={styles.eyebrow}>Sort map</p>
                  <h2 className={styles.toolTitle}>Where each sort lands</h2>
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
