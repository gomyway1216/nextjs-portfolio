/**
 * Update all anime with Japanese and English descriptions
 */

import * as admin from './firebase-admin-compat';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';

// All anime descriptions (Japanese title -> { ja, en })
const animeDescriptions: Record<string, { ja: string; en: string }> = {
  // Already have both - keeping for reference/overwrite
  'とらドラ！': {
    ja: '高校生の高須竜児と逢坂大河が、お互いの恋を応援し合ううちに本当の恋に目覚めていくラブコメディ。',
    en: 'A romantic comedy about high schooler Ryuuji Takasu and Taiga Aisaka who help each other pursue their crushes, only to discover true love along the way.',
  },
  'Re:ゼロから始める異世界生活': {
    ja: '異世界に召喚された少年スバルが「死に戻り」の能力を使い、絶望的な状況を何度も乗り越えていく物語。',
    en: 'A story about Subaru, a boy summoned to another world, who uses his "Return by Death" ability to overcome desperate situations time and again.',
  },
  'からかい上手の高木さん': {
    ja: '隣の席の高木さんにからかわれ続ける中学生・西片の日常ラブコメディ。',
    en: 'A romantic comedy about middle schooler Nishikata who is constantly teased by his seatmate Takagi.',
  },
  '銀魂': {
    ja: '江戸時代に宇宙人が来襲した世界で、万事屋を営む侍・坂田銀時のギャグアクション。',
    en: 'A gag action series about samurai Gintoki Sakata running an odd-jobs business in an Edo period invaded by aliens.',
  },
  '進撃の巨人': {
    ja: '巨人に支配された世界で、人類の自由を取り戻すために戦う兵士たちの物語。',
    en: 'In a world dominated by Titans, soldiers fight to reclaim humanity\'s freedom.',
  },
  'かぐや様は告らせたい': {
    ja: '秀才生徒会長と副会長が、プライドをかけて相手に告白させようとする頭脳戦ラブコメディ。',
    en: 'A romantic comedy where the genius student council president and vice president engage in psychological warfare to make the other confess first.',
  },
  '五等分の花嫁': {
    ja: '貧乏な秀才高校生が、五つ子の家庭教師をしながら恋愛に発展していくラブコメディ。',
    en: 'A romantic comedy about a poor but brilliant student who becomes a tutor for quintuplet sisters.',
  },
  'やはり俺の青春ラブコメはまちがっている。': {
    ja: 'ひねくれた高校生・比企谷八幡が奉仕部で様々な人間関係に向き合っていく青春ドラマ。',
    en: 'A youth drama about cynical high schooler Hachiman Hikigaya who confronts various relationships through the Service Club.',
  },
  'ソードアート・オンライン': {
    ja: 'VRMMORPGに閉じ込められたプレイヤーたちが、デスゲームから脱出を目指す物語。',
    en: 'Players trapped in a VRMMORPG must fight to escape the deadly game.',
  },
  'ドラゴンボール': {
    ja: '孫悟空が仲間たちと共に強敵と戦い、ドラゴンボールを集める冒険物語。',
    en: 'The adventure of Son Goku and his friends as they fight powerful enemies and collect the Dragon Balls.',
  },
  'ワンパンマン': {
    ja: 'どんな敵も一撃で倒せるヒーロー・サイタマの物語。強すぎるゆえの悩みを抱える。',
    en: 'The story of Saitama, a hero who can defeat any enemy with one punch, dealing with the troubles of being too strong.',
  },
  'ONE PIECE': {
    ja: 'モンキー・D・ルフィが海賊王を目指し、仲間たちと大海原を冒険する物語。',
    en: 'The story of Monkey D. Luffy and his crew as they sail the seas in pursuit of becoming the Pirate King.',
  },
  '化物語': {
    ja: '怪異に関わる少女たちを救う高校生・阿良々木暦の物語。',
    en: 'The story of high schooler Koyomi Araragi who saves girls involved with supernatural oddities.',
  },
  '呪術廻戦': {
    ja: '呪いと戦う呪術師たちの物語。主人公・虎杖悠仁が呪術の世界に足を踏み入れる。',
    en: 'The story of jujutsu sorcerers fighting curses. Protagonist Yuji Itadori enters the world of jujutsu.',
  },
  'BLEACH': {
    ja: '死神の力を得た高校生・黒崎一護が、現世と霊界を行き来しながら敵と戦う物語。',
    en: 'The story of high schooler Ichigo Kurosaki who gains Soul Reaper powers and fights enemies across the living world and Soul Society.',
  },

  // Japanese only - need English
  'ご注文はうさぎですか？': {
    ja: 'ココアが喫茶店「ラビットハウス」で働きながら、チノやリゼたちと過ごす日常系コメディ。',
    en: 'A slice-of-life comedy about Cocoa working at the café "Rabbit House" and spending time with Chino, Rize, and others.',
  },
  '浦安鉄筋家族': {
    ja: '千葉県浦安市を舞台に、大沢木家を中心としたハチャメチャなギャグコメディ。',
    en: 'A wild gag comedy set in Urayasu, Chiba, centered around the Osawagi family.',
  },
  'だがしかし': {
    ja: '駄菓子屋の息子・ココノツと駄菓子マニアの少女・ほたるが繰り広げる駄菓子コメディ。',
    en: 'A comedy about Kokonotsu, son of a candy store owner, and Hotaru, a candy-obsessed girl.',
  },
  '彼女、お借りします': {
    ja: '彼女にフラれた大学生・和也がレンタル彼女を借りたことから始まるラブコメディ。',
    en: 'A romantic comedy about college student Kazuya who rents a girlfriend after being dumped.',
  },
  'この素晴らしい世界に祝福を！': {
    ja: '異世界に転生した引きこもりが、個性的な仲間たちとギャグ満載の冒険を繰り広げるコメディ。',
    en: 'A comedy about a shut-in reincarnated in another world, going on hilarious adventures with his quirky companions.',
  },

  // Missing both
  'おじさんとマシュマロ': {
    ja: 'マシュマロが大好きなおじさんと、彼に恋する後輩OLの日常を描いたオフィスラブコメディ。',
    en: 'An office love comedy about a marshmallow-loving middle-aged man and his junior colleague who has a crush on him.',
  },
  'SLAM DUNK': {
    ja: '不良少年・桜木花道がバスケットボールに目覚め、湘北高校バスケ部で成長していく青春スポーツ漫画。',
    en: 'A youth sports manga about delinquent Hanamichi Sakuragi who discovers basketball and grows with the Shohoku High basketball team.',
  },
  'すのはら荘の管理人さん': {
    ja: '女子寮「すのはら荘」の管理人・春原彩花と、女装して入寮した少年の日常コメディ。',
    en: 'A comedy about Ayaka Sunohara, the caretaker of a girls\' dormitory, and a boy who moves in while cross-dressing.',
  },
  '終末なにしてますか？忙しいですか？救ってもらっていいですか？': {
    ja: '人類滅亡後の世界で、妖精兵器の少女たちと唯一生き残った人間の青年の切ない物語。',
    en: 'A bittersweet story about fairy weapon girls and the last surviving human in a post-apocalyptic world.',
  },
  'その着せ替え人形は恋をする': {
    ja: '雛人形職人を目指す男子高校生と、コスプレ好きのギャルが出会い、コスプレ衣装作りを通じて恋に発展するラブコメディ。',
    en: 'A romantic comedy about a boy aspiring to be a hina doll craftsman and a cosplay-loving gyaru who fall in love through costume-making.',
  },
  'クレヨンしんちゃん': {
    ja: '5歳の野原しんのすけと家族や友達が繰り広げるギャグアニメ。おバカな行動と感動のエピソードが人気。',
    en: 'A gag anime about 5-year-old Shinnosuke Nohara and his family and friends. Popular for its silly antics and touching episodes.',
  },
  '名探偵コナン': {
    ja: '高校生探偵・工藤新一が薬で小学生の姿にされ、江戸川コナンとして数々の事件を解決していく推理アニメ。',
    en: 'A detective anime about high school detective Shinichi Kudo, who is turned into a child by a drug and solves cases as Conan Edogawa.',
  },
  '初恋限定。': {
    ja: '高校生たちの初恋模様を描いたオムニバス形式のラブコメディ。',
    en: 'An omnibus-style romantic comedy depicting the first loves of high school students.',
  },
  '365歩のユウキ！！！': {
    ja: '前向きな少年ユウキが様々な困難に立ち向かっていく物語。',
    en: 'A story about the positive boy Yuuki who faces various challenges head-on.',
  },
  'citrus': {
    ja: '義理の姉妹となった女子高生二人の禁断の恋を描いた百合作品。',
    en: 'A yuri work depicting the forbidden love between two high school girls who become step-sisters.',
  },
  '家庭教師ヒットマンREBORN!': {
    ja: 'ダメダメ中学生・沢田綱吉がマフィアのボスとして成長していくバトル漫画。',
    en: 'A battle manga about underachieving middle schooler Tsunayoshi Sawada growing to become a mafia boss.',
  },
  'ヒカルの碁': {
    ja: '平凡な少年・進藤ヒカルが天才棋士の霊・藤原佐為と出会い、囲碁の世界に引き込まれていく物語。',
    en: 'A story about ordinary boy Hikaru Shindo who meets the ghost of genius Go player Fujiwara no Sai and is drawn into the world of Go.',
  },
  'はじめてのギャル': {
    ja: '非モテ男子高校生がクラスのギャルに告白し、意外にもOKされてから始まるラブコメディ。',
    en: 'A romantic comedy about an unpopular high school boy who confesses to a gyaru classmate and surprisingly gets accepted.',
  },
  '可愛いだけじゃない式守さん': {
    ja: '普段は可愛い彼女・式守さんが、彼氏のピンチには超カッコよくなるラブコメディ。',
    en: 'A romantic comedy about Shikimori, a normally cute girlfriend who becomes super cool when her boyfriend is in trouble.',
  },
  'NARUTO－ナルト': {
    ja: '忍者の少年ナルトが火影を目指して成長していく物語。仲間との絆と壮大なバトルが魅力。',
    en: 'The story of ninja boy Naruto pursuing his dream of becoming Hokage. Known for bonds of friendship and epic battles.',
  },
  'なんでここに先生が！？': {
    ja: '高校生の男子生徒が様々な場所で女性教師とラッキースケベに遭遇するコメディ。',
    en: 'A comedy about a male high school student who has lucky pervert encounters with female teachers in various places.',
  },
  '妻、小学生になる。': {
    ja: '亡くなった妻が小学生として転生し、夫と娘の前に現れるハートウォーミングなドラマ。',
    en: 'A heartwarming drama about a deceased wife who is reincarnated as an elementary school student and appears before her husband and daughter.',
  },
  'ドメスティックな彼女': {
    ja: '高校教師への片思いを抱える少年が、その教師と義理の姉妹になってしまう複雑な恋愛ドラマ。',
    en: 'A complex romance drama about a boy with a crush on his teacher who becomes step-siblings with her.',
  },
  'ロザリオとバンパイア': {
    ja: '人間の少年が妖怪学園に入学し、吸血鬼の少女と出会うハーレムラブコメディ。',
    en: 'A harem romantic comedy about a human boy who enrolls in a monster academy and meets a vampire girl.',
  },
  'ドラえもん': {
    ja: '22世紀からやってきた猫型ロボット・ドラえもんが、ひみつ道具でのび太を助ける国民的アニメ。',
    en: 'A national anime about Doraemon, a cat robot from the 22nd century, who helps Nobita with secret gadgets.',
  },
  'それでも歩は寄せてくる': {
    ja: '将棋部の先輩・うるしに片思いする後輩・歩が、ストレートにアプローチするラブコメディ。',
    en: 'A romantic comedy about Ayumu, who has a crush on his shogi club senior Urushi and approaches her straightforwardly.',
  },
  '新世紀エヴァンゲリオン': {
    ja: '使徒と呼ばれる謎の敵と戦う少年少女たちの物語。心理描写と哲学的テーマで社会現象となった。',
    en: 'A story about teenagers fighting mysterious enemies called Angels. Became a social phenomenon for its psychological depth and philosophical themes.',
  },
  '宇宙よりも遠い場所': {
    ja: '南極を目指す女子高生4人の友情と成長を描いた青春アニメ。感動的なストーリーが評価された。',
    en: 'A coming-of-age anime about four high school girls aiming for Antarctica. Praised for its moving story of friendship and growth.',
  },
  'To LOVEる': {
    ja: '宇宙人の王女が地球の少年の元に押しかけてくるハーレムラブコメディ。',
    en: 'A harem romantic comedy about an alien princess who crashes into the life of an Earth boy.',
  },
  '宇崎ちゃんは遊びたい！': {
    ja: '後輩の宇崎ちゃんが先輩にウザ絡みする日常ラブコメディ。',
    en: 'A slice-of-life romantic comedy about junior Uzaki-chan who annoyingly hangs around her senior.',
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
  console.log('Update All Anime Descriptions');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE');
  } else {
    console.log('\n🚀 LIVE MODE');
  }

  await initializeFirebase();
  const db = admin.firestore();

  // Get anime category
  const animeCategory = await db.collection('hobbies').where('slug', '==', 'anime').get();
  if (animeCategory.empty) {
    console.log('Anime category not found!');
    return;
  }
  const animeCategoryId = animeCategory.docs[0].id;

  // Make sure descriptionEn field exists
  const categoryData = animeCategory.docs[0].data();
  const currentFields = categoryData.fields || [];
  const hasDescriptionEn = currentFields.some((f: { name: string }) => f.name === 'descriptionEn');

  if (!hasDescriptionEn && !DRY_RUN) {
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
    await db.collection('hobbies').doc(animeCategory.docs[0].id).update({ fields: newFields });
    console.log('Added descriptionEn field to category');
  }

  // Get all anime items
  const animeItems = await db.collection('hobby_items')
    .where('hobbyId', '==', animeCategoryId)
    .get();

  console.log(`\nFound ${animeItems.size} anime items`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of animeItems.docs) {
    const data = doc.data();
    const title = data.title;

    const descriptions = animeDescriptions[title];
    if (descriptions) {
      if (DRY_RUN) {
        console.log(`[DRY RUN] Would update: ${title}`);
      } else {
        await db.collection('hobby_items').doc(doc.id).update({
          'customFields.animeDescription': descriptions.ja,
          'customFields.descriptionEn': descriptions.en,
        });
        console.log(`✅ ${title}`);
      }
      updatedCount++;
    } else {
      console.log(`⏭️  No description for: ${title}`);
      skippedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  Updated: ${updatedCount}`);
  console.log(`  Skipped (no description available): ${skippedCount}`);

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/update-all-anime-descriptions.ts');
  }
}

main().catch(console.error);
