/**
 * Migrate hobby images from Wikimedia to Firebase Storage
 *
 * Run with: npm run migrate:hobby-images
 *
 * This script:
 * 1. Downloads images from Wikimedia Commons
 * 2. Uploads them to Firebase Storage
 * 3. Updates Firestore documents with the new URLs
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize Firebase Admin
function initializeFirebase() {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return {
      db: admin.firestore(),
      storage: admin.storage(),
    };
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
  // Use appspot.com bucket (the default Firebase Storage bucket)
  const storageBucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'yudai-portfolio.appspot.com';

  console.log('Firebase config:', {
    hasServiceAccount: !!serviceAccount,
    hasPrivateKey: !!privateKey,
    hasClientEmail: !!clientEmail,
    projectId,
    storageBucket,
  });

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
      projectId,
      storageBucket,
    });
  } else if (privateKey && clientEmail && projectId) {
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
    throw new Error('Firebase credentials not found');
  }

  return {
    db: admin.firestore(),
    storage: admin.storage(),
  };
}

const { db, storage } = initializeFirebase();
const bucket = storage.bucket();

// Collection names
const HOBBIES_COLLECTION = 'hobbies';
const HOBBY_ITEMS_COLLECTION = 'hobby_items';

// Download image from URL using fetch (better for Wikimedia)
async function downloadImage(url: string): Promise<Buffer> {
  // Wikimedia requires a proper User-Agent
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'YudaiPortfolio/1.0 (https://yudai-portfolio.web.app; hobby image migration)',
      'Accept': 'image/*',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Get file extension from URL or content type
function getExtension(url: string): string {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp)/i);
  if (match) return match[1].toLowerCase();
  return 'jpg';
}

// Upload image to Firebase Storage
async function uploadToStorage(
  imageBuffer: Buffer,
  fileName: string,
  folder: string
): Promise<string> {
  const filePath = `hobby/${folder}/${fileName}`;
  const file = bucket.file(filePath);

  const extension = fileName.split('.').pop() || 'jpg';
  const contentType = extension === 'png' ? 'image/png' :
                      extension === 'gif' ? 'image/gif' :
                      extension === 'webp' ? 'image/webp' : 'image/jpeg';

  await file.save(imageBuffer, {
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  });

  // Make the file publicly accessible
  await file.makePublic();

  // Return the public URL
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
  return publicUrl;
}

// Generate a safe filename
function generateFileName(title: string, ext: string): string {
  const safeName = title
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  const timestamp = Date.now();
  return `${safeName}-${timestamp}.${ext}`;
}

// Check if URL is from Wikimedia
function isWikimediaUrl(url: string): boolean {
  return url.includes('wikimedia.org') || url.includes('wikipedia.org');
}

async function migrateImages() {
  console.log('Starting image migration...\n');

  try {
    // Migrate hobby category cover images
    console.log('Migrating hobby category cover images...');
    const hobbiesSnapshot = await db.collection(HOBBIES_COLLECTION).get();

    for (const doc of hobbiesSnapshot.docs) {
      const hobby = doc.data();

      if (hobby.coverImage && isWikimediaUrl(hobby.coverImage)) {
        console.log(`  Processing: ${hobby.name}`);
        try {
          const imageBuffer = await downloadImage(hobby.coverImage);
          const ext = getExtension(hobby.coverImage);
          const fileName = generateFileName(hobby.slug, ext);
          const newUrl = await uploadToStorage(imageBuffer, fileName, 'covers');

          await doc.ref.update({ coverImage: newUrl });
          console.log(`    ✓ Migrated cover image`);
        } catch (err) {
          console.log(`    ✗ Failed: ${err}`);
        }
      }
    }

    // Migrate hobby item images
    console.log('\nMigrating hobby item images...');
    const itemsSnapshot = await db.collection(HOBBY_ITEMS_COLLECTION).get();

    let processedCount = 0;
    let failedCount = 0;

    for (const doc of itemsSnapshot.docs) {
      const item = doc.data();
      const updates: Record<string, unknown> = {};
      let hasUpdates = false;

      // Migrate thumbImage
      if (item.thumbImage && isWikimediaUrl(item.thumbImage)) {
        console.log(`  Processing: ${item.title}`);
        try {
          const imageBuffer = await downloadImage(item.thumbImage);
          const ext = getExtension(item.thumbImage);
          const fileName = generateFileName(item.title, ext);
          const newUrl = await uploadToStorage(imageBuffer, fileName, 'items');

          updates.thumbImage = newUrl;
          hasUpdates = true;
          console.log(`    ✓ Migrated thumbImage`);
        } catch (err) {
          console.log(`    ✗ Failed thumbImage: ${err}`);
          failedCount++;
        }
      }

      // Migrate images array
      if (item.images && Array.isArray(item.images)) {
        const newImages: string[] = [];
        let imagesUpdated = false;

        for (let i = 0; i < item.images.length; i++) {
          const imgUrl = item.images[i];

          if (isWikimediaUrl(imgUrl)) {
            try {
              const imageBuffer = await downloadImage(imgUrl);
              const ext = getExtension(imgUrl);
              const fileName = generateFileName(`${item.title}-${i}`, ext);
              const newUrl = await uploadToStorage(imageBuffer, fileName, 'items');
              newImages.push(newUrl);
              imagesUpdated = true;
              console.log(`    ✓ Migrated image[${i}]`);
            } catch (err) {
              // Keep original URL if migration fails
              newImages.push(imgUrl);
              console.log(`    ✗ Failed image[${i}]: ${err}`);
              failedCount++;
            }
          } else {
            newImages.push(imgUrl);
          }
        }

        if (imagesUpdated) {
          updates.images = newImages;
          hasUpdates = true;
        }
      }

      // Update document if there are changes
      if (hasUpdates) {
        await doc.ref.update(updates);
        processedCount++;
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n✅ Migration completed!');
    console.log(`   - ${processedCount} items updated`);
    console.log(`   - ${failedCount} failures`);

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the migration
migrateImages();
