'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit, Save, X, Lock } from 'lucide-react';
import { CreateCustomQuizInput, QuizCategory, Question, QUIZ_CATEGORY_LABELS, QUIZ_CATEGORY_EMOJI } from '@/types/kuizu';
import CustomQuestionForm from './CustomQuestionForm';

interface CustomQuizFormProps {
  initialData?: Partial<CreateCustomQuizInput>;
  onSubmit: (data: CreateCustomQuizInput) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function CustomQuizForm({
  initialData,
  onSubmit,
  onCancel,
  loading = false,
}: CustomQuizFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [category, setCategory] = useState<QuizCategory>(
    initialData?.category || QuizCategory.CUSTOM
  );
  const [timePerQuestion, setTimePerQuestion] = useState(
    initialData?.timePerQuestion || 30
  );
  const [passcode, setPasscode] = useState(initialData?.passcode || '');
  const [questions, setQuestions] = useState<Question[]>(initialData?.questions || []);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  const handleAddQuestion = (question: Question) => {
    setQuestions([...questions, question]);
    setIsAddingQuestion(false);
  };

  const handleEditQuestion = (question: Question) => {
    if (editingQuestionIndex !== null) {
      const updated = [...questions];
      updated[editingQuestionIndex] = question;
      setQuestions(updated);
      setEditingQuestionIndex(null);
    }
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const data: CreateCustomQuizInput = {
      title,
      description: description || undefined,
      category,
      questions,
      timePerQuestion,
      passcode: passcode || undefined,
    };
    onSubmit(data);
  };

  const isValid = title.trim() !== '' && questions.length > 0;

  if (isAddingQuestion) {
    return (
      <CustomQuestionForm
        index={questions.length}
        onSave={handleAddQuestion}
        onCancel={() => setIsAddingQuestion(false)}
      />
    );
  }

  if (editingQuestionIndex !== null) {
    return (
      <CustomQuestionForm
        question={questions[editingQuestionIndex]}
        index={editingQuestionIndex}
        onSave={handleEditQuestion}
        onCancel={() => setEditingQuestionIndex(null)}
      />
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle>{t('kuizu.custom.createQuiz')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">{t('kuizu.custom.quizTitle')} *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('kuizu.custom.quizTitlePlaceholder')}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">{t('kuizu.custom.description')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('kuizu.custom.descriptionPlaceholder')}
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">{t('kuizu.category')}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as QuizCategory)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(QuizCategory).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {QUIZ_CATEGORY_EMOJI[cat]} {QUIZ_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="timePerQuestion">{t('kuizu.timePerQuestion')}</Label>
                <Select
                  value={timePerQuestion.toString()}
                  onValueChange={(v) => setTimePerQuestion(Number(v))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 {t('kuizu.seconds')}</SelectItem>
                    <SelectItem value="30">30 {t('kuizu.seconds')}</SelectItem>
                    <SelectItem value="45">45 {t('kuizu.seconds')}</SelectItem>
                    <SelectItem value="60">60 {t('kuizu.seconds')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="passcode" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {t('kuizu.custom.passcode')} ({t('common.optional')})
              </Label>
              <Input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={t('kuizu.custom.passcodePlaceholder')}
                className="mt-1"
              />
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-lg">
                {t('kuizu.questions')} ({questions.length})
              </Label>
              <Button
                onClick={() => setIsAddingQuestion(true)}
                variant="outline"
                size="sm"
                className="text-orange-600 border-orange-300 hover:bg-orange-50"
              >
                <Plus className="w-4 h-4 mr-1" />
                {t('kuizu.custom.addQuestion')}
              </Button>
            </div>

            {questions.length === 0 ? (
              <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-500">
                  {t('kuizu.custom.noQuestionsYet')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((question, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50"
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-100 text-orange-700 font-bold rounded">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{question.questionText}</p>
                      <p className="text-sm text-gray-500">
                        {question.type} • {question.difficulty}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setEditingQuestionIndex(index)}
                        variant="outline"
                        size="sm"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteQuestion(index)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!isValid || loading}
              className="flex-1 bg-orange-500 hover:bg-orange-600"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              {t('common.save')}
            </Button>
            <Button
              onClick={onCancel}
              variant="outline"
              disabled={loading}
              size="lg"
            >
              <X className="w-5 h-5 mr-2" />
              {t('common.cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
