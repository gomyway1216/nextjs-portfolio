import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { games } from '@/components/game/constants/games';
import enCommon from '@/locales/en/common.json';
import jaCommon from '@/locales/ja/common.json';

type Locale = 'en' | 'ja';

async function getLocale(): Promise<Locale> {
  // The client writes to a cookie via i18next-browser-languagedetector
  // (caches: ['localStorage']), so on first visit there's no cookie. We
  // fall back to Accept-Language so JA visitors still get JA without a
  // hydration flash later.
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get('i18nextLng')?.value;
  if (cookieLang === 'ja' || cookieLang === 'en') return cookieLang;

  const hdrs = await headers();
  const accept = hdrs.get('accept-language') ?? '';
  if (accept.toLowerCase().startsWith('ja')) return 'ja';
  return 'en';
}

function makeTranslator(locale: Locale) {
  const dict = locale === 'ja' ? jaCommon : enCommon;
  return (key: string): string => {
    const parts = key.split('.');
    let cur: unknown = dict;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return key;
      }
    }
    return typeof cur === 'string' ? cur : key;
  };
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

export default async function GamesPage() {
  const locale = await getLocale();
  const t = makeTranslator(locale);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #111827, #000)',
      padding: '3rem 1.5rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <style>{`
        .game-card-link { text-decoration: none; display: block; transition: transform 0.2s; }
        .game-card-link:hover { transform: translateY(-4px); }
        .game-card-link:hover .game-card { border-color: #0ea5e9 !important; }
        .games-back-btn { transition: background 0.2s; }
        .games-back-btn:hover { background: rgba(75, 85, 99, 0.8) !important; }
      `}</style>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem'
          }}>
            <span style={{ fontSize: '3rem' }}>🎮</span>
            {t('games.collection')}
          </h1>
          <p style={{
            fontSize: '1.125rem',
            color: '#9ca3af',
            maxWidth: '42rem',
            margin: '0 auto 1.5rem'
          }}>
            {t('games.subtitle')}
          </p>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <span style={{
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.5)',
              borderRadius: '9999px',
              padding: '0.5rem 1rem',
              color: '#0ea5e9',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              🏆 {t('games.interactive')}
            </span>
            <span style={{
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: '9999px',
              padding: '0.5rem 1rem',
              color: '#a855f7',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              ⭐ {t('games.browserBased')}
            </span>
          </div>
        </div>

        {/* Games Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
          {games.map((game) => {
            const title = t(`games.${game.id}.title`);
            const description = t(`games.${game.id}.description`);
            const difficultyLabel = t(difficultyKey(game.difficulty));
            const categoryLabel = t(categoryKey(game.category));

            return (
              <Link
                key={game.id}
                href={game.path}
                className="game-card-link"
              >
                <div
                  className="game-card"
                  style={{
                    background: 'rgba(31, 41, 55, 0.5)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(55, 65, 81, 1)',
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    background: 'linear-gradient(135deg, #0ea5e9, #3b82f6, #8b5cf6)',
                    height: '200px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '5rem',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.1)',
                      transition: 'background 0.2s'
                    }} />
                    <span style={{ position: 'relative', zIndex: 1 }}>{game.thumbnail}</span>
                  </div>

                  {/* Content */}
                  <div style={{ padding: '1.5rem' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'start',
                      justifyContent: 'space-between',
                      marginBottom: '0.75rem'
                    }}>
                      <h2 style={{
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        color: '#fff',
                        margin: 0
                      }}>
                        {title}
                      </h2>
                      <span style={{
                        background: game.difficulty === 'Easy'
                          ? 'rgba(34, 197, 94, 0.2)'
                          : game.difficulty === 'Medium'
                            ? 'rgba(234, 179, 8, 0.2)'
                            : 'rgba(239, 68, 68, 0.2)',
                        border: `1px solid ${game.difficulty === 'Easy'
                          ? '#22c55e'
                          : game.difficulty === 'Medium'
                            ? '#eab308'
                            : '#ef4444'}`,
                        borderRadius: '0.375rem',
                        padding: '0.25rem 0.75rem',
                        color: game.difficulty === 'Easy'
                          ? '#22c55e'
                          : game.difficulty === 'Medium'
                            ? '#eab308'
                            : '#ef4444',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        whiteSpace: 'nowrap'
                      }}>
                        {difficultyLabel}
                      </span>
                    </div>

                    <p style={{
                      color: '#9ca3af',
                      fontSize: '0.875rem',
                      marginBottom: '1rem',
                      lineHeight: '1.5'
                    }}>
                      {description}
                    </p>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span style={{
                        background: 'rgba(14, 165, 233, 0.1)',
                        border: '1px solid rgba(14, 165, 233, 0.5)',
                        borderRadius: '0.375rem',
                        padding: '0.25rem 0.75rem',
                        color: '#0ea5e9',
                        fontSize: '0.875rem',
                        fontWeight: '600'
                      }}>
                        {categoryLabel}
                      </span>
                      <span style={{
                        color: '#0ea5e9',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        {t('games.playNow')} →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Coming Soon */}
        <div style={{
          background: 'rgba(31, 41, 55, 0.5)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(55, 65, 81, 1)',
          borderRadius: '1rem',
          padding: '2rem',
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: '0.75rem'
          }}>
            {t('games.comingSoon')}
          </h3>
          <p style={{
            color: '#9ca3af',
            marginBottom: '1.5rem'
          }}>
            {t('games.comingSoonText')}
          </p>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1.5rem',
            fontSize: '3rem'
          }}>
            <span style={{ cursor: 'default', transition: 'transform 0.2s' }}>🎯</span>
            <span style={{ cursor: 'default', transition: 'transform 0.2s' }}>🏃</span>
            <span style={{ cursor: 'default', transition: 'transform 0.2s' }}>🧩</span>
            <span style={{ cursor: 'default', transition: 'transform 0.2s' }}>🎲</span>
          </div>
        </div>

        {/* Back Button */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href="/"
            className="games-back-btn"
            style={{
              display: 'inline-block',
              background: 'rgba(55, 65, 81, 0.8)',
              border: '1px solid rgba(75, 85, 99, 1)',
              borderRadius: '0.5rem',
              color: '#fff',
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              textDecoration: 'none',
            }}
          >
            ← {t('navigation.backToPortfolio')}
          </Link>
        </div>
      </div>
    </div>
  );
}
