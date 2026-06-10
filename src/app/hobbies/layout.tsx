'use client';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HobbiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { loading, isAdmin } = useAuth();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, loading, router]);

  if (loading || !isAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)' }} />
    );
  }

  return <LanguageProvider>{children}</LanguageProvider>;
}
