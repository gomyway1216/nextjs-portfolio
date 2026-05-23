import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

interface MigrationResult {
  migrated: { from: string; to: string; id: string }[];
  skipped: { path: string; reason: string }[];
  failed: { path: string; error: string }[];
}

/**
 * POST /api/admin/migrate-posts-flat
 *
 * One-shot migration that copies legacy `post/{category}/posts/{id}` docs
 * to the flat `post/{id}` collection (with `category` promoted to a doc
 * field), then deletes the legacy docs.
 *
 * Idempotent: docs already present at the flat path are skipped.
 *
 * Query params:
 *  - dryRun=true     -> read-only preview, no writes
 *  - keepOld=true    -> copy without deleting the legacy doc
 *
 * Admin only.
 */
export const POST = withActivityLog(
  'next_api.admin.migrate-posts-flat.POST',
  async (request: NextRequest) => {
    const { user, response } = await ensureAdmin(request);
    if (!user) return response!;

    const searchParams = request.nextUrl.searchParams;
    const dryRun = searchParams.get('dryRun') === 'true';
    const keepOld = searchParams.get('keepOld') === 'true';

    const result: MigrationResult = { migrated: [], skipped: [], failed: [] };

    try {
      const db = getFirestore();
      const snapshot = await db.collectionGroup('posts').get();

      for (const doc of snapshot.docs) {
        const parts = doc.ref.path.split('/');
        // Expect: post/{category}/posts/{id}
        if (parts.length !== 4 || parts[0] !== 'post' || parts[2] !== 'posts') {
          result.skipped.push({ path: doc.ref.path, reason: 'unexpected path shape' });
          continue;
        }

        const category = parts[1];
        const id = parts[3];

        const flatRef = db.collection('post').doc(id);
        const existing = await flatRef.get();
        if (existing.exists) {
          result.skipped.push({ path: doc.ref.path, reason: 'already at flat path' });
          continue;
        }

        if (dryRun) {
          result.migrated.push({ from: doc.ref.path, to: `post/${id}`, id });
          continue;
        }

        try {
          await flatRef.set({ ...doc.data(), category });
          if (!keepOld) {
            await doc.ref.delete();
          }
          result.migrated.push({ from: doc.ref.path, to: `post/${id}`, id });
        } catch (err) {
          result.failed.push({
            path: doc.ref.path,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return NextResponse.json({
        dryRun,
        keepOld,
        scanned: snapshot.size,
        ...result,
      });
    } catch (err) {
      console.error('migrate-posts-flat failed:', err);
      return NextResponse.json(
        {
          error: 'Migration failed',
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }
  },
);
