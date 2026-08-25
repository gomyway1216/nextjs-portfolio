import type { Metadata } from 'next';
import PublicMemoryAtlas from '@/components/memory/PublicMemoryAtlas';
import { getPublicMemoriesServer } from '@/lib/memory/getPublicMemoriesServer';
import type { PublicMemoryItem } from '@/lib/memory/publicMemory';

export const metadata: Metadata = {
  title: 'Public Memory Map',
  description: 'A deliberately published timeline of the experiences, goals, and connections shaping Yudai Yaguchi’s work.',
  alternates: { canonical: '/memory' },
  openGraph: {
    title: 'Public Memory Map | Yudai Yaguchi',
    description: 'Explore a deliberately published timeline of experiences, goals, and connections.',
    url: '/memory',
  },
};

export const revalidate = 300;

export default async function PublicMemoryPage() {
  let items: PublicMemoryItem[] = [];
  let unavailable = false;

  try {
    items = await getPublicMemoriesServer();
  } catch {
    // The public page fails closed. Do not log the response or endpoint: an
    // upstream regression must not copy unexpected memory fields into logs.
    console.error('[memory] Public projection is temporarily unavailable');
    unavailable = true;
  }

  return <PublicMemoryAtlas items={items} unavailable={unavailable} />;
}
