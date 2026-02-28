'use client';

import React from 'react';

interface KaimonoLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'gradient' | 'mono';
}

export function KaimonoLogo({
  size = 40,
  className = '',
  showText = false,
  variant = 'default',
}: KaimonoLogoProps) {
  const colors = {
    default: {
      primary: '#10b981',
      secondary: '#059669',
      accent: '#34d399',
    },
    gradient: {
      primary: 'url(#kaimono-gradient)',
      secondary: 'url(#kaimono-gradient)',
      accent: 'url(#kaimono-gradient)',
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
          <linearGradient id="kaimono-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle cx="24" cy="24" r="22" fill={c.primary} opacity="0.1" />

        {/* Shopping bag */}
        <rect x="12" y="18" width="24" height="22" rx="3" stroke={c.primary} strokeWidth="2.5" fill="none" />

        {/* Bag handle */}
        <path
          d="M18 18V14C18 10.7 20.7 8 24 8C27.3 8 30 10.7 30 14V18"
          stroke={c.secondary}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Checkmark */}
        <path
          d="M18 28L22 32L30 24"
          stroke={c.accent}
          strokeWidth="2.5"
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
              ? 'linear-gradient(135deg, #10b981, #059669, #34d399)'
              : undefined,
            WebkitBackgroundClip: variant === 'gradient' ? 'text' : undefined,
            WebkitTextFillColor: variant === 'gradient' ? 'transparent' : undefined,
            color: variant === 'mono' ? 'currentColor' : '#10b981',
          }}
        >
          Kaimono
        </span>
      )}
    </div>
  );
}

export function KaimonoIcon({
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
        <linearGradient id="kaimono-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>

      {/* Shopping bag */}
      <rect x="5" y="9" width="14" height="12" rx="2" stroke="url(#kaimono-icon-gradient)" strokeWidth="1.8" fill="none" />

      {/* Handle */}
      <path
        d="M9 9V7C9 5.3 10.3 4 12 4C13.7 4 15 5.3 15 7V9"
        stroke="url(#kaimono-icon-gradient)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Checkmark */}
      <path
        d="M9 15L11 17L15 13"
        stroke="#059669"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
