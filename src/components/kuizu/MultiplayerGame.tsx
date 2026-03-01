'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, CheckCircle } from 'lucide-react';
import { KuizuGameState, KuizuPlayer, QuestionType } from '@/types/kuizu';

interface MultiplayerGameProps {
  gameState: KuizuGameState;
  playerId: string;
  onAnswer: (answer: string, time: number) => void;
  players: KuizuPlayer[];
}

export default function MultiplayerGame({
  gameState,
  playerId,
  onAnswer,
  players,
}: MultiplayerGameProps) {
  const { t } = useTranslation();
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(gameState.timePerQuestion);
  const [hasAnswered, setHasAnswered] = useState(false);

  const currentQuestion = gameState.currentQuestion;
  const playersWhoAnswered = Object.keys(gameState.playerAnswers || {});

  useEffect(() => {
    setHasAnswered(false);
    setSelectedAnswer(null);
    setTimeRemaining(gameState.timePerQuestion);
  }, [gameState.currentQuestionIndex, gameState.timePerQuestion]);

  useEffect(() => {
    if (hasAnswered) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [hasAnswered]);

  const handleAnswer = (answer: string) => {
    if (hasAnswered) return;

    setSelectedAnswer(answer);
    setHasAnswered(true);
    const timeTaken = gameState.timePerQuestion - timeRemaining;
    onAnswer(answer, timeTaken);
  };

  const progressPercentage = (timeRemaining / gameState.timePerQuestion) * 100;

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="container max-w-6xl mx-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Area */}
        <div className="lg:col-span-3 space-y-4">
          {/* Timer and Question Number */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-lg px-4 py-2">
              {t('kuizu.question')} {gameState.currentQuestionIndex + 1} / {gameState.totalQuestions}
            </Badge>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <span className="text-2xl font-bold text-orange-600">
                {timeRemaining}s
              </span>
            </div>
          </div>

          {/* Timer Bar */}
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Question Card */}
          <Card className="border-orange-200">
            <CardHeader>
              <CardTitle className="text-2xl">{currentQuestion.questionText}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Answer Options */}
              {currentQuestion.type === QuestionType.FOUR_CHOICE && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentQuestion.options.map((option) => (
                    <Button
                      key={option.id}
                      onClick={() => handleAnswer(option.id)}
                      disabled={hasAnswered}
                      variant={selectedAnswer === option.id ? 'default' : 'outline'}
                      className={`h-auto min-h-[80px] text-lg p-4 ${
                        selectedAnswer === option.id
                          ? 'bg-orange-500 hover:bg-orange-600'
                          : 'hover:bg-orange-50 hover:border-orange-300'
                      }`}
                    >
                      {option.text}
                    </Button>
                  ))}
                </div>
              )}

              {currentQuestion.type === QuestionType.TRUE_FALSE && (
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={() => handleAnswer('true')}
                    disabled={hasAnswered}
                    variant={selectedAnswer === 'true' ? 'default' : 'outline'}
                    className={`h-24 text-xl ${
                      selectedAnswer === 'true'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'hover:bg-orange-50 hover:border-orange-300'
                    }`}
                  >
                    {t('kuizu.true')}
                  </Button>
                  <Button
                    onClick={() => handleAnswer('false')}
                    disabled={hasAnswered}
                    variant={selectedAnswer === 'false' ? 'default' : 'outline'}
                    className={`h-24 text-xl ${
                      selectedAnswer === 'false'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'hover:bg-orange-50 hover:border-orange-300'
                    }`}
                  >
                    {t('kuizu.false')}
                  </Button>
                </div>
              )}

              {hasAnswered && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-green-700 font-medium">
                    {t('kuizu.answerSubmitted')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Players */}
        <div className="lg:col-span-1">
          <Card className="border-orange-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5" />
                {t('kuizu.multiplayer.players')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {players.map((player) => {
                const answered = playersWhoAnswered.includes(player.id);
                const score = gameState.playerScores[player.id] || 0;
                const streak = gameState.playerStreaks[player.id] || 0;

                return (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg border ${
                      player.id === playerId
                        ? 'bg-orange-50 border-orange-300'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{player.name}</span>
                      {answered && (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {t('kuizu.score')}: {score}
                    </div>
                    {streak > 0 && (
                      <div className="text-xs text-orange-600 font-medium">
                        {t('kuizu.streak')}: {streak}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
