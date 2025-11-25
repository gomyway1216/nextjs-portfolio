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
      background: 'rgba(0, 0, 0, 0.95)',
      border: '3px solid #0ea5e9',
      borderRadius: '1rem',
      padding: '3rem',
      boxShadow: '0 0 50px rgba(14, 165, 233, 0.3)',
      minWidth: '500px'
    }}>
      <h1 style={{
        color: '#fff',
        fontSize: '2.5rem',
        fontWeight: 'bold',
        marginBottom: '1rem',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem'
      }}>
        {icon}
        {title}
      </h1>

      {subtitle && (
        <p style={{
          color: '#9ca3af',
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          {subtitle}
        </p>
      )}

      <h2 style={{
        color: '#fff',
        fontSize: '1.5rem',
        fontWeight: 'bold',
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
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'uppercase'
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
          fontSize: '1.5rem',
          fontWeight: 'bold',
          padding: '1.5rem 3rem',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 10px 40px rgba(14, 165, 233, 0.5)',
          width: '100%'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#0284c7';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#0ea5e9';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        Start Game
      </button>
    </div>
  );
};
