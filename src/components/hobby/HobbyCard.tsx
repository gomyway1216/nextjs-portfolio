'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { HobbyCategory } from '@/types/hobby';
import {
  Fish,
  Mountain,
  Camera,
  Music,
  Gamepad2,
  Book,
  Palette,
  Dumbbell,
  Utensils,
  Plane,
  Star,
  type LucideIcon,
} from 'lucide-react';

interface HobbyCardProps {
  hobby: HobbyCategory;
  itemCount?: number;
}

const iconMap: Record<string, LucideIcon> = {
  fish: Fish,
  mountain: Mountain,
  camera: Camera,
  music: Music,
  gamepad: Gamepad2,
  book: Book,
  palette: Palette,
  dumbbell: Dumbbell,
  utensils: Utensils,
  plane: Plane,
  star: Star,
};

export default function HobbyCard({ hobby, itemCount }: HobbyCardProps) {
  const IconComponent = hobby.icon ? iconMap[hobby.icon] || Star : Star;

  return (
    <Link href={`/hobbies/${hobby.slug}`} className="hobby-card">
      <div className="hobby-card__image-container">
        {hobby.coverImage ? (
          <Image
            src={hobby.coverImage}
            alt={hobby.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="hobby-card__image"
          />
        ) : (
          <div className="hobby-card__placeholder">
            <IconComponent size={48} />
          </div>
        )}
        <div className="hobby-card__overlay" />
      </div>
      <div className="hobby-card__content">
        <div className="hobby-card__icon">
          <IconComponent size={24} />
        </div>
        <h3 className="hobby-card__title">{hobby.name}</h3>
        <p className="hobby-card__description">{hobby.description}</p>
        {itemCount !== undefined && (
          <span className="hobby-card__count">{itemCount} items</span>
        )}
      </div>
    </Link>
  );
}
