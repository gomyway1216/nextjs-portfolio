# Starcat Caravan

Route: `/games/starcat-caravan`. A free collectible adventure with walkable islands, stories and deployment battles, using the existing account progress service.

## Walkable adventure

`AdventureWorld.tsx` is the default screen. Lead with any selected companion and the rest of the party follow. Move using arrows/WASD, press E to interact, hold the touch direction buttons, or tap a destination. Tap navigation uses breadth-first paths around trees, rocks and the river, crossing only at the bridge. A responsive camera follows the leader on narrow screens. Landscapes and landmarks are native SVG; the existing transparent character artwork is reused, with a short walking sway rather than new directional sprite sheets.

`adventure.ts` holds the grid, collision rules and six bilingual stories. Each island has a lightkeeper, two chests, camp, signpost, fortress and star lantern. Meet the keeper, collect both lantern fragments, clear that island's existing fortress battle, then restore its lantern. Each chest grants 100 Stardrops/120 coins once; each lantern grants 150 Stardrops/200 coins once. The final lantern requires all five earlier lanterns. All six complete Chapter One. Earlier fortress clears still unlock their islands and count toward the quests. The six maps share their trail geometry, with region palettes and distinct story text.

An optional `adventure` journal contains current region, checked walkable position, chest IDs, met keepers and restored lantern IDs. Legacy version-1 saves without it are read without changing companions, levels, currency, pity, party or clears. Starting exploration writes version 2 in the same save slot/document; older clients reject this version rather than reading it and silently stripping new fields. Version 2 requires a valid adventure journal. Malformed new data is rejected and protected by the existing unreadable-save behavior. No character catalog migration or new server collection is needed.

Walking ticks update transient `journey` position, not the saved economy. Stopping, completing interactions, periodic/hidden saves and closing checkpoint it into the journal. Existing account write throttling and offline retry remain in use. Conversation panels and motion are transient. Treasure is granted as the reward line is displayed, so closing that line keeps the award; repeat interactions are idempotent. Exploration resumes at its saved location, while an unfinished battle starts fresh at the fortress. Existing most-recent-journal conflict behavior still applies across devices.

Deployed companions can now receive a manual skill command for 40 energy, once every 20 seconds per selected character. Offensive commands require a live enemy within that companion's reach +8; support commands affect living allies. With repeated deployments, the frontmost living instance casts once. Commands use the same six ability effects without advancing ordinary attack counters, resetting automatic support timers or triggering recursive elemental reactions. Cooldowns stay battle-only. Stars, training, automatic abilities and the original cannon continue to work.

The travel journal and full Japanese/English guide distinguish persistent exploration, one-time rewards, fortress clears and transient battle state. Equipment, free-roaming action attacks and dedicated achievement badges are not part of this chapter.

- `data.ts`: the sixteen companions, five elements, six stages, and shared economy constants.
- `abilities.ts`: six automatic offensive/support ability types and bilingual descriptions.
- `battleAudio.ts`: opt-in battle effects through the same gesture-resumed Web Audio player as wishes.
- `elements.ts`: ten unordered element reactions and party resonance; role slots are never required.
- `engine.ts`: pure wish, party, training, battle, reward, and save-validation logic.
- `StarcatCaravan.tsx`: Japanese/English UI and browser persistence under `starcat-caravan-v1`.
- `CatSprite.tsx`: transparent character artwork inside the shared SVG frame, with vector fallback when an image is absent or fails.
- `SummonShow.tsx`: pull-and-release/upward-flick/keyboard launch, rarity-colored flight, individual reveals and a skippable result gallery. A tap does not launch; returning a drawn star cancels. The game reducer grants/saves rewards once, at launch; closing the presentation never rolls again.
- `Companions.tsx`: acquired companions only (including starters), defense and named abilities, role explanations for the current party, and a travel journal derived from existing save fields.
- `/games/starcat-caravan/guide`: bilingual field guide covering deployment, all four roles, the two enemy types, elements, islands, training, and the exact saved/unsaved progress boundary. The in-game guide link opens separately so it does not abandon a running battle.
- `progress.ts` / `useProgress.ts`: use the medal center's existing account keeper, per-account device slots, retry behavior, and authenticated save service.
- `StarcatCaravanForPlayer.tsx`: connects the site's signed-in member to the game.
- `catalog.ts` / `catalogClient.ts`: validate and load DB character definitions, with a validated offline cache.
- `/api/game/starcat/catalog`: public catalog reads and administrator-only updates.

Guests keep progress under `starcat-caravan-v1`. Signed-in members also keep it in `game_saves/{uid}/saves/starcat-caravan` through the same `/api/game/saves` service as the medal center. A first-time account adopts the guest journal once; an account with its own journal opens that instead. Account switches use separate device slots. Unreadable cloud journals are never overwritten. An existing account's cached journal remains playable offline and retries synchronization; a member without a cached journal waits for the account read before spending currency. When devices have both changed, the existing keeper uses the most recently played journal rather than adding currencies or duplicate rewards together.

Companions, copies, levels, party, gems, coins, pity counters, campaign clears, and win/loss counts are saved. Combat in progress is deliberately not saved. Re-entering a stage is free. There are no purchases.

The wish currency is **星のしずく / Stardrops**. Its persisted `gems` key stays compatible with existing saves. Opening the launcher costs nothing; releasing a draw of at least 52px, a quick upward flick of at least 64px within 450ms, or pressing Enter/Space starts the wish. A previously drawn star cannot turn into an upward flick on returning to its origin. Reduced-motion preferences shorten flight and disable movement effects.

Optional audio defaults off. `wishAudio.ts` plays five original stereo MP3 wish cues (charge loop, launch, and ★3/★4/★5 reveals), replacing the earlier sine-only chimes. Wind/noise sweeps, plucked/FM bells, layered strings, a formant-shaped instrumental pad and diffuse stereo reflections are synthesized offline by `scripts/generate-starcat-audio.mjs` (Node + ffmpeg); shipping files are under `public/audio/starcat-caravan/`. Four additional battle cues cover impact, frost, thunder and support. These are designed effects, not AI-generated speech or a human voice recording. Audio work begins only after the sound toggle. Skip/close/mute cancels queued playback as well as active playback, preventing a late cue from sounding over another scene. Regenerate with `node scripts/generate-starcat-audio.mjs`; intermediate WAV files stay in `.artifacts/starcat-audio/`.

The travel journal displays existing clears, completed wins/losses and wish count. The adventure journal adds story flags in save version 2; it does not add a separate achievement-award service. Dedicated badges, unlock timestamps, per-battle history and unfinished battlefield snapshots remain unimplemented and are explicitly described as such in the guide.

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

## Companion expansion and defense

The original permanent twelve IDs stay required for reading legacy catalogs. The sixteen-character bootstrap adds Yuki/Fubuki (Ice) and Raika/Shiden (Lightning). A catalog transaction marked `contentVersion: 2` fills missing defense/ability/name fields on the original twelve, adds the four IDs only when absent, and installs missing original-character portraits. Existing names, base stats, roles, elements, explicit zero/none/null values, custom portraits and administrator-added characters are preserved. A collision with a new seed ID preserves the existing administrator companion. The migration increments revision once and never reads or writes `game_saves`. Preview deployments only read existing catalog data and cannot bootstrap or migrate a shared live database; the production deployment publishes the expansion. Subsequent administrator changes are protected by the usual revision and permanent-ID checks. Old cached catalogs keep working with zero defense and no extra ability until refreshed.

Character base defense, ability type and optional bilingual individual ability name are editable in the existing administrator screen. Rarity multiplies base HP, attack/healing and defense by 1 / 1.2 / 1.5 for ★3 / ★4 / ★5. Level growth stays linear at 14% per level beyond 1 for HP/attack and adds 7% for defense; duplicates multiply all three by 4% each, capped at 20%. Training does not change rarity. Deployed matching-element resonance then applies to HP/attack as before. Cards show trained stats before deployment resonance.

Damage uses `round(power * 100 / (100 + defense))`, minimum 1 for positive power, then live wards absorb it before HP. Star cannon remains a defense-piercing fixed 140. Enemies also have stage-scaled defense. Frozen enemies cannot move/attack; bosses receive half duration. Moonwater Lake now has Ice enemies, Skyward Passage has Lightning enemies; permanent stage indices and completed progress remain intact.

Offensive abilities count normal hits on enemy units, every fourth hit: strike (75% extra), splash (60% to target and radius 12), chain (70% to up to two other enemies within 20), frost (50% extra and 1-second freeze). Support pulses start 10 seconds after deployment and recur every 10: mend (80% attack/healing to living allies) or ward (8% caster max HP, capped at 25% target max HP, lasts 6 seconds, non-additive). Ability follow-ups do not apply auras, trigger other abilities, or count toward normal-hit counters. Fortress attacks do not advance these counters. Three recent ability names are shown alongside reaction events. Wards, freezes and counters stay battle-only; ability counters and manual-command cooldowns stay out of the persistent journal.

All ten pairs of the five elements have reactions. Original Fire/Water, Fire/Wind and Water/Wind effects remain. Fire/Ice adds 85% damage; Water/Ice adds 25% and a 1.2-second freeze; Wind/Ice adds 45% in radius 14 and a 0.6-second freeze; Fire/Lightning adds 65% in radius 14; Water/Lightning chains 65% to target + two neighbors within 20; Wind/Lightning chains 50% within 25; Ice/Lightning adds 100%. Each enemy still has a two-second reaction cooldown and applied auras last four seconds. All damage follows the same defense rule. Only normal ally hits apply auras. Extra elemental advantages: Fire→Ice, Ice→Lightning, Lightning→Water, alongside the original cycle.

Ten new 960px alpha WebP portraits complete the illustrated cast without replacing the original six. Prompts and generation provenance: [expansion art notes](../../../../docs/starcat-character-art-v2.md). Four short stereo battle MP3s are regenerated with the same Node/ffmpeg script as the five wish cues. Battle sound starts off, is enabled with its own speaker button, and stops on mute/pause/finish/leave. Shared cue playback resumes AudioContext during the explicit toggle and prevents stale asynchronous playback after cancellation.
