import type { Save } from './engine';
import type { Words } from './data';
import { adventureOf } from './adventure';

interface Badge { id: string; name: Words; detail: Words; goal: number; progress: (save: Save) => number }
const highestLevel = (s: Save) => Math.max(0,...Object.values(s.owned).map(c => c.level));
export const BADGES: Badge[] = [
  { id:'first-wish',name:{ja:'はじめての願い',en:'A first wish'},detail:{ja:'1回召喚する',en:'Make one wish'},goal:1,progress:s=>s.pulls },
  { id:'ten-wishes',name:{ja:'星に届けた十の願い',en:'Ten wishes to the stars'},detail:{ja:'10回召喚する',en:'Make ten wishes'},goal:10,progress:s=>s.pulls },
  { id:'eight-friends',name:{ja:'にぎやかな旅',en:'A lively caravan'},detail:{ja:'8体の仲間を集める',en:'Collect eight companions'},goal:8,progress:s=>Object.keys(s.owned).length },
  { id:'sixteen-friends',name:{ja:'小さな星座',en:'A little constellation'},detail:{ja:'16体の仲間を集める',en:'Collect sixteen companions'},goal:16,progress:s=>Object.keys(s.owned).length },
  { id:'first-training',name:{ja:'成長の一歩',en:'A step of growth'},detail:{ja:'仲間をLv.2に育てる',en:'Train a companion to Lv.2'},goal:2,progress:highestLevel },
  { id:'level-ten',name:{ja:'頼れる相棒',en:'A trusted companion'},detail:{ja:'仲間をLv.10に育てる',en:'Train a companion to Lv.10'},goal:10,progress:highestLevel },
  { id:'level-twenty',name:{ja:'旅の達人',en:'An accomplished traveler'},detail:{ja:'仲間をLv.20に育てる',en:'Train a companion to Lv.20'},goal:20,progress:highestLevel },
  { id:'first-ascension',name:{ja:'もう一つの星',en:'Another star'},detail:{ja:'仲間を初めて★昇格する',en:'Ascend a companion'},goal:1,progress:s=>Object.values(s.owned).some(c=>c.stars!==undefined)?1:0 },
  { id:'first-victory',name:{ja:'みんなの初勝利',en:'Our first victory'},detail:{ja:'戦闘に1回勝つ',en:'Win a battle'},goal:1,progress:s=>s.wins },
  { id:'first-lantern',name:{ja:'帰ってきた灯火',en:'Starlight returns'},detail:{ja:'灯火を1つ復元する',en:'Restore one lantern'},goal:1,progress:s=>adventureOf(s).restored.length },
  { id:'six-lanterns',name:{ja:'六つの願い',en:'Six shared wishes'},detail:{ja:'六つの灯火を復元し第一章を終える',en:'Restore all six lanterns and finish Chapter One'},goal:6,progress:s=>adventureOf(s).restored.length },
  { id:'star-bond',name:{ja:'結ばれた星の絆',en:'Our Star bond'},detail:{ja:'戦闘で星の絆を使う',en:'Use Star bond in battle'},goal:1,progress:s=>s.achievements?.includes('star-bond')?1:0 },
  { id:'flawless',name:{ja:'影をかわす足音',en:'Dancing past shadows'},detail:{ja:'敵の予告攻撃を一度も受けずに勝つ',en:'Win without being hit by a marked attack'},goal:1,progress:s=>s.achievements?.includes('flawless')?1:0 },
  { id:'resumed',name:{ja:'旅のつづき',en:'The journey continues'},detail:{ja:'中断した戦闘を再開する',en:'Resume a saved battle'},goal:1,progress:s=>s.achievements?.includes('resumed')?1:0 },
];

/** Legacy progress earns the same badges, without rewriting a journal during account loading. */
export function earnedBadges(save: Save): string[] {
  return [...new Set([...(save.achievements ?? []), ...BADGES.filter(b=>b.progress(save)>=b.goal).map(b=>b.id)])];
}
export function featureSave(save: Save, extra: string[] = []): Save {
  const achievements = [...new Set([...earnedBadges(save), ...extra])];
  if (save.version === 3 && achievements.length === save.achievements?.length && achievements.every((id,i)=>id===save.achievements?.[i])) return save;
  return { ...save, version:3, adventure:adventureOf(save), achievements, encounter:save.encounter ?? null };
}
