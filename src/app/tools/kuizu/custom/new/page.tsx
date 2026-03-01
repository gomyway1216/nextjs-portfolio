'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import CustomQuizForm from '@/components/kuizu/CustomQuizForm';
import { useKuizuMutations } from '@/hooks/useKuizu';
import type { CreateCustomQuizInput } from '@/types/kuizu';

export default function KuizuCreateCustomPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { createCustomQuiz, loading } = useKuizuMutations();

  const handleSubmit = async (data: CreateCustomQuizInput) => {
    try {
      const result = await createCustomQuiz(data);
      toast.success(t('kuizu.custom.createSuccess', 'Quiz created!'));
      router.push(`/tools/kuizu/custom/${result.id}`);
    } catch {
      toast.error(t('kuizu.custom.createFailed', 'Failed to create quiz'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <KuizuLogo size={32} showText />
        </div>
      </div>
      <CustomQuizForm onSubmit={handleSubmit} onCancel={() => router.push('/tools/kuizu')} loading={loading} />
    </div>
  );
}
