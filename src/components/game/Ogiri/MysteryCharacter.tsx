import Image from 'next/image';
import styles from './Ogiri.module.css';

/** One shared mask keeps every author's identity hidden until the reveal. */
export function MysteryCharacter({ size = 'large' }: { size?: 'small' | 'medium' | 'large' | 'hero' }) {
  return (
    <span className={`${styles.character} ${styles[`character_${size}`]}`}>
      <Image unoptimized src="/img/games/ogiri/mystery.webp" width={384} height={384}
        alt="作者はまだ秘密" draggable={false} />
    </span>
  );
}
