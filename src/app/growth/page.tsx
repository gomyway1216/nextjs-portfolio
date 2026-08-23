import type { Metadata } from 'next';
import GrowthPage from '@/page/growth/GrowthPage';
import { getPublicMemoryServer } from '@/lib/publicMemory/getPublicMemoryServer';

export const metadata: Metadata = {
  title: 'Growth Timeline',
  description:
    'A public timeline of milestones, learning, and themes in Yudai Yaguchi’s ongoing work and personal growth.',
  alternates: { canonical: '/growth' },
  openGraph: {
    title: 'Growth Timeline | Yudai Yaguchi',
    description: 'Milestones, learning, and recurring themes from an evolving body of work.',
    url: '/growth',
  },
};

export const revalidate = 3600;

export default async function GrowthRoute() {
  const result = await getPublicMemoryServer();
  return <GrowthPage result={result} />;
}
