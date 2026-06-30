/**
 * Cleanup hobby data - delete all hobbies and items
 *
 * Run with: npx tsx scripts/cleanup-hobbies.ts
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

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

async function cleanup() {
  console.log('Deleting all hobby items...');
  const items = await db.collection('hobby_items').get();
  for (const doc of items.docs) {
    await doc.ref.delete();
    console.log(`  Deleted item: ${doc.data().title}`);
  }

  console.log('\nDeleting all hobby categories...');
  const hobbies = await db.collection('hobbies').get();
  for (const doc of hobbies.docs) {
    await doc.ref.delete();
    console.log(`  Deleted hobby: ${doc.data().name}`);
  }

  console.log('\n✅ Cleanup complete!');
  process.exit(0);
}

cleanup();
