'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Play, Edit, Trash2, Share2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import { SoloQuizPlayer } from '@/components/kuizu/SoloQuizPlayer';
import { SoloResultScreen } from '@/components/kuizu/SoloResultScreen';
import ShareDialog from '@/components/kuizu/ShareDialog';
import CustomQuizForm from '@/components/kuizu/CustomQuizForm';
import { useKuizuCustomQuiz, useKuizuMutations } from '@/hooks/useKuizu';
import { QUIZ_CATEGORY_LABELS, QUIZ_CATEGORY_EMOJI, QUIZ_DIFFICULTY_LABELS, SoloAnswer } from '@/types/kuizu';
import type { CreateCustomQuizInput } from '@/types/kuizu';

type PageState = 'view' | 'edit' | 'playing' | 'results';

function calculateBestStreak(answers: SoloAnswer[]): number {
  let best = 0, current = 0;
  for (const a of answers) {
    if (a.isCorrect) { current++; best = Math.max(best, current); } else { current = 0; }
  }
  return best;
}

export default function KuizuCustomQuizPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useAuth();
  const quizId = params.quizId as string;

  const { quiz, loading, requiresPasscode, verifyPasscode, refetch } = useKuizuCustomQuiz(quizId);
  const { updateCustomQuiz, deleteCustomQuiz, generateQRCode, loading: mutationLoading } = useKuizuMutations();

  const [pageState, setPageState] = useState<PageState>('view');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeVerifying, setPasscodeVerifying] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [answers, setAnswers] = useState<SoloAnswer[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [startTime, setStartTime] = useState(0);

  const handleVerifyPasscode = async () => {
    if (!passcodeInput.trim()) return;
    setPasscodeVerifying(true);
    try {
      const verified = await verifyPasscode(passcodeInput);
      if (!verified) toast.error(t('kuizu.custom.wrongPasscode', 'Incorrect passcode'));
    } finally { setPasscodeVerifying(false); }
  };

  const handleDelete = async () => {
    if (!confirm(t('kuizu.custom.confirmDelete', 'Are you sure you want to delete this quiz?'))) return;
    try {
      await deleteCustomQuiz(quizId);
      toast.success(t('kuizu.custom.deleteSuccess', 'Quiz deleted'));
      router.push('/tools/kuizu');
    } catch { toast.error(t('kuizu.custom.deleteFailed', 'Failed to delete quiz')); }
  };

  const handleEdit = async (data: CreateCustomQuizInput) => {
    try {
      await updateCustomQuiz(quizId, data);
      toast.success(t('kuizu.custom.updateSuccess', 'Quiz updated'));
      await refetch();
      setPageState('view');
    } catch { toast.error(t('kuizu.custom.updateFailed', 'Failed to update quiz')); }
  };

  const handlePlayComplete = (completedAnswers: SoloAnswer[], points: number) => {
    setAnswers(completedAnswers);
    setTotalPoints(points);
    setPageState('results');
  };

  const handleGenerateQR = async () => {
    const result = await generateQRCode(quizId);
    return result.qrCodeDataUrl;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>;

  if (!quiz) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('kuizu.quizNotFound', 'Quiz not found')}</p>
        <Link href="/tools/kuizu"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />{t('kuizu.backToHome', 'Back to Kuizu')}</Button></Link>
      </div>
    );
  }

  // Passcode required
  if (requiresPasscode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
        <div className="container mx-auto px-4 py-8 max-w-md">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
            <KuizuLogo size={32} showText />
          </div>
          <Card className="border-orange-200">
            <CardContent className="p-8 text-center space-y-4">
              <Lock className="h-16 w-16 mx-auto text-orange-400" />
              <h2 className="text-xl font-bold">{quiz.title}</h2>
              <p className="text-muted-foreground">{t('kuizu.custom.passcodeRequired', 'This quiz requires a passcode')}</p>
              <div className="space-y-3">
                <Input type="password" value={passcodeInput} onChange={(e) => setPasscodeInput(e.target.value)} placeholder={t('kuizu.custom.enterPasscode', 'Enter passcode')} onKeyDown={(e) => e.key === 'Enter' && handleVerifyPasscode()} />
                <Button onClick={handleVerifyPasscode} disabled={passcodeVerifying || !passcodeInput.trim()} className="w-full bg-orange-500 hover:bg-orange-600">
                  {passcodeVerifying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t('kuizu.custom.unlock', 'Unlock')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Edit mode
  if (pageState === 'edit') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setPageState('view')}><ArrowLeft className="h-5 w-5" /></Button>
            <KuizuLogo size={32} showText />
          </div>
        </div>
        <CustomQuizForm initialData={{ title: quiz.title, description: quiz.description, category: quiz.category, questions: quiz.questions, timePerQuestion: quiz.timePerQuestion }}
          onSubmit={handleEdit} onCancel={() => setPageState('view')} loading={mutationLoading} />
      </div>
    );
  }

  // Playing mode
  if (pageState === 'playing') {
    return <SoloQuizPlayer quiz={quiz} onComplete={handlePlayComplete} onExit={() => setPageState('view')} />;
  }

  // Results mode
  if (pageState === 'results') {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const accuracy = answers.length > 0 ? (correctCount / answers.length) * 100 : 0;
    return (
      <SoloResultScreen quiz={quiz} answers={answers} totalPoints={totalPoints}
        correctCount={correctCount} totalQuestions={quiz.questions.length} accuracy={accuracy}
        bestStreak={calculateBestStreak(answers)} timeTaken={Date.now() - startTime}
        onPlayAgain={() => { setAnswers([]); setTotalPoints(0); setStartTime(Date.now()); setPageState('playing'); }}
        onHome={() => router.push('/tools/kuizu')} />
    );
  }

  // View mode
  const isOwner = currentUser?.uid === quiz.createdBy;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <KuizuLogo size={32} showText />
        </div>

        <Card className="border-orange-200">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl text-orange-900">{quiz.title}</CardTitle>
                {quiz.description && <p className="text-muted-foreground mt-1">{quiz.description}</p>}
              </div>
              <span className="text-3xl">{QUIZ_CATEGORY_EMOJI[quiz.category]}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-orange-700 border-orange-300">{QUIZ_CATEGORY_LABELS[quiz.category]}</Badge>
              <Badge variant="outline">{QUIZ_DIFFICULTY_LABELS[quiz.difficulty]}</Badge>
              <Badge variant="outline">{quiz.questionCount} {t('kuizu.questions', 'Questions')}</Badge>
              <Badge variant="outline">{quiz.timePerQuestion}s {t('kuizu.perQuestion', 'per question')}</Badge>
              {quiz.hasPasscode && <Badge variant="outline" className="text-amber-700 border-amber-300"><Lock className="h-3 w-3 mr-1" />{t('kuizu.custom.protected', 'Protected')}</Badge>}
            </div>
            <div className="flex flex-wrap gap-3 pt-4">
              <Button onClick={() => { setStartTime(Date.now()); setPageState('playing'); }} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white" size="lg">
                <Play className="h-5 w-5 mr-2" />{t('kuizu.playNow', 'Play Now')}
              </Button>
              <Button variant="outline" onClick={() => setShareOpen(true)} className="border-orange-300">
                <Share2 className="h-4 w-4 mr-2" />{t('kuizu.share.share', 'Share')}
              </Button>
              {isOwner && (
                <>
                  <Button variant="outline" onClick={() => setPageState('edit')} className="border-orange-300">
                    <Edit className="h-4 w-4 mr-2" />{t('common.edit', 'Edit')}
                  </Button>
                  <Button variant="outline" onClick={handleDelete} className="border-red-300 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4 mr-2" />{t('common.delete', 'Delete')}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardHeader><CardTitle className="text-orange-900">{t('kuizu.questions', 'Questions')} ({quiz.questions.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {quiz.questions.map((q, i) => (
              <div key={q.id} className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
                <div className="w-8 h-8 flex items-center justify-center bg-orange-200 text-orange-800 font-bold rounded text-sm">{i + 1}</div>
                <p className="flex-1 text-sm font-medium truncate">{q.questionText}</p>
                <Badge variant="secondary" className="text-xs">{q.type}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} shareCode={quiz.shareCode} quizId={quiz.id} onGenerateQR={handleGenerateQR} type="quiz" />
    </div>
  );
}
