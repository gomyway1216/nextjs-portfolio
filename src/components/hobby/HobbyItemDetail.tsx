'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { HobbyItem, HobbyCategory, CustomFieldType, CustomField } from '@/types/hobby';
import { useResolvedRelation, useHobbyCategories } from '@/hooks/useHobbies';
import RelatedItemsList from './RelatedItemsList';
import {
  Star,
  MapPin,
  Calendar,
  ExternalLink,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
  Link2,
} from 'lucide-react';

interface HobbyItemDetailProps {
  item: HobbyItem;
  hobby: HobbyCategory;
  language?: 'en' | 'ja';
}

// Component to render a relation field as a link
function RelationFieldValue({
  itemId,
  hobbySlug,
  label
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

export default function HobbyItemDetail({ item, hobby, language = 'ja' }: HobbyItemDetailProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const { categories } = useHobbyCategories();

  const allImages = item.thumbImage
    ? [item.thumbImage, ...item.images.filter((img) => img !== item.thumbImage)]
    : item.images;

  // Find category by slug for relation fields
  const getCategoryBySlug = (slug: string) => categories.find(c => c.slug === slug);

  const renderCustomField = (fieldName: string, value: unknown) => {
    const fieldDef = hobby.fields.find((f) => f.name === fieldName);
    if (!fieldDef || value === undefined || value === null || value === '') return null;

    switch (fieldDef.type) {
      case 'relation' as CustomFieldType:
        const relationConfig = fieldDef.relationConfig;
        if (!relationConfig || !value) return null;
        const relatedCategory = getCategoryBySlug(relationConfig.hobbySlug);
        if (!relatedCategory) return null;

        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
            <RelationFieldValue
              itemId={String(value)}
              hobbySlug={relationConfig.hobbySlug}
              label={fieldDef.label}
            />
          </div>
        );
      case 'rating' as CustomFieldType:
        const rating = Number(value) || 0;
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
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
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
            <div className="hobby-detail__field-value">
              <Calendar size={16} />
              <span>{date.toLocaleDateString('ja-JP')}</span>
            </div>
          </div>
        );

      case 'location' as CustomFieldType:
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
            <div className="hobby-detail__field-value">
              <MapPin size={16} />
              <span>{String(value)}</span>
            </div>
          </div>
        );

      case 'url' as CustomFieldType:
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
            <a
              href={String(value)}
              target="_blank"
              rel="noopener noreferrer"
              className="hobby-detail__field-link"
            >
              <ExternalLink size={16} />
              <span>Visit Website</span>
            </a>
          </div>
        );

      case 'textarea' as CustomFieldType:
        return (
          <div className="hobby-detail__field hobby-detail__field--full">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
            <p className="hobby-detail__field-text">{String(value)}</p>
          </div>
        );

      case 'select' as CustomFieldType:
      case 'multiselect' as CustomFieldType:
        const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
            <span className="hobby-detail__field-badge">{displayValue}</span>
          </div>
        );

      case 'number' as CustomFieldType:
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
            <span className="hobby-detail__field-value">{Number(value).toLocaleString()}</span>
          </div>
        );

      default:
        return (
          <div className="hobby-detail__field">
            <span className="hobby-detail__field-label">{fieldDef.label}</span>
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

  return (
    <div className="hobby-detail">
      {/* Back Link */}
      <Link href={`/hobbies/${hobby.slug}`} className="hobby-detail__back">
        <ArrowLeft size={20} />
        <span>Back to {hobby.name}</span>
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
                alt={item.title}
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
                      alt={`${item.title} ${index + 1}`}
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
          <h1 className="hobby-detail__title">{item.title}</h1>

          {item.description && (
            <p className="hobby-detail__description">{item.description}</p>
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
