/**
 * Add character images using Jikan API (MyAnimeList)
 *
 * This script:
 * 1. Fetches characters without images from Firestore
 * 2. Searches for character images using Jikan API
 * 3. Updates character records with MAL CDN image URLs directly
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import fetch from 'node-fetch';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';
const BATCH_SIZE = 5; // Smaller batches for rate limiting
const DELAY_BETWEEN_REQUESTS = 1500; // 1.5 seconds between requests
const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds between batches

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

// Jikan API (MyAnimeList)
const JIKAN_API = 'https://api.jikan.moe/v4';

interface CharacterData {
  id: string;
  title: string;
  nameKanji: string;
  nameEnglish: string;
}

interface JikanCharacter {
  mal_id: number;
  name: string;
  images: {
    jpg: {
      image_url: string;
    };
    webp?: {
      image_url: string;
      small_image_url: string;
    };
  };
}

interface JikanResponse {
  data: JikanCharacter[];
}

// Sleep function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Search for character on Jikan (MAL)
async function searchCharacter(nameJapanese: string, nameEnglish: string, retries = 3): Promise<string | null> {
  // Try multiple search terms
  const searchTerms = [nameJapanese, nameEnglish].filter(Boolean);

  for (const searchName of searchTerms) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const url = `${JIKAN_API}/characters?q=${encodeURIComponent(searchName)}&limit=5`;
        const response = await fetch(url);

        if (response.status === 429) {
          // Rate limited - wait and retry
          console.log(`\n    ⏳ Rate limited, waiting 10 seconds...`);
          await sleep(10000);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as JikanResponse;

        if (data.data && data.data.length > 0) {
          // Find the best match
          const exactMatch = data.data.find(
            c => c.name.toLowerCase() === nameEnglish.toLowerCase() ||
                 c.name === nameJapanese
          );

          const character = exactMatch || data.data[0];

          if (character.images?.jpg?.image_url) {
            // Skip default placeholder images
            const url = character.images.jpg.image_url;
            if (url.includes('apple-touch-icon') || url.includes('icon-256')) {
              continue;
            }
            return url;
          }
        }

        // If not found with this term, try the next one
        break;
      } catch (error) {
        if (attempt < retries - 1) {
          await sleep(2000);
          continue;
        }
        console.error(`\n    Error searching for ${searchName}:`, error);
      }
    }
  }

  return null;
}

// Main function
async function main() {
  console.log('============================================================');
  console.log('Add Character Images (Using Jikan API)');
  console.log('============================================================');
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('Set DRY_RUN=false to make actual changes');
    console.log('');
  } else {
    console.log('🚀 LIVE MODE - Changes will be saved');
    console.log('');
  }

  // Get anime-characters hobby
  const categoriesSnap = await db.collection('hobbies').where('slug', '==', 'anime-characters').get();
  if (categoriesSnap.empty) {
    console.error('No anime-characters category found');
    return;
  }

  const hobbyId = categoriesSnap.docs[0].id;
  console.log('Hobby ID:', hobbyId);

  // Get all characters without images
  const itemsSnap = await db.collection('hobby_items').where('hobbyId', '==', hobbyId).get();

  const charactersWithoutImages: CharacterData[] = [];

  itemsSnap.docs.forEach(doc => {
    const data = doc.data();
    const hasImage = data.images && data.images.length > 0 && data.images[0];
    if (!hasImage) {
      charactersWithoutImages.push({
        id: doc.id,
        title: data.title,
        nameKanji: data.customFields?.nameKanji || '',
        nameEnglish: data.customFields?.nameEnglish || '',
      });
    }
  });

  console.log(`Found ${charactersWithoutImages.length} characters without images\n`);

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failedCharacters: string[] = [];

  // Process in batches
  for (let i = 0; i < charactersWithoutImages.length; i += BATCH_SIZE) {
    const batch = charactersWithoutImages.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(charactersWithoutImages.length / BATCH_SIZE);
    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches}`);

    for (const character of batch) {
      process.stdout.write(`  ${character.title} (${character.nameEnglish})... `);

      // Search for character image
      const imageUrl = await searchCharacter(character.nameKanji, character.nameEnglish);

      if (!imageUrl) {
        console.log('❌ Not found');
        failCount++;
        failedCharacters.push(`${character.title} (${character.nameEnglish})`);
        await sleep(DELAY_BETWEEN_REQUESTS);
        continue;
      }

      if (DRY_RUN) {
        console.log(`✓ Found: ${imageUrl.substring(0, 60)}...`);
        skipCount++;
        await sleep(DELAY_BETWEEN_REQUESTS);
        continue;
      }

      // Update Firestore with MAL CDN URL directly
      await db.collection('hobby_items').doc(character.id).update({
        images: [imageUrl],
        thumbImage: imageUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ Done');
      successCount++;

      await sleep(DELAY_BETWEEN_REQUESTS);
    }

    // Delay between batches
    if (i + BATCH_SIZE < charactersWithoutImages.length) {
      console.log(`  Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  console.log('\n============================================================');
  console.log('Summary');
  console.log('============================================================');
  console.log(`Success: ${successCount}`);
  console.log(`Failed/Not found: ${failCount}`);
  if (DRY_RUN) {
    console.log(`Would process: ${skipCount}`);
  }

  if (failedCharacters.length > 0) {
    console.log('\nFailed characters:');
    failedCharacters.forEach(c => console.log(`  - ${c}`));
  }
}

main().catch(console.error);
