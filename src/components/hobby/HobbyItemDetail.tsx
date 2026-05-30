'use client';

import { useHobbyCategories,useResolvedRelation } from '@/hooks/useHobbies';
import type { CustomFieldType,HobbyCategory,HobbyItem } from '@/types/hobby';
import {
ArrowLeft,
Calendar,
ChevronLeft,
ChevronRight,
ExternalLink,
Link2,
MapPin,
Star,
X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import RelatedItemsList from './RelatedItemsList';

interface HobbyItemDetailProps {
  item: HobbyItem;
  hobby: HobbyCategory;
  language?: 'en' | 'ja';
}

// Component to render a relation field as a link
function RelationFieldValue({
  itemId,
  hobbySlug,
  label: _label
}: {
  itemId: string;
  hobbySlug: string;
  label: string;
}) {
  const { item, loading } = useResolvedRelation(itemId);

  if (loading) {
    return <span className="hobby-detail__field-value">Loading...</span>;
  }

  if (!item) {
    return null;
  }

  const displayName = (item.customFields.nameKanji as string) ||
                      (item.customFields.nameEnglish as string) ||
                      item.title;

  return (
    <Link
      href={`/hobbies/${hobbySlug}/${itemId}`}
      className="hobby-detail__relation-link"
    >
      {item.thumbImage && (
        <Image
          src={item.thumbImage}
          alt={displayName}
          width={32}
          height={32}
          className="hobby-detail__relation-image"
        />
      )}
      <span>{displayName}</span>
      <Link2 size={14} />
    </Link>
  );
}

// Field label translations
const fieldLabelTranslations: Record<string, { ja: string; en: string }> = {
  nameKanji: { ja: '名前（漢字）', en: 'Name (Kanji)' },
  nameKana: { ja: '名前（かな）', en: 'Name (Kana)' },
  nameEnglish: { ja: 'English Name', en: 'English Name' },
  score: { ja: 'スコア', en: 'Score' },
  animeDescription: { ja: '説明', en: 'Description' },
  descriptionJa: { ja: '説明', en: 'Description' },
  descriptionEn: { ja: '説明（英語）', en: 'Description' },
  genre: { ja: 'ジャンル', en: 'Genre' },
  broadcaster: { ja: '放送局', en: 'Broadcaster' },
  yearStart: { ja: '放送開始年', en: 'Start Year' },
  yearEnd: { ja: '放送終了年', en: 'End Year' },
  tvDescription: { ja: '説明', en: 'Description' },
  animeId: { ja: 'アニメ', en: 'Anime' },
  voiceActorId: { ja: '声優', en: 'Voice Actor' },
  rating: { ja: '評価', en: 'Rating' },
  hasEaten: { ja: '食べたことある', en: 'Have Eaten' },
  taste: { ja: '味の感想', en: 'Taste Review' },
  favoritePreparation: { ja: 'おすすめの食べ方', en: 'Favorite Preparation' },
  season: { ja: '旬の季節', en: 'Season' },
};

// Fields to exclude from detail view (shown in title/subtitle or handled separately)
const excludedDetailFields = [
  'nameKanji', 'nameKana', 'nameEnglish',
  'animeDescription', 'descriptionEn', 'tvDescription', 'descriptionJa',
];

export default function HobbyItemDetail({ item, hobby, language = 'ja' }: HobbyItemDetailProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const { categories } = useHobbyCategories();

  const allImages = item.thumbImage
    ? [item.thumbImage, ...item.images.filter((img) => img !== item.thumbImage)]
    : item.images;

  // Find category by slug for relation fields
  const getCategoryBySlug = (slug: string) => categories.find(c => c.slug === slug);

  // Get localized field label
  const getFieldLabel = (fieldName: string, defaultLabel: string): string => {
    const translation = fieldLabelTranslations[fieldName];
    if (translation) {
      return language === 'en' ? translation.en : translation.ja;
    }
    return defaultLabel;
  };

  // Get display title based on language
  const getDisplayTitle = () => {
    const nameEnglish = item.customFields?.nameEnglish as string | undefined;
    const nameKanji = item.customFields?.nameKanji as string | undefined;

    if (language === 'en' && nameEnglish) {
      return nameEnglish;
    }
    return nameKanji || item.title;
  };

  // Get secondary name
  const getSecondaryName = () => {
    const nameEnglish = item.customFields?.nameEnglish as string | undefined;
    const nameKanji = item.customFields?.nameKanji as string | undefined;

    if (language === 'en') {
      return nameKanji || null;
    }
    return nameEnglish || null;
  };

  // Get description based on language
  const getDescription = () => {
    const descriptionEn = item.customFields?.descriptionEn as string | undefined;
    const descriptionJa = (item.customFields?.animeDescription ||
                          item.customFields?.tvDescription ||
                          item.customFields?.descriptionJa) as string | undefined;

    // Filter out placeholder text
    const isPlaceholder = (text?: string) =>
      !text || text === 'preparing…' || text === 'preparing...';

    if (language === 'en') {
      if (!isPlaceholder(descriptionEn)) return descriptionEn;
      if (!isPlaceholder(descriptionJa)) return descriptionJa;
    } else {
      if (!isPlaceholder(descriptionJa)) return descriptionJa;
      if (!isPlaceholder(descriptionEn)) return descriptionEn;
    }

    return item.description || null;
  };

  const renderCustomField = (fieldName: string, value: unknown) => {
    const fieldDef = hobby.fields.find((f) => f.name === fieldName);
    if (!fieldDef || value === undefined || value === null || value === '') return null;

    // Skip excluded fields
    if (excludedDetailFields.includes(fieldName)) return null;

    const label = getFieldLabel(fieldName, fieldDef.label);

    switch (fieldDef.type) {
      case 'relation' as CustomFieldType:
        const relationConfig = fieldDef.relationConfig;
        if (!relationConfig || !value) return null;
        const relatedCategory = getCategoryBySlug(relationConfig.hobbySlug);
        if (!relatedCategory) return null;

        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <RelationFieldValue
              itemId={String(value)}
              hobbySlug={relationConfig.hobbySlug}
              label={label}
            />
          </div>
        );
      case 'rating' as CustomFieldType:
        const rating = Number(value) || 0;
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <div className="hobby-detail__rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={20}
                  className={star <= rating ? 'filled' : ''}
                />
              ))}
            </div>
          </div>
        );

      case 'date' as CustomFieldType:
        const date = new Date(value as string);
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <div className="hobby-detail__field-value">
              <Calendar size={16} />
              <span>{date.toLocaleDateString(language === 'en' ? 'en-US' : 'ja-JP')}</span>
            </div>
          </div>
        );

      case 'location' as CustomFieldType:
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <div className="hobby-detail__field-value">
              <MapPin size={16} />
              <span>{String(value)}</span>
            </div>
          </div>
        );

      case 'url' as CustomFieldType:
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <a
              href={String(value)}
              target="_blank"
              rel="noopener noreferrer"
              className="hobby-detail__field-link"
            >
              <ExternalLink size={16} />
              <span>{language === 'en' ? 'Visit Website' : 'ウェブサイト'}</span>
            </a>
          </div>
        );

      case 'textarea' as CustomFieldType:
        return (
          <div className="hobby-detail__field hobby-detail__field--full">
            <span className="hobby-detail__field-label">{label}</span>
            <p className="hobby-detail__field-text">{String(value)}</p>
          </div>
        );

      case 'select' as CustomFieldType:
      case 'multiselect' as CustomFieldType:
        const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <span className="hobby-detail__field-badge">{displayValue}</span>
          </div>
        );

      case 'number' as CustomFieldType:
        // Special handling for score field
        if (fieldName === 'score') {
          const scoreValue = Number(value);
          const starRating = Math.round(scoreValue / 2);
          return (
            <div className="hobby-detail__field">
              <span className="hobby-detail__field-label">{label}</span>
              <div className="hobby-detail__score">
                <span className="hobby-detail__score-value">{scoreValue.toFixed(1)}</span>
                <div className="hobby-detail__score-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={16}
                      className={star <= starRating ? 'filled' : ''}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        }
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <span className="hobby-detail__field-value">{Number(value).toLocaleString()}</span>
          </div>
        );

      default:
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{label}</span>
            <span className="hobby-detail__field-value">{String(value)}</span>
          </div>
        );
    }
  };

  const handlePrevImage = () => {
    setSelectedImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setSelectedImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const displayTitle = getDisplayTitle();
  const secondaryName = getSecondaryName();
  const description = getDescription();

  return (
    <div className="hobby-detail">
      {/* Back Link */}
      <Link href={`/hobbies/${hobby.slug}`} className="hobby-detail__back">
        <ArrowLeft size={20} />
        <span>{language === 'en' ? `Back to ${hobby.name}` : `${hobby.name}に戻る`}</span>
      </Link>

      <div className="hobby-detail__container">
        {/* Image Gallery */}
        {allImages.length > 0 && (
          <div className="hobby-detail__gallery">
            <div
              className="hobby-detail__main-image"
              onClick={() => setShowLightbox(true)}
            >
              <Image
                src={allImages[selectedImageIndex]}
                alt={displayTitle}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                className="hobby-detail__image"
              />
            </div>
            {allImages.length > 1 && (
              <div className="hobby-detail__thumbnails">
                {allImages.map((img, index) => (
                  <button
                    key={img}
                    className={`hobby-detail__thumbnail ${
                      index === selectedImageIndex ? 'active' : ''
                    }`}
                    onClick={() => setSelectedImageIndex(index)}
                  >
                    <Image
                      src={img}
                      alt={`${displayTitle} ${index + 1}`}
                      fill
                      sizes="80px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="hobby-detail__info">
          <h1 className="hobby-detail__title">{displayTitle}</h1>
          {secondaryName && (
            <p className="hobby-detail__secondary-name">{secondaryName}</p>
          )}

          {description && (
            <div className="hobby-detail__description-section">
              <span className="hobby-detail__field-label">
                {language === 'en' ? 'Description' : '説明'}
              </span>
              <p className="hobby-detail__description">{description}</p>
            </div>
          )}

          <div className="hobby-detail__fields">
            {hobby.fields.map((field) => (
              <div key={field.id}>
                {renderCustomField(field.name, item.customFields[field.name])}
              </div>
            ))}
          </div>

          {item.tags.length > 0 && (
            <div className="hobby-detail__tags">
              {item.tags.map((tag) => (
                <span key={tag} className="hobby-detail__tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Related Items - Show characters for anime/voice-actors */}
      {hobby.slug === 'anime' && (
        <RelatedItemsList
          hobbyId={categories.find(c => c.slug === 'anime-characters')?.id || ''}
          hobbySlug="anime-characters"
          fieldName="animeId"
          targetItemId={item.id}
          title={language === 'ja' ? 'キャラクター' : 'Characters'}
          language={language}
        />
      )}

      {hobby.slug === 'voice-actors' && (
        <RelatedItemsList
          hobbyId={categories.find(c => c.slug === 'anime-characters')?.id || ''}
          hobbySlug="anime-characters"
          fieldName="voiceActorId"
          targetItemId={item.id}
          title={language === 'ja' ? '演じたキャラクター' : 'Characters Voiced'}
          language={language}
        />
      )}

      {/* Lightbox */}
      {showLightbox && (
        <div className="hobby-lightbox" onClick={() => setShowLightbox(false)}>
          <button
            className="hobby-lightbox__close"
            onClick={() => setShowLightbox(false)}
          >
            <X size={24} />
          </button>
          <button
            className="hobby-lightbox__prev"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevImage();
            }}
          >
            <ChevronLeft size={32} />
          </button>
          <div className="hobby-lightbox__image" onClick={(e) => e.stopPropagation()}>
            <Image
              src={allImages[selectedImageIndex]}
              alt={item.title}
              fill
              sizes="100vw"
              className="hobby-lightbox__img"
            />
          </div>
          <button
            className="hobby-lightbox__next"
            onClick={(e) => {
              e.stopPropagation();
              handleNextImage();
            }}
          >
            <ChevronRight size={32} />
          </button>
          <div className="hobby-lightbox__counter">
            {selectedImageIndex + 1} / {allImages.length}
          </div>
        </div>
      )}
    </div>
  );
}
