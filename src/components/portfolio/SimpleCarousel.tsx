'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './simple-carousel.scss';

interface SimpleCarouselProps {
  images: string[];
  thumbImage: string;
}

export default function SimpleCarousel({ images, thumbImage }: SimpleCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const allImages = [thumbImage, ...(images || [])];

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="simple-carousel">
      <div className="carousel-content">
        <button
          className="carousel-arrow carousel-arrow-left"
          onClick={goToPrevious}
          aria-label="Previous image"
        >
          <ChevronLeft />
        </button>

        <div className="carousel-image">
          <img
            src={allImages[currentIndex]}
            alt={`Slide ${currentIndex + 1}`}
            className="img-fluid"
          />
        </div>

        <button
          className="carousel-arrow carousel-arrow-right"
          onClick={goToNext}
          aria-label="Next image"
        >
          <ChevronRight />
        </button>
      </div>

      <div className="carousel-dots">
        {allImages.map((_, index) => (
          <button
            key={index}
            className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
