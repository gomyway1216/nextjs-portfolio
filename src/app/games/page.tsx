'use client';

import Link from 'next/link';

interface Game {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  path: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
}

const games: Game[] = [
  {
    id: 'jump-game',
    title: 'Jump Game',
    description: 'A classic jump-and-dodge arcade game. Press any key to jump over obstacles and rack up points!',
    thumbnail: '🎮',
    path: '/games/jump-game',
    difficulty: 'Easy',
    category: 'Arcade',
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic Tac Toe',
    description: 'Challenge the AI in this classic strategy game! Choose from Easy, Medium, or Hard difficulty and test your skills.',
    thumbnail: '⭕',
    path: '/games/tic-tac-toe',
    difficulty: 'Medium',
    category: 'Strategy',
  },
  {
    id: 'gomoku',
    title: 'Gomoku',
    description: 'Five in a Row! Strategic board game with AI using minimax and alpha-beta pruning. Can you outsmart the algorithm?',
    thumbnail: '⚫',
    path: '/games/gomoku',
    difficulty: 'Hard',
    category: 'Strategy',
  },
];

export default function GamesPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #111827, #000)',
      padding: '3rem 1.5rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
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
            Games Collection
          </h1>
          <p style={{
            fontSize: '1.125rem',
            color: '#9ca3af',
            maxWidth: '42rem',
            margin: '0 auto 1.5rem'
          }}>
            Explore interactive browser games built with TypeScript and HTML5 Canvas.
            Challenge yourself and beat the high scores!
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
              🏆 Interactive
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
              ⭐ Browser-Based
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
          {games.map((game) => (
            <Link
              key={game.id}
              href={game.path}
              style={{
                textDecoration: 'none',
                display: 'block',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                const card = e.currentTarget.querySelector('.game-card') as HTMLElement;
                if (card) card.style.borderColor = '#0ea5e9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                const card = e.currentTarget.querySelector('.game-card') as HTMLElement;
                if (card) card.style.borderColor = 'rgba(55, 65, 81, 1)';
              }}
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
                      {game.title}
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
                      {game.difficulty}
                    </span>
                  </div>

                  <p style={{
                    color: '#9ca3af',
                    fontSize: '0.875rem',
                    marginBottom: '1rem',
                    lineHeight: '1.5'
                  }}>
                    {game.description}
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
                      {game.category}
                    </span>
                    <span style={{
                      color: '#0ea5e9',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      Play Now →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
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
            More Games Coming Soon!
          </h3>
          <p style={{
            color: '#9ca3af',
            marginBottom: '1.5rem'
          }}>
            New games are being developed. Check back later for more interactive experiences.
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
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(75, 85, 99, 0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(55, 65, 81, 0.8)'}
          >
            ← Back to Portfolio
          </Link>
        </div>
      </div>
    </div>
  );
}
