import type { Metadata } from 'next';
import PrivateMemoryDashboard from '@/components/memory/PrivateMemoryDashboard';
import PublicMemoryAtlas from '@/components/memory/PublicMemoryAtlas';
import { getPrivateMemoryIndexServer } from '@/lib/memory/getPrivateMemoriesServer';
import { getPublicMemoriesServer } from '@/lib/memory/getPublicMemoriesServer';
import type { PrivateMemoryIndexItem } from '@/lib/memory/privateMemory';
import type { PublicMemoryItem } from '@/lib/memory/publicMemory';
import { requireServerAdmin } from '@/lib/serverAdminAuth';

export const metadata: Metadata = {
  title: 'Memory Preview',
  description: 'An administrator-only preview of memory candidates.',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

interface MemoryPreviewPageProps {
  searchParams?: Promise<{ view?: string | string[] }>;
}

export default async function MemoryPreviewPage({ searchParams }: MemoryPreviewPageProps = {}) {
  // Defense in depth behind the middleware gate: do not contact the memory
  // services or construct their RSC props until the session is verified here.
  await requireServerAdmin('/memory');
  const query = searchParams ? await searchParams : {};
  const activeView = query.view === 'public' ? 'public' : 'private';

  if (activeView === 'public') {
    let items: PublicMemoryItem[] = [];
    let unavailable = false;
    try {
      items = await getPublicMemoriesServer();
    } catch {
      console.error('[memory] Preview projection is temporarily unavailable');
      unavailable = true;
    }
    return <PublicMemoryAtlas items={items} unavailable={unavailable} />;
  }

  const [privateResult, publicResult] = await Promise.allSettled([
    getPrivateMemoryIndexServer(),
    getPublicMemoriesServer(),
  ]);
  const privateItems: PrivateMemoryIndexItem[] = privateResult.status === 'fulfilled' ? privateResult.value : [];
  const publicItems: PublicMemoryItem[] = publicResult.status === 'fulfilled' ? publicResult.value : [];
  if (privateResult.status === 'rejected') {
    // Never log the upstream payload or credential on this private data path.
    console.error('[memory] Private index is temporarily unavailable');
  }
  if (publicResult.status === 'rejected') {
    console.error('[memory] Public projection status is temporarily unavailable');
  }

  return (
    <PrivateMemoryDashboard
      items={privateItems}
      publicMemoryIds={publicItems.map(({ id }) => id)}
      unavailable={privateResult.status === 'rejected'}
    />
  );
}
