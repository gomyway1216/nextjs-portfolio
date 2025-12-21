/**
 * Create TV Shows hobby category and sample data
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';

const TV_SHOW_FIELDS = [
  { id: uuidv4(), name: 'nameKanji', label: '番組名', type: 'text', required: false, order: 1 },
  { id: uuidv4(), name: 'nameKana', label: '番組名（かな）', type: 'text', required: false, order: 2 },
  { id: uuidv4(), name: 'nameEnglish', label: 'English Name', type: 'text', required: false, order: 3 },
  { id: uuidv4(), name: 'score', label: 'スコア (0-10)', type: 'number', required: false, order: 4 },
  { id: uuidv4(), name: 'genre', label: 'ジャンル', type: 'select', required: false, order: 5, options: ['バラエティ', 'ドラマ', '特撮', '情報番組', '子供番組', 'その他'] },
  { id: uuidv4(), name: 'broadcaster', label: '放送局', type: 'text', required: false, order: 6 },
  { id: uuidv4(), name: 'yearStart', label: '放送開始年', type: 'number', required: false, order: 7 },
  { id: uuidv4(), name: 'yearEnd', label: '放送終了年', type: 'number', required: false, order: 8 },
  { id: uuidv4(), name: 'tvDescription', label: '説明', type: 'textarea', required: false, order: 9 },
];

interface TVShowData {
  nameKanji: string;
  nameKana: string;
  nameEnglish: string;
  score: number;
  genre: string;
  broadcaster: string;
  yearStart: number;
  yearEnd: number | null;
  tvDescription: string;
  tags: string[];
}

const TV_SHOWS: TVShowData[] = [
  {
    nameKanji: '水曜日のダウンタウン',
    nameKana: 'すいようびのだうんたうん',
    nameEnglish: 'Wednesday Downtown',
    score: 9.2,
    genre: 'バラエティ',
    broadcaster: 'TBS',
    yearStart: 2014,
    yearEnd: null,
    tvDescription: 'ダウンタウンの松本人志と浜田雅功がMCを務めるバラエティ番組。「○○説」を検証する企画が人気。クロちゃんやモンスターハウスなど話題の企画を多数生み出した。',
    tags: ['バラエティ', 'ダウンタウン', 'TBS'],
  },
  {
    nameKanji: 'トリビアの泉',
    nameKana: 'とりびあのいずみ',
    nameEnglish: 'Trivia no Izumi',
    score: 8.8,
    genre: 'バラエティ',
    broadcaster: 'フジテレビ',
    yearStart: 2002,
    yearEnd: 2006,
    tvDescription: '高橋克実とタモリが司会を務めた雑学バラエティ。「へぇ」ボタンで雑学を評価するシステムが社会現象に。「トリビアの種」コーナーも人気だった。',
    tags: ['バラエティ', '雑学', 'フジテレビ'],
  },
  {
    nameKanji: '家政婦のミタ',
    nameKana: 'かせいふのみた',
    nameEnglish: 'Kaseifu no Mita',
    score: 9.0,
    genre: 'ドラマ',
    broadcaster: '日本テレビ',
    yearStart: 2011,
    yearEnd: 2011,
    tvDescription: '松嶋菜々子主演のドラマ。無表情で「承知しました」が口癖の家政婦・三田灯が、崩壊した家族を再生させていく物語。最終回視聴率40%超えの大ヒット作。',
    tags: ['ドラマ', '松嶋菜々子', '日本テレビ'],
  },
  {
    nameKanji: 'エンタの神様',
    nameKana: 'えんたのかみさま',
    nameEnglish: 'Enta no Kamisama',
    score: 8.2,
    genre: 'バラエティ',
    broadcaster: '日本テレビ',
    yearStart: 2003,
    yearEnd: 2010,
    tvDescription: '若手お笑い芸人がネタを披露するお笑い番組。陣内智則、はんにゃ、オードリーなど多くの芸人を輩出した。福澤朗がMCを務めた。',
    tags: ['バラエティ', 'お笑い', '日本テレビ'],
  },
  {
    nameKanji: '毎度おさわがせします',
    nameKana: 'まいどおさわがせします',
    nameEnglish: 'Maido Osawagase Shimasu',
    score: 7.8,
    genre: 'ドラマ',
    broadcaster: 'TBS',
    yearStart: 1985,
    yearEnd: 1987,
    tvDescription: '中山美穂主演の青春学園ドラマ。高校生の恋愛や性の問題を扱い、当時としては過激な内容で話題に。木村一八も出演し人気を博した。',
    tags: ['ドラマ', '中山美穂', 'TBS', '80年代'],
  },
  {
    nameKanji: 'バカ殿様',
    nameKana: 'ばかとのさま',
    nameEnglish: 'Baka Tonosama',
    score: 8.5,
    genre: 'バラエティ',
    broadcaster: 'フジテレビ',
    yearStart: 1986,
    yearEnd: 2020,
    tvDescription: '志村けんが白塗りのバカ殿に扮するコントバラエティ。腰元役の女性タレントとの絡みや、変なおじさんなどのキャラクターが人気。志村けんの代表作の一つ。',
    tags: ['バラエティ', '志村けん', 'フジテレビ', 'コント'],
  },
  {
    nameKanji: 'SASUKE',
    nameKana: 'さすけ',
    nameEnglish: 'Sasuke (Ninja Warrior)',
    score: 8.7,
    genre: 'バラエティ',
    broadcaster: 'TBS',
    yearStart: 1997,
    yearEnd: null,
    tvDescription: '究極のアスレチック番組。4つのステージをクリアして完全制覇を目指す。山田勝己「ミスターSASUKE」など伝説の挑戦者を生み出した。世界でも「Ninja Warrior」として放送。',
    tags: ['バラエティ', 'スポーツ', 'TBS', 'アスレチック'],
  },
  {
    nameKanji: '志村どうぶつ園',
    nameKana: 'しむらどうぶつえん',
    nameEnglish: 'Shimura Zoo',
    score: 8.3,
    genre: 'バラエティ',
    broadcaster: '日本テレビ',
    yearStart: 2004,
    yearEnd: 2020,
    tvDescription: '志村けんがMCを務めた動物バラエティ。パンくんとジェームズの名コンビや、捨て犬・捨て猫の保護活動など心温まる企画が人気。志村けんの死去に伴い終了。',
    tags: ['バラエティ', '志村けん', '動物', '日本テレビ'],
  },
  {
    nameKanji: '不適切にもほどがある!',
    nameKana: 'ふてきせつにもほどがある',
    nameEnglish: 'Futekisetsu ni mo Hodo ga Aru!',
    score: 8.9,
    genre: 'ドラマ',
    broadcaster: 'TBS',
    yearStart: 2024,
    yearEnd: 2024,
    tvDescription: '阿部サダヲ主演。1986年から2024年にタイムスリップした体育教師が、現代のコンプライアンス社会に物申すコメディドラマ。宮藤官九郎脚本の話題作。',
    tags: ['ドラマ', '阿部サダヲ', 'TBS', 'クドカン'],
  },
  {
    nameKanji: '夕陽丘の探偵団',
    nameKana: 'ゆうひがおかのたんていだん',
    nameEnglish: 'Yuhigaoka no Tanteidan',
    score: 7.5,
    genre: 'ドラマ',
    broadcaster: 'NHK',
    yearStart: 1995,
    yearEnd: 1995,
    tvDescription: 'NHKの子供向けドラマ。小学生たちが町で起こる事件を解決していく探偵物語。子役たちの活躍と温かいストーリーが特徴。',
    tags: ['ドラマ', 'NHK', '子供向け', '90年代'],
  },
  {
    nameKanji: '女王の教室',
    nameKana: 'じょおうのきょうしつ',
    nameEnglish: 'The Queen\'s Classroom',
    score: 9.1,
    genre: 'ドラマ',
    broadcaster: '日本テレビ',
    yearStart: 2005,
    yearEnd: 2005,
    tvDescription: '天海祐希主演。冷酷な鬼教師・阿久津真矢が小学6年生を支配する衝撃のドラマ。教育とは何かを問う社会派作品で、志田未来の出世作でもある。',
    tags: ['ドラマ', '天海祐希', '日本テレビ', '学園'],
  },
  {
    nameKanji: '家なき子',
    nameKana: 'いえなきこ',
    nameEnglish: 'Ie Naki Ko',
    score: 8.6,
    genre: 'ドラマ',
    broadcaster: '日本テレビ',
    yearStart: 1994,
    yearEnd: 1995,
    tvDescription: '安達祐実主演。虐待を受ける少女・すずの過酷な運命を描いた社会派ドラマ。「同情するなら金をくれ！」のセリフが流行語に。続編も制作された。',
    tags: ['ドラマ', '安達祐実', '日本テレビ', '90年代'],
  },
  {
    nameKanji: '天才てれびくん',
    nameKana: 'てんさいてれびくん',
    nameEnglish: 'Tensai Terebi-kun',
    score: 8.4,
    genre: '子供番組',
    broadcaster: 'NHK',
    yearStart: 1993,
    yearEnd: 1999,
    tvDescription: 'NHK教育の子供向けバラエティ。てれび戦士と呼ばれる子役たちが様々な企画に挑戦。恐竜惑星やジーンダイバーなどのアニメコーナーも人気だった。',
    tags: ['子供番組', 'NHK', 'てれび戦士'],
  },
  {
    nameKanji: '天才てれびくんワイド',
    nameKana: 'てんさいてれびくんわいど',
    nameEnglish: 'Tensai Terebi-kun Wide',
    score: 8.3,
    genre: '子供番組',
    broadcaster: 'NHK',
    yearStart: 1999,
    yearEnd: 2003,
    tvDescription: '天才てれびくんの第2シリーズ。放送時間が拡大し、より多彩な企画を展開。MTKの音楽コーナーが人気で、多くのヒット曲を生んだ。',
    tags: ['子供番組', 'NHK', 'てれび戦士', 'MTK'],
  },
  {
    nameKanji: '天才てれびくんMAX',
    nameKana: 'てんさいてれびくんまっくす',
    nameEnglish: 'Tensai Terebi-kun MAX',
    score: 8.2,
    genre: '子供番組',
    broadcaster: 'NHK',
    yearStart: 2003,
    yearEnd: 2011,
    tvDescription: '天才てれびくんの第3シリーズ。てれび戦士の活動がさらに活発化。天てれドラマや大!天才てれびくんなど派生番組も生まれた。',
    tags: ['子供番組', 'NHK', 'てれび戦士'],
  },
  {
    nameKanji: 'ごくせん',
    nameKana: 'ごくせん',
    nameEnglish: 'Gokusen',
    score: 8.8,
    genre: 'ドラマ',
    broadcaster: '日本テレビ',
    yearStart: 2002,
    yearEnd: 2008,
    tvDescription: '仲間由紀恵主演。ヤクザの組長の孫娘が高校教師として不良生徒たちと向き合う学園ドラマ。松本潤、亀梨和也、赤西仁など後のスターを輩出。シリーズ3作制作。',
    tags: ['ドラマ', '仲間由紀恵', '日本テレビ', '学園'],
  },
  {
    nameKanji: 'マイ★ボス マイ★ヒーロー',
    nameKana: 'まいぼす まいひーろー',
    nameEnglish: 'My Boss My Hero',
    score: 8.5,
    genre: 'ドラマ',
    broadcaster: '日本テレビ',
    yearStart: 2006,
    yearEnd: 2006,
    tvDescription: '長瀬智也主演。27歳のヤクザの若頭が高校に入学するコメディドラマ。韓国映画のリメイクで、新垣結衣の出世作としても知られる。',
    tags: ['ドラマ', '長瀬智也', '日本テレビ', 'コメディ'],
  },
  {
    nameKanji: '花より男子',
    nameKana: 'はなよりだんご',
    nameEnglish: 'Hana Yori Dango',
    score: 8.9,
    genre: 'ドラマ',
    broadcaster: 'TBS',
    yearStart: 2005,
    yearEnd: 2007,
    tvDescription: '井上真央、松本潤主演。神尾葉子の人気漫画をドラマ化。貧乏少女・牧野つくしとF4のラブストーリー。続編やファイナルも制作され、社会現象となった。',
    tags: ['ドラマ', '井上真央', '松本潤', 'TBS', '恋愛'],
  },
  {
    nameKanji: '特捜戦隊デカレンジャー',
    nameKana: 'とくそうせんたいでかれんじゃー',
    nameEnglish: 'Tokusou Sentai Dekaranger',
    score: 8.6,
    genre: '特撮',
    broadcaster: 'テレビ朝日',
    yearStart: 2004,
    yearEnd: 2005,
    tvDescription: 'スーパー戦隊シリーズ第28作。宇宙警察をモチーフにした刑事ドラマ風の作品。「ジャッジメント！」の決め台詞が印象的。大人のファンも多い人気作。',
    tags: ['特撮', 'スーパー戦隊', 'テレビ朝日'],
  },
  {
    nameKanji: '魔法戦隊マジレンジャー',
    nameKana: 'まほうせんたいまじれんじゃー',
    nameEnglish: 'Mahou Sentai Magiranger',
    score: 8.4,
    genre: '特撮',
    broadcaster: 'テレビ朝日',
    yearStart: 2005,
    yearEnd: 2006,
    tvDescription: 'スーパー戦隊シリーズ第29作。魔法使いの家族がテーマ。5人兄弟が変身して戦う家族愛をテーマにした作品。「マジ・マジ・マジーロ！」の変身シーンが特徴。',
    tags: ['特撮', 'スーパー戦隊', 'テレビ朝日', '魔法'],
  },
  {
    nameKanji: 'ズームイン!!朝!',
    nameKana: 'ずーむいんあさ',
    nameEnglish: 'Zoom In!! Asa!',
    score: 7.9,
    genre: '情報番組',
    broadcaster: '日本テレビ',
    yearStart: 1979,
    yearEnd: 2011,
    tvDescription: '福留功男、徳光和夫、福澤朗、羽鳥慎一など歴代MCが担当した朝の情報番組。「ウィッキーさんのワンポイント英会話」など人気コーナーを多数生み出した。',
    tags: ['情報番組', '日本テレビ', '朝番組'],
  },
  {
    nameKanji: 'ブラッディ・マンデイ',
    nameKana: 'ぶらっでぃまんでい',
    nameEnglish: 'Bloody Monday',
    score: 8.7,
    genre: 'ドラマ',
    broadcaster: 'TBS',
    yearStart: 2008,
    yearEnd: 2010,
    tvDescription: '三浦春馬主演。天才ハッカー高校生がテロリストと戦うサスペンスドラマ。漫画原作で、緊迫感のあるストーリーとアクションが話題に。シーズン2も制作。',
    tags: ['ドラマ', '三浦春馬', 'TBS', 'サスペンス'],
  },
];

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
  console.log('Create TV Shows Hobby Category');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE');
  } else {
    console.log('\n🚀 LIVE MODE');
  }

  await initializeFirebase();
  const db = admin.firestore();

  // Check if category exists
  const existingCategory = await db.collection('hobbies').where('slug', '==', 'tv-shows').get();
  let categoryId: string;

  if (!existingCategory.empty) {
    categoryId = existingCategory.docs[0].id;
    console.log(`\n📁 Category already exists: ${categoryId}`);
  } else {
    if (DRY_RUN) {
      categoryId = 'dry-run-category';
      console.log('\n[DRY RUN] Would create TV Shows category');
    } else {
      const categoryData = {
        name: 'テレビ番組',
        slug: 'tv-shows',
        description: '好きなテレビ番組のリスト',
        icon: 'tv',
        templateType: 'catalog',
        isPublic: true,
        order: 4,
        fields: TV_SHOW_FIELDS,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const docRef = await db.collection('hobbies').add(categoryData);
      categoryId = docRef.id;
      console.log(`\n📁 Created category: ${categoryId}`);
    }
  }

  // Add TV shows
  console.log('\n📺 Adding TV shows...');
  let addedCount = 0;

  for (const show of TV_SHOWS) {
    // Check if already exists
    const existing = await db.collection('hobby_items')
      .where('hobbyId', '==', categoryId)
      .where('title', '==', show.nameKanji)
      .get();

    if (!existing.empty) {
      console.log(`  ⏭️  ${show.nameKanji} (already exists)`);
      continue;
    }

    const itemData = {
      hobbyId: categoryId,
      title: show.nameKanji,
      description: '',
      images: [],
      thumbImage: '',
      isPublic: true,
      order: addedCount + 1,
      customFields: {
        nameKanji: show.nameKanji,
        nameKana: show.nameKana,
        nameEnglish: show.nameEnglish,
        score: show.score,
        genre: show.genre,
        broadcaster: show.broadcaster,
        yearStart: show.yearStart,
        yearEnd: show.yearEnd,
        tvDescription: show.tvDescription,
      },
      tags: show.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would add: ${show.nameKanji}`);
    } else {
      await db.collection('hobby_items').add(itemData);
      console.log(`  ✅ ${show.nameKanji}`);
    }
    addedCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  Added: ${addedCount} TV shows`);

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/create-tv-shows.ts');
  }
}

main().catch(console.error);
