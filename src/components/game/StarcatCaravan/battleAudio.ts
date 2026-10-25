import type { Ability } from './data';
import type { Reaction } from './elements';
import { createCueAudio } from './wishAudio';

export type BattleCue = 'impact' | 'frost' | 'thunder' | 'support';
export const BATTLE_AUDIO: Record<BattleCue, string> = { impact: '/audio/starcat-caravan/battle-impact-v2.mp3', frost: '/audio/starcat-caravan/battle-frost-v2.mp3', thunder: '/audio/starcat-caravan/battle-thunder-v2.mp3', support: '/audio/starcat-caravan/battle-support-v2.mp3' };
export const reactionCue = (id: Reaction): BattleCue => id === 'bloom' ? 'support' : ['freeze', 'blizzard', 'melt'].includes(id) ? 'frost' : ['overload', 'shock', 'storm', 'shatter'].includes(id) ? 'thunder' : 'impact';
export const abilityCue = (id: Ability): BattleCue => ['ward', 'mend'].includes(id) ? 'support' : id === 'frost' ? 'frost' : id === 'chain' ? 'thunder' : 'impact';

/** Resume Web Audio in the explicit gesture, including browsers that restrict autoplay. */
export function createBattleAudio(makeContext?: () => AudioContext, fetcher?: typeof fetch) {
  return createCueAudio<BattleCue>(BATTLE_AUDIO, makeContext, fetcher, { volume: .35 });
}
