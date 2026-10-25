# Starcat Caravan

Route: `/games/starcat-caravan`. A free, browser-local collectible tower-defense game.

- `data.ts`: the twelve companions, six stages, and shared economy constants.
- `engine.ts`: pure wish, party, training, battle, reward, and save-validation logic.
- `StarcatCaravan.tsx`: Japanese/English UI and browser persistence under `starcat-caravan-v1`.
- `CatSprite.tsx`: original SVG game pieces. No external character assets.

Progress is saved locally; combat in progress is deliberately not saved. Re-entering a stage is free. There are no purchases, accounts, or cloud saves for this game.

Run the relevant checks with the repository's Node version:

```sh
npm test -- tests/unit/components/game/StarcatCaravan/engine.test.ts tests/unit/lib/games/gameMetadata.test.ts tests/unit/lib/homeGames.test.ts
```

## Artwork

Created with the built-in `image_gen` tool. Project assets:

- `public/img/games/starcat-caravan/sky.webp` (1600 × 900)
- `public/img/games/covers/starcat-caravan.webp` (960 × 540)

Generation prompt:

Use case: stylized-concept. Asset type: original browser game hero background and cover for Starcat Caravan, a cozy collectible-cat fantasy tower-defense adventure. Create a beautifully painted 16:9 wide illustration, 1536x864 or similar. Scene: a moonlit grassy floating island above a vast indigo sea of clouds, old stone arches, distant luminous floating islands, a magical ring of stars in the sky, fireflies, teal grasses and warm golden starlight. On the RIGHT half, three adorable small original chibi cats adventuring together: white cat wizard with navy cape and a golden star-tipped staff, ginger cat knight with tiny sword and teal scarf, dark gray cat explorer with green hood. Hand-painted high-end indie game art, soft gouache texture, whimsical details and atmospheric depth. LEFT half should be quieter dark midnight blue sky and distant clouds, leaving negative space for title and UI overlay. Rich navy, teal and buttery gold palette. No text, no letters, no logo, no interface, no watermark. Original characters, not existing franchise designs.
