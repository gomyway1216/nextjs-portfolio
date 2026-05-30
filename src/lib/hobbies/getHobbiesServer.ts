import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { HOBBIES_COLLECTION } from '@/app/api/constants';
import type { HobbyCategory } from '@/types/hobby';

async function fetchPublicHobbies(): Promise<HobbyCategory[]> {
  const db = getFirestore();
  const snapshot = await db.collection(HOBBIES_COLLECTION).get();

  const categories: HobbyCategory[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    categories.push({
      id: doc.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      icon: data.icon,
      coverImage: data.coverImage,
      templateType: data.templateType,
      isPublic: data.isPublic,
      order: data.order ?? 0,
      fields: data.fields || [],
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    });
  });

  return categories
    .filter((c) => c.isPublic)
    .sort((a, b) => a.order - b.order);
}

// Hobbies are updated rarely (manual edits via /admin). 5 min is fresh
// enough for a portfolio site and avoids a Firestore round-trip on the
// critical path of `/hobbies` and any landing card that might re-use it.
export const getPublicHobbiesCached = unstable_cache(
  fetchPublicHobbies,
  ['hobbies-public'],
  { revalidate: 300, tags: ['hobbies'] },
);
