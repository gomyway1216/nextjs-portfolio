'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SoloQuizPlayer } from '@/components/kuizu/SoloQuizPlayer';
import { DailyChallenge, Quiz, SoloAnswer, QUIZ_CATEGORY_EMOJI } from '@/types/kuizu';

interface DailyChallengePlayerProps {
  challenge: DailyChallenge;
  onComplete: (score: number, accuracy: number, timeTaken: number) => void;
  onExit: () => void;
}

export function DailyChallengePlayer({
  challenge,
  onComplete,
  onExit,
}: DailyChallengePlayerProps) {
  const { t } = useTranslation();
  const [startTime] = useState(Date.now());

  // Convert DailyChallenge to Quiz format
  const quiz: Quiz = {
    id: challenge.id,
    title: t('kuizu.dailyChallenge'),
    category: challenge.category,
    difficulty: challenge.difficulty,
    questionCount: challenge.questionCount,
    questions: challenge.questions,
    timePerQuestion: 30, // Default 30 seconds per question
    isCustom: false,
    hasPasscode: false,
    createdBy: null,
    createdAt: challenge.date,
    updatedAt: challenge.date,
  };

  const handleComplete = (answers: SoloAnswer[], totalPoints: number) => {
    const timeTaken = Date.now() - startTime;
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const accuracy = (correctCount / answers.length) * 100;

    onComplete(totalPoints, accuracy, timeTaken);
  };

  const categoryEmoji = QUIZ_CATEGORY_EMOJI[challenge.category];
  const difficultyColors = {
    easy: 'bg-green-100 text-green-800 border-green-300',
    normal: 'bg-blue-100 text-blue-800 border-blue-300',
    hard: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <div className="relative">
      {/* Daily Challenge Header Banner */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white py-4 px-4 mb-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Calendar className="h-6 w-6" />
              <div>
                <h2 className="text-xl font-bold">{t('kuizu.dailyChallenge')}</h2>
                <p className="text-sm text-orange-100">
                  {new Date(challenge.date).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{categoryEmoji}</span>
              <Badge
                variant="outline"
                className={`${difficultyColors[challenge.difficulty]} border-white`}
              >
                {t(`kuizu.difficulty.${challenge.difficulty}`)}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Quiz Player */}
      <SoloQuizPlayer quiz={quiz} onComplete={handleComplete} onExit={onExit} />
    </div>
  );
}
