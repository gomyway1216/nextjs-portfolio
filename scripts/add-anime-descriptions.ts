/**
 * Add English descriptions to anime data
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';

// English descriptions for anime
const animeDescriptions: Record<string, { en: string; ja: string }> = {
  'とらドラ！': {
    ja: '高校生の高須竜児と逢坂大河が、お互いの恋を応援し合ううちに本当の恋に目覚めていくラブコメディ。',
    en: 'A romantic comedy about high schooler Ryuuji Takasu and Taiga Aisaka who help each other pursue their crushes, only to discover true love along the way.',
  },
  'Re:ゼロから始める異世界生活': {
    ja: '異世界に召喚された少年スバルが「死に戻り」の能力を使い、絶望的な状況を何度も乗り越えていく物語。',
    en: 'A story about Subaru, a boy summoned to another world, who uses his "Return by Death" ability to overcome desperate situations time and again.',
  },
  '進撃の巨人': {
    ja: '巨人に支配された世界で、人類の自由を取り戻すために戦う兵士たちの物語。',
    en: 'In a world dominated by Titans, soldiers fight to reclaim humanity\'s freedom.',
  },
  'かぐや様は告らせたい': {
    ja: '秀才生徒会長と副会長が、プライドをかけて相手に告白させようとする頭脳戦ラブコメディ。',
    en: 'A romantic comedy where the genius student council president and vice president engage in psychological warfare to make the other confess first.',
  },
  'ドラゴンボール': {
    ja: '孫悟空が仲間たちと共に強敵と戦い、ドラゴンボールを集める冒険物語。',
    en: 'The adventure of Son Goku and his friends as they fight powerful enemies and collect the Dragon Balls.',
  },
  'ONE PIECE': {
    ja: 'モンキー・D・ルフィが海賊王を目指し、仲間たちと大海原を冒険する物語。',
    en: 'The story of Monkey D. Luffy and his crew as they sail the seas in pursuit of becoming the Pirate King.',
  },
  'NARUTO': {
    ja: '忍者の少年ナルトが火影を目指して成長していく物語。',
    en: 'The story of ninja boy Naruto as he grows while pursuing his dream of becoming Hokage.',
  },
  'BLEACH': {
    ja: '死神の力を得た高校生・黒崎一護が、現世と霊界を行き来しながら敵と戦う物語。',
    en: 'The story of high schooler Ichigo Kurosaki who gains Soul Reaper powers and fights enemies across the living world and Soul Society.',
  },
  'ソードアート・オンライン': {
    ja: 'VRMMORPGに閉じ込められたプレイヤーたちが、デスゲームから脱出を目指す物語。',
    en: 'Players trapped in a VRMMORPG must fight to escape the deadly game.',
  },
  'やはり俺の青春ラブコメはまちがっている。': {
    ja: 'ひねくれた高校生・比企谷八幡が奉仕部で様々な人間関係に向き合っていく青春ドラマ。',
    en: 'A youth drama about cynical high schooler Hachiman Hikigaya who confronts various relationships through the Service Club.',
  },
  '五等分の花嫁': {
    ja: '貧乏な秀才高校生が、五つ子の家庭教師をしながら恋愛に発展していくラブコメディ。',
    en: 'A romantic comedy about a poor but brilliant student who becomes a tutor for quintuplet sisters.',
  },
  '化物語': {
    ja: '怪異に関わる少女たちを救う高校生・阿良々木暦の物語。',
    en: 'The story of high schooler Koyomi Araragi who saves girls involved with supernatural oddities.',
  },
  'この素晴らしい世界に祝福を！': {
    ja: '異世界に転生した引きこもりが、個性的な仲間たちとギャグ満載の冒険を繰り広げるコメディ。',
    en: 'A comedy about a shut-in reincarnated in another world, going on hilarious adventures with his quirky companions.',
  },
  '呪術廻戦': {
    ja: '呪いと戦う呪術師たちの物語。主人公・虎杖悠仁が呪術の世界に足を踏み入れる。',
    en: 'The story of jujutsu sorcerers fighting curses. Protagonist Yuji Itadori enters the world of jujutsu.',
  },
  'ワンパンマン': {
    ja: 'どんな敵も一撃で倒せるヒーロー・サイタマの物語。強すぎるゆえの悩みを抱える。',
    en: 'The story of Saitama, a hero who can defeat any enemy with one punch, dealing with the troubles of being too strong.',
  },
  '銀魂': {
    ja: '江戸時代に宇宙人が来襲した世界で、万事屋を営む侍・坂田銀時のギャグアクション。',
    en: 'A gag action series about samurai Gintoki Sakata running an odd-jobs business in an Edo period invaded by aliens.',
  },
  'からかい上手の高木さん': {
    ja: '隣の席の高木さんにからかわれ続ける中学生・西片の日常ラブコメディ。',
    en: 'A romantic comedy about middle schooler Nishikata who is constantly teased by his seatmate Takagi.',
  },
};

async function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: privateKey! }),
  });

  console.log(`Firebase initialized: ${projectId}`);
  return admin.app();
}

async function main() {
  console.log('='.repeat(60));
  console.log('Add English Descriptions to Anime');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE');
  } else {
    console.log('\n🚀 LIVE MODE');
  }

  await initializeFirebase();
  const db = admin.firestore();

  // Get anime hobby category
  const animeCategory = await db.collection('hobbies').where('slug', '==', 'anime').get();
  if (animeCategory.empty) {
    console.log('Anime category not found!');
    return;
  }
  const animeCategoryId = animeCategory.docs[0].id;

  // Update anime category fields to include descriptionEn
  const currentFields = animeCategory.docs[0].data().fields || [];
  const hasDescriptionEn = currentFields.some((f: { name: string }) => f.name === 'descriptionEn');

  if (!hasDescriptionEn) {
    const newFields = [
      ...currentFields,
      {
        id: `field-${Date.now()}`,
        name: 'descriptionEn',
        label: 'Description (English)',
        type: 'textarea',
        required: false,
        order: currentFields.length + 1,
      },
    ];

    if (!DRY_RUN) {
      await db.collection('hobbies').doc(animeCategory.docs[0].id).update({
        fields: newFields,
      });
      console.log('Added descriptionEn field to anime category');
    } else {
      console.log('[DRY RUN] Would add descriptionEn field');
    }
  }

  // Get all anime items
  const animeItems = await db.collection('hobby_items')
    .where('hobbyId', '==', animeCategoryId)
    .get();

  console.log(`\nFound ${animeItems.size} anime items`);

  let updatedCount = 0;

  for (const doc of animeItems.docs) {
    const data = doc.data();
    const title = data.title;

    const descriptions = animeDescriptions[title];
    if (descriptions) {
      const updates: Record<string, unknown> = {
        'customFields.descriptionEn': descriptions.en,
      };

      // Also update Japanese description if it's empty or just "preparing…"
      const currentDesc = data.customFields?.animeDescription;
      if (!currentDesc || currentDesc === 'preparing…' || currentDesc === 'preparing...') {
        updates['customFields.animeDescription'] = descriptions.ja;
      }

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would update: ${title}`);
      } else {
        await db.collection('hobby_items').doc(doc.id).update(updates);
        console.log(`✅ ${title}`);
      }
      updatedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  Updated: ${updatedCount} anime items`);

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/add-anime-descriptions.ts');
  }
}

main().catch(console.error);
