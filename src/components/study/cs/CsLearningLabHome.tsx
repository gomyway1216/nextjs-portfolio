import Link from 'next/link';
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
import { cryptoTechniques } from '@/lib/cs-learning/crypto';
import { sortingAlgorithms } from '@/lib/cs-learning/sorting';
import styles from './cs-learning-lab.module.css';

const learningFlow = [
  {
    title: 'Predict',
    text: 'Start with a small guess before the animation runs.',
  },
  {
    title: 'Run',
    text: 'Step through comparisons, swaps, keys, and modular arithmetic.',
  },
  {
    title: 'Explain',
    text: 'Connect each operation to the concept it demonstrates.',
  },
  {
    title: 'Quiz',
    text: 'Check the idea immediately while the example is still visible.',
  },
];

export default function CsLearningLabHome() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero} aria-labelledby="cs-lab-title">
          <div className={styles.heroContent}>
            <p className={styles.kicker}>
              <span className={styles.statusDot} aria-hidden="true" />
              Interactive study section
            </p>
            <h1 id="cs-lab-title" className={styles.title}>
              CS Learning Lab
            </h1>
            <p className={styles.subtitle}>
              Algorithms and cryptography as hands-on lessons: run the process, inspect each
              step, compare complexity, and answer short checks inside the same flow.
            </p>
            <div className={styles.heroActions}>
              <Link href="/study/cs/algorithms/sorting/bubble-sort" className={styles.primaryLink}>
                Start Sorting Lab
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/study/cs/cryptography/rsa" className={styles.secondaryLink}>
                Open Crypto Lab
                <KeyRound size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <aside className={styles.heroPanel} aria-label="Learning flow">
            <h2 className={styles.heroPanelTitle}>Lab flow</h2>
            <ol className={styles.flowList}>
              {learningFlow.map((item, index) => (
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
              <p className={styles.eyebrow}>Tracks</p>
              <h2 id="cs-lab-tracks" className={styles.sectionTitle}>
                Study by running small systems
              </h2>
              <p className={styles.sectionText}>
                The first version focuses on sort visualizers and cryptography playgrounds. The
                structure leaves room for graphs, data structures, probability, and machine
                learning later.
              </p>
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
                    <span className={styles.badge}>{sortingAlgorithms.length} sorts</span>
                  </div>
                  <h3 className={styles.cardTitle}>Sorting Algorithms</h3>
                  <p className={styles.cardText}>
                    Compare adjacent swaps, selected minimums, inserted keys, merges, partitions,
                    and heap extraction with one shared visualizer.
                  </p>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.smallBadge}>Visualizer</span>
                  <span className={styles.textLink}>
                    Open <ArrowRight size={15} aria-hidden="true" />
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
                  <h3 className={styles.cardTitle}>Complexity Lab</h3>
                  <p className={styles.cardText}>
                    Place O(n), O(n log n), and O(n^2) side by side so growth rate differences are
                    visible before code timing gets noisy.
                  </p>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.smallBadge}>Comparison</span>
                  <span className={styles.textLink}>
                    Open <ArrowRight size={15} aria-hidden="true" />
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
                    <span className={styles.badge}>{cryptoTechniques.length} topics</span>
                  </div>
                  <h3 className={styles.cardTitle}>Cryptography</h3>
                  <p className={styles.cardText}>
                    Move from Caesar and Vigenere to XOR, RSA, key exchange, and hashing with
                    parameter controls and step cards.
                  </p>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.smallBadge}>Playground</span>
                  <span className={styles.textLink}>
                    Open <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </article>
            </Link>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="cs-lab-map">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Current map</p>
              <h2 id="cs-lab-map" className={styles.sectionTitle}>
                Algorithms and cryptography are ready to branch out
              </h2>
            </div>
            <Link href="/study" className={styles.secondaryLink}>
              <BookOpen size={17} aria-hidden="true" />
              Study Articles
            </Link>
          </div>

          <div className={styles.twoGrid}>
            <div className={styles.panel}>
              <div className={styles.toolHeader}>
                <div>
                  <p className={styles.eyebrow}>Algorithms</p>
                  <h3 className={styles.toolTitle}>Sorting set</h3>
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
                  <p className={styles.eyebrow}>Cryptography</p>
                  <h3 className={styles.toolTitle}>Technique set</h3>
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
                <p className={styles.eyebrow}>Next extension</p>
                <h2 id="cs-lab-next" className={styles.toolTitle}>
                  Progress, generated quizzes, and review can attach here
                </h2>
                <p className={styles.toolText}>
                  This version is intentionally browser-first. Firestore progress and Cloud
                  Functions for AI-generated questions can be added without changing the lab
                  routes.
                </p>
              </div>
              <Brain size={24} color="#d97706" aria-hidden="true" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
