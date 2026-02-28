'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export interface GameToolbarContent {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
}

interface GameToolbarContextValue {
  content: GameToolbarContent | null;
  setContent: (content: GameToolbarContent | null) => void;
}

const GameToolbarContext = createContext<GameToolbarContextValue | null>(null);

export function GameToolbarProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<GameToolbarContent | null>(null);
  return (
    <GameToolbarContext.Provider value={{ content, setContent }}>
      {children}
    </GameToolbarContext.Provider>
  );
}

export function useGameToolbar() {
  const ctx = useContext(GameToolbarContext);
  if (!ctx) return { content: null, setContent: () => {} };
  return ctx;
}
