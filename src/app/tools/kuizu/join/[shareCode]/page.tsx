'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Play } from 'lucide-react';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import { QuizCard } from '@/components/kuizu/QuizCard';
import { useKuizuCustomQuizByShareCode } from '@/hooks/useKuizu';

export default function KuizuJoinByShareCodePage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const shareCode = params.shareCode as string;
  const { quiz, loading, error } = useKuizuCustomQuizByShareCode(shareCode);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto" />
          <p className="text-muted-foreground">{t('kuizu.join.loading', 'Loading quiz...')}</p>
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <KuizuLogo size={48} showText />
        <p className="text-muted-foreground">{error || t('kuizu.join.notFound', 'Quiz not found')}</p>
        <Link href="/tools/kuizu"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />{t('kuizu.backToHome', 'Back to Kuizu')}</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-8 max-w-md">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <KuizuLogo size={32} showText />
        </div>
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-orange-900 mb-2">{t('kuizu.join.sharedQuiz', 'Shared Quiz')}</h1>
          <p className="text-muted-foreground">{t('kuizu.join.sharedDescription', 'Someone shared this quiz with you')}</p>
        </div>
        <div className="mb-6"><QuizCard quiz={quiz} /></div>
        <Button onClick={() => router.push(`/tools/kuizu/custom/${quiz.id}`)} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white" size="lg">
          <Play className="h-5 w-5 mr-2" />{t('kuizu.join.playQuiz', 'Play This Quiz')}
        </Button>
      </div>
    </div>
  );
}
