'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { HobbyItem, HobbyCategory, CustomFieldType } from '@/types/hobby';
import {
  Star,
  MapPin,
  Calendar,
  ExternalLink,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface HobbyItemDetailProps {
  item: HobbyItem;
  hobby: HobbyCategory;
}

export default function HobbyItemDetail({ item, hobby }: HobbyItemDetailProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  const allImages = item.thumbImage
    ? [item.thumbImage, ...item.images.filter((img) => img !== item.thumbImage)]
    : item.images;

  const renderCustomField = (fieldName: string, value: unknown) => {
    const fieldDef = hobby.fields.find((f) => f.name === fieldName);
    if (!fieldDef || value === undefined || value === null || value === '') return null;

    switch (fieldDef.type) {
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
