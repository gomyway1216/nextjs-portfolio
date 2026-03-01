'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { SoloResultScreen } from '@/components/kuizu/SoloResultScreen';
import * as kuizuService from '@/services/kuizuService';
import type { SoloResult, Quiz } from '@/types/kuizu';

export default function KuizuResultReviewPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const resultId = params.resultId as string;
  const [result, setResult] = useState<SoloResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const data = await kuizuService.getSoloResult(resultId);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load result');
      } finally {
        setLoading(false);
      }
    };
    if (resultId) fetchResult();
  }, [resultId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>;
  }

  if (error || !result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error || t('kuizu.resultNotFound', 'Result not found')}</p>
        <Link href="/tools/kuizu"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />{t('kuizu.backToHome', 'Back to Kuizu')}</Button></Link>
      </div>
    );
  }

  const quiz: Quiz = {
    id: result.quizId, title: `${result.category} - ${result.difficulty}`,
    category: result.category, difficulty: result.difficulty,
    questionCount: result.totalQuestions, questions: [],
    timePerQuestion: 30, createdBy: null, isCustom: false,
    hasPasscode: false, createdAt: result.createdAt, updatedAt: result.createdAt,
  };

  return (
    <SoloResultScreen quiz={quiz} answers={result.answers} totalPoints={result.totalPoints}
      correctCount={result.correctCount} totalQuestions={result.totalQuestions}
      accuracy={result.accuracy} bestStreak={result.streak} timeTaken={result.timeTaken}
      onPlayAgain={() => router.push('/tools/kuizu/play')} onHome={() => router.push('/tools/kuizu')} />
  );
}
