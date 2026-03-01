'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Target, Zap, Clock, ChevronDown, ChevronUp, Home, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Quiz, SoloAnswer } from '@/types/kuizu';

interface SoloResultScreenProps {
  quiz: Quiz;
  answers: SoloAnswer[];
  totalPoints: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  bestStreak: number;
  timeTaken: number;
  onPlayAgain: () => void;
  onHome: () => void;
  onSaveResult?: () => void;
}

export function SoloResultScreen({
  quiz,
  answers,
  totalPoints,
  correctCount,
  totalQuestions,
  accuracy,
  bestStreak,
  timeTaken,
  onPlayAgain,
  onHome,
  onSaveResult,
}: SoloResultScreenProps) {
  const { t } = useTranslation();
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());

  const toggleQuestion = (index: number) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
      : `${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Summary Card */}
        <Card className="border-orange-200 mb-6">
          <CardHeader>
            <CardTitle className="text-center text-2xl text-orange-900">
              {t('kuizu.quizComplete')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {/* Total Points */}
              <div className="text-center p-4 bg-orange-100 rounded-lg">
                <Trophy className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                <p className="text-3xl font-bold text-orange-900">{totalPoints}</p>
                <p className="text-sm text-orange-700">{t('kuizu.points')}</p>
              </div>

              {/* Accuracy */}
              <div className="text-center p-4 bg-amber-100 rounded-lg">
                <Target className="h-8 w-8 mx-auto mb-2 text-amber-600" />
                <p className="text-3xl font-bold text-amber-900">{accuracy.toFixed(1)}%</p>
                <p className="text-sm text-amber-700">{t('kuizu.accuracy')}</p>
              </div>

              {/* Correct Count */}
              <div className="text-center p-4 bg-green-100 rounded-lg">
                <div className="text-3xl font-bold text-green-900">
                  {correctCount}/{totalQuestions}
                </div>
                <p className="text-sm text-green-700">{t('kuizu.correct')}</p>
              </div>

              {/* Best Streak */}
              <div className="text-center p-4 bg-purple-100 rounded-lg">
                <Zap className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                <p className="text-3xl font-bold text-purple-900">{bestStreak}</p>
                <p className="text-sm text-purple-700">{t('kuizu.bestStreak')}</p>
              </div>
            </div>

            {/* Time Taken */}
            <div className="flex items-center justify-center gap-2 text-orange-700 mb-6">
              <Clock className="h-5 w-5" />
              <span className="text-lg">
                {t('kuizu.timeTaken')}: {formatTime(timeTaken)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={onPlayAgain} className="bg-orange-600 hover:bg-orange-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('kuizu.playAgain')}
              </Button>
              <Button onClick={onHome} variant="outline" className="border-orange-300">
                <Home className="h-4 w-4 mr-2" />
                {t('kuizu.home')}
              </Button>
              {onSaveResult && (
                <Button onClick={onSaveResult} variant="outline" className="border-orange-300">
                  <Save className="h-4 w-4 mr-2" />
                  {t('kuizu.saveResult')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Question Review */}
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="text-orange-900">{t('kuizu.reviewAnswers')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quiz.questions.map((question, index) => {
              const answer = answers[index];
              const isExpanded = expandedQuestions.has(index);
              const userOption = question.options.find(
                (opt) => opt.id === answer?.selectedOptionId
              );
              const correctOption = question.options.find(
                (opt) => opt.id === question.correctOptionId
              );

              return (
                <div
                  key={question.id}
                  className="border border-orange-200 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleQuestion(index)}
                    className="w-full p-4 flex items-center justify-between hover:bg-orange-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={answer?.isCorrect ? 'default' : 'destructive'}
                        className={
                          answer?.isCorrect
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        }
                      >
                        {index + 1}
                      </Badge>
                      <span className="text-left font-medium text-orange-900">
                        {question.questionText}
                      </span>
                      <Badge variant="outline" className="ml-auto mr-2">
                        {answer?.points || 0} pts
                      </Badge>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-orange-600" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-orange-600" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="p-4 bg-orange-50 border-t border-orange-200 space-y-3">
                      {/* User's Answer */}
                      <div>
                        <p className="text-sm font-semibold text-orange-700 mb-1">
                          {t('kuizu.yourAnswer')}:
                        </p>
                        <p
                          className={`${
                            answer?.isCorrect ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {answer?.textAnswer || userOption?.text || t('kuizu.noAnswer')}
                        </p>
                      </div>

                      {/* Correct Answer */}
                      {!answer?.isCorrect && (
                        <div>
                          <p className="text-sm font-semibold text-green-700 mb-1">
                            {t('kuizu.correctAnswer')}:
                          </p>
                          <p className="text-green-700">
                            {question.correctText || correctOption?.text}
                          </p>
                        </div>
                      )}

                      {/* Explanation */}
                      {question.explanation && (
                        <div className="pt-2 border-t border-orange-200">
                          <p className="text-sm font-semibold text-orange-700 mb-1">
                            {t('kuizu.explanation')}:
                          </p>
                          <p className="text-sm text-orange-800">{question.explanation}</p>
                        </div>
                      )}

                      {/* Time and Points */}
                      <div className="flex items-center gap-4 text-sm text-orange-600">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>{formatTime(answer?.timeTaken || 0)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Trophy className="h-4 w-4" />
                          <span>{answer?.points || 0} points</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
