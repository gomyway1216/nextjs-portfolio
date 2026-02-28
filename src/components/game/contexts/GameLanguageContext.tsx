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
          border: language === 'en' ? '2px solid #4f46e5' : '1px solid rgba(100, 116, 139, 0.4)',
          background: language === 'en' ? 'rgba(79, 70, 229, 0.12)' : 'rgba(255, 255, 255, 0.95)',
          color: language === 'en' ? '#312e81' : '#334155',
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
          border: language === 'ja' ? '2px solid #4f46e5' : '1px solid rgba(100, 116, 139, 0.4)',
          background: language === 'ja' ? 'rgba(79, 70, 229, 0.12)' : 'rgba(255, 255, 255, 0.95)',
          color: language === 'ja' ? '#312e81' : '#334155',
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
