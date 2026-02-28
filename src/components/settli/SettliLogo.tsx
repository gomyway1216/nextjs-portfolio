'use client';

import React from 'react';

interface SettliLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'gradient' | 'mono';
}

export function SettliLogo({
  size = 40,
  className = '',
  showText = false,
  variant = 'default',
}: SettliLogoProps) {
  const colors = {
    default: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#a855f7',
    },
    gradient: {
      primary: 'url(#settli-gradient)',
      secondary: 'url(#settli-gradient)',
      accent: 'url(#settli-gradient)',
    },
    mono: {
      primary: 'currentColor',
      secondary: 'currentColor',
      accent: 'currentColor',
    },
  };

  const c = colors[variant];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="settli-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle cx="24" cy="24" r="22" fill={c.primary} opacity="0.1" />

        {/* Main S shape - stylized */}
        <path
          d="M30 14C30 14 26 12 22 14C18 16 16 18 16 22C16 26 20 27 24 28C28 29 32 30 32 34C32 38 28 40 24 40C20 40 16 38 16 38"
          stroke={c.primary}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Split lines representing division/settlement */}
        <path
          d="M12 24H18"
          stroke={c.secondary}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M30 24H36"
          stroke={c.secondary}
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Dots representing people/members */}
        <circle cx="10" cy="24" r="2.5" fill={c.accent} />
        <circle cx="38" cy="24" r="2.5" fill={c.accent} />

        {/* Arrow indicating flow */}
        <path
          d="M24 8L24 12M24 8L21 11M24 8L27 11"
          stroke={c.primary}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showText && (
        <span
          className="font-bold tracking-tight"
          style={{
            fontSize: size * 0.6,
            background: variant === 'gradient'
              ? 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)'
              : undefined,
            WebkitBackgroundClip: variant === 'gradient' ? 'text' : undefined,
            WebkitTextFillColor: variant === 'gradient' ? 'transparent' : undefined,
            color: variant === 'mono' ? 'currentColor' : '#6366f1',
          }}
        >
          Settli
        </span>
      )}
    </div>
  );
}

// Icon-only version for smaller uses
export function SettliIcon({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="settli-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* Simplified S with split concept */}
      <path
        d="M15 6C15 6 13 5 11 6C9 7 8 8.5 8 10.5C8 12.5 10 13 12 13.5C14 14 16 14.5 16 16.5C16 18.5 14 19.5 12 19.5C10 19.5 8 18.5 8 18.5"
        stroke="url(#settli-icon-gradient)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Split indicators */}
      <circle cx="5" cy="12" r="1.5" fill="#8b5cf6" />
      <circle cx="19" cy="12" r="1.5" fill="#8b5cf6" />
      <path d="M6.5 12H8" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 12H17.5" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
