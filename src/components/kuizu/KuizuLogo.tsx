'use client';

import React from 'react';

interface KuizuLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'gradient' | 'mono';
}

export function KuizuLogo({
  size = 40,
  className = '',
  showText = false,
  variant = 'default',
}: KuizuLogoProps) {
  const colors = {
    default: {
      primary: '#f59e0b',
      secondary: '#d97706',
      accent: '#fbbf24',
    },
    gradient: {
      primary: 'url(#kuizu-gradient)',
      secondary: 'url(#kuizu-gradient)',
      accent: 'url(#kuizu-gradient)',
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
          <linearGradient id="kuizu-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle cx="24" cy="24" r="22" fill={c.primary} opacity="0.1" />

        {/* Circle border */}
        <circle cx="24" cy="24" r="20" stroke={c.primary} strokeWidth="2.5" fill="none" />

        {/* Question mark */}
        <path
          d="M24 32C24.8 32 25.5 32.7 25.5 33.5C25.5 34.3 24.8 35 24 35C23.2 35 22.5 34.3 22.5 33.5C22.5 32.7 23.2 32 24 32Z"
          fill={c.secondary}
        />

        <path
          d="M24 13C20.7 13 18 15.2 18 18H20.5C20.5 16.6 22 15.5 24 15.5C26 15.5 27.5 16.6 27.5 18C27.5 19.2 26.5 20.1 25 20.8C23.3 21.6 21.5 22.8 21.5 25.5V27H24V25.5C24 24.3 25 23.4 26.5 22.7C28.2 21.9 30 20.7 30 18C30 15.2 27.3 13 24 13Z"
          fill={c.accent}
        />

        {/* Lightbulb rays (subtle) */}
        <line x1="24" y1="6" x2="24" y2="8" stroke={c.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="38" y1="12" x2="36.5" y2="13.5" stroke={c.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="42" y1="24" x2="40" y2="24" stroke={c.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="12" y1="12" x2="11.5" y2="13.5" stroke={c.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="8" y1="24" x2="6" y2="24" stroke={c.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      </svg>

      {showText && (
        <span
          className="font-bold tracking-tight"
          style={{
            fontSize: size * 0.6,
            background: variant === 'gradient'
              ? 'linear-gradient(135deg, #d97706, #f59e0b, #fbbf24)'
              : undefined,
            WebkitBackgroundClip: variant === 'gradient' ? 'text' : undefined,
            WebkitTextFillColor: variant === 'gradient' ? 'transparent' : undefined,
            color: variant === 'mono' ? 'currentColor' : '#f59e0b',
          }}
        >
          Kuizu
        </span>
      )}
    </div>
  );
}

export function KuizuIcon({
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
        <linearGradient id="kuizu-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>

      {/* Circle */}
      <circle cx="12" cy="12" r="10" stroke="url(#kuizu-icon-gradient)" strokeWidth="1.8" fill="none" />

      {/* Question mark */}
      <circle cx="12" cy="16" r="1" fill="#d97706" />

      <path
        d="M12 6.5C10.3 6.5 9 7.6 9 9H10.2C10.2 8.3 11 7.7 12 7.7C13 7.7 13.8 8.3 13.8 9C13.8 9.6 13.2 10 12.5 10.4C11.6 10.8 10.8 11.4 10.8 12.8V13.5H12V12.8C12 12.2 12.6 11.8 13.3 11.4C14.2 11 15 10.4 15 9C15 7.6 13.7 6.5 12 6.5Z"
        fill="url(#kuizu-icon-gradient)"
      />
    </svg>
  );
}
