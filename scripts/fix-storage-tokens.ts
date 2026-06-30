/**
 * Add download tokens to Firebase Storage files
 * This fixes the Console preview/download issue
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const TARGET_BUCKET = 'yudai-portfolio.appspot.com';
const DRY_RUN = process.env.DRY_RUN !== 'false';

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

async function main() {
  console.log('='.repeat(60));
  console.log('Fix Storage Download Tokens');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE');
  } else {
    console.log('\n🚀 LIVE MODE');
  }

  await initializeFirebase();
  const bucket = admin.storage().bucket();

  // Process anime, character, and voice_actor folders
  const folders = ['hobby/anime', 'hobby/character', 'hobby/voice_actor'];

  let fixedCount = 0;
  let errorCount = 0;

  for (const folder of folders) {
    console.log(`\n📂 Processing ${folder}...`);
    const [files] = await bucket.getFiles({ prefix: `${folder}/` });

    for (const file of files) {
      try {
        // Get current metadata
        const [metadata] = await file.getMetadata();

        // Check if token already exists
        if (metadata.metadata?.firebaseStorageDownloadTokens) {
          console.log(`  ⏭️  ${file.name} (already has token)`);
          continue;
        }

        if (DRY_RUN) {
          console.log(`  [DRY RUN] Would add token to: ${file.name}`);
          fixedCount++;
          continue;
        }

        // Generate new token
        const token = uuidv4();

        // Update metadata with token
        await file.setMetadata({
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        });

        // Also ensure file is public
        await file.makePublic();

        console.log(`  ✅ ${file.name}`);
        fixedCount++;
      } catch (error) {
        console.log(`  ❌ ${file.name}: ${error}`);
        errorCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  Fixed: ${fixedCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/fix-storage-tokens.ts');
  } else {
    console.log('\n✅ Done! Refresh the Firebase Console to see previews.');
  }
}

main().catch(console.error);
