'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { HobbyItem, HobbyCategory, CustomFieldType } from '@/types/hobby';
import { Star, MapPin, Calendar, ExternalLink } from 'lucide-react';

export type Language = 'en' | 'ja';

interface HobbyItemCardProps {
  item: HobbyItem;
  hobby: HobbyCategory;
  showLink?: boolean;
  language?: Language;
}

export default function HobbyItemCard({ item, hobby, showLink = true, language = 'en' }: HobbyItemCardProps) {
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

      case 'number' as CustomFieldType:
        // Special handling for score field (0-10)
        if (fieldName === 'score') {
          const scoreValue = Number(value);
          const starRating = Math.round(scoreValue / 2); // Convert 0-10 to 0-5 stars
          return (
            <div className="hobby-item-card__field hobby-item-card__field--score">
              <div className="hobby-item-card__score-badge">
                <span className="hobby-item-card__score-value">{scoreValue.toFixed(1)}</span>
              </div>
              <div className="hobby-item-card__score-stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={12}
                    className={star <= starRating ? 'filled' : ''}
                  />
                ))}
              </div>
            </div>
          );
        }
        return (
          <div className="hobby-item-card__field">
            <span className="hobby-item-card__field-label">{fieldDef.label}:</span>
            <span>{Number(value).toLocaleString()}</span>
          </div>
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

  // Get custom fields to display on card (excluding description fields)
  // Prioritize score field if it exists
  const scoreField = hobby.fields.find(
    (f) => f.name === 'score' && item.customFields[f.name] !== undefined
  );
  const otherFields = hobby.fields
    .filter((f) =>
      item.customFields[f.name] !== undefined &&
      f.name !== 'descriptionJa' &&
      f.name !== 'descriptionEn' &&
      f.name !== 'animeDescription' &&
      f.name !== 'score'
    )
    .slice(0, scoreField ? 2 : 3);
  const displayFields = scoreField ? [scoreField, ...otherFields] : otherFields;

  // Get the appropriate description based on language
  const getDescription = () => {
    const descriptionEn = item.customFields?.descriptionEn as string | undefined;
    const descriptionJa = item.customFields?.descriptionJa as string | undefined;

    if (language === 'en') {
      return descriptionEn || descriptionJa || item.description;
    } else {
      return descriptionJa || descriptionEn || item.description;
    }
  };

  // Get the appropriate title/name based on language
  const getDisplayTitle = () => {
    const nameEnglish = item.customFields?.nameEnglish as string | undefined;
    const nameKanji = item.customFields?.nameKanji as string | undefined;

    if (language === 'en' && nameEnglish) {
      return nameEnglish;
    }
    return item.title;
  };

  // Get secondary name (the other language)
  const getSecondaryName = () => {
    const nameEnglish = item.customFields?.nameEnglish as string | undefined;
    const nameKanji = item.customFields?.nameKanji as string | undefined;
    const nameKana = item.customFields?.nameKana as string | undefined;

    if (language === 'en') {
      // Show Japanese name as secondary
      if (nameKanji) return nameKanji;
      return item.title !== nameEnglish ? item.title : null;
    } else {
      // Show English name as secondary
      return nameEnglish || null;
    }
  };

  const displayTitle = getDisplayTitle();
  const secondaryName = getSecondaryName();
  const description = getDescription();

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
        <h4 className="hobby-item-card__title">{displayTitle}</h4>
        {secondaryName && (
          <p className="hobby-item-card__secondary-name">{secondaryName}</p>
        )}
        {description && (
          <p className="hobby-item-card__description">{description}</p>
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
