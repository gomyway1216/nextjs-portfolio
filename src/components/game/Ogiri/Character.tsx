import Image from 'next/image';
import { characterFor } from '@/lib/ogiri/characters';
import styles from './Ogiri.module.css';

export function Character({
  avatar,
  size = 'small',
  crowned = false,
  decorative = false,
}: {
  avatar: string;
  size?: 'small' | 'medium' | 'large' | 'hero';
  crowned?: boolean;
  decorative?: boolean;
}) {
  if (!avatar) return null;
  const character = characterFor(avatar);
  return (
    <span
      className={`${styles.character} ${styles[`character_${size}`]} ${crowned ? styles.characterCrowned : ''}`}
    >
      <Image
        unoptimized
        src={`/img/games/ogiri/characters/${character.id}.webp`}
        width={256}
        height={256}
        alt={decorative ? '' : character.name}
        draggable={false}
      />
    </span>
  );
}
