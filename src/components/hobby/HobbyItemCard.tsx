'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { HobbyItem, HobbyCategory, CustomFieldType } from '@/types/hobby';
import { Star, MapPin, Calendar, ExternalLink } from 'lucide-react';

interface HobbyItemCardProps {
  item: HobbyItem;
  hobby: HobbyCategory;
  showLink?: boolean;
}

export default function HobbyItemCard({ item, hobby, showLink = true }: HobbyItemCardProps) {
  const renderCustomField = (fieldName: string, value: unknown) => {
    const fieldDef = hobby.fields.find((f) => f.name === fieldName);
    if (!fieldDef || value === undefined || value === null || value === '') return null;

    switch (fieldDef.type) {
      case 'rating' as CustomFieldType:
        const rating = Number(value) || 0;
        return (
          <div className="hobby-item-card__field hobby-item-card__field--rating">
            <span className="hobby-item-card__field-label">{fieldDef.label}</span>
            <div className="hobby-item-card__rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={14}
                  className={star <= rating ? 'filled' : ''}
                />
              ))}
            </div>
          </div>
        );

      case 'date' as CustomFieldType:
        const date = new Date(value as string);
        return (
          <div className="hobby-item-card__field">
            <Calendar size={14} />
            <span>{date.toLocaleDateString('ja-JP')}</span>
          </div>
        );

      case 'location' as CustomFieldType:
        return (
          <div className="hobby-item-card__field">
            <MapPin size={14} />
            <span>{String(value)}</span>
          </div>
        );

      case 'url' as CustomFieldType:
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="hobby-item-card__field hobby-item-card__field--link"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={14} />
            <span>{fieldDef.label}</span>
          </a>
        );

      default:
        return (
          <div className="hobby-item-card__field">
            <span className="hobby-item-card__field-label">{fieldDef.label}:</span>
            <span>{String(value)}</span>
          </div>
        );
    }
  };

  // Get first few custom fields to display on card
  const displayFields = hobby.fields
    .slice(0, 3)
    .filter((f) => item.customFields[f.name] !== undefined);

  const content = (
    <div className="hobby-item-card">
      <div className="hobby-item-card__image-container">
        {item.thumbImage ? (
          <Image
            src={item.thumbImage}
            alt={item.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="hobby-item-card__image"
          />
        ) : item.images[0] ? (
          <Image
            src={item.images[0]}
            alt={item.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="hobby-item-card__image"
          />
        ) : (
          <div className="hobby-item-card__placeholder">
            <span>{item.title.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="hobby-item-card__content">
        <h4 className="hobby-item-card__title">{item.title}</h4>
        {item.description && (
          <p className="hobby-item-card__description">{item.description}</p>
        )}
        <div className="hobby-item-card__fields">
          {displayFields.map((field) => (
            <div key={field.id}>
              {renderCustomField(field.name, item.customFields[field.name])}
            </div>
          ))}
        </div>
        {item.tags.length > 0 && (
          <div className="hobby-item-card__tags">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="hobby-item-card__tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (showLink) {
    return (
      <Link href={`/hobbies/${hobby.slug}/${item.id}`} className="hobby-item-card-link">
        {content}
      </Link>
    );
  }

  return content;
}
