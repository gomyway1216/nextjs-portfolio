/**
 * Reusable game setup screen.
 */

import { Play } from 'lucide-react';
import { useRef } from 'react';
import type { CSSProperties,FC,ReactNode } from 'react';
import { Difficulty,DifficultyOption } from './types';
import { getDifficultyColor } from './utils';
import styles from './DifficultySelector.module.css';

interface DifficultySelectorProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  selectedDifficulty: Difficulty;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  options: DifficultyOption[];
  onStart: () => void;
  difficultyTitle?: string;
  startLabel?: string;
  kickerLabel?: string;
  setupAriaLabel?: string;
  setupContent?: ReactNode;
  summaryContent?: ReactNode;
  extraContent?: ReactNode;
}

export const DifficultySelector: FC<DifficultySelectorProps> = ({
  title,
  subtitle,
  icon,
  selectedDifficulty,
  onSelectDifficulty,
  options,
  onStart,
  difficultyTitle = 'Select Difficulty',
  startLabel = 'Start Game',
  kickerLabel = 'Game setup',
  setupAriaLabel,
  setupContent,
  summaryContent,
  extraContent
}) => {
  const sectionRef = useRef<HTMLElement>(null);

  // A short window has to scroll down to reach Start; the game that replaces this card still opens at its top.
  // Instant, not the page's smooth scrolling: the game mounting part way through would stop a glide short of the top.
  const start = () => {
    for (let box = sectionRef.current?.parentElement; box; box = box.parentElement) {
      if (box.scrollTop > 0) box.scrollTo({ top: 0, behavior: 'instant' });
    }
    onStart();
  };

  return (
    <section ref={sectionRef} className={styles.selector} aria-label={setupAriaLabel ?? `${title} — ${kickerLabel}`}>
      <div className={styles.header}>
        {icon && <div className={styles.iconSlot}>{icon}</div>}
        <div>
          <h1 className={styles.title}>{title}</h1>

          {subtitle && (
            <p className={styles.subtitle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {setupContent && <div className={styles.setupContent}>{setupContent}</div>}

      <div className={styles.sectionHeader}>
        <span className={styles.sectionKicker}>{kickerLabel}</span>
        <h2 className={styles.sectionTitle}>{difficultyTitle}</h2>
      </div>

      <div className={styles.optionGrid}>
        {options.map((option) => {
          const colors = getDifficultyColor(option.value);
          const isSelected = selectedDifficulty === option.value;
          const difficultyStyle = {
            '--difficulty-bg': colors.bg,
            '--difficulty-border': colors.border,
            '--difficulty-text': colors.text,
          } as CSSProperties;

          return (
            <button
              type="button"
              key={option.value}
              onClick={() => onSelectDifficulty(option.value)}
              className={styles.optionButton}
              data-selected={isSelected ? 'true' : 'false'}
              style={difficultyStyle}
              aria-pressed={isSelected}
            >
              <span className={styles.optionLabel}>{option.label}</span>
              <span className={styles.optionDescription}>{option.description}</span>
            </button>
          );
        })}
      </div>

      {summaryContent && <div className={styles.summaryContent}>{summaryContent}</div>}

      {extraContent && <div className={styles.extraContent}>{extraContent}</div>}

      <button
        type="button"
        onClick={start}
        className={styles.startButton}
      >
        <Play className={styles.startIcon} />
        <span>{startLabel}</span>
      </button>
    </section>
  );
};
