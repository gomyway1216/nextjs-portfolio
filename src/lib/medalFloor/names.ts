/**
 * The names players go by on the medal floor: short nicknames they choose, or
 * "Player 1234" until they do. Checked the same way in the browser (to say what
 * is wrong before anything is sent) and on the server (which is the one that
 * decides).
 *
 * A name may not be an email, a link or a phone number, may not pass for the
 * site or its owner, may not pass for somebody else's default name, and may not
 * be abusive in English or Japanese. The word lists are short on purpose: they
 * catch the obvious, and the owner can hide whatever gets past them.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 12;

export type NameRefusal = 'empty' | 'short' | 'long' | 'characters' | 'contact' | 'reserved' | 'abuse';

export type NameCheck = { ok: true; name: string } | { ok: false; reason: NameRefusal };

/** Letters and digits of any script, and a few marks that names use; nothing else (no emoji, no symbols, no control or invisible characters). */
const ALLOWED = /^[\p{L}\p{N} ._\-・ー〜]+$/u;
const COMBINING = /\p{M}/u;

/** Katakana to hiragana, so that one list covers both. */
const toHiragana = (text: string): string => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };

/** The name as the lists see it: lower case, kana as hiragana, digits read as the letters they stand in for, and nothing between the letters. */
function skeleton(name: string): string {
  return toHiragana(name.toLowerCase())
    .replace(/[0-9]/g, (digit) => LEET[digit] ?? digit)
    .replace(/[ ._\-・ー〜]/g, '');
}

/** The same with a letter written three times or more in a row taken once ("fuuuck"); twice is left, as names spell it ("shiitake"). */
const squeezed = (text: string): string => text.replace(/(.)\1{2,}/gu, '$1');

// Words that are abusive wherever they stand in a name.
const ABUSE_ANYWHERE = [
  // English
  'fuck', 'fuk', 'fck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'retard', 'rapist', 'nazi', 'hitler',
  'whore', 'slut', 'pussy', 'porn', 'penis', 'vagina', 'asshole', 'bastard', 'jizz', 'dildo', 'wank', 'twat', 'killyourself',
  'chink', 'kike', 'tranny', 'molest', 'sex', 'dick', 'boob', 'tits',
  // Japanese, in hiragana (katakana is read as hiragana first)
  'ちんこ', 'ちんぽ', 'ちんちん', 'まんこ', 'うんこ', 'せっくす', 'おっぱい', 'ちくび', 'ふぇら', 'れいぷ', 'ごうかん', 'しね', 'ころす',
  'きちがい', 'がいじ', 'ちゃんころ', 'ばいた', 'くそ', 'うんち',
  // English ones written in kana
  'ふぁっく', 'ふぁっきん', 'びっち', 'ぺにす', 'ぽるの', 'にがー', 'さのばびっち',
  // Japanese, in kanji
  '死ね', '氏ね', '殺す', '殺し', '強姦', '売春', '援交', '池沼', '基地外', '気違い', '支那', '糞',
];
// Words that are abusive as a whole word but are found inside harmless ones ("class", "cucumber"): refused only as the whole name or a word of it.
const ABUSE_WORDS = ['ass', 'cum', 'coon', 'hoe', 'fap', 'tit', 'nig', 'jap', 'anal', 'homo', 'kys', 'rape', 'pedo', 'ちょん'];
// What would pass for the site, its owner or its staff.
const RESERVED_ANYWHERE = ['admin', 'moderator', 'official', 'staff', 'owner', 'yudai', 'yaguchi', 'system', 'support', 'meetyudai', '管理', '運営', '公式', 'すたっふ', 'ゆうだい', '雄大', '矢口'];

/** What somebody else's name would look like before they choose one: "Player 1234", 「プレイヤー1234」, or the bare digits. */
const DEFAULT_LIKE = /^((player|ぷれいやー|ぷれーやー)\s*\d*|\d+)$/u;

export function checkName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const name = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (name.length === 0) return { ok: false, reason: 'empty' };
  // An email, a link or a phone number is refused as such, however long it is.
  if (/[@＠]/u.test(name) || /\b(https?|www)\b/iu.test(name) || /\.(com|net|org|jp|io|co|me|app|dev|info)\b/iu.test(name) || /\d{6,}/u.test(name.replace(/[ ._\-]/g, ''))) {
    return { ok: false, reason: 'contact' };
  }
  const length = Array.from(name).length;
  if (length < NAME_MIN) return { ok: false, reason: 'short' };
  if (length > NAME_MAX) return { ok: false, reason: 'long' };
  if (!ALLOWED.test(name) || COMBINING.test(name)) return { ok: false, reason: 'characters' };

  const plain = toHiragana(name.toLowerCase());
  const shape = skeleton(name);
  const shapes = [shape, squeezed(shape), plain.replace(/[ ._\-・ー〜]/g, '')];
  if (DEFAULT_LIKE.test(plain.replace(/[._\-・〜]/g, '').trim()) || RESERVED_ANYWHERE.some((word) => shapes.some((text) => text.includes(word)))) {
    return { ok: false, reason: 'reserved' };
  }
  if (ABUSE_ANYWHERE.some((word) => shapes.some((text) => text.includes(word)))) return { ok: false, reason: 'abuse' };
  const words = plain
    .split(/[ ._\-・〜]+/u)
    .filter(Boolean)
    .flatMap((word) => [word, skeleton(word), squeezed(skeleton(word))]);
  if (ABUSE_WORDS.some((word) => words.includes(word) || shape === word)) return { ok: false, reason: 'abuse' };
  return { ok: true, name };
}

/** The four digits a player is known by before they choose a name. */
export const isTag = (value: unknown): value is string => typeof value === 'string' && /^\d{4}$/.test(value);

/** A new player's four digits, from a random number in [0, 1). */
export const tagFrom = (random: number): string => String(Math.min(9_999, Math.max(0, Math.floor(random * 10_000)))).padStart(4, '0');
