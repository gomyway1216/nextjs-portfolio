'use client';

import { GAME_TITLES, type GameType } from '@/lib/ogiri/types';
import { Character } from './Character';
import { MysteryCharacter } from './MysteryCharacter';
import styles from './Ogiri.module.css';

const choices = [
  { type: 'ogiri', avatar: '🐱', description: '二人のボケに一票。' },
  { type: 'majority', avatar: '🐸', description: 'みんな、そっち派？' },
  { type: 'identity', avatar: '', description: 'これ書いたの、お前か。' },
  { type: 'drawing', avatar: 'alien', description: 'その絵、そう伝わる？' },
] satisfies { type: GameType; avatar: string; description: string }[];

export function NextGameChoices({ currentGame, disabled, choose }: {
  currentGame: GameType;
  disabled: boolean;
  choose: (type: GameType) => void;
}) {
  return <section className={styles.nextGameChoices} aria-label="次のゲーム">
    <h2>次、なにやる？</h2>
    <p>メンバー・キャラ・通算はそのまま。選ぶと次のゲームの受付へ戻ります。</p>
    <div className={styles.modeTeasers}>
      {choices.map(({ type, avatar, description }) => <button key={type} type="button"
        aria-label={`${GAME_TITLES[type]}で次のゲームへ`} disabled={disabled} onClick={() => choose(type)}>
        {type === 'identity' ? <MysteryCharacter size="medium" /> : <Character avatar={avatar} size="medium" />}
        <b>{GAME_TITLES[type]}</b>
        <span>{description}</span>
        <small>{type === currentGame ? 'もう一回あそぶ →' : 'これにする →'}</small>
      </button>)}
    </div>
  </section>;
}
