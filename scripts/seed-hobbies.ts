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

// Japanese train data - using placeholder images initially
// Users can upload real images through the admin interface
const trainData = [
  {
    title: '東海道新幹線 N700S',
    nameKanji: '東海道新幹線',
    nameKana: 'とうかいどうしんかんせん',
    nameEnglish: 'Tokaido Shinkansen N700S',
    hasRidden: true,
    trainType: '新幹線',
    railwayCompany: 'JR東海',
    route: '東海道新幹線',
    rating: 5,
    impression: '最新鋭の新幹線。静かで快適、東京-大阪間があっという間。',
    thumbImage: 'https://picsum.photos/seed/n700s/400/300',
  },
  {
    title: '北陸新幹線 E7系',
    nameKanji: '北陸新幹線',
    nameKana: 'ほくりくしんかんせん',
    nameEnglish: 'Hokuriku Shinkansen E7',
    hasRidden: true,
    trainType: '新幹線',
    railwayCompany: 'JR東日本・JR西日本',
    route: '北陸新幹線',
    rating: 5,
    impression: '金沢まで一本で行ける便利な路線。車内も広くて快適。',
    thumbImage: 'https://picsum.photos/seed/e7/400/300',
  },
  {
    title: '東北新幹線 E5系 はやぶさ',
    nameKanji: '東北新幹線',
    nameKana: 'とうほくしんかんせん',
    nameEnglish: 'Tohoku Shinkansen Hayabusa',
    hasRidden: true,
    trainType: '新幹線',
    railwayCompany: 'JR東日本',
    route: '東北新幹線',
    rating: 5,
    impression: '320km/hの高速走行。グリーンの車体がカッコいい。',
    thumbImage: 'https://picsum.photos/seed/hayabusa/400/300',
  },
  {
    title: '山手線 E235系',
    nameKanji: '山手線',
    nameKana: 'やまのてせん',
    nameEnglish: 'Yamanote Line E235',
    hasRidden: true,
    trainType: '普通',
    railwayCompany: 'JR東日本',
    route: '山手線',
    rating: 4,
    impression: '東京の象徴的な環状線。最新型は液晶画面が多くて便利。',
    thumbImage: 'https://picsum.photos/seed/yamanote/400/300',
  },
  {
    title: 'ロマンスカー GSE',
    nameKanji: 'ロマンスカー',
    nameKana: 'ろまんすかー',
    nameEnglish: 'Odakyu Romancecar GSE',
    hasRidden: true,
    trainType: '特急',
    railwayCompany: '小田急電鉄',
    route: '小田急線',
    rating: 5,
    impression: '展望席からの眺めが最高。箱根観光の定番。',
    thumbImage: 'https://picsum.photos/seed/romancecar/400/300',
  },
  {
    title: '特急 サンダーバード',
    nameKanji: 'サンダーバード',
    nameKana: 'さんだーばーど',
    nameEnglish: 'Limited Express Thunderbird',
    hasRidden: false,
    trainType: '特急',
    railwayCompany: 'JR西日本',
    route: '北陸本線',
    rating: 0,
    impression: '',
    thumbImage: 'https://picsum.photos/seed/thunderbird/400/300',
  },
  {
    title: '東京メトロ 銀座線',
    nameKanji: '銀座線',
    nameKana: 'ぎんざせん',
    nameEnglish: 'Tokyo Metro Ginza Line',
    hasRidden: true,
    trainType: '地下鉄',
    railwayCompany: '東京メトロ',
    route: '銀座線',
    rating: 4,
    impression: '日本最古の地下鉄。黄色い車体が特徴的。',
    thumbImage: 'https://picsum.photos/seed/ginza/400/300',
  },
  {
    title: 'サフィール踊り子',
    nameKanji: 'サフィール踊り子',
    nameKana: 'さふぃーるおどりこ',
    nameEnglish: 'Saphir Odoriko',
    hasRidden: false,
    trainType: '特急',
    railwayCompany: 'JR東日本',
    route: '伊東線・伊豆急行線',
    rating: 0,
    impression: '',
    thumbImage: 'https://picsum.photos/seed/saphir/400/300',
  },
  {
    title: '近鉄特急 ひのとり',
    nameKanji: 'ひのとり',
    nameKana: 'ひのとり',
    nameEnglish: 'Kintetsu Hinotori',
    hasRidden: false,
    trainType: '特急',
    railwayCompany: '近畿日本鉄道',
    route: '大阪-名古屋',
    rating: 0,
    impression: '',
    thumbImage: 'https://picsum.photos/seed/hinotori/400/300',
  },
  {
    title: '成田エクスプレス',
    nameKanji: '成田エクスプレス',
    nameKana: 'なりたえくすぷれす',
    nameEnglish: 'Narita Express',
    hasRidden: true,
    trainType: '特急',
    railwayCompany: 'JR東日本',
    route: '成田空港アクセス',
    rating: 4,
    impression: '空港アクセスに便利。赤と白の車体が目印。',
    thumbImage: 'https://picsum.photos/seed/nex/400/300',
  },
  {
    title: '京急 2100形',
    nameKanji: '京急電鉄',
    nameKana: 'けいきゅうでんてつ',
    nameEnglish: 'Keikyu 2100 Series',
    hasRidden: true,
    trainType: '私鉄',
    railwayCompany: '京浜急行電鉄',
    route: '京急本線',
    rating: 4,
    impression: '赤い車体が特徴的。羽田空港へのアクセスに便利。',
    thumbImage: 'https://picsum.photos/seed/keikyu/400/300',
  },
  {
    title: '九州新幹線 800系 つばめ',
    nameKanji: '九州新幹線',
    nameKana: 'きゅうしゅうしんかんせん',
    nameEnglish: 'Kyushu Shinkansen Tsubame',
    hasRidden: false,
    trainType: '新幹線',
    railwayCompany: 'JR九州',
    route: '九州新幹線',
    rating: 0,
    impression: '',
    thumbImage: 'https://picsum.photos/seed/tsubame/400/300',
  },
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
      console.log('\n   To re-seed, delete existing data first or skip this step.');

      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const answer = await new Promise<string>((resolve) => {
        rl.question('\n   Continue anyway? (y/N): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log('\n   Skipping seed. Exiting.');
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
