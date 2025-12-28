/**
 * Add anime characters and voice actors for all anime
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
  animeTitle: string; // Will be resolved to animeId
  voiceActorName: string; // Will be resolved to voiceActorId
}

// Voice actors data
const voiceActorsData: VoiceActor[] = [
  // とらドラ！
  { nameKanji: '釘宮理恵', nameKana: 'くぎみやりえ', nameEnglish: 'Rie Kugimiya' },
  { nameKanji: '間島淳司', nameKana: 'まじまじゅんじ', nameEnglish: 'Junji Majima' },
  { nameKanji: '堀江由衣', nameKana: 'ほりえゆい', nameEnglish: 'Yui Horie' },
  // ご注文はうさぎですか？
  { nameKanji: '佐倉綾音', nameKana: 'さくらあやね', nameEnglish: 'Ayane Sakura' },
  { nameKanji: '水瀬いのり', nameKana: 'みなせいのり', nameEnglish: 'Inori Minase' },
  { nameKanji: '種田梨沙', nameKana: 'たねだりさ', nameEnglish: 'Risa Taneda' },
  // SLAM DUNK
  { nameKanji: '草尾毅', nameKana: 'くさおたけし', nameEnglish: 'Takeshi Kusao' },
  { nameKanji: '置鮎龍太郎', nameKana: 'おきあゆりょうたろう', nameEnglish: 'Ryotaro Okiayu' },
  { nameKanji: '緑川光', nameKana: 'みどりかわひかる', nameEnglish: 'Hikaru Midorikawa' },
  // Re:ゼロ
  { nameKanji: '小林裕介', nameKana: 'こばやしゆうすけ', nameEnglish: 'Yusuke Kobayashi' },
  { nameKanji: '高橋李依', nameKana: 'たかはしりえ', nameEnglish: 'Rie Takahashi' },
  // その着せ替え人形は恋をする
  { nameKanji: '直田姫奈', nameKana: 'すぐたひな', nameEnglish: 'Hina Suguta' },
  { nameKanji: '石毛翔弥', nameKana: 'いしげしょうや', nameEnglish: 'Shoya Ishige' },
  // からかい上手の高木さん
  { nameKanji: '梶裕貴', nameKana: 'かじゆうき', nameEnglish: 'Yuki Kaji' },
  // クレヨンしんちゃん
  { nameKanji: '小林由美子', nameKana: 'こばやしゆみこ', nameEnglish: 'Yumiko Kobayashi' },
  { nameKanji: 'ならはしみき', nameKana: 'ならはしみき', nameEnglish: 'Miki Narahashi' },
  { nameKanji: '森川智之', nameKana: 'もりかわとしゆき', nameEnglish: 'Toshiyuki Morikawa' },
  // 名探偵コナン
  { nameKanji: '高山みなみ', nameKana: 'たかやまみなみ', nameEnglish: 'Minami Takayama' },
  { nameKanji: '山崎和佳奈', nameKana: 'やまざきわかな', nameEnglish: 'Wakana Yamazaki' },
  { nameKanji: '山口勝平', nameKana: 'やまぐちかっぺい', nameEnglish: 'Kappei Yamaguchi' },
  // 銀魂
  { nameKanji: '杉田智和', nameKana: 'すぎたともかず', nameEnglish: 'Tomokazu Sugita' },
  { nameKanji: '阪口大助', nameKana: 'さかぐちだいすけ', nameEnglish: 'Daisuke Sakaguchi' },
  // 進撃の巨人
  { nameKanji: '井上麻里奈', nameKana: 'いのうえまりな', nameEnglish: 'Marina Inoue' },
  { nameKanji: '石川由依', nameKana: 'いしかわゆい', nameEnglish: 'Yui Ishikawa' },
  { nameKanji: '神谷浩史', nameKana: 'かみやひろし', nameEnglish: 'Hiroshi Kamiya' },
  // ヒカルの碁
  { nameKanji: '川上とも子', nameKana: 'かわかみともこ', nameEnglish: 'Tomoko Kawakami' },
  { nameKanji: '千葉進歩', nameKana: 'ちばすすむ', nameEnglish: 'Susumu Chiba' },
  // かぐや様は告らせたい
  { nameKanji: '古賀葵', nameKana: 'こがあおい', nameEnglish: 'Aoi Koga' },
  { nameKanji: '古川慎', nameKana: 'ふるかわまこと', nameEnglish: 'Makoto Furukawa' },
  { nameKanji: '小原好美', nameKana: 'こはらこのみ', nameEnglish: 'Konomi Kohara' },
  // NARUTO
  { nameKanji: '竹内順子', nameKana: 'たけうちじゅんこ', nameEnglish: 'Junko Takeuchi' },
  { nameKanji: '中村千絵', nameKana: 'なかむらちえ', nameEnglish: 'Chie Nakamura' },
  { nameKanji: '杉山紀彰', nameKana: 'すぎやまのりあき', nameEnglish: 'Noriaki Sugiyama' },
  // 五等分の花嫁
  { nameKanji: '松岡禎丞', nameKana: 'まつおかよしつぐ', nameEnglish: 'Yoshitsugu Matsuoka' },
  { nameKanji: '花澤香菜', nameKana: 'はなざわかな', nameEnglish: 'Kana Hanazawa' },
  { nameKanji: '竹達彩奈', nameKana: 'たけたつあやな', nameEnglish: 'Ayana Taketatsu' },
  { nameKanji: '伊藤美来', nameKana: 'いとうみく', nameEnglish: 'Miku Ito' },
  // やはり俺の青春ラブコメはまちがっている。
  { nameKanji: '江口拓也', nameKana: 'えぐちたくや', nameEnglish: 'Takuya Eguchi' },
  { nameKanji: '早見沙織', nameKana: 'はやみさおり', nameEnglish: 'Saori Hayami' },
  { nameKanji: '東山奈央', nameKana: 'とうやまなお', nameEnglish: 'Nao Toyama' },
  // ソードアート・オンライン
  { nameKanji: '戸松遥', nameKana: 'とまつはるか', nameEnglish: 'Haruka Tomatsu' },
  // この素晴らしい世界に祝福を！
  { nameKanji: '福島潤', nameKana: 'ふくしまじゅん', nameEnglish: 'Jun Fukushima' },
  { nameKanji: '雨宮天', nameKana: 'あまみやそら', nameEnglish: 'Sora Amamiya' },
  // ドラゴンボール
  { nameKanji: '野沢雅子', nameKana: 'のざわまさこ', nameEnglish: 'Masako Nozawa' },
  { nameKanji: '鶴ひろみ', nameKana: 'つるひろみ', nameEnglish: 'Hiromi Tsuru' },
  { nameKanji: '堀川りょう', nameKana: 'ほりかわりょう', nameEnglish: 'Ryo Horikawa' },
  // ワンパンマン
  { nameKanji: '古川慎', nameKana: 'ふるかわまこと', nameEnglish: 'Makoto Furukawa' },
  { nameKanji: '石川界人', nameKana: 'いしかわかいと', nameEnglish: 'Kaito Ishikawa' },
  // ONE PIECE
  { nameKanji: '田中真弓', nameKana: 'たなかまゆみ', nameEnglish: 'Mayumi Tanaka' },
  { nameKanji: '中井和哉', nameKana: 'なかいかずや', nameEnglish: 'Kazuya Nakai' },
  { nameKanji: '岡村明美', nameKana: 'おかむらあけみ', nameEnglish: 'Akemi Okamura' },
  // 化物語
  { nameKanji: '斎藤千和', nameKana: 'さいとうちわ', nameEnglish: 'Chiwa Saito' },
  // ドラえもん
  { nameKanji: '水田わさび', nameKana: 'みずたわさび', nameEnglish: 'Wasabi Mizuta' },
  { nameKanji: '大原めぐみ', nameKana: 'おおはらめぐみ', nameEnglish: 'Megumi Ohara' },
  // 新世紀エヴァンゲリオン
  { nameKanji: '緒方恵美', nameKana: 'おがためぐみ', nameEnglish: 'Megumi Ogata' },
  { nameKanji: '林原めぐみ', nameKana: 'はやしばらめぐみ', nameEnglish: 'Megumi Hayashibara' },
  { nameKanji: '宮村優子', nameKana: 'みやむらゆうこ', nameEnglish: 'Yuko Miyamura' },
  // 宇宙よりも遠い場所
  { nameKanji: '井口裕香', nameKana: 'いぐちゆか', nameEnglish: 'Yuka Iguchi' },
  // 呪術廻戦
  { nameKanji: '榎木淳弥', nameKana: 'えのきじゅんや', nameEnglish: 'Junya Enoki' },
  { nameKanji: '内田雄馬', nameKana: 'うちだゆうま', nameEnglish: 'Yuma Uchida' },
  { nameKanji: '中村悠一', nameKana: 'なかむらゆういち', nameEnglish: 'Yuichi Nakamura' },
  // BLEACH
  { nameKanji: '森田成一', nameKana: 'もりたまさかず', nameEnglish: 'Masakazu Morita' },
  { nameKanji: '折笠富美子', nameKana: 'おりかさふみこ', nameEnglish: 'Fumiko Orikasa' },
  // 家庭教師ヒットマンREBORN!
  { nameKanji: '国分優香里', nameKana: 'こくぶんゆかり', nameEnglish: 'Yukari Kokubun' },
  { nameKanji: '市瀬秀和', nameKana: 'いちのせひでかず', nameEnglish: 'Hidekazu Ichinose' },
  // だがしかし
  { nameKanji: '竹達彩奈', nameKana: 'たけたつあやな', nameEnglish: 'Ayana Taketatsu' },
  { nameKanji: '阿部敦', nameKana: 'あべあつし', nameEnglish: 'Atsushi Abe' },
  // citrus
  { nameKanji: '竹達彩奈', nameKana: 'たけたつあやな', nameEnglish: 'Ayana Taketatsu' },
  { nameKanji: '津田美波', nameKana: 'つだみなみ', nameEnglish: 'Minami Tsuda' },
  // To LOVEる
  { nameKanji: '戸松遥', nameKana: 'とまつはるか', nameEnglish: 'Haruka Tomatsu' },
  { nameKanji: '渡辺明乃', nameKana: 'わたなべあけの', nameEnglish: 'Akeno Watanabe' },
];

// Characters data - organized by anime
const charactersData: Character[] = [
  // とらドラ！
  { nameKanji: '逢坂大河', nameKana: 'あいさかたいが', nameEnglish: 'Taiga Aisaka', animeTitle: 'とらドラ！', voiceActorName: '釘宮理恵' },
  { nameKanji: '高須竜児', nameKana: 'たかすりゅうじ', nameEnglish: 'Ryuuji Takasu', animeTitle: 'とらドラ！', voiceActorName: '間島淳司' },
  { nameKanji: '櫛枝実乃梨', nameKana: 'くしえだみのり', nameEnglish: 'Minori Kushieda', animeTitle: 'とらドラ！', voiceActorName: '堀江由衣' },

  // ご注文はうさぎですか？
  { nameKanji: 'ココア', nameKana: 'ここあ', nameEnglish: 'Cocoa', animeTitle: 'ご注文はうさぎですか？', voiceActorName: '佐倉綾音' },
  { nameKanji: 'チノ', nameKana: 'ちの', nameEnglish: 'Chino', animeTitle: 'ご注文はうさぎですか？', voiceActorName: '水瀬いのり' },
  { nameKanji: 'リゼ', nameKana: 'りぜ', nameEnglish: 'Rize', animeTitle: 'ご注文はうさぎですか？', voiceActorName: '種田梨沙' },

  // SLAM DUNK
  { nameKanji: '桜木花道', nameKana: 'さくらぎはなみち', nameEnglish: 'Hanamichi Sakuragi', animeTitle: 'SLAM DUNK', voiceActorName: '草尾毅' },
  { nameKanji: '流川楓', nameKana: 'るかわかえで', nameEnglish: 'Kaede Rukawa', animeTitle: 'SLAM DUNK', voiceActorName: '緑川光' },
  { nameKanji: '三井寿', nameKana: 'みついひさし', nameEnglish: 'Hisashi Mitsui', animeTitle: 'SLAM DUNK', voiceActorName: '置鮎龍太郎' },

  // Re:ゼロから始める異世界生活
  { nameKanji: 'ナツキ・スバル', nameKana: 'なつきすばる', nameEnglish: 'Subaru Natsuki', animeTitle: 'Re:ゼロから始める異世界生活', voiceActorName: '小林裕介' },
  { nameKanji: 'エミリア', nameKana: 'えみりあ', nameEnglish: 'Emilia', animeTitle: 'Re:ゼロから始める異世界生活', voiceActorName: '高橋李依' },

  // その着せ替え人形は恋をする
  { nameKanji: '喜多川海夢', nameKana: 'きたがわまりん', nameEnglish: 'Marin Kitagawa', animeTitle: 'その着せ替え人形は恋をする', voiceActorName: '直田姫奈' },
  { nameKanji: '五条新菜', nameKana: 'ごじょうわかな', nameEnglish: 'Wakana Gojo', animeTitle: 'その着せ替え人形は恋をする', voiceActorName: '石毛翔弥' },

  // からかい上手の高木さん
  { nameKanji: '高木さん', nameKana: 'たかぎさん', nameEnglish: 'Takagi', animeTitle: 'からかい上手の高木さん', voiceActorName: '高橋李依' },
  { nameKanji: '西片', nameKana: 'にしかた', nameEnglish: 'Nishikata', animeTitle: 'からかい上手の高木さん', voiceActorName: '梶裕貴' },

  // クレヨンしんちゃん
  { nameKanji: '野原しんのすけ', nameKana: 'のはらしんのすけ', nameEnglish: 'Shinnosuke Nohara', animeTitle: 'クレヨンしんちゃん', voiceActorName: '小林由美子' },
  { nameKanji: '野原みさえ', nameKana: 'のはらみさえ', nameEnglish: 'Misae Nohara', animeTitle: 'クレヨンしんちゃん', voiceActorName: 'ならはしみき' },
  { nameKanji: '野原ひろし', nameKana: 'のはらひろし', nameEnglish: 'Hiroshi Nohara', animeTitle: 'クレヨンしんちゃん', voiceActorName: '森川智之' },

  // 名探偵コナン
  { nameKanji: '江戸川コナン', nameKana: 'えどがわこなん', nameEnglish: 'Conan Edogawa', animeTitle: '名探偵コナン', voiceActorName: '高山みなみ' },
  { nameKanji: '毛利蘭', nameKana: 'もうりらん', nameEnglish: 'Ran Mouri', animeTitle: '名探偵コナン', voiceActorName: '山崎和佳奈' },
  { nameKanji: '工藤新一', nameKana: 'くどうしんいち', nameEnglish: 'Shinichi Kudo', animeTitle: '名探偵コナン', voiceActorName: '山口勝平' },

  // 銀魂
  { nameKanji: '坂田銀時', nameKana: 'さかたぎんとき', nameEnglish: 'Gintoki Sakata', animeTitle: '銀魂', voiceActorName: '杉田智和' },
  { nameKanji: '志村新八', nameKana: 'しむらしんぱち', nameEnglish: 'Shinpachi Shimura', animeTitle: '銀魂', voiceActorName: '阪口大助' },
  { nameKanji: '神楽', nameKana: 'かぐら', nameEnglish: 'Kagura', animeTitle: '銀魂', voiceActorName: '釘宮理恵' },

  // 進撃の巨人
  { nameKanji: 'エレン・イェーガー', nameKana: 'えれんいぇーがー', nameEnglish: 'Eren Yeager', animeTitle: '進撃の巨人', voiceActorName: '梶裕貴' },
  { nameKanji: 'ミカサ・アッカーマン', nameKana: 'みかさあっかーまん', nameEnglish: 'Mikasa Ackerman', animeTitle: '進撃の巨人', voiceActorName: '石川由依' },
  { nameKanji: 'アルミン・アルレルト', nameKana: 'あるみんあるれると', nameEnglish: 'Armin Arlert', animeTitle: '進撃の巨人', voiceActorName: '井上麻里奈' },
  { nameKanji: 'リヴァイ', nameKana: 'りう゛ぁい', nameEnglish: 'Levi', animeTitle: '進撃の巨人', voiceActorName: '神谷浩史' },

  // ヒカルの碁
  { nameKanji: '進藤ヒカル', nameKana: 'しんどうひかる', nameEnglish: 'Hikaru Shindo', animeTitle: 'ヒカルの碁', voiceActorName: '川上とも子' },
  { nameKanji: '塔矢アキラ', nameKana: 'とうやあきら', nameEnglish: 'Akira Toya', animeTitle: 'ヒカルの碁', voiceActorName: '千葉進歩' },

  // かぐや様は告らせたい
  { nameKanji: '四宮かぐや', nameKana: 'しのみやかぐや', nameEnglish: 'Kaguya Shinomiya', animeTitle: 'かぐや様は告らせたい', voiceActorName: '古賀葵' },
  { nameKanji: '白銀御行', nameKana: 'しろがねみゆき', nameEnglish: 'Miyuki Shirogane', animeTitle: 'かぐや様は告らせたい', voiceActorName: '古川慎' },
  { nameKanji: '藤原千花', nameKana: 'ふじわらちか', nameEnglish: 'Chika Fujiwara', animeTitle: 'かぐや様は告らせたい', voiceActorName: '小原好美' },

  // NARUTO
  { nameKanji: 'うずまきナルト', nameKana: 'うずまきなると', nameEnglish: 'Naruto Uzumaki', animeTitle: 'NARUTO－ナルト', voiceActorName: '竹内順子' },
  { nameKanji: '春野サクラ', nameKana: 'はるのさくら', nameEnglish: 'Sakura Haruno', animeTitle: 'NARUTO－ナルト', voiceActorName: '中村千絵' },
  { nameKanji: 'うちはサスケ', nameKana: 'うちはさすけ', nameEnglish: 'Sasuke Uchiha', animeTitle: 'NARUTO－ナルト', voiceActorName: '杉山紀彰' },

  // 五等分の花嫁
  { nameKanji: '上杉風太郎', nameKana: 'うえすぎふうたろう', nameEnglish: 'Futaro Uesugi', animeTitle: '五等分の花嫁', voiceActorName: '松岡禎丞' },
  { nameKanji: '中野一花', nameKana: 'なかのいちか', nameEnglish: 'Ichika Nakano', animeTitle: '五等分の花嫁', voiceActorName: '花澤香菜' },
  { nameKanji: '中野二乃', nameKana: 'なかのにの', nameEnglish: 'Nino Nakano', animeTitle: '五等分の花嫁', voiceActorName: '竹達彩奈' },
  { nameKanji: '中野三玖', nameKana: 'なかのみく', nameEnglish: 'Miku Nakano', animeTitle: '五等分の花嫁', voiceActorName: '伊藤美来' },

  // やはり俺の青春ラブコメはまちがっている。
  { nameKanji: '比企谷八幡', nameKana: 'ひきがやはちまん', nameEnglish: 'Hachiman Hikigaya', animeTitle: 'やはり俺の青春ラブコメはまちがっている。', voiceActorName: '江口拓也' },
  { nameKanji: '雪ノ下雪乃', nameKana: 'ゆきのしたゆきの', nameEnglish: 'Yukino Yukinoshita', animeTitle: 'やはり俺の青春ラブコメはまちがっている。', voiceActorName: '早見沙織' },
  { nameKanji: '由比ヶ浜結衣', nameKana: 'ゆいがはまゆい', nameEnglish: 'Yui Yuigahama', animeTitle: 'やはり俺の青春ラブコメはまちがっている。', voiceActorName: '東山奈央' },

  // ソードアート・オンライン
  { nameKanji: 'キリト', nameKana: 'きりと', nameEnglish: 'Kirito', animeTitle: 'ソードアート・オンライン', voiceActorName: '松岡禎丞' },
  { nameKanji: 'アスナ', nameKana: 'あすな', nameEnglish: 'Asuna', animeTitle: 'ソードアート・オンライン', voiceActorName: '戸松遥' },

  // この素晴らしい世界に祝福を！
  { nameKanji: 'カズマ', nameKana: 'かずま', nameEnglish: 'Kazuma', animeTitle: 'この素晴らしい世界に祝福を！', voiceActorName: '福島潤' },
  { nameKanji: 'アクア', nameKana: 'あくあ', nameEnglish: 'Aqua', animeTitle: 'この素晴らしい世界に祝福を！', voiceActorName: '雨宮天' },
  { nameKanji: 'めぐみん', nameKana: 'めぐみん', nameEnglish: 'Megumin', animeTitle: 'この素晴らしい世界に祝福を！', voiceActorName: '高橋李依' },

  // ドラゴンボール
  { nameKanji: '孫悟空', nameKana: 'そんごくう', nameEnglish: 'Son Goku', animeTitle: 'ドラゴンボール', voiceActorName: '野沢雅子' },
  { nameKanji: 'ブルマ', nameKana: 'ぶるま', nameEnglish: 'Bulma', animeTitle: 'ドラゴンボール', voiceActorName: '鶴ひろみ' },
  { nameKanji: 'ベジータ', nameKana: 'べじーた', nameEnglish: 'Vegeta', animeTitle: 'ドラゴンボール', voiceActorName: '堀川りょう' },

  // ワンパンマン
  { nameKanji: 'サイタマ', nameKana: 'さいたま', nameEnglish: 'Saitama', animeTitle: 'ワンパンマン', voiceActorName: '古川慎' },
  { nameKanji: 'ジェノス', nameKana: 'じぇのす', nameEnglish: 'Genos', animeTitle: 'ワンパンマン', voiceActorName: '石川界人' },

  // ONE PIECE
  { nameKanji: 'モンキー・D・ルフィ', nameKana: 'もんきーでぃーるふぃ', nameEnglish: 'Monkey D. Luffy', animeTitle: 'ONE PIECE', voiceActorName: '田中真弓' },
  { nameKanji: 'ロロノア・ゾロ', nameKana: 'ろろのあぞろ', nameEnglish: 'Roronoa Zoro', animeTitle: 'ONE PIECE', voiceActorName: '中井和哉' },
  { nameKanji: 'ナミ', nameKana: 'なみ', nameEnglish: 'Nami', animeTitle: 'ONE PIECE', voiceActorName: '岡村明美' },

  // 化物語
  { nameKanji: '阿良々木暦', nameKana: 'あららぎこよみ', nameEnglish: 'Koyomi Araragi', animeTitle: '化物語', voiceActorName: '神谷浩史' },
  { nameKanji: '戦場ヶ原ひたぎ', nameKana: 'せんじょうがはらひたぎ', nameEnglish: 'Hitagi Senjougahara', animeTitle: '化物語', voiceActorName: '斎藤千和' },

  // ドラえもん
  { nameKanji: 'ドラえもん', nameKana: 'どらえもん', nameEnglish: 'Doraemon', animeTitle: 'ドラえもん', voiceActorName: '水田わさび' },
  { nameKanji: '野比のび太', nameKana: 'のびのびた', nameEnglish: 'Nobita Nobi', animeTitle: 'ドラえもん', voiceActorName: '大原めぐみ' },

  // 新世紀エヴァンゲリオン
  { nameKanji: '碇シンジ', nameKana: 'いかりしんじ', nameEnglish: 'Shinji Ikari', animeTitle: '新世紀エヴァンゲリオン', voiceActorName: '緒方恵美' },
  { nameKanji: '綾波レイ', nameKana: 'あやなみれい', nameEnglish: 'Rei Ayanami', animeTitle: '新世紀エヴァンゲリオン', voiceActorName: '林原めぐみ' },
  { nameKanji: '惣流・アスカ・ラングレー', nameKana: 'そうりゅうあすからんぐれー', nameEnglish: 'Asuka Langley Soryu', animeTitle: '新世紀エヴァンゲリオン', voiceActorName: '宮村優子' },

  // 宇宙よりも遠い場所
  { nameKanji: '玉木マリ', nameKana: 'たまきまり', nameEnglish: 'Mari Tamaki', animeTitle: '宇宙よりも遠い場所', voiceActorName: '水瀬いのり' },
  { nameKanji: '小淵沢報瀬', nameKana: 'こぶちざわしらせ', nameEnglish: 'Shirase Kobuchizawa', animeTitle: '宇宙よりも遠い場所', voiceActorName: '花澤香菜' },
  { nameKanji: '三宅日向', nameKana: 'みやけひなた', nameEnglish: 'Hinata Miyake', animeTitle: '宇宙よりも遠い場所', voiceActorName: '井口裕香' },

  // 呪術廻戦
  { nameKanji: '虎杖悠仁', nameKana: 'いたどりゆうじ', nameEnglish: 'Yuji Itadori', animeTitle: '呪術廻戦', voiceActorName: '榎木淳弥' },
  { nameKanji: '伏黒恵', nameKana: 'ふしぐろめぐみ', nameEnglish: 'Megumi Fushiguro', animeTitle: '呪術廻戦', voiceActorName: '内田雄馬' },
  { nameKanji: '五条悟', nameKana: 'ごじょうさとる', nameEnglish: 'Satoru Gojo', animeTitle: '呪術廻戦', voiceActorName: '中村悠一' },

  // BLEACH
  { nameKanji: '黒崎一護', nameKana: 'くろさきいちご', nameEnglish: 'Ichigo Kurosaki', animeTitle: 'BLEACH', voiceActorName: '森田成一' },
  { nameKanji: '朽木ルキア', nameKana: 'くちきるきあ', nameEnglish: 'Rukia Kuchiki', animeTitle: 'BLEACH', voiceActorName: '折笠富美子' },

  // 家庭教師ヒットマンREBORN!
  { nameKanji: '沢田綱吉', nameKana: 'さわだつなよし', nameEnglish: 'Tsunayoshi Sawada', animeTitle: '家庭教師ヒットマンREBORN!', voiceActorName: '国分優香里' },
  { nameKanji: 'リボーン', nameKana: 'りぼーん', nameEnglish: 'Reborn', animeTitle: '家庭教師ヒットマンREBORN!', voiceActorName: '市瀬秀和' },

  // だがしかし
  { nameKanji: '枝垂ほたる', nameKana: 'しだれほたる', nameEnglish: 'Hotaru Shidare', animeTitle: 'だがしかし', voiceActorName: '竹達彩奈' },
  { nameKanji: '鹿田ココノツ', nameKana: 'しかだここのつ', nameEnglish: 'Kokonotsu Shikada', animeTitle: 'だがしかし', voiceActorName: '阿部敦' },

  // citrus
  { nameKanji: '藍原柚子', nameKana: 'あいはらゆず', nameEnglish: 'Yuzu Aihara', animeTitle: 'citrus', voiceActorName: '竹達彩奈' },
  { nameKanji: '藍原芽衣', nameKana: 'あいはらめい', nameEnglish: 'Mei Aihara', animeTitle: 'citrus', voiceActorName: '津田美波' },

  // To LOVEる
  { nameKanji: 'ララ・サタリン・デビルーク', nameKana: 'ららさたりんでびるーく', nameEnglish: 'Lala Satalin Deviluke', animeTitle: 'To LOVEる', voiceActorName: '戸松遥' },
  { nameKanji: '結城リト', nameKana: 'ゆうきりと', nameEnglish: 'Rito Yuki', animeTitle: 'To LOVEる', voiceActorName: '渡辺明乃' },

  // 宇崎ちゃんは遊びたい！
  { nameKanji: '宇崎花', nameKana: 'うざきはな', nameEnglish: 'Hana Uzaki', animeTitle: '宇崎ちゃんは遊びたい！', voiceActorName: '大空直美' },
  { nameKanji: '桜井真一', nameKana: 'さくらいしんいち', nameEnglish: 'Shinichi Sakurai', animeTitle: '宇崎ちゃんは遊びたい！', voiceActorName: '赤羽根健治' },
];

// Additional voice actors for remaining characters
const additionalVoiceActors: VoiceActor[] = [
  { nameKanji: '大空直美', nameKana: 'おおぞらなおみ', nameEnglish: 'Naomi Ozora' },
  { nameKanji: '赤羽根健治', nameKana: 'あかばねけんじ', nameEnglish: 'Kenji Akabane' },
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
  console.log('Add Characters and Voice Actors');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE\n');
  } else {
    console.log('\n🚀 LIVE MODE\n');
  }

  await initializeFirebase();
  const db = admin.firestore();
  console.log('Firebase initialized\n');

  // Get category IDs
  const animeCategory = await db.collection('hobbies').where('slug', '==', 'anime').get();
  const vaCategory = await db.collection('hobbies').where('slug', '==', 'voice-actors').get();
  const charCategory = await db.collection('hobbies').where('slug', '==', 'anime-characters').get();

  const animeCategoryId = animeCategory.docs[0].id;
  const vaCategoryId = vaCategory.docs[0].id;
  const charCategoryId = charCategory.docs[0].id;

  console.log('Category IDs:');
  console.log('  Anime:', animeCategoryId);
  console.log('  Voice Actors:', vaCategoryId);
  console.log('  Characters:', charCategoryId);

  // Get all anime items and create a map
  const animeItems = await db.collection('hobby_items').where('hobbyId', '==', animeCategoryId).get();
  const animeMap = new Map<string, string>();
  animeItems.docs.forEach(doc => {
    animeMap.set(doc.data().title, doc.id);
  });
  console.log(`\nLoaded ${animeMap.size} anime items`);

  // Get existing voice actors
  const existingVAs = await db.collection('hobby_items').where('hobbyId', '==', vaCategoryId).get();
  const vaMap = new Map<string, string>();
  existingVAs.docs.forEach(doc => {
    vaMap.set(doc.data().title, doc.id);
  });
  console.log(`Found ${vaMap.size} existing voice actors`);

  // Combine all voice actors
  const allVoiceActors = [...voiceActorsData, ...additionalVoiceActors];

  // Add voice actors (skip if exists)
  console.log('\n📢 Adding voice actors...');
  let vaAdded = 0;
  let vaSkipped = 0;

  for (const va of allVoiceActors) {
    if (vaMap.has(va.nameKanji)) {
      vaSkipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would add VA: ${va.nameKanji}`);
      vaMap.set(va.nameKanji, 'dry-run-id');
    } else {
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
      console.log(`✅ Added VA: ${va.nameKanji}`);
    }
    vaAdded++;
  }
  console.log(`Voice actors: Added ${vaAdded}, Skipped ${vaSkipped}`);

  // Get existing characters
  const existingChars = await db.collection('hobby_items').where('hobbyId', '==', charCategoryId).get();
  const charSet = new Set<string>();
  existingChars.docs.forEach(doc => {
    charSet.add(doc.data().title);
  });
  console.log(`\nFound ${charSet.size} existing characters`);

  // Add characters
  console.log('\n🎭 Adding characters...');
  let charAdded = 0;
  let charSkipped = 0;
  let charErrors = 0;

  for (const char of charactersData) {
    if (charSet.has(char.nameKanji)) {
      charSkipped++;
      continue;
    }

    const animeId = animeMap.get(char.animeTitle);
    const voiceActorId = vaMap.get(char.voiceActorName);

    if (!animeId) {
      console.log(`⚠️  Anime not found: ${char.animeTitle} (for ${char.nameKanji})`);
      charErrors++;
      continue;
    }

    if (!voiceActorId) {
      console.log(`⚠️  Voice actor not found: ${char.voiceActorName} (for ${char.nameKanji})`);
      charErrors++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would add: ${char.nameKanji} (${char.animeTitle})`);
    } else {
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
      console.log(`✅ Added: ${char.nameKanji} (${char.animeTitle})`);
    }
    charAdded++;
    charSet.add(char.nameKanji);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Voice actors: Added ${vaAdded}, Skipped ${vaSkipped}`);
  console.log(`Characters: Added ${charAdded}, Skipped ${charSkipped}, Errors ${charErrors}`);

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/add-characters-and-voice-actors.ts');
  }
}

main().catch(console.error);
