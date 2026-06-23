/**
 * Multiply readingTimeMinutes by 5 for all study articles.
 *
 * Run with: npx tsx scripts/update-study-article-reading-time.ts
 *
 * Optional env:
 *   DRY_RUN=true
 *   LIMIT=100
 *   VERBOSE=true
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const MULTIPLIER = 5;
const BATCH_LIMIT = 400;
const DRY_RUN = process.env.DRY_RUN === 'true';
const VERBOSE = process.env.VERBOSE === 'true';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : 0;

function initializeFirebase() {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.firestore();
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;

  if (privateKey && clientEmail && projectId) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
    });
  } else {
    throw new Error('Firebase credentials not found');
  }

  return admin.firestore();
}

const db = initializeFirebase();

async function updateReadingTimes() {
  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
    db.collection('study_articles');
  if (LIMIT > 0) {
    query = query.limit(LIMIT);
  }

  const snapshot = await query.get();
  let batch = db.batch();
  let batchCount = 0;
  let updated = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const current = data?.readingTimeMinutes;
    const multiplier = data?.readingTimeMultiplier;

    if (typeof current !== 'number') {
      skipped += 1;
      continue;
    }

    if (multiplier === MULTIPLIER) {
      skipped += 1;
      continue;
    }

    const nextValue = current * MULTIPLIER;
    updated += 1;

    if (VERBOSE) {
      console.log(`[UPDATE] ${doc.id}: ${current} -> ${nextValue}`);
    }

    if (!DRY_RUN) {
      batch.update(doc.ref, {
        readingTimeMinutes: nextValue,
        readingTimeMultiplier: MULTIPLIER,
      });
      batchCount += 1;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  console.log(
    `Done. Updated: ${updated}, skipped: ${skipped}, dryRun: ${DRY_RUN}`
  );
}

updateReadingTimes().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
