import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChartNoAxesCombined, Code2 } from 'lucide-react';
import { complexitySamples, sortingAlgorithms } from '@/lib/cs-learning/sorting';
import styles from './cs-learning-lab.module.css';

export function SortingOverview() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.section}>
          <Link href="/study/cs" className={styles.textLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            CS Learning Lab
          </Link>

          <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Algorithms</p>
              <h1 className={styles.title}>Sorting Lab</h1>
              <p className={styles.subtitle}>
                One visual model for adjacent swaps, selected minimums, insertion shifts, merge
                writes, pivot partitions, and heap extraction.
              </p>
            </div>
            <Link href="/study/cs/algorithms/big-o" className={styles.secondaryLink}>
              <ChartNoAxesCombined size={17} aria-hidden="true" />
              Big-O Comparison
            </Link>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sorting-list-title">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Visualizer set</p>
              <h2 id="sorting-list-title" className={styles.sectionTitle}>
                Choose an algorithm
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
                      <span className={styles.smallBadge}>{algorithm.stable ? 'Stable' : 'Not stable'}</span>
                      <span className={styles.smallBadge}>{algorithm.inPlace ? 'In-place' : 'Extra memory'}</span>
                      <span className={styles.smallBadge}>{algorithm.space}</span>
                    </div>
                    <div className={styles.cardFooter} style={{ marginTop: 14 }}>
                      <span className={styles.smallBadge}>Best {algorithm.best}</span>
                      <span className={styles.textLink}>
                        Run <ArrowRight size={15} aria-hidden="true" />
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
                <p className={styles.eyebrow}>Growth</p>
                <h2 id="sorting-complexity-title" className={styles.toolTitle}>
                  Quadratic growth becomes visible fast
                </h2>
                <p className={styles.toolText}>
                  Browser timing can be noisy, so this lab starts with theoretical operation
                  counts. The shape is the concept.
                </p>
              </div>
              <Link href="/study/cs/algorithms/big-o" className={styles.secondaryLink}>
                Open Chart
              </Link>
            </div>
            <ComplexityChart />
          </div>
        </section>
      </div>
    </main>
  );
}

export function ComplexityChart() {
  const samples = complexitySamples();
  const max = Math.max(...samples.map((sample) => sample.quadratic));

  return (
    <div className={styles.comparisonChart} aria-label="Complexity sample chart">
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
      <div className={styles.tagList} aria-label="Chart legend">
        <span className={styles.smallBadge}>Red: O(n^2)</span>
        <span className={styles.smallBadge}>Blue: O(n log n)</span>
        <span className={styles.smallBadge}>Green: O(n)</span>
      </div>
    </div>
  );
}
