import type { CSSProperties } from 'react';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { games } from '@/components/game/constants/games';
import enCommon from '@/locales/en/common.json';
import jaCommon from '@/locales/ja/common.json';
import styles from './games-page.module.css';

type Locale = 'en' | 'ja';
type Category = 'Arcade' | 'Strategy' | 'Puzzle' | 'RPG' | 'Card';

async function getLocale(): Promise<Locale> {
  // The client writes to a cookie via i18next-browser-languagedetector
  // (caches now include 'cookie' — see src/lib/i18n.ts). For first-time
  // visitors with no cookie yet, fall back to the first language listed
  // in Accept-Language so JA visitors get JA without a hydration flash.
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get('i18nextLng')?.value;
  if (cookieLang === 'ja' || cookieLang === 'en') return cookieLang;

  const hdrs = await headers();
  const accept = hdrs.get('accept-language') ?? '';
  const primary = accept.split(',')[0]?.trim().toLowerCase() ?? '';
  if (primary.startsWith('ja')) return 'ja';
  return 'en';
}

function lookupKey(dict: unknown, key: string): string | null {
  let cur: unknown = dict;
  for (const p of key.split('.')) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  return typeof cur === 'string' ? cur : null;
}

function makeTranslator(locale: Locale) {
  const dict = locale === 'ja' ? jaCommon : enCommon;
  return (key: string): string => lookupKey(dict, key) ?? lookupKey(enCommon, key) ?? key;
}

const difficultyKey = (d: string) => {
  switch (d) {
    case 'Easy': return 'games.difficulty.easy';
    case 'Medium': return 'games.difficulty.medium';
    case 'Hard': return 'games.difficulty.hard';
    default: return 'games.difficulty.easy';
  }
};

const categoryKey = (c: string) => {
  switch (c) {
    case 'Arcade': return 'games.category.arcade';
    case 'Strategy': return 'games.category.strategy';
    case 'Puzzle': return 'games.category.puzzle';
    case 'RPG': return 'games.category.rpg';
    case 'Card': return 'games.category.card';
    default: return 'games.category.arcade';
  }
};

const categoryOrder: Category[] = ['Arcade', 'Strategy', 'Puzzle', 'RPG', 'Card'];

const categoryAccent: Record<Category, { accent: string; surface: string; soft: string }> = {
  Arcade: { accent: '#007aff', surface: '#9bd7ff', soft: '#5e5ce6' },
  Strategy: { accent: '#34c759', surface: '#a8f0c6', soft: '#30b0c7' },
  Puzzle: { accent: '#ff9500', surface: '#ffd59b', soft: '#ff375f' },
  RPG: { accent: '#af52de', surface: '#d8b4fe', soft: '#64d2ff' },
  Card: { accent: '#ff2d55', surface: '#ffb3c1', soft: '#bf5af2' },
};

const difficultyColor = {
  Easy: '#34c759',
  Medium: '#ff9f0a',
  Hard: '#ff453a',
} as const;

function isCategory(category: string): category is Category {
  return Object.prototype.hasOwnProperty.call(categoryAccent, category);
}

function getCardStyle(category: string, difficulty: keyof typeof difficultyColor): CSSProperties {
  const accent = categoryAccent[isCategory(category) ? category : 'Arcade'];
  return {
    '--game-accent': accent.accent,
    '--game-surface': accent.surface,
    '--game-soft': accent.soft,
    '--difficulty-color': difficultyColor[difficulty],
  } as CSSProperties;
}

export default async function GamesPage() {
  const locale = await getLocale();
  const t = makeTranslator(locale);
  const categoryCounts = categoryOrder.map((category) => ({
    category,
    count: games.filter((game) => game.category === category).length,
  }));

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero} aria-labelledby="games-title">
          <p className={styles.kicker}>
            <span className={styles.statusDot} aria-hidden="true" />
            {t('games.browserBased')}
          </p>
          <h1 id="games-title" className={styles.title}>
            {t('games.collection')}
          </h1>
          <p className={styles.subtitle}>
            {t('games.subtitle')}
          </p>
          <div className={styles.stats} aria-label={t('games.collection')}>
            <span className={styles.statPill}>{games.length} {t('navigation.games')}</span>
            <span className={styles.statPill}>{categoryCounts.length} {t('games.category.label')}</span>
            <span className={styles.statPill}>3 {t('games.difficulty.label')}</span>
          </div>
        </section>

        <div className={styles.categoryBar} aria-label={t('games.category.label')}>
          {categoryCounts.map(({ category, count }) => (
            <span
              key={category}
              className={styles.categoryPill}
              style={getCardStyle(category, 'Easy')}
            >
              <span className={styles.categoryMark} aria-hidden="true" />
              {t(categoryKey(category))} {count}
            </span>
          ))}
        </div>

        <section className={styles.grid} aria-label={t('games.collection')}>
          {games.map((game) => {
            const title = t(`games.${game.id}.title`);
            const description = t(`games.${game.id}.description`);
            const difficultyLabel = t(difficultyKey(game.difficulty));
            const categoryLabel = t(categoryKey(game.category));

            return (
              <Link
                key={game.id}
                href={game.path}
                className={styles.cardLink}
                style={getCardStyle(game.category, game.difficulty)}
              >
                <article className={styles.card}>
                  <div className={styles.media} aria-hidden="true">
                    <span className={styles.thumbnail}>{game.thumbnail}</span>
                  </div>
                  <div className={styles.content}>
                    <div className={styles.cardHeader}>
                      <h2 className={styles.cardTitle}>{title}</h2>
                      <span className={styles.difficulty}>{difficultyLabel}</span>
                    </div>
                    <p className={styles.description}>{description}</p>
                    <div className={styles.cardFooter}>
                      <span className={styles.category}>
                        <span className={styles.categoryMark} aria-hidden="true" />
                        {categoryLabel}
                      </span>
                      <span className={styles.play}>{t('games.playNow')} &rarr;</span>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </section>

        <section className={styles.closing}>
          <div>
            <h2 className={styles.closingTitle}>{t('games.comingSoon')}</h2>
            <p className={styles.closingText}>{t('games.comingSoonText')}</p>
          </div>
          <Link href="/" className={styles.backLink}>
            &larr; {t('navigation.backToPortfolio')}
          </Link>
        </section>
      </div>
    </main>
  );
}
