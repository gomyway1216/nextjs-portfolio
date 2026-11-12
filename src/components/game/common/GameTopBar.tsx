/**
 * Game-specific toolbar content - registers with GlobalToolbar via context.
 * Renders nothing; content is integrated into the unified GlobalToolbar.
 */

'use client';

import { useEffect, useSyncExternalStore } from 'react';
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

/**
 * Where the site toolbar has room for what. From 1024px it is one row with a wide slot beside the site name, and the
 * game's extra content goes there. Below that the slot is whatever the site name and the controls leave over (on a
 * phone, about one character), so the extra content joins the stats pill instead: the toolbar gives that group the
 * whole second row on phones, and room of its own on tablets. Under 360px the first row cannot hold the How to
 * play button beside the site name either, so the button moves to the second row as well.
 */
type TopBarLayout = 'wide' | 'compact' | 'narrow';

const COMPACT_QUERY = '(max-width: 1023px)';
const NARROW_QUERY = '(max-width: 359px)';

function readLayout(): TopBarLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'wide';
  if (window.matchMedia(NARROW_QUERY).matches) return 'narrow';
  return window.matchMedia(COMPACT_QUERY).matches ? 'compact' : 'wide';
}

function subscribeLayout(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const queries = [window.matchMedia(COMPACT_QUERY), window.matchMedia(NARROW_QUERY)];
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
}

const serverLayout = (): TopBarLayout => 'wide';

export const GameTopBar: React.FC<GameTopBarProps> = ({
  stats,
  onInfoClick,
  additionalContent
}) => {
  const { setContent } = useGameToolbar();
  const { language } = useGameLanguage();
  const ui = getUITranslation(language);
  const layout = useSyncExternalStore(subscribeLayout, readLayout, serverLayout);
  const statsLabel = language === 'ja'
    ? `${stats.wins}勝 ${stats.losses}敗 ${stats.draws}分`
    : `${stats.wins} wins, ${stats.losses} losses, ${stats.draws} draws`;

  useEffect(() => {
    // One line, clipped with an ellipsis when it cannot fit: never squeezed into a column of single characters.
    const extra = additionalContent ? (
      <div className={styles.extra} data-game-top-bar-extra="">
        {additionalContent}
      </div>
    ) : null;
    const statsPill = (
      <div className={styles.statsPill} aria-label={statsLabel} title={statsLabel}>
        <Trophy className={styles.statsIcon} />
        <span className={styles.statsText}>
          {stats.wins}{ui.winShort} - {stats.losses}{ui.lossShort} - {stats.draws}{ui.drawShort}
        </span>
      </div>
    );
    const infoButton = (
      <button
        type="button"
        onClick={onInfoClick}
        className={extra && layout !== 'wide' ? `${styles.infoButton} ${styles.infoButtonCompact}` : styles.infoButton}
        aria-label={ui.howToPlay}
      >
        <Info className={styles.infoIcon} />
        <span className={styles.infoLabel}>{ui.howToPlay}</span>
      </button>
    );
    setContent(
      layout === 'wide'
        ? { left: extra, center: statsPill, right: infoButton }
        : {
          center: (
            <div className={styles.group}>
              {statsPill}
              {extra}
              {layout === 'narrow' && <span className={styles.groupEnd}>{infoButton}</span>}
            </div>
          ),
          right: layout === 'narrow' ? undefined : infoButton,
        }
    );
    return () => setContent(null);
  }, [stats, statsLabel, onInfoClick, additionalContent, setContent, layout, ui.howToPlay, ui.winShort, ui.lossShort, ui.drawShort]);

  return null;
};
