/**
 * Add more anime characters and voice actors
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';

interface VoiceActor {
  nameKanji: string;
  nameKana: string;
  nameEnglish: string;
}

interface Character {
  nameKanji: string;
  nameKana: string;
  nameEnglish: string;
  animeTitle: string;
  voiceActorName: string;
}

// Additional voice actors
const voiceActorsData: VoiceActor[] = [
  // おじさんとマシュマロ
  { nameKanji: '喜多村英梨', nameKana: 'きたむらえり', nameEnglish: 'Eri Kitamura' },
  { nameKanji: '手塚ヒロミチ', nameKana: 'てづかひろみち', nameEnglish: 'Hiromichi Tezuka' },
  // すのはら荘の管理人さん
  { nameKanji: '佐藤利奈', nameKana: 'さとうりな', nameEnglish: 'Rina Sato' },
  { nameKanji: '高森奈津美', nameKana: 'たかもりなつみ', nameEnglish: 'Natsumi Takamori' },
  // 終末なにしてますか
  { nameKanji: '田所あずさ', nameKana: 'たどころあずさ', nameEnglish: 'Azusa Tadokoro' },
  { nameKanji: '新井里美', nameKana: 'あらいさとみ', nameEnglish: 'Satomi Arai' },
  // 浦安鉄筋家族
  { nameKanji: '岩田光央', nameKana: 'いわたみつお', nameEnglish: 'Mitsuo Iwata' },
  { nameKanji: '三石琴乃', nameKana: 'みついしことの', nameEnglish: 'Kotono Mitsuishi' },
  // 初恋限定
  { nameKanji: '阿澄佳奈', nameKana: 'あすみかな', nameEnglish: 'Kana Asumi' },
  { nameKanji: '戸松遥', nameKana: 'とまつはるか', nameEnglish: 'Haruka Tomatsu' },
  // 彼女、お借りします
  { nameKanji: '雨宮天', nameKana: 'あまみやそら', nameEnglish: 'Sora Amamiya' },
  { nameKanji: '悠木碧', nameKana: 'ゆうきあおい', nameEnglish: 'Aoi Yuki' },
  { nameKanji: '東山奈央', nameKana: 'とうやまなお', nameEnglish: 'Nao Toyama' },
  { nameKanji: '高橋李依', nameKana: 'たかはしりえ', nameEnglish: 'Rie Takahashi' },
  // はじめてのギャル
  { nameKanji: '長久友紀', nameKana: 'ながくゆき', nameEnglish: 'Yuki Nagaku' },
  { nameKanji: '榎本温子', nameKana: 'えのもとあつこ', nameEnglish: 'Atsuko Enomoto' },
  // 可愛いだけじゃない式守さん
  { nameKanji: '大西沙織', nameKana: 'おおにしさおり', nameEnglish: 'Saori Onishi' },
  { nameKanji: '梅田修一朗', nameKana: 'うめだしゅういちろう', nameEnglish: 'Shuichiro Umeda' },
  // なんでここに先生が
  { nameKanji: '上坂すみれ', nameKana: 'うえさかすみれ', nameEnglish: 'Sumire Uesaka' },
  { nameKanji: '後藤邑子', nameKana: 'ごとうゆうこ', nameEnglish: 'Yuko Goto' },
  // 妻、小学生になる
  { nameKanji: '堀江瞬', nameKana: 'ほりえしゅん', nameEnglish: 'Shun Horie' },
  { nameKanji: '石田彰', nameKana: 'いしだあきら', nameEnglish: 'Akira Ishida' },
  // ドメスティックな彼女
  { nameKanji: '八代拓', nameKana: 'やしろたく', nameEnglish: 'Taku Yashiro' },
  { nameKanji: '内田真礼', nameKana: 'うちだまあや', nameEnglish: 'Maaya Uchida' },
  { nameKanji: '日笠陽子', nameKana: 'ひかさようこ', nameEnglish: 'Yoko Hikasa' },
  // ロザリオとバンパイア
  { nameKanji: '水樹奈々', nameKana: 'みずきなな', nameEnglish: 'Nana Mizuki' },
  { nameKanji: '福圓美里', nameKana: 'ふくえんみさと', nameEnglish: 'Misato Fukuen' },
  // それでも歩は寄せてくる
  { nameKanji: '鬼頭明里', nameKana: 'きとうあかり', nameEnglish: 'Akari Kito' },
  // 追加の声優（既存アニメ用）
  { nameKanji: '豊崎愛生', nameKana: 'とよさきあき', nameEnglish: 'Aki Toyosaki' },
  { nameKanji: '茅野愛衣', nameKana: 'かやのあい', nameEnglish: 'Ai Kayano' },
  { nameKanji: '小野大輔', nameKana: 'おのだいすけ', nameEnglish: 'Daisuke Ono' },
  { nameKanji: '宮野真守', nameKana: 'みやのまもる', nameEnglish: 'Mamoru Miyano' },
  { nameKanji: '小野賢章', nameKana: 'おのけんしょう', nameEnglish: 'Kensho Ono' },
  { nameKanji: '諏訪部順一', nameKana: 'すわべじゅんいち', nameEnglish: 'Junichi Suwabe' },
  { nameKanji: '子安武人', nameKana: 'こやすたけひと', nameEnglish: 'Takehito Koyasu' },
  { nameKanji: '関智一', nameKana: 'せきともかず', nameEnglish: 'Tomokazu Seki' },
  { nameKanji: '浪川大輔', nameKana: 'なみかわだいすけ', nameEnglish: 'Daisuke Namikawa' },
  { nameKanji: '細谷佳正', nameKana: 'ほそやよしまさ', nameEnglish: 'Yoshimasa Hosoya' },
  { nameKanji: '下野紘', nameKana: 'しものひろ', nameEnglish: 'Hiro Shimono' },
  { nameKanji: '島﨑信長', nameKana: 'しまざきのぶなが', nameEnglish: 'Nobunaga Shimazaki' },
  { nameKanji: '内山昂輝', nameKana: 'うちやまこうき', nameEnglish: 'Koki Uchiyama' },
  { nameKanji: '岡本信彦', nameKana: 'おかもとのぶひこ', nameEnglish: 'Nobuhiko Okamoto' },
  { nameKanji: '沢城みゆき', nameKana: 'さわしろみゆき', nameEnglish: 'Miyuki Sawashiro' },
  { nameKanji: '小清水亜美', nameKana: 'こしみずあみ', nameEnglish: 'Ami Koshimizu' },
  { nameKanji: '能登麻美子', nameKana: 'のとまみこ', nameEnglish: 'Mamiko Noto' },
  { nameKanji: '坂本真綾', nameKana: 'さかもとまあや', nameEnglish: 'Maaya Sakamoto' },
  { nameKanji: '日高里菜', nameKana: 'ひだかりな', nameEnglish: 'Rina Hidaka' },
  { nameKanji: '加隈亜衣', nameKana: 'かくまあい', nameEnglish: 'Ai Kakuma' },
  { nameKanji: '佐藤聡美', nameKana: 'さとうさとみ', nameEnglish: 'Satomi Sato' },
  { nameKanji: '茅原実里', nameKana: 'ちはらみのり', nameEnglish: 'Minori Chihara' },
  { nameKanji: '平野綾', nameKana: 'ひらのあや', nameEnglish: 'Aya Hirano' },
  { nameKanji: '後藤沙緒里', nameKana: 'ごとうさおり', nameEnglish: 'Saori Goto' },
  { nameKanji: '小倉唯', nameKana: 'おぐらゆい', nameEnglish: 'Yui Ogura' },
  { nameKanji: '三森すずこ', nameKana: 'みもりすずこ', nameEnglish: 'Suzuko Mimori' },
  { nameKanji: '内田彩', nameKana: 'うちだあや', nameEnglish: 'Aya Uchida' },
  { nameKanji: '久野美咲', nameKana: 'くのみさき', nameEnglish: 'Misaki Kuno' },
];

// More characters for all anime
const charactersData: Character[] = [
  // ========== 欠けているアニメ ==========

  // おじさんとマシュマロ
  { nameKanji: '日下幅広', nameKana: 'ひげはばひろ', nameEnglish: 'Habahiro Hige', animeTitle: 'おじさんとマシュマロ', voiceActorName: '手塚ヒロミチ' },
  { nameKanji: '若林伊織', nameKana: 'わかばやしいおり', nameEnglish: 'Iori Wakabayashi', animeTitle: 'おじさんとマシュマロ', voiceActorName: '喜多村英梨' },

  // すのはら荘の管理人さん
  { nameKanji: '春原彩花', nameKana: 'すのはらあやか', nameEnglish: 'Ayaka Sunohara', animeTitle: 'すのはら荘の管理人さん', voiceActorName: '佐藤利奈' },
  { nameKanji: '椎名亜樹', nameKana: 'しいなあき', nameEnglish: 'Aki Shiina', animeTitle: 'すのはら荘の管理人さん', voiceActorName: '高森奈津美' },
  { nameKanji: '月本彩夏', nameKana: 'つきもとさやか', nameEnglish: 'Sayaka Tsukimoto', animeTitle: 'すのはら荘の管理人さん', voiceActorName: '高橋李依' },

  // 終末なにしてますか？
  { nameKanji: 'クトリ・ノタ・セニオリス', nameKana: 'くとりのたせにおりす', nameEnglish: 'Chtholly Nota Seniorious', animeTitle: '終末なにしてますか？忙しいですか？救ってもらっていいですか？', voiceActorName: '田所あずさ' },
  { nameKanji: 'ヴィレム・クメシュ', nameKana: 'う゛ぃれむくめしゅ', nameEnglish: 'Willem Kmetsch', animeTitle: '終末なにしてますか？忙しいですか？救ってもらっていいですか？', voiceActorName: '新井里美' },
  { nameKanji: 'アイセア・マイゼ・ヴァルガリス', nameKana: 'あいせあまいぜう゛ぁるがりす', nameEnglish: 'Aiseia Myse Valgalis', animeTitle: '終末なにしてますか？忙しいですか？救ってもらっていいですか？', voiceActorName: '上坂すみれ' },

  // 浦安鉄筋家族
  { nameKanji: '大沢木小鉄', nameKana: 'おおさわぎこてつ', nameEnglish: 'Kotetsu Osawagi', animeTitle: '浦安鉄筋家族', voiceActorName: '岩田光央' },
  { nameKanji: '大沢木順子', nameKana: 'おおさわぎじゅんこ', nameEnglish: 'Junko Osawagi', animeTitle: '浦安鉄筋家族', voiceActorName: '三石琴乃' },
  { nameKanji: '大沢木大鉄', nameKana: 'おおさわぎだいてつ', nameEnglish: 'Daitetsu Osawagi', animeTitle: '浦安鉄筋家族', voiceActorName: '岩田光央' },

  // 初恋限定。
  { nameKanji: '有原あゆみ', nameKana: 'ありはらあゆみ', nameEnglish: 'Ayumi Arihara', animeTitle: '初恋限定。', voiceActorName: '阿澄佳奈' },
  { nameKanji: '別所小宵', nameKana: 'べっしょこよい', nameEnglish: 'Koyoi Bessho', animeTitle: '初恋限定。', voiceActorName: '戸松遥' },
  { nameKanji: '財津衛', nameKana: 'ざいつまもる', nameEnglish: 'Mamoru Zaitsu', animeTitle: '初恋限定。', voiceActorName: '岡本信彦' },

  // 彼女、お借りします
  { nameKanji: '木ノ下和也', nameKana: 'きのしたかずや', nameEnglish: 'Kazuya Kinoshita', animeTitle: '彼女、お借りします', voiceActorName: '堀江瞬' },
  { nameKanji: '水原千鶴', nameKana: 'みずはらちづる', nameEnglish: 'Chizuru Mizuhara', animeTitle: '彼女、お借りします', voiceActorName: '雨宮天' },
  { nameKanji: '更科瑠夏', nameKana: 'さらしなるか', nameEnglish: 'Ruka Sarashina', animeTitle: '彼女、お借りします', voiceActorName: '東山奈央' },
  { nameKanji: '桜沢墨', nameKana: 'さくらさわすみ', nameEnglish: 'Sumi Sakurasawa', animeTitle: '彼女、お借りします', voiceActorName: '高橋李依' },
  { nameKanji: '七海麻美', nameKana: 'ななみまみ', nameEnglish: 'Mami Nanami', animeTitle: '彼女、お借りします', voiceActorName: '悠木碧' },

  // 365歩のユウキ！！！ (架空のキャラクター)
  { nameKanji: 'ユウキ', nameKana: 'ゆうき', nameEnglish: 'Yuuki', animeTitle: '365歩のユウキ！！！', voiceActorName: '水瀬いのり' },
  { nameKanji: 'サクラ', nameKana: 'さくら', nameEnglish: 'Sakura', animeTitle: '365歩のユウキ！！！', voiceActorName: '佐倉綾音' },

  // はじめてのギャル
  { nameKanji: '八女ゆかな', nameKana: 'やめゆかな', nameEnglish: 'Yukana Yame', animeTitle: 'はじめてのギャル', voiceActorName: '長久友紀' },
  { nameKanji: '羽柴ジュンイチ', nameKana: 'はしばじゅんいち', nameEnglish: 'Junichi Hashiba', animeTitle: 'はじめてのギャル', voiceActorName: '榎本温子' },
  { nameKanji: '本城蘭子', nameKana: 'ほんじょうらんこ', nameEnglish: 'Ranko Honjo', animeTitle: 'はじめてのギャル', voiceActorName: '喜多村英梨' },

  // 可愛いだけじゃない式守さん
  { nameKanji: '式守さん', nameKana: 'しきもりさん', nameEnglish: 'Shikimori', animeTitle: '可愛いだけじゃない式守さん', voiceActorName: '大西沙織' },
  { nameKanji: '和泉くん', nameKana: 'いずみくん', nameEnglish: 'Izumi', animeTitle: '可愛いだけじゃない式守さん', voiceActorName: '梅田修一朗' },
  { nameKanji: '猫崎響', nameKana: 'ねこさきひびき', nameEnglish: 'Hibiki Nekozaki', animeTitle: '可愛いだけじゃない式守さん', voiceActorName: '日高里菜' },

  // なんでここに先生が！？
  { nameKanji: '児嶋加奈', nameKana: 'こじまかな', nameEnglish: 'Kana Kojima', animeTitle: 'なんでここに先生が！？', voiceActorName: '上坂すみれ' },
  { nameKanji: '佐藤一郎', nameKana: 'さとういちろう', nameEnglish: 'Ichiro Sato', animeTitle: 'なんでここに先生が！？', voiceActorName: '岡本信彦' },
  { nameKanji: '松風真由', nameKana: 'まつかぜまゆ', nameEnglish: 'Mayu Matsukaze', animeTitle: 'なんでここに先生が！？', voiceActorName: '後藤邑子' },

  // 妻、小学生になる。
  { nameKanji: '新島圭介', nameKana: 'にいじまけいすけ', nameEnglish: 'Keisuke Niijima', animeTitle: '妻、小学生になる。', voiceActorName: '堀江瞬' },
  { nameKanji: '白石貴恵', nameKana: 'しらいしたかえ', nameEnglish: 'Takae Shiraishi', animeTitle: '妻、小学生になる。', voiceActorName: '悠木碧' },
  { nameKanji: '新島麻衣', nameKana: 'にいじままい', nameEnglish: 'Mai Niijima', animeTitle: '妻、小学生になる。', voiceActorName: '石田彰' },

  // ドメスティックな彼女
  { nameKanji: '藤井夏生', nameKana: 'ふじいなつお', nameEnglish: 'Natsuo Fujii', animeTitle: 'ドメスティックな彼女', voiceActorName: '八代拓' },
  { nameKanji: '橘瑠衣', nameKana: 'たちばなるい', nameEnglish: 'Rui Tachibana', animeTitle: 'ドメスティックな彼女', voiceActorName: '内田真礼' },
  { nameKanji: '橘陽菜', nameKana: 'たちばなひな', nameEnglish: 'Hina Tachibana', animeTitle: 'ドメスティックな彼女', voiceActorName: '日笠陽子' },

  // ロザリオとバンパイア
  { nameKanji: '赤夜萌香', nameKana: 'あかしやもか', nameEnglish: 'Moka Akashiya', animeTitle: 'ロザリオとバンパイア', voiceActorName: '水樹奈々' },
  { nameKanji: '青野月音', nameKana: 'あおのつくね', nameEnglish: 'Tsukune Aono', animeTitle: 'ロザリオとバンパイア', voiceActorName: '岸尾だいすけ' },
  { nameKanji: '黒乃胡夢', nameKana: 'くろのくるむ', nameEnglish: 'Kurumu Kurono', animeTitle: 'ロザリオとバンパイア', voiceActorName: '福圓美里' },

  // それでも歩は寄せてくる
  { nameKanji: '八乙女うるし', nameKana: 'やおとめうるし', nameEnglish: 'Urushi Yaotome', animeTitle: 'それでも歩は寄せてくる', voiceActorName: '鬼頭明里' },
  { nameKanji: '田中歩', nameKana: 'たなかあゆむ', nameEnglish: 'Ayumu Tanaka', animeTitle: 'それでも歩は寄せてくる', voiceActorName: '島﨑信長' },

  // ========== 既存アニメに追加キャラクター ==========

  // とらドラ！ 追加
  { nameKanji: '川嶋亜美', nameKana: 'かわしまあみ', nameEnglish: 'Ami Kawashima', animeTitle: 'とらドラ！', voiceActorName: '喜多村英梨' },
  { nameKanji: '北村祐作', nameKana: 'きたむらゆうさく', nameEnglish: 'Yusaku Kitamura', animeTitle: 'とらドラ！', voiceActorName: '野島裕史' },

  // ご注文はうさぎですか？ 追加
  { nameKanji: 'シャロ', nameKana: 'しゃろ', nameEnglish: 'Sharo', animeTitle: 'ご注文はうさぎですか？', voiceActorName: '内田真礼' },
  { nameKanji: '千夜', nameKana: 'ちや', nameEnglish: 'Chiya', animeTitle: 'ご注文はうさぎですか？', voiceActorName: '佐藤聡美' },

  // Re:ゼロ 追加
  { nameKanji: 'レム', nameKana: 'れむ', nameEnglish: 'Rem', animeTitle: 'Re:ゼロから始める異世界生活', voiceActorName: '水瀬いのり' },
  { nameKanji: 'ラム', nameKana: 'らむ', nameEnglish: 'Ram', animeTitle: 'Re:ゼロから始める異世界生活', voiceActorName: '村川梨衣' },
  { nameKanji: 'ベアトリス', nameKana: 'べあとりす', nameEnglish: 'Beatrice', animeTitle: 'Re:ゼロから始める異世界生活', voiceActorName: '新井里美' },

  // その着せ替え人形 追加
  { nameKanji: '乾紗寿叶', nameKana: 'いぬいさじゅな', nameEnglish: 'Sajuna Inui', animeTitle: 'その着せ替え人形は恋をする', voiceActorName: '種田梨沙' },

  // クレヨンしんちゃん 追加
  { nameKanji: '野原ひまわり', nameKana: 'のはらひまわり', nameEnglish: 'Himawari Nohara', animeTitle: 'クレヨンしんちゃん', voiceActorName: 'こおろぎさとみ' },
  { nameKanji: 'シロ', nameKana: 'しろ', nameEnglish: 'Shiro', animeTitle: 'クレヨンしんちゃん', voiceActorName: '真柴摩利' },

  // 名探偵コナン 追加
  { nameKanji: '灰原哀', nameKana: 'はいばらあい', nameEnglish: 'Ai Haibara', animeTitle: '名探偵コナン', voiceActorName: '林原めぐみ' },
  { nameKanji: '服部平次', nameKana: 'はっとりへいじ', nameEnglish: 'Heiji Hattori', animeTitle: '名探偵コナン', voiceActorName: '堀川りょう' },
  { nameKanji: '怪盗キッド', nameKana: 'かいとうきっど', nameEnglish: 'Kaito Kid', animeTitle: '名探偵コナン', voiceActorName: '山口勝平' },

  // 銀魂 追加
  { nameKanji: '桂小太郎', nameKana: 'かつらこたろう', nameEnglish: 'Kotaro Katsura', animeTitle: '銀魂', voiceActorName: '石田彰' },
  { nameKanji: '高杉晋助', nameKana: 'たかすぎしんすけ', nameEnglish: 'Shinsuke Takasugi', animeTitle: '銀魂', voiceActorName: '子安武人' },

  // 進撃の巨人 追加
  { nameKanji: 'エルヴィン・スミス', nameKana: 'えるう゛ぃんすみす', nameEnglish: 'Erwin Smith', animeTitle: '進撃の巨人', voiceActorName: '小野大輔' },
  { nameKanji: 'ハンジ・ゾエ', nameKana: 'はんじぞえ', nameEnglish: 'Hange Zoe', animeTitle: '進撃の巨人', voiceActorName: '朴璐美' },

  // かぐや様は告らせたい 追加
  { nameKanji: '石上優', nameKana: 'いしがみゆう', nameEnglish: 'Yu Ishigami', animeTitle: 'かぐや様は告らせたい', voiceActorName: '鈴木崚汰' },
  { nameKanji: '伊井野ミコ', nameKana: 'いいのみこ', nameEnglish: 'Miko Iino', animeTitle: 'かぐや様は告らせたい', voiceActorName: '富田美憂' },

  // NARUTO 追加
  { nameKanji: 'はたけカカシ', nameKana: 'はたけかかし', nameEnglish: 'Kakashi Hatake', animeTitle: 'NARUTO－ナルト', voiceActorName: '井上和彦' },
  { nameKanji: '日向ヒナタ', nameKana: 'ひゅうがひなた', nameEnglish: 'Hinata Hyuga', animeTitle: 'NARUTO－ナルト', voiceActorName: '水樹奈々' },
  { nameKanji: 'うちはイタチ', nameKana: 'うちはいたち', nameEnglish: 'Itachi Uchiha', animeTitle: 'NARUTO－ナルト', voiceActorName: '石川英郎' },

  // 五等分の花嫁 追加
  { nameKanji: '中野四葉', nameKana: 'なかのよつば', nameEnglish: 'Yotsuba Nakano', animeTitle: '五等分の花嫁', voiceActorName: '佐倉綾音' },
  { nameKanji: '中野五月', nameKana: 'なかのいつき', nameEnglish: 'Itsuki Nakano', animeTitle: '五等分の花嫁', voiceActorName: '水瀬いのり' },

  // ソードアート・オンライン 追加
  { nameKanji: 'シノン', nameKana: 'しのん', nameEnglish: 'Sinon', animeTitle: 'ソードアート・オンライン', voiceActorName: '沢城みゆき' },
  { nameKanji: 'ユウキ', nameKana: 'ゆうき', nameEnglish: 'Yuuki', animeTitle: 'ソードアート・オンライン', voiceActorName: '悠木碧' },
  { nameKanji: 'リーファ', nameKana: 'りーふぁ', nameEnglish: 'Leafa', animeTitle: 'ソードアート・オンライン', voiceActorName: '竹達彩奈' },

  // この素晴らしい世界に祝福を！ 追加
  { nameKanji: 'ダクネス', nameKana: 'だくねす', nameEnglish: 'Darkness', animeTitle: 'この素晴らしい世界に祝福を！', voiceActorName: '茅野愛衣' },

  // ドラゴンボール 追加
  { nameKanji: 'クリリン', nameKana: 'くりりん', nameEnglish: 'Krillin', animeTitle: 'ドラゴンボール', voiceActorName: '田中真弓' },
  { nameKanji: 'ピッコロ', nameKana: 'ぴっころ', nameEnglish: 'Piccolo', animeTitle: 'ドラゴンボール', voiceActorName: '古川登志夫' },
  { nameKanji: 'フリーザ', nameKana: 'ふりーざ', nameEnglish: 'Frieza', animeTitle: 'ドラゴンボール', voiceActorName: '中尾隆聖' },

  // ONE PIECE 追加
  { nameKanji: 'サンジ', nameKana: 'さんじ', nameEnglish: 'Sanji', animeTitle: 'ONE PIECE', voiceActorName: '平田広明' },
  { nameKanji: 'ウソップ', nameKana: 'うそっぷ', nameEnglish: 'Usopp', animeTitle: 'ONE PIECE', voiceActorName: '山口勝平' },
  { nameKanji: 'トニートニー・チョッパー', nameKana: 'とにーとにーちょっぱー', nameEnglish: 'Tony Tony Chopper', animeTitle: 'ONE PIECE', voiceActorName: '大谷育江' },
  { nameKanji: 'ニコ・ロビン', nameKana: 'にころびん', nameEnglish: 'Nico Robin', animeTitle: 'ONE PIECE', voiceActorName: '山口由里子' },

  // 化物語 追加
  { nameKanji: '八九寺真宵', nameKana: 'はちくじまよい', nameEnglish: 'Mayoi Hachikuji', animeTitle: '化物語', voiceActorName: '加藤英美里' },
  { nameKanji: '神原駿河', nameKana: 'かんばるするが', nameEnglish: 'Suruga Kanbaru', animeTitle: '化物語', voiceActorName: '沢城みゆき' },
  { nameKanji: '羽川翼', nameKana: 'はねかわつばさ', nameEnglish: 'Tsubasa Hanekawa', animeTitle: '化物語', voiceActorName: '堀江由衣' },
  { nameKanji: '忍野忍', nameKana: 'おしのしのぶ', nameEnglish: 'Shinobu Oshino', animeTitle: '化物語', voiceActorName: '坂本真綾' },

  // ドラえもん 追加
  { nameKanji: '源静香', nameKana: 'みなもとしずか', nameEnglish: 'Shizuka Minamoto', animeTitle: 'ドラえもん', voiceActorName: 'かかずゆみ' },
  { nameKanji: '剛田武', nameKana: 'ごうだたけし', nameEnglish: 'Takeshi Goda', animeTitle: 'ドラえもん', voiceActorName: '木村昴' },
  { nameKanji: '骨川スネ夫', nameKana: 'ほねかわすねお', nameEnglish: 'Suneo Honekawa', animeTitle: 'ドラえもん', voiceActorName: '関智一' },

  // 新世紀エヴァンゲリオン 追加
  { nameKanji: '渚カヲル', nameKana: 'なぎさかをる', nameEnglish: 'Kaworu Nagisa', animeTitle: '新世紀エヴァンゲリオン', voiceActorName: '石田彰' },
  { nameKanji: '葛城ミサト', nameKana: 'かつらぎみさと', nameEnglish: 'Misato Katsuragi', animeTitle: '新世紀エヴァンゲリオン', voiceActorName: '三石琴乃' },

  // 宇宙よりも遠い場所 追加
  { nameKanji: '白石結月', nameKana: 'しらいしゆづき', nameEnglish: 'Yuzuki Shiraishi', animeTitle: '宇宙よりも遠い場所', voiceActorName: '早見沙織' },

  // 呪術廻戦 追加
  { nameKanji: '釘崎野薔薇', nameKana: 'くぎさきのばら', nameEnglish: 'Nobara Kugisaki', animeTitle: '呪術廻戦', voiceActorName: '瀬戸麻沙美' },
  { nameKanji: '両面宿儺', nameKana: 'りょうめんすくな', nameEnglish: 'Ryomen Sukuna', animeTitle: '呪術廻戦', voiceActorName: '諏訪部順一' },
  { nameKanji: '狗巻棘', nameKana: 'いぬまきとげ', nameEnglish: 'Toge Inumaki', animeTitle: '呪術廻戦', voiceActorName: '内田雄馬' },

  // BLEACH 追加
  { nameKanji: '井上織姫', nameKana: 'いのうえおりひめ', nameEnglish: 'Orihime Inoue', animeTitle: 'BLEACH', voiceActorName: '松岡由貴' },
  { nameKanji: '茶渡泰虎', nameKana: 'さどやすとら', nameEnglish: 'Yasutora Sado', animeTitle: 'BLEACH', voiceActorName: '安元洋貴' },
  { nameKanji: '石田雨竜', nameKana: 'いしだうりゅう', nameEnglish: 'Uryu Ishida', animeTitle: 'BLEACH', voiceActorName: '杉山紀彰' },
  { nameKanji: '日番谷冬獅郎', nameKana: 'ひつがやとうしろう', nameEnglish: 'Toshiro Hitsugaya', animeTitle: 'BLEACH', voiceActorName: '朴璐美' },

  // 家庭教師ヒットマンREBORN! 追加
  { nameKanji: '獄寺隼人', nameKana: 'ごくでらはやと', nameEnglish: 'Hayato Gokudera', animeTitle: '家庭教師ヒットマンREBORN!', voiceActorName: '市瀬秀和' },
  { nameKanji: '山本武', nameKana: 'やまもとたけし', nameEnglish: 'Takeshi Yamamoto', animeTitle: '家庭教師ヒットマンREBORN!', voiceActorName: '井上優' },
  { nameKanji: '雲雀恭弥', nameKana: 'ひばりきょうや', nameEnglish: 'Kyoya Hibari', animeTitle: '家庭教師ヒットマンREBORN!', voiceActorName: '近藤隆' },

  // だがしかし 追加
  { nameKanji: '遠藤サヤ', nameKana: 'えんどうさや', nameEnglish: 'Saya Endo', animeTitle: 'だがしかし', voiceActorName: '沼倉愛美' },

  // citrus 追加
  { nameKanji: '谷口はるみん', nameKana: 'たにぐちはるみん', nameEnglish: 'Harumin Taniguchi', animeTitle: 'citrus', voiceActorName: '藤井ゆきよ' },

  // To LOVEる 追加
  { nameKanji: '西連寺春菜', nameKana: 'さいれんじはるな', nameEnglish: 'Haruna Sairenji', animeTitle: 'To LOVEる', voiceActorName: '矢作紗友里' },
  { nameKanji: '金色の闇', nameKana: 'こんじきのやみ', nameEnglish: 'Golden Darkness', animeTitle: 'To LOVEる', voiceActorName: '福圓美里' },
  { nameKanji: 'モモ・ベリア・デビルーク', nameKana: 'ももべりあでびるーく', nameEnglish: 'Momo Belia Deviluke', animeTitle: 'To LOVEる', voiceActorName: '豊崎愛生' },

  // SLAM DUNK 追加
  { nameKanji: '赤木剛憲', nameKana: 'あかぎたけのり', nameEnglish: 'Takenori Akagi', animeTitle: 'SLAM DUNK', voiceActorName: '梁田清之' },
  { nameKanji: '宮城リョータ', nameKana: 'みやぎりょーた', nameEnglish: 'Ryota Miyagi', animeTitle: 'SLAM DUNK', voiceActorName: '塩屋翼' },
  { nameKanji: '赤木晴子', nameKana: 'あかぎはるこ', nameEnglish: 'Haruko Akagi', animeTitle: 'SLAM DUNK', voiceActorName: '平松晶子' },

  // ヒカルの碁 追加
  { nameKanji: '藤原佐為', nameKana: 'ふじわらのさい', nameEnglish: 'Fujiwara no Sai', animeTitle: 'ヒカルの碁', voiceActorName: '千葉進歩' },

  // ワンパンマン 追加
  { nameKanji: '戦慄のタツマキ', nameKana: 'せんりつのたつまき', nameEnglish: 'Terrible Tornado', animeTitle: 'ワンパンマン', voiceActorName: '悠木碧' },
  { nameKanji: 'キング', nameKana: 'きんぐ', nameEnglish: 'King', animeTitle: 'ワンパンマン', voiceActorName: '安元洋貴' },

  // 宇崎ちゃんは遊びたい！ 追加
  { nameKanji: '亜細亜実', nameKana: 'あじあみ', nameEnglish: 'Ami Asai', animeTitle: '宇崎ちゃんは遊びたい！', voiceActorName: '三石琴乃' },
];

// Additional voice actors needed
const moreVoiceActors: VoiceActor[] = [
  { nameKanji: '野島裕史', nameKana: 'のじまひろふみ', nameEnglish: 'Hirofumi Nojima' },
  { nameKanji: '村川梨衣', nameKana: 'むらかわりえ', nameEnglish: 'Rie Murakawa' },
  { nameKanji: 'こおろぎさとみ', nameKana: 'こおろぎさとみ', nameEnglish: 'Satomi Korogi' },
  { nameKanji: '真柴摩利', nameKana: 'ましばまり', nameEnglish: 'Mari Mashiba' },
  { nameKanji: '朴璐美', nameKana: 'ぱくろみ', nameEnglish: 'Romi Park' },
  { nameKanji: '鈴木崚汰', nameKana: 'すずきりょうた', nameEnglish: 'Ryota Suzuki' },
  { nameKanji: '富田美憂', nameKana: 'とみたみゆ', nameEnglish: 'Miyu Tomita' },
  { nameKanji: '井上和彦', nameKana: 'いのうえかずひこ', nameEnglish: 'Kazuhiko Inoue' },
  { nameKanji: '石川英郎', nameKana: 'いしかわひでお', nameEnglish: 'Hideo Ishikawa' },
  { nameKanji: '古川登志夫', nameKana: 'ふるかわとしお', nameEnglish: 'Toshio Furukawa' },
  { nameKanji: '中尾隆聖', nameKana: 'なかおりゅうせい', nameEnglish: 'Ryusei Nakao' },
  { nameKanji: '平田広明', nameKana: 'ひらたひろあき', nameEnglish: 'Hiroaki Hirata' },
  { nameKanji: '大谷育江', nameKana: 'おおたにいくえ', nameEnglish: 'Ikue Otani' },
  { nameKanji: '山口由里子', nameKana: 'やまぐちゆりこ', nameEnglish: 'Yuriko Yamaguchi' },
  { nameKanji: '加藤英美里', nameKana: 'かとうえみり', nameEnglish: 'Emiri Kato' },
  { nameKanji: 'かかずゆみ', nameKana: 'かかずゆみ', nameEnglish: 'Yumi Kakazu' },
  { nameKanji: '木村昴', nameKana: 'きむらすばる', nameEnglish: 'Subaru Kimura' },
  { nameKanji: '瀬戸麻沙美', nameKana: 'せとあさみ', nameEnglish: 'Asami Seto' },
  { nameKanji: '松岡由貴', nameKana: 'まつおかゆき', nameEnglish: 'Yuki Matsuoka' },
  { nameKanji: '安元洋貴', nameKana: 'やすもとひろき', nameEnglish: 'Hiroki Yasumoto' },
  { nameKanji: '井上優', nameKana: 'いのうえゆう', nameEnglish: 'Yu Inoue' },
  { nameKanji: '近藤隆', nameKana: 'こんどうたかし', nameEnglish: 'Takashi Kondo' },
  { nameKanji: '沼倉愛美', nameKana: 'ぬまくらまなみ', nameEnglish: 'Manami Numakura' },
  { nameKanji: '藤井ゆきよ', nameKana: 'ふじいゆきよ', nameEnglish: 'Yukiyo Fujii' },
  { nameKanji: '矢作紗友里', nameKana: 'やはぎさゆり', nameEnglish: 'Sayuri Yahagi' },
  { nameKanji: '梁田清之', nameKana: 'やなだきよゆき', nameEnglish: 'Kiyoyuki Yanada' },
  { nameKanji: '塩屋翼', nameKana: 'しおやよく', nameEnglish: 'Yoku Shioya' },
  { nameKanji: '平松晶子', nameKana: 'ひらまつあきこ', nameEnglish: 'Akiko Hiramatsu' },
  { nameKanji: '岸尾だいすけ', nameKana: 'きしおだいすけ', nameEnglish: 'Daisuke Kishio' },
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

  return admin.app();
}

async function main() {
  console.log('='.repeat(60));
  console.log('Add More Characters and Voice Actors');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE\n');
  } else {
    console.log('\n🚀 LIVE MODE\n');
  }

  await initializeFirebase();
  const db = admin.firestore();

  // Get category IDs
  const animeCategory = await db.collection('hobbies').where('slug', '==', 'anime').get();
  const vaCategory = await db.collection('hobbies').where('slug', '==', 'voice-actors').get();
  const charCategory = await db.collection('hobbies').where('slug', '==', 'anime-characters').get();

  const animeCategoryId = animeCategory.docs[0].id;
  const vaCategoryId = vaCategory.docs[0].id;
  const charCategoryId = charCategory.docs[0].id;

  // Get anime map
  const animeItems = await db.collection('hobby_items').where('hobbyId', '==', animeCategoryId).get();
  const animeMap = new Map<string, string>();
  animeItems.docs.forEach(doc => animeMap.set(doc.data().title, doc.id));
  console.log(`Loaded ${animeMap.size} anime`);

  // Get existing voice actors
  const existingVAs = await db.collection('hobby_items').where('hobbyId', '==', vaCategoryId).get();
  const vaMap = new Map<string, string>();
  existingVAs.docs.forEach(doc => vaMap.set(doc.data().title, doc.id));
  console.log(`Found ${vaMap.size} existing voice actors`);

  // Combine all voice actors
  const allVoiceActors = [...voiceActorsData, ...moreVoiceActors];

  // Add voice actors
  console.log('\n📢 Adding voice actors...');
  let vaAdded = 0;

  for (const va of allVoiceActors) {
    if (vaMap.has(va.nameKanji)) continue;

    if (!DRY_RUN) {
      const docRef = await db.collection('hobby_items').add({
        hobbyId: vaCategoryId,
        title: va.nameKanji,
        description: '',
        images: [],
        thumbImage: '',
        isPublic: true,
        order: vaMap.size + vaAdded,
        customFields: {
          nameKanji: va.nameKanji,
          nameKana: va.nameKana,
          nameEnglish: va.nameEnglish,
        },
        tags: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      vaMap.set(va.nameKanji, docRef.id);
    } else {
      vaMap.set(va.nameKanji, 'dry-run-id');
    }
    console.log(`✅ VA: ${va.nameKanji}`);
    vaAdded++;
  }
  console.log(`Added ${vaAdded} voice actors`);

  // Get existing characters
  const existingChars = await db.collection('hobby_items').where('hobbyId', '==', charCategoryId).get();
  const charSet = new Set<string>();
  existingChars.docs.forEach(doc => charSet.add(doc.data().title));
  console.log(`\nFound ${charSet.size} existing characters`);

  // Add characters
  console.log('\n🎭 Adding characters...');
  let charAdded = 0;
  let charErrors = 0;

  for (const char of charactersData) {
    if (charSet.has(char.nameKanji)) continue;

    const animeId = animeMap.get(char.animeTitle);
    const voiceActorId = vaMap.get(char.voiceActorName);

    if (!animeId) {
      console.log(`⚠️ Anime not found: ${char.animeTitle}`);
      charErrors++;
      continue;
    }
    if (!voiceActorId) {
      console.log(`⚠️ VA not found: ${char.voiceActorName}`);
      charErrors++;
      continue;
    }

    if (!DRY_RUN) {
      await db.collection('hobby_items').add({
        hobbyId: charCategoryId,
        title: char.nameKanji,
        description: '',
        images: [],
        thumbImage: '',
        isPublic: true,
        order: charSet.size + charAdded,
        customFields: {
          nameKanji: char.nameKanji,
          nameKana: char.nameKana,
          nameEnglish: char.nameEnglish,
          animeId: animeId,
          voiceActorId: voiceActorId,
        },
        tags: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    console.log(`✅ ${char.nameKanji} (${char.animeTitle})`);
    charAdded++;
    charSet.add(char.nameKanji);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Voice actors added: ${vaAdded}`);
  console.log(`Characters added: ${charAdded}`);
  console.log(`Errors: ${charErrors}`);

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/add-more-characters.ts');
  }
}

main().catch(console.error);
