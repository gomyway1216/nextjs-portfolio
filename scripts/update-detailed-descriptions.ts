/**
 * Update all anime and TV shows with detailed descriptions
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.env.DRY_RUN !== 'false';

// Detailed anime descriptions
const animeDescriptions: Record<string, { ja: string; en: string }> = {
  'とらドラ！': {
    ja: '高校2年生の高須竜児は、目つきが悪いせいでヤンキーに見られがちな心優しい少年。一方、「手乗りタイガー」の異名を持つ逢坂大河は、見た目は可愛いが凶暴な性格の持ち主。ある日、竜児は大河が自分の親友・北村に恋していることを知り、大河も竜児が親友・実乃梨に恋していることを知る。お互いの恋を成就させるため協力関係を結んだ二人だが、一緒に過ごすうちに本当の恋に目覚めていく。笑いあり涙ありの王道ラブコメディ。',
    en: 'Ryuuji Takasu is a gentle high school student who looks like a delinquent due to his intimidating eyes. Taiga Aisaka, nicknamed "Palmtop Tiger," appears cute but has a fierce personality. When they discover each other\'s secret crushes on their respective best friends, they form an alliance to help each other. However, as they spend more time together, they begin to develop unexpected feelings for one another. A classic romantic comedy filled with laughter, tears, and heartwarming moments that has become a beloved staple of the genre.',
  },
  'おじさんとマシュマロ': {
    ja: 'マシュマロが大好きな中年サラリーマン・日下幅広と、彼に恋する後輩OL・若林伊織を描いたオフィスラブコメディ。伊織は日下にアプローチするためマシュマロを使った作戦を次々と仕掛けるが、鈍感な日下には全く伝わらない。ゆるくてほのぼのとした雰囲気の中、コミカルな恋愛模様が展開される。短編アニメながら、独特の空気感と愛らしいキャラクターで人気を博した作品。',
    en: 'An office romantic comedy about Hige Habahiro, a middle-aged salaryman who loves marshmallows, and Iori Wakabayashi, a younger female colleague who has a crush on him. Iori devises various schemes using marshmallows to get closer to Hige, but her efforts are lost on the oblivious man. Despite being a short-form anime, the series became popular for its relaxed, heartwarming atmosphere and endearing characters. The show offers a refreshing take on workplace romance with its unique comedic timing.',
  },
  'ご注文はうさぎですか？': {
    ja: '高校入学を機に新しい街にやってきたココアは、下宿先の喫茶店「ラビットハウス」で働くことに。そこでクールな店員のチノ、軍人気質のリゼ、和風喫茶の看板娘シャロ、小説家志望の千夜など、個性豊かな少女たちと出会う。うさぎのティッピーと共に繰り広げられる、可愛くて癒される日常系コメディ。美しい背景美術と丁寧なキャラクター描写で、視聴者に安らぎを与える作品として高い人気を誇る。',
    en: 'When Cocoa moves to a new town to attend high school, she ends up living and working at a café called Rabbit House. There she meets Chino, a cool and reserved barista, Rize, a girl with a military background, Sharo, who works at a Japanese-style café, and Chiya, an aspiring novelist. Together with the fluffy rabbit Tippy, these charming girls create heartwarming everyday moments. Known for its beautiful backgrounds and lovingly crafted character designs, this slice-of-life comedy has become a beloved comfort anime.',
  },
  'SLAM DUNK': {
    ja: '不良少年・桜木花道は、中学時代に50人もの女子にフラれた経験を持つ。高校で出会った赤木晴子に一目惚れした花道は、彼女に気に入られようとバスケットボール部に入部する。最初はバスケに興味がなかった花道だが、天性の身体能力と努力で急成長し、チームの主力選手へと成長していく。湘北高校バスケ部の仲間たちと共に、全国制覇を目指す熱い青春ストーリー。日本のバスケットボール人気に大きく貢献した伝説的作品。',
    en: 'Hanamichi Sakuragi is a delinquent who was rejected by 50 girls during middle school. When he falls for Haruko Akagi in high school, he joins the basketball team to impress her. Initially having no interest in the sport, Sakuragi\'s natural athletic ability and determination transform him into a key player. This legendary sports manga follows the Shohoku High basketball team on their quest for the national championship. The series is credited with popularizing basketball in Japan and remains one of the most influential sports anime ever created.',
  },
  'Re:ゼロから始める異世界生活': {
    ja: '引きこもりの少年ナツキ・スバルは、突然異世界に召喚される。そこで銀髪の美少女エミリアと出会い、彼女を助けようとするが、何者かに殺されてしまう。しかし死んだはずのスバルは、時間を遡って目覚める。「死に戻り」という能力に気づいたスバルは、幾度もの死を経験しながら、仲間たちを救うために運命に立ち向かう。残酷な死の描写と心理的な苦悩が特徴で、主人公の成長と絆を丁寧に描いた作品。',
    en: 'Shut-in teenager Subaru Natsuki is suddenly transported to another world, where he meets the silver-haired beauty Emilia. When he tries to help her, he is killed—only to wake up at an earlier point in time. Realizing he has the power of "Return by Death," Subaru must die repeatedly to save those he cares about and change his fate. The series is known for its brutal death scenes and psychological depth, carefully depicting the protagonist\'s growth through suffering and the bonds he forms along the way.',
  },
  'すのはら荘の管理人さん': {
    ja: '中学入学を機に上京してきた椎名亜樹は、男らしくなることを夢見る小柄な少年。彼が入居したすのはら荘の管理人・春原彩花は、包容力抜群の年上美人。亜樹は彩花さんに甘やかされながら、個性的な住人たちとの日常を送る。お姉さんキャラによる癒し系コメディとして人気を博し、視聴者に安らぎを与える作品。かわいらしいキャラクターデザインとほのぼのとした雰囲気が魅力。',
    en: 'Aki Shiina is a small-statured boy who moves to Tokyo for middle school, dreaming of becoming more masculine. The caretaker of his new residence, Sunohara-sou, is Ayaka Sunohara—a beautiful, nurturing older woman. Aki finds himself being pampered by Ayaka while living among the quirky residents. Popular for its comforting "big sister" character dynamics, this slice-of-life comedy provides viewers with a relaxing, heartwarming experience. The show is beloved for its cute character designs and gentle atmosphere.',
  },
  '終末なにしてますか？忙しいですか？救ってもらっていいですか？': {
    ja: '人類が滅亡した世界で、唯一の生き残りである青年ヴィレムは、妖精兵器と呼ばれる少女たちの管理者となる。彼女たちは戦争のために生み出された存在で、短い命を戦いに捧げる運命にある。ヴィレムは少女たちと心を通わせながら、彼女たちを救う方法を模索する。切なくも美しい世界観と、命の尊さを問いかける物語が心に響く。「すかすか」の愛称で親しまれ、感動的な結末が多くのファンの涙を誘った。',
    en: 'In a world where humanity has perished, Willem, the sole survivor, becomes the caretaker of fairy weapons—girls created for war who are destined to sacrifice their short lives in battle. As Willem grows close to these girls, he desperately searches for a way to save them. The story presents a bittersweet, beautiful world while questioning the value of life. Known affectionately as "SukaSuka," the series moved many fans to tears with its emotionally powerful conclusion and memorable characters.',
  },
  'その着せ替え人形は恋をする': {
    ja: '雛人形職人を目指す高校生・五条新菜は、内気で友人がいない。ある日、クラスの人気者・喜多川海夢がコスプレ衣装を作りたいと相談してくる。新菜は裁縫の腕を活かして海夢のコスプレを手伝うことに。正反対の二人が、コスプレを通じて距離を縮めていく青春ラブコメディ。オタク文化への深い理解と愛情が感じられる描写、そして魅力的なキャラクターたちの掛け合いが人気を博した。',
    en: 'Wakana Gojo is a shy high school student training to become a traditional doll craftsman, with no friends to speak of. One day, popular classmate Marin Kitagawa approaches him about making cosplay costumes. Using his sewing skills, Gojo begins helping Marin with her cosplay hobby. This romantic comedy follows two very different people growing closer through their shared interest. The series has been praised for its genuine appreciation of otaku culture and the charming interactions between its lovable characters.',
  },
  '浦安鉄筋家族': {
    ja: '千葉県浦安市を舞台に、大沢木家を中心とした住人たちのハチャメチャな日常を描くギャグ漫画のアニメ化作品。父・大鉄、母・順子、そして個性豊かな子供たちが巻き起こす騒動は常軌を逸している。下品でナンセンスな笑いが特徴で、何でもありのカオスな展開が魅力。浜岡賢次による原作漫画は長期連載を続け、日本のギャグ漫画史に残る作品として知られている。',
    en: 'Set in Urayasu, Chiba, this anime adaptation follows the outrageous daily lives of the Osawagi family and their neighbors. The father Daitetsu, mother Junko, and their eccentric children create chaos that defies all common sense. Known for its crude, nonsensical humor and anything-goes storylines, the series embraces pure comedic mayhem. The original manga by Kenji Hamaoka has enjoyed a long serialization and is recognized as a landmark in Japanese gag manga history.',
  },
  'だがしかし': {
    ja: '田舎の駄菓子屋の息子・鹿田ココノツは、漫画家を目指す少年。ある日、大手菓子メーカーの令嬢・枝垂ほたるが店を訪れ、ココノツの父を自社にスカウトしようとする。父が出した条件は「息子に店を継がせること」。ほたるはココノツを駄菓子の世界に引き込もうと、様々な駄菓子の魅力を熱く語り始める。実在の駄菓子が多数登場し、懐かしさとコメディが融合した独特の作品。',
    en: 'Kokonotsu Shikada is the son of a rural candy shop owner who dreams of becoming a manga artist. One day, Hotaru Shidare, the daughter of a major confectionery company, visits the shop to recruit Kokonotsu\'s father. His father\'s condition: his son must take over the shop first. Hotaru begins passionately introducing Kokonotsu to the world of dagashi (traditional Japanese penny candy). Featuring many real Japanese candies, this unique series blends nostalgia with comedy in an entertaining way.',
  },
  'からかい上手の高木さん': {
    ja: '中学生の西片は、隣の席の高木さんにいつもからかわれている。今日こそは仕返ししてやろうと様々な作戦を立てるが、いつも高木さんに見透かされて逆にからかわれてしまう。実は高木さんは西片のことが好きで、からかいを通じて距離を縮めようとしている。甘酸っぱい青春の一幕を切り取った、ほのぼのラブコメディ。二人の微笑ましいやり取りが読者・視聴者を温かい気持ちにさせる。',
    en: 'Middle schooler Nishikata is constantly being teased by his seatmate Takagi. He devises various plans to get back at her, but Takagi always sees through them and turns the tables. In truth, Takagi has feelings for Nishikata and uses her teasing as a way to get closer to him. This heartwarming romantic comedy captures the sweet moments of adolescence. The adorable interactions between the two protagonists never fail to bring smiles to readers and viewers alike.',
  },
  'クレヨンしんちゃん': {
    ja: '埼玉県春日部市に住む野原家の長男・しんのすけ（5歳）が主人公のファミリーコメディ。おませで自由奔放なしんのすけは、父・ひろし、母・みさえ、妹・ひまわり、愛犬・シロと共に騒動を巻き起こす。子供向けながら大人も楽しめる風刺やパロディが満載。1992年の放送開始以来、日本を代表する長寿アニメとして世界中で愛されている。劇場版は感動作も多く、幅広い世代に支持されている。',
    en: 'A family comedy starring five-year-old Shinnosuke Nohara, who lives with his family in Kasukabe, Saitama. The precocious and free-spirited Shinnosuke causes endless trouble alongside his father Hiroshi, mother Misae, baby sister Himawari, and dog Shiro. While aimed at children, the series is packed with satire and parodies that adults enjoy too. Since its debut in 1992, it has become one of Japan\'s most beloved long-running anime, popular worldwide. The theatrical films, many of which are genuinely moving, have earned fans across all generations.',
  },
  '名探偵コナン': {
    ja: '高校生探偵・工藤新一は、黒の組織の取引現場を目撃したことで毒薬を飲まされ、体が小学生に縮んでしまう。「江戸川コナン」と名乗り、幼馴染の毛利蘭の家に居候しながら、黒の組織を追う。毎回様々な事件を推理で解決しながら、組織の謎に迫っていく。1994年の連載開始以来、日本を代表するミステリー作品として君臨。緻密なトリックと伏線回収で、長年にわたりファンを魅了し続けている。',
    en: 'High school detective Shinichi Kudo witnesses a crime by the mysterious Black Organization and is forced to take a poison that shrinks his body to that of a child. Taking the name "Conan Edogawa," he lives with his childhood friend Ran Mouri while pursuing the organization. Each episode features Conan solving intricate cases while slowly uncovering the organization\'s secrets. Since its serialization began in 1994, it has reigned as Japan\'s premier mystery series. Its elaborate tricks and masterful foreshadowing continue to captivate fans decades later.',
  },
  '初恋限定。': {
    ja: '複数の中高生カップルの恋愛模様を描いたオムニバス形式のラブコメディ。それぞれの初恋のエピソードが並行して進行し、時に交差する。純粋で甘酸っぱい初恋の感情を丁寧に描写しており、思春期特有の不器用さや一途さが共感を呼ぶ。河下水希による原作漫画は週刊少年ジャンプで連載され、繊細な恋愛描写で人気を博した。爽やかな青春群像劇として、多くの読者の心に残る作品。',
    en: 'An omnibus-style romantic comedy depicting the love stories of multiple middle and high school couples. Each first love episode progresses in parallel, occasionally intersecting with others. The series carefully portrays the pure, bittersweet feelings of first love, resonating with viewers through its depiction of adolescent awkwardness and devotion. The original manga by Mizuki Kawashita was serialized in Weekly Shonen Jump and became popular for its delicate romance. A refreshing youth ensemble drama that has left a lasting impression on many readers.',
  },
  '彼女、お借りします': {
    ja: '大学生の木ノ下和也は、彼女にフラれた寂しさからレンタル彼女サービスを利用し、美少女・水原千鶴と出会う。嘘が嘘を呼び、家族や友人には本物の彼女だと紹介してしまう。千鶴との疑似恋愛を続ける中で、和也は本当の恋に目覚めていく。他にも魅力的なヒロインたちが登場し、複雑な恋愛模様を展開。現代的な設定とラブコメディの王道展開で人気を博したハーレム系ラブコメの代表作。',
    en: 'College student Kazuya Kinoshita, heartbroken after being dumped, uses a rental girlfriend service and meets the beautiful Chizuru Mizuhara. One lie leads to another, and he introduces her to his family and friends as his real girlfriend. As Kazuya continues this fake relationship, he begins to develop genuine feelings. With other charming heroines entering the picture, the romantic entanglements grow ever more complex. This popular harem romantic comedy has won fans with its modern premise and classic rom-com developments.',
  },
  '銀魂': {
    ja: '宇宙人「天人」が来襲し、侍の世が終わった江戸時代末期。かつて「白夜叉」と恐れられた坂田銀時は、今は万事屋を営むダメ人間。新八、神楽という仲間と共に、様々な依頼をこなしながらドタバタ劇を繰り広げる。パロディ満載のギャグ回から、感動のシリアス編まで幅広い展開が魅力。「週刊少年ジャンプ」の看板作品として長年連載され、アニメも大人気を博した。',
    en: 'In an alternate Edo period invaded by aliens called "Amanto," the age of samurai has ended. Gintoki Sakata, once feared as the "White Demon," now runs an odd-jobs business as a lazy bum. Together with Shinpachi and Kagura, he takes on various requests while causing mayhem. The series seamlessly shifts from parody-filled comedy episodes to emotionally powerful serious arcs. A flagship title of Weekly Shonen Jump with a long serialization, its anime adaptation also achieved massive popularity.',
  },
  '365歩のユウキ！！！': {
    ja: '明るく前向きな主人公・ユウキが、様々な困難に立ち向かいながら成長していく物語。一歩一歩着実に前進することの大切さを教えてくれる、勇気と希望に満ちた作品。日常の中での小さな挑戦や、友情・家族の絆を描きながら、視聴者に元気を与えるストーリーが展開される。ポジティブなメッセージ性と親しみやすいキャラクターで、幅広い世代に愛されている。',
    en: 'A story about the cheerful and optimistic protagonist Yuuki, who grows while facing various challenges. This work, full of courage and hope, teaches the importance of moving forward one step at a time. The story delivers an uplifting experience through everyday challenges, friendships, and family bonds. With its positive message and relatable characters, the series has been loved by audiences of all ages.',
  },
  'citrus': {
    ja: '母の再婚により、名門女子校に転入することになった柚子。そこで出会った生徒会長の芽衣は、なんと義理の姉妹になる相手だった。正反対の性格を持つ二人は反発し合うが、次第に複雑な感情を抱くようになる。女子高を舞台にした百合作品で、禁断の恋愛と家族の形を問いかける。繊細な心理描写とドラマチックな展開が特徴で、百合ジャンルの代表作として知られている。',
    en: 'When Yuzu transfers to a prestigious all-girls school due to her mother\'s remarriage, she meets student council president Mei—who turns out to be her new stepsister. Despite their opposing personalities causing friction, they gradually develop complicated feelings for each other. Set in an all-girls high school, this yuri series explores forbidden love and the meaning of family. Known for its nuanced psychological portrayal and dramatic developments, it stands as a landmark title in the yuri genre.',
  },
  '家庭教師ヒットマンREBORN!': {
    ja: 'ダメダメ中学生・沢田綱吉の前に、赤ん坊の姿をした殺し屋リボーンが現れる。リボーンはツナを次期マフィアのボスに育てるため、スパルタ教育を開始。「死ぬ気弾」を撃たれたツナは超人的な力を発揮し、次々と強敵と戦うことに。仲間たちとの絆、そして成長を描いた少年漫画の王道作品。コメディからバトル展開へとシフトし、リング争奪戦編以降は本格的なバトル漫画として人気を博した。',
    en: 'When the infant hitman Reborn appears before the hopeless middle schooler Tsunayoshi Sawada, his mission is to train Tsuna to become the next Mafia boss. Shot with the "Dying Will Bullet," Tsuna gains superhuman powers and must face increasingly powerful enemies. This shonen classic depicts bonds with friends and personal growth. The series evolved from comedy to intense battle arcs, gaining popularity as a full-fledged battle manga especially from the Ring Conflict arc onwards.',
  },
  '進撃の巨人': {
    ja: '人類は突如現れた巨人によって、ほぼ壊滅状態に追い込まれた。生き残った人々は三重の壁の中で暮らしていたが、超大型巨人の出現により壁が破壊される。母を巨人に殺されたエレン・イェーガーは、巨人を一匹残らず駆逐することを誓う。壮大なスケールで描かれるダークファンタジーは、複雑な世界観と衝撃的な展開で世界中を席巻した。人類の存亡をかけた戦いと、隠された真実が明らかになっていく。',
    en: 'Humanity was nearly wiped out when Titans suddenly appeared. Survivors lived within three concentric walls until the Colossal Titan breached them. Eren Yeager, whose mother was devoured by a Titan, vows to exterminate every last one. This dark fantasy epic took the world by storm with its complex worldview and shocking plot twists. The story follows humanity\'s desperate fight for survival while gradually unveiling long-hidden truths about their world.',
  },
  'ヒカルの碁': {
    ja: '小学生の進藤ヒカルは、祖父の蔵で古い碁盤を見つける。その碁盤に宿っていた平安時代の天才棋士・藤原佐為の霊がヒカルに取り憑く。佐為に導かれるまま碁を打ち始めたヒカルは、次第に囲碁の魅力に目覚め、プロ棋士を目指すようになる。囲碁ブームを巻き起こした社会現象的作品で、緻密な対局描写と主人公の成長が高く評価された。ライバル・塔矢アキラとの切磋琢磨も見どころ。',
    en: 'Elementary schooler Hikaru Shindo discovers an old Go board in his grandfather\'s warehouse. The ghost of Fujiwara no Sai, a Heian-era Go genius residing in the board, possesses Hikaru. Guided by Sai, Hikaru begins playing Go and gradually falls in love with the game, eventually pursuing a career as a professional player. This cultural phenomenon sparked a Go boom in Japan, praised for its detailed match depictions and the protagonist\'s growth. The rivalry with Akira Toya adds another compelling dimension.',
  },
  'はじめてのギャル': {
    ja: '非モテ高校生・羽柴ジュンイチは、友人たちに唆されてギャルの八女ゆかなに告白する。なぜか受け入れられ、二人の交際がスタート。ギャルの世界に戸惑いながらも、ジュンイチはゆかなとの関係を深めていく。ちょっとエッチでコメディタッチのラブストーリーで、個性的なキャラクターたちが物語を盛り上げる。見た目と中身のギャップを持つゆかなの魅力が光るラブコメディ作品。',
    en: 'Unpopular high schooler Junichi Hashiba is goaded by his friends into confessing to Yukana Yame, a gyaru. Surprisingly, she accepts, and they start dating. Despite being bewildered by the gyaru world, Junichi deepens his relationship with Yukana. This slightly ecchi romantic comedy features colorful characters who liven up the story. The series shines through Yukana\'s appeal, whose personality differs greatly from her flashy appearance.',
  },
  '可愛いだけじゃない式守さん': {
    ja: '和泉くんは不幸体質で、日常的にトラブルに見舞われる高校生。そんな彼の彼女・式守さんは、普段は可愛らしいが、和泉くんがピンチになるとイケメンに豹変する。式守さんの「可愛い」と「カッコいい」両方の魅力を描いたラブコメディ。甘々な二人の日常と、ギャップ萌えが楽しめる作品。個性的な友人たちも加わり、賑やかで温かい青春模様が展開される。',
    en: 'Izumi is a high school student plagued by constant misfortune. His girlfriend Shikimori is normally adorable, but transforms into a cool, handsome protector whenever Izumi is in danger. This romantic comedy showcases both Shikimori\'s cute and cool sides. The series offers plenty of sweet couple moments and gap moe appeal. With their unique group of friends joining in, the story presents a lively and heartwarming youth experience.',
  },
  'かぐや様は告らせたい': {
    ja: '秀知院学園生徒会の会長・白銀御行と副会長・四宮かぐやは、誰もが認める天才同士。お互いに惹かれ合っているが、プライドが高すぎて自分から告白できない。「先に告白した方が負け」という謎ルールのもと、相手に告白させるための頭脳戦を繰り広げる。ラブコメでありながら心理戦の要素も楽しめる独特の作品。書記の藤原千花や会計の石上優など、個性豊かなキャラクターも人気。',
    en: 'Student Council President Miyuki Shirogane and Vice President Kaguya Shinomiya of the elite Shuchiin Academy are both recognized geniuses. Though mutually attracted, their pride prevents either from confessing. Under the unspoken rule that "whoever confesses first loses," they engage in psychological warfare to make the other confess. This unique romantic comedy blends love with mind games. Supporting characters like Secretary Chika Fujiwara and Treasurer Yu Ishigami have also won many fans.',
  },
  'NARUTO－ナルト': {
    ja: '落ちこぼれ忍者・うずまきナルトは、里一番の忍者「火影」になることを夢見ている。体内に九尾の狐を封印されており、里の人々から疎まれていたが、仲間との出会いを通じて成長していく。友情、努力、師弟の絆、そして宿命との戦いを描いた王道少年漫画。世界中で愛される作品となり、日本の忍者文化を世界に広めた。続編「BORUTO」でも物語は続いている。',
    en: 'Naruto Uzumaki, an underdog ninja, dreams of becoming Hokage—the strongest ninja in his village. With the Nine-Tailed Fox sealed inside him, he was shunned by villagers but grows through encounters with comrades. This quintessential shonen manga depicts friendship, hard work, mentor-student bonds, and battles against fate. Beloved worldwide, it helped spread Japanese ninja culture globally. The story continues in the sequel series "BORUTO."',
  },
  '五等分の花嫁': {
    ja: '貧乏だが成績優秀な高校生・上杉風太郎は、家庭教師のアルバイトを始める。生徒は五つ子の美少女姉妹・中野家の娘たち。全員赤点レベルで勉強嫌いの五人を、なんとか卒業させようと奮闘する。物語は「五つ子の中の一人と結婚した」風太郎の回想として語られ、花嫁が誰なのかという謎が読者を惹きつけた。個性豊かな五姉妹それぞれの魅力と、恋愛模様が見どころ。',
    en: 'Futaro Uesugi, a poor but academically gifted high school student, takes a tutoring job. His students are the Nakano quintuplets—five beautiful sisters who all hate studying and are failing their classes. He struggles to help them graduate. The story is told as Futaro\'s recollection after marrying one of the quintuplets, and the mystery of which sister became the bride captivated readers. The distinct personalities and romantic developments of all five sisters are major highlights.',
  },
  'やはり俺の青春ラブコメはまちがっている。': {
    ja: 'ひねくれた性格の高校生・比企谷八幡は、「ぼっち」を極めた孤高の存在。教師の計らいで「奉仕部」に入部させられ、完璧超人の雪ノ下雪乃、明るいギャル由比ヶ浜結衣と出会う。人間関係を独自の理論で分析し、歪んだ方法で問題を解決していく八幡。本物の関係性とは何かを問いかける、一味違った青春ラブコメディ。ライトノベル原作で、深い心理描写が高く評価されている。',
    en: 'Hachiman Hikigaya is a cynical high schooler who has perfected the art of being a loner. Forced to join the "Service Club" by a teacher, he meets the perfect Yukino Yukinoshita and cheerful Yui Yuigahama. Hachiman analyzes relationships with his own twisted theories and solves problems in unconventional ways. This unique romantic comedy questions what genuine relationships truly mean. Based on a light novel, the series is praised for its deep psychological insight.',
  },
  'ソードアート・オンライン': {
    ja: '2022年、革新的なVRMMORPG「ソードアート・オンライン」がサービス開始。しかし、ログアウト不可能でゲーム内での死は現実の死を意味するデスゲームだった。プレイヤーのキリトは、ゲームクリアを目指しながら、ヒロインのアスナや仲間たちと絆を深めていく。仮想世界と現実の境界を問いかけるSFファンタジー。異世界転生ブームの先駆けとなり、世界的な人気を獲得した。',
    en: 'In 2022, the groundbreaking VRMMORPG "Sword Art Online" launches. But players discover they cannot log out—and dying in-game means death in reality. Player Kirito aims to clear the game while forming bonds with heroine Asuna and other players. This sci-fi fantasy questions the boundary between virtual and real worlds. A pioneer of the isekai boom, the series achieved worldwide popularity and influenced countless works that followed.',
  },
  'この素晴らしい世界に祝福を！': {
    ja: '引きこもりの佐藤和真は、事故で命を落とし異世界に転生することに。女神アクアを道連れにファンタジー世界へ旅立つが、アクアは見た目だけの役立たず。爆裂魔法しか使えないめぐみん、マゾヒストの女騎士ダクネスなど、クセの強い仲間たちと珍道中を繰り広げる。異世界転生もののお約束を逆手に取ったギャグファンタジー。略称「このすば」として親しまれ、コメディアニメの傑作として評価されている。',
    en: 'Shut-in Kazuma Sato dies in an accident and is reincarnated in another world. He drags the goddess Aqua along, but she turns out to be completely useless. Joined by Megumin, who can only cast explosion magic, and Darkness, a masochistic female knight, they embark on a chaotic adventure. This gag fantasy subverts isekai tropes at every turn. Known affectionately as "KonoSuba," it is celebrated as a masterpiece of comedy anime.',
  },
  'ドラゴンボール': {
    ja: '尻尾の生えた不思議な少年・孫悟空は、七つ集めるとどんな願いも叶える「ドラゴンボール」を求めて冒険の旅に出る。ブルマ、クリリン、ピッコロなど個性豊かな仲間たちと出会い、フリーザ、セル、魔人ブウといった強敵と死闘を繰り広げる。鳥山明による原作は世界中で愛され、バトル漫画のスタンダードを確立した。「かめはめ波」など多くの技が世界共通語となっている。',
    en: 'Son Goku, a mysterious boy with a tail, embarks on a journey to find the Dragon Balls—seven orbs that grant any wish when gathered. He meets colorful allies like Bulma, Krillin, and Piccolo, and battles formidable foes including Frieza, Cell, and Majin Buu. Akira Toriyama\'s manga is beloved worldwide and established the standard for battle manga. Techniques like the "Kamehameha" have become universally recognized across cultures.',
  },
  'なんでここに先生が！？': {
    ja: '高校生の佐藤一郎は、なぜか様々な場所で女性教師と二人きりのハプニングに遭遇する。温泉、トイレ、更衣室など、あり得ない状況での出来事が毎回展開される。複数の生徒と教師のカップルのエピソードがオムニバス形式で描かれる。お色気満載のラブコメディで、ハプニングの連続が笑いを誘う。過激な描写も多いが、それぞれのカップルの恋愛成就も丁寧に描かれている。',
    en: 'High schooler Ichiro Sato constantly finds himself in compromising situations alone with female teachers. Hot springs, restrooms, changing rooms—impossible scenarios unfold episode after episode. Multiple student-teacher couples are depicted in omnibus format. This ecchi romantic comedy generates laughs through continuous mishaps. While featuring provocative content, the series also carefully portrays each couple\'s romantic development.',
  },
  'ワンパンマン': {
    ja: '趣味でヒーローを始めた男・サイタマは、日々のトレーニングで最強の力を手に入れた。どんな敵も一撃で倒せるが、強すぎるゆえに戦いに虚しさを感じている。弟子のジェノスや他のヒーローたちと共に、怪人たちと戦う日々を送る。ONE原作のWeb漫画から始まり、村田雄介の作画でリメイクされ大ヒット。ヒーロー物のお約束を覆す設定と、圧倒的なアクションシーンが魅力。',
    en: 'Saitama, a man who became a hero for fun, trained so hard he became invincible. He can defeat any enemy with one punch, but his overwhelming strength leaves him feeling empty in battle. Alongside his disciple Genos and other heroes, he fights monsters daily. Starting as ONE\'s webcomic and redrawn by Yusuke Murata, it became a massive hit. The series captivates with its subversion of superhero tropes and spectacular action sequences.',
  },
  'ONE PIECE': {
    ja: 'かつて世界を支配した海賊王ゴールド・ロジャーが残した「ひとつなぎの大秘宝（ワンピース）」を求め、少年モンキー・D・ルフィは海賊となる。ゴムゴムの実を食べてゴム人間となったルフィは、仲間を集めながら「グランドライン」を目指す。友情、夢、冒険を描いた壮大な海洋ロマン。連載開始から25年以上経っても人気は衰えず、世界で最も売れている漫画としてギネス記録を持つ。',
    en: 'Inspired by the legendary treasure "One Piece" left by Pirate King Gol D. Roger, young Monkey D. Luffy sets out to become a pirate. After eating the Gum-Gum Fruit and becoming a rubber man, Luffy gathers crewmates and aims for the Grand Line. This epic maritime adventure celebrates friendship, dreams, and adventure. Over 25 years since its debut, its popularity hasn\'t waned, holding the Guinness World Record as the best-selling manga ever.',
  },
  '妻、小学生になる。': {
    ja: '最愛の妻・貴恵を亡くし、娘と共に悲しみに暮れる圭介。ある日、妻が小学生の少女として生まれ変わって現れる。戸惑いながらも、三人は新しい形の家族として再び歩み始める。生まれ変わりというファンタジー設定を通じて、家族の絆、喪失と再生を描いた感動作。コメディ要素を交えながらも、命の尊さと家族の温かさを問いかける深いテーマを持つ作品。',
    en: 'Keisuke lost his beloved wife Takae and has been grieving with his daughter. One day, his wife reappears—reincarnated as an elementary school girl. Despite the confusion, the three begin a new life as a different kind of family. Through the fantasy premise of reincarnation, this moving work explores family bonds, loss, and renewal. While incorporating comedic elements, the series addresses profound themes about the preciousness of life and familial warmth.',
  },
  'ドメスティックな彼女': {
    ja: '高校生の藤井夏生は、年上の女性・橘陽菜に恋をしていた。ある日、合コンで出会った橘瑠衣と成り行きで関係を持ってしまう。しかし父の再婚相手の連れ子が、なんと陽菜と瑠衣の姉妹だった。義理の姉妹との複雑な三角関係を描いたドラマチックなラブストーリー。禁断の恋愛と家族の形を問いかけ、感情の揺れ動きを繊細に描写。賛否両論を呼んだ結末も話題となった。',
    en: 'High schooler Natsuo Fujii is in love with an older woman, Hina Tachibana. At a mixer, he ends up in a relationship with Rui Tachibana. But when his father remarries, he discovers Hina and Rui are his new stepsisters. This dramatic love story depicts a complex love triangle with step-siblings. The series explores forbidden love and family dynamics with nuanced emotional portrayals. Its controversial ending sparked much debate among fans.',
  },
  '化物語': {
    ja: '高校生の阿良々木暦は、春休みに吸血鬼に襲われ、特殊な体質となる。その後、様々な「怪異」に関わる少女たちと出会い、彼女たちを救っていく。独特の言葉遊びと哲学的な対話、そしてシャフトによる斬新な映像表現が特徴。西尾維新の小説を原作とし、「物語シリーズ」として長く続くシリーズの第一作。深いキャラクター描写と独自の世界観で、多くのファンを獲得した。',
    en: 'High schooler Koyomi Araragi is attacked by a vampire during spring break and gains a special constitution. He then encounters various girls involved with supernatural "oddities" and works to save them. Characterized by unique wordplay, philosophical dialogue, and innovative visuals by studio Shaft, this adaptation of Nisio Isin\'s novel launched the long-running "Monogatari Series." Its deep character development and distinctive worldview have earned a devoted fanbase.',
  },
  'ロザリオとバンパイア': {
    ja: '平凡な少年・青野月音は、妖怪が通う「陽海学園」に入学してしまう。そこで出会った美少女・赤夜萌香は実はバンパイアだった。月音の血を吸った萌香は、普段とは違う強力なバンパイアに変身する。他にも魔女、雪女、サキュバスなど様々な妖怪の美少女たちに囲まれるハーレムコメディ。バトル要素も含みながら、ラブコメとして楽しめる作品。',
    en: 'Ordinary boy Tsukune Aono accidentally enrolls in Yokai Academy—a school for monsters. There he meets the beautiful Moka Akashiya, who is actually a vampire. When Moka drinks Tsukune\'s blood, she transforms into a powerful vampire quite different from her usual self. A harem comedy featuring various monster girls including witches, snow women, and succubi. The series blends battle elements with romantic comedy for an entertaining experience.',
  },
  'ドラえもん': {
    ja: '22世紀からやってきた猫型ロボット・ドラえもんが、何をやってもダメな小学生・野比のび太を助けるため、四次元ポケットから様々な「ひみつ道具」を出す。しかしのび太はいつも道具を悪用して失敗する。藤子・F・不二雄の代表作で、1969年の連載開始以来、日本を代表する国民的作品として愛され続けている。「どこでもドア」「タケコプター」など、道具は日本の共通言語となっている。',
    en: 'Doraemon, a cat robot from the 22nd century, helps the hopeless elementary schooler Nobita Nobi by producing various "secret gadgets" from his four-dimensional pocket. However, Nobita always misuses the tools and ends up failing. This masterpiece by Fujiko F. Fujio has been beloved as Japan\'s national icon since its serialization began in 1969. Gadgets like the "Anywhere Door" and "Take-copter" have become part of Japan\'s shared cultural vocabulary.',
  },
  'それでも歩は寄せてくる': {
    ja: '将棋部の部長・八乙女うるしは、後輩の田中歩にからかわれる日々を送っている。歩はうるしが好きで、将棋で勝ったら告白しようと決めている。しかし将棋の腕はうるしの方が上で、歩は毎回負けてしまう。「からかい上手の高木さん」の作者が描く、甘酸っぱい青春ラブコメディ。不器用だが一途な歩のアプローチと、照れるうるしのリアクションが見どころ。',
    en: 'Shogi club president Urushi Yaotome is constantly being teased by her junior, Ayumu Tanaka. Ayumu likes Urushi and has decided to confess once he beats her at shogi. But Urushi is the better player, so Ayumu keeps losing. From the creator of "Teasing Master Takagi-san" comes another sweet romantic comedy. The highlight is Ayumu\'s awkward but sincere approaches and Urushi\'s flustered reactions.',
  },
  '新世紀エヴァンゲリオン': {
    ja: '西暦2015年、「使徒」と呼ばれる謎の敵が人類を襲う。14歳の少年・碇シンジは、父が率いる秘密組織NERVで、人造人間エヴァンゲリオンに乗り使徒と戦うことになる。しかしシンジは戦いの中で心を蝕まれていく。ロボットアニメの枠を超え、深い心理描写と謎めいた世界観で社会現象を巻き起こした。90年代を代表する作品であり、現在もその影響力は計り知れない。',
    en: 'In 2015, mysterious enemies called "Angels" attack humanity. Fourteen-year-old Shinji Ikari is recruited by NERV, a secret organization led by his father, to pilot the artificial human Evangelion against the Angels. But the battles take a severe psychological toll on Shinji. Transcending the mecha genre, this series sparked a social phenomenon with its deep psychological exploration and enigmatic worldview. A defining work of the 1990s, its influence remains immeasurable today.',
  },
  '宇宙よりも遠い場所': {
    ja: '女子高生の玉木マリは、何かを始めたいと思いながら一歩を踏み出せずにいた。ある日、南極を目指す少女・小淵沢報瀬と出会い、一緒に南極観測隊に参加することを決意する。友人の三宅日向、白石結月も加わり、4人の少女たちは「宇宙よりも遠い場所」南極を目指す。夢に向かって踏み出す勇気、友情、そして成長を描いた感動の青春ストーリー。',
    en: 'High schooler Mari Tamaki wants to start something but can\'t take the first step. One day, she meets Shirase Kobuchizawa, who is determined to reach Antarctica. Mari decides to join an Antarctic expedition with her. Joined by Hinata Miyake and Yuzuki Shiraishi, four girls aim for "a place further than the universe"—Antarctica. An inspiring coming-of-age story about the courage to chase dreams, friendship, and growth.',
  },
  'To LOVEる': {
    ja: '平凡な高校生・結城リトの前に、宇宙人の王女・ララが突然現れる。ララはリトと結婚すると宣言し、そのまま居候することに。その後も様々な宇宙人の美少女たちが登場し、リトを巡る騒動は加速していく。お色気満載のハーレムラブコメディの代表作。続編「To LOVEる ダークネス」ではさらに過激な展開も。矢吹健太朗の美麗な作画も大きな魅力。',
    en: 'An alien princess named Lala suddenly appears before ordinary high schooler Rito Yuki. She declares she will marry him and moves in. More alien beauties continue to appear, escalating the chaos around Rito. A quintessential ecchi harem romantic comedy. The sequel "To Love Ru Darkness" features even more provocative content. Kentaro Yabuki\'s beautiful artwork is a major draw for the series.',
  },
  '呪術廻戦': {
    ja: '高校生の虎杖悠仁は、呪いの王・両面宿儺の指を飲み込んでしまい、宿儺を体内に宿すことになる。呪術師として呪いと戦う宿命を背負い、東京都立呪術高等専門学校に入学。五条悟をはじめとする個性的な師や仲間たちと共に、強大な呪霊たちと壮絶な戦いを繰り広げる。スタイリッシュなアクションと重厚なストーリーで、「鬼滅の刃」に続く大ヒット作となった。',
    en: 'High schooler Yuji Itadori swallows a finger of the King of Curses, Ryomen Sukuna, and becomes his vessel. Destined to fight curses as a jujutsu sorcerer, he enrolls in Tokyo Jujutsu High. Alongside unique mentors like Satoru Gojo and fellow students, he engages in fierce battles against powerful cursed spirits. With its stylish action and compelling story, the series became a massive hit following "Demon Slayer."',
  },
  '宇崎ちゃんは遊びたい！': {
    ja: '一人が好きな大学生・桜井真一は、後輩の宇崎花にいつも絡まれている。「先輩、今暇ですよね？」と遠慮なく話しかけてくる宇崎ちゃんは、鬱陶しいけど憎めない存在。最初は迷惑がっていた桜井も、次第に宇崎との時間を楽しむようになっていく。「うざカワイイ」後輩とのラブコメディ。二人のやり取りの面白さと、ゆるやかに進む恋模様が魅力。',
    en: 'Lone-wolf college student Shinichi Sakurai is constantly bothered by his junior Hana Uzaki. "Senpai, you\'re free right now, aren\'t you?" Uzaki approaches without hesitation—annoying yet endearing. Sakurai initially finds her a nuisance but gradually starts enjoying their time together. A romantic comedy featuring an "annoyingly cute" junior. The entertaining dynamics between the two and their slowly developing romance are the main attractions.',
  },
  'BLEACH': {
    ja: '霊が見える高校生・黒崎一護は、悪霊「虚（ホロウ）」を退治する死神・朽木ルキアと出会う。ルキアの力を譲り受けた一護は、死神代行として虚と戦うことに。やがて尸魂界（ソウルソサエティ）を巻き込む壮大な戦いへと発展していく。久保帯人による原作は独自の世界観とスタイリッシュなバトル描写で人気を博し、「週刊少年ジャンプ」の看板作品として約15年連載された。',
    en: 'High schooler Ichigo Kurosaki, who can see ghosts, meets Rukia Kuchiki—a Soul Reaper who fights evil spirits called Hollows. After receiving her powers, Ichigo becomes a substitute Soul Reaper. The conflict eventually expands into a grand battle involving the Soul Society. Tite Kubo\'s original work gained popularity for its unique worldview and stylish battle scenes, running as a flagship title in Weekly Shonen Jump for approximately 15 years.',
  },
};

// Detailed TV show descriptions
const tvDescriptions: Record<string, { ja: string; en: string }> = {
  'ズームイン!!朝!': {
    ja: '1979年から2011年まで日本テレビ系列で放送された朝の情報番組。司会を務めた徳光和夫のもと、ニュース、天気予報、エンタメ情報を届けた。全国の系列局からの中継リレーが特徴で、地域の話題を全国に発信した。朝の番組の先駆けとして、日本の朝のテレビ文化を確立した記念碑的番組。後継番組の「ZIP!」に引き継がれるまで、32年間日本の朝を支えた。',
    en: 'A morning news program that aired on Nippon TV from 1979 to 2011. Hosted by Kazuo Tokumitsu, it delivered news, weather, and entertainment. Known for its relay broadcasts from affiliate stations nationwide, sharing local stories across Japan. A pioneering morning show that established Japanese morning TV culture. It supported Japanese mornings for 32 years until succeeded by "ZIP!"',
  },
  'マイ★ボス マイ★ヒーロー': {
    ja: '2006年に日本テレビで放送された学園コメディドラマ。27歳のヤクザの組長・榊真喜男（長瀬智也）が、組を継ぐ条件として高校卒業を命じられ、高校生として学園生活を送る。不良が学校で奮闘するコメディと、真喜男の成長・友情を描いた感動的なストーリーが融合。長瀬智也の熱演と、新垣結衣、手越祐也など若手俳優の出演も話題となった大ヒットドラマ。',
    en: 'A school comedy drama that aired on Nippon TV in 2006. Makio Sakaki (Tomoya Nagase), a 27-year-old yakuza boss, is ordered to graduate high school to inherit the gang. This hit drama combined comedy of a delinquent struggling in school with an emotional story of growth and friendship. Nagase\'s passionate performance and appearances by young actors like Yui Aragaki and Yuya Tegoshi made it a memorable series.',
  },
  'ブラッディ・マンデイ': {
    ja: '2008年にTBS系列で放送されたサスペンスドラマ。天才ハッカーの高校生・高木藤丸（三浦春馬）が、テロリスト集団から日本を救うために戦う。サイバー犯罪と生物兵器テロを題材にした緊迫感のあるストーリー。三浦春馬の代表作の一つとなり、若者を中心に人気を博した。原作漫画の世界観を忠実に再現し、社会派サスペンスとして高い評価を得た。',
    en: 'A suspense drama that aired on TBS in 2008. Genius hacker high schooler Fujimaru Takagi (Haruma Miura) fights to save Japan from terrorists. A tense story involving cybercrime and biological weapons terrorism. It became one of Miura\'s signature roles and was popular especially among young viewers. Faithfully recreating the original manga\'s world, it earned high praise as a socially conscious thriller.',
  },
  'SASUKE': {
    ja: 'TBS系列で1997年から放送されているスポーツエンターテインメント番組。巨大なアスレチックコースを攻略する究極の障害物競争。一般人からアスリートまで、挑戦者たちが「完全制覇」を目指す。山田勝己など数々の伝説的挑戦者を生み出し、海外では「Ninja Warrior」として世界中で放送される人気番組となった。ファイナルステージまで到達できる者は極めて稀で、その過酷さが視聴者を魅了する。',
    en: 'A sports entertainment show airing on TBS since 1997. Contestants compete in the ultimate obstacle course challenge. From ordinary people to athletes, challengers aim for "complete victory." It created legendary competitors like Katsumi Yamada and became globally popular as "Ninja Warrior." Very few reach the Final Stage, and this extreme difficulty captivates viewers worldwide.',
  },
  '夕陽丘の探偵団': {
    ja: '1990年代にNHKで放送された子供向けミステリードラマ。夕陽丘に住む子供たちが探偵団を結成し、身近で起こる謎や事件を解決していく。子供目線で描かれるミステリーは親しみやすく、視聴者の子供たちも一緒に謎解きを楽しめる構成。友情と冒険心を描きながら、推理の楽しさを教えてくれる教育的要素も持った作品。NHKらしい丁寧な作りで、当時の子供たちに人気を博した。',
    en: 'A children\'s mystery drama that aired on NHK in the 1990s. Kids living in Yuuhigaoka form a detective club to solve mysteries in their neighborhood. The mysteries, told from a child\'s perspective, were accessible, allowing young viewers to enjoy solving puzzles along with the characters. While depicting friendship and adventure, it also taught the joy of deduction. With NHK\'s careful production, it was popular among children of that era.',
  },
  '不適切にもほどがある!': {
    ja: '2024年にTBS系列で放送されたタイムスリップコメディドラマ。1986年の体育教師・小川市郎（阿部サダヲ）が、現代の2024年にタイムスリップ。昭和のセクハラ・パワハラが当たり前だった価値観と、コンプライアンスが重視される令和の価値観のギャップを描いたコメディ。笑いの中にも、社会の変化や世代間ギャップを鋭く風刺している。阿部サダヲの怪演と宮藤官九郎の脚本が話題を呼んだ。',
    en: 'A time-slip comedy drama that aired on TBS in 2024. Ichiro Ogawa (Sadao Abe), a P.E. teacher from 1986, time-slips to 2024. The comedy highlights the gap between Showa-era values (where harassment was commonplace) and Reiwa-era emphasis on compliance. While comedic, it sharply satirizes social changes and generational gaps. Abe\'s wild performance and Kankuro Kudo\'s script generated much buzz.',
  },
  'バカ殿様': {
    ja: '志村けんが演じるコント番組で、1986年から2020年まで断続的に放送された。志村けんがおバカな殿様を演じ、家臣たちとドタバタ喜劇を繰り広げる時代劇コント。下品なギャグから人情話まで幅広い内容で、世代を超えて愛された。志村けんの代表作の一つであり、彼の死後もその功績は語り継がれている。お色気要素も特徴で、独特の笑いで日本のお茶の間を楽しませた。',
    en: 'A comedy show starring Ken Shimura, airing intermittently from 1986 to 2020. Shimura plays a foolish feudal lord in period comedy sketches with his retainers. From crude gags to heartwarming stories, it was loved across generations. One of Shimura\'s signature works, his legacy continues after his passing. Known for its risqué elements, it entertained Japanese households with its unique humor.',
  },
  '花より男子': {
    ja: '2005年にTBS系列で放送された学園恋愛ドラマ。セレブ御用達の英徳学園に通う一般庶民の牧野つくし（井上真央）が、学園を牛耳るイケメン4人組「F4」のリーダー・道明寺司（松本潤）と衝突しながら恋に落ちる。原作漫画の世界観を見事に再現し、社会現象となる大ヒット。続編やスペシャル版も制作され、松本潤と井上真央の代表作となった。',
    en: 'A school romance drama that aired on TBS in 2005. Ordinary girl Tsukushi Makino (Mao Inoue) attends elite Eitoku Academy, where she clashes with and eventually falls for Tsukasa Domyoji (Jun Matsumoto), leader of the handsome group "F4." Perfectly recreating the manga\'s world, it became a cultural phenomenon. With sequels and specials produced, it became a signature work for both Matsumoto and Inoue.',
  },
  '水曜日のダウンタウン': {
    ja: 'TBS系列で2014年から放送されているバラエティ番組。ダウンタウンがMCを務め、様々な「説」を検証する企画が人気。芸人やタレントを使った大掛かりなドッキリや実験的な企画も多く、予測不能な展開が視聴者を楽しませる。「○○説」という形式で提示される仮説を、実際に検証していくスタイルが斬新。過激な内容で話題になることも多い、攻めた内容のバラエティ番組。',
    en: 'A variety show airing on TBS since 2014, hosted by Downtown. Known for segments that verify various "theories." Features large-scale pranks on comedians and experimental projects, with unpredictable developments entertaining viewers. The format of presenting and testing hypotheses in "Theory of XX" style is innovative. Often makes headlines for its provocative content as an edgy variety program.',
  },
  '女王の教室': {
    ja: '2005年に日本テレビで放送された学園ドラマ。小学6年生のクラスを受け持つ阿久津真矢（天海祐希）は、冷酷で容赦ない教育方針で生徒たちを追い詰める。しかしその厳しさには、子供たちの将来を真剣に考える深い愛情があった。賛否両論を巻き起こしながらも高視聴率を記録し、教育のあり方を問いかけた話題作。天海祐希の圧倒的な存在感と、感動的な結末が印象的。',
    en: 'A school drama that aired on Nippon TV in 2005. Maya Akutsu (Yuki Amami), a 6th grade homeroom teacher, pushes students with cold, ruthless teaching methods. Yet her strictness stems from deep love and concern for their futures. Despite controversy, it earned high ratings and questioned educational approaches. Amami\'s overwhelming presence and the emotional conclusion left lasting impressions.',
  },
  '天才てれびくん': {
    ja: 'NHK教育テレビで1993年から放送されている子供向け教育バラエティ番組。「てれび戦士」と呼ばれる子役タレントたちが、様々なコーナーやドラマに出演する。多くの人気俳優・タレントを輩出しており、ウエンツ瑛士、生田斗真、大沢あかねなどが卒業生として知られる。時代と共に形式を変えながら30年以上続く長寿番組で、子供たちの夢と成長を見守り続けている。',
    en: 'A children\'s educational variety show airing on NHK E-Tele since 1993. Child talents called "TV Warriors" appear in various segments and dramas. Many popular actors emerged from this show, including Eiji Wentz, Toma Ikuta, and Akane Osawa. Running for over 30 years while evolving with the times, it continues to nurture children\'s dreams and growth.',
  },
  'トリビアの泉': {
    ja: 'フジテレビで2002年から2006年まで放送されたバラエティ番組。「明日使えるムダ知識」をコンセプトに、様々な雑学「トリビア」を紹介。視聴者から投稿されたトリビアを「へぇ」ボタンで評価するスタイルが人気を博し、「へぇ」が流行語となった。タモリと高橋克実の掛け合いも魅力で、知的好奇心を刺激する内容が幅広い世代に支持された。雑学ブームの火付け役となった番組。',
    en: 'A variety show that aired on Fuji TV from 2002 to 2006. With the concept of "useless knowledge you can use tomorrow," it introduced various trivia. The style of rating viewer-submitted trivia with "Hee" buttons became popular, and "Hee" became a buzzword. The banter between Tamori and Katsumi Takahashi was charming, and content stimulating intellectual curiosity was supported across generations. It sparked the trivia boom in Japan.',
  },
  '天才てれびくんワイド': {
    ja: '1999年から2003年までNHK教育で放送された「天才てれびくん」シリーズ。従来のシリーズを拡大し、より多くのコーナーとドラマ性を持たせたバージョン。この時期のてれび戦士には伊藤淳史、前田愛など、後に俳優として活躍する面々が多く在籍。教育的要素とエンターテインメントを両立させ、放課後の子供たちに夢と楽しさを届け続けた。',
    en: 'Part of the "Tensai Terebi-kun" series that aired on NHK E-Tele from 1999 to 2003. An expanded version with more segments and dramatic elements. TV Warriors during this period included Atsushi Ito and Ai Maeda, who later became successful actors. Balancing educational content with entertainment, it continued to bring dreams and fun to children after school.',
  },
  '特捜戦隊デカレンジャー': {
    ja: '2004年から2005年にかけてテレビ朝日系列で放送されたスーパー戦隊シリーズ第28作。宇宙の犯罪者と戦う「宇宙警察」の刑事たちを描いた作品。警察ものとしてのハードボイルドな要素と、戦隊ものの王道展開を融合。「ジャッジメント！」の決め台詞や、デカマスターなど追加戦士も人気を博した。スーパー戦隊シリーズの中でも特に評価の高い作品として、今なおファンに愛されている。',
    en: 'The 28th Super Sentai series, airing on TV Asahi from 2004-2005. It depicted "Space Police" detectives fighting intergalactic criminals. Combining hard-boiled police elements with classic Sentai action. The catchphrase "Judgment!" and additional warriors like DekaMaster were popular. Remains beloved as one of the most highly regarded entries in the Super Sentai franchise.',
  },
  '毎度おさわがせします': {
    ja: 'TBS系列で1985年から1987年にかけて放送された青春コメディドラマ。思春期の中高生たちの恋愛や性への興味を赤裸々に描き、当時としては過激な内容で話題に。中山美穂、木村一八など若手俳優が出演し、青春ドラマの新しい形を提示した。賛否両論ありながらも高視聴率を記録し、80年代を代表する青春ドラマとなった。シリーズ化され3作まで制作された。',
    en: 'A youth comedy drama that aired on TBS from 1985-1987. It candidly depicted teenagers\' romance and sexual curiosity, controversial for its time. Featuring young actors like Miho Nakayama, it presented a new form of youth drama. Despite mixed reactions, it achieved high ratings and became a defining 80s youth drama. The series produced three installments.',
  },
  'エンタの神様': {
    ja: '日本テレビで2003年から2010年まで放送されたお笑いネタ番組。毎回多くの芸人が登場し、漫才やコント、ピン芸を披露する。陣内智則、オリエンタルラジオ、アンガールズなど、多くの人気芸人を輩出したお笑い登竜門的番組。土曜の夜に放送され、お笑いブームを牽引した。「神様」のネーミングと独特の演出で、お笑いファンに親しまれた番組として記憶に残る。',
    en: 'A comedy showcase that aired on Nippon TV from 2003-2010. Each episode featured many comedians performing stand-up, duo acts, and skits. A gateway program that launched popular acts like Tomonori Jinnai, Oriental Radio, and Angirls. Airing Saturday nights, it drove the comedy boom. Remembered fondly by comedy fans for its "God" naming and unique presentation style.',
  },
  '魔法戦隊マジレンジャー': {
    ja: '2005年から2006年にかけてテレビ朝日系列で放送されたスーパー戦隊シリーズ第29作。魔法使いの一家が悪の軍団と戦う、ファンタジー色の強い作品。家族愛がテーマで、5人兄弟の絆と両親を巡る壮大なストーリーが展開される。魔法の設定を活かしたアクションと、感動的な家族ドラマで人気を博した。ハリー・ポッターブームの影響も受けた、魔法ファンタジー戦隊。',
    en: 'The 29th Super Sentai series, airing on TV Asahi from 2005-2006. A fantasy-heavy entry about a family of wizards fighting evil forces. Themed around family love, it featured an epic story about five siblings and their parents. Popular for magic-based action and emotional family drama. A magical fantasy Sentai influenced by the Harry Potter boom.',
  },
  '天才てれびくんMAX': {
    ja: '2003年から2011年までNHK教育で放送された「天才てれびくん」シリーズ。シリーズ最長の8年間続いた人気作で、大規模なドラマ企画や音楽コーナーが充実。てれび戦士の中からは、後に活躍する俳優やタレントが多数輩出された。バーチャル空間を舞台にした「天てれドラマ」など、新しい試みも積極的に取り入れた。子供番組の枠を超えた野心的な内容で、長く愛された。',
    en: 'Part of the "Tensai Terebi-kun" series that aired on NHK E-Tele from 2003-2011. The longest-running iteration at 8 years, featuring ambitious drama projects and music segments. Many TV Warriors later became successful actors and talents. It actively incorporated new experiments like virtual space dramas. Loved for its ambitious content that transcended children\'s programming.',
  },
  '家なき子': {
    ja: '日本テレビで1994年に放送されたドラマ。虐待を受けながらも強く生きる少女・相沢すず（安達祐実）の壮絶な人生を描いた作品。「同情するなら金をくれ！」という名台詞が流行語となり、社会現象を巻き起こした。当時12歳の安達祐実の熱演が高く評価され、彼女の代表作となった。家庭内暴力や貧困問題を扱った衝撃的な内容で、視聴者に強い印象を残した。',
    en: 'A drama that aired on Nippon TV in 1994. It depicted the harsh life of Suzu Aizawa (Yumi Adachi), a girl who lives strong despite abuse. The line "Don\'t pity me, give me money!" became a catchphrase and sparked a social phenomenon. 12-year-old Adachi\'s powerful performance was highly praised, becoming her signature role. Its shocking portrayal of domestic violence and poverty left strong impressions on viewers.',
  },
  '志村どうぶつ園': {
    ja: '日本テレビで2004年から2020年まで放送された動物バラエティ番組。志村けんと相葉雅紀がMCを務め、動物との触れ合いや保護活動を紹介した。チンパンジーのパン君との共演は特に人気で、長年にわたり視聴者に愛された。志村けんの死去後、番組は「I LOVE みんなのどうぶつ園」としてリニューアル。動物愛と笑いを融合させた、心温まる番組として16年間親しまれた。',
    en: 'An animal variety show that aired on Nippon TV from 2004-2020. Hosted by Ken Shimura and Masaki Aiba, it featured animal interactions and conservation efforts. Segments with chimpanzee Pan-kun were especially popular and beloved for years. After Shimura\'s death, it was renewed as "I Love Minna no Doubutsu-en." For 16 years, it was cherished as a heartwarming program combining animal love and laughter.',
  },
  'ごくせん': {
    ja: '日本テレビで2002年から断続的に放送された学園ドラマ。ヤクザの跡取り娘でありながら高校教師となった山口久美子（仲間由紀恵）が、問題児だらけのクラスを受け持つ。生徒を守るためには暴力も辞さない熱血教師の姿が人気を博し、シリーズ化された。松本潤、亀梨和也、赤西仁など、後にブレイクする俳優を多数輩出。「私の生徒に手を出すな！」のキメ台詞が印象的。',
    en: 'A school drama that aired intermittently on Nippon TV from 2002. Kumiko Yamaguchi (Yukie Nakama), a yakuza heir\'s daughter turned high school teacher, handles a class full of delinquents. The passionate teacher who uses force to protect students became popular, spawning a series. It launched careers of Jun Matsumoto, Kazuya Kamenashi, and Jin Akanishi. The catchphrase "Don\'t mess with my students!" is iconic.',
  },
  '家政婦のミタ': {
    ja: '日本テレビで2011年に放送されたドラマ。感情を表に出さず、依頼されたことは何でもこなす謎の家政婦・三田灯（松嶋菜々子）を描いた作品。崩壊寸前の阿須田家に派遣された三田の、淡々としながらも心に響く言動が話題に。最終回の視聴率は40%を超え、2011年のドラマ視聴率1位を記録した。「承知しました」「それは業務命令でしょうか」などの決め台詞が流行した。',
    en: 'A drama that aired on Nippon TV in 2011. It depicted Akari Mita (Nanako Matsushima), a mysterious housekeeper who shows no emotion and completes any request. Assigned to the dysfunctional Asuda family, her matter-of-fact yet touching actions became a topic of discussion. The finale exceeded 40% viewership, ranking #1 in 2011. Catchphrases like "Understood" and "Is that a work order?" became popular.',
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

  return admin.app();
}

async function main() {
  console.log('='.repeat(60));
  console.log('Update Detailed Descriptions');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE\n');
  } else {
    console.log('\n🚀 LIVE MODE\n');
  }

  await initializeFirebase();
  const db = admin.firestore();
  console.log('Firebase initialized');

  // Update Anime
  console.log('\n📺 Updating Anime descriptions...');
  const animeCategory = await db.collection('hobbies').where('slug', '==', 'anime').get();
  if (!animeCategory.empty) {
    const animeCategoryId = animeCategory.docs[0].id;
    const animeItems = await db.collection('hobby_items').where('hobbyId', '==', animeCategoryId).get();

    let animeUpdated = 0;
    let animeSkipped = 0;

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
        animeUpdated++;
      } else {
        console.log(`⏭️  No description for: ${title}`);
        animeSkipped++;
      }
    }
    console.log(`\nAnime: Updated ${animeUpdated}, Skipped ${animeSkipped}`);
  }

  // Update TV Shows
  console.log('\n📺 Updating TV Show descriptions...');
  const tvCategory = await db.collection('hobbies').where('slug', '==', 'tv-shows').get();
  if (!tvCategory.empty) {
    const tvCategoryId = tvCategory.docs[0].id;
    const tvItems = await db.collection('hobby_items').where('hobbyId', '==', tvCategoryId).get();

    let tvUpdated = 0;
    let tvSkipped = 0;

    for (const doc of tvItems.docs) {
      const data = doc.data();
      const title = data.title;
      const descriptions = tvDescriptions[title];

      if (descriptions) {
        if (DRY_RUN) {
          console.log(`[DRY RUN] Would update: ${title}`);
        } else {
          await db.collection('hobby_items').doc(doc.id).update({
            'customFields.tvDescription': descriptions.ja,
            'customFields.descriptionEn': descriptions.en,
          });
          console.log(`✅ ${title}`);
        }
        tvUpdated++;
      } else {
        console.log(`⏭️  No description for: ${title}`);
        tvSkipped++;
      }
    }
    console.log(`\nTV Shows: Updated ${tvUpdated}, Skipped ${tvSkipped}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done!');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\nTo run for real: DRY_RUN=false npx tsx scripts/update-detailed-descriptions.ts');
  }
}

main().catch(console.error);
