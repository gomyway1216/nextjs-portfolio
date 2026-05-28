/**
 * Migrate images from yudai-blog Storage to yudai-portfolio Storage
 * and update hobbyItems with new URLs
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import fetch from 'node-fetch';
import type { Bucket } from '@google-cloud/storage';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';
const SOURCE_BUCKET = 'yudai-blog.appspot.com';
const TARGET_BUCKET = 'yudai-portfolio.appspot.com';
type StorageBucket = Bucket;

async function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: privateKey! }),
    storageBucket: TARGET_BUCKET,
  });

  console.log(`Firebase initialized: ${projectId}`);
  console.log(`Target Storage bucket: ${TARGET_BUCKET}`);
  return admin.app();
}

function extractPathFromUrl(url: string): string | null {
  // Extract path from Firebase Storage URL
  // https://firebasestorage.googleapis.com/v0/b/yudai-blog.appspot.com/o/anime%2Fdragon-ball.jpg?alt=media&token=...
  const match = url.match(/\/o\/([^?]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`    Failed to download: ${response.status} ${response.statusText}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`    Download error:`, error);
    return null;
  }
}

async function uploadImage(bucket: StorageBucket, filePath: string, buffer: Buffer, contentType: string): Promise<string> {
  const file = bucket.file(filePath);

  await file.save(buffer, {
    metadata: {
      contentType,
    },
    public: true,
  });

  // Make the file public and get the URL
  await file.makePublic();

  return `https://storage.googleapis.com/${TARGET_BUCKET}/${filePath}`;
}

function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

async function migrateImages() {
  console.log('='.repeat(60));
  console.log('Image Migration Script');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made');
    console.log('   Set DRY_RUN=false to actually migrate images\n');
  } else {
    console.log('\n🚀 LIVE MODE - Images will be migrated\n');
  }

  await initializeFirebase();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  // Get all hobbyItems
  const snapshot = await db.collection('hobbyItems').get();
  console.log(`Found ${snapshot.size} hobby items to check\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const title = data.title;
    let needsUpdate = false;
    const updates: { thumbImage?: string; images?: string[] } = {};

    // Check thumbImage
    if (data.thumbImage && data.thumbImage.includes(SOURCE_BUCKET)) {
      console.log(`📷 ${title}`);
      console.log(`   Source: ${data.thumbImage.substring(0, 80)}...`);

      const filePath = extractPathFromUrl(data.thumbImage);
      if (filePath) {
        const newPath = `hobby/${filePath}`;

        if (DRY_RUN) {
          console.log(`   [DRY RUN] Would migrate to: hobbies/${filePath}`);
          migratedCount++;
        } else {
          const imageBuffer = await downloadImage(data.thumbImage);
          if (imageBuffer) {
            try {
              const newUrl = await uploadImage(bucket, newPath, imageBuffer, getContentType(filePath));
              updates.thumbImage = newUrl;
              updates.images = [newUrl];
              needsUpdate = true;
              console.log(`   ✅ Migrated to: ${newUrl}`);
              migratedCount++;
            } catch (error) {
              console.log(`   ❌ Upload failed:`, error);
              errorCount++;
            }
          } else {
            console.log(`   ❌ Download failed`);
            errorCount++;
          }
        }
      }
    } else if (data.thumbImage) {
      skippedCount++;
    }

    // Update Firestore document
    if (needsUpdate && !DRY_RUN) {
      await db.collection('hobbyItems').doc(doc.id).update(updates);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped (already migrated or no image): ${skippedCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (DRY_RUN) {
    console.log('\n✅ Dry run complete! To actually migrate:');
    console.log('   DRY_RUN=false npx tsx scripts/migrate-images.ts');
  }
}

migrateImages().catch(console.error);
