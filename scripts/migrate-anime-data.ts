/**
 * Data Migration Script: helloalone → nextjs-portfolio
 *
 * This script migrates anime, voice actor, and character data from the
 * helloalone project's Firebase to the nextjs-portfolio hobbies system.
 *
 * Prerequisites:
 * 1. Both projects must share the same Firebase project OR
 * 2. Configure service account for the source Firebase project
 *
 * Usage:
 *   npx ts-node --esm scripts/migrate-anime-data.ts
 *
 * Note: Run this script once after setting up the categories in the admin panel.
 */

import * as dotenv from 'dotenv';
import * as admin from './firebase-admin-compat';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Configuration
let SOURCE_USER_ID = process.env.REACT_APP_DEFAULT_USER || process.env.HELLOALONE_USER_ID || '';
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to dry run for safety

// These will be set after we find the source user ID
let SOURCE_ANIME_PATH = '';
let SOURCE_VOICE_ACTOR_PATH = '';
let SOURCE_CHARACTER_PATH = '';

// Target collection (new hobbies system)
const TARGET_HOBBIES_COLLECTION = 'hobbies';
const TARGET_ITEMS_COLLECTION = 'hobbyItems';

// Field mappings for the new templates
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

interface SourceAnimeItem {
  id: string;
  name_english: string;
  name_japanese: string;
  name_japanese_ruby: string;
  mainImage: string;
  description: string;
  score: number;
  tags: Array<{ id: string; name: string }>;
  created: admin.Timestamp;
  lastUpdated: admin.Timestamp;
}

interface SourceVoiceActor {
  id: string;
  name_english: string;
  name_japanese: string;
  name_japanese_ruby: string;
  image: string;
  created: admin.Timestamp;
  lastUpdated: admin.Timestamp;
}

interface SourceCharacter {
  id: string;
  name_english: string;
  name_japanese: string;
  name_japanese_ruby: string;
  image: string;
  anime_id: string;
  voice_actor_id: string;
  created: admin.Timestamp;
  lastUpdated: admin.Timestamp;
}

async function initializeFirebase() {
  // Check if already initialized
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Initialize with credentials from .env.local
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
    console.log(`Initialized Firebase with project: ${projectId}`);
  } else {
    // Use application default credentials
    admin.initializeApp();
    console.log('Initialized Firebase with default credentials');
  }

  return admin.app();
}

async function discoverSourceUserId(db: admin.Firestore): Promise<string | null> {
  console.log('\nDiscovering source user ID from Firestore...');

  // List all root-level collections
  const rootCollections = await db.listCollections();
  console.log(`  Found ${rootCollections.length} root collections`);

  for (const collection of rootCollections) {
    // Skip known system collections
    if (['hobbies', 'hobbyItems', 'blog', 'projects', 'users', 'study', 'learningItems'].includes(collection.id)) {
      console.log(`  Skipping system collection: ${collection.id}`);
      continue;
    }

    console.log(`  Checking collection: ${collection.id}`);

    // The helloalone structure is: /{userId}/anime/itemCollection
    // where {userId} is the collection name, 'anime' is a document, and 'itemCollection' is a subcollection
    try {
      const itemCollection = await db.collection(`${collection.id}/anime/itemCollection`).limit(1).get();
      if (!itemCollection.empty) {
        console.log(`  Found anime data in collection: ${collection.id}`);
        return collection.id;
      }
    } catch (_e) {
      // Collection path doesn't exist, continue
    }
  }

  return null;
}

async function createHobbyCategories(db: admin.Firestore) {
  console.log('Creating hobby categories...');

  const categories = [
    {
      name: 'アニメ',
      slug: 'anime',
      description: 'アニメ・漫画のランキング',
      icon: 'tv',
      templateType: 'catalog',
      isPublic: true,
      order: 1,
      fields: ANIME_FIELDS,
    },
    {
      name: '声優',
      slug: 'voice-actors',
      description: '声優一覧',
      icon: 'mic',
      templateType: 'catalog',
      isPublic: true,
      order: 2,
      fields: VOICE_ACTOR_FIELDS,
    },
    {
      name: 'アニメキャラクター',
      slug: 'anime-characters',
      description: 'アニメキャラクター一覧',
      icon: 'user',
      templateType: 'catalog',
      isPublic: true,
      order: 3,
      fields: CHARACTER_FIELDS,
    },
  ];

  const categoryIds: Record<string, string> = {};

  for (const category of categories) {
    // Check if category already exists
    const existing = await db
      .collection(TARGET_HOBBIES_COLLECTION)
      .where('slug', '==', category.slug)
      .get();

    if (!existing.empty) {
      console.log(`  Category "${category.name}" already exists, skipping...`);
      categoryIds[category.slug] = existing.docs[0].id;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would create category: ${category.name}`);
      categoryIds[category.slug] = `dry-run-${category.slug}`;
    } else {
      const docRef = await db.collection(TARGET_HOBBIES_COLLECTION).add({
        ...category,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`  Created category: ${category.name} (${docRef.id})`);
      categoryIds[category.slug] = docRef.id;
    }
  }

  return categoryIds;
}

async function migrateAnimeItems(
  db: admin.Firestore,
  categoryId: string
): Promise<Map<string, string>> {
  console.log('\nMigrating anime items...');

  const oldToNewIdMap = new Map<string, string>();
  const sourceSnapshot = await db.collection(SOURCE_ANIME_PATH).get();

  console.log(`  Found ${sourceSnapshot.size} anime items to migrate`);

  let migrated = 0;
  for (const doc of sourceSnapshot.docs) {
    const data = doc.data() as Omit<SourceAnimeItem, 'id'>;

    const newItem = {
      hobbyId: categoryId,
      title: data.name_english || data.name_japanese || 'Untitled',
      description: '',
      images: data.mainImage ? [data.mainImage] : [],
      thumbImage: data.mainImage || '',
      isPublic: true,
      order: migrated + 1,
      customFields: {
        nameKanji: data.name_japanese || '',
        nameKana: data.name_japanese_ruby || '',
        nameEnglish: data.name_english || '',
        score: data.score || 0,
        animeDescription: data.description || '',
      },
      tags: (data.tags || []).map(t => t.name),
      createdAt: data.created?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: data.lastUpdated?.toDate?.()?.toISOString() || new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would migrate: ${newItem.title}`);
      oldToNewIdMap.set(doc.id, `dry-run-${doc.id}`);
    } else {
      const docRef = await db.collection(TARGET_ITEMS_COLLECTION).add(newItem);
      oldToNewIdMap.set(doc.id, docRef.id);
      console.log(`    Migrated: ${newItem.title} (${doc.id} -> ${docRef.id})`);
    }
    migrated++;
  }

  console.log(`  Migrated ${migrated} anime items`);
  return oldToNewIdMap;
}

async function migrateVoiceActors(
  db: admin.Firestore,
  categoryId: string
): Promise<Map<string, string>> {
  console.log('\nMigrating voice actors...');

  const oldToNewIdMap = new Map<string, string>();
  const sourceSnapshot = await db.collection(SOURCE_VOICE_ACTOR_PATH).get();

  console.log(`  Found ${sourceSnapshot.size} voice actors to migrate`);

  let migrated = 0;
  for (const doc of sourceSnapshot.docs) {
    const data = doc.data() as Omit<SourceVoiceActor, 'id'>;

    const newItem = {
      hobbyId: categoryId,
      title: data.name_japanese || data.name_english || 'Unknown',
      description: '',
      images: data.image ? [data.image] : [],
      thumbImage: data.image || '',
      isPublic: true,
      order: migrated + 1,
      customFields: {
        nameKanji: data.name_japanese || '',
        nameKana: data.name_japanese_ruby || '',
        nameEnglish: data.name_english || '',
      },
      tags: [],
      createdAt: data.created?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: data.lastUpdated?.toDate?.()?.toISOString() || new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would migrate: ${newItem.title}`);
      oldToNewIdMap.set(doc.id, `dry-run-${doc.id}`);
    } else {
      const docRef = await db.collection(TARGET_ITEMS_COLLECTION).add(newItem);
      oldToNewIdMap.set(doc.id, docRef.id);
      console.log(`    Migrated: ${newItem.title} (${doc.id} -> ${docRef.id})`);
    }
    migrated++;
  }

  console.log(`  Migrated ${migrated} voice actors`);
  return oldToNewIdMap;
}

async function migrateCharacters(
  db: admin.Firestore,
  categoryId: string,
  animeIdMap: Map<string, string>,
  voiceActorIdMap: Map<string, string>
): Promise<void> {
  console.log('\nMigrating anime characters...');

  const sourceSnapshot = await db.collection(SOURCE_CHARACTER_PATH).get();

  console.log(`  Found ${sourceSnapshot.size} characters to migrate`);

  let migrated = 0;
  const skipped = 0;

  for (const doc of sourceSnapshot.docs) {
    const data = doc.data() as Omit<SourceCharacter, 'id'>;

    // Map old IDs to new IDs
    const newAnimeId = animeIdMap.get(data.anime_id) || '';
    const newVoiceActorId = voiceActorIdMap.get(data.voice_actor_id) || '';

    if (!newAnimeId && data.anime_id) {
      console.log(`    Warning: Anime ID ${data.anime_id} not found in map`);
    }
    if (!newVoiceActorId && data.voice_actor_id) {
      console.log(`    Warning: Voice actor ID ${data.voice_actor_id} not found in map`);
    }

    const newItem = {
      hobbyId: categoryId,
      title: data.name_japanese || data.name_english || 'Unknown Character',
      description: '',
      images: data.image ? [data.image] : [],
      thumbImage: data.image || '',
      isPublic: true,
      order: migrated + 1,
      customFields: {
        nameKanji: data.name_japanese || '',
        nameKana: data.name_japanese_ruby || '',
        nameEnglish: data.name_english || '',
        animeId: newAnimeId,
        voiceActorId: newVoiceActorId,
      },
      tags: [],
      createdAt: data.created?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: data.lastUpdated?.toDate?.()?.toISOString() || new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would migrate: ${newItem.title}`);
    } else {
      const docRef = await db.collection(TARGET_ITEMS_COLLECTION).add(newItem);
      console.log(`    Migrated: ${newItem.title} (${doc.id} -> ${docRef.id})`);
    }
    migrated++;
  }

  console.log(`  Migrated ${migrated} characters, skipped ${skipped}`);
}

function setSourcePaths(userId: string) {
  SOURCE_USER_ID = userId;
  SOURCE_ANIME_PATH = `${userId}/anime/itemCollection`;
  SOURCE_VOICE_ACTOR_PATH = `${userId}/anime/voiceActorCollection`;
  SOURCE_CHARACTER_PATH = `${userId}/anime/animeCharacterCollection`;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Anime Data Migration Script');
  console.log('='.repeat(60));

  const CATEGORIES_ONLY = process.env.CATEGORIES_ONLY === 'true';

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No data will be written');
    console.log('   Set DRY_RUN=false to actually create data\n');
  } else {
    console.log('\n🚀 LIVE MODE - Data will be written to Firestore\n');
  }

  try {
    await initializeFirebase();
    const db = admin.firestore();

    // Step 1: Create hobby categories
    const categoryIds = await createHobbyCategories(db);

    // If CATEGORIES_ONLY mode, skip data migration
    if (CATEGORIES_ONLY) {
      console.log('\n📌 CATEGORIES_ONLY mode - skipping data migration');
      console.log('   Use the admin panel at /hobbies to add items manually.');
    } else {
      // Discover or use provided source user ID
      if (!SOURCE_USER_ID) {
        const discoveredId = await discoverSourceUserId(db);
        if (discoveredId) {
          setSourcePaths(discoveredId);
        } else {
          console.log('\n⚠️  No source data found in this Firebase project.');
          console.log('   Categories have been created. Add items via the admin panel.');
          console.log('\n' + '='.repeat(60));
          console.log('Categories created successfully!');
          console.log('='.repeat(60));
          return;
        }
      } else {
        setSourcePaths(SOURCE_USER_ID);
      }

      console.log(`\nSource user ID: ${SOURCE_USER_ID}`);
      console.log(`Source paths:`);
      console.log(`  - Anime: ${SOURCE_ANIME_PATH}`);
      console.log(`  - Voice Actors: ${SOURCE_VOICE_ACTOR_PATH}`);
      console.log(`  - Characters: ${SOURCE_CHARACTER_PATH}`);

      // Step 2: Migrate anime items (need the ID map for characters)
      const animeIdMap = await migrateAnimeItems(db, categoryIds['anime']);

      // Step 3: Migrate voice actors (need the ID map for characters)
      const voiceActorIdMap = await migrateVoiceActors(db, categoryIds['voice-actors']);

      // Step 4: Migrate characters (with relation references)
      await migrateCharacters(db, categoryIds['anime-characters'], animeIdMap, voiceActorIdMap);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration complete!');
    console.log('='.repeat(60));

    if (DRY_RUN) {
      console.log('\n✅ Dry run successful! To create categories:');
      console.log('   DRY_RUN=false npx tsx scripts/migrate-anime-data.ts');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
