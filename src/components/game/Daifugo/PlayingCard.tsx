'use client';

import React from 'react';
import { Card, CardSuit, isJoker, rankToLabel, SUIT_SYMBOL } from './types';

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  giveSelected?: boolean; // Gold selection for 7-give
  discardSelected?: boolean; // Red selection for 10-discard
  disabled?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
  animationDelay?: number;
  variant?: 'hand' | 'table' | 'opponent';
}

const SUIT_COLORS: Record<CardSuit, string> = {
  S: '#1a1a2e', // Black (dark)
  C: '#1a1a2e', // Black (dark)
  H: '#dc2626', // Red
  D: '#dc2626', // Red
  J: '#7c3aed', // Purple for joker
};

const SIZE_CONFIG = {
  small: { width: 48, height: 68, fontSize: 12, suitSize: 16, cornerGap: 2 },
  medium: { width: 64, height: 90, fontSize: 14, suitSize: 22, cornerGap: 4 },
  large: { width: 80, height: 112, fontSize: 18, suitSize: 28, cornerGap: 6 },
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  selected = false,
  giveSelected = false,
  discardSelected = false,
  disabled = false,
  onClick,
  size = 'medium',
  animationDelay = 0,
  variant = 'hand',
}) => {
  const isHighlighted = selected || giveSelected || discardSelected;
  const highlightColor = discardSelected ? '#ef4444' : giveSelected ? '#fbbf24' : '#0ea5e9'; // Red for discard, Gold for give, cyan for normal
  const config = SIZE_CONFIG[size];
  const isJokerCard = isJoker(card);
  const color = SUIT_COLORS[card.suit];
  const suitSymbol = SUIT_SYMBOL[card.suit];
  const rankLabel = rankToLabel(card.rank);

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  // Joker card special rendering
  if (isJokerCard) {
    return (
      <button
        onClick={handleClick}
        disabled={disabled}
        style={{
          width: config.width,
          height: config.height,
          borderRadius: 8,
          border: isHighlighted ? `3px solid ${highlightColor}` : '1px solid #d1d5db',
          background: isHighlighted
            ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)'
            : 'linear-gradient(135deg, #fefce8 0%, #fef9c3 50%, #fefce8 100%)',
          boxShadow: isHighlighted
            ? `0 8px 20px ${giveSelected ? 'rgba(251, 191, 36, 0.4)' : 'rgba(14, 165, 233, 0.4)'}, 0 2px 4px rgba(0,0,0,0.1)`
            : '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transform: isHighlighted ? 'translateY(-8px) scale(1.02)' : 'translateY(0)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          opacity: disabled ? 0.6 : 1,
          position: 'relative',
          overflow: 'hidden',
          animation: variant === 'hand' ? 'cardDeal 0.3s ease-out both' :
                     variant === 'table' ? 'cardPlay 0.2s ease-out both' : undefined,
          animationDelay: `${animationDelay}ms`,
        }}
      >
        <span style={{ fontSize: config.suitSize + 8, lineHeight: 1 }}>🃏</span>
        <span style={{
          fontSize: config.fontSize - 2,
          fontWeight: 700,
          color: '#7c3aed',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          JOKER
        </span>
      </button>
    );
  }

  // Regular card rendering
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        width: config.width,
        height: config.height,
        borderRadius: 8,
        border: isHighlighted ? `3px solid ${highlightColor}` : '1px solid #d1d5db',
        background: isHighlighted
          ? discardSelected
            ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 50%, #fef2f2 100%)'
            : giveSelected
              ? 'linear-gradient(135deg, #fefce8 0%, #fef9c3 50%, #fefce8 100%)'
              : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0f9ff 100%)'
          : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)',
        boxShadow: isHighlighted
          ? `0 8px 20px ${discardSelected ? 'rgba(239, 68, 68, 0.4)' : giveSelected ? 'rgba(251, 191, 36, 0.4)' : 'rgba(14, 165, 233, 0.4)'}, 0 2px 4px rgba(0,0,0,0.1)`
          : '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: isHighlighted ? 'translateY(-8px) scale(1.02)' : 'translateY(0)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: config.cornerGap,
        opacity: disabled ? 0.6 : 1,
        position: 'relative',
        overflow: 'hidden',
        animation: variant === 'hand' ? 'cardDeal 0.3s ease-out both' :
                   variant === 'table' ? 'cardPlay 0.2s ease-out both' : undefined,
        animationDelay: `${animationDelay}ms`,
      }}
    >
      {/* Top-left corner */}
      <div style={{
        position: 'absolute',
        top: config.cornerGap + 2,
        left: config.cornerGap + 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
      }}>
        <span style={{
          fontSize: config.fontSize,
          fontWeight: 700,
          color,
          fontFamily: 'Georgia, serif',
        }}>
          {rankLabel}
        </span>
        <span style={{ fontSize: config.fontSize - 2, color }}>
          {suitSymbol}
        </span>
      </div>

      {/* Center suit symbol */}
      <div style={{
        fontSize: config.suitSize,
        color,
        marginTop: 'auto',
        marginBottom: 'auto',
      }}>
        {suitSymbol}
      </div>

      {/* Bottom-right corner (rotated) */}
      <div style={{
        position: 'absolute',
        bottom: config.cornerGap + 2,
        right: config.cornerGap + 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        transform: 'rotate(180deg)',
      }}>
        <span style={{
          fontSize: config.fontSize,
          fontWeight: 700,
          color,
          fontFamily: 'Georgia, serif',
        }}>
          {rankLabel}
        </span>
        <span style={{ fontSize: config.fontSize - 2, color }}>
          {suitSymbol}
        </span>
      </div>
    </button>
  );
};

// Card back for opponent hands
export const CardBack: React.FC<{ size?: 'small' | 'medium' | 'large' }> = ({ size = 'medium' }) => {
  const config = SIZE_CONFIG[size];

  return (
    <div
      style={{
        width: config.width,
        height: config.height,
        borderRadius: 8,
        border: '1px solid #374151',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 50%, #1e3a5f 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Diamond pattern */}
      <div style={{
        position: 'absolute',
        inset: 4,
        borderRadius: 4,
        border: '2px solid #3b82f6',
        background: `
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 8px,
            rgba(59, 130, 246, 0.1) 8px,
            rgba(59, 130, 246, 0.1) 16px
          )
        `,
      }} />
      {/* Center decoration */}
      <div style={{
        fontSize: config.suitSize,
        color: '#3b82f6',
        opacity: 0.8,
      }}>
        ✦
      </div>
    </div>
  );
};

// CSS keyframes - inject into page
export const PlayingCardStyles = () => (
  <style jsx global>{`
    @keyframes cardDeal {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes cardPlay {
      from {
        opacity: 0;
        transform: scale(0.8) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    @keyframes cardSelect {
      0% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-12px);
      }
      100% {
        transform: translateY(-8px);
      }
    }
  `}</style>
);

export default PlayingCard;
