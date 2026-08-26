import type { Metadata } from 'next';
import PublicMemoryAtlas from '@/components/memory/PublicMemoryAtlas';
import { getPublicMemoriesServer } from '@/lib/memory/getPublicMemoriesServer';
import type { PublicMemoryItem } from '@/lib/memory/publicMemory';
import { requireServerAdmin } from '@/lib/serverAdminAuth';

export const metadata: Metadata = {
  title: 'Memory Preview',
  description: 'An administrator-only preview of memory candidates.',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export default async function MemoryPreviewPage() {
  // Defense in depth behind the middleware gate: do not contact the memory
  // projection or construct its RSC props until the session is verified here.
  await requireServerAdmin('/memory');

  let items: PublicMemoryItem[] = [];
  let unavailable = false;

  try {
    items = await getPublicMemoriesServer();
  } catch {
    // The public page fails closed. Do not log the response or endpoint: an
    // upstream regression must not copy unexpected memory fields into logs.
    console.error('[memory] Preview projection is temporarily unavailable');
    unavailable = true;
  }

  return <PublicMemoryAtlas items={items} unavailable={unavailable} />;
}
