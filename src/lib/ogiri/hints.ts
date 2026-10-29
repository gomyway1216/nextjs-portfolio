/**
 * Answer patterns for stuck players. They show the shape of a joke, never the joke itself:
 * every pattern keeps placeholders for the player to fill. Client only, no network or storage.
 */
export type HintShape = 'reason' | 'line' | 'name' | 'rule' | 'thing' | 'event';
export interface AnswerHint {
  id: string;
  /** Empty means the pattern fits any prompt. */
  shapes: HintShape[];
  ja: string;
  en: string;
}

// The catalog `format` is not sent to the browser, so the shape comes from what the prompt asks for.
// Within one clause, order breaks ties: 「どんな名前？」 asks for a name even beside other keywords.
const SHAPE_RULES: [HintShape, RegExp][] = [
  ['name', /(名前|タイトル|曲名|題名|店名|名は|呼び名|キャッチコピー|ランク)/],
  ['line', /(一言|ひと言|何と|なんと|セリフ|台詞|言葉|挨拶|言い訳|文句|アナウンス|宣言|謝罪|返事|口癖|伝言|メッセージ|感想|食レポ|メモ|看板|広告|苦情|要望|字幕|口コミ|貼り紙|張り紙|評価|説明|指導)/],
  ['reason', /(理由|なぜ|原因|きっかけ|動機)/],
  ['rule', /(ルール|禁止|条件|マナー|注意|規則|決まり|校則)/],
  ['event', /(何をした|何が起き|どうなった|事件|トラブル|何があった|どうバレた|発見|困った|勘違い|何をして)/],
  ['thing', /(道具|機能|装置|もの|商品|メニュー|サービス|景品|記念品|売る|料理|おまけ|工夫|方法|装備|設備|荷物|対策)/],
];

function shapeOf(text: string): HintShape | null {
  return SHAPE_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** The question usually follows the last 「。」, so it wins over words in the setup. */
export function promptShape(prompt: string): HintShape | null {
  return shapeOf(prompt.split('。').at(-1) ?? '') ?? shapeOf(prompt);
}

export const ANSWER_HINTS: AnswerHint[] = [
  { id: 'gap', shapes: [], ja: '〇〇かと思ったら△△', en: 'Looks like ___, turns out ___' },
  { id: 'secret', shapes: [], ja: '実は〇〇だった', en: 'It was secretly ___ all along' },
  { id: 'too-much', shapes: [], ja: '〇〇すぎて△△', en: 'So ___ that ___' },
  { id: 'yet', shapes: [], ja: '〇〇なのに△△', en: '___, and yet ___' },
  { id: 'honest', shapes: [], ja: '建前は〇〇、本音は△△', en: 'Officially ___, honestly ___' },
  { id: 'tiny-ending', shapes: [], ja: '壮大に始めて、最後は〇〇（すごく地味なこと）', en: 'Start grand, end on something tiny: ___' },
  { id: 'number', shapes: [], ja: '妙に細かい数字を入れる（〇〇を37回）', en: 'Add an oddly exact number (___, 37 times)' },
  { id: 'their-view', shapes: [], ja: '〇〇の側から見ると△△', en: 'From ___\'s point of view: ___' },
  { id: 'three-step', shapes: [], ja: '〇〇、△△、そして□□（最後だけおかしい）', en: '___, ___, and then something absurd' },
  { id: 'modern', shapes: [], ja: '〇〇を今っぽく（アプリ・サブスク・口コミ）', en: 'Make ___ modern: an app, a subscription, a review' },
  { id: 'paperwork', shapes: [], ja: 'お役所っぽく「〇〇の申請が必要」', en: 'Make it bureaucratic: "___ requires a form"' },
  { id: 'kid', shapes: [], ja: '子どもの言い分みたいに〇〇', en: 'Put ___ the way a kid would' },
  { id: 'at-home', shapes: [], ja: 'みんなの家にある〇〇に置き換える', en: 'Swap in something every home has: ___' },
  { id: 'priority', shapes: [], ja: '〇〇より△△のほうが大事', en: '___ matters more than ___' },
  { id: 'petty', shapes: ['reason'], ja: '理由は〇〇だけ（くだらないほど良い）', en: 'The only reason is ___ (the pettier the better)' },
  { id: 'chain', shapes: ['reason'], ja: '〇〇だから△△、だから□□', en: 'Because ___, so ___, so ___' },
  { id: 'grudge', shapes: ['reason', 'event'], ja: '前に〇〇されたのを根に持っている', en: 'Still holding a grudge about ___' },
  { id: 'misheard', shapes: ['reason', 'event'], ja: '〇〇を△△と聞き間違えた', en: 'Misheard ___ as ___' },
  { id: 'whisper', shapes: ['line'], ja: '（小声で）〇〇', en: '(whispering) ___' },
  { id: 'excuse', shapes: ['line'], ja: '〇〇だから仕方ない', en: 'It\'s fine, because ___' },
  { id: 'infomercial', shapes: ['line', 'thing'], ja: '今なら〇〇もついてくる！', en: 'Order now and get ___ free!' },
  { id: 'formal', shapes: ['line'], ja: '〇〇の件につきまして', en: 'Regarding the matter of ___' },
  { id: 'my-line', shapes: ['line'], ja: '〇〇はこっちのセリフ', en: '"___" — that\'s my line' },
  { id: 'mashup', shapes: ['name'], ja: '2つの言葉をくっつける（〇〇＋△△）', en: 'Mash two words together: ___ + ___' },
  { id: 'championship', shapes: ['name'], ja: '第〇〇回 △△選手権', en: 'The ___th Annual ___ Championship' },
  { id: 'sequel', shapes: ['name'], ja: '〇〇2 〜△△の逆襲〜', en: '___ 2: Revenge of ___' },
  { id: 'literal', shapes: ['name'], ja: 'やることをそのまま名前に（〇〇するだけの△△）', en: 'Name it by what it does: the Only-Does-___ ___' },
  { id: 'only-on', shapes: ['rule'], ja: '〇〇の日だけ△△禁止', en: 'No ___, but only on ___' },
  { id: 'mild-penalty', shapes: ['rule'], ja: '破ったら〇〇（罰が軽すぎる）', en: 'Break it and the penalty is ___ (way too mild)' },
  { id: 'must-do', shapes: ['rule'], ja: '〇〇しないといけない（普通は禁止のこと）', en: 'You must ___ (something normally banned)' },
  { id: 'but-feature', shapes: ['thing'], ja: '〇〇機能つき、ただし△△', en: 'Comes with ___, but ___' },
  { id: 'only-for', shapes: ['thing'], ja: '〇〇専用の△△（使い道がせまい）', en: 'A ___ made only for ___' },
  { id: 'unasked', shapes: ['thing'], ja: '頼んでないのに〇〇がついてくる', en: 'Comes with ___ nobody asked for' },
  { id: 'overreact', shapes: ['event'], ja: '〇〇だけで全員が大騒ぎ', en: 'Everyone lost it over just ___' },
  { id: 'backfire', shapes: ['event'], ja: '〇〇しようとして△△になった', en: 'Tried to ___, ended up ___' },
  { id: 'unbothered', shapes: ['event'], ja: '大事件なのに、みんな〇〇していた', en: 'Huge event, but everyone just ___' },
];

/** Same seed gives the same order, so a re-render never reshuffles what the player saw. */
function shuffled<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Patterns that fit the prompt come first, then the general ones; no pattern repeats within a cycle. */
export function hintSequence(prompt: string, seed: number): AnswerHint[] {
  const shape = promptShape(prompt);
  const fitting = shape ? ANSWER_HINTS.filter((h) => h.shapes.includes(shape)) : [];
  const general = ANSWER_HINTS.filter((h) => !h.shapes.length);
  return [...shuffled(fitting, seed), ...shuffled(general, seed ^ 0x9e3779b9)];
}

/** The tap-th hint (0-based). Consecutive taps always differ because the sequence has no duplicates. */
export function hintAt(prompt: string, seed: number, tap: number): AnswerHint {
  const sequence = hintSequence(prompt, seed);
  return sequence[tap % sequence.length];
}

/** Nudge only a player who has written nothing once half the guide time has passed. */
export function shouldNudgeHint(remainingSeconds: number, answerSeconds: number, text: string): boolean {
  return answerSeconds > 0 && remainingSeconds * 2 <= answerSeconds && !text.trim();
}
