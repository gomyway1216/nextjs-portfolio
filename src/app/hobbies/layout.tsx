'use client';

import { LanguageProvider } from '@/contexts/LanguageContext';

export default function HobbiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
