'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { getLocalizedCryptoTechniques } from '@/lib/cs-learning/crypto';
import { getCsLearningCopy, normalizeCsLearningLanguage } from '@/lib/cs-learning/localization';
import styles from './cs-learning-lab.module.css';

export function CryptoOverview() {
  const { i18n } = useTranslation();
  const language = normalizeCsLearningLanguage(i18n.language);
  const copy = getCsLearningCopy(language);
  const cryptoTechniques = getLocalizedCryptoTechniques(language);
  const families = Array.from(new Set(cryptoTechniques.map((technique) => technique.family)));

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
              <p className={styles.eyebrow}>{copy.cryptoOverview.cryptography}</p>
              <h1 className={styles.title}>{copy.cryptoOverview.title}</h1>
              <p className={styles.subtitle}>{copy.cryptoOverview.subtitle}</p>
            </div>
            <Link href="/study/cs/cryptography/rsa" className={styles.secondaryLink}>
              <KeyRound size={17} aria-hidden="true" />
              {copy.cryptoOverview.startRsa}
            </Link>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="crypto-list-title">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>{copy.cryptoOverview.techniqueSet}</p>
              <h2 id="crypto-list-title" className={styles.sectionTitle}>
                {copy.cryptoOverview.choosePlayground}
              </h2>
            </div>
            <div className={styles.tagList}>
              {families.map((family) => (
                <span key={family} className={styles.smallBadge}>{family}</span>
              ))}
            </div>
          </div>

          <div className={styles.grid}>
            {cryptoTechniques.map((technique) => (
              <Link key={technique.id} href={technique.route} className={styles.cardLink}>
                <article className={styles.card}>
                  <div>
                    <div className={styles.cardTop}>
                      <span className={`${styles.iconBox} ${styles.iconBoxGreen}`}>
                        <ShieldCheck size={22} aria-hidden="true" />
                      </span>
                      <span className={styles.badge}>{technique.family}</span>
                    </div>
                    <h3 className={styles.cardTitle}>{technique.name}</h3>
                    <p className={styles.cardText}>{technique.summary}</p>
                  </div>
                  <div className={styles.cardFooter}>
                    <span className={styles.smallBadge}>{copy.cryptoOverview.interactive}</span>
                    <span className={styles.textLink}>
                      {copy.common.open} <ArrowRight size={15} aria-hidden="true" />
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="crypto-boundary-title">
          <div className={styles.panel}>
            <div className={styles.toolHeader}>
              <div>
                <p className={styles.eyebrow}>{copy.cryptoOverview.securityBoundary}</p>
                <h2 id="crypto-boundary-title" className={styles.toolTitle}>
                  {copy.cryptoOverview.securityTitle}
                </h2>
                <p className={styles.toolText}>{copy.cryptoOverview.securityText}</p>
              </div>
              <ShieldCheck size={24} color="#0f766e" aria-hidden="true" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
