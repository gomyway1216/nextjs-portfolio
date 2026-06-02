'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Question,QuestionType } from '@/types/kuizu';
import { CheckCircle,XCircle } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OptionButton } from './OptionButton';

interface QuestionDisplayProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (optionId?: string, textAnswer?: string) => void;
  selectedAnswer?: string;
  showResult?: boolean;
  disabled?: boolean;
}

export function QuestionDisplay({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
  selectedAnswer,
  showResult = false,
  disabled = false,
}: QuestionDisplayProps) {
  const { t } = useTranslation();
  const [textInput, setTextInput] = useState('');

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      onAnswer(undefined, textInput.trim());
    }
  };

  const renderOptions = () => {
    switch (question.type) {
      case QuestionType.FOUR_CHOICE:
      case QuestionType.IMAGE_CHOICE:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {question.options.map((option, index) => {
              const isSelected = selectedAnswer === option.id;
              const isCorrect = showResult && option.id === question.correctOptionId;
              const isIncorrect = showResult && isSelected && option.id !== question.correctOptionId;

              return (
                <OptionButton
                  key={option.id}
                  option={option}
                  index={index}
                  isSelected={isSelected}
                  isCorrect={isCorrect}
                  isIncorrect={isIncorrect}
                  showResult={showResult}
                  onClick={() => onAnswer(option.id)}
                  disabled={disabled}
                />
              );
            })}
          </div>
        );

      case QuestionType.TRUE_FALSE:
        const trueOption = question.options.find((o) => o.text.toLowerCase() === 'true');
        const falseOption = question.options.find((o) => o.text.toLowerCase() === 'false');

        return (
          <div className="flex gap-4 justify-center">
            {[trueOption, falseOption].filter(Boolean).map((option, _index) => {
              if (!option) return null;
              const isSelected = selectedAnswer === option.id;
              const isCorrect = showResult && option.id === question.correctOptionId;
              const isIncorrect = showResult && isSelected && option.id !== question.correctOptionId;

              return (
                <Button
                  key={option.id}
                  variant="outline"
                  size="lg"
                  className={`
                    min-w-[120px] transition-all duration-200
                    ${isSelected && !showResult ? 'border-amber-500 bg-amber-50' : ''}
                    ${isCorrect ? 'bg-green-100 border-green-500 text-green-700' : ''}
                    ${isIncorrect ? 'bg-red-100 border-red-500 text-red-700' : ''}
                    ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-amber-300'}
                  `}
                  onClick={() => onAnswer(option.id)}
                  disabled={disabled}
                >
                  {isCorrect && <CheckCircle className="w-4 h-4 mr-2" />}
                  {isIncorrect && <XCircle className="w-4 h-4 mr-2" />}
                  {option.text}
                </Button>
              );
            })}
          </div>
        );

      case QuestionType.FILL_IN_BLANK:
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={t('kuizu.enterAnswer', 'Enter your answer...')}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !disabled) {
                    handleTextSubmit();
                  }
                }}
                disabled={disabled}
                className="flex-1"
              />
              <Button
                onClick={handleTextSubmit}
                disabled={disabled || !textInput.trim()}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {t('kuizu.submit', 'Submit')}
              </Button>
            </div>
            {showResult && (
              <div className="text-center">
                {selectedAnswer === question.correctText ||
                question.acceptableAnswers?.includes(selectedAnswer || '') ? (
                  <div className="text-green-600 font-medium flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    {t('kuizu.correct', 'Correct!')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-red-600 font-medium flex items-center justify-center gap-2">
                      <XCircle className="w-5 h-5" />
                      {t('kuizu.incorrect', 'Incorrect')}
                    </div>
                    <div className="text-sm text-gray-600">
                      {t('kuizu.correctAnswer', 'Correct answer')}: <span className="font-semibold text-green-600">{question.correctText}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-amber-600 border-amber-300">
          {t('kuizu.questionNumber', 'Question {{current}} of {{total}}', {
            current: questionNumber,
            total: totalQuestions,
          })}
        </Badge>
      </div>

      <Card className="p-6">
        <div className="space-y-6">
          <div className="text-xl font-semibold text-center">
            {question.questionText}
          </div>

          {question.questionImageUrl && (
            <div className="flex justify-center">
              <Image
                src={question.questionImageUrl}
                alt="Question"
                width={640}
                height={360}
                unoptimized
                className="max-w-full h-auto max-h-64 rounded-lg"
              />
            </div>
          )}

          {renderOptions()}

          {showResult && question.explanation && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-semibold text-blue-900 mb-1">
                {t('kuizu.explanation', 'Explanation')}:
              </div>
              <div className="text-sm text-blue-800">{question.explanation}</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
