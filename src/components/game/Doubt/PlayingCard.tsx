'use client';

import React from 'react';
import { Card, CardSuit, rankToLabel, SUIT_SYMBOL } from './types';

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  playable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
  animationDelay?: number;
  variant?: 'hand' | 'table' | 'static';
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLButtonElement>;
  onDragEnd?: React.DragEventHandler<HTMLButtonElement>;
}

const SUIT_COLORS: Record<CardSuit, string> = {
  S: '#1a1a2e',
  C: '#1a1a2e',
  H: '#dc2626',
  D: '#dc2626',
};

const SIZE_CONFIG = {
  small: { width: 48, height: 68, fontSize: 12, suitSize: 16, cornerGap: 2 },
  medium: { width: 64, height: 90, fontSize: 14, suitSize: 22, cornerGap: 4 },
  large: { width: 80, height: 112, fontSize: 18, suitSize: 28, cornerGap: 6 },
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  selected = false,
  playable = false,
  disabled = false,
  onClick,
  size = 'medium',
  animationDelay = 0,
  variant = 'hand',
  draggable = false,
  onDragStart,
  onDragEnd,
}) => {
  const isHighlighted = selected || playable;
  const highlightColor = selected ? '#0ea5e9' : '#22c55e';
  const config = SIZE_CONFIG[size];
  const color = SUIT_COLORS[card.suit];
  const suitSymbol = SUIT_SYMBOL[card.suit];
  const rankLabel = rankToLabel(card.rank);

  const handleClick = () => {
    if (!disabled && onClick) onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        width: config.width,
        height: config.height,
        borderRadius: 8,
        border: isHighlighted ? `3px solid ${highlightColor}` : '1px solid #d1d5db',
        background: isHighlighted
          ? selected
            ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0f9ff 100%)'
            : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #f0fdf4 100%)'
          : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)',
        boxShadow: isHighlighted
          ? `0 8px 20px ${selected ? 'rgba(14, 165, 233, 0.35)' : 'rgba(34, 197, 94, 0.35)'}, 0 2px 4px rgba(0,0,0,0.1)`
          : '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)',
        cursor: disabled ? 'not-allowed' : draggable ? 'grab' : 'pointer',
        transform: selected ? 'translateY(-8px) scale(1.02)' : 'translateY(0)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: config.cornerGap,
        opacity: disabled ? 0.6 : 1,
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        animation: variant === 'hand' ? 'cardDeal 0.3s ease-out both'
          : variant === 'table' ? 'cardPlay 0.2s ease-out both'
          : undefined,
        animationDelay: `${animationDelay}ms`,
      }}
    >
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

      <div style={{
        fontSize: config.suitSize,
        color,
        marginTop: 'auto',
        marginBottom: 'auto',
      }}>
        {suitSymbol}
      </div>

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
  `}</style>
);

export default PlayingCard;

