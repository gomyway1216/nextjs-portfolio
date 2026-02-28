/**
 * Game-specific toolbar content - registers with GlobalToolbar via context.
 * Renders nothing; content is integrated into the unified GlobalToolbar.
 */

'use client';

import { useEffect } from 'react';
import { Info, Trophy } from 'lucide-react';
import { GameStats } from './types';
import { useGameToolbar } from '@/contexts/GameToolbarContext';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getUITranslation } from '../constants/gameTranslations';

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
  const { setContent } = useGameToolbar();
  const { language } = useGameLanguage();
  const ui = getUITranslation(language);

  useEffect(() => {
    setContent({
      left: additionalContent,
      center: (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(14, 165, 233, 0.1)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
          borderRadius: '9999px',
          padding: '0.25rem 0.75rem'
        }}>
          <Trophy style={{ width: '0.875rem', height: '0.875rem', color: '#0ea5e9' }} />
          <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: '600' }}>
            {stats.wins}W - {stats.losses}L - {stats.draws}D
          </span>
        </div>
      ),
      right: (
        <button
          onClick={onInfoClick}
          style={{
            background: 'rgba(14, 165, 233, 0.15)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '9999px',
            color: '#0ea5e9',
            padding: '0.25rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14, 165, 233, 0.25)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(14, 165, 233, 0.15)'; }}
        >
          <Info style={{ width: '0.75rem', height: '0.75rem' }} />
          {ui.howToPlay}
        </button>
      )
    });
    return () => setContent(null);
  }, [stats, onInfoClick, additionalContent, setContent, ui.howToPlay]);

  return null;
};
