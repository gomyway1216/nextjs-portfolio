import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIES, type Prompt } from '../../src/lib/ogiri/types';

const root = resolve('src/data/ogiri');
export function normalize(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\p{S}\s]/gu, '')
    .replace(/如何/g, 'どう')
    .replace(/何故/g, 'なぜ')
    .replace(/下さい/g, 'ください')
    .replace(/一つ/g, 'ひとつ')
    .replace(/どんな|どういう|どのような/g, 'どんな');
}
function grams(text: string) {
  const s = normalize(text);
  return new Set(Array.from({ length: Math.max(0, s.length - 2) }, (_, i) => s.slice(i, i + 3)));
}
function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const g of a) if (b.has(g)) common++;
  return (2 * common) / (a.size + b.size);
}
function format(text: string) {
  if (/言|一言|挨拶|文句|スピーチ/.test(text)) return 'dialogue';
  if (/理由|なぜ/.test(text)) return 'reason';
  if (/ルール|条件|禁止|注意|マナー/.test(text)) return 'rule';
  if (/名前|曲名|タイトル|作品名/.test(text)) return 'naming';
  if (/発明|機能|装置|道具/.test(text)) return 'invention';
  if (/起き|どうな|何をした/.test(text)) return 'twist';
  return 'situation';
}
const imported = process.argv.indexOf('--import');
if (imported >= 0 && (!process.argv[imported + 1] || process.argv[imported + 1].startsWith('--')))
  throw new Error('--import requires a JSON file path.');
const prompts: Prompt[] = process.argv.includes('--check')
  ? JSON.parse(readFileSync(resolve(root, 'prompts.json'), 'utf8'))
  : imported >= 0
    ? JSON.parse(readFileSync(resolve(process.argv[imported + 1]), 'utf8'))
    : readdirSync(root)
        .filter((f) => f.endsWith('.txt'))
        .sort()
        .flatMap((file) => {
          const category = file.replace('.txt', '') as keyof typeof CATEGORIES;
          if (!Object.hasOwn(CATEGORIES, category))
            throw new Error(`Unknown category: ${category}`);
          return readFileSync(resolve(root, file), 'utf8')
            .trim()
            .split('\n')
            .map(
              (text, index): Prompt => ({
                id: `${category}-${String(index + 1).padStart(3, '0')}`,
                text: text.trim(),
                category,
                format: format(text),
                difficulty: 'easy',
                tags: [category, format(text)],
                origin: 'original',
                sourceUrl: null,
                license: 'Original for meetyudai.com; no external text incorporated',
                enabled: true,
                createdAt: '2026-10-27',
              }),
            );
        });
const ids = new Set(),
  texts = new Set();
for (const p of prompts) {
  if (!/^[a-z][a-z0-9-]{2,70}$/.test(p.id) || ids.has(p.id))
    throw new Error(`Duplicate/invalid id: ${p.id}`);
  if (
    typeof p.text !== 'string' ||
    [...p.text].length < 10 ||
    normalize(p.text).length < 3 ||
    [...p.text].length > 100 ||
    /[<>\p{Cc}]/u.test(p.text)
  )
    throw new Error(`Invalid prompt: ${p.id}`);
  if (texts.has(normalize(p.text))) throw new Error(`Duplicate text: ${p.id}`);
  if (
    !Object.hasOwn(CATEGORIES, p.category) ||
    !['easy', 'medium'].includes(p.difficulty) ||
    !Array.isArray(p.tags) ||
    typeof p.enabled !== 'boolean' ||
    !p.format ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.createdAt)
  )
    throw new Error(`Invalid metadata: ${p.id}`);
  if (
    !['original', 'external'].includes(p.origin) ||
    !p.license ||
    (p.origin === 'external' && !p.sourceUrl?.startsWith('https://'))
  )
    throw new Error(`Missing provenance: ${p.id}`);
  ids.add(p.id);
  texts.add(normalize(p.text));
}
const ngrams = prompts.map((p) => grams(p.text));
const similar: { a: string; b: string; similarity: number }[] = [];
for (let i = 0; i < prompts.length; i++)
  for (let j = i + 1; j < prompts.length; j++) {
    const score = similarity(ngrams[i], ngrams[j]);
    if (score >= 0.42)
      similar.push({ a: prompts[i].id, b: prompts[j].id, similarity: +score.toFixed(3) });
  }
const report = {
  total: prompts.length,
  enabled: prompts.filter((p) => p.enabled).length,
  original: prompts.filter((p) => p.origin === 'original').length,
  categories: Object.fromEntries(
    Object.keys(CATEGORIES).map((c) => [c, prompts.filter((p) => p.category === c).length]),
  ),
  formats: Object.fromEntries(
    [...new Set(prompts.map((p) => p.format))].map((f) => [
      f,
      prompts.filter((p) => p.format === f).length,
    ]),
  ),
  normalizedDuplicates: 0,
  nearPairs: similar.sort((a, b) => b.similarity - a.similarity),
  method:
    'NFKC, punctuation/space removal, Japanese orthographic normalization, character trigram Dice >= 0.42. Similarities are editorial candidates, not proof of semantic uniqueness.',
};
writeFileSync(resolve(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
if (similar.some((pair) => pair.similarity >= 0.7))
  throw new Error('Too-similar prompts; inspect validation.json before publishing.');
if (process.argv.includes('--write'))
  writeFileSync(resolve(root, 'prompts.json'), JSON.stringify(prompts, null, 2) + '\n');
console.log(JSON.stringify(report));
