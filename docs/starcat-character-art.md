# Starcat Caravan character art, version 1

Created with the built-in ChatGPT `image_gen` tool, with `transparent_background: true`, one separate generation per character. Generated originals are 1254 × 1254 RGBA. Shipping assets are mechanically resized to 960 × 960 transparent WebP (quality 85, alpha quality 95); no generated content was repainted during conversion.

The files in `public/img/games/starcat-caravan/characters/` are deployed with the site and served at `/img/games/starcat-caravan/characters/{id}-v1.webp`. Firestore stores the URL in each character's `portraitUrl`, separately from player ownership and levels. The administrator can replace that URL with a public HTTPS image, including Firebase Storage. No Storage bucket or credentials are required for this initial asset set.

| ID | Character | Design |
| --- | --- | --- |
| maple | カエデ / Maple | Red maple cape, copper armor, maple-leaf shield; athletic ginger calico knight |
| luna | ルナ / Luna | Slender silver-white moon witch, oversized crescent hat, indigo constellation robes |
| sol | ソル / Sol | Large Maine Coon guardian, ivory/gold plate, sun shield and spear |
| ember | コハク / Ember | Small scruffy orange tabby, teal scarf, patched leather, wooden practice sword |
| brook | ミナモ / Brook | Round blue-gray shorthair, scallop-shell shield, sea-glass padded coat |
| moss | ワカバ / Moss | Elderly tortoiseshell herbalist, round spectacles, leaf hat, wicker herb backpack |

## Shared generation prompt

Use case: stylized-concept. Asset type: finished premium collectible RPG character portrait for an ORIGINAL cozy fantasy game named Starcat Caravan. Create ONE full-body anthropomorphic CAT adventurer, unmistakably feline, expressive cat face, visible paws and tail, NOT a human with cat ears. Exquisite hand-painted gouache and watercolor storybook illustration with confident fine ink contours, rich tactile fabrics, softly luminous magic, polished collectible-card art quality. Mature charming fairy-tale tone, whimsical rather than babyish, dramatic readable silhouette, expressive pose, believable anatomy. Entire figure and equipment fully within a square canvas with comfortable 10% transparent margins. Face near upper third, feet near lower edge, large character occupying 80% of canvas. Three-quarter front view. Real alpha transparent background, isolated cutout, a few small themed floating particles allowed close to character. No background scene, no rectangular backdrop, no text, no card border, no UI, no logo, no watermark. Keep this cohesive art direction across the six original cast members, but give each distinct body proportions, clothing, personality and pose.

Append the corresponding subject description below to the shared prompt.

### maple

MAPLE / カエデ, the autumn knight, a nimble warm ginger calico cat with short pointed ears, determined amber eyes. Medium compact athletic silhouette. Layered russet leather and burnished copper armor, crimson maple-leaf shaped shield, modest short sword angled down, asymmetrical flowing scarlet cape with leaf-shaped tips, autumn leaves circling one shoulder. Stepping forward protectively. Palette vermilion, burnt orange, copper and cream. Brave youthful personality. NO huge crown or witch hat.

### luna

LUNA / ルナ, the moon witch, a slender silver-white longhaired cat with deep blue eyes and enormous fluffy crescent tail curling upward. Tall elegant silhouette dominated by a dramatically broad, crooked midnight-blue witch hat with hanging crescent charms. Indigo velvet cloak and long flowing layered robes patterned with tiny embroidered constellations. Floating slightly above the ground, one paw holding a crescent moon staff, other paw conjuring a small glowing star. Pale gold delicate jewelry. Palette midnight navy, periwinkle, silver, pale gold. Calm mysterious smile. Magical circular crescent accents close to figure. NO knight armor.

### sol

SOL / ソル, dawn's guardian, a very large broad-shouldered golden-orange Maine Coon cat with a magnificent lion-like fluffy mane and stern kind eyes. Heavy stocky imposing silhouette, considerably broader than other cast. Ivory and antique-gold full plate armor, sunburst pauldron and round sun-emblem tower shield, thick ochre mantle, sturdy plated boots. Holding a grounded long golden spear upright. Dawn rays form a SMALL decorative sun motif just behind shoulders but keep transparent surrounding canvas. Palette ivory, amber and antique gold. Stoic protective personality. NO witch hat or red maple motifs.

### ember

EMBER / コハク, the little adventurer, a small lean scruffy orange tabby kitten with oversized ears, curious green eyes and a crooked confident grin. Small agile silhouette, tilted forward mid-step, simple teal scarf flying far behind, patched dark leather vest, cream linen tunic and practical adventurer belt. One paw grips a wooden practice sword that is a little too big; tiny copper compass and rolled map attached to belt. Clearly youthful brave beginner, NO ornate armor. Rich burnt orange fur with clear dark stripes, teal and weathered brown clothes. Charming paw pads visible.

### brook

BROOK / ミナモ, lake guardian, a round plush blue-gray British shorthair cat with tiny round ears, sleepy gentle navy eyes and a very stout barrel-shaped silhouette. Huge polished scallop-shell shield, jade-blue padded sailor coat, rope belt, mossy stone shoulder guards, fisherman boots, small lantern hanging from belt. Holding the shell shield sideways with both paws, relaxed loyal expression. A little floating water droplet or two. Palette sea glass, mist blue, cream and muted jade. Broad round face and very short legs, NOT the same slender knight body.

### moss

MOSS / ワカバ, forest herbalist, a tiny elderly tortoiseshell cat with soft cream muzzle, enormous round brass spectacles, kind narrowed eyes and an oversized sage-green floppy leaf hat. Hunched gentle silhouette under a huge woven wicker backpack overflowing with herbs, mushrooms and little glass potion bottles. Layered patchwork moss-green apron, pale linen sleeves, tiny brown boots. One paw steadies a twisted wooden walking/healing staff sprouting leaves and a soft glowing seed, the other offers a sprig. Palette sage, olive, cream, chestnut and warm honey. Distinct cute scholarly face, no sword or armor.
