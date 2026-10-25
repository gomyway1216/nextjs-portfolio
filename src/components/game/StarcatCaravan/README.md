# Starcat Caravan

Route: `/games/starcat-caravan`. A free collectible tower-defense game with account progress.

- `data.ts`: the twelve companions, six stages, and shared economy constants.
- `elements.ts`: unordered element reactions and party resonance; role slots are never required.
- `engine.ts`: pure wish, party, training, battle, reward, and save-validation logic.
- `StarcatCaravan.tsx`: Japanese/English UI and browser persistence under `starcat-caravan-v1`.
- `CatSprite.tsx`: transparent character artwork inside the shared SVG frame, with vector fallback when an image is absent or fails.
- `SummonShow.tsx`: pull-and-release/upward-flick/keyboard launch, rarity-colored flight, individual reveals and a skippable result gallery. A tap does not launch; returning a drawn star cancels. The game reducer grants/saves rewards once, at launch; closing the presentation never rolls again.
- `Companions.tsx`: acquired companions only (including starters), role explanations for the current party, and a travel journal derived from existing save fields.
- `/games/starcat-caravan/guide`: bilingual field guide covering deployment, all four roles, the two enemy types, elements, islands, training, and the exact saved/unsaved progress boundary. The in-game guide link opens separately so it does not abandon a running battle.
- `progress.ts` / `useProgress.ts`: use the medal center's existing account keeper, per-account device slots, retry behavior, and authenticated save service.
- `StarcatCaravanForPlayer.tsx`: connects the site's signed-in member to the game.
- `catalog.ts` / `catalogClient.ts`: validate and load DB character definitions, with a validated offline cache.
- `/api/game/starcat/catalog`: public catalog reads and administrator-only updates.

Guests keep progress under `starcat-caravan-v1`. Signed-in members also keep it in `game_saves/{uid}/saves/starcat-caravan` through the same `/api/game/saves` service as the medal center. A first-time account adopts the guest journal once; an account with its own journal opens that instead. Account switches use separate device slots. Unreadable cloud journals are never overwritten. An existing account's cached journal remains playable offline and retries synchronization; a member without a cached journal waits for the account read before spending currency. When devices have both changed, the existing keeper uses the most recently played journal rather than adding currencies or duplicate rewards together.

Companions, copies, levels, party, gems, coins, pity counters, campaign clears, and win/loss counts are saved. Combat in progress is deliberately not saved. Re-entering a stage is free. There are no purchases.

The wish currency is **星のしずく / Stardrops**. Its persisted `gems` key stays compatible with existing saves. Opening the launcher costs nothing; releasing a draw of at least 52px, a quick upward flick of at least 64px within 450ms, or pressing Enter/Space starts the wish. A previously drawn star cannot turn into an upward flick on returning to its origin. Reduced-motion preferences shorten flight and disable movement effects.

Optional audio defaults off. `wishAudio.ts` plays five original stereo MP3 cues (charge loop, launch, and ★3/★4/★5 reveals), replacing the earlier sine-only chimes. Wind/noise sweeps, plucked/FM bells, layered strings, a formant-shaped instrumental pad and diffuse stereo reflections are synthesized offline by `scripts/generate-starcat-audio.mjs` (Node + ffmpeg); shipping files are under `public/audio/starcat-caravan/`. These are designed effects, not AI-generated speech or a human voice recording. Audio work begins only after the sound toggle. Skip/close/mute cancels queued playback as well as active playback, preventing a late cue from sounding over another scene. Regenerate with `node scripts/generate-starcat-audio.mjs`; intermediate WAV files stay in `.artifacts/starcat-audio/`.

The travel journal displays existing clears, completed wins/losses and wish count. This change adds no new save format or achievement-award schema. Dedicated badges, unlock timestamps, per-battle history and unfinished battlefield snapshots remain unimplemented and are explicitly described as such in the guide.

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

## Element parties

Roles still describe each DB companion’s behavior and require no save/catalog migration. Any 1–4 owned companions can be selected. Two distinct selected companions of one element give that element +20% deployed HP and +15% attack/healing, applied after level/duplicate stats. Extra copies deployed in battle do not count as party members; 3+ of an element do not stack more bonuses.

Only ally normal attacks apply a four-second aura to enemies; native enemy element remains a separate 1.5× weakness rule. A different element consumes the aura in either order, with a two-second per-enemy cooldown: Fire/Water adds 75% triggering attack damage, Fire/Wind adds 50% to the target and enemies within 14 battle units, Water/Wind heals all living allies for 50%. These effects use attack power before weakness (half for healers’ normal attacks), never trigger recursively, and never revive. Up to three recent reactions are shown visually. Aura and reaction events are battle-only; owned levels, team and completed rewards use the unchanged save format.
