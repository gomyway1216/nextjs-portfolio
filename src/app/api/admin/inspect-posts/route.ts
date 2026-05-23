import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/admin/inspect-posts
 *
 * Diagnostic endpoint that reports what's actually in Firestore so we can
 * tell whether posts are "missing" because of where-clause filtering vs.
 * because the docs really aren't there.
 *
 * Returns a summary of:
 *  - all docs in the flat `post` collection (with isPublic value, category,
 *    and which translations exist)
 *  - any legacy docs found via collectionGroup('posts')
 *
 * Admin only.
 */
export const GET = withActivityLog('next_api.admin.inspect-posts.GET', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) return response!;

  try {
    const db = getFirestore();

    const flatSnap = await db.collection('post').get();
    const flat = flatSnap.docs.map((doc) => {
      const data = doc.data() || {};
      const translations = data.translations || {};
      return {
        id: doc.id,
        path: doc.ref.path,
        category: data.category ?? null,
        isPublic: data.isPublic ?? null,
        translations: {
          en: !!(translations.en?.title || translations.en?.body),
          ja: !!(translations.ja?.title || translations.ja?.body),
        },
        hasTopLevelTitle: typeof data.title === 'string',
        lastUpdated:
          data.lastUpdated?.toDate?.()?.toISOString() ||
          data.lastUpdated ||
          null,
      };
    });

    const legacySnap = await db.collectionGroup('posts').get();
    const legacy = legacySnap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        path: doc.ref.path,
        isPublic: data.isPublic ?? null,
        hasTranslations: !!data.translations,
        hasTopLevelTitle: typeof data.title === 'string',
      };
    });

    return NextResponse.json({
      flatCount: flat.length,
      legacyCount: legacy.length,
      flat,
      legacy,
    });
  } catch (err) {
    console.error('inspect-posts failed:', err);
    return NextResponse.json(
      {
        error: 'Inspect failed',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
});
