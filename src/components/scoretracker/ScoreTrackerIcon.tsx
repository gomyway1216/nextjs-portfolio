'use client';

import React from 'react';

interface ScoreTrackerIconProps {
  size?: number;
  className?: string;
}

// Stylized scorecard / tally mark glyph — purposely abstract so it reads well
// for mahjong, golf, card games, etc.
export const ScoreTrackerIcon: React.FC<ScoreTrackerIconProps> = ({ size = 32, className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" strokeWidth="2" />
      <line x1="9" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="16" x2="17" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="21" x2="15" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M20 18 L23 21 L27 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
