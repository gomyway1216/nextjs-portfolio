/**
 * Import hobby items from JSON file
 *
 * Usage:
 *   npx tsx scripts/import-from-json.ts <json-file-path>
 *
 * Example:
 *   npx tsx scripts/import-from-json.ts scripts/helloalone-backup.json
 *   DRY_RUN=false npx tsx scripts/import-from-json.ts scripts/new-anime.json
 *
 * JSON Format:
 * {
 *   "animeItems": [
 *     {
 *       "name_japanese": "アニメ名",
 *       "name_japanese_ruby": "あにめめい",
 *       "name_english": "Anime Name",
 *       "mainImage": "https://...",
 *       "score": 8.5,
 *       "description": "説明文",
 *       "tags": [{ "name": "Tag1" }]
 *     }
 *   ],
 *   "voiceActors": [
 *     {
 *       "name_japanese": "声優名",
 *       "name_japanese_ruby": "せいゆうめい",
 *       "name_english": "Voice Actor Name",
 *       "image": "https://..."
 *     }
 *   ],
 *   "characters": [
 *     {
 *       "name_japanese": "キャラ名",
 *       "name_japanese_ruby": "きゃらめい",
 *       "name_english": "Character Name",
 *       "image": "https://...",
 *       "anime_id": "アニメのID（既存のIDまたは新規アイテムのid）",
 *       "voice_actor_id": "声優のID"
 *     }
 *   ]
 * }
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';

interface AnimeItem {
  id?: string;
  name_english?: string;
  name_japanese?: string;
  name_japanese_ruby?: string;
  mainImage?: string;
  description?: string;
  score?: number;
  tags?: Array<{ id?: string; name: string }>;
  created?: { seconds: number };
  lastUpdated?: { seconds: number };
}

interface VoiceActor {
  id?: string;
  name_english?: string;
  name_japanese?: string;
  name_japanese_ruby?: string;
  image?: string;
  created?: { seconds: number };
  lastUpdated?: { seconds: number };
}

interface Character {
  id?: string;
  name_english?: string;
  name_japanese?: string;
  name_japanese_ruby?: string;
  image?: string;
  anime_id?: string;
  voice_actor_id?: string;
  created?: { seconds: number };
  lastUpdated?: { seconds: number };
}

interface ImportData {
  animeItems?: AnimeItem[];
  voiceActors?: VoiceActor[];
  characters?: Character[];
}

async function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log(`Firebase initialized: ${projectId}`);
  } else {
    throw new Error('Missing Firebase admin credentials in .env.local');
  }

  return admin.app();
}

async function getCategories(db: admin.firestore.Firestore) {
  const categories: Record<string, string> = {};

  const slugs = ['anime', 'voice-actors', 'anime-characters'];
  for (const slug of slugs) {
    const snapshot = await db.collection('hobbies').where('slug', '==', slug).get();
    if (!snapshot.empty) {
      categories[slug] = snapshot.docs[0].id;
    }
  }

  return categories;
}

async function getExistingItems(db: admin.firestore.Firestore, hobbyId: string) {
  const existing = new Map<string, string>();
  const snapshot = await db.collection('hobbyItems').where('hobbyId', '==', hobbyId).get();

  snapshot.forEach((doc) => {
    const data = doc.data();
    // Use title as key for duplicate detection
    existing.set(data.title, doc.id);
  });

  return existing;
}

async function importAnimeItems(
  db: admin.firestore.Firestore,
  categoryId: string,
  items: AnimeItem[]
): Promise<Map<string, string>> {
  console.log(`\n📤 Importing ${items.length} anime items...`);

  const idMap = new Map<string, string>();
  const existing = await getExistingItems(db, categoryId);

  // Get current max order (simple approach without composite index)
  let order = existing.size + 1;

  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    const title = item.name_japanese || item.name_english || 'Untitled';

    // Check for duplicates
    if (existing.has(title)) {
      console.log(`  ⏭️  Skipped (exists): ${title}`);
      if (item.id) {
        idMap.set(item.id, existing.get(title)!);
      }
      skipped++;
      continue;
    }

    const newItem = {
      hobbyId: categoryId,
      title,
      description: '',
      images: item.mainImage ? [item.mainImage] : [],
      thumbImage: item.mainImage || '',
      isPublic: true,
      order: order++,
      customFields: {
        nameKanji: item.name_japanese || '',
        nameKana: item.name_japanese_ruby || '',
        nameEnglish: item.name_english || '',
        score: item.score || 0,
        animeDescription: item.description || '',
      },
      tags: (item.tags || []).map(t => t.name),
      createdAt: item.created?.seconds
        ? new Date(item.created.seconds * 1000).toISOString()
        : new Date().toISOString(),
      updatedAt: item.lastUpdated?.seconds
        ? new Date(item.lastUpdated.seconds * 1000).toISOString()
        : new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would import: ${title}`);
      if (item.id) idMap.set(item.id, `dry-run-${item.id}`);
    } else {
      const docRef = await db.collection('hobbyItems').add(newItem);
      console.log(`  ✅ Imported: ${title}`);
      if (item.id) idMap.set(item.id, docRef.id);
    }
    imported++;
  }

  console.log(`  Summary: ${imported} imported, ${skipped} skipped`);
  return idMap;
}

async function importVoiceActors(
  db: admin.firestore.Firestore,
  categoryId: string,
  items: VoiceActor[]
): Promise<Map<string, string>> {
  console.log(`\n📤 Importing ${items.length} voice actors...`);

  const idMap = new Map<string, string>();
  const existing = await getExistingItems(db, categoryId);

  // Get current max order (simple approach without composite index)
  let order = existing.size + 1;

  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    const title = item.name_japanese || item.name_english || 'Unknown';

    if (existing.has(title)) {
      console.log(`  ⏭️  Skipped (exists): ${title}`);
      if (item.id) idMap.set(item.id, existing.get(title)!);
      skipped++;
      continue;
    }

    const newItem = {
      hobbyId: categoryId,
      title,
      description: '',
      images: item.image ? [item.image] : [],
      thumbImage: item.image || '',
      isPublic: true,
      order: order++,
      customFields: {
        nameKanji: item.name_japanese || '',
        nameKana: item.name_japanese_ruby || '',
        nameEnglish: item.name_english || '',
      },
      tags: [],
      createdAt: item.created?.seconds
        ? new Date(item.created.seconds * 1000).toISOString()
        : new Date().toISOString(),
      updatedAt: item.lastUpdated?.seconds
        ? new Date(item.lastUpdated.seconds * 1000).toISOString()
        : new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would import: ${title}`);
      if (item.id) idMap.set(item.id, `dry-run-${item.id}`);
    } else {
      const docRef = await db.collection('hobbyItems').add(newItem);
      console.log(`  ✅ Imported: ${title}`);
      if (item.id) idMap.set(item.id, docRef.id);
    }
    imported++;
  }

  console.log(`  Summary: ${imported} imported, ${skipped} skipped`);
  return idMap;
}

async function importCharacters(
  db: admin.firestore.Firestore,
  categoryId: string,
  items: Character[],
  animeIdMap: Map<string, string>,
  voiceActorIdMap: Map<string, string>
): Promise<void> {
  console.log(`\n📤 Importing ${items.length} characters...`);

  const existing = await getExistingItems(db, categoryId);

  // Get current max order (simple approach without composite index)
  let order = existing.size + 1;

  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    const title = item.name_japanese || item.name_english || 'Unknown Character';

    if (existing.has(title)) {
      console.log(`  ⏭️  Skipped (exists): ${title}`);
      skipped++;
      continue;
    }

    // Map old IDs to new IDs
    const newAnimeId = item.anime_id ? (animeIdMap.get(item.anime_id) || item.anime_id) : '';
    const newVoiceActorId = item.voice_actor_id ? (voiceActorIdMap.get(item.voice_actor_id) || item.voice_actor_id) : '';

    const newItem = {
      hobbyId: categoryId,
      title,
      description: '',
      images: item.image ? [item.image] : [],
      thumbImage: item.image || '',
      isPublic: true,
      order: order++,
      customFields: {
        nameKanji: item.name_japanese || '',
        nameKana: item.name_japanese_ruby || '',
        nameEnglish: item.name_english || '',
        animeId: newAnimeId,
        voiceActorId: newVoiceActorId,
      },
      tags: [],
      createdAt: item.created?.seconds
        ? new Date(item.created.seconds * 1000).toISOString()
        : new Date().toISOString(),
      updatedAt: item.lastUpdated?.seconds
        ? new Date(item.lastUpdated.seconds * 1000).toISOString()
        : new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would import: ${title}`);
    } else {
      await db.collection('hobbyItems').add(newItem);
      console.log(`  ✅ Imported: ${title}`);
    }
    imported++;
  }

  console.log(`  Summary: ${imported} imported, ${skipped} skipped`);
}

async function main() {
  const jsonPath = process.argv[2];

  if (!jsonPath) {
    console.log('Usage: npx tsx scripts/import-from-json.ts <json-file-path>');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx scripts/import-from-json.ts scripts/new-anime.json');
    console.log('  DRY_RUN=false npx tsx scripts/import-from-json.ts scripts/new-anime.json');
    console.log('');
    console.log('JSON Format:');
    console.log(`{
  "animeItems": [
    {
      "name_japanese": "アニメ名",
      "name_japanese_ruby": "あにめめい",
      "name_english": "Anime Name",
      "mainImage": "https://...",
      "score": 8.5,
      "description": "説明文"
    }
  ]
}`);
    process.exit(1);
  }

  const fullPath = path.resolve(process.cwd(), jsonPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`Error: File not found: ${fullPath}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('JSON Import Script');
  console.log('='.repeat(60));
  console.log(`\nFile: ${fullPath}`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No data will be written');
    console.log('   Set DRY_RUN=false to actually import data');
  } else {
    console.log('\n🚀 LIVE MODE - Data will be written to Firestore');
  }

  try {
    // Read JSON file
    const data: ImportData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

    console.log('\nData found:');
    if (data.animeItems?.length) console.log(`  - Anime: ${data.animeItems.length} items`);
    if (data.voiceActors?.length) console.log(`  - Voice Actors: ${data.voiceActors.length} items`);
    if (data.characters?.length) console.log(`  - Characters: ${data.characters.length} items`);

    // Initialize Firebase
    await initializeFirebase();
    const db = admin.firestore();

    // Get category IDs
    const categories = await getCategories(db);

    if (!categories['anime'] || !categories['voice-actors'] || !categories['anime-characters']) {
      console.error('\nError: Hobby categories not found. Run the migration script first.');
      process.exit(1);
    }

    // Import data
    let animeIdMap = new Map<string, string>();
    let voiceActorIdMap = new Map<string, string>();

    if (data.animeItems?.length) {
      animeIdMap = await importAnimeItems(db, categories['anime'], data.animeItems);
    }

    if (data.voiceActors?.length) {
      voiceActorIdMap = await importVoiceActors(db, categories['voice-actors'], data.voiceActors);
    }

    if (data.characters?.length) {
      await importCharacters(db, categories['anime-characters'], data.characters, animeIdMap, voiceActorIdMap);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Import complete!');
    console.log('='.repeat(60));

    if (DRY_RUN) {
      console.log('\n✅ Dry run successful! To actually import:');
      console.log(`   DRY_RUN=false npx tsx scripts/import-from-json.ts ${jsonPath}`);
    }

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
