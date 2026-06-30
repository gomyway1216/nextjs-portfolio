/**
 * Add images for characters that were not found by automatic search
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';
import fetch from 'node-fetch';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// Jikan API
const JIKAN_API = 'https://api.jikan.moe/v4';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Search with specific MAL character ID
async function getCharacterById(malId: number): Promise<string | null> {
  try {
    const response = await fetch(`${JIKAN_API}/characters/${malId}`);
    if (!response.ok) return null;
    const data = await response.json() as { data?: { images?: { jpg?: { image_url?: string } } } };
    return data.data?.images?.jpg?.image_url || null;
  } catch {
    return null;
  }
}

// Characters that need manual image search with their MAL IDs
const characterMappings: { title: string; malId: number }[] = [
  // Re:Zero - Ram (MAL ID: 119327)
  { title: 'ラム', malId: 119327 },
  // KonoSuba - Aqua (MAL ID: 117223)
  { title: 'アクア', malId: 117223 },
  // Shikimori (MAL ID: 187879)
  { title: '式守さん', malId: 187879 },
];

async function main() {
  console.log('============================================================');
  console.log('Add Missing Character Images');
  console.log('============================================================');
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE');
    console.log('');
  } else {
    console.log('🚀 LIVE MODE');
    console.log('');
  }

  const categoriesSnap = await db.collection('hobbies').where('slug', '==', 'anime-characters').get();
  const hobbyId = categoriesSnap.docs[0].id;

  for (const mapping of characterMappings) {
    process.stdout.write(`${mapping.title}... `);

    // Find the character in Firestore
    const itemsSnap = await db.collection('hobby_items')
      .where('hobbyId', '==', hobbyId)
      .where('title', '==', mapping.title)
      .get();

    if (itemsSnap.empty) {
      console.log('❌ Not found in Firestore');
      continue;
    }

    const docId = itemsSnap.docs[0].id;

    // Get image from MAL
    const imageUrl = await getCharacterById(mapping.malId);

    if (!imageUrl) {
      console.log('❌ Image not found on MAL');
      continue;
    }

    if (DRY_RUN) {
      console.log(`✓ Found: ${imageUrl}`);
      continue;
    }

    // Update Firestore
    await db.collection('hobby_items').doc(docId).update({
      images: [imageUrl],
      thumbImage: imageUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Done');
    await sleep(1500);
  }

  console.log('\n============================================================');
  console.log('浦安鉄筋家族のキャラクターはMALにないため、スキップしました。');
  console.log('============================================================');
}

main().catch(console.error);
