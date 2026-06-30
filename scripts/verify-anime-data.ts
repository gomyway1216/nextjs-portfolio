/**
 * Verify anime data has scores properly configured
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: privateKey! }),
  });

  console.log(`Firebase initialized: ${projectId}`);
  return admin.app();
}

async function main() {
  await initializeFirebase();
  const db = admin.firestore();

  // Check anime hobby category
  console.log('\n📁 Anime Hobby Category:');
  const hobbiesSnapshot = await db.collection('hobbies').where('slug', '==', 'anime').get();

  if (hobbiesSnapshot.empty) {
    console.log('  No anime category found!');
  } else {
    const hobbyDoc = hobbiesSnapshot.docs[0];
    const hobbyData = hobbyDoc.data();
    console.log(`  ID: ${hobbyDoc.id}`);
    console.log(`  Name: ${hobbyData.name}`);
    console.log(`  Fields:`);
    (hobbyData.fields || []).forEach((f: { name: string; label: string; type: string }) => {
      console.log(`    - ${f.name} (${f.type}): ${f.label}`);
    });

    // Check anime items
    console.log('\n📊 Sample Anime Items with Scores:');
    const itemsSnapshot = await db.collection('hobby_items')
      .where('hobbyId', '==', hobbyDoc.id)
      .limit(5)
      .get();

    if (itemsSnapshot.empty) {
      console.log('  No anime items found!');
    } else {
      itemsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        console.log(`  - ${data.title}`);
        console.log(`    Score: ${data.customFields?.score ?? 'undefined'}`);
      });
    }
  }
}

main().catch(console.error);
