/**
 * Fix image permissions in Firebase Storage
 * Makes all hobby images publicly accessible
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

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

async function main() {
  console.log('='.repeat(60));
  console.log('Fix Image Permissions');
  console.log('='.repeat(60));

  await initializeFirebase();
  const bucket = admin.storage().bucket();

  // List all files in hobby/ folder
  console.log('\n📂 Listing files in hobby/ folder...');
  const [files] = await bucket.getFiles({ prefix: 'hobby/' });

  console.log(`Found ${files.length} files\n`);

  let fixedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      // Make file public
      await file.makePublic();

      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${TARGET_BUCKET}/${file.name}`;
      console.log(`✅ ${file.name}`);
      console.log(`   URL: ${publicUrl}`);
      fixedCount++;
    } catch (error) {
      console.log(`❌ ${file.name}: ${error}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  Fixed: ${fixedCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (errorCount > 0) {
    console.log('\n⚠️  Some files had errors. Check Firebase Storage rules:');
    console.log('   Firebase Console > Storage > Rules');
    console.log('   Make sure hobby/ folder allows public read access');
  }
}

main().catch(console.error);
