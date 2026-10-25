# Starcat Caravan

Route: `/games/starcat-caravan`. A free collectible adventure with walkable islands, stories and simple party battles, using the existing account progress service.

## Walkable adventure

`AdventureWorld.tsx` is the default screen. Lead with any selected companion and the rest of the party follow. Move using arrows/WASD, press E to interact, hold the touch direction buttons, or tap a destination. Tap navigation uses breadth-first paths around trees, rocks and the river, crossing only at the bridge. A responsive camera follows the leader on narrow screens. Landscapes and landmarks are native SVG; the existing transparent character artwork is reused, with a short walking sway rather than new directional sprite sheets.

`adventure.ts` holds the grid, collision rules and six bilingual stories. Each island has a lightkeeper, two chests, camp, signpost, fortress and star lantern. Meet the keeper, collect both lantern fragments, clear that island's existing fortress battle, then restore its lantern. Each chest grants 100 Stardrops/120 coins once; each lantern grants 150 Stardrops/200 coins once. The final lantern requires all five earlier lanterns. All six complete Chapter One. Earlier fortress clears still unlock their islands and count toward the quests. The six maps share their trail geometry, with region palettes and distinct story text.

An optional `adventure` journal contains current region, checked walkable position, chest IDs, met keepers and restored lantern IDs. Legacy version-1 saves without it are read without changing companions, levels, currency, pity, party or clears. Starting exploration writes version 2 in the same save slot/document; older clients reject this version rather than reading it and silently stripping new fields. Version 2 requires a valid adventure journal. Malformed new data is rejected and protected by the existing unreadable-save behavior. No character catalog migration or new server collection is needed.

Walking ticks update transient `journey` position, not the saved economy. Stopping, completing interactions, periodic/hidden saves and closing checkpoint it into the journal. Existing account write throttling and offline retry remain in use. Conversation panels and motion are transient. Treasure is granted as the reward line is displayed, so closing that line keeps the award; repeat interactions are idempotent. Exploration resumes at its saved location, while an unfinished battle starts fresh at the fortress. Existing most-recent-journal conflict behavior still applies across devices.

`arena.ts` and `AdventureBattle.tsx` provide the simple 2D party battles: movement, automatic normal attacks and one charged **Star bond** button (also Space). The selected party enters together, without deployment energy, repeated units, a cannon or base-defense objectives. Walk with arrows/WASD/touch directions or tap the ground. Enemy circles lock their aim before a 1.2-second normal or 1.5-second boss attack; walking the leader out avoids damage. Shared party HP is the sum of trained HP (including matching-element resonance), and defense is the mean. Automatic healing and the six DB-defined abilities remain active. Attack reach is 8 + base reach ×0.55 in arena units.

Each encounter has 4–8 regular shadows and a mandatory final guardian; all must be defeated. Enemy HP/power/defense scale with the existing island strength. HP zero or three minutes ends an attempt. Star bond starts full, charges at 8%/second, hits all enemies for three times combined companion attack with defense applied and heals 10% shared party HP. Extra attacks never recursively generate reactions. Freeze interrupts windups. The existing first-clear and replay rewards are committed once on victory, with the same permanent stage IDs.

Exploration, story flags, companions and currency stay in the same account journal. Player/enemy positions, HP, input, charge, automatic-ability timers, warnings and animation during combat are transient. No equipment or dedicated achievement badges are added. The six regions share trail geometry and have distinct palettes and stories. Existing cutout portraits sway while moving; they are not new directional sprite sheets.

- `arena.ts`: pure party battle, enemy warnings, automatic abilities and the single big move.
- `AdventureBattle.tsx`: movement and dodge feedback, shared HP, big-move button, optional sound and results.
- `adventure.ts` / `AdventureWorld.tsx`: collision-aware walking, story interactions and journal.
- `engine.ts`: economy, validated saves and once-only results; the old one-dimensional simulation functions remain for compatibility tests, but are not exposed as a play mode.
- `progress.ts` / `useProgress.ts`: the existing game-center account keeper, offline retries and per-account slots.
- `StarcatGuide.tsx`: the full Japanese/English guide for current play and saved/unsaved boundaries.
- `catalog.ts` / `catalogClient.ts` and `/api/game/starcat/catalog`: DB character definitions with administrator editing and validated offline cache.

Artwork and sound assets retain their existing provenance in `docs/starcat-character-art.md` and `docs/starcat-character-art-v2.md`. All sixteen transparent portraits and nine MP3 effects remain site-hosted files; Firestore stores portrait URLs separately from ownership/progress. No Unity runtime or new game-framework dependency is needed.

## Adding companions

Open `/admin/games/starcat-caravan` as an existing site administrator. Edit Japanese/English names and titles, rarity, element, role, colors, and base combat stats, or add a companion with a unique permanent ID. Save, then reopen the game to use the updated catalog. No code deployment is needed for character edits or additions. The collection, same-rarity wish pools, sprites, and in-game counts use that catalog. A newly added companion starts unowned and can be summoned normally.

Definitions live in Firestore at `game_catalogs/starcat-caravan`. The first successful catalog read creates the original twelve definitions transactionally only if the document does not exist. `CHARACTERS` in `data.ts` is the bootstrap/test fixture; it is not the live game's master. A database failure never fabricates a successful catalog read or resets an existing document.

Existing IDs cannot be deleted or renamed, including companions added later. Ownership remains keyed by ID, so names and base stats can change without changing levels, copies, party, currencies, pity, or cleared islands. Updated base stats apply to owned companions when the game is reopened. Saves do not duplicate the master definitions. Administrator updates validate every field, preserve all IDs, require all three rarity pools, and compare the catalog revision transactionally to prevent stale edits from overwriting newer changes.

The game loads the catalog before opening progress and keeps the last validated catalog for offline use. A save containing a companion missing from an older catalog remains intact and cannot be played until current definitions are available. Malformed local journals and unreadable cloud journals are also protected from overwriting. Catalogs are scoped to each game instance rather than mutating a shared global roster.

`portraitUrl` accepts a public HTTPS image URL (including Firebase Storage) or a versioned local image path, and is editable in the same administrator form. Image bytes are served separately from Firestore. The initial six portraits live under `public/img/games/starcat-caravan/characters/` and deploy with the site. Existing catalogs receive only missing portrait URLs transactionally once, with a revision increase; administrator artwork and explicit `null` (vector rendering) are preserved. This migration never reads or changes player saves. Character edits to name, color or role do not regenerate raster artwork; replace the image URL to change the illustration.

Run the relevant checks with the repository's Node version:

```sh
npm test -- tests/unit/components/game/StarcatCaravan tests/unit/services/gameSaveService.test.ts tests/unit/lib/games/gameMetadata.test.ts tests/unit/lib/homeGames.test.ts
```

## Artwork

Created with the built-in `image_gen` tool. Project assets:

- Six 960 × 960 transparent WebP portraits in `public/img/games/starcat-caravan/characters/`: Maple, Luna, Sol, Ember, Brook and Moss. Distinct silhouettes, clothing and personalities in a cohesive painted storybook style. Prompts and provenance: [character art notes](../../../../docs/starcat-character-art.md).

- `public/img/games/starcat-caravan/sky.webp` (1600 × 900)
- `public/img/games/covers/starcat-caravan.webp` (960 × 540)

Generation prompt:

Use case: stylized-concept. Asset type: original browser game hero background and cover for Starcat Caravan, a cozy collectible-cat fantasy tower-defense adventure. Create a beautifully painted 16:9 wide illustration, 1536x864 or similar. Scene: a moonlit grassy floating island above a vast indigo sea of clouds, old stone arches, distant luminous floating islands, a magical ring of stars in the sky, fireflies, teal grasses and warm golden starlight. On the RIGHT half, three adorable small original chibi cats adventuring together: white cat wizard with navy cape and a golden star-tipped staff, ginger cat knight with tiny sword and teal scarf, dark gray cat explorer with green hood. Hand-painted high-end indie game art, soft gouache texture, whimsical details and atmospheric depth. LEFT half should be quieter dark midnight blue sky and distant clouds, leaving negative space for title and UI overlay. Rich navy, teal and buttery gold palette. No text, no letters, no logo, no interface, no watermark. Original characters, not existing franchise designs.

## Elements, abilities and catalog compatibility

The original twelve permanent IDs and the sixteen-companion expansion remain compatible with the existing DB catalog. contentVersion 2 migration behavior is unchanged: only missing fields are filled, new IDs are added only if absent, administrator names/stats/zero/none/null/custom images are preserved, and preview deployments cannot migrate a shared catalog. This adventure update adds no catalog migration.

Cards and arena battles share `stats.ts`: ★3/4/5 base multipliers 1/1.2/1.5; level growth 14% HP/attack and 7% defense per level after 1; duplicate stat multipliers 4% each, capped at 20%. Two distinct companions of one element grant that element +20% HP and +15% attack/healing. No role slot is required. Rarity itself cannot be raised by training.

All ten unordered element reactions, the original weakness relationships and six automatic ability types continue in the arena. Attack abilities trigger each fourth normal hit. Support pulses occur every ten seconds, healing or shielding the shared party HP. Damage is reduced by 100/(100+defense), then a live non-additive ward absorbs it; positive damage is at least 1. Boss freeze duration is halved. Star bond is a separate charged party move and does not advance attack counters or generate recursive reactions.

Legacy cost, speed and redeploy fields remain stored for catalog compatibility but are not part of the new deployment-free battle controls. Character art provenance remains in the two linked prompt documents. Sixteen transparent WebP portraits and nine stereo MP3 cues are static site assets; Firestore holds the definition URLs and account journals, not image/audio bytes.
