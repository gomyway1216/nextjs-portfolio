/**
 * Check anime descriptions status
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

  return admin.app();
}

async function main() {
  await initializeFirebase();
  const db = admin.firestore();

  // Get anime category
  const animeCategory = await db.collection('hobbies').where('slug', '==', 'anime').get();
  if (animeCategory.empty) {
    console.log('Anime category not found!');
    return;
  }
  const animeCategoryId = animeCategory.docs[0].id;

  // Get all anime items
  const animeItems = await db.collection('hobby_items')
    .where('hobbyId', '==', animeCategoryId)
    .get();

  console.log('='.repeat(80));
  console.log('Anime Description Status');
  console.log('='.repeat(80));

  const missing: string[] = [];
  const hasJaOnly: string[] = [];
  const hasEnOnly: string[] = [];
  const hasBoth: string[] = [];

  for (const doc of animeItems.docs) {
    const data = doc.data();
    const title = data.title;
    const descJa = data.customFields?.animeDescription;
    const descEn = data.customFields?.descriptionEn;

    const hasJa = descJa && descJa !== 'preparing…' && descJa !== 'preparing...';
    const hasEn = descEn && descEn !== 'preparing…' && descEn !== 'preparing...';

    if (hasJa && hasEn) {
      hasBoth.push(title);
    } else if (hasJa) {
      hasJaOnly.push(title);
    } else if (hasEn) {
      hasEnOnly.push(title);
    } else {
      missing.push(title);
    }
  }

  console.log(`\n✅ Both languages (${hasBoth.length}):`);
  hasBoth.forEach(t => console.log(`   - ${t}`));

  console.log(`\n🇯🇵 Japanese only (${hasJaOnly.length}):`);
  hasJaOnly.forEach(t => console.log(`   - ${t}`));

  console.log(`\n🇺🇸 English only (${hasEnOnly.length}):`);
  hasEnOnly.forEach(t => console.log(`   - ${t}`));

  console.log(`\n❌ Missing both (${missing.length}):`);
  missing.forEach(t => console.log(`   - ${t}`));

  console.log('\n' + '='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`Total: ${animeItems.size}`);
  console.log(`Both: ${hasBoth.length}`);
  console.log(`Japanese only: ${hasJaOnly.length}`);
  console.log(`English only: ${hasEnOnly.length}`);
  console.log(`Missing: ${missing.length}`);
}

main().catch(console.error);
