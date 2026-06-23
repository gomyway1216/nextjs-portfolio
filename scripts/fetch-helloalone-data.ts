/**
 * Fetch data from helloalone Firebase (yudai-blog) and save to JSON
 * Then import to nextjs-portfolio Firebase (yudai-portfolio)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// helloalone Firebase config — apiKey is read from env. Set
// HELLOALONE_FIREBASE_API_KEY in .env.local before running this script.
const helloaloneApiKey = process.env.HELLOALONE_FIREBASE_API_KEY;
if (!helloaloneApiKey) {
  throw new Error(
    'HELLOALONE_FIREBASE_API_KEY is not set. Add it to .env.local before running this script.'
  );
}

const helloaloneConfig = {
  apiKey: helloaloneApiKey,
  authDomain: 'yudai-blog.firebaseapp.com',
  projectId: 'yudai-blog',
  storageBucket: 'yudai-blog.appspot.com',
};

const HELLOALONE_USER_ID =
  process.env.HELLOALONE_USER_ID || '0gAk2mm1A8hi2sEY7mgBagqkbko2';
const DRY_RUN = process.env.DRY_RUN !== 'false';

// Field definitions for categories
const ANIME_FIELDS = [
  { id: uuidv4(), name: 'nameKanji', label: '名前（漢字）', type: 'text', required: false, order: 1 },
  { id: uuidv4(), name: 'nameKana', label: '名前（かな）', type: 'text', required: false, order: 2 },
  { id: uuidv4(), name: 'nameEnglish', label: 'English Name', type: 'text', required: false, order: 3 },
  { id: uuidv4(), name: 'score', label: 'スコア (0-10)', type: 'number', required: false, order: 4 },
  { id: uuidv4(), name: 'animeDescription', label: '説明', type: 'textarea', required: false, order: 5 },
];

const VOICE_ACTOR_FIELDS = [
  { id: uuidv4(), name: 'nameKanji', label: '名前（漢字）', type: 'text', required: false, order: 1 },
  { id: uuidv4(), name: 'nameKana', label: '名前（かな）', type: 'text', required: false, order: 2 },
  { id: uuidv4(), name: 'nameEnglish', label: 'English Name', type: 'text', required: false, order: 3 },
];

const CHARACTER_FIELDS = [
  { id: uuidv4(), name: 'nameKanji', label: '名前（漢字）', type: 'text', required: false, order: 1 },
  { id: uuidv4(), name: 'nameKana', label: '名前（かな）', type: 'text', required: false, order: 2 },
  { id: uuidv4(), name: 'nameEnglish', label: 'English Name', type: 'text', required: false, order: 3 },
  { id: uuidv4(), name: 'animeId', label: 'アニメ', type: 'relation', required: false, order: 4, relationConfig: { hobbySlug: 'anime', multiple: false } },
  { id: uuidv4(), name: 'voiceActorId', label: '声優', type: 'relation', required: false, order: 5, relationConfig: { hobbySlug: 'voice-actors', multiple: false } },
];

interface AnimeItem {
  id: string;
  name_english: string;
  name_japanese: string;
  name_japanese_ruby: string;
  mainImage: string;
  description: string;
  score: number;
  tags: Array<{ id: string; name: string }>;
  created?: { seconds: number };
  lastUpdated?: { seconds: number };
}

interface VoiceActor {
  id: string;
  name_english: string;
  name_japanese: string;
  name_japanese_ruby: string;
  image: string;
  created?: { seconds: number };
  lastUpdated?: { seconds: number };
}

interface Character {
  id: string;
  name_english: string;
  name_japanese: string;
  name_japanese_ruby: string;
  image: string;
  anime_id: string;
  voice_actor_id: string;
  created?: { seconds: number };
  lastUpdated?: { seconds: number };
}

async function initializeTargetFirebase() {
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
    console.log(`Target Firebase initialized: ${projectId}`);
  } else {
    throw new Error('Missing Firebase admin credentials');
  }

  return admin.app();
}

async function fetchFromHelloalone() {
  console.log('\n📥 Fetching data from helloalone (yudai-blog)...');

  // Initialize helloalone Firebase (client SDK)
  const helloaloneApp = initializeApp(helloaloneConfig, 'helloalone');
  const sourceDb = getFirestore(helloaloneApp);

  // Fetch anime items
  console.log('\n  Fetching anime items...');
  const animeSnapshot = await getDocs(
    collection(sourceDb, `${HELLOALONE_USER_ID}/anime/itemCollection`)
  );
  const animeItems: AnimeItem[] = [];
  animeSnapshot.forEach((doc) => {
    animeItems.push({ id: doc.id, ...doc.data() } as AnimeItem);
  });
  console.log(`    Found ${animeItems.length} anime items`);

  // Fetch voice actors
  console.log('  Fetching voice actors...');
  const voiceActorSnapshot = await getDocs(
    collection(sourceDb, `${HELLOALONE_USER_ID}/anime/voiceActorCollection`)
  );
  const voiceActors: VoiceActor[] = [];
  voiceActorSnapshot.forEach((doc) => {
    voiceActors.push({ id: doc.id, ...doc.data() } as VoiceActor);
  });
  console.log(`    Found ${voiceActors.length} voice actors`);

  // Fetch characters
  console.log('  Fetching characters...');
  const characterSnapshot = await getDocs(
    collection(sourceDb, `${HELLOALONE_USER_ID}/anime/animeCharacterCollection`)
  );
  const characters: Character[] = [];
  characterSnapshot.forEach((doc) => {
    characters.push({ id: doc.id, ...doc.data() } as Character);
  });
  console.log(`    Found ${characters.length} characters`);

  return { animeItems, voiceActors, characters };
}

async function getOrCreateCategories(db: admin.firestore.Firestore) {
  const categories: Record<string, string> = {};

  const categoryConfigs = [
    { slug: 'anime', name: 'アニメ', description: 'アニメ・漫画のランキング', icon: 'tv', fields: ANIME_FIELDS },
    { slug: 'voice-actors', name: '声優', description: '声優一覧', icon: 'mic', fields: VOICE_ACTOR_FIELDS },
    { slug: 'anime-characters', name: 'アニメキャラクター', description: 'アニメキャラクター一覧', icon: 'user', fields: CHARACTER_FIELDS },
  ];

  for (const config of categoryConfigs) {
    const existing = await db.collection('hobbies').where('slug', '==', config.slug).get();

    if (!existing.empty) {
      categories[config.slug] = existing.docs[0].id;
      console.log(`  Category "${config.name}" already exists: ${existing.docs[0].id}`);
    } else if (!DRY_RUN) {
      const docRef = await db.collection('hobbies').add({
        ...config,
        templateType: 'catalog',
        isPublic: true,
        order: Object.keys(categories).length + 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      categories[config.slug] = docRef.id;
      console.log(`  Created category "${config.name}": ${docRef.id}`);
    } else {
      categories[config.slug] = `dry-run-${config.slug}`;
      console.log(`  [DRY RUN] Would create category "${config.name}"`);
    }
  }

  return categories;
}

async function migrateData(
  db: admin.firestore.Firestore,
  categories: Record<string, string>,
  data: { animeItems: AnimeItem[]; voiceActors: VoiceActor[]; characters: Character[] }
) {
  const animeIdMap = new Map<string, string>();
  const voiceActorIdMap = new Map<string, string>();

  // Migrate anime items
  console.log('\n📤 Migrating anime items...');
  let order = 1;
  for (const item of data.animeItems) {
    const newItem = {
      hobbyId: categories['anime'],
      title: item.name_japanese || item.name_english || 'Untitled',
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
      console.log(`  [DRY RUN] Would migrate anime: ${newItem.title}`);
      animeIdMap.set(item.id, `dry-run-${item.id}`);
    } else {
      const docRef = await db.collection('hobbyItems').add(newItem);
      animeIdMap.set(item.id, docRef.id);
      console.log(`  Migrated: ${newItem.title} (${item.id} -> ${docRef.id})`);
    }
  }

  // Migrate voice actors
  console.log('\n📤 Migrating voice actors...');
  order = 1;
  for (const item of data.voiceActors) {
    const newItem = {
      hobbyId: categories['voice-actors'],
      title: item.name_japanese || item.name_english || 'Unknown',
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
      console.log(`  [DRY RUN] Would migrate voice actor: ${newItem.title}`);
      voiceActorIdMap.set(item.id, `dry-run-${item.id}`);
    } else {
      const docRef = await db.collection('hobbyItems').add(newItem);
      voiceActorIdMap.set(item.id, docRef.id);
      console.log(`  Migrated: ${newItem.title} (${item.id} -> ${docRef.id})`);
    }
  }

  // Migrate characters
  console.log('\n📤 Migrating characters...');
  order = 1;
  for (const item of data.characters) {
    const newAnimeId = animeIdMap.get(item.anime_id) || '';
    const newVoiceActorId = voiceActorIdMap.get(item.voice_actor_id) || '';

    const newItem = {
      hobbyId: categories['anime-characters'],
      title: item.name_japanese || item.name_english || 'Unknown Character',
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
      console.log(`  [DRY RUN] Would migrate character: ${newItem.title}`);
    } else {
      const docRef = await db.collection('hobbyItems').add(newItem);
      console.log(`  Migrated: ${newItem.title} (${item.id} -> ${docRef.id})`);
    }
  }

  return { animeIdMap, voiceActorIdMap };
}

async function main() {
  console.log('='.repeat(60));
  console.log('Helloalone -> Nextjs-Portfolio Data Migration');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No data will be written');
    console.log('   Set DRY_RUN=false to actually migrate data');
  } else {
    console.log('\n🚀 LIVE MODE - Data will be written to Firestore');
  }

  try {
    // Fetch data from helloalone
    const data = await fetchFromHelloalone();

    // Save to JSON for backup
    const backupPath = path.resolve(process.cwd(), 'scripts/helloalone-backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Backup saved to: ${backupPath}`);

    // Initialize target Firebase
    await initializeTargetFirebase();
    const targetDb = admin.firestore();

    // Get or create categories
    console.log('\n📁 Setting up categories...');
    const categories = await getOrCreateCategories(targetDb);

    // Migrate data
    await migrateData(targetDb, categories, data);

    console.log('\n' + '='.repeat(60));
    console.log('Migration complete!');
    console.log('='.repeat(60));

    if (DRY_RUN) {
      console.log('\n✅ Dry run successful! To run the actual migration:');
      console.log('   DRY_RUN=false npx tsx scripts/fetch-helloalone-data.ts');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
