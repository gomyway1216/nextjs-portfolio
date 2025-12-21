'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameLanguage } from '../constants/gameTranslations';

interface GameLanguageContextType {
  language: GameLanguage;
  setLanguage: (lang: GameLanguage) => void;
}

const GameLanguageContext = createContext<GameLanguageContextType | undefined>(undefined);

export function GameLanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const language = (i18n.language === 'ja' ? 'ja' : 'en') as GameLanguage;

  const setLanguage = (lang: GameLanguage) => {
    i18n.changeLanguage(lang);
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <GameLanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </GameLanguageContext.Provider>
  );
}

export function useGameLanguage(): GameLanguageContextType {
  const { i18n } = useTranslation();
  const context = useContext(GameLanguageContext);

  // If context is available, use it
  if (context) {
    return context;
  }

  // Fallback to i18n directly
  const language = (i18n.language === 'ja' ? 'ja' : 'en') as GameLanguage;
  return {
    language,
    setLanguage: (lang: GameLanguage) => i18n.changeLanguage(lang),
  };
}

interface LanguageSelectorProps {
  style?: React.CSSProperties;
}

export function LanguageSelector({ style }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'ja' ? 'ja' : 'en';

  const setLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div style={{
      display: 'flex',
      gap: '0.5rem',
      ...style,
    }}>
      <button
        onClick={() => setLanguage('en')}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: language === 'en' ? '2px solid #0ea5e9' : '1px solid rgba(75, 85, 99, 0.8)',
          background: language === 'en' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(55, 65, 81, 0.5)',
          color: language === 'en' ? '#0ea5e9' : '#9ca3af',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('ja')}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: language === 'ja' ? '2px solid #0ea5e9' : '1px solid rgba(75, 85, 99, 0.8)',
          background: language === 'ja' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(55, 65, 81, 0.5)',
          color: language === 'ja' ? '#0ea5e9' : '#9ca3af',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        JA
      </button>
    </div>
  );
}
