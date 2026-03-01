'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ScoreDisplayProps {
  score: number;
  lastPoints?: number;
  className?: string;
}

export function ScoreDisplay({ score, lastPoints, className = '' }: ScoreDisplayProps) {
  const { t } = useTranslation();
  const [showPointsAnimation, setShowPointsAnimation] = useState(false);

  useEffect(() => {
    if (lastPoints && lastPoints > 0) {
      setShowPointsAnimation(true);
      const timer = setTimeout(() => {
        setShowPointsAnimation(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [lastPoints]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Trophy className="w-5 h-5 text-amber-600" />
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-amber-600">
          {score.toLocaleString()}
        </span>
        <span className="text-sm text-gray-600">
          {t('kuizu.points', 'pts')}
        </span>
      </div>
      {showPointsAnimation && lastPoints && lastPoints > 0 && (
        <span className="text-green-600 font-semibold text-lg animate-bounce">
          +{lastPoints}
        </span>
      )}
    </div>
  );
}
