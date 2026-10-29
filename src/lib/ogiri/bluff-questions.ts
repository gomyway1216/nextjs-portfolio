/**
 * Original question wording for うそ回答まぜ. Every answer was checked against the linked page
 * (2026-10-29); `also` lists spellings that count as the truth when rejecting a fake.
 */
export interface BluffQuestion {
  text: string;
  answer: string;
  also?: string[];
  sourceUrl: string;
}

const wiki = (title: string) => `https://ja.wikipedia.org/wiki/${title}`;

export const BLUFF_QUESTIONS: BluffQuestion[] = [
  { text: '靴ひもの両端についている、プラスチックや金属の小さな覆い。何と呼ぶ？', answer: 'アグレット', sourceUrl: wiki('アグレット') },
  { text: '食パンの袋の口を留める、平たいプラスチックの留め具。その名前は？', answer: 'バッグ・クロージャー', also: ['クロージャー'], sourceUrl: wiki('バッグ・クロージャー') },
  { text: '鼻の下から上くちびるまで伸びる、縦のみぞ。何という名前？', answer: '人中', also: ['じんちゅう', 'にんちゅう'], sourceUrl: wiki('人中') },
  { text: 'ゴルフボールの表面に並ぶ、たくさんのくぼみ。何と呼ぶ？', answer: 'ディンプル', sourceUrl: wiki('ゴルフ#ゴルフボール') },
  { text: '瓶の王冠の側面にあるギザギザ。世界共通で何本？', answer: '21本', also: ['21'], sourceUrl: wiki('王冠_(栓)') },
  { text: '東京タワーを建てた会社の、もともとの社名は？', answer: '日本電波塔株式会社', also: ['日本電波塔'], sourceUrl: wiki('東京タワー') },
  { text: 'エベレスト、ネパールでは何と呼ばれている？', answer: 'サガルマータ', sourceUrl: wiki('エベレスト') },
  { text: 'ニシゴリラの学名を、カタカナで読むと？', answer: 'ゴリラ・ゴリラ', also: ['Gorilla gorilla'], sourceUrl: wiki('ニシゴリラ') },
  { text: '2016年に日本鉱物科学会が選んだ「日本の国石」は？', answer: 'ヒスイ', also: ['翡翠'], sourceUrl: wiki('ヒスイ') },
  { text: '「日本の国蝶」として知られるチョウは？', answer: 'オオムラサキ', also: ['大紫'], sourceUrl: wiki('オオムラサキ') },
  { text: '1947年に日本鳥学会が選んだ、日本の国鳥は？', answer: 'キジ', also: ['雉'], sourceUrl: wiki('キジ') },
  { text: '家電メーカー「シャープ」。その社名の由来は？', answer: '創業者が発明した繰り出し鉛筆', also: ['シャープペンシル'], sourceUrl: wiki('シャープ') },
  { text: '日本で「ホッチキス」と呼ばれるようになった理由は？', answer: '最初に輸入された製品のメーカー名', also: ['メーカー名', '会社名'], sourceUrl: wiki('ステープラー') },
  { text: '「ランドセル」の語源になった言葉は？', answer: 'オランダ語の「背嚢」', also: ['ransel', 'オランダ語'], sourceUrl: wiki('ランドセル') },
  { text: '「イクラ」という言葉は、もともと何語？', answer: 'ロシア語', sourceUrl: wiki('イクラ') },
  { text: '英語の「パイナップル」。もともとは何を指す言葉だった？', answer: '松ぼっくり', also: ['松かさ'], sourceUrl: wiki('パイナップル') },
  { text: 'QRコードを発明したのは、どんな会社のチーム？', answer: '自動車部品メーカーのデンソー', also: ['デンソー', 'デンソーウェーブ'], sourceUrl: wiki('QRコード') },
  { text: '世界で初めて点字ブロックが敷かれた場所は？', answer: '岡山市の交差点', also: ['岡山', '岡山市', '岡山県'], sourceUrl: wiki('視覚障害者誘導用ブロック') },
  { text: '消しゴムが生まれる前、鉛筆の字を消すのに使われていたものは？', answer: 'パン', sourceUrl: wiki('消しゴム') },
  { text: 'ジーンズの右前にある小さなポケット。もともとは何を入れるため？', answer: '懐中時計', sourceUrl: wiki('ジーンズ') },
  { text: '「うだつが上がらない」の「うだつ」って何？', answer: '屋根の上の防火壁', also: ['防火壁'], sourceUrl: wiki('うだつ') },
  { text: 'ウォンバットのフンは、どんな形？', answer: 'サイコロのような立方体', also: ['立方体', 'サイコロ'], sourceUrl: wiki('ウォンバット') },
  { text: '真っ白に見えるホッキョクグマ。毛の下の皮膚は何色？', answer: '黒', also: ['黒色'], sourceUrl: wiki('ホッキョクグマ') },
  { text: 'フラミンゴの羽がピンク色になる理由は？', answer: '食べ物に含まれる色素', also: ['エサの色素', '餌の色素'], sourceUrl: wiki('フラミンゴ') },
  { text: 'タコには心臓がいくつある？', answer: '3つ', also: ['3', '三つ', '3個'], sourceUrl: wiki('タコ') },
  { text: 'タツノオトシゴの子育て、ほかの魚と違う点は？', answer: 'オスがお腹の袋で卵を守る', sourceUrl: wiki('タツノオトシゴ') },
  { text: '敵に襲われたナマコがすることは？', answer: '内臓を吐き出す', sourceUrl: wiki('ナマコ') },
  { text: 'サメの骨格は、何でできている？', answer: '軟骨', sourceUrl: wiki('サメ') },
  { text: 'イチゴの表面のつぶつぶ。その正体は？', answer: '痩果という果実', also: ['痩果', '果実'], sourceUrl: wiki('イチゴ') },
  { text: '背の高いバナナ。植物としては、実は何の仲間？', answer: '草', also: ['草本'], sourceUrl: wiki('バナナ') },
  { text: '金星が1回自転するのにかかるのは、地球の日で約何日？', answer: '約243日', also: ['243日', '243'], sourceUrl: wiki('金星') },
  { text: 'カバが皮膚から出すピンク色の粘液。何と呼ばれている？', answer: '血の汗', sourceUrl: wiki('カバ') },
  { text: '「海鞘」の読み方は？', answer: 'ほや', sourceUrl: wiki('ホヤ') },
  { text: '「海星」の読み方は？', answer: 'ひとで', sourceUrl: wiki('ヒトデ') },
  { text: '「膃肭臍」の読み方は？', answer: 'おっとせい', sourceUrl: wiki('オットセイ') },
  { text: '「翌檜」の読み方は？', answer: 'あすなろ', sourceUrl: wiki('アスナロ') },
  { text: '「蟷螂」の読み方は？', answer: 'かまきり', sourceUrl: wiki('カマキリ') },
  { text: '「心太」の読み方は？', answer: 'ところてん', sourceUrl: wiki('ところてん') },
  { text: '「欠伸」の読み方は？', answer: 'あくび', sourceUrl: wiki('あくび') },
  { text: '「案山子」の読み方は？', answer: 'かかし', sourceUrl: wiki('かかし') },
  { text: '「土竜」の読み方は？', answer: 'もぐら', sourceUrl: wiki('モグラ科') },
];
