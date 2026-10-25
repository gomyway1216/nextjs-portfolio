# Starcat Caravan

Route: `/games/starcat-caravan`. A free collectible tower-defense game with account progress.

- `data.ts`: the twelve companions, six stages, and shared economy constants.
- `engine.ts`: pure wish, party, training, battle, reward, and save-validation logic.
- `StarcatCaravan.tsx`: Japanese/English UI and browser persistence under `starcat-caravan-v1`.
- `CatSprite.tsx`: original SVG game pieces. No external character assets.
- `progress.ts` / `useProgress.ts`: use the medal center's existing account keeper, per-account device slots, retry behavior, and authenticated save service.
- `StarcatCaravanForPlayer.tsx`: connects the site's signed-in member to the game.

Guests keep progress under `starcat-caravan-v1`. Signed-in members also keep it in `game_saves/{uid}/saves/starcat-caravan` through the same `/api/game/saves` service as the medal center. A first-time account adopts the guest journal once; an account with its own journal opens that instead. Account switches use separate device slots. Unreadable cloud journals are never overwritten. An existing account's cached journal remains playable offline and retries synchronization; a member without a cached journal waits for the account read before spending currency. When devices have both changed, the existing keeper uses the most recently played journal rather than adding currencies or duplicate rewards together.

Companions, copies, levels, party, gems, coins, pity counters, campaign clears, and win/loss counts are saved. Combat in progress is deliberately not saved. Re-entering a stage is free. There are no purchases.

## Adding companions

Add a new definition with a unique, permanent `id` to `CHARACTERS` in `data.ts`. Keep existing IDs: saves store ownership by ID, so adding a new entry leaves existing levels, copies, currencies, and progression intact. The collection, same-rarity wish pools, sprites, and in-game counts derive from the catalog automatically. A new companion starts unowned and can be summoned normally. Keep at least one character of each rarity, and update marketing descriptions in the catalog locales when relevant. This is a code catalog; there is no in-browser character editor.

Run the relevant checks with the repository's Node version:

```sh
npm test -- tests/unit/components/game/StarcatCaravan tests/unit/services/gameSaveService.test.ts tests/unit/lib/games/gameMetadata.test.ts tests/unit/lib/homeGames.test.ts
```

## Artwork

Created with the built-in `image_gen` tool. Project assets:

- `public/img/games/starcat-caravan/sky.webp` (1600 × 900)
- `public/img/games/covers/starcat-caravan.webp` (960 × 540)

Generation prompt:

Use case: stylized-concept. Asset type: original browser game hero background and cover for Starcat Caravan, a cozy collectible-cat fantasy tower-defense adventure. Create a beautifully painted 16:9 wide illustration, 1536x864 or similar. Scene: a moonlit grassy floating island above a vast indigo sea of clouds, old stone arches, distant luminous floating islands, a magical ring of stars in the sky, fireflies, teal grasses and warm golden starlight. On the RIGHT half, three adorable small original chibi cats adventuring together: white cat wizard with navy cape and a golden star-tipped staff, ginger cat knight with tiny sword and teal scarf, dark gray cat explorer with green hood. Hand-painted high-end indie game art, soft gouache texture, whimsical details and atmospheric depth. LEFT half should be quieter dark midnight blue sky and distant clouds, leaving negative space for title and UI overlay. Rich navy, teal and buttery gold palette. No text, no letters, no logo, no interface, no watermark. Original characters, not existing franchise designs.
