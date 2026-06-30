/**
 * Fix collection name and image paths
 * 1. Move data from hobbyItems to hobby_items
 * 2. Re-upload images to hobby/ instead of hobbies/
 * 3. Update URLs in Firestore
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';
import fetch from 'node-fetch';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';
const TARGET_BUCKET = 'yudai-portfolio.appspot.com';

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
  return admin.app();
}

function extractPathFromUrl(url: string): string | null {
  // Extract path from storage URL
  // https://storage.googleapis.com/yudai-portfolio.appspot.com/hobbies/anime/file.jpg
  const match = url.match(/yudai-portfolio\.appspot\.com\/(.+)$/);
  if (match) {
    return match[1];
  }
  return null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    default: return 'image/jpeg';
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Fix Collection and Image Paths');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE');
  } else {
    console.log('\n🚀 LIVE MODE');
  }

  await initializeFirebase();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  // Step 1: Move data from hobbyItems to hobby_items
  console.log('\n📦 Step 1: Moving data from hobbyItems to hobby_items...');

  const oldSnapshot = await db.collection('hobbyItems').get();
  console.log(`  Found ${oldSnapshot.size} items in hobbyItems`);

  let movedCount = 0;
  let imageFixCount = 0;

  for (const doc of oldSnapshot.docs) {
    const data = doc.data();
    let thumbImage = data.thumbImage || '';
    let images = data.images || [];

    // Fix image URLs: hobbies/ -> hobby/
    if (thumbImage.includes('/hobbies/')) {
      const oldPath = extractPathFromUrl(thumbImage);
      if (oldPath) {
        const newPath = oldPath.replace('hobbies/', 'hobby/');

        if (!DRY_RUN) {
          // Download and re-upload to new path
          const imageBuffer = await downloadImage(thumbImage);
          if (imageBuffer) {
            const file = bucket.file(newPath);
            await file.save(imageBuffer, {
              metadata: { contentType: getContentType(newPath) },
              public: true,
            });
            await file.makePublic();

            thumbImage = `https://storage.googleapis.com/${TARGET_BUCKET}/${newPath}`;
            images = [thumbImage];
            console.log(`  ✅ Image fixed: ${data.title}`);
            imageFixCount++;
          }
        } else {
          console.log(`  [DRY RUN] Would fix image for: ${data.title}`);
          imageFixCount++;
        }
      }
    }

    // Create new document in hobby_items
    const newData = {
      ...data,
      thumbImage,
      images,
    };

    if (!DRY_RUN) {
      await db.collection('hobby_items').doc(doc.id).set(newData);
      movedCount++;
    } else {
      console.log(`  [DRY RUN] Would move: ${data.title}`);
      movedCount++;
    }
  }

  console.log(`\n  Moved: ${movedCount} items`);
  console.log(`  Images fixed: ${imageFixCount}`);

  // Step 2: Delete old collection (optional, only if not dry run)
  if (!DRY_RUN && movedCount > 0) {
    console.log('\n🗑️  Step 2: Deleting old hobbyItems collection...');
    for (const doc of oldSnapshot.docs) {
      await db.collection('hobbyItems').doc(doc.id).delete();
    }
    console.log(`  Deleted ${oldSnapshot.size} documents from hobbyItems`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Complete!');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/fix-collection-and-images.ts');
  }
}

main().catch(console.error);
