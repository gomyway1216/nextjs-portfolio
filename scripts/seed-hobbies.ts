/**
 * Seed script for hobby data (Fish and Trains)
 *
 * Run with: npm run seed:hobbies
 *
 * Make sure you have these environment variables set in .env.local:
 * - FIREBASE_PROJECT_ID or NEXT_PUBLIC_PROJECT_ID
 * - FIREBASE_PRIVATE_KEY
 * - FIREBASE_CLIENT_EMAIL
 * OR
 * - FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)
 */

import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize Firebase Admin
function initializeFirebase() {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.firestore();
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;

  console.log('Firebase config:', {
    hasServiceAccount: !!serviceAccount,
    hasPrivateKey: !!privateKey,
    hasClientEmail: !!clientEmail,
    projectId,
  });

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
      projectId,
    });
  } else if (privateKey && clientEmail && projectId) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
    });
  } else {
    throw new Error(
      'Firebase credentials not found. Please set FIREBASE_SERVICE_ACCOUNT_KEY or ' +
      'FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL + FIREBASE_PROJECT_ID in .env.local'
    );
  }

  return admin.firestore();
}

const db = initializeFirebase();

// Collection names
const HOBBIES_COLLECTION = 'hobbies';
const HOBBY_ITEMS_COLLECTION = 'hobby_items';

// Detailed fish data with species breakdown, sizes, and bilingual descriptions
// Using picsum.photos with seed values for consistent placeholder images
const fishData = [
  // === TUNA (マグロ) VARIETIES ===
  {
    title: '本マグロ（クロマグロ）',
    nameKanji: '本鮪・黒鮪',
    nameKana: 'ほんまぐろ・くろまぐろ',
    nameEnglish: 'Pacific Bluefin Tuna',
    scientificName: 'Thunnus orientalis',
    typicalSize: '150-300cm, 150-450kg',
    descriptionJa: 'マグロの最高峰。大トロ・中トロの脂のりが抜群で、寿司店では最高級ネタとして扱われる。築地・豊洲市場の初競りで最高値がつくことでも有名。',
    descriptionEn: 'The king of tuna. Prized for its rich, fatty otoro (belly) and chutoro (medium fatty) cuts. Famous for fetching record prices at New Year auctions at Tsukiji/Toyosu markets in Tokyo.',
    hasEaten: true,
    taste: '大トロは口の中でとろける脂の甘み。中トロは赤身と脂のバランスが絶妙。赤身は程よい酸味。',
    favoritePreparation: '刺身',
    rating: 5,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/honmaguro/400/300',
  },
  {
    title: 'メバチマグロ',
    nameKanji: '目鉢鮪',
    nameKana: 'めばちまぐろ',
    nameEnglish: 'Bigeye Tuna',
    scientificName: 'Thunnus obesus',
    typicalSize: '100-200cm, 40-180kg',
    descriptionJa: '大きな目が特徴の中型マグロ。本マグロより脂は控えめだが、赤身の味わいが濃厚。回転寿司でよく使われる。',
    descriptionEn: 'Named for its large eyes. A mid-sized tuna with less fat than bluefin but rich, flavorful red meat. Commonly used in conveyor belt sushi restaurants.',
    hasEaten: true,
    taste: '赤身がしっかりしていて、マグロらしい旨味が感じられる。',
    favoritePreparation: '刺身',
    rating: 4,
    season: '秋',
    thumbImage: 'https://picsum.photos/seed/mebachi/400/300',
  },
  {
    title: 'キハダマグロ',
    nameKanji: '黄肌鮪',
    nameKana: 'きはだまぐろ',
    nameEnglish: 'Yellowfin Tuna',
    scientificName: 'Thunnus albacares',
    typicalSize: '100-200cm, 30-175kg',
    descriptionJa: '黄色いヒレが特徴。あっさりとした赤身で、刺身よりもツナ缶やたたきに使われることが多い。',
    descriptionEn: 'Distinguished by its yellow fins. Has light, lean meat often used for canned tuna and tataki (seared preparation). Popular in Hawaiian poke bowls.',
    hasEaten: true,
    taste: 'さっぱりとした味わいで、脂は少なめ。',
    favoritePreparation: 'その他',
    rating: 3,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/kihada/400/300',
  },
  {
    title: 'ビンナガマグロ（ビンチョウ）',
    nameKanji: '鬢長鮪',
    nameKana: 'びんながまぐろ・びんちょう',
    nameEnglish: 'Albacore / White Tuna',
    scientificName: 'Thunnus alalunga',
    typicalSize: '60-120cm, 10-40kg',
    descriptionJa: '長い胸ビレが特徴の小型マグロ。「ビントロ」として回転寿司で人気。淡白でクセがなく食べやすい。',
    descriptionEn: 'Small tuna with distinctively long pectoral fins. Popular as "bintoro" in sushi. Has a mild, light flavor and is commonly canned as "white tuna" in Western countries.',
    hasEaten: true,
    taste: '淡白でクセがなく、脂がのると「ビントロ」として美味しい。',
    favoritePreparation: '寿司',
    rating: 4,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/binnaga/400/300',
  },
  {
    title: 'カツオ',
    nameKanji: '鰹',
    nameKana: 'かつお',
    nameEnglish: 'Skipjack Tuna / Bonito',
    scientificName: 'Katsuwonus pelamis',
    typicalSize: '40-80cm, 3-15kg',
    descriptionJa: 'たたきが有名な鮮やかな赤身の魚。初鰹（春）は爽やか、戻り鰹（秋）は脂がのる。鰹節の原料としても重要。',
    descriptionEn: 'Famous for tataki (seared, sliced raw). Two seasons: spring "initial bonito" is light and refreshing, autumn "returning bonito" is rich and fatty. Essential for making katsuobushi (dried bonito flakes).',
    hasEaten: true,
    taste: 'たたきはニンニクとショウガで絶品。独特の風味と旨味が特徴。',
    favoritePreparation: 'その他',
    rating: 4,
    season: '春',
    thumbImage: 'https://picsum.photos/seed/katsuo/400/300',
  },
  // === SALMON (サケ) VARIETIES ===
  {
    title: '秋鮭（白鮭）',
    nameKanji: '秋鮭・白鮭',
    nameKana: 'あきざけ・しろざけ',
    nameEnglish: 'Chum Salmon',
    scientificName: 'Oncorhynchus keta',
    typicalSize: '60-80cm, 3-5kg',
    descriptionJa: '日本で最も獲れるサケ。秋に川を遡上する。脂は控えめで、塩焼きやちゃんちゃん焼きに向く。イクラの親。',
    descriptionEn: 'The most common salmon in Japan. Returns to rivers in autumn to spawn. Lean meat, ideal for grilling with salt or Hokkaido-style "chanchan-yaki". Parent fish of ikura (salmon roe).',
    hasEaten: true,
    taste: 'あっさりした味わいで、塩焼きにすると香ばしい。',
    favoritePreparation: '焼き',
    rating: 4,
    season: '秋',
    thumbImage: 'https://picsum.photos/seed/akisake/400/300',
  },
  {
    title: '紅鮭',
    nameKanji: '紅鮭',
    nameKana: 'べにざけ',
    nameEnglish: 'Sockeye Salmon',
    scientificName: 'Oncorhynchus nerka',
    typicalSize: '50-70cm, 2-4kg',
    descriptionJa: '身が鮮やかな紅色で美しい。脂のりと旨味のバランスが良く、高級鮭として人気。おにぎりの具材としても定番。',
    descriptionEn: 'Known for its vivid red flesh. Well-balanced fat content and umami flavor. A premium salmon popular for rice balls (onigiri) and grilled dishes.',
    hasEaten: true,
    taste: '適度な脂と濃厚な旨味。色が美しく食欲をそそる。',
    favoritePreparation: '焼き',
    rating: 5,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/benizake/400/300',
  },
  {
    title: 'キングサーモン',
    nameKanji: 'キングサーモン・マスノスケ',
    nameKana: 'きんぐさーもん・ますのすけ',
    nameEnglish: 'King Salmon / Chinook',
    scientificName: 'Oncorhynchus tshawytscha',
    typicalSize: '80-120cm, 10-25kg',
    descriptionJa: 'サケ類で最大種。脂のりが非常に良く、刺身やスモークサーモンに最適。ニュージーランド産が有名。',
    descriptionEn: 'The largest Pacific salmon species. Extremely rich and fatty, perfect for sashimi and smoked salmon. New Zealand farm-raised King Salmon is particularly renowned.',
    hasEaten: true,
    taste: 'とろけるような脂のり。刺身で食べると絶品。',
    favoritePreparation: '刺身',
    rating: 5,
    season: '通年',
    thumbImage: 'https://picsum.photos/seed/kingsalmon/400/300',
  },
  {
    title: 'アトランティックサーモン',
    nameKanji: 'アトランティックサーモン',
    nameKana: 'あとらんてぃっくさーもん',
    nameEnglish: 'Atlantic Salmon',
    scientificName: 'Salmo salar',
    typicalSize: '70-100cm, 4-12kg',
    descriptionJa: '養殖が盛んで、回転寿司の「サーモン」の多くがこれ。脂がのっていて、刺身・寿司に人気。ノルウェー・チリ産が主流。',
    descriptionEn: 'The most commonly farmed salmon worldwide. Rich, fatty flesh ideal for sushi and sashimi. Norway and Chile are major producers. The "salmon" in most sushi restaurants.',
    hasEaten: true,
    taste: '脂がのっていてとろける。回転寿司の定番ネタ。',
    favoritePreparation: '寿司',
    rating: 5,
    season: '通年',
    thumbImage: 'https://picsum.photos/seed/atlanticsalmon/400/300',
  },
  {
    title: 'サクラマス',
    nameKanji: '桜鱒',
    nameKana: 'さくらます',
    nameEnglish: 'Cherry Salmon / Masu Salmon',
    scientificName: 'Oncorhynchus masou',
    typicalSize: '40-60cm, 1-3kg',
    descriptionJa: '桜の季節に旬を迎える高級魚。上品な脂と繊細な味わい。北海道のルイベ（冷凍刺身）が有名。',
    descriptionEn: 'A premium fish that peaks in cherry blossom season. Delicate flavor with refined fat content. Famous for Hokkaido\'s "ruibe" (frozen sashimi preparation).',
    hasEaten: false,
    taste: '',
    favoritePreparation: '刺身',
    rating: 0,
    season: '春',
    thumbImage: 'https://picsum.photos/seed/sakuramasu/400/300',
  },
  // === MACKEREL (サバ) VARIETIES ===
  {
    title: 'マサバ',
    nameKanji: '真鯖',
    nameKana: 'まさば',
    nameEnglish: 'Chub Mackerel',
    scientificName: 'Scomber japonicus',
    typicalSize: '30-50cm, 0.5-2kg',
    descriptionJa: '日本で最も一般的なサバ。秋から冬にかけて脂がのる。しめ鯖、塩焼き、味噌煮が定番。関サバ・金華サバが高級ブランド。',
    descriptionEn: 'The most common mackerel in Japan. Fattiest from autumn to winter. Popular preparations include shime-saba (vinegared), grilled with salt, and miso-simmered. Seki-saba and Kinka-saba are premium brands.',
    hasEaten: true,
    taste: '脂がのっていて濃厚。しめ鯖は酸味とのバランスが絶妙。',
    favoritePreparation: '焼き',
    rating: 4,
    season: '秋',
    thumbImage: 'https://picsum.photos/seed/masaba/400/300',
  },
  {
    title: 'ゴマサバ',
    nameKanji: '胡麻鯖',
    nameKana: 'ごまさば',
    nameEnglish: 'Blue Mackerel',
    scientificName: 'Scomber australasicus',
    typicalSize: '25-40cm, 0.3-1kg',
    descriptionJa: '体に胡麻のような斑点がある。マサバより脂は控えめだが、夏でも味が落ちにくい。九州の「ごまさば」料理が有名。',
    descriptionEn: 'Named for its sesame-seed-like spots. Less fatty than chub mackerel but maintains quality even in summer. Kyushu\'s "gomasaba" (sesame mackerel) dish is famous.',
    hasEaten: true,
    taste: 'さっぱりしていて、夏でも美味しい。',
    favoritePreparation: '刺身',
    rating: 3,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/gomasaba/400/300',
  },
  // === SEA BREAM (タイ) VARIETIES ===
  {
    title: '真鯛',
    nameKanji: '真鯛',
    nameKana: 'まだい',
    nameEnglish: 'Red Sea Bream',
    scientificName: 'Pagrus major',
    typicalSize: '30-70cm, 1-10kg',
    descriptionJa: '「魚の王様」と呼ばれる高級魚。桜鯛（春）が最も美味。お祝い事に欠かせない縁起物。淡白で上品な白身。',
    descriptionEn: 'Called "King of Fish" in Japan. Spring "cherry blossom bream" is most prized. Essential for celebrations (tai = omedetai = congratulations). Elegant, mild white flesh.',
    hasEaten: true,
    taste: '淡白で上品な味わい。刺身、焼き、煮付けなんでも美味しい。',
    favoritePreparation: '刺身',
    rating: 5,
    season: '春',
    thumbImage: 'https://picsum.photos/seed/madai/400/300',
  },
  {
    title: '金目鯛',
    nameKanji: '金目鯛',
    nameKana: 'きんめだい',
    nameEnglish: 'Splendid Alfonsino',
    scientificName: 'Beryx splendens',
    typicalSize: '30-50cm, 1-3kg',
    descriptionJa: '金色に輝く大きな目が特徴の深海魚。脂がのった柔らかい身で、煮付けが絶品。伊豆・千葉が産地として有名。',
    descriptionEn: 'A deep-sea fish with large, golden eyes. Soft, fatty flesh perfect for simmering in sweet soy sauce (nitsuke). Izu Peninsula and Chiba are famous production areas.',
    hasEaten: true,
    taste: '脂がのっていて、煮付けにすると身がふっくら。',
    favoritePreparation: '煮付け',
    rating: 5,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/kinmedai/400/300',
  },
  // === YELLOWTAIL (ブリ) VARIETIES ===
  {
    title: 'ブリ',
    nameKanji: '鰤',
    nameKana: 'ぶり',
    nameEnglish: 'Japanese Amberjack / Yellowtail',
    scientificName: 'Seriola quinqueradiata',
    typicalSize: '80-100cm, 5-10kg',
    descriptionJa: '出世魚の代表格。モジャコ→ワカシ→イナダ→ワラサ→ブリと成長で名前が変わる。冬の寒ブリは脂がのって絶品。',
    descriptionEn: 'Famous "promotion fish" - its name changes as it grows (symbolizing career advancement). Winter "kan-buri" (cold yellowtail) is prized for its rich fat content.',
    hasEaten: true,
    taste: '脂がのって濃厚。照り焼き、ブリ大根が定番。',
    favoritePreparation: '煮付け',
    rating: 4,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/buri/400/300',
  },
  {
    title: 'ハマチ（イナダ）',
    nameKanji: '魬・稲田',
    nameKana: 'はまち・いなだ',
    nameEnglish: 'Young Yellowtail',
    scientificName: 'Seriola quinqueradiata (young)',
    typicalSize: '40-60cm, 1-3kg',
    descriptionJa: 'ブリの若魚。関西では「ハマチ」、関東では「イナダ」と呼ぶ。養殖も盛んで、回転寿司でおなじみ。',
    descriptionEn: 'Young yellowtail before it becomes buri. Called "hamachi" in Kansai, "inada" in Kanto. Widely farmed and common in conveyor belt sushi.',
    hasEaten: true,
    taste: 'ブリより脂は控えめだが、さっぱりして食べやすい。',
    favoritePreparation: '刺身',
    rating: 4,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/hamachi/400/300',
  },
  {
    title: 'カンパチ',
    nameKanji: '間八',
    nameKana: 'かんぱち',
    nameEnglish: 'Greater Amberjack',
    scientificName: 'Seriola dumerili',
    typicalSize: '80-150cm, 10-50kg',
    descriptionJa: 'ブリの仲間で、頭に八の字模様がある。ブリより脂は控えめで、コリコリした食感。夏が旬。',
    descriptionEn: 'Related to yellowtail with a figure-eight pattern on its head. Less fatty than buri with a firmer, crunchy texture. Best in summer.',
    hasEaten: true,
    taste: 'コリコリした食感で、さっぱりとした上品な味わい。',
    favoritePreparation: '刺身',
    rating: 4,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/kanpachi/400/300',
  },
  // === FLATFISH (ヒラメ・カレイ) ===
  {
    title: 'ヒラメ',
    nameKanji: '鮃・平目',
    nameKana: 'ひらめ',
    nameEnglish: 'Olive Flounder / Japanese Flounder',
    scientificName: 'Paralichthys olivaceus',
    typicalSize: '40-80cm, 1-8kg',
    descriptionJa: '高級白身魚の代表。「エンガワ」と呼ばれるヒレの付け根が特に珍重される。淡白で繊細な味わい。',
    descriptionEn: 'A premium white-fleshed fish. The fin edge called "engawa" is especially prized for sushi. Delicate, refined flavor.',
    hasEaten: true,
    taste: '淡白で上品。エンガワはコリコリして脂がのっている。',
    favoritePreparation: '刺身',
    rating: 5,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/hirame/400/300',
  },
  // === SQUID (イカ) VARIETIES ===
  {
    title: 'スルメイカ',
    nameKanji: '鯣烏賊',
    nameKana: 'するめいか',
    nameEnglish: 'Japanese Flying Squid',
    scientificName: 'Todarodes pacificus',
    typicalSize: '20-30cm (mantle)',
    descriptionJa: '日本で最も漁獲量が多いイカ。刺身、煮物、干物（スルメ）など多様な調理法がある。',
    descriptionEn: 'The most commonly caught squid in Japan. Versatile in cooking: sashimi, simmered dishes, and dried (surume). A staple of Japanese cuisine.',
    hasEaten: true,
    taste: 'コリコリした食感。刺身は甘みがあり美味しい。',
    favoritePreparation: '刺身',
    rating: 4,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/surumeika/400/300',
  },
  {
    title: 'アオリイカ',
    nameKanji: '障泥烏賊',
    nameKana: 'あおりいか',
    nameEnglish: 'Bigfin Reef Squid',
    scientificName: 'Sepioteuthis lessoniana',
    typicalSize: '30-50cm (mantle), 1-4kg',
    descriptionJa: 'イカの王様と呼ばれる高級イカ。身が厚く、甘みが強い。刺身や天ぷらで最高の味わい。',
    descriptionEn: 'Called "King of Squid". Thick flesh with pronounced sweetness. Exceptional as sashimi or tempura. Highly prized by sushi chefs.',
    hasEaten: true,
    taste: '身が厚くて甘い。最高級の刺身ネタ。',
    favoritePreparation: '刺身',
    rating: 5,
    season: '春',
    thumbImage: 'https://picsum.photos/seed/aoriika/400/300',
  },
  // === OCTOPUS (タコ) ===
  {
    title: 'マダコ',
    nameKanji: '真蛸',
    nameKana: 'まだこ',
    nameEnglish: 'Common Octopus',
    scientificName: 'Octopus vulgaris',
    typicalSize: '40-60cm (arm span), 1-4kg',
    descriptionJa: '日本で最も一般的なタコ。明石のタコは「明石だこ」ブランドとして有名。刺身、たこ焼き、酢の物に。',
    descriptionEn: 'The most common octopus in Japan. Akashi octopus is famous as a premium brand. Used in sashimi, takoyaki (octopus balls), and vinegared dishes.',
    hasEaten: true,
    taste: '弾力のある食感。噛むほど旨味が出る。',
    favoritePreparation: 'その他',
    rating: 4,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/madako/400/300',
  },
  // === SHRIMP/PRAWN (エビ) VARIETIES ===
  {
    title: '車海老',
    nameKanji: '車海老',
    nameKana: 'くるまえび',
    nameEnglish: 'Japanese Tiger Prawn',
    scientificName: 'Marsupenaeus japonicus',
    typicalSize: '15-25cm',
    descriptionJa: '縞模様が車輪に見えることから命名。活きたまま調理する「躍り食い」が有名。天ぷらの最高級ネタ。',
    descriptionEn: 'Named for stripe patterns resembling wheel spokes. Famous for "odori-gui" (eating live). The premium choice for tempura.',
    hasEaten: true,
    taste: 'プリプリで甘い。天ぷらにすると最高。',
    favoritePreparation: '天ぷら',
    rating: 5,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/kurumaebi/400/300',
  },
  {
    title: '甘海老（ホッコクアカエビ）',
    nameKanji: '甘海老',
    nameKana: 'あまえび',
    nameEnglish: 'Sweet Shrimp / Spot Prawn',
    scientificName: 'Pandalus eous',
    typicalSize: '10-15cm',
    descriptionJa: '北陸・北海道産が有名。とろけるような甘みが特徴。寿司ネタの定番で、頭は味噌汁に使われる。',
    descriptionEn: 'Famous from Hokuriku and Hokkaido regions. Known for its melt-in-your-mouth sweetness. A sushi staple; heads are used for miso soup.',
    hasEaten: true,
    taste: 'とろけるような甘み。新鮮なものは透き通っている。',
    favoritePreparation: '寿司',
    rating: 5,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/amaebi/400/300',
  },
  {
    title: '伊勢海老',
    nameKanji: '伊勢海老',
    nameKana: 'いせえび',
    nameEnglish: 'Japanese Spiny Lobster',
    scientificName: 'Panulirus japonicus',
    typicalSize: '20-35cm, 0.5-2kg',
    descriptionJa: '日本を代表する高級海老。長い触角と華やかな姿からお祝い料理に欠かせない。刺身、味噌汁、グリルで。',
    descriptionEn: 'Japan\'s premier luxury crustacean. Long antennae and elegant appearance make it essential for celebration dishes. Served as sashimi, in miso soup, or grilled.',
    hasEaten: false,
    taste: '',
    favoritePreparation: '刺身',
    rating: 0,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/iseebi/400/300',
  },
  // === SEA URCHIN (ウニ) ===
  {
    title: 'バフンウニ',
    nameKanji: '馬糞雲丹',
    nameKana: 'ばふんうに',
    nameEnglish: 'Short-spined Sea Urchin',
    scientificName: 'Hemicentrotus pulcherrimus',
    typicalSize: '3-5cm (diameter)',
    descriptionJa: '濃厚でコクのある味わい。北海道・東北産が有名。オレンジ色が鮮やかで、寿司店では最高級品として扱われる。',
    descriptionEn: 'Rich, intense flavor with deep umami. Hokkaido and Tohoku varieties are famous. Vibrant orange color. Considered the premium choice at sushi restaurants.',
    hasEaten: true,
    taste: '濃厚でクリーミー。口の中でとろける。',
    favoritePreparation: '寿司',
    rating: 5,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/bafununi/400/300',
  },
  {
    title: 'ムラサキウニ',
    nameKanji: '紫雲丹',
    nameKana: 'むらさきうに',
    nameEnglish: 'Purple Sea Urchin',
    scientificName: 'Anthocidaris crassispina',
    typicalSize: '5-8cm (diameter)',
    descriptionJa: 'バフンウニより淡白で上品な味わい。黄色がかった色。関東以南で多く獲れる。',
    descriptionEn: 'Milder and more refined than bafun-uni. Yellowish color. More commonly found from Kanto region southward.',
    hasEaten: true,
    taste: '淡白で上品。後味がすっきり。',
    favoritePreparation: '寿司',
    rating: 4,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/murasakiuni/400/300',
  },
  // === OTHER POPULAR FISH ===
  {
    title: 'マアジ',
    nameKanji: '真鯵',
    nameKana: 'まあじ',
    nameEnglish: 'Japanese Horse Mackerel',
    scientificName: 'Trachurus japonicus',
    typicalSize: '20-40cm, 0.2-0.5kg',
    descriptionJa: '大衆魚の代表格。アジフライ、たたき、干物など調理法が多彩。新鮮なものは刺身も絶品。',
    descriptionEn: 'A staple of everyday Japanese cuisine. Versatile: fried (aji-fry), chopped raw (tataki), dried. Fresh specimens make excellent sashimi.',
    hasEaten: true,
    taste: '脂がのっていて美味しい。アジフライは定番。',
    favoritePreparation: 'フライ',
    rating: 4,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/maaji/400/300',
  },
  {
    title: 'サンマ',
    nameKanji: '秋刀魚',
    nameKana: 'さんま',
    nameEnglish: 'Pacific Saury',
    scientificName: 'Cololabis saira',
    typicalSize: '25-35cm, 0.1-0.2kg',
    descriptionJa: '秋の味覚の代表。刀のような細長い体。塩焼きにして大根おろしとスダチで食べるのが定番。近年は漁獲量が減少。',
    descriptionEn: 'The quintessential autumn fish. Sword-like elongated body. Classic preparation: grilled with salt, served with grated daikon and sudachi citrus. Catches have declined in recent years.',
    hasEaten: true,
    taste: '脂がのって香ばしい。内臓も美味しい。',
    favoritePreparation: '焼き',
    rating: 4,
    season: '秋',
    thumbImage: 'https://picsum.photos/seed/sanma/400/300',
  },
  {
    title: 'マイワシ',
    nameKanji: '真鰯',
    nameKana: 'まいわし',
    nameEnglish: 'Japanese Sardine',
    scientificName: 'Sardinops melanostictus',
    typicalSize: '15-25cm, 0.05-0.15kg',
    descriptionJa: '栄養価が高く健康食として人気。刺身、煮付け、オイルサーディンなど。新鮮なものは驚くほど美味しい。',
    descriptionEn: 'Highly nutritious health food. Prepared as sashimi, simmered, or as oil sardines. Surprisingly delicious when fresh.',
    hasEaten: true,
    taste: '脂がのっていて濃厚。新鮮なものは臭みがない。',
    favoritePreparation: '煮付け',
    rating: 3,
    season: '秋',
    thumbImage: 'https://picsum.photos/seed/maiwashi/400/300',
  },
  {
    title: 'トラフグ',
    nameKanji: '虎河豚',
    nameKana: 'とらふぐ',
    nameEnglish: 'Tiger Puffer',
    scientificName: 'Takifugu rubripes',
    typicalSize: '40-70cm, 2-5kg',
    descriptionJa: 'フグの最高級種。てっさ（刺身）、てっちり（鍋）、白子が絶品。猛毒があり、免許を持つ調理師のみが調理できる。',
    descriptionEn: 'The premium puffer fish. Famous for tessa (sashimi), tecchiri (hot pot), and shirako (milt). Contains deadly poison; only licensed chefs may prepare it.',
    hasEaten: false,
    taste: '',
    favoritePreparation: '刺身',
    rating: 0,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/torafugu/400/300',
  },
  {
    title: 'ホタテガイ',
    nameKanji: '帆立貝',
    nameKana: 'ほたてがい',
    nameEnglish: 'Japanese Scallop',
    scientificName: 'Mizuhopecten yessoensis',
    typicalSize: '10-20cm (shell diameter)',
    descriptionJa: '北海道を代表する貝。大きな貝柱が特徴で、刺身・バター焼き・干し貝柱など多様な調理法。甘みが強い。',
    descriptionEn: 'Representative shellfish of Hokkaido. Known for large adductor muscles. Prepared as sashimi, butter-grilled, or dried. Notably sweet flavor.',
    hasEaten: true,
    taste: '甘くて柔らかい。バター焼きは香ばしくて最高。',
    favoritePreparation: '焼き',
    rating: 5,
    season: '冬',
    thumbImage: 'https://picsum.photos/seed/hotategai/400/300',
  },
  {
    title: 'ノドグロ（アカムツ）',
    nameKanji: '喉黒・赤鯥',
    nameKana: 'のどぐろ・あかむつ',
    nameEnglish: 'Blackthroat Seaperch',
    scientificName: 'Doederleinia berycoides',
    typicalSize: '25-40cm, 0.5-2kg',
    descriptionJa: '「白身のトロ」と呼ばれる超高級魚。日本海側で獲れ、脂がのった上品な味わい。錦織圭選手が好物として有名に。',
    descriptionEn: 'Called "white-fleshed toro" for its rich fat content. A super-premium fish from the Sea of Japan. Made famous as tennis star Kei Nishikori\'s favorite fish.',
    hasEaten: false,
    taste: '',
    favoritePreparation: '焼き',
    rating: 0,
    season: '秋',
    thumbImage: 'https://picsum.photos/seed/nodoguro/400/300',
  },
  {
    title: 'アナゴ',
    nameKanji: '穴子',
    nameKana: 'あなご',
    nameEnglish: 'Conger Eel',
    scientificName: 'Conger myriaster',
    typicalSize: '40-90cm',
    descriptionJa: 'うなぎより淡白で上品な味わい。寿司ネタ、天ぷら、穴子丼が定番。東京湾・瀬戸内産が有名。',
    descriptionEn: 'More delicate and refined than freshwater eel. Popular as sushi topping, tempura, and rice bowl (anagodon). Tokyo Bay and Seto Inland Sea varieties are famous.',
    hasEaten: true,
    taste: 'ふっくらと柔らかく、上品な甘み。',
    favoritePreparation: '寿司',
    rating: 4,
    season: '夏',
    thumbImage: 'https://picsum.photos/seed/anago/400/300',
  },
  {
    title: 'シラス',
    nameKanji: '白子',
    nameKana: 'しらす',
    nameEnglish: 'Whitebait (Baby Sardines)',
    scientificName: 'Engraulis japonicus (juvenile)',
    typicalSize: '1-3cm',
    descriptionJa: 'カタクチイワシやマイワシの稚魚。生しらす、釜揚げしらす、しらす干しなど。湘南・駿河湾が名産地。',
    descriptionEn: 'Juvenile anchovies or sardines. Served raw (nama-shirasu), boiled (kamaage), or dried. Shonan and Suruga Bay are famous production areas.',
    hasEaten: true,
    taste: '磯の香りと繊細な甘み。生しらすは絶品。',
    favoritePreparation: 'その他',
    rating: 4,
    season: '春',
    thumbImage: 'https://picsum.photos/seed/shirasu/400/300',
  },
];

// Japanese train data - detailed series/model format
// Part 1: Shinkansen
const trainData = [
  // === 新幹線 (Shinkansen) ===
  { title: 'N700S系', nameKanji: 'N700S系', nameKana: 'えぬななひゃくえすけい', nameEnglish: 'N700S Series', hasRidden: true, trainType: '新幹線', railwayCompany: 'JR東海・JR西日本', route: '東海道・山陽新幹線', rating: 5, impression: '最新鋭の新幹線。静粛性と乗り心地が抜群。', thumbImage: 'https://picsum.photos/seed/n700s/400/300' },
  { title: 'N700A系', nameKanji: 'N700A系', nameKana: 'えぬななひゃくえーけい', nameEnglish: 'N700A Series', hasRidden: true, trainType: '新幹線', railwayCompany: 'JR東海・JR西日本', route: '東海道・山陽新幹線', rating: 5, impression: 'N700系の改良型。安定した走行。', thumbImage: 'https://picsum.photos/seed/n700a/400/300' },
  { title: '700系', nameKanji: '700系', nameKana: 'ななひゃくけい', nameEnglish: '700 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR西日本', route: '山陽新幹線（こだま）', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/700series/400/300' },
  { title: '500系', nameKanji: '500系', nameKana: 'ごひゃくけい', nameEnglish: '500 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR西日本', route: '山陽新幹線（こだま）', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/500series/400/300' },
  { title: 'E5系', nameKanji: 'E5系', nameKana: 'いーごけい', nameEnglish: 'E5 Series', hasRidden: true, trainType: '新幹線', railwayCompany: 'JR東日本', route: '東北新幹線（はやぶさ）', rating: 5, impression: '320km/h運転。グリーンの車体がカッコいい。', thumbImage: 'https://picsum.photos/seed/e5/400/300' },
  { title: 'H5系', nameKanji: 'H5系', nameKana: 'えいちごけい', nameEnglish: 'H5 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR北海道', route: '北海道新幹線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/h5/400/300' },
  { title: 'E6系', nameKanji: 'E6系', nameKana: 'いーろくけい', nameEnglish: 'E6 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR東日本', route: '秋田新幹線（こまち）', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e6/400/300' },
  { title: 'E7系', nameKanji: 'E7系', nameKana: 'いーななけい', nameEnglish: 'E7 Series', hasRidden: true, trainType: '新幹線', railwayCompany: 'JR東日本', route: '北陸・上越新幹線', rating: 5, impression: '金沢まで快適。車内も広い。', thumbImage: 'https://picsum.photos/seed/e7/400/300' },
  { title: 'W7系', nameKanji: 'W7系', nameKana: 'だぶりゅーななけい', nameEnglish: 'W7 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR西日本', route: '北陸新幹線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/w7/400/300' },
  { title: 'E2系', nameKanji: 'E2系', nameKana: 'いーにけい', nameEnglish: 'E2 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR東日本', route: '東北・上越新幹線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e2/400/300' },
  { title: 'E3系', nameKanji: 'E3系', nameKana: 'いーさんけい', nameEnglish: 'E3 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR東日本', route: '山形新幹線（つばさ）', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e3/400/300' },
  { title: 'E8系', nameKanji: 'E8系', nameKana: 'いーはちけい', nameEnglish: 'E8 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR東日本', route: '山形新幹線（つばさ）', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e8/400/300' },
  { title: '800系', nameKanji: '800系', nameKana: 'はっぴゃくけい', nameEnglish: '800 Series', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR九州', route: '九州新幹線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/800series/400/300' },
  { title: 'N700S 8000番台', nameKanji: 'N700S 8000番台', nameKana: 'えぬななひゃくえすはっせんばんだい', nameEnglish: 'N700S-8000', hasRidden: false, trainType: '新幹線', railwayCompany: 'JR九州', route: '九州新幹線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/n700s8000/400/300' },
  // === JR東日本 通勤電車 ===
  { title: 'E235系0番台', nameKanji: 'E235系0番台', nameKana: 'いーにーさんごけいぜろばんだい', nameEnglish: 'E235 Series 0', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '山手線', rating: 4, impression: '東京の象徴。液晶画面が多くて便利。', thumbImage: 'https://picsum.photos/seed/e2350/400/300' },
  { title: 'E235系1000番台', nameKanji: 'E235系1000番台', nameKana: 'いーにーさんごけいせんばんだい', nameEnglish: 'E235 Series 1000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '横須賀・総武快速線', rating: 4, impression: 'グリーン車付きの最新型。', thumbImage: 'https://picsum.photos/seed/e2351000/400/300' },
  { title: 'E233系0番台', nameKanji: 'E233系0番台', nameKana: 'いーにーさんさんけいぜろばんだい', nameEnglish: 'E233 Series 0', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '中央線快速', rating: 4, impression: 'オレンジの帯が特徴的。', thumbImage: 'https://picsum.photos/seed/e2330/400/300' },
  { title: 'E233系1000番台', nameKanji: 'E233系1000番台', nameKana: 'いーにーさんさんけいせんばんだい', nameEnglish: 'E233 Series 1000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '京浜東北線・根岸線', rating: 4, impression: 'スカイブルーの帯。', thumbImage: 'https://picsum.photos/seed/e2331000/400/300' },
  { title: 'E233系2000番台', nameKanji: 'E233系2000番台', nameKana: 'いーにーさんさんけいにせんばんだい', nameEnglish: 'E233 Series 2000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '常磐線各駅停車', rating: 4, impression: 'エメラルドグリーンの帯。', thumbImage: 'https://picsum.photos/seed/e2332000/400/300' },
  { title: 'E233系3000番台', nameKanji: 'E233系3000番台', nameKana: 'いーにーさんさんけいさんぜんばんだい', nameEnglish: 'E233 Series 3000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '東海道線・上野東京ライン', rating: 4, impression: 'グリーン車2両連結。', thumbImage: 'https://picsum.photos/seed/e2333000/400/300' },
  { title: 'E233系5000番台', nameKanji: 'E233系5000番台', nameKana: 'いーにーさんさんけいごせんばんだい', nameEnglish: 'E233 Series 5000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '京葉線', rating: 4, impression: 'ワインレッドの帯。', thumbImage: 'https://picsum.photos/seed/e2335000/400/300' },
  { title: 'E233系6000番台', nameKanji: 'E233系6000番台', nameKana: 'いーにーさんさんけいろくせんばんだい', nameEnglish: 'E233 Series 6000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '横浜線', rating: 4, impression: '黄緑の帯。', thumbImage: 'https://picsum.photos/seed/e2336000/400/300' },
  { title: 'E233系7000番台', nameKanji: 'E233系7000番台', nameKana: 'いーにーさんさんけいななせんばんだい', nameEnglish: 'E233 Series 7000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '埼京線・川越線', rating: 4, impression: '緑の帯。相鉄線直通も。', thumbImage: 'https://picsum.photos/seed/e2337000/400/300' },
  { title: 'E233系8000番台', nameKanji: 'E233系8000番台', nameKana: 'いーにーさんさんけいはっせんばんだい', nameEnglish: 'E233 Series 8000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '南武線', rating: 4, impression: '黄色と茶色の帯。', thumbImage: 'https://picsum.photos/seed/e2338000/400/300' },
  { title: 'E231系0番台', nameKanji: 'E231系0番台', nameKana: 'いーにーさんいちけいぜろばんだい', nameEnglish: 'E231 Series 0', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '中央・総武線各駅停車', rating: 3, impression: '黄色い帯の各停。', thumbImage: 'https://picsum.photos/seed/e2310/400/300' },
  { title: 'E231系500番台', nameKanji: 'E231系500番台', nameKana: 'いーにーさんいちけいごひゃくばんだい', nameEnglish: 'E231 Series 500', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '中央・総武線各駅停車', rating: 3, impression: '元山手線車両。', thumbImage: 'https://picsum.photos/seed/e231500/400/300' },
  { title: 'E231系1000番台', nameKanji: 'E231系1000番台', nameKana: 'いーにーさんいちけいせんばんだい', nameEnglish: 'E231 Series 1000', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '上野東京ライン・湘南新宿ライン', rating: 3, impression: 'グリーン車連結の近郊型。', thumbImage: 'https://picsum.photos/seed/e2311000/400/300' },
  { title: 'E531系', nameKanji: 'E531系', nameKana: 'いーごーさんいちけい', nameEnglish: 'E531 Series', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '常磐線', rating: 4, impression: '交直流電車。130km/h運転。', thumbImage: 'https://picsum.photos/seed/e531/400/300' },
  { title: 'E131系', nameKanji: 'E131系', nameKana: 'いーいちさんいちけい', nameEnglish: 'E131 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR東日本', route: '相模線・日光線・鹿島線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e131/400/300' },
  { title: '209系', nameKanji: '209系', nameKana: 'にーまるきゅうけい', nameEnglish: '209 Series', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '房総各線・八高線', rating: 3, impression: '重量半分・価格半分・寿命半分のコンセプト車両。', thumbImage: 'https://picsum.photos/seed/209/400/300' },
  { title: '205系', nameKanji: '205系', nameKana: 'にーまるごけい', nameEnglish: '205 Series', hasRidden: true, trainType: '通勤', railwayCompany: 'JR東日本', route: '鶴見線・仙石線', rating: 3, impression: '国鉄時代の名車。', thumbImage: 'https://picsum.photos/seed/205/400/300' },
  // === JR東日本 特急 ===
  { title: 'E259系', nameKanji: 'E259系', nameKana: 'いーにーごーきゅうけい', nameEnglish: 'E259 Series', hasRidden: true, trainType: '特急', railwayCompany: 'JR東日本', route: '成田エクスプレス', rating: 4, impression: '空港アクセスに便利。', thumbImage: 'https://picsum.photos/seed/e259/400/300' },
  { title: 'E261系', nameKanji: 'E261系', nameKana: 'いーにーろくいちけい', nameEnglish: 'E261 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR東日本', route: 'サフィール踊り子', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e261/400/300' },
  { title: 'E257系', nameKanji: 'E257系', nameKana: 'いーにーごーななけい', nameEnglish: 'E257 Series', hasRidden: true, trainType: '特急', railwayCompany: 'JR東日本', route: '踊り子・あずさ・かいじ', rating: 4, impression: '中央線・伊豆方面の特急。', thumbImage: 'https://picsum.photos/seed/e257/400/300' },
  { title: 'E353系', nameKanji: 'E353系', nameKana: 'いーさんごーさんけい', nameEnglish: 'E353 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR東日本', route: 'あずさ・かいじ', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e353/400/300' },
  { title: 'E657系', nameKanji: 'E657系', nameKana: 'いーろくごーななけい', nameEnglish: 'E657 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR東日本', route: 'ひたち・ときわ', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e657/400/300' },
  { title: 'E653系', nameKanji: 'E653系', nameKana: 'いーろくごーさんけい', nameEnglish: 'E653 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR東日本', route: 'いなほ・しらゆき', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/e653/400/300' },
  { title: '251系', nameKanji: '251系', nameKana: 'にーごーいちけい', nameEnglish: '251 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR東日本', route: 'スーパービュー踊り子（引退）', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/251/400/300' },
  // === JR東海 ===
  { title: '315系', nameKanji: '315系', nameKana: 'さんいちごけい', nameEnglish: '315 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR東海', route: '中央線・東海道線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/315/400/300' },
  { title: '313系0番台', nameKanji: '313系0番台', nameKana: 'さんいちさんけいぜろばんだい', nameEnglish: '313 Series 0', hasRidden: false, trainType: '通勤', railwayCompany: 'JR東海', route: '東海道線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/3130/400/300' },
  { title: '313系1000番台', nameKanji: '313系1000番台', nameKana: 'さんいちさんけいせんばんだい', nameEnglish: '313 Series 1000', hasRidden: false, trainType: '通勤', railwayCompany: 'JR東海', route: '中央線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/3131000/400/300' },
  { title: '313系5000番台', nameKanji: '313系5000番台', nameKana: 'さんいちさんけいごせんばんだい', nameEnglish: '313 Series 5000', hasRidden: false, trainType: '通勤', railwayCompany: 'JR東海', route: '新快速', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/3135000/400/300' },
  { title: '311系', nameKanji: '311系', nameKana: 'さんいちいちけい', nameEnglish: '311 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR東海', route: '東海道線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/311/400/300' },
  { title: 'HC85系', nameKanji: 'HC85系', nameKana: 'えいちしーはちごけい', nameEnglish: 'HC85 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR東海', route: 'ひだ・南紀', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hc85/400/300' },
  { title: '383系', nameKanji: '383系', nameKana: 'さんはちさんけい', nameEnglish: '383 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR東海', route: 'しなの', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/383/400/300' },
  // === JR西日本 ===
  { title: '225系', nameKanji: '225系', nameKana: 'にーにーごけい', nameEnglish: '225 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR西日本', route: '新快速・関空快速', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/225/400/300' },
  { title: '223系', nameKanji: '223系', nameKana: 'にーにーさんけい', nameEnglish: '223 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR西日本', route: '新快速', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/223/400/300' },
  { title: '221系', nameKanji: '221系', nameKana: 'にーにーいちけい', nameEnglish: '221 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR西日本', route: '大和路線・関西本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/221/400/300' },
  { title: '227系', nameKanji: '227系', nameKana: 'にーにーななけい', nameEnglish: '227 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR西日本', route: '広島地区', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/227/400/300' },
  { title: '323系', nameKanji: '323系', nameKana: 'さんにーさんけい', nameEnglish: '323 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR西日本', route: '大阪環状線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/323/400/300' },
  { title: '321系', nameKanji: '321系', nameKana: 'さんにーいちけい', nameEnglish: '321 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR西日本', route: 'JR京都線・JR神戸線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/321/400/300' },
  { title: '207系', nameKanji: '207系', nameKana: 'にーまるななけい', nameEnglish: '207 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR西日本', route: 'JR東西線・学研都市線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/207/400/300' },
  { title: '683系', nameKanji: '683系', nameKana: 'ろくはちさんけい', nameEnglish: '683 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR西日本', route: 'サンダーバード・しらさぎ', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/683/400/300' },
  { title: '681系', nameKanji: '681系', nameKana: 'ろくはちいちけい', nameEnglish: '681 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR西日本', route: 'サンダーバード', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/681/400/300' },
  { title: '287系', nameKanji: '287系', nameKana: 'にーはちななけい', nameEnglish: '287 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR西日本', route: 'くろしお・こうのとり', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/287/400/300' },
  { title: '271系', nameKanji: '271系', nameKana: 'にーなないちけい', nameEnglish: '271 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR西日本', route: 'はるか', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/271/400/300' },
  // === JR九州 ===
  { title: '813系', nameKanji: '813系', nameKana: 'はちいちさんけい', nameEnglish: '813 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR九州', route: '鹿児島本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/813/400/300' },
  { title: '815系', nameKanji: '815系', nameKana: 'はちいちごけい', nameEnglish: '815 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR九州', route: '鹿児島本線・日豊本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/815/400/300' },
  { title: '817系', nameKanji: '817系', nameKana: 'はちいちななけい', nameEnglish: '817 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR九州', route: '長崎本線・佐世保線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/817/400/300' },
  { title: '821系', nameKanji: '821系', nameKana: 'はちにーいちけい', nameEnglish: '821 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR九州', route: '鹿児島本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/821/400/300' },
  { title: '883系', nameKanji: '883系', nameKana: 'はちはちさんけい', nameEnglish: '883 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR九州', route: 'ソニック', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/883/400/300' },
  { title: '885系', nameKanji: '885系', nameKana: 'はちはちごけい', nameEnglish: '885 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR九州', route: 'ソニック・かもめ', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/885/400/300' },
  { title: '787系', nameKanji: '787系', nameKana: 'ななはちななけい', nameEnglish: '787 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR九州', route: 'かもめ・にちりん', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/787/400/300' },
  // === JR北海道 ===
  { title: '733系', nameKanji: '733系', nameKana: 'ななさんさんけい', nameEnglish: '733 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR北海道', route: '札幌圏', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/733/400/300' },
  { title: '731系', nameKanji: '731系', nameKana: 'ななさんいちけい', nameEnglish: '731 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR北海道', route: '札幌圏', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/731/400/300' },
  { title: '721系', nameKanji: '721系', nameKana: 'ななにーいちけい', nameEnglish: '721 Series', hasRidden: false, trainType: '通勤', railwayCompany: 'JR北海道', route: '札幌圏', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/721/400/300' },
  { title: '789系', nameKanji: '789系', nameKana: 'ななはちきゅうけい', nameEnglish: '789 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR北海道', route: 'ライラック・カムイ', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/789/400/300' },
  { title: '261系', nameKanji: '261系', nameKana: 'にーろくいちけい', nameEnglish: '261 Series', hasRidden: false, trainType: '特急', railwayCompany: 'JR北海道', route: '北斗・おおぞら・とかち', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/261/400/300' },
  // === 東京メトロ ===
  { title: '1000系', nameKanji: '1000系', nameKana: 'せんけい', nameEnglish: '1000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '銀座線', rating: 4, impression: '日本最古の地下鉄。黄色い車体が特徴。', thumbImage: 'https://picsum.photos/seed/metro1000/400/300' },
  { title: '2000系', nameKanji: '2000系', nameKana: 'にせんけい', nameEnglish: '2000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '丸ノ内線', rating: 4, impression: '赤い車体の丸ノ内線。', thumbImage: 'https://picsum.photos/seed/metro2000/400/300' },
  { title: '02系', nameKanji: '02系', nameKana: 'ぜろにけい', nameEnglish: '02 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '丸ノ内線（引退中）', rating: 3, impression: '丸ノ内線の旧型車両。', thumbImage: 'https://picsum.photos/seed/metro02/400/300' },
  { title: '03系', nameKanji: '03系', nameKana: 'ぜろさんけい', nameEnglish: '03 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '日比谷線（引退）', rating: 3, impression: '日比谷線の旧型車両。', thumbImage: 'https://picsum.photos/seed/metro03/400/300' },
  { title: '13000系', nameKanji: '13000系', nameKana: 'いちまんさんぜんけい', nameEnglish: '13000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '日比谷線', rating: 4, impression: '日比谷線の新型。', thumbImage: 'https://picsum.photos/seed/metro13000/400/300' },
  { title: '05系', nameKanji: '05系', nameKana: 'ぜろごけい', nameEnglish: '05 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '東西線', rating: 3, impression: '東西線の主力車両。', thumbImage: 'https://picsum.photos/seed/metro05/400/300' },
  { title: '15000系', nameKanji: '15000系', nameKana: 'いちまんごせんけい', nameEnglish: '15000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '東西線', rating: 4, impression: 'ワイドドアが特徴。', thumbImage: 'https://picsum.photos/seed/metro15000/400/300' },
  { title: '16000系', nameKanji: '16000系', nameKana: 'いちまんろくせんけい', nameEnglish: '16000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '千代田線', rating: 4, impression: '小田急・JR直通。', thumbImage: 'https://picsum.photos/seed/metro16000/400/300' },
  { title: '10000系', nameKanji: '10000系', nameKana: 'いちまんけい', nameEnglish: '10000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '有楽町線・副都心線', rating: 4, impression: '有楽町線の主力。', thumbImage: 'https://picsum.photos/seed/metro10000/400/300' },
  { title: '17000系', nameKanji: '17000系', nameKana: 'いちまんななせんけい', nameEnglish: '17000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '有楽町線・副都心線', rating: 4, impression: '新型車両。', thumbImage: 'https://picsum.photos/seed/metro17000/400/300' },
  { title: '08系', nameKanji: '08系', nameKana: 'ぜろはちけい', nameEnglish: '08 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '半蔵門線', rating: 3, impression: '半蔵門線の車両。', thumbImage: 'https://picsum.photos/seed/metro08/400/300' },
  { title: '18000系', nameKanji: '18000系', nameKana: 'いちまんはっせんけい', nameEnglish: '18000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '半蔵門線', rating: 4, impression: '半蔵門線の新型。', thumbImage: 'https://picsum.photos/seed/metro18000/400/300' },
  { title: '9000系', nameKanji: '9000系', nameKana: 'きゅうせんけい', nameEnglish: '9000 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '東京メトロ', route: '南北線', rating: 4, impression: '南北線の車両。', thumbImage: 'https://picsum.photos/seed/metro9000/400/300' },
  // === 都営地下鉄 ===
  { title: '5500形', nameKanji: '5500形', nameKana: 'ごせんごひゃくがた', nameEnglish: '5500 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '都営地下鉄', route: '浅草線', rating: 4, impression: '浅草線の新型。', thumbImage: 'https://picsum.photos/seed/toei5500/400/300' },
  { title: '6500形', nameKanji: '6500形', nameKana: 'ろくせんごひゃくがた', nameEnglish: '6500 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '都営地下鉄', route: '三田線', rating: 4, impression: '三田線の新型。8両編成。', thumbImage: 'https://picsum.photos/seed/toei6500/400/300' },
  { title: '6300形', nameKanji: '6300形', nameKana: 'ろくせんさんびゃくがた', nameEnglish: '6300 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '都営地下鉄', route: '三田線', rating: 3, impression: '三田線の旧型。', thumbImage: 'https://picsum.photos/seed/toei6300/400/300' },
  { title: '10-300形', nameKanji: '10-300形', nameKana: 'じゅうのさんびゃくがた', nameEnglish: '10-300 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '都営地下鉄', route: '新宿線', rating: 4, impression: '新宿線の車両。', thumbImage: 'https://picsum.photos/seed/toei10300/400/300' },
  { title: '12-600形', nameKanji: '12-600形', nameKana: 'じゅうにのろっぴゃくがた', nameEnglish: '12-600 Series', hasRidden: true, trainType: '地下鉄', railwayCompany: '都営地下鉄', route: '大江戸線', rating: 4, impression: '大江戸線の車両。リニア式。', thumbImage: 'https://picsum.photos/seed/toei12600/400/300' },
  // === 私鉄（小田急） ===
  { title: '70000形GSE', nameKanji: '70000形GSE', nameKana: 'ななまんがたじーえすいー', nameEnglish: '70000 Series GSE', hasRidden: true, trainType: '特急', railwayCompany: '小田急電鉄', route: 'ロマンスカー', rating: 5, impression: '展望席が最高。', thumbImage: 'https://picsum.photos/seed/gse/400/300' },
  { title: '60000形MSE', nameKanji: '60000形MSE', nameKana: 'ろくまんがたえむえすいー', nameEnglish: '60000 Series MSE', hasRidden: true, trainType: '特急', railwayCompany: '小田急電鉄', route: 'ロマンスカー', rating: 4, impression: '地下鉄直通可能。', thumbImage: 'https://picsum.photos/seed/mse/400/300' },
  { title: '30000形EXE', nameKanji: '30000形EXE', nameKana: 'さんまんがたいーえっくすいー', nameEnglish: '30000 Series EXE', hasRidden: true, trainType: '特急', railwayCompany: '小田急電鉄', route: 'ロマンスカー', rating: 3, impression: 'ビジネス向け。', thumbImage: 'https://picsum.photos/seed/exe/400/300' },
  { title: '5000形', nameKanji: '5000形', nameKana: 'ごせんがた', nameEnglish: '5000 Series', hasRidden: true, trainType: '通勤', railwayCompany: '小田急電鉄', route: '小田急線', rating: 4, impression: '最新型通勤車両。', thumbImage: 'https://picsum.photos/seed/odakyu5000/400/300' },
  { title: '4000形', nameKanji: '4000形', nameKana: 'よんせんがた', nameEnglish: '4000 Series', hasRidden: true, trainType: '通勤', railwayCompany: '小田急電鉄', route: '小田急線', rating: 4, impression: '地下鉄千代田線直通。', thumbImage: 'https://picsum.photos/seed/odakyu4000/400/300' },
  { title: '3000形', nameKanji: '3000形', nameKana: 'さんぜんがた', nameEnglish: '3000 Series', hasRidden: true, trainType: '通勤', railwayCompany: '小田急電鉄', route: '小田急線', rating: 3, impression: '小田急の主力車両。', thumbImage: 'https://picsum.photos/seed/odakyu3000/400/300' },
  // === 私鉄（京急） ===
  { title: '2100形', nameKanji: '2100形', nameKana: 'にせんひゃくがた', nameEnglish: '2100 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京浜急行電鉄', route: '京急本線', rating: 4, impression: '2ドアクロスシート。', thumbImage: 'https://picsum.photos/seed/keikyu2100/400/300' },
  { title: '1000形', nameKanji: '1000形', nameKana: 'せんがた', nameEnglish: '1000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京浜急行電鉄', route: '京急本線', rating: 4, impression: '京急の主力車両。', thumbImage: 'https://picsum.photos/seed/keikyu1000/400/300' },
  { title: '1500形', nameKanji: '1500形', nameKana: 'せんごひゃくがた', nameEnglish: '1500 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京浜急行電鉄', route: '京急本線', rating: 3, impression: '旧型車両。', thumbImage: 'https://picsum.photos/seed/keikyu1500/400/300' },
  { title: '600形', nameKanji: '600形', nameKana: 'ろっぴゃくがた', nameEnglish: '600 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京浜急行電鉄', route: '京急本線', rating: 3, impression: 'ブルースカイトレイン。', thumbImage: 'https://picsum.photos/seed/keikyu600/400/300' },
  // === 私鉄（東急） ===
  { title: '5050系', nameKanji: '5050系', nameKana: 'ごせんごじゅうけい', nameEnglish: '5050 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '東急電鉄', route: '東横線', rating: 4, impression: '東横線の主力。', thumbImage: 'https://picsum.photos/seed/tokyu5050/400/300' },
  { title: '2020系', nameKanji: '2020系', nameKana: 'にせんにじゅうけい', nameEnglish: '2020 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '東急電鉄', route: '田園都市線', rating: 4, impression: '田園都市線の新型。', thumbImage: 'https://picsum.photos/seed/tokyu2020/400/300' },
  { title: '3020系', nameKanji: '3020系', nameKana: 'さんぜんにじゅうけい', nameEnglish: '3020 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '東急電鉄', route: '目黒線', rating: 4, impression: '目黒線の新型。', thumbImage: 'https://picsum.photos/seed/tokyu3020/400/300' },
  { title: '5080系', nameKanji: '5080系', nameKana: 'ごせんはちじゅうけい', nameEnglish: '5080 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '東急電鉄', route: '目黒線', rating: 3, impression: '目黒線の車両。', thumbImage: 'https://picsum.photos/seed/tokyu5080/400/300' },
  { title: '7000系', nameKanji: '7000系', nameKana: 'ななせんけい', nameEnglish: '7000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '東急電鉄', route: '池上線・東急多摩川線', rating: 3, impression: '緑の車体。', thumbImage: 'https://picsum.photos/seed/tokyu7000/400/300' },
  // === 私鉄（京王） ===
  { title: '5000系', nameKanji: '5000系', nameKana: 'ごせんけい', nameEnglish: '5000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京王電鉄', route: '京王線', rating: 4, impression: '座席指定列車にも使用。', thumbImage: 'https://picsum.photos/seed/keio5000/400/300' },
  { title: '9000系', nameKanji: '9000系', nameKana: 'きゅうせんけい', nameEnglish: '9000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京王電鉄', route: '京王線', rating: 4, impression: '都営新宿線直通。', thumbImage: 'https://picsum.photos/seed/keio9000/400/300' },
  { title: '8000系', nameKanji: '8000系', nameKana: 'はっせんけい', nameEnglish: '8000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京王電鉄', route: '京王線', rating: 3, impression: '京王の主力車両。', thumbImage: 'https://picsum.photos/seed/keio8000/400/300' },
  { title: '7000系', nameKanji: '7000系', nameKana: 'ななせんけい', nameEnglish: '7000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京王電鉄', route: '京王線', rating: 3, impression: '旧型車両。', thumbImage: 'https://picsum.photos/seed/keio7000/400/300' },
  { title: '1000系', nameKanji: '1000系', nameKana: 'せんけい', nameEnglish: '1000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '京王電鉄', route: '井の頭線', rating: 4, impression: 'カラフルな車体。', thumbImage: 'https://picsum.photos/seed/keio1000/400/300' },
  // === 私鉄（西武） ===
  { title: '40000系', nameKanji: '40000系', nameKana: 'よんまんけい', nameEnglish: '40000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '西武鉄道', route: '西武池袋線・新宿線', rating: 4, impression: 'S-TRAIN用車両。', thumbImage: 'https://picsum.photos/seed/seibu40000/400/300' },
  { title: '30000系', nameKanji: '30000系', nameKana: 'さんまんけい', nameEnglish: '30000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '西武鉄道', route: '西武池袋線・新宿線', rating: 4, impression: 'スマイルトレイン。', thumbImage: 'https://picsum.photos/seed/seibu30000/400/300' },
  { title: '6000系', nameKanji: '6000系', nameKana: 'ろくせんけい', nameEnglish: '6000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '西武鉄道', route: '西武池袋線', rating: 3, impression: '地下鉄直通車両。', thumbImage: 'https://picsum.photos/seed/seibu6000/400/300' },
  { title: '001系 Laview', nameKanji: '001系 Laview', nameKana: 'ぜろぜろいちけいらびゅー', nameEnglish: '001 Series Laview', hasRidden: false, trainType: '特急', railwayCompany: '西武鉄道', route: '西武池袋線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/laview/400/300' },
  // === 私鉄（東武） ===
  { title: '50000系', nameKanji: '50000系', nameKana: 'ごまんけい', nameEnglish: '50000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '東武鉄道', route: '東武東上線', rating: 4, impression: '東武の新型車両。', thumbImage: 'https://picsum.photos/seed/tobu50000/400/300' },
  { title: '50090系 TJライナー', nameKanji: '50090系', nameKana: 'ごまんきゅうじゅうけい', nameEnglish: '50090 Series TJ Liner', hasRidden: false, trainType: '私鉄', railwayCompany: '東武鉄道', route: '東武東上線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/tjliner/400/300' },
  { title: '100系 スペーシア', nameKanji: '100系スペーシア', nameKana: 'ひゃっけいすぺーしあ', nameEnglish: '100 Series Spacia', hasRidden: false, trainType: '特急', railwayCompany: '東武鉄道', route: '日光・鬼怒川方面', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/spacia/400/300' },
  { title: 'N100系 スペーシアX', nameKanji: 'N100系スペーシアX', nameKana: 'えぬひゃっけいすぺーしあえっくす', nameEnglish: 'N100 Series Spacia X', hasRidden: false, trainType: '特急', railwayCompany: '東武鉄道', route: '日光・鬼怒川方面', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/spaciax/400/300' },
  { title: '500系 リバティ', nameKanji: '500系リバティ', nameKana: 'ごひゃくけいりばてぃ', nameEnglish: '500 Series Revaty', hasRidden: false, trainType: '特急', railwayCompany: '東武鉄道', route: '日光・鬼怒川方面', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/revaty/400/300' },
  // === 私鉄（近鉄） ===
  { title: '80000系 ひのとり', nameKanji: '80000系ひのとり', nameKana: 'はちまんけいひのとり', nameEnglish: '80000 Series Hinotori', hasRidden: false, trainType: '特急', railwayCompany: '近畿日本鉄道', route: '大阪-名古屋', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hinotori/400/300' },
  { title: '50000系 しまかぜ', nameKanji: '50000系しまかぜ', nameKana: 'ごまんけいしまかぜ', nameEnglish: '50000 Series Shimakaze', hasRidden: false, trainType: '特急', railwayCompany: '近畿日本鉄道', route: '大阪・京都・名古屋-賢島', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/shimakaze/400/300' },
  { title: '21020系 アーバンライナーnext', nameKanji: '21020系', nameKana: 'にまんせんにじゅうけい', nameEnglish: '21020 Series Urban Liner Next', hasRidden: false, trainType: '特急', railwayCompany: '近畿日本鉄道', route: '大阪-名古屋', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/urbanliner/400/300' },
  { title: '9820系', nameKanji: '9820系', nameKana: 'きゅうせんはっぴゃくにじゅうけい', nameEnglish: '9820 Series', hasRidden: false, trainType: '通勤', railwayCompany: '近畿日本鉄道', route: '奈良線・大阪線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/kintetsu9820/400/300' },
  // === 私鉄（阪急） ===
  { title: '9300系', nameKanji: '9300系', nameKana: 'きゅうせんさんびゃくけい', nameEnglish: '9300 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '阪急電鉄', route: '京都線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hankyu9300/400/300' },
  { title: '9000系', nameKanji: '9000系', nameKana: 'きゅうせんけい', nameEnglish: '9000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '阪急電鉄', route: '神戸線・宝塚線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hankyu9000/400/300' },
  { title: '1000系', nameKanji: '1000系', nameKana: 'せんけい', nameEnglish: '1000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '阪急電鉄', route: '神戸線・宝塚線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hankyu1000/400/300' },
  { title: '8000系', nameKanji: '8000系', nameKana: 'はっせんけい', nameEnglish: '8000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '阪急電鉄', route: '全線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hankyu8000/400/300' },
  // === 私鉄（阪神） ===
  { title: '5700系', nameKanji: '5700系', nameKana: 'ごせんななひゃくけい', nameEnglish: '5700 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '阪神電気鉄道', route: '本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hanshin5700/400/300' },
  { title: '8000系', nameKanji: '8000系', nameKana: 'はっせんけい', nameEnglish: '8000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '阪神電気鉄道', route: '本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hanshin8000/400/300' },
  { title: '1000系', nameKanji: '1000系', nameKana: 'せんけい', nameEnglish: '1000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '阪神電気鉄道', route: '本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/hanshin1000/400/300' },
  // === 私鉄（南海） ===
  { title: '8300系', nameKanji: '8300系', nameKana: 'はっせんさんびゃくけい', nameEnglish: '8300 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '南海電気鉄道', route: '南海本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/nankai8300/400/300' },
  { title: '50000系 ラピート', nameKanji: '50000系ラピート', nameKana: 'ごまんけいらぴーと', nameEnglish: '50000 Series Rapi:t', hasRidden: false, trainType: '特急', railwayCompany: '南海電気鉄道', route: '関西空港アクセス', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/rapit/400/300' },
  { title: '2000系 こうや', nameKanji: '2000系', nameKana: 'にせんけい', nameEnglish: '2000 Series', hasRidden: false, trainType: '通勤', railwayCompany: '南海電気鉄道', route: '高野線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/nankai2000/400/300' },
  // === 私鉄（京阪） ===
  { title: '8000系', nameKanji: '8000系', nameKana: 'はっせんけい', nameEnglish: '8000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '京阪電気鉄道', route: '京阪本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/keihan8000/400/300' },
  { title: '3000系', nameKanji: '3000系', nameKana: 'さんぜんけい', nameEnglish: '3000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '京阪電気鉄道', route: '京阪本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/keihan3000/400/300' },
  { title: '13000系', nameKanji: '13000系', nameKana: 'いちまんさんぜんけい', nameEnglish: '13000 Series', hasRidden: false, trainType: '私鉄', railwayCompany: '京阪電気鉄道', route: '京阪本線', rating: 0, impression: '', thumbImage: 'https://picsum.photos/seed/keihan13000/400/300' },
  // === 相鉄 ===
  { title: '20000系', nameKanji: '20000系', nameKana: 'にまんけい', nameEnglish: '20000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '相模鉄道', route: 'JR・東急直通', rating: 4, impression: 'ネイビーブルーが特徴。', thumbImage: 'https://picsum.photos/seed/sotetsu20000/400/300' },
  { title: '21000系', nameKanji: '21000系', nameKana: 'にまんいっせんけい', nameEnglish: '21000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '相模鉄道', route: '東急直通', rating: 4, impression: '東急直通専用。', thumbImage: 'https://picsum.photos/seed/sotetsu21000/400/300' },
  { title: '12000系', nameKanji: '12000系', nameKana: 'いちまんにせんけい', nameEnglish: '12000 Series', hasRidden: true, trainType: '私鉄', railwayCompany: '相模鉄道', route: 'JR直通', rating: 4, impression: 'JR直通専用。', thumbImage: 'https://picsum.photos/seed/sotetsu12000/400/300' },
];

// Fish category fields
const fishFields = [
  { id: uuidv4(), name: 'nameKanji', label: '名前（漢字）', type: 'text', required: false, order: 1 },
  { id: uuidv4(), name: 'nameKana', label: '名前（かな）', type: 'text', required: false, order: 2 },
  { id: uuidv4(), name: 'nameEnglish', label: 'English Name', type: 'text', required: false, order: 3 },
  { id: uuidv4(), name: 'scientificName', label: '学名 / Scientific Name', type: 'text', required: false, order: 4 },
  { id: uuidv4(), name: 'typicalSize', label: 'サイズ / Size', type: 'text', required: false, order: 5 },
  { id: uuidv4(), name: 'descriptionJa', label: '説明（日本語）', type: 'textarea', required: false, order: 6 },
  { id: uuidv4(), name: 'descriptionEn', label: 'Description (English)', type: 'textarea', required: false, order: 7 },
  { id: uuidv4(), name: 'hasEaten', label: '食べたことある', type: 'boolean', required: false, order: 8 },
  { id: uuidv4(), name: 'taste', label: '味の感想', type: 'textarea', required: false, order: 9 },
  { id: uuidv4(), name: 'favoritePreparation', label: 'おすすめの食べ方', type: 'select', required: false, options: ['刺身', '寿司', '焼き', '煮付け', 'フライ', '天ぷら', 'その他'], order: 10 },
  { id: uuidv4(), name: 'rating', label: '評価', type: 'rating', required: false, order: 11 },
  { id: uuidv4(), name: 'season', label: '旬の季節', type: 'select', required: false, options: ['春', '夏', '秋', '冬', '通年'], order: 12 },
];

// Train category fields
const trainFields = [
  { id: uuidv4(), name: 'nameKanji', label: '列車名（漢字）', type: 'text', required: false, order: 1 },
  { id: uuidv4(), name: 'nameKana', label: '列車名（かな）', type: 'text', required: false, order: 2 },
  { id: uuidv4(), name: 'nameEnglish', label: 'English Name', type: 'text', required: false, order: 3 },
  { id: uuidv4(), name: 'hasRidden', label: '乗ったことある', type: 'boolean', required: false, order: 4 },
  { id: uuidv4(), name: 'trainType', label: '種別', type: 'select', required: false, options: ['新幹線', '特急', '急行', '快速', '普通', '地下鉄', '私鉄', 'その他'], order: 5 },
  { id: uuidv4(), name: 'railwayCompany', label: '鉄道会社', type: 'text', required: false, order: 6 },
  { id: uuidv4(), name: 'route', label: '路線', type: 'text', required: false, order: 7 },
  { id: uuidv4(), name: 'rating', label: '評価', type: 'rating', required: false, order: 8 },
  { id: uuidv4(), name: 'impression', label: '感想', type: 'textarea', required: false, order: 9 },
];

async function seedHobbies() {
  console.log('Starting hobby seed...\n');

  try {
    // Check if hobbies already exist
    const existingHobbies = await db.collection(HOBBIES_COLLECTION).get();
    if (!existingHobbies.empty) {
      console.log('⚠️  Hobbies collection is not empty.');
      console.log('   Existing hobbies:', existingHobbies.docs.map(d => d.data().name).join(', '));
      console.log('\n   Options:');
      console.log('   [d] Delete existing data and re-seed (recommended)');
      console.log('   [s] Skip - exit without changes');
      console.log('   [a] Add anyway (will create duplicates!)');

      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const answer = await new Promise<string>((resolve) => {
        rl.question('\n   Choose option (d/s/a): ', resolve);
      });
      rl.close();

      const choice = answer.toLowerCase();

      if (choice === 's' || choice === '') {
        console.log('\n   Skipping seed. Exiting.');
        process.exit(0);
      }

      if (choice === 'd') {
        console.log('\n   Deleting existing data...');

        // Delete all hobby items first
        const existingItems = await db.collection(HOBBY_ITEMS_COLLECTION).get();
        const itemBatch = db.batch();
        existingItems.docs.forEach((doc) => {
          itemBatch.delete(doc.ref);
        });
        await itemBatch.commit();
        console.log(`   ✓ Deleted ${existingItems.size} hobby items`);

        // Delete all hobbies
        const hobbyBatch = db.batch();
        existingHobbies.docs.forEach((doc) => {
          hobbyBatch.delete(doc.ref);
        });
        await hobbyBatch.commit();
        console.log(`   ✓ Deleted ${existingHobbies.size} hobbies`);
        console.log('');
      } else if (choice !== 'a') {
        console.log('\n   Invalid option. Exiting.');
        process.exit(0);
      }
    }

    // Create Fish category
    console.log('Creating Fish category (魚図鑑)...');
    const fishCategoryRef = await db.collection(HOBBIES_COLLECTION).add({
      name: '魚図鑑',
      slug: 'fish',
      description: '食べた魚のコレクション - 日本語名と英語名付き',
      icon: 'fish',
      coverImage: 'https://picsum.photos/seed/fishcover/800/400',
      templateType: 'catalog',
      isPublic: true,
      order: 1,
      fields: fishFields,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`   ✓ Created Fish category: ${fishCategoryRef.id}`);

    // Create Train category
    console.log('Creating Train category (日本の鉄道)...');
    const trainCategoryRef = await db.collection(HOBBIES_COLLECTION).add({
      name: '日本の鉄道',
      slug: 'trains',
      description: '乗った日本の列車のコレクション',
      icon: 'train',
      coverImage: 'https://picsum.photos/seed/traincover/800/400',
      templateType: 'catalog',
      isPublic: true,
      order: 2,
      fields: trainFields,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`   ✓ Created Train category: ${trainCategoryRef.id}`);

    // Add fish items
    console.log('\nAdding fish items...');
    for (let i = 0; i < fishData.length; i++) {
      const fish = fishData[i];
      await db.collection(HOBBY_ITEMS_COLLECTION).add({
        hobbyId: fishCategoryRef.id,
        title: fish.title,
        description: fish.descriptionJa, // Use Japanese description as default
        images: [fish.thumbImage],
        thumbImage: fish.thumbImage,
        isPublic: true,
        order: i + 1,
        tags: [fish.season, fish.favoritePreparation].filter(Boolean),
        customFields: {
          nameKanji: fish.nameKanji,
          nameKana: fish.nameKana,
          nameEnglish: fish.nameEnglish,
          scientificName: fish.scientificName,
          typicalSize: fish.typicalSize,
          descriptionJa: fish.descriptionJa,
          descriptionEn: fish.descriptionEn,
          hasEaten: fish.hasEaten,
          taste: fish.taste,
          favoritePreparation: fish.favoritePreparation,
          rating: fish.rating,
          season: fish.season,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`   ✓ Added: ${fish.title} (${fish.nameEnglish})`);
    }

    // Add train items
    console.log('\nAdding train items...');
    for (let i = 0; i < trainData.length; i++) {
      const train = trainData[i];
      await db.collection(HOBBY_ITEMS_COLLECTION).add({
        hobbyId: trainCategoryRef.id,
        title: train.title,
        description: train.impression || `${train.railwayCompany}の${train.trainType}`,
        images: [train.thumbImage],
        thumbImage: train.thumbImage,
        isPublic: true,
        order: i + 1,
        tags: [train.trainType, train.railwayCompany].filter(Boolean),
        customFields: {
          nameKanji: train.nameKanji,
          nameKana: train.nameKana,
          nameEnglish: train.nameEnglish,
          hasRidden: train.hasRidden,
          trainType: train.trainType,
          railwayCompany: train.railwayCompany,
          route: train.route,
          rating: train.rating,
          impression: train.impression,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`   ✓ Added: ${train.title}`);
    }

    console.log('\n✅ Seed completed successfully!');
    console.log(`   - ${fishData.length} fish items added`);
    console.log(`   - ${trainData.length} train items added`);
    console.log('\n   Visit /hobbies to see the results!');

  } catch (error) {
    console.error('Error seeding hobbies:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the seed
seedHobbies();
