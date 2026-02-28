/**
 * Migration script to download hobby item images from external URLs
 * and upload them to Firebase Storage, then update Firestore.
 *
 * Usage: npx tsx scripts/migrateHobbyImages.ts
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loaded .env.local');
}

// Initialize Firebase Admin
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID || 'yudai-portfolio';
const storageBucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || 'yudai-portfolio.appspot.com';

if (admin.apps.length === 0) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
      projectId,
      storageBucket,
    });
  } else if (privateKey && clientEmail) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
      storageBucket,
    });
  } else {
    admin.initializeApp({
      projectId,
      storageBucket,
    });
  }
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Hobby slugs to process (will be auto-detected if not found)
const HOBBY_SLUGS_TO_MIGRATE = ['anime-characters', 'voice-actors', 'anime-character', 'voice-actor'];

interface HobbyItem {
  id: string;
  hobbyId: string;
  title: string;
  thumbImage: string;
  [key: string]: unknown;
}

/**
 * Download image from URL and return as Buffer
 */
async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
        'Referer': 'https://myanimelist.net/',
      },
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode} - ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error(`Timeout downloading: ${url}`));
    });
  });
}

/**
 * Get file extension from URL or content type
 */
function getExtension(url: string): string {
  const urlPath = new URL(url).pathname;
  const ext = path.extname(urlPath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    return ext;
  }
  return '.jpg'; // Default to jpg
}

/**
 * Upload image to Firebase Storage and return public URL
 */
async function uploadToStorage(
  imageBuffer: Buffer,
  hobbySlug: string,
  itemId: string,
  originalUrl: string
): Promise<string> {
  const ext = getExtension(originalUrl);
  // Use 'hobby' folder (singular) to match existing storage rules
  const fileName = `hobby/${hobbySlug}/${itemId}${ext}`;

  const file = bucket.file(fileName);

  await file.save(imageBuffer, {
    metadata: {
      contentType: `image/${ext.replace('.', '')}`,
      metadata: {
        originalUrl,
        migratedAt: new Date().toISOString(),
      },
    },
  });

  // Make the file publicly accessible
  await file.makePublic();

  // Return the public URL
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  return publicUrl;
}

/**
 * Check if URL is already correctly migrated to Firebase Storage (in 'hobby' folder, not 'hobbies')
 */
function isCorrectlyMigrated(url: string): boolean {
  // Check if it's a Firebase Storage URL in the correct 'hobby' folder
  const isFirebaseStorage = url.includes('storage.googleapis.com') ||
         url.includes('firebasestorage.googleapis.com') ||
         url.includes('firebasestorage.app');

  if (!isFirebaseStorage) return false;

  // If it's in the wrong 'hobbies' folder, it needs re-migration
  if (url.includes('/hobbies/')) return false;

  // If it's in the correct 'hobby' folder, it's already migrated
  return url.includes('/hobby/');
}

/**
 * Main migration function
 */
async function migrateHobbyImages() {
  console.log('Starting hobby image migration...');
  console.log(`Project: ${projectId}`);
  console.log(`Storage Bucket: ${storageBucket}`);
  console.log('');

  // Get hobby categories (collection name is 'hobbies')
  const categoriesSnapshot = await db.collection('hobbies').get();
  const categories = categoriesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as { id: string; slug: string; name: string }[];

  console.log(`Found ${categories.length} hobby categories:`);
  categories.forEach(c => console.log(`  - ${c.slug}: ${c.name}`));

  for (const hobbySlug of HOBBY_SLUGS_TO_MIGRATE) {
    const category = categories.find(c => c.slug === hobbySlug);
    if (!category) {
      console.log(`Category not found: ${hobbySlug}`);
      continue;
    }

    console.log(`\nProcessing: ${category.name} (${hobbySlug})`);
    console.log('='.repeat(50));

    // Get items for this hobby
    const itemsSnapshot = await db
      .collection('hobby_items')
      .where('hobbyId', '==', category.id)
      .get();

    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as HobbyItem[];

    console.log(`Found ${items.length} items`);

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      const thumbImage = item.thumbImage;
      const originalThumbImage = item.originalThumbImage as string | undefined;

      // Skip if no image or already correctly migrated
      if (!thumbImage) {
        console.log(`  [SKIP] ${item.title}: No image`);
        skipped++;
        continue;
      }

      if (isCorrectlyMigrated(thumbImage)) {
        console.log(`  [SKIP] ${item.title}: Already migrated`);
        skipped++;
        continue;
      }

      // Determine source URL for download
      // If thumbImage is in wrong 'hobbies' folder, use originalThumbImage
      const isInWrongFolder = thumbImage.includes('/hobbies/');
      const sourceUrl = isInWrongFolder && originalThumbImage ? originalThumbImage : thumbImage;

      if (isInWrongFolder && !originalThumbImage) {
        console.log(`  [SKIP] ${item.title}: In wrong folder but no original URL`);
        skipped++;
        continue;
      }

      try {
        console.log(`  [MIGRATING] ${item.title}`);
        console.log(`    From: ${sourceUrl}`);

        // Download image
        const imageBuffer = await downloadImage(sourceUrl);
        console.log(`    Downloaded: ${imageBuffer.length} bytes`);

        // Upload to Firebase Storage
        const newUrl = await uploadToStorage(imageBuffer, hobbySlug, item.id, sourceUrl);
        console.log(`    Uploaded to: ${newUrl}`);

        // Update Firestore
        await db.collection('hobby_items').doc(item.id).update({
          thumbImage: newUrl,
          originalThumbImage: originalThumbImage || sourceUrl, // Keep original URL for reference
        });
        console.log(`    Updated Firestore`);

        migrated++;
      } catch (error) {
        console.error(`  [FAILED] ${item.title}: ${error instanceof Error ? error.message : error}`);
        failed++;
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\nSummary for ${hobbySlug}:`);
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Failed: ${failed}`);
  }

  console.log('\nMigration complete!');
}

// Run the migration
migrateHobbyImages()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
