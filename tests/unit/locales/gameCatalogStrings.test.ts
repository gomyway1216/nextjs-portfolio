import { describe, expect, it } from 'vitest';
import en from '@/locales/en/common.json';
import ja from '@/locales/ja/common.json';
import { games } from '@/components/game/constants/games';

/**
 * Every catalog game needs its card text in both locales.
 *
 * The games list renders each card through i18n keys (`games.<id>.title` and
 * `.description`), which is a different place from the detail page's copy in
 * `gameTranslations.ts`. Adding a game to the catalog and only to the latter
 * puts a card on the page reading "games.<id>.title" — which is exactly what
 * shipped for tomoshibi: the entry was in games.ts and gameTranslations.ts, and
 * nothing checked the locale files, so the card showed its own key in
 * production.
 */
describe('every catalog game has card text in both locales', () => {
  const locales = { en, ja } as Record<string, { games?: Record<string, { title?: string; description?: string }> }>;

  for (const game of games) {
    for (const [lang, bundle] of Object.entries(locales)) {
      it(`${game.id} has a ${lang} title and description`, () => {
        const entry = bundle.games?.[game.id];
        expect(entry, `games.${game.id} missing from src/locales/${lang}/common.json`).toBeDefined();
        // Check the type before trimming: a number or boolean in the bundle would
        // throw inside the assertion rather than fail it, and "expected undefined
        // to be truthy" does not say which field of which game is wrong.
        expect(typeof entry?.title, `games.${game.id}.title (${lang})`).toBe('string');
        expect(entry?.title?.trim(), `games.${game.id}.title (${lang}) is empty`).not.toBe('');
        expect(typeof entry?.description, `games.${game.id}.description (${lang})`).toBe('string');
        expect(entry?.description?.trim(), `games.${game.id}.description (${lang}) is empty`).not.toBe('');
      });
    }
  }
});
