/** Things anyone can draw in a minute. The wrong choices come from the same group, so a cat has to
 * look like a cat and not just "an animal". */
export const QUIZ_WORDS: Record<string, string[]> = {
  animals: ['ねこ', 'いぬ', 'うさぎ', 'ぞう', 'きりん', 'ぶた', 'へび', 'かめ', 'ペンギン', 'ライオン', 'かに', 'たこ'],
  food: ['りんご', 'バナナ', 'おにぎり', 'ケーキ', 'ラーメン', 'すし', 'ピザ', 'ドーナツ', 'ソフトクリーム', 'ハンバーガー', 'ぶどう', 'いちご'],
  vehicles: ['くるま', 'でんしゃ', 'ひこうき', 'ふね', 'じてんしゃ', 'バス', 'ロケット', 'ヘリコプター', 'しょうぼうしゃ', 'パトカー'],
  nature: ['たいよう', 'つき', 'ほし', 'にじ', 'かみなり', 'ゆきだるま', 'やま', 'はな', 'き', 'くも'],
  things: ['かさ', 'めがね', 'とけい', 'かぎ', 'はさみ', 'えんぴつ', 'でんわ', 'テレビ', 'いす', 'ぼうし', 'くつ', 'カメラ'],
  play: ['サッカーボール', 'ギター', 'ピアノ', 'たいこ', 'ふうせん', 'ロボット', 'おばけ', 'プレゼント', 'はなび', 'かんむり'],
};
export const QUIZ_CHOICES = 4;
