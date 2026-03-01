'use client';

import { useEffect, useState } from 'react';
import { SCORING } from '@/types/kuizu';
import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StreakDisplayProps {
  streak: number;
  className?: string;
}

export function StreakDisplay({ streak, className = '' }: StreakDisplayProps) {
  const { t } = useTranslation();
  const [prevStreak, setPrevStreak] = useState(streak);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (streak > prevStreak) {
      setAnimate(true);
      const timer = setTimeout(() => {
        setAnimate(false);
      }, 500);
      return () => clearTimeout(timer);
    }
    setPrevStreak(streak);
  }, [streak, prevStreak]);

  if (streak === 0) {
    return null;
  }

  const multiplierKey = Math.min(streak, 4) as keyof typeof SCORING.STREAK_MULTIPLIERS;
  const multiplier = SCORING.STREAK_MULTIPLIERS[multiplierKey];

  return (
    <div className={`flex items-center gap-2 ${className} ${animate ? 'animate-pulse' : ''}`}>
      <Flame className="w-5 h-5 text-orange-500" />
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-orange-600">
          {streak}
        </span>
        <span className="text-sm text-gray-600">
          {t('kuizu.streak', 'streak')}
        </span>
      </div>
      {multiplier > 1.0 && (
        <span className="text-sm font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
          {multiplier.toFixed(1)}x
        </span>
      )}
    </div>
  );
}
