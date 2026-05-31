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
import styles from './GameTopBar.module.css';

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
  const statsLabel = `${stats.wins} wins, ${stats.losses} losses, ${stats.draws} draws`;

  useEffect(() => {
    setContent({
      left: additionalContent,
      center: (
        <div className={styles.statsPill} aria-label={statsLabel} title={statsLabel}>
          <Trophy className={styles.statsIcon} />
          <span className={styles.statsText}>
            {stats.wins}W - {stats.losses}L - {stats.draws}D
          </span>
        </div>
      ),
      right: (
        <button
          type="button"
          onClick={onInfoClick}
          className={styles.infoButton}
          aria-label={ui.howToPlay}
        >
          <Info className={styles.infoIcon} />
          <span className={styles.infoLabel}>{ui.howToPlay}</span>
        </button>
      )
    });
    return () => setContent(null);
  }, [stats, statsLabel, onInfoClick, additionalContent, setContent, ui.howToPlay]);

  return null;
};
