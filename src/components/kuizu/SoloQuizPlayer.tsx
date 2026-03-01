'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QuestionDisplay } from '@/components/kuizu/QuestionDisplay';
import { TimerBar } from '@/components/kuizu/TimerBar';
import { ScoreDisplay } from '@/components/kuizu/ScoreDisplay';
import { StreakDisplay } from '@/components/kuizu/StreakDisplay';
import { Quiz, SoloAnswer, calculatePoints } from '@/types/kuizu';

interface SoloQuizPlayerProps {
  quiz: Quiz;
  onComplete: (answers: SoloAnswer[], totalPoints: number) => void;
  onExit: () => void;
}

export function SoloQuizPlayer({ quiz, onComplete, onExit }: SoloQuizPlayerProps) {
  const { t } = useTranslation();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answers, setAnswers] = useState<SoloAnswer[]>([]);
  const [answerStartTime, setAnswerStartTime] = useState<number>(Date.now());
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>(undefined);
  const [timeRemaining, setTimeRemaining] = useState(quiz.timePerQuestion * 1000);

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const totalQuestions = quiz.questions.length;
  const timeLimitMs = quiz.timePerQuestion * 1000;

  // Timer countdown
  useEffect(() => {
    if (showFeedback) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 100) {
          // Time's up - auto-submit wrong answer
          handleAnswer(undefined, undefined);
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [currentQuestionIndex, showFeedback]);

  const handleAnswer = useCallback(
    (selectedOptionId?: string, textAnswer?: string) => {
      if (showFeedback) return;

      setSelectedAnswer(selectedOptionId || textAnswer);

      const timeTaken = Date.now() - answerStartTime;
      const isCorrect =
        selectedOptionId === currentQuestion.correctOptionId ||
        (textAnswer && textAnswer.toLowerCase().trim() === currentQuestion.correctText?.toLowerCase().trim());

      const currentStreak = isCorrect ? streak + 1 : 0;
      const points = calculatePoints(isCorrect, timeTaken, timeLimitMs, currentStreak);

      const answer: SoloAnswer = {
        questionId: currentQuestion.id,
        selectedOptionId,
        textAnswer,
        isCorrect,
        timeTaken,
        points,
      };

      setAnswers((prev) => [...prev, answer]);
      setScore((prev) => prev + points);
      setStreak(currentStreak);
      setLastAnswerCorrect(isCorrect);
      setShowFeedback(true);

      // Show feedback briefly, then advance
      setTimeout(() => {
        if (currentQuestionIndex + 1 >= totalQuestions) {
          // Quiz complete
          onComplete([...answers, answer], score + points);
        } else {
          // Next question
          setCurrentQuestionIndex((prev) => prev + 1);
          setShowFeedback(false);
          setSelectedAnswer(undefined);
          setAnswerStartTime(Date.now());
          setTimeRemaining(timeLimitMs);
        }
      }, 1500);
    },
    [
      currentQuestion,
      currentQuestionIndex,
      totalQuestions,
      answers,
      score,
      streak,
      answerStartTime,
      timeLimitMs,
      showFeedback,
      onComplete,
    ]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <ScoreDisplay score={score} />
            <StreakDisplay streak={streak} />
          </div>
          <Button variant="ghost" size="icon" onClick={onExit}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Timer Bar */}
        <TimerBar
          timeRemaining={timeRemaining}
          totalTime={timeLimitMs}
          className="mb-4"
        />

        {/* Question Counter */}
        <div className="text-center mb-6">
          <p className="text-lg font-semibold text-orange-900">
            {currentQuestionIndex + 1}/{totalQuestions}
          </p>
        </div>

        {/* Question Display */}
        <Card className="border-orange-200">
          <QuestionDisplay
            question={currentQuestion}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={totalQuestions}
            onAnswer={handleAnswer}
            disabled={showFeedback}
            showResult={showFeedback}
            selectedAnswer={selectedAnswer}
          />
        </Card>

        {/* Feedback Message */}
        {showFeedback && (
          <div className="mt-4 text-center">
            <p
              className={`text-xl font-bold ${
                lastAnswerCorrect ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {lastAnswerCorrect ? t('kuizu.correct') : t('kuizu.incorrect')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
