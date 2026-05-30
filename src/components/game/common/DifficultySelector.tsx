/**
 * Reusable difficulty selector
 */

import { Difficulty, DifficultyOption } from './types';
import { getDifficultyColor } from './utils';

interface DifficultySelectorProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  selectedDifficulty: Difficulty;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  options: DifficultyOption[];
  onStart: () => void;
  extraContent?: React.ReactNode;
}

export const DifficultySelector: React.FC<DifficultySelectorProps> = ({
  title,
  subtitle,
  icon,
  selectedDifficulty,
  onSelectDifficulty,
  options,
  onStart,
  extraContent
}) => {
  return (
    <div style={{
      width: 'min(92vw, 520px)',
      maxWidth: 'calc(100vw - 2rem)',
      background: 'color-mix(in srgb, var(--card) 82%, #020617 18%)',
      border: '1px solid color-mix(in srgb, var(--border) 58%, #0ea5e9 42%)',
      borderRadius: '1rem',
      padding: 'clamp(1.25rem, 5vw, 3rem)',
      boxShadow: '0 24px 70px rgba(14, 165, 233, 0.24)',
      color: 'var(--card-foreground)'
    }}>
      <h1 style={{
        color: 'var(--foreground)',
        fontSize: 'clamp(1.8rem, 7vw, 2.5rem)',
        fontWeight: 760,
        marginBottom: '1rem',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        lineHeight: 1.1
      }}>
        {icon}
        {title}
      </h1>

      {subtitle && (
        <p style={{
          color: 'var(--muted-foreground)',
          textAlign: 'center',
          marginBottom: '2rem',
          lineHeight: 1.55
        }}>
          {subtitle}
        </p>
      )}

      <h2 style={{
        color: 'var(--foreground)',
        fontSize: 'clamp(1.15rem, 4vw, 1.5rem)',
        fontWeight: 720,
        marginBottom: '1rem',
        textAlign: 'center'
      }}>
        Select Difficulty
      </h2>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {options.map((option) => {
          const colors = getDifficultyColor(option.value);
          const isSelected = selectedDifficulty === option.value;

          return (
            <button
              key={option.value}
              onClick={() => onSelectDifficulty(option.value)}
              style={{
                background: isSelected ? colors.bg : 'rgba(31, 41, 55, 0.5)',
                border: `2px solid ${isSelected ? colors.border : 'rgba(75, 85, 99, 1)'}`,
                borderRadius: '0.5rem',
                color: isSelected ? colors.text : '#9ca3af',
                padding: '0.9rem 1rem',
                fontSize: 'clamp(0.98rem, 3.4vw, 1.125rem)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'uppercase',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'rgba(55, 65, 81, 0.7)';
                  e.currentTarget.style.borderColor = colors.border;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'rgba(31, 41, 55, 0.5)';
                  e.currentTarget.style.borderColor = 'rgba(75, 85, 99, 1)';
                }
              }}
            >
              {option.label}
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                {option.description}
              </div>
            </button>
          );
        })}
      </div>

      {extraContent}

      <button
        onClick={onStart}
        style={{
          background: '#0ea5e9',
          border: 'none',
          borderRadius: '0.5rem',
          color: '#fff',
          fontSize: 'clamp(1.1rem, 4vw, 1.5rem)',
          fontWeight: 'bold',
          padding: 'clamp(1rem, 4vw, 1.5rem) clamp(1.25rem, 6vw, 3rem)',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 10px 40px rgba(14, 165, 233, 0.5)',
          width: '100%'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#0284c7';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#0ea5e9';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        Start Game
      </button>
    </div>
  );
};
