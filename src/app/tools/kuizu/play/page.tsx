'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Play, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import { CategorySelector } from '@/components/kuizu/CategorySelector';
import { DifficultySelector } from '@/components/kuizu/DifficultySelector';
import { SoloQuizPlayer } from '@/components/kuizu/SoloQuizPlayer';
import { SoloResultScreen } from '@/components/kuizu/SoloResultScreen';
import { useKuizuMutations } from '@/hooks/useKuizu';
import {
  Quiz, QuizCategory, QuizDifficulty, SoloAnswer,
  QUIZ_CATEGORY_LABELS, QUIZ_DIFFICULTY_LABELS,
} from '@/types/kuizu';

type PlayState = 'setup' | 'playing' | 'results';

function calculateBestStreak(answers: SoloAnswer[]): number {
  let best = 0, current = 0;
  for (const a of answers) {
    if (a.isCorrect) { current++; best = Math.max(best, current); } else { current = 0; }
  }
  return best;
}

export default function KuizuPlayPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { generateQuiz, submitSoloResult, loading: mutationLoading } = useKuizuMutations();

  const [playState, setPlayState] = useState<PlayState>('setup');
  const [category, setCategory] = useState<QuizCategory | null>(null);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(QuizDifficulty.NORMAL);
  const [questionCount, setQuestionCount] = useState(10);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<SoloAnswer[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [startTime, setStartTime] = useState(0);

  const handleGenerate = async () => {
    if (!category) {
      toast.error(t('kuizu.play.selectCategory', 'Please select a category'));
      return;
    }
    try {
      const generatedQuiz = await generateQuiz({
        title: `${QUIZ_CATEGORY_LABELS[category]} - ${QUIZ_DIFFICULTY_LABELS[difficulty]}`,
        category, difficulty, questionCount, timePerQuestion: 30,
      });
      setQuiz(generatedQuiz);
      setStartTime(Date.now());
      setPlayState('playing');
    } catch {
      toast.error(t('kuizu.play.generateFailed', 'Failed to generate quiz. Try a different category.'));
    }
  };

  const handleComplete = (completedAnswers: SoloAnswer[], points: number) => {
    setAnswers(completedAnswers);
    setTotalPoints(points);
    setPlayState('results');
  };

  const handleSaveResult = async () => {
    if (!quiz) return;
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const accuracy = answers.length > 0 ? (correctCount / answers.length) * 100 : 0;
    try {
      await submitSoloResult({
        quizId: quiz.id, userId: currentUser?.uid || null,
        category: quiz.category, difficulty: quiz.difficulty, answers,
        totalQuestions: quiz.questions.length, correctCount, totalPoints,
        maxPoints: quiz.questions.length * 1500, accuracy,
        streak: calculateBestStreak(answers), timeTaken: Date.now() - startTime,
      });
      toast.success(t('kuizu.play.resultSaved', 'Result saved!'));
    } catch {
      toast.error(t('kuizu.play.saveFailed', 'Failed to save result'));
    }
  };

  const handlePlayAgain = () => { setPlayState('setup'); setQuiz(null); setAnswers([]); setTotalPoints(0); };

  if (playState === 'playing' && quiz) {
    return <SoloQuizPlayer quiz={quiz} onComplete={handleComplete} onExit={() => setPlayState('setup')} />;
  }

  if (playState === 'results' && quiz) {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const accuracy = answers.length > 0 ? (correctCount / answers.length) * 100 : 0;
    return (
      <SoloResultScreen quiz={quiz} answers={answers} totalPoints={totalPoints}
        correctCount={correctCount} totalQuestions={quiz.questions.length} accuracy={accuracy}
        bestStreak={calculateBestStreak(answers)} timeTaken={Date.now() - startTime}
        onPlayAgain={handlePlayAgain} onHome={() => router.push('/tools/kuizu')}
        onSaveResult={currentUser ? handleSaveResult : undefined} />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <KuizuLogo size={32} showText />
        </div>
        <Card className="border-orange-200">
          <CardHeader><CardTitle className="text-orange-900">{t('kuizu.play.title', 'Solo Quiz')}</CardTitle></CardHeader>
          <CardContent className="space-y-8">
            <div>
              <Label className="text-base font-semibold mb-3 block">{t('kuizu.play.selectCategory', 'Select Category')}</Label>
              <CategorySelector selected={category ?? undefined} onSelect={setCategory} />
            </div>
            <div>
              <Label className="text-base font-semibold mb-3 block">{t('kuizu.play.selectDifficulty', 'Difficulty')}</Label>
              <DifficultySelector selected={difficulty} onSelect={setDifficulty} />
            </div>
            <div>
              <Label className="text-base font-semibold mb-3 block">{t('kuizu.play.questionCount', 'Number of Questions')}</Label>
              <Select value={questionCount.toString()} onValueChange={(v) => setQuestionCount(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={!category || mutationLoading} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white" size="lg">
              {mutationLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Play className="h-5 w-5 mr-2" />}
              {t('kuizu.play.startQuiz', 'Start Quiz')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
