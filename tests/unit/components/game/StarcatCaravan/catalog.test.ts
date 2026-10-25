import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { CatalogError, parseCharacterCatalog, validateCharacterCatalog, validateCharacters } from '@/components/game/StarcatCaravan/catalog';

describe('Starcat character catalog validation', () => {
  it.each(['/img/games/starcat-caravan/characters/luna-v1.webp', 'https://firebasestorage.googleapis.com/v0/b/example/o/luna.webp?alt=media', null])('retains a valid portrait source: %s', (portraitUrl) => {
    const characters = structuredClone(CHARACTERS);
    characters[0].portraitUrl = portraitUrl;
    expect(validateCharacters(characters)[0].portraitUrl).toBe(portraitUrl);
  });

  it.each(['javascript:alert(1)', 'data:image/svg+xml,hi', '//example.com/a.webp', 'http://example.com/a.png', '/img/games/starcat-caravan/../secret.png', 'https://user:password@example.com/a.png', 'https://example.com/a b.png', 'x'.repeat(2049), 42])('rejects an unsafe portrait source: %s', (portraitUrl) => {
    const characters = structuredClone(CHARACTERS);
    expect(() => validateCharacters([{ ...characters[0], portraitUrl }, ...characters.slice(1)])).toThrow(/portraitUrl/);
  });

  it('accepts the original catalog and additions, normalizes text, and returns independent definitions', () => {
    const characters = structuredClone(CHARACTERS);
    characters.push({ ...characters[0], id: 'new-companion', name: { ja: ' 新しい猫 ', en: ' New companion ' } });
    const parsed = validateCharacterCatalog({ revision: 3, characters, updatedBy: 'private-admin' });
    expect(parsed).toEqual({ revision: 3, characters: [...CHARACTERS, { ...characters.at(-1), name: { ja: '新しい猫', en: 'New companion' } }] });
    expect(parsed.characters[0]).not.toBe(characters[0]);
    expect(parsed.characters[0].name).not.toBe(characters[0].name);
    expect(characters.at(-1)?.name.en).toBe(' New companion ');
  });

  it.each([
    ['id', 'Uppercase'], ['id', 'with/slash'], ['id', 'constructor'], ['id', '__proto__'], ['id', 'x'.repeat(49)],
    ['name', { ja: '名前' }], ['name', { ja: ' ', en: 'Name' }], ['name', { ja: '猫', en: 'x'.repeat(81) }],
    ['title', { ja: '猫', en: 'x'.repeat(121) }], ['rarity', 2], ['element', 'ice'], ['role', 'unknown'],
    ['fur', 'red'], ['accent', '#ffffff00'], ['hp', 0], ['hp', 100001], ['attack', 1.5], ['attack', Infinity],
    ['range', 41], ['speed', 0], ['cooldown', NaN], ['cost', 201], ['cost', 0],
  ])('rejects invalid %s: %j', (field, value) => {
    const characters = structuredClone(CHARACTERS);
    characters[0] = { ...characters[0], [field as string]: value };
    expect(() => validateCharacters(characters)).toThrow(CatalogError);
    expect(parseCharacterCatalog({ revision: 1, characters })).toBeNull();
  });

  it('rejects duplicate IDs, empty rarity pools, and more than 200 companions', () => {
    expect(() => validateCharacters([...CHARACTERS, CHARACTERS[0]])).toThrow(/Duplicate/);
    expect(() => validateCharacters(CHARACTERS.map((cat) => ({ ...cat, rarity: 3 })))).toThrow(/★4/);
    expect(() => validateCharacters([...CHARACTERS, ...Array.from({ length: 189 }, (_, index) => ({ ...CHARACTERS[0], id: `extra-${index}` }))])).toThrow(/200/);
  });

  it('protects every original ID from deletion or replacement while permitting display-name edits', () => {
    for (const characters of [CHARACTERS.slice(1), CHARACTERS.map((cat, index) => index === 0 ? { ...cat, id: 'renamed-id' } : cat)]) {
      expect(() => validateCharacters(characters)).toThrow(expect.objectContaining({ status: 409, message: expect.stringContaining('ember') }));
    }
    const renamed = CHARACTERS.map((cat) => ({ ...cat, name: { ja: '表示名', en: 'Display name' } }));
    expect(validateCharacters(renamed)).toEqual(renamed);
  });

  it.each([null, [], {}, { revision: 0, characters: CHARACTERS }, { revision: 1.5, characters: CHARACTERS }, { revision: '1', characters: CHARACTERS }])('rejects malformed catalog envelopes: %j', (value) => {
    expect(parseCharacterCatalog(value)).toBeNull();
  });
});
