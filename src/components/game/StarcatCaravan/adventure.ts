import { STAGES, type Words } from './data';
import type { Save } from './engine';

export const MAP_WIDTH = 24;
export const MAP_HEIGHT = 16;
export const TILE = 40;
/** Match compact map geometry to the viewport, including short landscape screens. */
export function worldViewBox(position: Point, width: number, height: number, compact: boolean): string {
  if (!compact || width <= 0 || height <= 0) return `0 0 ${MAP_WIDTH*TILE} ${MAP_HEIGHT*TILE}`;
  const ratio=width/height, w=Math.min(MAP_WIDTH*TILE,480*ratio), h=w/ratio;
  const x=Math.max(0,Math.min(MAP_WIDTH*TILE-w,position.x*TILE+TILE/2-w/2));
  const y=Math.max(0,Math.min(MAP_HEIGHT*TILE-h,position.y*TILE+TILE/2-h/2));
  return `${x} ${y} ${w} ${h}`;
}

export const TRAIL_START = { x: 3, y: 11 };
export type Point = { x: number; y: number };
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Place = 'camp' | 'guide' | 'west' | 'east' | 'beacon' | 'fortress' | 'sign';
export interface AdventureSave {
  version: 1;
  region: number;
  position: Point;
  opened: string[];
  met: number[];
  restored: number[];
}
export const PLACES: { id: Place; x: number; y: number; name: Words }[] = [
  { id: 'camp', x: 3, y: 12, name: { ja: '旅のキャンプ', en: 'Caravan camp' } },
  { id: 'guide', x: 6, y: 10, name: { ja: '灯守', en: 'Lightkeeper' } },
  { id: 'west', x: 5, y: 6, name: { ja: '西の宝箱', en: 'Western chest' } },
  { id: 'east', x: 18, y: 10, name: { ja: '東の宝箱', en: 'Eastern chest' } },
  { id: 'beacon', x: 16, y: 5, name: { ja: '星の灯台', en: 'Star lantern' } },
  { id: 'fortress', x: 21, y: 7, name: { ja: '影の砦', en: 'Shadow fortress' } },
  { id: 'sign', x: 8, y: 8, name: { ja: '古い道しるべ', en: 'Old signpost' } },
];
export const CHAPTERS: { title: Words; keeper: Words; story: Words; ending: Words; grass: string; tree: string; water: string }[] = [
  { title: { ja: '消えた星の灯火', en: 'The missing starlight' }, keeper: { ja: '灯守のリリ', en: 'Lili the lightkeeper' }, story: { ja: '昨日の夜、空の道を照らす星の灯火が消えてしまったの。影たちが灯台のかけらを、二つの宝箱に隠したみたい。', en: 'Last night the light that guides our sky paths went out. The shadows hid its two fragments in chests across the meadow.' }, ending: { ja: 'あたたかな光が草原を包んだ。遠くの森へ、星の道が伸びていく。小さな猫たちの旅が、いま始まる。', en: 'Warm light spills over the meadow. A star path reaches toward the distant woods. Your little caravan’s journey has begun.' }, grass: '#6f9975', tree: '#376a58', water: '#5897a4' },
  { title: { ja: '森が覚えている歌', en: 'The song the woods remember' }, keeper: { ja: '森番のネム', en: 'Nemu the forest tender' }, story: { ja: '木々が同じ夢を見ているんだ。灯火が戻れば、忘れられた歌も目を覚ます。川の両岸でかけらを探してくれる？', en: 'The trees share a sleeping dream. Restore the lantern and their forgotten song will wake. Look for fragments on both sides of the stream.' }, ending: { ja: '葉のざわめきが一つの歌になる。「夕映えの遺跡で待つ」と、風が伝えた。', en: 'Rustling leaves become a song. “We wait in the Emberfall ruins,” the wind whispers.' }, grass: '#53795e', tree: '#244f47', water: '#477f91' },
  { title: { ja: '約束を刻む石', en: 'A promise written in stone' }, keeper: { ja: '石読みのトト', en: 'Toto the stone reader' }, story: { ja: 'この遺跡は旅人の約束を守ってきた。二つのかけらを集め、砦の影を払えば、石に残る言葉が読めるはず。', en: 'These ruins once guarded travelers’ promises. Find both fragments and clear the fortress; then the stones may speak again.' }, ending: { ja: '石碑に文字が浮かぶ。「一人の願いは、仲間となら道になる」。月明かりが次の島を指した。', en: 'Letters glow on stone: “A wish becomes a path when shared.” Moonlight points to the next island.' }, grass: '#a38b67', tree: '#806e52', water: '#737e94' },
  { title: { ja: '氷の下の手紙', en: 'A letter beneath the ice' }, keeper: { ja: '湖守のユラ', en: 'Yura the lake watcher' }, story: { ja: '湖の底に、まだ届いていない手紙が眠っているの。灯火のかけらと、氷の砦を越える勇気を貸して。', en: 'An undelivered letter sleeps beneath the lake. Lend me two lantern fragments and the courage to face the frozen fortress.' }, ending: { ja: '氷の下から手紙が浮かぶ。「帰る場所は、いつもここに」。猫たちは顔を見合わせ、雷の向こうへ歩き出した。', en: 'A letter rises through melting ice: “There is always a home for you.” The companions smile, then head toward the thunder.' }, grass: '#9eb7b4', tree: '#688c91', water: '#86b4c6' },
  { title: { ja: '雷鳴と小さな勇気', en: 'Thunder and a little courage' }, keeper: { ja: '空渡りのリン', en: 'Rin the skyfarer' }, story: { ja: '雷が怖くても、歩くのはやめなくていい。かけらを集めて灯火をつなごう。最後の城へ続く道が見えるよ。', en: 'You can be afraid of thunder and still take the next step. Find the fragments and relight the path to the final citadel.' }, ending: { ja: '雷鳴の合間に、仲間の足音が聞こえた。最後の城が雲の向こうに姿を現す。', en: 'Between thunderclaps, you hear your companions’ footsteps. The final citadel appears beyond the clouds.' }, grass: '#807f9e', tree: '#555b82', water: '#747db3' },
  { title: { ja: '願いの帰る場所', en: 'Where wishes come home' }, keeper: { ja: '星見のノノ', en: 'Nono the stargazer' }, story: { ja: '灯火は強い誰か一人のものじゃない。ここまで歩いたみんなの願いだよ。最後のかけらを集めて、この空に朝を迎えよう。', en: 'Starlight belongs to every companion who made this journey. Find the final fragments and bring dawn back to our sky.' }, ending: { ja: '六つの灯火が、星座のようにつながった。猫たちは知っている。旅の宝物は、一緒に歩いてきた仲間たちだ。第一章、完。', en: 'Six lanterns join into a constellation. The companions know their greatest treasure is the journey they shared. Chapter One — complete.' }, grass: '#767e99', tree: '#4b567b', water: '#727fa5' },
];

export const newAdventure = (): AdventureSave => ({ version: 1, region: 0, position: { ...TRAIL_START }, opened: [], met: [], restored: [] });
export const adventureOf = (save: Save): AdventureSave => save.adventure ?? newAdventure();
export const unlockedRegion = (save: Save, region: number) => Number.isInteger(region) && region >= 0 && region < STAGES.length && (region === 0 || save.cleared.includes(region - 1));
export const fragmentCount = (adventure: AdventureSave, region = adventure.region) => ['west', 'east'].filter((id) => adventure.opened.includes(`${region}:${id}`)).length;
export const near = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;

export function terrain(x: number, y: number): 'water' | 'tree' | 'rock' | 'path' | 'grass' | 'bridge' {
  if ((x === 11 || x === 12) && y !== 8 && y !== 9) return 'water';
  if ((x === 11 || x === 12) && (y === 8 || y === 9)) return 'bridge';
  if ((x >= 2 && x <= 6 && y >= 2 && y <= 4) || (x >= 15 && x <= 18 && y >= 12 && y <= 14) || (x >= 19 && x <= 22 && y >= 2 && y <= 4)) return 'tree';
  if ((x === 8 && y === 4) || (x === 15 && y === 10) || (x === 20 && y === 12)) return 'rock';
  if ((y >= 8 && y <= 9 && x >= 3 && x <= 21) || (x >= 3 && x <= 4 && y >= 9 && y <= 12) || (x >= 15 && x <= 16 && y >= 5 && y <= 8) || (x === 5 && y >= 5 && y <= 8) || (y === 10 && x >= 16 && x <= 19) || (x === 21 && y >= 6 && y <= 8)) return 'path';
  return 'grass';
}
export function walkable(point: Point): boolean {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 1 || point.x >= MAP_WIDTH - 1 || point.y < 1 || point.y >= MAP_HEIGHT - 1) return false;
  if (PLACES.some((place) => place.x === point.x && place.y === point.y)) return false;
  return !['water', 'tree', 'rock'].includes(terrain(point.x, point.y));
}
export function movePoint(point: Point, direction: Direction): Point {
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
  if (!delta) return point;
  const next = { x: point.x + delta[0], y: point.y + delta[1] };
  return walkable(next) ? next : point;
}
/** Tap-to-walk takes a real path; it never teleports through a river or tree. */
export function pathTo(start: Point, destination: Point): Point[] {
  const targets = walkable(destination) ? [destination] : PLACES.some((p) => p.x === destination.x && p.y === destination.y) ? neighbors(destination) : [];
  if (!targets.length) return [];
  const queue: { point: Point; path: Point[] }[] = [{ point: start, path: [] }];
  const seen = new Set([`${start.x},${start.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const { point, path } = queue[i];
    if (targets.some((target) => target.x === point.x && target.y === point.y)) return path;
    for (const next of neighbors(point)) {
      const key = `${next.x},${next.y}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ point: next, path: [...path, next] }); }
    }
  }
  return [];
}
export function neighbors(point: Point) { return (['up', 'down', 'left', 'right'] as Direction[]).map((d) => moveUnblocked(point, d)).filter(walkable); }
function moveUnblocked(point: Point, direction: Direction) { const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction]; return { x: point.x + d[0], y: point.y + d[1] }; }

export function parseAdventure(value: unknown, cleared: number[]): AdventureSave | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const a = value as AdventureSave;
  const ids = (items: unknown): items is number[] => Array.isArray(items) && items.length <= STAGES.length && new Set(items).size === items.length && items.every((n) => Number.isInteger(n) && n >= 0 && n < STAGES.length);
  if (a.version !== 1 || !unlockedRegion({ cleared } as Save, a.region) || !a.position || !walkable(a.position)) return null;
  if (!Array.isArray(a.opened) || a.opened.length > 12 || new Set(a.opened).size !== a.opened.length || !a.opened.every((id) => typeof id === 'string' && /^[0-5]:(west|east)$/.test(id))) return null;
  if (!ids(a.met) || !ids(a.restored) || (a.restored.includes(5) && a.restored.length !== 6) || a.restored.some((n) => !cleared.includes(n) || !a.met.includes(n) || fragmentCount(a, n) !== 2)) return null;
  return { version: 1, region: a.region, position: { x: a.position.x, y: a.position.y }, opened: [...a.opened], met: [...a.met], restored: [...a.restored] };
}

export function visitRegion(save: Save, region: number): Save {
  if (!unlockedRegion(save, region)) return save;
  const adventure = adventureOf(save);
  if (region === adventure.region && save.adventure) return save;
  return { ...save, version: save.version===1?2:save.version, adventure: { ...adventure, region, position: { ...TRAIL_START } } };
}
export function checkpoint(save: Save, position: Point): Save {
  if (!walkable(position)) return save;
  const adventure = adventureOf(save);
  if (save.version !== 1 && save.adventure && adventure.position.x === position.x && adventure.position.y === position.y) return save;
  return { ...save, version: save.version===1?2:save.version, adventure: { ...adventure, position: { ...position } } };
}
export function interact(save: Save, position: Point, place: Place): Save {
  const location = PLACES.find((p) => p.id === place);
  if (!location || !near(position, location)) return save;
  const adventure = adventureOf(save);
  const region = adventure.region;
  const next = checkpoint(save, position);
  if (place === 'guide' && !adventure.met.includes(region)) return { ...next, adventure: { ...adventure, position: { ...position }, met: [...adventure.met, region] } };
  if (place === 'west' || place === 'east') {
    const id = `${region}:${place}`;
    if (adventure.opened.includes(id)) return next;
    return { ...next, gems: save.gems + 100, coins: save.coins + 120, adventure: { ...adventure, position: { ...position }, opened: [...adventure.opened, id] } };
  }
  if (place === 'beacon' && !adventure.restored.includes(region) && adventure.met.includes(region) && fragmentCount(adventure) === 2 && save.cleared.includes(region) && (region !== 5 || adventure.restored.length === 5)) {
    return { ...next, gems: save.gems + 150, coins: save.coins + 200, adventure: { ...adventure, position: { ...position }, restored: [...adventure.restored, region] } };
  }
  return next;
}

export function objective(save: Save): Words {
  const a = adventureOf(save);
  if (a.restored.includes(a.region)) return a.region === 5 ? { ja: '第一章クリア！ ほかの島も探索しよう', en: 'Chapter complete! Revisit the islands' } : { ja: '灯火が戻った。次の島へ旅立とう', en: 'Starlight restored. Set off for the next island' };
  if (!a.met.includes(a.region)) return { ja: '灯守に話しかけよう', en: 'Speak to the lightkeeper' };
  if (fragmentCount(a) < 2) return { ja: `宝箱から灯火のかけらを探そう（${fragmentCount(a)}/2）`, en: `Find lantern fragments in chests (${fragmentCount(a)}/2)` };
  if (!save.cleared.includes(a.region)) return { ja: '影の砦を攻略しよう', en: 'Reclaim the shadow fortress' };
  if (a.region === 5 && a.restored.length < 5) return { ja: `以前の島の灯火も戻そう（${a.restored.length}/6）`, en: `Restore the earlier lanterns too (${a.restored.length}/6)` };
  return { ja: '星の灯台にかけらを届けよう', en: 'Bring both fragments to the star lantern' };
}
