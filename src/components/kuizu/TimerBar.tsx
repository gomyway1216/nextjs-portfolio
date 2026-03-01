'use client';

import { Progress } from '@/components/ui/progress';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TimerBarProps {
  timeRemaining: number;
  totalTime: number;
  className?: string;
}

export function TimerBar({ timeRemaining, totalTime, className = '' }: TimerBarProps) {
  const { t } = useTranslation();

  const percentage = (timeRemaining / totalTime) * 100;
  const seconds = Math.ceil(timeRemaining / 1000);

  const getColorClass = () => {
    if (percentage > 50) {
      return 'text-green-600';
    } else if (percentage > 25) {
      return 'text-yellow-600';
    } else {
      return 'text-red-600';
    }
  };

  const getProgressColor = () => {
    if (percentage > 50) {
      return '[&>div]:bg-green-500';
    } else if (percentage > 25) {
      return '[&>div]:bg-yellow-500';
    } else {
      return '[&>div]:bg-red-500';
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${getColorClass()}`} />
          <span className={`text-sm font-semibold ${getColorClass()}`}>
            {t('kuizu.timeRemaining', 'Time Remaining')}
          </span>
        </div>
        <span className={`text-lg font-bold ${getColorClass()}`}>
          {seconds}s
        </span>
      </div>
      <Progress
        value={percentage}
        className={`h-2 ${getProgressColor()}`}
      />
    </div>
  );
}
