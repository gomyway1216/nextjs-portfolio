'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, X, Plus, Trash2 } from 'lucide-react';
import {
  Question,
  QuestionType,
  QuizCategory,
  QuizDifficulty,
  QuestionOption,
  QUESTION_TYPE_LABELS,
  QUIZ_DIFFICULTY_LABELS,
} from '@/types/kuizu';

interface CustomQuestionFormProps {
  question?: Question;
  onSave: (question: Question) => void;
  onCancel: () => void;
  index: number;
}

export default function CustomQuestionForm({
  question,
  onSave,
  onCancel,
  index,
}: CustomQuestionFormProps) {
  const { t } = useTranslation();
  const [questionType, setQuestionType] = useState<QuestionType>(
    question?.type || QuestionType.FOUR_CHOICE
  );
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(
    question?.difficulty || QuizDifficulty.NORMAL
  );
  const [questionText, setQuestionText] = useState(question?.questionText || '');
  const [options, setOptions] = useState<QuestionOption[]>(
    question?.options || [
      { id: 'opt1', text: '' },
      { id: 'opt2', text: '' },
      { id: 'opt3', text: '' },
      { id: 'opt4', text: '' },
    ]
  );
  const [correctOptionId, setCorrectOptionId] = useState(
    question?.correctOptionId || 'opt1'
  );
  const [correctText, setCorrectText] = useState(question?.correctText || '');
  const [acceptableAnswers, setAcceptableAnswers] = useState<string[]>(
    question?.acceptableAnswers || []
  );
  const [explanation, setExplanation] = useState(question?.explanation || '');

  const handleOptionChange = (index: number, text: string) => {
    const updated = [...options];
    updated[index].text = text;
    setOptions(updated);
  };

  const handleAddAcceptableAnswer = () => {
    setAcceptableAnswers([...acceptableAnswers, '']);
  };

  const handleRemoveAcceptableAnswer = (index: number) => {
    setAcceptableAnswers(acceptableAnswers.filter((_, i) => i !== index));
  };

  const handleAcceptableAnswerChange = (index: number, value: string) => {
    const updated = [...acceptableAnswers];
    updated[index] = value;
    setAcceptableAnswers(updated);
  };

  const handleSave = () => {
    const newQuestion: Question = {
      id: question?.id || `q${Date.now()}`,
      type: questionType,
      category: question?.category || QuizCategory.CUSTOM,
      difficulty,
      questionText,
      options: questionType === QuestionType.FOUR_CHOICE ? options : [],
      correctOptionId:
        questionType === QuestionType.FOUR_CHOICE
          ? correctOptionId
          : questionType === QuestionType.TRUE_FALSE
          ? correctText
          : '',
      correctText:
        questionType === QuestionType.FILL_IN_BLANK ? correctText : undefined,
      acceptableAnswers:
        questionType === QuestionType.FILL_IN_BLANK && acceptableAnswers.length > 0
          ? acceptableAnswers.filter((a) => a.trim() !== '')
          : undefined,
      explanation: explanation || undefined,
    };

    onSave(newQuestion);
  };

  const isValid = () => {
    if (!questionText.trim()) return false;

    switch (questionType) {
      case QuestionType.FOUR_CHOICE:
        return options.every((opt) => opt.text.trim() !== '') && correctOptionId;
      case QuestionType.TRUE_FALSE:
        return correctText === 'true' || correctText === 'false';
      case QuestionType.FILL_IN_BLANK:
        return correctText.trim() !== '';
      default:
        return false;
    }
  };

  return (
    <div className="container max-w-3xl mx-auto p-4">
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle>
            {question
              ? t('kuizu.custom.editQuestion')
              : t('kuizu.custom.addQuestion')} #{index + 1}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question Type & Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="questionType">{t('kuizu.questionType')}</Label>
              <Select
                value={questionType}
                onValueChange={(v) => setQuestionType(v as QuestionType)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(QuestionType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {QUESTION_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="difficulty">{t('kuizu.difficulty')}</Label>
              <Select
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as QuizDifficulty)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(QuizDifficulty).map((diff) => (
                    <SelectItem key={diff} value={diff}>
                      {QUIZ_DIFFICULTY_LABELS[diff]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Question Text */}
          <div>
            <Label htmlFor="questionText">{t('kuizu.questionText')} *</Label>
            <Textarea
              id="questionText"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={t('kuizu.custom.questionTextPlaceholder')}
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Four Choice Options */}
          {questionType === QuestionType.FOUR_CHOICE && (
            <div className="space-y-3">
              <Label>{t('kuizu.custom.answerOptions')} *</Label>
              {options.map((option, idx) => (
                <div key={option.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctOption"
                    checked={correctOptionId === option.id}
                    onChange={() => setCorrectOptionId(option.id)}
                    className="w-4 h-4 text-orange-500"
                  />
                  <Input
                    value={option.text}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`${t('kuizu.custom.option')} ${idx + 1}`}
                  />
                </div>
              ))}
              <p className="text-sm text-gray-500">
                {t('kuizu.custom.selectCorrectOption')}
              </p>
            </div>
          )}

          {/* True/False */}
          {questionType === QuestionType.TRUE_FALSE && (
            <div>
              <Label>{t('kuizu.custom.correctAnswer')} *</Label>
              <div className="flex gap-4 mt-2">
                <Button
                  type="button"
                  onClick={() => setCorrectText('true')}
                  variant={correctText === 'true' ? 'default' : 'outline'}
                  className={
                    correctText === 'true'
                      ? 'bg-orange-500 hover:bg-orange-600'
                      : ''
                  }
                >
                  {t('kuizu.true')}
                </Button>
                <Button
                  type="button"
                  onClick={() => setCorrectText('false')}
                  variant={correctText === 'false' ? 'default' : 'outline'}
                  className={
                    correctText === 'false'
                      ? 'bg-orange-500 hover:bg-orange-600'
                      : ''
                  }
                >
                  {t('kuizu.false')}
                </Button>
              </div>
            </div>
          )}

          {/* Fill in the Blank */}
          {questionType === QuestionType.FILL_IN_BLANK && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="correctText">{t('kuizu.custom.correctAnswer')} *</Label>
                <Input
                  id="correctText"
                  value={correctText}
                  onChange={(e) => setCorrectText(e.target.value)}
                  placeholder={t('kuizu.custom.correctAnswerPlaceholder')}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>{t('kuizu.custom.acceptableAnswers')} ({t('common.optional')})</Label>
                <div className="space-y-2 mt-2">
                  {acceptableAnswers.map((answer, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={answer}
                        onChange={(e) =>
                          handleAcceptableAnswerChange(idx, e.target.value)
                        }
                        placeholder={t('kuizu.custom.alternativeAnswer')}
                      />
                      <Button
                        type="button"
                        onClick={() => handleRemoveAcceptableAnswer(idx)}
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    onClick={handleAddAcceptableAnswer}
                    variant="outline"
                    size="sm"
                    className="text-orange-600 border-orange-300"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    {t('kuizu.custom.addAlternative')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Explanation */}
          <div>
            <Label htmlFor="explanation">
              {t('kuizu.custom.explanation')} ({t('common.optional')})
            </Label>
            <Textarea
              id="explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder={t('kuizu.custom.explanationPlaceholder')}
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={!isValid()}
              className="flex-1 bg-orange-500 hover:bg-orange-600"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              {t('common.save')}
            </Button>
            <Button onClick={onCancel} variant="outline" size="lg">
              <X className="w-5 h-5 mr-2" />
              {t('common.cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
