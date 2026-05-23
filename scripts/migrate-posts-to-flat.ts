/**
 * Migrate blog posts from the legacy nested structure to the flat one.
 *
 *   OLD: post/{category}/posts/{id}    -- category encoded in the path
 *   NEW: post/{id}                     -- { category, ...rest }
 *
 * Run with: npm run migrate:posts-flat
 *
 * The script is idempotent: if a doc already exists at the flat path it
 * will be skipped (so re-running after a partial migration is safe).
 *
 * Pass --dry-run to print what would happen without writing anything.
 * Pass --keep-old to skip deleting the legacy docs after copying.
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const KEEP_OLD = args.has('--keep-old');

function initializeFirebase() {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return { db: admin.firestore() };
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
      projectId,
    });
  } else if (privateKey && clientEmail && projectId) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
    });
  } else {
    throw new Error(
      'Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_KEY or (FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL + FIREBASE_PROJECT_ID) in .env.local',
    );
  }

  return { db: admin.firestore() };
}

const { db } = initializeFirebase();

async function migrate() {
  console.log(`\n=== Posts migration (${DRY_RUN ? 'DRY-RUN' : 'LIVE'}) ===\n`);

  // Find every doc in any `posts` subcollection (the legacy shape).
  const snapshot = await db.collectionGroup('posts').get();

  if (snapshot.empty) {
    console.log('No legacy posts found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${snapshot.size} legacy post doc(s).\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    const parts = doc.ref.path.split('/');
    // Expect path of shape: post/{category}/posts/{id}
    if (parts.length !== 4 || parts[0] !== 'post' || parts[2] !== 'posts') {
      console.log(`  ↳ skip (unexpected path): ${doc.ref.path}`);
      skipped += 1;
      continue;
    }
    const category = parts[1];
    const id = parts[3];
    const data = doc.data();

    const flatRef = db.collection('post').doc(id);
    const existing = await flatRef.get();
    if (existing.exists) {
      console.log(`  ↳ skip (already at flat path): post/${id}`);
      skipped += 1;
      continue;
    }

    const newData = {
      ...data,
      category, // promote path segment into a field
    };

    console.log(`  ↳ migrate post/${category}/posts/${id} -> post/${id}`);

    if (DRY_RUN) {
      migrated += 1;
      continue;
    }

    try {
      await flatRef.set(newData);
      if (!KEEP_OLD) {
        await doc.ref.delete();
      }
      migrated += 1;
    } catch (err) {
      console.error(`     ✗ failed: ${(err as Error).message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped} failed=${failed}\n`);
  if (DRY_RUN) {
    console.log('(no writes were performed — re-run without --dry-run to apply)');
  } else if (KEEP_OLD) {
    console.log('(legacy docs were left in place — re-run without --keep-old to delete them)');
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
