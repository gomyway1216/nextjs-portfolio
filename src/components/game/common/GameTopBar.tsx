/**
 * Reusable top bar for games
 */

import Link from 'next/link';
import { Info, Trophy } from 'lucide-react';
import { GameStats } from './types';

interface GameTopBarProps {
  stats: GameStats;
  onInfoClick: () => void;
  additionalContent?: React.ReactNode;
}

export const GameTopBar: React.FC<GameTopBarProps> = ({
  stats,
  onInfoClick,
  additionalContent
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem',
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(14, 165, 233, 0.3)',
      zIndex: 10
    }}>
      <Link
        href="/games"
        style={{
          color: '#94a3b8',
          textDecoration: 'none',
          fontSize: '0.875rem',
          fontWeight: '500',
          transition: 'color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#0ea5e9'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
      >
        ← Back to Games
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {additionalContent}

        {/* Stats */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(14, 165, 233, 0.1)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
          borderRadius: '0.5rem',
          padding: '0.5rem 1rem'
        }}>
          <Trophy style={{ width: '1.25rem', height: '1.25rem', color: '#0ea5e9' }} />
          <div>
            <div style={{ fontSize: '0.625rem', color: '#94a3b8', textTransform: 'uppercase' }}>Record</div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0ea5e9' }}>
              {stats.wins}W - {stats.losses}L - {stats.draws}D
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onInfoClick}
        style={{
          background: 'rgba(14, 165, 233, 0.2)',
          border: '1px solid rgba(14, 165, 233, 0.5)',
          borderRadius: '0.5rem',
          color: '#0ea5e9',
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          fontWeight: '500',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(14, 165, 233, 0.3)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(14, 165, 233, 0.2)'}
      >
        <Info style={{ width: '1rem', height: '1rem' }} />
        How to Play
      </button>
    </div>
  );
};
