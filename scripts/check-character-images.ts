/**
 * Check character images status
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

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

async function checkCharacters() {
  const categoriesSnap = await db.collection('hobbies').where('slug', '==', 'anime-characters').get();
  const hobbyId = categoriesSnap.docs[0].id;

  const itemsSnap = await db.collection('hobby_items').where('hobbyId', '==', hobbyId).get();

  let withImage = 0;
  let withoutImage = 0;
  const noImageChars: {id: string, title: string, nameKanji: string, nameEnglish: string}[] = [];

  itemsSnap.docs.forEach(doc => {
    const data = doc.data();
    const hasImage = data.images && data.images.length > 0 && data.images[0];
    if (hasImage) {
      withImage++;
    } else {
      withoutImage++;
      noImageChars.push({
        id: doc.id,
        title: data.title,
        nameKanji: data.customFields?.nameKanji || '',
        nameEnglish: data.customFields?.nameEnglish || ''
      });
    }
  });

  console.log('Total:', itemsSnap.size);
  console.log('With images:', withImage);
  console.log('Without images:', withoutImage);
  console.log('\nCharacters without images:');
  noImageChars.forEach((c, i) => console.log(`  ${i+1}. ${c.title} | ${c.nameKanji} | ${c.nameEnglish}`));
}

checkCharacters();
